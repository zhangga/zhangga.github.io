# UE5 Iris 技术分析第十七部分：高级主题设计规格

## 1. 目标

根据《UE5 Iris 网络复制系统技术分析指南》大纲，补充第十七部分“高级主题”，覆盖：

- 17.0 自定义决策、难度分级与源文件地图；
- 17.1 自定义 `UNetObjectFilter` 的生命周期、隐身系统案例、配置、分配、性能与排障；
- 17.2 自定义 `UNetObjectPrioritizer` 的生命周期、战斗优先级案例，以及 Filter 与 Prioritizer 的协作；
- 17.3 自定义 `FReplicationFragment` 的职责、Traits、注册链与 GameplayAbilities 源码案例；
- 17.4 千人规模下的对象、CPU、带宽与分区策略；
- 17.5 GAS、网络物理与 AI 的集成边界；
- 17.6 复盘、检查表、故障矩阵、学习路径和 UE 5.7.4 源文件索引。

交付物：

- 独立长篇 HTML：`/html-articles/ue5-iris-guide-part-17/`；
- Part 16 底部导航链接到 Part 17；
- 统一系列入口 `/ue5-iris-guide/` 增加 Part 17 链接与摘要；
- Part 17 底部保留“第十八部分：最佳实践与实战案例”占位；
- 不创建体量较小的 `ue5-iris-guide-part-17.md`；
- 技术基线为本地 Unreal Engine 5.7.4 源码；
- 明确区分“引擎公开契约”“引擎内部实现”“项目级架构建议”。

## 2. 用户授权与默认决策

用户要求所有选项都采用推荐方案，不再逐项询问。因此，本规格视为已批准以下决定：

- 采用“先做扩展决策，再讲扩展实现”的叙事；
- 用“门禁—分诊—包裹”分别解释 Filter、Prioritizer、Fragment，但技术正文以源码契约为准；
- 代码分为“可直接采用的引擎 API”“可编译方向骨架”“明确标注的项目伪代码”三类；
- 不虚构可直接访问 gameplay UObject 的公共 Filter API；
- 不把网络分片、确定性物理或 AI 代理描述成 Iris 自动提供的能力；
- 视觉继续使用暖纸、深蓝、橙色系列语言，Hero 背景字改为 `EXTEND`；
- 只用 HTML/CSS 信息图，不生成装饰性图片；
- 设计规格与实施计划分别提交；
- 正文实施完成后保持未提交，等待用户后续明确要求 `commit`；
- 不修改、不编译本地 Unreal Engine 源码；
- 不声称运行了 UE 自动化测试、游戏项目编译或真实千人压测。

## 3. 方案比较

### 3.1 方案 A：按三个基类逐项翻译 API

依次列出 `UNetObjectFilter`、`UNetObjectPrioritizer`、`FReplicationFragment` 的函数。

优点是接近头文件；缺点是读者容易在不了解成本和替代方案时直接继承基类，也无法回答“什么时候不该自定义”。

### 3.2 方案 B：用隐身、战斗、技能三个案例贯穿

把三个扩展点分别包装成完整 Gameplay 案例。

优点是直观；缺点是项目业务模型会掩盖引擎契约，容易出现貌似完整、实际无法在通用项目中编译的代码。

### 3.3 方案 C：决策门 → 批处理契约 → 项目组合（采用）

主线：

```text
业务需求
  → 先判断内置机制是否足够
  → 选择 Filter / Prioritizer / Fragment 中最窄的扩展点
  → 按批处理生命周期实现
  → 配置注册并给对象分配
  → 用规模化指标验证
  → 最后与 GAS / Physics / AI 组合
```

该方案同时回答“为何扩展、扩展哪里、如何接入、怎样证明值得”，并能严格标注公开接口和项目补全点，因此采用。

## 4. 核心结论

### 4.1 Filter、Prioritizer、Fragment 不在同一阶段

```text
连接 / Group / Dynamic Filter
  → 得到本连接的可见对象集合
  → dirty / resend 候选
  → Prioritizer 写入或抬高优先级
  → 带宽预算选择
  → Fragment / Serializer 采集、量化、发送
  → 接收端 Fragment 应用状态和回调
```

- Filter 回答“能不能发给这个连接”；
- Prioritizer 回答“有资格时先发谁”；
- Fragment 回答“Gameplay 状态如何进入和离开复制系统”。

Prioritizer 不能救回已被 Filter 排除的对象；Fragment 也不应该承担相关性和调度策略。

### 4.2 自定义难度与维护成本

