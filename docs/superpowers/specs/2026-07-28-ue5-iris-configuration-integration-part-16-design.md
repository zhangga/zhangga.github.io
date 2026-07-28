# UE5 Iris 技术分析第十六部分：配置与集成设计规格

## 1. 目标

根据《UE5 Iris 网络复制系统技术分析指南》大纲，补充第十六部分“配置与集成”，覆盖：

- 16.1 Iris 插件、编译依赖、全局策略、NetDriver 能力与三种启用方式；
- 16.2 `UObjectReplicationBridgeConfig`、轮询、过滤、优先级、增量压缩、Grid、滞后与 Descriptor 配置；
- 16.3 NetDriver 选择 Iris 的真实优先级、ReplicationSystem 创建流程、混合部署边界与五阶段迁移；
- 16.4 PIE 多实例的 `ReplicationSystemId`、实例隔离、服务端/客户端跟随逻辑与调试命令；
- 16.5 FPS、开放世界 RPG、竞速游戏三套可替换类名的起步配置；
- 16.6 上线检查表、参数速查、故障矩阵、源码索引与最佳实践。

成果包括：

- 独立长篇 HTML：`/html-articles/ue5-iris-guide-part-16/`；
- 在统一系列入口 `/ue5-iris-guide/` 中增加第十六部分链接与摘要；
- 将 Part 15 底部“下一篇”占位更新为 Part 16 链接；
- 不创建体量较小的 `ue5-iris-guide-part-16.md`；
- 技术基线使用本地 Unreal Engine 5.7.4 源码；
- 明确标注系列大纲来源、Epic Games 官方资料与源码依据。

## 2. 用户授权与默认决策

用户要求所有选项采用推荐方案，不再询问。因此本规格视为用户已经批准以下决策：

- 采用“控制面 / 启动契约”而非单纯参数字典的叙事；
- 将启用拆为“编译可见、插件装载、NetDriver 获准、启动策略选择、系统实例创建”五道门；
- 明确 CVar、GameMode / GameInstance 与命令行参数的优先级；
- 明确全局 CVar 是“后续 NetDriver 的默认策略”，不是已有 NetDriver 的热切换开关；
- 将配置对象按“定义 → 类映射 → 实例参数”三层组织；
- 三套完整配置使用示例项目类名，并标注必须按实测替换；
- 保留 Part 15 的暖纸、深蓝与橙色视觉系统，Hero 背景字改为 `CONFIGURE`；
- 使用 HTML/CSS 信息图，不生成装饰性图片；
- 设计规格与实施计划分别提交；
- 正文实施完成后保持未提交，等待用户单独要求 `commit`；
- 不修改、不编译本地 Unreal Engine 源码；
- 不声称执行了 UE 自动化测试或真实项目联机测试。

## 3. 方案比较

### 3.1 方案 A：配置参数字典

按 `PollConfigs`、`FilterConfigs`、`PrioritizerConfigs` 等字段逐项列出。

优点是便于查表；缺点是无法解释“明明写了 `net.Iris.UseIrisReplication=1`，为什么 NetDriver 仍不是 Iris”，也无法解释配置何时加载、作用于哪个实例。

### 3.2 方案 B：最短启用教程

只给 `.uproject`、`Build.cs` 和 `DefaultEngine.ini` 三段配置，随后进入验证。

优点是快速；缺点是不能覆盖大纲要求的 NetDriver 集成、PIE 多实例、三类项目配置和迁移策略。

### 3.3 方案 C：启动契约 + 配置地图 + 验证闭环（采用）

把一次成功启动 Iris 表达为：

```text
代码可见
  ∧ Iris 插件已装载
  ∧ 当前 NetDriver 的 bCanUseIris = true
  ∧ 选择策略最终要求 Iris
  → 创建 UEngineReplicationBridge
  → FReplicationSystemFactory 分配 ReplicationSystemId
  → 初始化过滤、优先级、轮询、增量压缩与 DataStream
  → 用日志、NetDriver 状态和 RepSystemId 验证
```

该方案既能解释启动失败，又能把配置、实例和调试串起来，因此采用。

## 4. 核心模型：配置是启动契约

### 4.1 五道门

