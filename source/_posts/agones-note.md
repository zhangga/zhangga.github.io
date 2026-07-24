---
title: Agones 经验记录
tags:
  - UE
id: agones-note
categories:
  - 笔记
date: 2026-07-24 15:12:15
---

# Agones 经验记录

> 记录使用 Agones 部署游戏专用服务器时踩到的两类问题及解决方案，方便后续排查。

---

## 经验一：Pod 启动后绑定 EIP 导致公网地址变化，GameServer 被判 Unhealthy 并 Shutdown

### 现象

Pod 启动后才绑定 EIP，公网地址随之变化。此时 Agones 判断 `GameServer.Status.Address` 与当前 Node 地址不一致，将 GameServer 置为 `Unhealthy`，随后回收（Shutdown）该 Pod。

### 根因

这个行为来自 Agones 的 **MigrationController**（`pkg/gameservers/migration.go`），不是 SDK 健康检查（health check）本身。

1. GameServer 变 `Ready` 时，Agones 从所在 Node 取地址写入 `Status.Address`。取地址优先级为：
   `ExternalDNS → ExternalIP → InternalDNS → InternalIP`（见 `pkg/gameservers/gameservers.go` 的 `address()` 函数）。
2. MigrationController 监听 Pod 的 add/update 事件，调用 `anyAddressMatch()`：只要 `gs.Status.Address` 匹配当前 Node 的**任意一个**地址就认为没迁移；一旦全部不匹配，判定为"地址漂移/节点迁移"。
3. 关键分支在 `syncGameServer()`：
   - GameServer **还没到 Ready**（`IsBeforeReady()` 为真）→ 只是**重新套用新地址**，不会 Shutdown；
   - GameServer **已经 Ready 之后**才发生地址变化 → 直接置为 `Unhealthy`，随后被回收。

因此本质是**竞态**：Pod 先调了 `SDK.Ready()`，之后 EIP 才绑定完成、Node 的 ExternalIP 变化，落到"Ready 之后地址变了"这条分支被判 Unhealthy。

> 重要：Agones **没有**提供"关闭 MigrationController"或"忽略地址不匹配"的官方配置开关。解决方向是控制地址稳定性和时序，而不是找 flag。

### 解决方案

#### 方案一（推荐）：让 EIP 在 `Ready()` 之前绑定完成

在游戏服进程里，**先确认 EIP 已绑定、Node 的 ExternalIP 稳定后，再调用 `SDK.Ready()`**。因为 `IsBeforeReady()` 阶段的地址变化 Agones 只会"重新套用地址"而不会 Shutdown。做法：

- 启动逻辑里轮询等待公网地址就绪（通过 cloud metadata，或调 SDK `GameServer()` 观察 `status.address`），确认后再 `Ready()`；
- 或把绑定 EIP 的动作放进 initContainer / 启动前钩子，保证顺序在 `Ready()` 之前完成。

#### 方案二：不让"会变的 EIP"成为 Agones 选中的主地址

- 不把动态 EIP 写进 Node 的 `ExternalIP`，改用**固定的负载均衡 / 固定 EIP**，通过云厂商注解（如腾讯 TKE 的 `networking.cloud.tencent.com/external-address` + Downward API 注入 Pod annotation）对外暴露地址，而让 Agones 用稳定的 Node 地址；
- 客户端连接地址由分配层 / 网关返回，不直接依赖 `GameServer.Status.Address`。

#### 方案三：绑定"每 Node 固定 EIP"

如果 EIP 是绑到 Node 而非 Pod，让每个 Node 复用一个**固定 EIP**（Node 生命周期内不变），Pod 调度到该 Node 时地址已稳定，mismatch 自然消失。

### 方案对比

| 方案 | 改动点 | 适用场景 | 侵入性 |
|---|---|---|---|
| 一、延迟 `Ready()` | 游戏服启动逻辑 | 每 Pod 动态绑 EIP | 低，最稳妥 |
| 二、固定 LB / 注解暴露 | 部署 YAML + 客户端寻址 | 已有云 LB / 固定 EIP 池 | 中 |
| 三、Node 固定 EIP | 云资源 / 节点池配置 | EIP 绑到 Node | 中 |