| 层级 | 推荐动作 | 典型需求 | 风险 |
| --- | --- | --- | --- |
| L0 | 配置现有 Filter / Prioritizer | 空间相关性、Owner Boost | 参数误配 |
| L1 | Connection / Group / Static Priority | 队伍、频道、固定受众 | 生命周期遗漏 |
| L2 | 自定义动态 Filter | 频繁变化的按连接可见性 | 每连接 CPU |
| L3 | 自定义 Prioritizer | 项目特有的战斗价值排序 | 饥饿、尺度失控 |
| L4 | 自定义 Fragment / Serializer | 特殊状态布局和回调 | 协议、量化、GC、兼容 |
| L5 | 自定义 Bridge / DataStream | 非标准对象生命周期或传输语义 | 引擎级维护 |

推荐顺序必须从低层向高层升级，而不是从大纲顺序反推所有项目都要定制。

## 5. 17.1 自定义 Filter

### 5.1 决策树

```text
只给 Owner？
  → ToOwnerFilterHandle
固定少量连接？
  → Connection Filter
大量对象共享受众？
  → Group Filter
空间范围？
  → NetObjectGridFilter
规则依赖对象 × 连接且频繁变化？
  → 最后才考虑自定义 Dynamic Filter
```

UE 官方资料明确说明 Dynamic Filter 每次都会运行，相比 Connection / Group Filter 有明显 CPU 成本；一个对象同时只能设置一个 Dynamic Filter。

### 5.2 UE 5.7.4 生命周期

必须覆盖：

- `OnInit` / `OnDeinit`；
- `OnMaxInternalNetRefIndexIncreased`；
- `AddConnection` / `RemoveConnection`；
- `AddObject` / `RemoveObject`；
- `UpdateObjects`；
- `PreFilter`；
- 每连接、可能分批多次调用的 `Filter`；
- `PostFilter`；
- `ENetFilterTraits::Spatial` 与 `NeedsUpdate`。

`FNetObjectFilteringInfo` 只有 8 字节且初始清零，适合保存小索引或偏移，不适合塞入完整 gameplay 状态。

### 5.3 `Filter()` 输出契约

- `OutAllowedObjects` 入参内容未定义；
- Filter 必须为自己负责的对象显式设位或清位；
- `FilteredObjects` 表示分配给当前 Filter 的对象；
- `ConnectionId` 和 `View` 是当前连接上下文；
- `GroupFilteredOutObjects` 可用于避免重复处理已被 Group 排除的对象；
- 实现应批处理 bit array，避免在内层循环中进行对象查找、分配、日志和昂贵 gameplay 查询。

### 5.4 隐身系统案例

案例目标：

- 自己始终可见；
- 队友可见；
- 敌方仅在被侦测时可见；
- 观战连接按项目规则处理。

正文分三层：

1. gameplay 权威状态：阵营、隐身、侦测结果；
2. Filter 缓存：对象分类索引与按连接可见集合；
3. 批处理：`PreFilter` 构建快照，`Filter` 只做集合运算。

示例不使用引擎私有 `GetReplicationSystemInternal()` 作为项目依赖。若演示状态缓冲区，必须注明它是量化后的内部网络表示，需要通过 RepTag、Descriptor 和对应 NetSerializer 正确解量化。

### 5.5 注册与分配

注册：

```ini
[/Script/IrisCore.NetObjectFilterDefinitions]
+NetObjectFilterDefinitions=(FilterName=Stealth,ClassName=/Script/MyGame.StealthNetObjectFilter,ConfigClassName=/Script/MyGame.StealthNetObjectFilterConfig)
```

分配：

```cpp
const UE::Net::FNetObjectFilterHandle Handle =
    ReplicationSystem->GetFilterHandle(TEXT("Stealth"));

if (Handle != UE::Net::InvalidNetObjectFilterHandle)
{
    ReplicationSystem->SetFilter(ObjectHandle, Handle);
}
```

必须补充失败路径、对象已经开始复制的前置条件，以及动态 Filter 不能覆盖 Connection / Group 已经排除的结果。

## 6. 17.2 自定义 Prioritizer

### 6.1 优先级不是 0～1 归一化概率

UE 5.7.4 契约：

- 优先级必须至少为 `0.0f`；
- `< 1.0f` 表示本网络 tick 暂不进入复制候选；
- `>= 1.0f` 表示若对象有变化，则可进入候选；
- 值可以大于 1；
- 优先级跨网络 tick 累积，发送成功后重置；
- 带宽和其他约束仍可能让高优先级对象本帧不发送；
- 多个来源共同作用时，Prioritizer 必须保留已有值，只能用更高值更新。

