# UE5 Iris 技术分析第十八部分：最佳实践与实战案例设计规格

## 1. 目标

根据《UE5 Iris 网络复制系统技术分析指南》大纲，补充系列第十八部分“最佳实践与实战案例”，覆盖：

- 18.0 从“能跑”到“可度量、可验证、可回退”的工程差距；
- 18.1 Push Model、轮询频率、休眠、增量压缩的性能优化方法；
- 18.2 关卡、空间、Connection、Group、Dynamic Filter 的组合策略；
- 18.3 FPS、开放世界 RPG、百人大逃杀、MMO 四类项目案例；
- 18.4 从传统复制系统迁移到 Iris 的五阶段跑道；
- 18.5 发布检查表、配置速查、对象策略矩阵与源码索引。

本篇不是新的机制百科，而是前十七篇的工程收束：读者应能从观测数据出发，选择最小改动，建立验证矩阵，并在结果不符合预算或正确性要求时安全回退。

交付物：

- 独立长篇 HTML：`/html-articles/ue5-iris-guide-part-18/`；
- Part 17 底部导航链接到 Part 18；
- Part 18 底部链接回 Part 17，并链接系列大纲的附录；
- 统一系列入口 `/ue5-iris-guide/` 增加 Part 18；
- 不创建独立的 `source/_posts/ue5-iris-guide-part-18.md`；
- 技术基线为本地 Unreal Engine 5.7.4 源码；
- 文章来源、技术依据和验证边界在页面首尾明确标注。

## 2. 用户授权与默认决定

用户明确要求后续选项全部采用推荐方案，不再询问。因此以下决定视为已批准：

- 采用“证据闭环 + 场景压力测试 + 迁移闸门”的叙事结构；
- 不把大纲中的“10 倍提升”写成通用事实；
- 不把引擎默认半径、轮询频率或优先级写成项目推荐值；
- 所有示例数值必须标为演算输入或起步假设，并要求用项目数据替换；
- 只给公开 API、真实配置键和明确标注的项目伪代码；
- 不修改、不编译本地 Unreal Engine 源码；
- 不声称运行了 UE 自动化测试、游戏项目联机测试或百人／千人压测；
- 设计规格与实施计划分别提交；
- 正文实现完成后保持未提交，等待用户后续明确要求 `commit`。

## 3. 方案比较

### 3.1 方案 A：机制清单

依次复述 Push、Polling、Dormancy、Delta、Filter 与 Prioritizer。

优点：

- 与大纲一一对应；
- 查找单项配置较快。

缺点：

- 与 Part 5、6、10、11、15、16 高度重复；
- 无法告诉读者“先改哪一项”和“如何证明改动有效”；
- 容易把开关当成优化结果。

### 3.2 方案 B：四份项目模板

分别给 FPS、开放世界、大逃杀和 MMO 一套完整配置。

优点：

- 看起来可以直接使用；
- 场景感强。

缺点：

- 半径、频率、带宽和对象规模严重依赖项目；
- 容易制造“复制配置可以跨项目照抄”的错误预期；
- MMO 的分区、交接和持久化不属于 Iris 单独解决的范围。

### 3.3 方案 C：证据闭环 + 案例蓝图 + 迁移闸门（采用）

主线：

```text
建立场景与预算
  → 捕获 CPU / scope / dirty / bits / latency 证据
  → 缩小复制集合
  → 降低变化发现与状态成本
  → 调整候选顺序和频率
  → 网络劣化与生命周期回归
  → 灰度发布
  → 指标异常时回退
```

案例不提供“万能参数”，而提供：

- 负载特征；
- 对象分层；
- 过滤与优先级组合；
- 预算演算；
- 关键回归场景；
- 扩容边界；
- 失败信号和回退点。

该方案能把大纲要求转化为生产流程，因此采用。

## 4. 技术基线与事实校准

### 4.1 版本口径

技术结论以以下本地文件为准：

```text
C:\work\st-unreal-engine\Engine\Build\Build.version
```

版本：

```text
MajorVersion 5
MinorVersion 7
PatchVersion 4
```

Epic 官方文档用于解释公开契约，但若官网当前页面与本地 5.7.4 默认值不同，正文必须以本地源码为准并显式说明差异。

### 4.2 “10 倍提升”不能保留为结论