| 门 | 真实问题 | UE 5.7.4 依据 |
| --- | --- | --- |
| 编译 | 游戏模块能否包含 Iris API | `SetupIrisSupport(Target)` 注入 `UE_WITH_IRIS=1` 和 `IrisCore` 依赖 |
| 装载 | 运行时是否加载 `IrisCore` | Iris 插件模块的 `StartupModule()` 加载 `IrisCore` |
| 能力 | 这个 NetDriver 是否允许 Iris | `FIrisNetDriverConfig::bCanUseIris` |
| 策略 | 本次创建希望使用哪套系统 | CVar、GameInstance / GameMode、PIE 跟随、命令行 |
| 构造 | 是否真正创建 ReplicationSystem | `UNetDriver::CreateReplicationSystem` |

文章必须强调：只有五道门全部通过，`UNetDriver::IsUsingIrisReplication()` 才有意义。

### 4.2 选择优先级

`UEngine::WillNetDriverUseIris` 的 UE 5.7.4 顺序：

1. `IrisNetDriverConfigs` 决定该 NetDriver 有没有资格；
2. `net.Iris.UseIrisReplication` 给出引擎默认偏好；
3. `UGameInstance::GetDesiredReplicationSystem` 可要求 Generic 或 Iris，但 Iris 仍受 `bCanUseIris` 限制；
4. PIE 客户端的 `GameNetDriver` 在特定 Dedicated Server PIE 场景跟随服务器；
5. `-UseIrisReplication=1|0` 最终覆盖上面的策略，但 `1` 仍不能越过 `bCanUseIris`；
6. 若结果为 Iris，`IrisCore` 模块还必须已经加载。

`IrisNetDriverConfigs` 内部匹配优先级：

1. `NetDriverName` 精确匹配；
2. `NetDriverWildcardName` 通配匹配；
3. `NetDriverDefinition` 匹配。

### 4.3 三种启用方式的边界

- 配置文件：`[SystemSettings] net.Iris.UseIrisReplication=1`，适合作为项目默认；
- 命令行：`-UseIrisReplication=1|0`，适合 A/B、CI 和回退；
- 控制台/C++：`net.Iris.UseIrisReplication` 或 `SetUseIrisReplication`，只影响之后创建的 NetDriver。

不使用“运行时热切换”措辞。已有 NetDriver 不能靠改 CVar 原地切换复制系统；无缝旅行仍复用 NetDriver，GameMode 要求不同系统时源码会触发兼容性检查。

## 5. 16.1 启用 Iris

### 5.1 项目文件

`.uproject`：

```json
{
  "Name": "Iris",
  "Enabled": true
}
```

游戏模块 `*.Build.cs` 在直接使用 Iris API 时：

```csharp
SetupIrisSupport(Target);
```

UE 5.7.4 本地 `ModuleRules.SetupIrisSupport` 会：

- 添加 `UE_NET_HAS_IRIS_FASTARRAY_BINDING=1`；
- 添加 `UE_WITH_IRIS=1`；
- 添加 `IrisCore` 私有或公开模块依赖。

正文不加入本地 5.7.4 源码中不存在的 `TargetRules.bUseIris` 配置。

### 5.2 最小 `DefaultEngine.ini`

```ini
[/Script/Engine.Engine]
+IrisNetDriverConfigs=(NetDriverDefinition=GameNetDriver,bCanUseIris=true)

[SystemSettings]
net.SubObjects.DefaultUseSubObjectReplicationList=1
net.Iris.UseIrisReplication=1
```

`BaseEngine.ini` 已允许 `GameNetDriver` 使用 Iris，但项目配置仍应显式表达意图，尤其是在覆盖数组时。注册式 SubObject 列表属于迁移前置条件，不能只开 Iris 而忽略。

### 5.3 模块加载流程

```text
Iris.uplugin（默认不启用）
  → Iris Runtime 模块，LoadingPhase=Default
  → FIrisModule::StartupModule
  → LoadModule("IrisCore")
  → FIrisCoreModule::StartupModule
  → 先加载 NetCore
  → 提前解析 -UseIrisReplication
  → 注册并冻结默认 NetSerializer 映射
  → 初始化 Legacy Push Model 兼容层
  → 订阅 ReplicationSystem 创建/销毁
```

文章说明：插件在本地 5.7.4 的 `Engine/Plugins/Experimental/Iris/Iris.uplugin` 中 `EnabledByDefault=false`、`IsBetaVersion=true`。

## 6. 16.2 配置对象地图

### 6.1 三层配置