因此示例必须使用：

```cpp
Params.Priorities[ObjectIndex] =
    FMath::Max(Params.Priorities[ObjectIndex], CalculatedPriority);
```

### 6.2 生命周期

覆盖：

- `Init` / `Deinit`；
- `OnMaxInternalNetRefIndexIncreased`；
- `AddConnection` / `RemoveConnection`；
- `AddObject` / `RemoveObject`；
- `UpdateObjects`；
- `PrePrioritize`；
- 每连接、可能分批调用的 `Prioritize`；
- `PostPrioritize`。

`FNetObjectPrioritizationInfo` 同样只有 8 字节，正文强调“小句柄指向 SoA 缓存”的推荐布局。

### 6.3 战斗优先级案例

推荐模型：

```text
基础值
  + owner boost
  + 交战中 boost
  + 目标锁定 boost
  + 近期受伤 boost
  + 距离 / 视锥衰减
  → Clamp 到项目上限
  → Max(已有优先级, 计算值)
```

案例明确：

- `FReplicationView` 可能包含多个 View，不能假定只有一个本地玩家；
- 快照更新放在 `UpdateObjects` / `PrePrioritize`；
- `Prioritize` 内不做射线检测、Tag 查询或 GameplayEffect 遍历；
- 高值改变竞争顺序，不会增加连接总带宽；
- 用最小保底、累积机制和饥饿指标验证远端非战斗对象。

### 6.4 注册与失败回退

```ini
[/Script/IrisCore.NetObjectPrioritizerDefinitions]
+NetObjectPrioritizerDefinitions=(PrioritizerName=Combat,ClassName=/Script/MyGame.CombatNetObjectPrioritizer,ConfigClassName=/Script/MyGame.CombatNetObjectPrioritizerConfig)
```

若 `GetPrioritizerHandle` / `SetPrioritizer` 失败，回退到经过验证的静态优先级，而不是静默让对象失去调度策略。

## 7. 17.3 自定义 ReplicationFragment

### 7.1 定位

`FReplicationFragment` 绑定一个或多个 ReplicationState 与 Gameplay Owner，负责：

- 发送端从 gameplay 采集状态；
- 接收端应用状态；
- 可选的 owner 收集、RepNotify、轮询和调试输出；
- 通过 Traits 向 ReplicationSystem 声明能力与生命周期。

### 7.2 Traits

正文按四组解释：

- 方向：`CanReplicate`、`CanReceive`；
- 生命周期：`DeleteWithInstanceProtocol`；
- 状态形态：`HasPersistentTargetStateBuffer`、`SupportsPartialDequantizedState`；
- 回调与脏标记：`NeedsPoll`、`HasPushBasedDirtiness`、`HasFullPushBasedDirtiness`、`HasRepNotifies`、`NeedsLegacyCallbacks`、`KeepPreviousState`。

必须指出 `HasInterpolation` 在 5.7.4 头文件中仍标记为 “Not implemented”，不把它当作可用插值框架。

### 7.3 推荐升级路径

```text
普通 UPROPERTY
  → FReplicationFragmentUtil / FPropertyReplicationFragment
FastArray
  → Iris FastArray 支持
特殊值编码
  → 自定义 NetSerializer
特殊采集 / 应用 / 回调
  → 自定义 ReplicationFragment
```

自定义 Fragment 是最后一层，不应为了“少写几个 UPROPERTY”而引入。

### 7.4 技能系统案例

不虚构简单的技能 Fragment，而是剖析 UE 5.7.4 GameplayAbilities 内置真实案例：

- `FMinimalGameplayCueReplicationProxyReplicationFragment`；
- `CreateAndRegisterMinimalGameplayCueReplicationProxyReplicationFragment`；
- `UE_NET_IMPLEMENT_NAMED_STRUCT_NETSERIALIZER_WITH_CUSTOM_FRAGMENT_INFO`；
- 构造时继承 Context Traits 并加上 `DeleteWithInstanceProtocol`；
- 发送端通过 `FPropertyReplicationState` 轮询；
- 接收端通过 Serializer 解量化到持久目标缓冲；
- `CollectOwner` / `CallRepNotifies` 衔接 legacy 回调；
- Fragment 负责特殊应用语义，Serializer 负责位流表示。

正文只给关键骨架和调用链，完整实现引导读者阅读本地源码，避免复制大段 Epic 源码。

## 8. 17.4 大规模多人优化