**结论**：最省事、最贴合 Agones 设计的是方案一——把"绑 EIP"移到 `SDK.Ready()` 之前，利用 Agones 在 `IsBeforeReady` 阶段会自动重取地址的机制，彻底规避 Unhealthy 判定。

---

## 经验二：GameServer Pod 被 Kubernetes 调度/驱逐搬走

### 现象

GameServer Pod 在运行中被 Kubernetes"调度走"（驱逐后在别的 Node 重建），导致对局中断。通常发生在集群压缩节点时。

### 根因

这不是 kube-scheduler 的"重新调度"，而是 **Cluster Autoscaler（集群节点自动伸缩器）** 在压缩集群时驱逐（evict）Pod。Kubernetes 中 Pod 会因**自愿中断**（voluntary disruption，如 Cluster Autoscaler 压缩节点、节点升级 drain）或**非自愿中断**（硬件故障等）被驱逐。

Agones 默认假定游戏服**不应被自愿驱逐**，通过以下两个机制阻止 Cluster Autoscaler 搬走正在运行的 GameServer Pod：

- 给 Pod 打上 `cluster-autoscaler.kubernetes.io/safe-to-evict: false` 注解，阻止 Cluster Autoscaler 驱逐；
- 用 `agones.dev/safe-to-evict` label selector 匹配名为 `agones-gameserver-safe-to-evict-false` 的 **PodDisruptionBudget**，同时阻止 Cluster Autoscaler 和（一段时间内的）节点升级驱逐。

**关键点**：这个保护由 Fleet 的 `Packed` 调度策略（默认）保证——Agones 会确保 Cluster Autoscaler 不会在对局进行中驱逐并搬走 GameServer Pod。如果误改了 `eviction` 设置、用了 `Distributed` 策略但云环境仍开着 autoscaler，或手动关掉了这些注解 / PDB，就会出现 Pod 被搬走的现象。

### 解决方案：通过 `GameServer.spec.eviction` API 控制

在 `GameServerSpec` 中设置 `eviction.safe`：

```yaml
apiVersion: "agones.dev/v1"
kind: GameServer
metadata:
  name: "simple-game-server"
spec:
  eviction:
    safe: Never   # 默认值，禁止自愿驱逐
  template:
    [...]
```

三种取值对应的底层行为：

| `eviction.safe` | `safe-to-evict` Pod 注解 | `agones.dev/safe-to-evict` label | 效果 |
|---|---|---|---|
| `Never`（默认） | `false` | `false`（匹配 PDB） | 禁止 Cluster Autoscaler 驱逐、禁止节点升级驱逐 |
| `OnUpgrade` | `false` | `true`（不匹配 PDB） | 仅允许节点升级时驱逐 |
| `Always` | `true` | `true`（不匹配 PDB） | 允许 Cluster Autoscaler 压缩节点时驱逐（需游戏服能优雅终止） |

### 选择建议

- **不希望对局被打断** → 保持默认 `safe: Never`（Agones 默认行为，这也是"关闭 k8s 自动把 Pod 调度走"的正确做法）。
- **游戏服支持 `TERM` 信号且能在 10 分钟内结束** → 可设 `safe: Always` 并配置 `terminationGracePeriodSeconds` 为会话时长，让 Cluster Autoscaler 压缩集群省成本。
- **能在 1 小时内结束** → 可设 `safe: OnUpgrade`。

> 兼容性说明：老版本若配置过 `cluster-autoscaler.kubernetes.io/safe-to-evict: true` 注解，Agones 会视为 `eviction.safe: Always`。
>
> 补充：`safe: Never` 默认只保证不被自愿驱逐；真正在对局中不被搬走还依赖默认的 `Packed` 调度策略。若使用 `Distributed` 策略，需自行确认云环境的 autoscaler / 节点升级行为。

---

## 经验三：其他生产环境踩坑与最佳实践清单

以下来自 Agones 官方 Best Practices 与 Troubleshooting 文档，整理成可对照的检查项。

### 1. Agones 控制面与 GameServer 节点要隔离