| 层 | 示例 | 职责 |
| --- | --- | --- |
| 系统定义 | `UNetObjectFilterDefinitions` | 注册名字到实现类和配置类 |
| 类映射 | `UObjectReplicationBridgeConfig` | 把 Gameplay 类映射到 filter / prioritizer / poll / delta |
| 算法参数 | `UNetObjectGridFilterConfig` 等 | 配置具体实现的数值行为 |

必须先有定义，类映射中使用的名字才可解析；类映射也不能代替算法参数。

### 6.2 `UObjectReplicationBridgeConfig`

配置段：

```ini
[/Script/IrisCore.ObjectReplicationBridgeConfig]
```

核心字段：

- `PollConfigs`；
- `FilterConfigs`；
- `PrioritizerConfigs`；
- `DeltaCompressionConfigs`；
- `CriticalClassConfigs`；
- `DefaultSpatialFilterName`；
- `RequiredNetDriverChannelClassName`。

它是 `config=Engine` 的 transient UObject，系统读取 Class Default Object，并在 Bridge 初始化时加载映射。文章建议修改 ini 后重建网络会话；不承诺已有 ReplicationSystem 热更新全部映射。

### 6.3 轮询

`FObjectReplicationBridgePollConfig`：

- `ClassName` 使用完整类路径；
- `PollFrequency` 是每秒轮询次数；
- `0` 表示每帧；
- `bIncludeSubclasses` 控制是否继承；
- 更深的类配置优先于更通用父类；
- `Object` 和 `Actor` 被源码禁止用作覆盖类名。

频率会按 `MaxTickRate` 转成 0～255 的帧周期；它不是严格的墙钟计时器。没有 Push Model 的 Actor 默认仍从 `NetUpdateFrequency` 得到轮询频率。

### 6.4 Filter

定义：

```ini
[/Script/IrisCore.NetObjectFilterDefinitions]
+NetObjectFilterDefinitions=(FilterName=Spatial,ClassName=/Script/IrisCore.NetObjectGridWorldLocFilter,ConfigClassName=/Script/IrisCore.NetObjectGridFilterConfig)
```

映射：

```ini
[/Script/IrisCore.ObjectReplicationBridgeConfig]
+FilterConfigs=(ClassName=/Script/MyGame.MyPickup,DynamicFilterName=Spatial,FilterProfile=StableWorldItem)
```

`None` 表示该类不使用动态 Filter，不等于对象永远绕过 Owner、Group 或协议规则。`bForceEnableOnAllInstances` 会覆盖 `bAlwaysRelevant` / `bOnlyRelevantToOwner` 对类映射的抑制，需谨慎。

### 6.5 Prioritizer

定义层包含 `PrioritizerName`、实现类与配置类。第一条有效定义成为默认空间 Prioritizer。类映射支持：

- 具体名称；
- `Default`，表示默认空间 Prioritizer；
- `bForceEnableOnAllInstances`。

正文覆盖内置：

- `SphereNetObjectPrioritizer`；
- `SphereWithOwnerBoostNetObjectPrioritizer`；
- `FieldOfViewNetObjectPrioritizer`；
- `NetObjectCountLimiter`。

参数值只作为起点。优先级会跨网络 Tick 累积，低于 1 的瞬时值不代表对象永久饿死。

### 6.6 Delta Compression

`DeltaCompressionConfigs` 按类和继承树启用或禁用；实际还受：

- `net.Iris.EnableDeltaCompression`；
- `MaxDeltaCompressedObjectCount`；
- Baseline 可用性与 ACK；
- 对象状态大小和变化模式。

正文不把“启用”写成“一定省带宽”，必须以 Part 10 的 Baseline / ACK 成本模型衡量。

### 6.7 Grid 与滞后

`UNetObjectGridFilterConfig` 的关键默认值（源码构造默认）：

- `ViewPosRelevancyFrameCount=2`；
- `DefaultFrameCountBeforeCulling=4`；
- `CellSizeX=CellSizeY=20000`；
- `DefaultCullDistance=15000`；
- `bUseExactCullDistance=true`。

`UReplicationFilteringConfig`：

- `bEnableObjectScopeHysteresis`；
- `DefaultHysteresisFrameCount`；
- `HysteresisUpdateConnectionThrottling`；
- `HysteresisProfiles`。

文章区分 Grid 自己的“最近 cell / cull frame”与 Filtering 全局的 scope hysteresis，避免混为一个参数。