Push Model 的收益取决于：

- 可复制对象数量；
- 完全 Push-based 的属性比例；
- 原有轮询浪费；
- gameplay 标脏质量；
- PreReplication 和自定义 Fragment 成本；
- 过滤后实际进入 poll 的集合；
- 服务器 tick rate 与连接数。

正文只允许写：

```text
收益 = 同场景、同负载、同构建、同网络条件下的 A/B 测量结果
```

禁止写成：

- 开启 Push Model 固定提升 10 倍；
- Push Model 会消除全部轮询；
- 标脏越多越安全且没有成本。

### 4.3 Push Model 是双闸门

本地 `LegacyPushModel.cpp` 表明：

- `net.Iris.PushModelMode` 本地默认值为 `2`；
- 兼容路径仍要求 `Net.IsPushModelEnabled=true`；
- 编译时必须满足 `WITH_PUSH_MODEL > 0`；
- 未完全 Push-based 的对象仍可能需要 polling；
- `net.Iris.Poll.FilterOutNonDirtyPushBasedObjects` 只对符合条件的对象在 poll loop 前做屏蔽。

配置示例必须同时展示：

```ini
[SystemSettings]
Net.IsPushModelEnabled=1
net.Iris.PushModelMode=2
```

并说明运行时开关不等于属性已经正确标脏。

### 4.4 轮询频率是每秒频率，不是帧间隔

`FObjectReplicationBridgePollConfig::PollFrequency`：

- 表示每秒轮询次数；
- 会按当前 TickRate 转换为 frame period；
- 最大 frame period 为 255；
- `0` 表示每帧轮询；
- Actor 未命中覆盖时通常使用 `NetUpdateFrequency`；
- `net.Iris.AllowPollPeriodOverrides` 和 `net.Iris.UseFrequencyBasedPolling` 本地默认开启。

正文不提供通用 `Pawn=30`、`Pickup=2` 之类的硬性答案；只提供高、中、低变化层的起始假设和测量方式。

### 4.5 Dormancy 是“停止常规轮询 + 显式唤醒”的契约

本地调用链：

```text
Actor NetDormancy
  → FReplicationSystemUtil::NotifyActorDormancyChange
  → UObjectReplicationBridge::SetObjectWantsToBeDormant
  → WantToBeDormant bitset
  → poll 集合剔除
```

`FlushNetDormancy` 会走 `NetFlushDormantObject`，把对象加入待 flush 集合并在相关时机强制轮询。

正文必须强调：

- Dormancy 不等于对象销毁；
- 进入 dormancy 前必须保证最终状态可到达；
- 修改休眠对象后需要正确 flush / wake；
- SubObject 会继承 Root 的 dormancy 状态；
- dormant object 上的 RPC 还有独立 CVar 行为，不能把 RPC 当成属性 flush 的替代品；
- `net.Iris.UseDormancyToFilterPolling` 本地默认开启，但不是业务正确性的保险。

### 4.6 Delta Compression 不是无成本压缩

本地 5.7.4：

- 全局 kill switch：`net.Iris.EnableDeltaCompression=true`；
- 新 baseline 的最小间隔默认 60 帧；
- 类级 `DeltaCompressionConfigs` 决定是否允许；
- 对象协议需要支持 delta；
- 每连接维护 baseline、确认和丢包恢复状态；
- 可减少比特，也会增加 baseline 内存和管理成本。

因此启用决策必须同时比较：

- state bits；
- delta-compressed object count；
- baseline 内存；
- packet loss 下的恢复；
- CPU；
- 状态变化形态。

### 4.7 Filtering 的推荐顺序

```text
不复制 / 只给 Owner
  → Connection Filter
  → Level / Group Filter
  → Spatial Grid Filter
  → Dynamic Filter（最后手段）
```

依据：

- Dynamic Filter 每轮运行，CPU 成本更高；
- 一个对象同时只能有一个 Dynamic Filter；
- Dynamic Filter 不能重新允许已经被 Connection 或 Group 排除的对象；
- Level filtering 在 `UEngineReplicationBridge` 内通过 Group 管理；
- `UNetObjectGridFilterConfig` 的引擎默认值只是本地默认，不是项目推荐。

正文必须把“关卡流送配置”改成“Level Group 生命周期与客户端可见状态验证”，避免虚构一个单独的 Level Filter 配置类。