### 8.1 不把“1000 在线”简化成单个数字

至少拆成：

```text
注册对象总数 N
× 每连接可见比例 R
× 每 tick 变化比例 D
× 平均序列化位数 B
× 连接数 C
```

CPU 还要分解为 Poll、Filter、Prioritize、Serialize、Write、Apply；内存还包括协议、状态缓冲、每连接 scope、baseline 和 history。

### 8.2 推荐优化顺序

1. 控制复制对象和 Fragment 数量；
2. Push Model / 降低无效 Poll；
3. 先用 Streaming Level / Connection / Group / Grid 缩小 scope；
4. 再对剩余候选做 Prioritization；
5. 调整 update frequency、delta compression 和 packet budget；
6. 用 Timing Insights、Networking Insights、CSV 和 Iris 调试命令验证；
7. 最后才评估自定义批处理和更深引擎扩展。

### 8.3 分片边界

Iris 是一个 ReplicationSystem 内的复制框架，不是跨服务器分片、迁移和一致性系统。千人级世界通常还需要：

- 区域服 / 实例服；
- 玩家迁移与会话接力；
- 跨区消息和持久化；
- 观战、队伍、全局事件的跨分片投影。

正文将这些标为项目后端 / 在线架构职责，只讨论它们如何影响 Iris 对象边界。

## 9. 17.5 Gameplay 系统集成

### 9.1 GAS

- 继续使用 GAS 自身的权威、PredictionKey、GameplayEffect、GameplayCue 与复制模式；
- Iris 负责兼容的状态复制和专用 NetSerializer / Fragment，不取代 GAS 预测；
- 先验证属性、Tag、Active GameplayEffect、GameplayCue、Montage、TargetData 和 EffectContext；
- 本地 5.7.4 中 `AbilitySystem.Fix.ReplicateTagCountContainerWithIris` 默认值为 `false`，不得无验证地改成生产推荐；
- 对 owner-only、minimal 和 mixed replication mode 分别做服务端、拥有者和模拟代理矩阵测试。

### 9.2 网络物理

- Iris 负责传送权威状态，不等于自动获得物理预测；
- UE 5.7.4 网络物理另有 Default Replication、Predictive Interpolation 和 Resimulation 等模式；
- 关键帧、输入历史、重模拟、误差校正和渲染插值属于网络物理策略；
- Filter / Prioritizer 只能决定可见性和调度，不能修复错误的模拟模型；
- “确定性物理”是项目约束，不作 Iris 保证。

### 9.3 AI

推荐分层：

- 服务器保有完整感知、行为树、导航与决策；
- 客户端复制可观察结果：姿态、目标、动画意图、战斗阶段；
- 远距离 AI 用低频状态和表现代理；
- 不把安全敏感的感知结果或隐藏目标复制给无权连接；
- 客户端代理只做表现和预测，不成为权威 AI。

## 10. 页面结构

HTML 使用 13 个 H2：

1. `decision-gate`
2. `extension-map`
3. `filter-contract`
4. `stealth-filter`
5. `filter-performance`
6. `prioritizer-contract`
7. `combat-prioritizer`
8. `filter-priority-pipeline`
9. `fragment-contract`
10. `gameplay-fragment`
11. `scale`
12. `gameplay-integration`
13. `checklist`

桌面和移动目录均指向同一组锚点。

## 11. 视觉设计

延续 Part 16：

- 暖纸背景；
- 深蓝标题和结构线；
- 橙色高亮；
- 等宽字体承载源码符号；
- Hero 背景字 `EXTEND`；
- 卡片、表格、管线图、阶梯图和决策树均使用纯 HTML/CSS；
- 不依赖外部字体、图片或 JavaScript；
- 代码块和表格局部横向滚动，页面本身不横向溢出；
- 支持键盘焦点、`prefers-reduced-motion` 和打印样式。

核心信息图：

- “最窄扩展点”决策梯；
- Filter 生命周期；
- Prioritizer 分数合成器；
- Filter → Priority → Budget → Fragment 管线；
- Fragment Traits 矩阵；
- 千人规模乘法模型；
- GAS / Physics / AI 职责边界。

## 12. 技术依据

### 12.1 本地 UE 5.7.4 源码