生产环境 Agones 应调度到**独立的节点池**，与游戏服节点分开，提升隔离性和可靠性。Agones 默认倾向调度到打了 `agones.dev/agones-system=true` 标签的节点，并容忍 `agones.dev/agones-system=true:NoExecute` 污点。若用 Prometheus 采集指标，metrics 组件同理用 `agones.dev/agones-metrics=true` 污点单独隔离。

### 2. 单集群是单点故障，考虑冗余多集群

Kubernetes 集群本身是单点：一条错误的 RBAC、控制面过载都可能导致无法分配 GameServer 甚至中断现有对局。建议：

- **跨地理故障域**（不同 region / 可用区 / 机房）铺开，兼顾容灾和客户端延迟；
- **同一故障域内多集群**，便于滚动升级；
- 跨集群分配当前推荐用 **Service Mesh**（Istio / Linkerd 等）路由到各集群的 `agones-allocator`，而不是旧的自定义多集群分配方案。

### 3. 排查 GameServer 问题：先用单个 GameServer 而不是 Fleet

Fleet 会自动替换任何 Unhealthy 的 GameServer，导致来不及抓现场。排障时改为单独实例化一个 `GameServer`（而非 Fleet），它进入 Unhealthy 后**不会被替换**，方便 introspect。也可先用 **local SDK server** 在本地复现问题。

### 4. Unhealthy 排查三板斧

- `kubectl describe gs <name>`：看 GameServer 生命周期事件（PortAllocation → Creating → Scheduled → RequestReady → Ready → Unhealthy）；
- `kubectl describe pod <name>`：看后端 Pod 的 `Restart Count`、`Last State: Terminated` 等，判断是否游戏服二进制崩溃触发 Unhealthy；
- `kubectl logs <pod> -c <game-server-container>`（加 `--previous=true` 看崩溃前日志），以及 `kubectl get events | grep <name>`（事件默认保留约 1 小时，Pod 删除后仍可查）。

> 常见根因：游戏服进程 crash / 退出、健康 Ping 停了。Health 配置见 GameServer 的 `spec.health`（`failureThreshold`、`initialDelaySeconds`、`periodSeconds`）。

### 5. 看日志的两个位置

- **控制器**：`kubectl logs -n agones-system agones-controller-<hash>`，排查全局问题的第一站；
- **SDK sidecar**：`kubectl logs <gs-pod> -c agones-gameserver-sidecar`，排查单个 GameServer 与 SDK 交互问题。Agones 用 JSON 结构化日志。
- 可分别用 `sdkServer.logLevel`（GameServer 上）和 Helm 的 `agones.controller.logLevel` 调成 `debug`。

### 6. Feature Gate 没生效先核对实际传入值

Alpha 特性可能有 bug，但第一步先确认 Feature Gate 是否真的按预期传入：查看控制器启动日志里 `ctlConf` 的 `featureGates` 字段（URL Query String 格式，`\u0026` 即 `&`），确认开关状态。

### 7. 先卸载 Agones 再删 GameServer 会卡在 Finalizer

Agones GameServer 用 Finalizer 管理垃圾回收。如果先卸载了控制器，Finalizer 没人移除，GameServer 会删不掉。补救——批量清空 finalizer 后即可删除：

```bash
kubectl get gameserver -o name | xargs -n1 -P1 -I{} kubectl patch {} --type=merge -p '{"metadata": {"finalizers": []}}'
```

> 正确顺序：**先删完所有 GameServer / Fleet，再卸载 Agones**。

### 8. 安装报 Forbidden 错误

通常是当前账号 RBAC 权限不足（尤其某些云默认账号权限受限）导致 Agones 安装时创建 RBAC 资源被拒。需给安装账号授予足够的 cluster-admin 级权限。

---

## 参考

- Agones MigrationController 源码：`pkg/gameservers/migration.go`
- Agones 地址分配源码：`pkg/gameservers/gameservers.go`（`address()` 函数）
- Scheduling and Autoscaling：https://agones.dev/site/docs/advanced/scheduling-and-autoscaling/
- Controlling Disruption（eviction API）：https://agones.dev/site/docs/advanced/controlling-disruption/
- Best Practices：https://agones.dev/site/docs/guides/best-practices/
- Troubleshooting：https://agones.dev/site/docs/guides/troubleshooting/