### 4.8 Prioritization 不能代替 Filtering

推荐顺序：

```text
先让不相关对象离开 scope
  → 再给相关对象排队
  → 最后在预算内发送
```

高优先级：

- 不能复活已过滤对象；
- 不能凭空生成 dirty state；
- 不能增加总带宽；
- 不能保证本 tick 必发。

### 4.9 测量工具

正文建立四层证据：

| 层 | 工具 | 观察内容 |
| --- | --- | --- |
| CPU | Timing Insights / CSV Iris | poll、filter、prioritize、quantize、write |
| Packet | Networking Insights | packet、object、property、RPC、connection |
| 聚合 | Iris CSV / TypeStats | class 级 poll、waste、write、count |
| 网络劣化 | Network Emulation | lag、jitter、loss、reorder 下的正确性 |

Networking Insights 启动示例：

```text
-trace=net -NetTrace=1 -tracehost=localhost
```

正文说明这是采集起点，不是完整压测脚本。

## 5. 文章结构

正文创建 14 个二级章节：

1. `operating-system`：从能跑到可运营；
2. `evidence-loop`：优化前的证据基线；
3. `push-poll`：Push Model 与轮询分层；
4. `dormancy-delta`：休眠与增量压缩；
5. `filter-layers`：过滤漏斗；
6. `filter-validation`：过滤正确性和性能验证；
7. `case-method`：如何阅读案例蓝图；
8. `fps-case`：FPS；
9. `open-world-case`：开放世界 RPG；
10. `battle-royale-case`：百人大逃杀；
11. `mmo-case`：MMO；
12. `migration-runway`：五阶段迁移；
13. `release-gates`：发布闸门与回退；
14. `quick-reference`：快速参考、来源与源码索引。

这 14 节完整覆盖大纲 18.0～18.5，但不重复前文机制百科。

## 6. 性能优化闭环

### 6.1 先写场景合同

每次优化记录：

- 地图与玩法阶段；
- 服务器构建与硬件；
- tick rate；
- 连接数；
- 人工／机器人比例；
- 对象和 SubObject 数；
- 目标网络档位；
- packet loss / lag / jitter；
- 采集时长；
- P50 / P95 / P99；
- 正确性断言。

### 6.2 漏斗指标

```text
Registered
  → In Scope
  → Dirty / Needs Resend
  → Scheduled
  → Written
  → Acked / Applied
```

每次改动至少回答：

- 哪一层数量下降；
- CPU 转移到哪里；
- 字节是否下降；
- 最坏延迟是否恶化；
- 丢包后是否仍收敛；
- join / travel / reconnect 是否正常。

### 6.3 优化顺序

1. 删除不应复制的对象、属性、RPC；
2. 修正 Owner / Connection / Group / Level scope；
3. 使用 Grid 降低空间候选；
4. 修正 Push 标脏和 polling waste；
5. 对静止对象使用 dormancy；
6. 对合适状态启用 delta；
7. 再调 prioritizer、频率和预算；
8. 最后才写自定义热路径。

## 7. 过滤策略

### 7.1 Level Group

`UEngineReplicationBridge` 为关卡创建 Group，并通过 NetDriver 根据客户端关卡状态更新 FilterStatus。

检查点：

- persistent level 与 streaming level 行为；
- seamless travel；
- Actor 运行时换 Level；
- PlayerController 的特殊处理；
- late join；
- level unload / reload；
- Root 与 SubObject 一致性。

### 7.2 Spatial Grid

本地默认仅用于解释源码：

```text
CellSizeX / CellSizeY = 20000
DefaultCullDistance = 15000
bUseExactCullDistance = true
ViewPosRelevancyFrameCount = 2
DefaultFrameCountBeforeCulling = 4
```

正文明确：

- 这些不是推荐值；
- 应以移动速度、可视距离、武器射程、载具速度和 cell crossing 频率校准；
- cull distance 过大可能让对象回退为 always relevant；
- hysteresis 需要与移动速度和网络延迟一起验证。

### 7.3 Group

适用：

- 队伍；
- 副本；
- 阶段；
- 频道；
- 观战；
- 事件订阅。

Group 变更应由业务事件驱动，而不是每帧重建成员关系。

### 7.4 Dynamic Filter

