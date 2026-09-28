---
title: 在 AWS Graviton 上跑虚幻引擎 DS
tags:
  - UE
id: ds-aws-graviton
categories:
  - 笔记
date: 2026-09-28 15:45:35
---

# 在 AWS Graviton 上跑虚幻引擎 DS：一套多平台镜像构建流水线

> 基于 AWS 官方示例仓库 [`aws-samples/containerized-game-servers`](https://github.com/aws-samples/containerized-game-servers) 的 `lyra/` 示例（UE5 Lyra Starter Game），拆解“同一份镜像同时跑在 Graviton（arm64）和 Intel/AMD（amd64）节点上”的完整构建与部署流程。
>
> 配套阅读：
> - [Fire up your Unreal Engine-based game on all Graviton cores](https://aws.amazon.com/cn/blogs/gametech/fire-up-your-unreal-engine-based-game-on-all-graviton-cores/)（2023-06-28）
> - [Compiling UE5 Dedicated Servers for AWS Graviton EC2 Instances](https://aws.amazon.com/blogs/gametech/compiling-unreal-engine-5-dedicated-servers-for-aws-graviton-ec2-instances/)（2023-06-15）

---

## 1. 为什么游戏 DS 需要专门处理多架构

Dedicated Server（DS）对 CPU 的使用方式和普通 Web 服务不一样：

- **固定 tick-rate**：服务器以固定频率推进游戏逻辑，每个核都要完整参与计算，不能接受超线程带来的上下文切换抖动。
- **核心独占诉求**：为避免调度抖动，运维通常会把 vCPU 按物理核来分配。
- **网络是 UDP**：DS 通过 UDP 与大量客户端通信，容器网络方案要照顾公网直连和动态端口。

AWS Graviton（arm64，RISC 指令集）相比同代 x86（amd64，CISC 指令集）在这个场景下有两个天然优势：

1. 每个 vCPU 直接映射一个**物理核**，没有 SMT/超线程；
2. 单核算力更高、缓存更大，单位价格更低。

官方在 Lyra 上的实测（每台 2 vCPU 实例跑 30 个 shooter bot，每个 bot 约需 0.3 CPU 核；10 局，每局 11 分钟）：

| 实例 | 架构 | 压测下 CPU 占用 |
|---|---|---|
| c6a.large | amd64 | **97%** |
| c7g.large | arm64（Graviton3） | **75%** |

结论：**同样的性能表现，Graviton 成本低约 42%，吞吐高约 22%**。

但收益的前提是——你得真的有一个 arm64 版本的 DS 镜像，并且不能让运维同时维护两套发布配置。

---

## 2. 总体思路：一次编译两套包，两条原生构建，一个镜像地址

整套方案可以用一句话概括：

> **UE5 侧分别产出两套 server 包；CI 侧用原生 ARM 和 x86 两台构建机并行跑同一份脚本；最后用 Docker manifest 把两个单架构镜像合成一个镜像索引（Image Index），对下游只暴露一个 image URI。**

关键设计决策有三个：

1. **不用交叉编译做最终打包，也不用 QEMU 模拟**——两种架构各用一台同架构的 CodeBuild，原生编译、原生打包。
2. **Dockerfile 保持架构无关**——同一份脚本能在两种 CPU 上构建。
3. **镜像内部路径归一**——无论哪个架构，解压后都叫 `/usr/local/lyra_starter_game`，启动脚本都叫 `LyraServer.sh`，Kubernetes 只需要一份 Deployment。

整条流水线分四层镜像/产物：

```
UE5 编辑器（两套 DS 包）
        │  zip 上传 S3
        ▼
base 镜像（架构无关 Dockerfile，双架构构建）
        │  FROM base
        ▼
游戏镜像（base + S3 上的 server 包，双架构构建）
        │  docker manifest 合成
        ▼
多架构 Image Index（单一 URI，部署时按节点架构解析）
```

---

## 3. 全链路详解

### 3.1 第一步：用 UE5 产出两套 DS 二进制

这一步在游戏开发机上完成，产物上传 S3，**不在容器仓库内**。仓库 README 也写明：服务端二进制与内容需要预先构建好。

准备工作：

- 安装 UE 官方的 **v20 交叉编译工具链**（clang-13.0.1，对应 UE 5.1/5.0.2 及以上）。Epic 与 AWS 已合作在引擎中内置了 Graviton/LinuxArm64 支持。

在 UE 编辑器里对每个架构各做一次：

1. Platforms 下拉菜单选择 **LinuxArm64**（另一套选 **Linux**）；
2. Binary Configuration 设为 `Development`，Build Target 设为 `LyraServer`；
3. **Cook Content**（烘焙内容到该平台）；
4. **Package Project**，选择 `Binaries` 目录，得到：
   - arm64：`Binaries/LinuxArm64Server/`
   - amd64：`Binaries/LinuxServer/`
5. 分别压缩为 `LinuxArm64Server.zip`、`LinuxServer.zip`，上传到 S3（示例桶 `lyra-starter-game`）。

> 注意这个命名：**UE 打包目录名 = zip 名 = S3 对象名 = 后面的单架构镜像 tag**。它是贯穿整条流水线的约定。

命令行等价做法是用 UAT 的 `BuildCookRun`，目标平台分别为 `LinuxArm64` 和 `Linux`，构建目标 `LyraServer`。

### 3.2 第二步：构建架构无关的 base 镜像

base 镜像装的是通用工具和运行库（awscli、kubectl、cmake、各种 -dev 库、python 包等），由 IT/DevOps 维护，优先考虑稳定性与安全。

它的 Dockerfile（`lyra/server/base-image-multiarch-python3/Dockerfile`）有一个刻意的特点：**全文没有任何架构判断**。

```dockerfile
FROM public.ecr.aws/docker/library/python:3.12-slim   # 官方多架构基础镜像
RUN apt-get update -y --fix-missing
RUN apt-get install -y vim net-tools jq unzip curl iptables ...
RUN pip install requests boto3 awscli pandas numpy    # pip / apt 自动选当前架构
# kubectl 从 pkgs.k8s.io 安装（deb 仓库自带架构选择）
```

官方博客特别强调了这一点。**反例**是这样写：

```dockerfile
ARG ARCH=aarch64      # 或 amd64
RUN curl "https://awscli.amazonaws.com/awscli-exe-linux${ARCH}.zip" -o awscliv2.zip
RUN unzip awscliv2.zip && ./aws/install
```

这种把 `amd64/aarch64` 硬编码进脚本的写法，会逼着你维护两份 Dockerfile。推荐做法是让包管理器自己处理架构：

```dockerfile
RUN pip install awscli
```

同理，`apt-get` / `yum` 装的包都会动态链接到当前架构，`FROM` 的 `python:3.12-slim` 本身也是一个多架构镜像索引。

唯一**必须**判断架构的地方是安装 buildx 这个二进制本身（`enable-buildx.sh`）：

```bash
arch=$(uname -i)          # aarch64 → arm64；x86_64 → amd64
wget https://github.com/docker/buildx/releases/download/${BUILDX_VER}/buildx-${BUILDX_VER}.linux-$buildx_arch
```

base 镜像构建产物（README 实测大小）：

| 架构 | 大小 |
|---|---|
| AMD64 | 601.11 MB |
| ARM64 | 582.56 MB |

### 3.3 第三步：把 S3 上的 server 包打进游戏镜像

游戏镜像 = base 镜像 + 从 S3 下载的 DS 二进制和内容。这一步是多架构的真正分叉点。

Dockerfile 只有一份模板（`assets-image-multiarch/Dockerfile.template`），构建前用 `envsubst` 注入变量：

```dockerfile
FROM $BASE_IMAGE
ARG S3_LYRA_ASSETS
# 从 S3 下载对应架构的 server 包
RUN wget "https://$S3_LYRA_ASSETS.s3.us-west-2.amazonaws.com/$GAME_ASSETS_TAG.zip" -O /usr/local/$GAME_ASSETS_TAG.zip
RUN unzip /usr/local/$GAME_ASSETS_TAG.zip -d /usr/local/
# 关键：无论解压出来叫什么，统一改名
RUN mv /usr/local/$GAME_ASSETS_TAG /usr/local/lyra_starter_game
RUN chmod +x /usr/local/lyra_starter_game/LyraServer*.sh
# 关键：启动脚本名归一
RUN if [ ! -e /usr/local/lyra_starter_game/LyraServer.sh ]; then \
      mv -f /usr/local/lyra_starter_game/LyraServer*.sh /usr/local/lyra_starter_game/LyraServer.sh; \
    fi
COPY create_node_port_svc.sh /usr/local/lyra_starter_game/
```

两个架构的构建脚本 `build.sh` 完全一样，区别只在外部传入的环境变量：

| CodeBuild 项目 | 构建机镜像 | `GAME_ASSETS_TAG` | 下载 | 产出 tag |
|---|---|---|---|---|
| `LyraAssetsImageArmBuild` | `AMAZON_LINUX_2_ARM_2`（Graviton） | `LinuxArm64Server` | `LinuxArm64Server.zip` | `lyra:LinuxArm64Server` |
| `LyraAssetsImageAmdBuild` | `AMAZON_LINUX_2_3`（x86） | `LinuxServer` | `LinuxServer.zip` | `lyra:LinuxServer` |

这两行“改名 + 启动脚本归一”是整个方案能做到“单一 image URI + 单一容器启动命令”的前提：两种平台 UE 打出的目录和脚本名未必一致，但容器里全部归一成 `/usr/local/lyra_starter_game/LyraServer.sh`。

### 3.4 第四步：manifest 合成，双轨汇聚

两个单架构镜像构建完成后，第三个 CodeBuild 项目只做元数据操作（不重新构建），把它们合并成一个多架构镜像索引：

```bash
docker manifest create $GAME_ASSETS_IMAGE \
    --amend $GAME_ASSETS_ARM_IMAGE \
    --amend $GAME_ASSETS_AMD_IMAGE
docker manifest push $GAME_ASSETS_IMAGE
```

合并后，`lyra:lyra_starter_game` 这个 tag 指向的是一个 **Image Index（manifest list）**，内部含 arm64 和 amd64 两个条目。

CodePipeline 用 `runOrder` 控制时序：

- `BuildARMAssets` 与 `BuildAMDAssets`：`runOrder: 1`，**并行**；
- `AssembleAssetsBuilds`：`runOrder: 2`，等前两个都成功后再跑。

因为两种架构并行构建，**总耗时等于单架构构建时长**，官方数据：

- 全新构建：约 12 分钟；
- 命中 ECR 层缓存的增量构建：约 5 分钟。

> 除了游戏镜像，示例还对一个“DDoS bot”（压测用攻击者镜像）跑了完全同构的三步流水线，产出 `lyra:lyra_attacker`，用于后面的性能压测。

### 3.5 第五步：部署时按节点架构自动选层

到了运行时，多架构的复杂性被完全藏起来了。

Karpenter NodePool 同时允许两种架构：

```yaml
- key: kubernetes.io/arch
  operator: In
  values:
    - arm64
    - amd64
```

Deployment 只引用**那一个**镜像地址和**那一个**启动命令：

```yaml
image: <account>.dkr.ecr.<region>.amazonaws.com/lyra:lyra_starter_game
command: ["/usr/local/lyra_starter_game/LyraServer.sh"]
ports:
  - containerPort: 7777
    protocol: UDP
```

当 Pod 被调度到某个节点，该节点上的容器运行时（containerd）会读取 Image Index，**按节点自己的 `os/arch` 拉取对应的镜像层**。运维不需要写两份 Deployment，也不需要关心 Pod 最终落在哪种机器上。

### 3.6 第六步：每 Pod 动态 NodePort + 公网 IP

DS 需要 UDP 公网直连，示例用“每个 DS Pod 一个 NodePort Service”的方案，靠 Pod 生命周期钩子动态管理：

**`postStart`**（Pod 启动后）：

1. 给 Pod 打一个独一无二的标签 `gamepod=$POD_NAME`；
2. 查出 Pod 所在节点的公网 IP，拼出 Service 名（把 IP 里的 `.` 换成 `-`）；
3. 用 `envsubst` 渲染 Service 模板并 `kubectl apply`。

```bash
kubectl label pod $POD_NAME gamepod=$POD_NAME
service_name=$POD_NAME-svc-$(... 节点公网 IP，点转横杠 ...)
export SVC_NAME=$service_name
cat lyra_node_port_svc_template.yaml | envsubst | kubectl apply -f -
```

Service 模板用这个标签做 selector，保证 Service 与 Pod **1:1 路由**：

```yaml
apiVersion: v1
kind: Service
metadata:
  name: $SVC_NAME
spec:
  selector:
    gamepod: $POD_NAME
  ports:
    - protocol: UDP
      port: 7777
      targetPort: 7777
  type: NodePort
```

**`preStop`**（Pod 终止前）反查并删除 Service：

```yaml
preStop:
  exec:
    command: ["/bin/sh","-c","kubectl delete svc `kubectl get svc | grep $POD_NAME | awk '{print $1}'`"]
```

公网地址有两种来源：

1. **EC2 实例公网 IP**：Karpenter 选公有子网（通过子网 tag `karpenter.sh/subnet/discovery: lyra-usw2-public` 发现）；
2. **弹性 IP（EIP）**：在 `EC2NodeClass.userData` 里，开机时找一个空闲的、带 `game-name=lyra` 标签的 EIP，没有就新申请，再绑定到实例 ENI。适合需要固定公网地址、挂客户 DNS 或套 AWS Shield 做 L3 防护的场景。

玩家客户端拿到 `IP:NodePort` 后直连：

```bash
./LyraClient.exe <IP>:<NodePort> -WINDOWED -ResX=800 -ResY=450
```

---

## 4. CI 流水线结构（CodePipeline / CodeBuild）

示例用 AWS CDK（TypeScript）定义流水线，源码经 CodeConnections 从 GitHub 拉取（新版已不再用 PAT）。

### 4.1 base 管道 `BuildBasePipeline`

| Stage | Action | CodeBuild 架构 | runOrder |
|---|---|---|---|
| Source | GitHub_Source | — | — |
| BaseImageBuild | BaseImageArmBuildX | ARM | 1（并行） |
| BaseImageBuild | BaseImageAmdBuildX | x86 | 1（并行） |
| BaseImageBuild | AssembleBaseBuilds | ARM | 2 |

### 4.2 游戏管道 `LyraPipeline`

| Stage | Action | 构建内容 | runOrder |
|---|---|---|---|
| Source | GitHub_Source | — | — |
| LyraBuildImage | BuildARMAssets | arm64 游戏镜像 | 1（并行） |
| LyraBuildImage | BuildAMDAssets | amd64 游戏镜像 | 1（并行） |
| LyraBuildImage | AssembleAssetsBuilds | manifest 合成 | 2 |
| LyraBuildAttackerImage | BuildARMAttacker / BuildAMDAttacker | arm64 / amd64 bot 镜像 | 1（并行） |
| LyraBuildAttackerImage | AssembleAttackerBuilds | bot manifest 合成 | 2 |

所有 CodeBuild 都开 `privileged: true`（Docker in Docker 需要），共用一个 IAM Role，ECR 仓库需要预先创建（CDK 用 `Repository.fromRepositoryName` 引用既有仓库，不会自动建）。

---

## 5. 两种多架构构建方式对比

示例其实同时保留了两条技术路线，适用于不同场景：

| 维度 | 本地：`docker buildx` | CI：双原生 CodeBuild + manifest |
|---|---|---|
| 命令 | `docker buildx build --platform linux/arm64,linux/amd64` 一条出双架构 | 两个同架构 CodeBuild 各构建一次，再 `docker manifest create` |
| 非原生架构怎么跑 | QEMU 用户态模拟 | **不模拟，全程原生** |
| 速度 | 编译型负载在模拟下较慢 | 快（两架构并行，总时长≈单架构） |
| 前置准备 | 需安装 buildx 并创建 builder（`enable-buildx.sh`） | CodeBuild 标准镜像自带 docker |
| 适用 | 开发者本机验证 Dockerfile | 生产 CI（官方推荐） |

经验法则：**能用原生就用原生**；QEMU 模拟更适合验证“Dockerfile 在另一个架构上能不能过”，而不是承载频繁的正式构建。

---

## 6. 动手复现

### 6.1 准备环境变量

```bash
export AWS_ACCOUNT_ID=$(aws sts get-caller-identity --output text --query Account)
export AWS_REGION=us-west-2
export BASE_REPO=baseimage
export GAME_REPO=lyra
export BASE_IMAGE_TAG=multiarch-py3
export BASE_IMAGE_ARM_TAG=arm-py3
export BASE_IMAGE_AMD_TAG=amd-py3
export GAME_ASSETS_TAG=lyra_starter_game
export GAME_ARM_ASSETS_TAG=LinuxArm64Server
export GAME_AMD_ASSETS_TAG=LinuxServer
export S3_LYRA_ASSETS=<存放 server zip 的桶名>
export GITHUB_USER=<你的 GitHub 用户/组织>
export GITHUB_REPO=containerized-game-servers
export GITHUB_BRANCH=master
```

### 6.2 创建 ECR 仓库与 GitHub 连接

```bash
aws ecr create-repository --repository-name baseimage
aws ecr create-repository --repository-name lyra

aws codeconnections create-connection \
  --provider-type GitHub --connection-name game-servers-gh
# 然后到控制台完成 OAuth 授权，拿到 Connection ARN
export CONNECTION_ARN=<arn:aws:codestar-connections:...>
```

### 6.3 部署两条流水线

```bash
cd lyra
./deploy-base-pipeline.sh
./deploy-lyra-pipeline.sh
```

### 6.4 准备 EKS 与 Karpenter，部署 DS

```bash
cat lyra-provisioner.yaml | envsubst | kubectl apply -f -
cat lyra-deploy.yaml      | envsubst | kubectl apply -f -
```

---

## 7. 复现前要修的坑（对照仓库实测）

> 以下问题在仓库当前版本中真实存在，按原样跑会失败，建议先修正。

1. **Deployment 镜像变量名不匹配。**
   `lyra-deploy.yaml` 里写的是 `$AWS_ACCOUNT`，而文档导出的是 `AWS_ACCOUNT_ID`。`envsubst` 会把未定义变量替换成空串，得到非法镜像地址。应改为 `$AWS_ACCOUNT_ID`（或额外 `export AWS_ACCOUNT=$AWS_ACCOUNT_ID`）。

2. **nodeSelector 用了已被 Karpenter v1 移除的标签。**
   `lyra-deploy.yaml` 仍写 `karpenter.sh/provisioner-name: lyra`，而 `lyra-provisioner.yaml` 已经迁到 Karpenter v1 的 `NodePool`/`EC2NodeClass`。v1 中应用侧应改用 **`karpenter.sh/nodepool`**，否则 Pod 会一直 Pending。有意思的是同一文件的 userData 已经正确改用 `karpenter.sh/nodepool/lyra` 查 ENI，Deployment 这一处属于漏改。

3. **lyra 的 base 管道实际构建了 supertuxkart 的 Dockerfile。**
   `lyra/base-pipeline-stack.ts` 里三个 CodeBuild 项目都 `cd supertuxkart/server/base-image-multiarch-python3`。两份 Dockerfile 相差 3 行：lyra 版多了 `gettext`、`pandas`、`numpy`。即 CI 产出的 base 镜像会少这三样（gettext 在游戏镜像里有兜底安装，pandas/numpy 没有）。

4. **README 的目录名过时。**
   文档让进入 `server/lyra-assets-image-multiarch`、`stk-game-server-image-multiarch`，实际目录是 `assets-image-multiarch`、`attacker-image-multiarch`、`base-image-multiarch-python3`。README 描述的“base → assets → game-server 三段式 COPY 合并”在 lyra 中并未实现：assets 镜像自己下载完整 server 包，它就是最终游戏镜像。

5. **`GAME_SERVER_TAG` 是残留的死参数。**
   它在 CDK 里声明、在部署脚本里传入，但没有任何 CodeBuild 阶段 export；模板里的 `ARG/ENV GAME_SERVER_TAG` 经 envsubst 后恒为空。不影响结果，但排查问题时容易被带偏。

其他小项：README 中 `cat lyra-provisioner` 少了 `.yaml` 后缀；`EC2NodeClass.role` 写死了 `KarpenterNodeRole-lyra-usw2`，子网/安全组也写死 `lyra-usw2` 系列 tag，换集群或区域时要一并修改。

---

## 8. 小结

这个示例最值得借鉴的不是某个具体命令，而是三个工程取舍：

1. **把架构差异收敛到“产物命名”这一个维度**——UE 目录名、S3 对象、镜像 tag 一一对应，脚本本身完全复用。
2. **原生并行构建 + manifest 汇聚**，而不是依赖模拟交叉构建，既快又稳，还不增加总构建时长。
3. **容器内路径与启动命令归一**，让 Kubernetes 与运维侧完全感知不到架构差异，真正做到“一个镜像地址跑两种芯片”。

对游戏团队而言，这意味着可以在不改动发布流程的前提下，把 DS 平滑地、甚至按比例灰度地迁移到性价比更高的 Graviton 上。

---

*参考资料：*
- [Fire up your Unreal Engine-based game on all Graviton cores — AWS for Games Blog](https://aws.amazon.com/cn/blogs/gametech/fire-up-your-unreal-engine-based-game-on-all-graviton-cores/)
- [Compiling Unreal Engine 5 Dedicated Servers for AWS Graviton EC2 Instances — AWS for Games Blog](https://aws.amazon.com/blogs/gametech/compiling-unreal-engine-5-dedicated-servers-for-aws-graviton-ec2-instances/)
- [aws-samples/containerized-game-servers — GitHub](https://github.com/aws-samples/containerized-game-servers)
- [Karpenter v1 Upgrade Guide](https://karpenter.sh/v1.0/upgrading/upgrade-guide/)