### 6.8 Descriptor

`UReplicationStateDescriptorConfig`：

- `SupportsStructNetSerializerList` 只用于经过验证、能安全使用反射 StructNetSerializer 的结构；
- `EnsureFullyPushModelClassNames` 用于维护完全 Push Model 的类；
- `bEnsureAllClassesAreFullyPushModel` 用于扩大检查。

不能用 `SupportsStructNetSerializerList` 单纯隐藏未知的自定义序列化警告。

## 7. 16.3 NetDriver 集成

### 7.1 创建流程

```text
UEngine::CreateNetDriver_Local
  → UEngine::WillNetDriverUseIris
  → UNetDriver::PostCreation(bInitializeWithIris)
  → UNetDriver::InitBase
  → UNetDriver::CreateReplicationSystem
  → 选择 server/client FNetDriverReplicationSystemConfig
  → UGameInstance::OverrideIrisReplicationSystemConfig
  → 创建 UEngineReplicationBridge
  → FReplicationSystemFactory::CreateReplicationSystem
  → SetReplicationSystem
  → 开始注册 World 中 Actor
```

### 7.2 `FNetDriverReplicationSystemConfig`

支持覆盖：

- `MaxReplicatedObjectCount`；
- `InitialNetObjectListCount`；
- `NetObjectListGrowCount`；
- `PreAllocatedMemoryBuffersObjectCount`；
- `MaxReplicationWriterObjectCount`；
- `MaxDeltaCompressedObjectCount`；
- `MaxNetObjectGroupCount`；
- `bAllowParallelTasks`。

数值 `0` 表示沿用 `FReplicationSystemParams` 默认值；文章列出 UE 5.7.4 默认值，但不建议无测量地复制“更大”配置。

### 7.3 混合模式边界

允许的混合：

- 不同 NetDriverDefinition / NetDriverName 分别选择 Iris 或 Generic；
- 不同进程、服务器池、GameMode 启动时选择不同系统；
- 命令行做整次进程级 A/B；
- PIE 中多个 World / NetDriver 拥有各自 ReplicationSystem。

不允许或不推荐的“混合”：

- 同一个 NetDriver 内一部分 Actor 用 Iris、一部分 Actor 用 Legacy；
- 同一个 NetDriver 在已有连接期间用 CVar 热切换；
- Iris 与 Replication Graph 同时驱动同一个 NetDriver；
- 无缝旅行中切换复用中的 NetDriver。

## 8. 16.4 PIE 多实例

### 8.1 `ReplicationSystemId`

`FReplicationSystemFactory`：

- 在进程级数组中寻找第一个空槽；
- 以数组索引作为 `ReplicationSystemId`；
- 创建日志形如 `Iris ReplicationSystem[0] ... is created`；
- 销毁后槽位可复用。

`FNetRefHandle` 在 UE 5.7.4 中保留 10 bit ReplicationSystemId，完整句柄把对象 ID 和系统 ID 一起编码。ID 是当前进程生命周期内的路由标识，不是持久化世界 ID。

### 8.2 隔离与调试

每个 Iris NetDriver 拥有：

- 自己的 `UReplicationSystem`；
- 自己的 Bridge；
- 自己的连接、对象索引、Filter / Prioritizer 状态；
- 进程级唯一的当前 `ReplicationSystemId`。

多数对象调试命令支持：

```text
RepSystemId=X
```

若省略，`ObjectReplicationBridgeDebugging.cpp` 默认查 ID 0；多 PIE 时可能查询错世界。文章复用 Part 15 的命令并加入：

```text
Net.Iris.PrintReplicatedObjects RepSystemId=0
Net.Iris.PrintNetInfoOfObject FindByName=<name> RepSystemId=1 ConnectionId=1
```

## 9. 16.5 三套完整起步配置

### 9.1 共同原则

三套示例必须：

- 带 `.uproject` / `Build.cs` / `[SystemSettings]` 最小启用块；
- 使用 `/Script/MyGame.*` 占位类名并标注替换；
- 只清理项目自己要接管的数组，避免误删引擎必需定义；
- 保留引擎默认 `Spatial` 和 `DefaultPrioritizer`，除非示例显式增加定义；
- 说明数值是 profiling 前的起步值，不是跨项目最佳值；
- 配套验证指标：对象数、Poll Count / Waste、Write KBytes、相关性边缘抖动和连接规模。