只有对象 × 连接规则频繁变化且无法由稳定 Group 表达时才使用。

验收必须包含：

- Filter CPU 随对象数和连接数的斜率；
- 多 View；
- group 先排除；
- join / leave；
- owner change；
- split-screen；
- cache 失效。

## 8. 四类案例蓝图

### 8.1 FPS

目标：

- 命中、owner movement、战斗 RPC 的尾延迟优先；
- 场景物件和远处表现可降频；
- 不牺牲 hit validation 和可见性正确性。

分层：

- Owner fast lane；
- 近距离战斗对象；
- 远距离可见对象；
- 静态／休眠交互物；
- 记分板／PlayerState；
- cosmetic-only 表现。

### 8.2 开放世界 RPG

目标：

- 先用 Level / World Partition 生命周期缩小集合；
- 再用 Grid 处理可见半径；
- AI 只复制可观察结果；
- 静态交互物使用 dormancy；
- 处理高速载具和跨 cell。

### 8.3 百人大逃杀

预算演算公式：

```text
PerConnectionStateBytesPerSecond
  = Σ(VisibleDirtyObjectsByTier × UpdatesPerSecond × MeasuredBytesPerUpdate)

ServerStateEgress
  = Σ(EachConnectionStateBytesPerSecond)
```

示例只用于演算：

```text
45 × 20Hz × 18B
+ 150 × 4Hz × 12B
+ 99 × 1Hz × 24B
= 25,776 B/s
≈ 206 kbps / connection（仅 state payload）
```

必须注明未包含：

- packet / transport headers；
- RPC；
- NetBlob；
- reliable resend；
- token / reference export；
- join burst；
- 语音；
- 平台传输封装。

### 8.4 MMO

必须区分：

- 同时在线人数；
- 同一 shard 人数；
- 同一 AOI 人数；
- 同一连接可见对象；
- 跨区事件；
- handoff 峰值。

Iris 解决单个 ReplicationSystem 内的状态复制；区域划分、所有权转移、持久化、跨服消息和一致性由项目架构实现。

## 9. 迁移跑道

### 9.1 五阶段

1. **Inventory**：清点 relevancy、priority、subobject、NetSerialize、RPC、dormancy、ReplicationGraph；
2. **Shadow**：在测试分支启用 Iris，保留传统路径作为对照；
3. **Correctness**：先修 registered subobject、filter、serializer 和生命周期；
4. **Performance**：同场景 A/B，比较 CPU、scope、bits、latency 和 memory；
5. **Rollout**：按 server fleet / map / playlist 灰度，设置自动回退阈值。

### 9.2 必查差异

- Replication Graph 与 Iris 不能同时作为同一 NetDriver 的复制系统；
- `IsNetRelevantFor` 逻辑要迁移到 Filtering；
- `GetNetPriority` 逻辑要迁移到 Prioritization；
- Iris 要求 registered subobject list；
- 非 Actor / ActorComponent UObject 需要正确注册 Fragment；
- 自定义 `NetSerialize` 需要审核 Iris Serializer 兼容性；
- RPC 与 OnRep 顺序不能依赖未经验证的隐式假设；
- Push 属性必须完整标脏；
- dormancy、owner change、role change、late join、travel、reconnect 必须回归。

## 10. 发布闸门

### 10.1 正确性

- authoritative state 一致；
- owner / simulated proxy 条件正确；
- late join 收到完整初始状态；
- 丢包后最终收敛；
- dormancy wake 不丢最终状态；
- subobject 创建、销毁、重建正确；
- level load / unload / travel 正确；
- RPC 与 OnRep 的业务时序有测试。

### 10.2 性能

- server frame P95 / P99；
- Iris poll / filter / prioritize / quantize / write；
- per-connection scope 与 dirty 数；
- bytes / packet / reliable queue；
- memory / baseline；
- join burst；
- starvation / max update age。

### 10.3 运维

- 指标和日志可按版本、地图、玩法切片；
- 配置变更可追踪；
- 灰度与回退开关已经演练；
- protocol mismatch 策略明确；
- 客户端与服务器版本兼容窗口明确。

## 11. 视觉设计

### 11.1 方向

概念：**网络作战手册 / 发布控制室**。

视觉特征：