- `Engine/Build/Build.version`
- `Engine/Source/Runtime/Net/Iris/Public/Iris/ReplicationSystem/Filtering/NetObjectFilter.h`
- `Engine/Source/Runtime/Net/Iris/Public/Iris/ReplicationSystem/Filtering/NetObjectFilterDefinitions.h`
- `Engine/Source/Runtime/Net/Iris/Private/Iris/ReplicationSystem/Filtering/ReplicationFiltering.cpp`
- `Engine/Source/Runtime/Net/Iris/Public/Iris/ReplicationSystem/Prioritization/NetObjectPrioritizer.h`
- `Engine/Source/Runtime/Net/Iris/Private/Iris/ReplicationSystem/Prioritization/NetObjectPrioritizerDefinitions.h`
- `Engine/Source/Runtime/Net/Iris/Private/Iris/ReplicationSystem/Prioritization/SphereNetObjectPrioritizer.cpp`
- `Engine/Source/Runtime/Net/Iris/Public/Iris/ReplicationSystem/ReplicationFragment.h`
- `Engine/Source/Runtime/Net/Iris/Public/Iris/ReplicationSystem/ReplicationFragmentUtil.h`
- `Engine/Source/Runtime/Net/Iris/Public/Iris/ReplicationSystem/TypedReplicationFragment.h`
- `Engine/Plugins/Runtime/ReplicationSystemTestPlugin/.../MockNetObjectFilter.*`
- `Engine/Plugins/Runtime/ReplicationSystemTestPlugin/.../MockNetObjectPrioritizer.*`
- `Engine/Plugins/Runtime/GameplayAbilities/.../MinimalGameplayCueReplicationProxyReplicationFragment.cpp`
- `Engine/Plugins/Runtime/GameplayAbilities/.../GameplayTagCountContainerNetSerializer.cpp`
- `Engine/Source/Runtime/Engine/Public/Physics/NetworkPhysicsSettingsComponent.h`

### 12.2 Epic 官方资料

- Introduction to Iris；
- Components of Iris；
- Iris Filtering；
- Iris Prioritization；
- Migrate to Iris；
- Gameplay Ability System Overview。

官方站点当前页面可能默认显示更新版本，因此正文只把官方资料用作概念与公开入口，所有具体函数、Traits、路径和默认值均以本地 5.7.4 源码复核。

## 13. 事实边界与禁写项

不得：

- 把 Dynamic Filter 写成首选方案；
- 声称一个对象能同时挂多个 Dynamic Filter；
- 声称 Dynamic Filter 可以重新放行 Connection / Group 已排除的对象；
- 把 `OutAllowedObjects` 当成已初始化输入；
- 把 Prioritizer 描述成 0～1 概率；
- 覆盖已有优先级而不取最大值；
- 声称高优先级会增加总带宽或保证本帧发送；
- 在热路径示例中每对象做 UObject 查找、日志、射线或容器分配；
- 把量化 StateBuffer 当作原始 gameplay struct 直接转换；
- 把 `HasInterpolation` 写成 5.7.4 可用功能；
- 把 Fragment、NetSerializer、Filter 的职责混为一体；
- 把 Iris 描述成 GAS 预测、网络物理重模拟、AI 决策或服务器分片系统；
- 把概念代码声称为已在真实项目编译通过；
- 声称执行了 UE 自动化测试或千人压测。

## 14. 验收标准

### 内容

- 大纲 17.0～17.6 全覆盖；
- 三个扩展点的阶段、生命周期、状态契约和配置方式准确；
- Filter 决策树明确建议先用更便宜的内置机制；
- Prioritizer 正确说明 1.0 阈值、累积和 max 规则；
- Fragment 使用 UE 5.7.4 GameplayAbilities 真实实现作依据；
- 规模化章节包含 CPU、带宽、内存和分片边界；
- GAS / Physics / AI 不越过各自系统职责；
- Part 16、Part 17、系列 Post 链接闭环；
- 来源、原创扩写和技术基线完整。

### 静态检查

- 只有一个 `h1`；
- 13 个唯一 H2 id；
- 桌面和移动目录锚点全部存在；
- 内部链接可解析；
- 外部链接使用 `target="_blank"` 与 `rel="noopener noreferrer"`；
- 无空链接、mojibake、外部脚本和标签失配；
- 桌面和移动布局无页面级横向溢出；
- 支持键盘焦点、reduced motion 和打印。

### 构建与浏览器

- Hexo 构建成功；
- `/html-articles/ue5-iris-guide-part-17/` 可访问；
- `/ue5-iris-guide/` 包含 Part 17 链接和摘要；
- Part 16 下一篇进入 Part 17；
- Part 17 上一篇返回 Part 16；
- 桌面和移动端 Hero、目录、表格、代码、信息图和章节导航正常；
- 页面脚本控制台无 error / warning。