### 9.2 FPS

策略：

- Character / Projectile 高频 poll；
- Pickup / Objective 使用 Spatial；
- PlayerState 使用引擎 Count Limiter 路径；
- 对玩家控制对象可增加 Owner Boost Prioritizer；
- 小地图世界保持较小 Grid Cell 和精确距离；
- 重点验证命中、切枪、投射物与拾取物边界。

### 9.3 开放世界 RPG

策略：

- Character 中频、NPC 低中频、静态交互物低频；
- 更大 Grid Cell 与 Cull Distance；
- 对 NPC / WorldItem 使用 FilterProfile 与 Hysteresis；
- 控制 Delta Compression 对象上限；
- 分级 `PollConfigs`，避免把所有 Actor 设为同频；
- 重点验证高速移动、传送、世界分区流送和边界反复进出。

### 9.4 竞速

策略：

- Vehicle 高频 poll；
- 增加 `FieldOfViewNetObjectPrioritizer` 定义；
- 车辆类映射到 FOV Prioritizer；
- TrackPickup / Hazard 使用 Spatial；
- 近距离球体、前方视锥和视线胶囊共同决定优先级；
- 重点验证高速相对运动、后视镜/分屏多 View 和冲线拥塞。

## 10. 五阶段迁移

### 阶段 0：基线

- 固定 Legacy 正确性、CPU、带宽、内存和坏网络结果；
- 记录 NetDriverDefinition、Replication Graph、Dormancy、SubObject 和自定义 NetSerialize 使用。

### 阶段 1：编译与双路启动

- 启用插件与编译依赖；
- 保持默认 Generic；
- 用 `-UseIrisReplication=1|0` 建立可回退 A/B；
- 不在此阶段做激进调参。

### 阶段 2：兼容性

- 注册 SubObject 列表；
- 修正自定义 UObject Fragment；
- 验证 custom NetSerialize / FastArray；
- 替换 Replication Graph 专用逻辑；
- 逐 GameMode / NetDriverDefinition 开放。

### 阶段 3：配置与性能

- 按类配置 Poll / Filter / Prioritizer / Delta；
- 用 Part 15 的 Timing、Networking Insights、CSV 与 LLM 度量；
- 扩连接、扩对象和坏网络分别测试。

### 阶段 4：默认启用与回退演练

- 项目默认启用 Iris；
- CI 同时保留 Iris / Generic 冒烟测试；
- 演练命令行回退；
- 发布前确认不依赖运行时热切换。

## 11. 文章结构

正文使用 13 个二级章节：

1. `#boot-contract`：配置不是参数表，而是启动契约；
2. `#control-plane`：编译、插件、能力、策略、实例五层控制面；
3. `#selection`：NetDriver 选择优先级与三种开关；
4. `#enable`：16.1 UE 5.7.4 最小启用步骤；
5. `#module-load`：Iris / IrisCore 模块加载与启动时间线；
6. `#config-map`：16.2 配置定义、类映射和算法参数；
7. `#polling`：PollConfig、频率换算与 Push Model 边界；
8. `#filter-priority`：FilterConfig / PrioritizerConfig；
9. `#advanced-config`：Delta、Grid、Hysteresis、Descriptor；
10. `#netdriver`：16.3 NetDriver 检测与 ReplicationSystem 创建；
11. `#pie`：16.4 多实例、ReplicationSystemId 与调试；
12. `#profiles`：16.5 FPS / RPG / Racing 完整起步配置；
13. `#migration`：16.6 五阶段迁移、验证、故障矩阵、源码与总结。

目录为每个 H2 提供一个条目，移动端使用可折叠目录。

## 12. 视觉与交互

延续系列视觉系统：

- 暖纸背景、深蓝 Hero、橙色强调；
- Hero 背景字 `CONFIGURE`；
- 固定阅读进度条、桌面粘性目录、移动端折叠目录；
- 返回顶部按钮；
- 支持 `prefers-reduced-motion`；
- 表格容器支持横向滚动和键盘聚焦。

核心信息图：

- 五道门启动栈；
- 选择优先级阶梯；
- Iris → IrisCore 模块时间线；
- 三层配置地图；
- NetDriver → Bridge → ReplicationSystem 构造流水线；
- 多 PIE World / NetDriver / RepSystemId 隔离图；
- 三类游戏配置画像；
- 五阶段迁移路线图。