- 纸白背景和细网格；
- 深墨蓝作为结构主色；
- 安全绿表示通过和收敛；
- 警示橙表示风险和回退；
- Hero 大字 `SHIP`；
- 案例使用非对称蓝图卡，不使用通用渐变卡片墙；
- 数据表、公式、流程图采用工业仪表式标注。

### 11.2 页面组件

- Hero 与系列定位；
- 桌面 sticky TOC；
- 移动折叠 TOC；
- 来源卡；
- 优化证据环；
- scope 漏斗；
- Push / Poll 决策表；
- dormancy / delta 权衡板；
- filtering layer stack；
- 四张 scenario blueprint；
- 大逃杀预算计算器式静态面板；
- MMO shard 边界图；
- 五阶段 migration runway；
- release gate scorecard；
- 故障矩阵和源码索引；
- 阅读进度和返回顶部。

### 11.3 技术约束

- 单文件 HTML / CSS / JS；
- 无外部图片、字体或脚本；
- 只使用 CSS 信息图；
- 桌面与移动目录指向同一组 H2；
- 表格和代码在移动端局部滚动；
- 页面本身不得产生横向滚动；
- 支持 `prefers-reduced-motion`；
- 支持打印；
- 外链统一 `target="_blank" rel="noopener noreferrer"`。

## 12. 来源与署名

页面首部与尾部注明：

> 本文由 Jossy Zhang 根据 Smartuil 发布的《UE5-Iris 网络复制系统技术分析指南 - 大纲》原创扩写；技术结论以本地 Unreal Engine 5.7.4 源码为基线，并参考 Epic Games 官方 Iris、Networking Insights 与 Network Emulation 文档。

必须链接：

- 知乎系列大纲；
- Epic Iris Introduction；
- Components of Iris；
- Iris Filtering；
- Iris Prioritization；
- Migrate to Iris；
- Networking Insights；
- Network Emulation；
- Console Commands for Network Debugging。

验证边界：

- 已静态核对本地源码；
- 未修改或编译 UE；
- 未执行 ReplicationSystemTestPlugin；
- 未运行游戏项目联机测试；
- 未进行百人或千人压测；
- 示例参数需要项目实测替换。

## 13. 导航与统一入口

Part 17：

- 把 Part 18 非链接占位改为实际链接；
- 下一篇标题为“第十八部分：最佳实践与实战案例”。

Part 18：

- Previous：Part 17；
- Next：链接到系列大纲附录 `#section-21`；
- 同时保留“返回系列目录”和“返回博客首页”。

统一 Post：

- `updated` 改为本次时间；
- `第 1～17 部分` 改为 `第 1～18 部分`；
- 主题描述补充最佳实践、实战案例和迁移发布；
- 表格新增 Part 18；
- 内容简介新增 Part 18；
- 保持文章来源说明不变。

## 14. 验收标准

### 14.1 内容

- 覆盖大纲 18.0～18.5；
- 不声称 Push Model 固定提升 10 倍；
- 不把本地引擎默认值写成项目推荐值；
- 不承诺单服千人；
- 四类案例都包含负载、策略、指标、风险和回退；
- 迁移阶段包含正确性、性能与灰度发布；
- 明确 UE 5.7.4 技术基线和验证边界。

### 14.2 HTML

- HTML5 可解析；
- 1 个 H1；
- 14 个唯一 H2；
- 桌面和移动 TOC 共 28 个 hash 链接，全部可命中；
- 无重复 id；
- 无空链接；
- 无外部脚本；
- 外链具备安全属性；
- 无 mojibake。

### 14.3 站点

- Part 17 → Part 18；
- Part 18 → Part 17；
- Part 18 → 大纲附录；
- 系列 Post → Part 18；
- Hexo 构建成功；
- `public` 中 Part 18 与 source 关键正文一致。

### 14.4 浏览器

桌面：

- 1440 × 1000 无页面级横向溢出；
- sticky TOC、active section、reading progress、back-to-top 工作；
- 控制台无 error / warning。

移动：

- 390 × 844 无页面级横向溢出；
- 移动目录可展开并跳转；
- code、table、预算面板只在自身滚动；
- 章节导航不截断；
- back-to-top 工作。

### 14.5 Git

- 设计规格独立提交；
- 实施计划独立提交；
- 正文相关改动保持未提交；
- 不 stage `public/`；
- Unreal Engine 工作区状态与实施前一致。