不引入外部 JavaScript、字体或图片依赖。

## 13. 技术依据

### 13.1 本地 UE 5.7.4 源码

- `Engine/Plugins/Experimental/Iris/Iris.uplugin`
- `Engine/Plugins/Experimental/Iris/Source/Iris/Private/Iris/IrisModule.cpp`
- `Engine/Source/Runtime/Net/Iris/Private/Iris/IrisCoreModule.cpp`
- `Engine/Source/Runtime/Net/Iris/Public/Iris/IrisConfig.h`
- `Engine/Source/Runtime/Net/Iris/Private/Iris/IrisConfig.cpp`
- `Engine/Source/Runtime/Engine/Classes/Engine/Engine.h`
- `Engine/Source/Runtime/Engine/Private/UnrealEngine.cpp`
- `Engine/Source/Runtime/Engine/Classes/Engine/NetDriver.h`
- `Engine/Source/Runtime/Engine/Private/NetDriver.cpp`
- `Engine/Source/Runtime/Engine/Private/GameInstance.cpp`
- `Engine/Source/Runtime/Engine/Private/World.cpp`
- `Engine/Source/Runtime/Net/Iris/Public/Iris/ReplicationSystem/ObjectReplicationBridgeConfig.h`
- `Engine/Source/Runtime/Net/Iris/Public/Iris/ReplicationSystem/Filtering/NetObjectGridFilter.h`
- `Engine/Source/Runtime/Net/Iris/Public/Iris/ReplicationSystem/Filtering/ReplicationFilteringConfig.h`
- `Engine/Source/Runtime/Net/Iris/Public/Iris/ReplicationState/ReplicationStateDescriptorConfig.h`
- `Engine/Source/Runtime/Net/Iris/Public/Iris/ReplicationSystem/ReplicationSystem.h`
- `Engine/Source/Runtime/Net/Iris/Private/Iris/ReplicationSystem/ReplicationSystem.cpp`
- `Engine/Config/BaseEngine.ini`

### 13.2 官方文档

- Introduction to Iris；
- Migrate to Iris；
- Iris Filtering；
- Iris Prioritization；
- Console Commands for Network Debugging。

文章以本地 5.7.4 源码为最终技术基线；官方页面若随当前版本变化，以正文标注的 5.7.4 行为为准。

## 14. 正确性边界

正文不得：

- 把插件启用、CVar 打开和 NetDriver 使用 Iris 视为同一件事；
- 声称命令行 `-UseIrisReplication=1` 能越过 `bCanUseIris=false`；
- 声称控制台 CVar 能热切换已有 NetDriver；
- 把同一个 NetDriver 内 Iris / Legacy Actor 混用描述为支持模式；
- 把 Iris 与 Replication Graph 描述为可同时驱动同一个 NetDriver；
- 把 `ReplicationSystemId=0` 写成所有 PIE 会话固定的服务端 ID；
- 把示例调参写成跨项目最佳值；
- 把 `SupportsStructNetSerializerList` 当作消除警告的白名单；
- 把修改 ini 后已有 ReplicationSystem 的行为描述成必然热更新；
- 声称执行了 UE 编译、自动化测试或真实项目压测。

## 15. 验收标准

### 内容

- 大纲 16.1～16.6 全覆盖；
- 所有源码符号、路径和默认值经 UE 5.7.4 本地源码核对；
- 启用选择优先级完整且无热切换误导；
- 三份配置均自洽、可复制、明确替换项和验证项；
- 文章来源、官方文档和本地源码入口完整；
- Part 15 导航与统一 Post 更新。

### 静态检查

- HTML 只有一个 `h1`；
- 13 个 H2 的 id 唯一，目录锚点全部存在；
- 内部 `/html-articles/.../` 链接可解析；
- 无 mojibake、空链接、外部脚本或失配标签；
- 桌面和移动布局都不横向溢出；
- 键盘焦点和 `prefers-reduced-motion` 可用。

### 构建与浏览器

- Hexo 生成成功；
- `/html-articles/ue5-iris-guide-part-16/` 返回正常；
- `/ue5-iris-guide/` 包含 Part 16 链接与摘要；
- Part 15 下一篇链接进入 Part 16；
- 桌面和移动视口检查 Hero、目录、表格、代码块、底部导航；
- 控制台无脚本错误。
