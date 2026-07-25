# UE5 Iris 技术分析第十五部分：调试与性能分析设计规格

## 1. 目标

根据《UE5 Iris 网络复制系统技术分析指南》大纲，补充第十五部分“调试与性能分析”，覆盖：

- 15.1 调试与性能分析的必要性、常见复制问题和关键源码入口；
- 15.2 Iris 日志类别、七档日志级别、采集方法与日志分析；
- 15.3 `IrisDebugHelper`、对象查询命令和 Unreal Insights；
- 15.4 `IrisProfiler`、Iris CSV、`NetStats` / `NetStatsContext` 与性能指标；
- 15.5 `IrisMemoryTracker`、LLM 标签和内存增长分析；
- 15.6 对象不复制、属性不同步和性能瓶颈的标准排查流程；
- 15.7 开发、测试、发布检查清单和命令速查。

成果包括：

- 独立长篇 HTML：`/html-articles/ue5-iris-guide-part-15/`；
- 在统一系列入口 `/ue5-iris-guide/` 中增加第十五部分链接与摘要；
- 将 Part 14 底部“下一篇”占位更新为 Part 15 链接；
- 不创建体量较小的 `ue5-iris-guide-part-15.md`；
- 技术基线使用本地 Unreal Engine 5.7.4 源码；
- 标明文章来源、Epic Games 官方资料与源码依据。

## 2. 用户授权与默认决策

用户要求所有选项采用推荐方案，不再询问。因此本规格视为用户已经批准以下决策：

- 采用“症状 → 单对象身份 → 单连接资格 → 调度与写入 → 接收与应用 → CPU/流量/内存”的证据链叙事；
- 使用“敌人在某个客户端偶发消失，生命值也偶尔不同步”作为贯穿案例；
- 将 UE 5.7.4 新增且信息密度更高的 `Net.Iris.PrintNetInfoOfObject` 作为单对象下钻核心命令；
- 将普通 Unreal 日志、Iris 对象命令、Timing Insights、Networking Insights、CSV 和 LLM 明确分工；
- 保留 Part 14 的暖纸、深蓝与橙色视觉系统，Hero 背景字改为 `EVIDENCE`；
- 使用 HTML/CSS 信息图，不生成装饰性图片；
- 设计规格与实施计划分别提交；
- 正文实施完成后保持未提交，等待用户单独要求 `commit`；
- 不修改、不编译本地 Unreal Engine 源码；
- 不声称执行了 UE 自动化测试。

## 3. 方案比较

### 3.1 方案 A：命令目录

按日志、控制台命令、Insights、CSV 和 LLM 逐条介绍。

优点是便于查命令；缺点是读者拿到大量工具后仍不知道先看什么，也容易在没有复现窗口、连接编号和对象身份的情况下制造大量无关日志。

### 3.2 方案 B：Profiler 使用手册

把重点放在 Unreal Insights、Networking Insights、CSV Profiler 和 Memory Insights 的界面与采集入口。

优点是性能分析完整；缺点是对“对象为什么消失”“属性为什么没同步”帮助有限，且大纲中的 `IrisDebugHelper`、对象命令和日志会被弱化。

### 3.3 方案 C：故障证据链 + 分层工具箱（采用）

先把一次复制更新拆成可验证检查点：

```text
注册/身份
  → 对该连接 relevant
  → dirty / poll / condition 产生变化
  → prioritization / budget 获得发送机会
  → quantize / write 进入 packet
  → packet 到达并被解析
  → dequantize / apply / RepNotify
```

每一层只使用能回答该层问题的工具：

| 问题 | 首选工具 |
| --- | --- |
| 对象是否注册、NetRefHandle 是什么 | `PrintNetInfoOfObject` / `PrintReplicatedObjects` |
| 对某连接是否 relevant、为何被过滤 | `PrintNetInfoOfObject` / `PrintRelevantObjectsToConnection WithFilter` |
| 属性内部状态是什么 | `IrisDebugHelper` 状态输出、日志、断点 |
| 哪一阶段耗时 | Timing Insights / Iris CPU scopes |
| 哪个对象、属性或 RPC 占 bits | Networking Insights |
| 哪类对象长期消耗 CPU、数量、KBytes | Iris CSV / `NetStatsContext` |
| 内存增长归属 | LLM 的 Iris 标签，再下钻调用栈 |
| 丢包、时延、乱序下是否仍正确 | `NetEmulation.*` + 同一套 trace |

该方案同时提供排障顺序、性能度量和命令速查，因此采用。

## 4. 核心模型：调试是证明链

### 4.1 先固定复现条件

任何采集都先记录：

- Server / Client / Listen Server / Dedicated Server；
- PIE 实例与 `RepSystemId`；
- 目标 `ConnectionId`；
- 目标对象名、类和 `NetRefHandle`；
- 触发动作、起止时间或帧；
- 是否启用丢包、延迟等网络仿真；
- Build Configuration 和关键 CVar。

“服务器看得到对象”不能证明“目标连接 relevant”；“对象 relevant”不能证明“这一帧被调度写入”；“包里有数据”也不能证明“客户端已经应用”。正文必须坚持一层一证据。

### 4.2 贯穿案例

案例症状：

> 敌人 `BP_Enemy_C_2147482471` 在 Client 1 进入掩体附近后偶发消失；重新靠近后出现，但生命值偶尔仍是旧值。

排查顺序：

1. 用名称查出对象身份和 `NetRefHandle`；
2. 将观察范围缩到 `RepSystemId` 与 `ConnectionId`；
3. 查看 relevant、filter、cull distance 和 world location；
4. 查看 dirty、poll、condition 和 quantized state；
5. 检查 prioritizer、budget、delta compression 和 writer；
6. 在 Networking Insights 中确认对象/属性是否进入 outgoing packet；
7. 在客户端确认 incoming packet、state apply 和 RepNotify；
8. 若是偶发问题，用网络仿真建立稳定复现；
9. 若功能正确但代价高，再转到 Timing/CSV/LLM。

该案例最终不强行设定唯一根因，而是展示三种可区分结论：

- filter/cull 错误：对象不 relevant；
- dirty/condition 错误：对象 relevant，但成员没有产生可写变化；
- budget/packet/apply 问题：状态已产生，但在调度、传输或接收应用环节中断。

## 5. 15.1 为什么需要调试与性能分析

### 5.1 常见“隐形杀手”

- 对象只对部分连接消失；
- 对象存在但某个属性一直是旧值；
- 高频 poll 没有产生变化，形成 Poll Waste；
- relevant 对象太多，prioritization 和 write 预算持续超限；
- reliable / huge object 队列等待 ACK；
- 客户端创建对象、RepNotify 或 RPC 突发；
- 异步资源加载阻塞客户端复制；
- 连接数增加后 CPU、带宽或内存非线性增长；
- 在本机理想网络正常，在延迟、丢包、乱序下失败。

### 5.2 首先区分三类问题

| 类别 | 主要症状 | 第一指标 |
| --- | --- | --- |
| 正确性 | 对象缺失、属性过期、RPC 未执行 | identity / relevant / packet / apply |
| 性能 | 帧时间尖峰、服务器 CPU 上升 | phase time / per-type time / count |
| 容量 | 带宽、队列或内存随连接增长 | KBytes / pending / LLM tags |

正文不得在“对象没同步”时直接建议调 cull distance、priority 或 bandwidth CVar。先证明阻断点，再调整机制。

## 6. 15.2 日志系统

### 6.1 Iris 日志类别

UE 5.7.4 的公开基础类别：

- `LogIris`；
- `LogIrisFiltering`；
- `LogIrisNetCull`；
- `LogIrisFilterConfig`；
- `LogNetStats`。

源码内部还定义：

- `LogIrisRepNotify`；
- `LogIrisConditionals`；
- `LogIrisGroup`；
- `LogIrisRpc`；
- `LogIrisReferences`；
- `LogIrisChunkedDataStream`；
- `LogIrisDirtyTracker`。

正文要说明：部分内部类别以 `DEFINE_LOG_CATEGORY_STATIC` 定义，不能把它们都描述成稳定的公开诊断接口；实际是否有对应输出还受编译期 verbosity 限制。

### 6.2 七档有效日志级别

按严重性与细节递增说明：

1. `Fatal`
2. `Error`
3. `Warning`
4. `Display`
5. `Log`
6. `Verbose`
7. `VeryVerbose`

`All` 是类别编译期上限/配置用值，不作为第八种普通消息严重度。

### 6.3 启用方式

运行时控制台：

```text
log LogIris VeryVerbose
log LogIrisFiltering Verbose
```

启动参数：

```text
-LogCmds="LogIris VeryVerbose,LogIrisFiltering Verbose"
```

正文提醒：

- 从最小类别和最短复现窗口开始；
- 在采集记录中保存原始日志，而不是只截取“看起来可疑”的行；
- `VeryVerbose` 可能产生大量 I/O，不作为日常常开配置；
- 日志默认写入项目 `Saved/Logs`；
- Shipping 的编译裁剪和控制台可用性与开发构建不同。

## 7. 15.3 `IrisDebugHelper`

### 7.1 版本与构建边界

`IrisDebugging.h/.cpp` 的主要辅助能力位于 `#if !UE_BUILD_SHIPPING`。正文不得把这些断点能力作为 Shipping 线上诊断方案。

### 7.2 条件断点入口

- `Net.Iris.DebugName=<substring>`：对象名或类名包含匹配时断点；
- `Net.Iris.DebugRPCName=<substring>`：RPC 名包含匹配时断点；
- `Net.Iris.DebugNetRefHandle <id>`：指定句柄 ID；无参数关闭；
- `Net.Iris.DebugNetInternalIndex <index>`：指定内部索引；无参数关闭。

对应辅助函数：

- `BreakOnObjectName`；
- `BreakOnRPCName`；
- `BreakOnNetRefHandle`；
- `BreakOnInternalNetRefIndex`；
- `FilterDebuggedObject`。

名称匹配是 substring，不是正则表达式。

### 7.3 调试器可调用函数

文章介绍但不要求读者在 Gameplay 代码中依赖：

- `DebugNetObject` / `DebugNetObjectById`；
- `DebugNetRefHandle` / `DebugNetRefHandleById`；
- `DebugInternalNetRefIndex`；
- `DebugOutputNetObjectState`；
- `DebugNetObjectStateToString`；
- `DebugOutputNetObjectProtocolReferences`。

`DebugNetObjectStateToString` 展示 Iris 内部量化状态。返回字符串使用调试缓冲区，不应描述为线程安全或长期持有的业务 API。

## 8. 对象控制台命令

### 8.1 通用参数

`ObjectReplicationBridgeDebugging.cpp` 的多数命令支持：

- `RepSystemId=X`；
- `WithSubObjects`；
- `SortByClass`；
- `SortByNetRefHandle`。

连接相关命令支持：

- `ConnectionId=1,5,7`。

### 8.2 核心命令：`PrintNetInfoOfObject`

UE 5.7.4 中推荐先用：

```text
Net.Iris.PrintNetInfoOfObject FindByName=BP_Enemy_C_2147482471 RepSystemId=0 ConnectionId=1
```

还支持：

- `FindByClass=<class substring>`，包含继承关系；
- `FindById=<comma-separated NetRefHandle ids>`；
- `ConnectionId=<comma-separated ids>`。

它可输出的证据包括：

- 对象及量化 state；
- 各连接 relevant 状态；
- ReplicationWriter / ReplicationReader 信息；
- prioritizer priority；
- delta compression 状态；
- world location 与 cull distance；
- filter 信息；
- parent / child dependents；
- creation dependencies。

它是单对象深挖入口，不替代全局清单和 trace。

### 8.3 清单命令

- `Net.Iris.PrintReplicatedObjects`；
- `Net.Iris.PrintRelevantObjects`；
- `Net.Iris.PrintRelevantObjectsToConnection ConnectionId=1 WithFilter`；
- `Net.Iris.PrintAlwaysRelevantObjects`；
- `Net.Iris.PrintNetCullDistances NumClasses=20`；
- `Net.Iris.PrintPushBasedStatuses`；
- `Net.Iris.PrintDynamicFilterClassConfig`；
- `Net.Iris.PrintDynamicFilterClassConfigIssues`。

正文按“问题 → 命令 → 预期证据”组织，不把完整会话对象列表当成常规第一步。

## 9. Unreal Insights 与 NetTrace

### 9.1 两副镜头

| 工具窗口 | 回答的问题 |
| --- | --- |
| Timing Insights | Iris 的哪个 CPU phase 慢、在哪个线程、持续多久 |
| Networking Insights | 哪个 connection、packet、object、property 或 RPC 使用了多少 bits |

`IrisProfiler` 宏默认映射到 `TRACE_CPUPROFILER_EVENT_SCOPE`，因此它是埋点层，不是独立的 Iris Profiler 应用。

### 9.2 NetTrace 采集

UE 5.7 官方入口：

```text
-trace=net -NetTrace=1 -tracehost=localhost
```

`ENetTraceVerbosity`：

- 0 `None`；
- 1 `Trace`；
- 2 `Verbose`；
- 3 `VeryVerbose`。

运行时还可用：

```text
NetTrace.SetTraceVerbosity 1
```

高 verbosity 会产生更多数据。非 Shipping / Test 编译期上限默认可到 `VeryVerbose`，Shipping / Test 默认到 `Verbose`。

### 9.3 Networking Insights 读图边界

- Packet Overview：包时间线、大小、丢包；
- Packet Content：object / property / RPC 层级内容；
- Connection Selection：实例、连接、incoming / outgoing；
- Net Stats：选区内事件的 total / max / inclusive / exclusive bits；
- Net Stats Counters：frame stats 与 packet stats。

官方文档明确 Packet Overview 报告的是压缩前大小，不能直接当作最终线上 wire bytes。

## 10. 15.4 Iris 性能分析

### 10.1 三类 KPI

| 维度 | 示例 | 用途 |
| --- | --- | --- |
| 时间 | PollMS、QuantizeMS、WriteMS | 哪一阶段吃 CPU |
| 数量 | PollCount、WriteCount、ReplicatedObjectCount | 时间上涨是否由规模驱动 |
| 数据量 | WriteKBytes、WriteWasteKBytes | CPU 是否转化成有效网络数据 |

只看 `ms` 不能判断优化方向。正文使用：

```text
单位成本 = phase time / object count
有效率 = useful write / scheduled or attempted write
每连接成本 = total cost / active replicating connections
```

这些是分析比率，不声称是引擎内置同名统计项。

### 10.2 Iris CPU scopes

主要 phase：

- `ReplicationSystem_NetUpdate`；
- `ReplicationSystem_UpdateWorldLocations`；
- `ReplicationSystem_UpdateFiltering`；
- `ReplicationSystem_UpdateConditionals`；
- `ReplicationSystem_UpdatePrioritization`；
- `ReplicationSystem_PropagateDirtyChanges`；
- `ReplicationSystem_QuantizeDirtyStateData`；
- `ReplicationSystem_UpdateDataStreams`；
- `ReplicationSystem_PostSendUpdate`；
- `ReplicationBridge_PreUpdate`；
- `ReplicationBridge_PollAndCopy`；
- `ReplicationPollAndCopyTask`。

正文用一张阶段流水线说明 phase 间因果，不把 scope 名单写成调用栈的完整替代品。

### 10.3 Iris CSV 与 `NetStats`

采集：

```text
CsvProfile Start
CsvProfile Stop
CsvProfile Frames=600
```

CSV Profiler 输出目录是项目 `Saved/Profiling/CSV`。

Iris 主类别和按类型类别：

- `Iris`；
- `IrisPreUpdateMS` / `Count`；
- `IrisPollMS` / `Count`；
- `IrisPollWasteMS` / `Count`；
- `IrisQuantizeMS` / `Count`；
- `IrisWriteMS` / `Count` / `KBytes`；
- `IrisWriteWasteMS` / `Count` / `KBytes`；
- `IrisWriteCreationInfoCount` / `KBytes`；
- `IrisWriteExportsCount`。

客户端类别：

- `IrisClient`；
- `IrisClientDetailObjectCreate`；
- `IrisClientDetailRepNotify`；
- `IrisClientDetailRPC`；
- `IrisClientBlockedByAsyncLoading`。

客户端详细统计开关：

```text
net.Iris.EnableDetailedClientProfiler 1
```

该详细能力默认不面向 Shipping。

### 10.4 `NetStatsContext`

`FNetTypeStats`：

- 为并行任务分配 child contexts；
- 工作结束后汇总到 parent context；
- 默认把 SubObject 统计归入 root object type；
- 可用 `net.Iris.Stats.ShouldIncludeSubObjectWithRoot=0` 将 SubObject 分开归类。

发送统计还包含：

- 平均 scheduled / replicated root object count；
- 平均 replicated object count；
- delta compressed object count；
- replicating connection count；
- huge object active / waiting / stalling；
- pending objects / dependencies / huge object send queue。

正文明确：这些类型统计仅在 CSV capture 激活且对应编译支持存在时收集。

### 10.5 Waste 的含义

- Poll Waste：花费 poll 成本，但没有生成有效变化；
- Write Waste：尝试写入，但被 mask / budget / scope 等原因浪费；
- scheduled ≫ replicated：候选工作远高于实际写入；
- creation info / export 突发：大量新对象或引用首次出现；
- huge object wait / stall：大对象或可靠窗口阻塞。

“Waste” 是定位信号，不自动等于 bug。静态但必须轮询的类型也可能有可解释成本。

## 11. 15.5 内存分析

### 11.1 Iris LLM 标签

`IrisMemoryTracker.cpp` 在 UE 5.7.4 中定义：

```text
Iris
├─ State
├─ Initialization
├─ Connection
└─ NetTokenStructState
```

源码唯一名分别为：

- `Iris`；
- `IrisState`；
- `IrisInitialization`；
- `IrisConnection`；
- `NetTokenStructState`。

这些标签汇总到 Networking summary。

### 11.2 采集入口

启动：

```text
-LLM
-LLMCSV
```

运行时：

```text
stat LLM
stat LLMFULL
DumpLLM
```

LLM CSV 默认写入 `Saved/Profiling/LLM`，间隔可用 `LLM.LLMWriteInterval` 调整。

### 11.3 解释规则

- `State` 随复制对象数增长：先按 active object count 归一化；
- `Connection` 随连接数增长：先计算 per-connection slope；
- `Initialization` 加载后应趋稳：持续增长才值得下钻；
- `Iris` 父标签上涨：检查哪个子标签贡献；
- `NetTokenStructState` 上涨：关联 token / struct state 的规模和生命周期。

标签只能告诉“内存记到哪一类”，不能单独证明泄漏。必须结合：

- 稳态基线；
- 对象数、连接数和 token 数；
- 场景卸载或断连后的回落；
- Memory Insights allocation query / callstack。

LLM 官方文档说明 Shipping 中完全禁用，正文需标注构建边界。

## 12. 15.6 标准排障流程

### 12.1 对象不复制

```text
对象存在？
→ 注册到 Iris？
→ 目标 connection 有效？
→ relevant？
→ filter / cull / group / owner 原因？
→ 获得 priority 与 budget？
→ outgoing packet 有对象？
→ incoming packet 到达并创建？
```

首选命令：

```text
Net.Iris.PrintNetInfoOfObject FindByName=<name> RepSystemId=<id> ConnectionId=<id>
Net.Iris.PrintRelevantObjectsToConnection RepSystemId=<id> ConnectionId=<id> WithFilter
```

### 12.2 属性不同步

```text
服务端值改变？
→ dirty / poll 捕捉？
→ member condition 允许该 connection？
→ quantized state 改变？
→ change mask 写入？
→ packet 中有该 property？
→ 客户端 dequantize / apply？
→ RepNotify 是否触发？
```

`PrintPushBasedStatuses` 用来核对类是否完全 Push Based；不能用它证明某一次具体 mutation 已正确 `MARK_PROPERTY_DIRTY`。

### 12.3 性能瓶颈

```text
Timing Insights 找慢 phase
→ CSV 用 time + count + KBytes 判断规模或单位成本
→ NetStats 按类型找贡献者
→ Networking Insights 验证实际 packet content
→ LLM 检查容量成本
→ 用同一复现场景做修改前后对比
```

## 13. 网络仿真

UE 5.7.4 非 Shipping 的 `NetEmulation` 命令：

- `NetEmulation.PktLoss <0-100>`；
- `NetEmulation.PktLag <ms>`；
- `NetEmulation.PktLagVariance <ms>`；
- `NetEmulation.PktOrder <0|1>`；
- `NetEmulation.PktDup <0-100>`；
- `NetEmulation.PktIncomingLoss <0-100>`；
- `NetEmulation.PktIncomingLagMin <ms>`；
- `NetEmulation.PktIncomingLagMax <ms>`；
- `NetEmulation.PktJitter <ms>`；
- `NetEmulation.Off`。

RPC 专项：

- `NetEmulation.DropAnyUnreliable [percent]`；
- `NetEmulation.DropUnreliableRPC <name substring> [percent]`；
- `NetEmulation.DropUnreliableOfActorClass <class substring> [percent]`；
- `NetEmulation.DropUnreliableOfSubObjectClass <class substring> [percent]`；
- `NetEmulation.DropNothing`。

正文不推荐一开始同时叠加 lag、loss、order 和 duplication。一次改变一个变量，记录 seed/配置、重复次数和通过标准。

## 14. 文章结构

正文使用 13 个二级章节：

1. `#evidence-chain`：调试不是猜 CVar，而是建立证据链；
2. `#tool-map`：问题与工具的分工地图；
3. `#checkpoints`：一次复制更新的七个检查点；
4. `#symptoms`：15.1 常见症状、复现卡和源码索引；
5. `#logging`：15.2 日志类别、七档 verbosity 和采集纪律；
6. `#debug-helper`：15.3 `IrisDebugHelper` 条件断点与调试器函数；
7. `#object-commands`：对象命令与 `PrintNetInfoOfObject` 单对象下钻；
8. `#insights`：Timing Insights 与 Networking Insights 双镜头；
9. `#csv-netstats`：15.4 IrisProfiler、CSV、NetStats 与三维 KPI；
10. `#waste`：Poll/Write Waste、预算和按类型归因；
11. `#memory`：15.5 `IrisMemoryTracker` 与 LLM 标签；
12. `#runbooks`：15.6 三套排障 Runbook；
13. `#practice`：网络仿真、15.7 检查清单、命令速查、来源与总结。

桌面和移动目录各包含上述 13 项，锚点一一对应。

## 15. 视觉与交互

### 15.1 视觉系统

- 背景：暖纸色；
- 主色：深蓝；
- 强调色：橙红；
- 正常/证据成立：绿色；
- 待验证：琥珀色；
- 阻断/异常：红色；
- Hero 背景大字：`EVIDENCE`；
- 保留 Part 14 的衬线标题、无衬线正文和等宽源码字体。

### 15.2 信息图

至少包含：

- “症状不是结论”的证据阶梯；
- 问题与工具矩阵；
- 七检查点复制流水线；
- 日志 verbosity 阶梯；
- 单对象命令下钻卡；
- Timing / Networking Insights 双镜头；
- 时间 / 数量 / KBytes KPI 三角；
- Waste 决策矩阵；
- Iris LLM 标签树；
- 三套排障流程；
- 网络仿真实验表。

### 15.3 交互与可访问性

- 桌面 sticky TOC；
- 移动端 `<details>` TOC；
- 阅读进度条；
- 当前章节高亮；
- “回到顶部”按钮；
- `prefers-reduced-motion` 降级；
- 所有可聚焦元素有 `:focus-visible`；
- 横向表格和长管线放入可滚动 region，并允许键盘聚焦；
- 390px 宽度不得产生 body 横向滚动；
- 不依赖第三方 JavaScript 或字体服务。

## 16. 来源与源码索引

### 16.1 文章来源

- 第十五部分由 Jossy Zhang 根据系列大纲原创扩写；
- 大纲来源：
  `https://zhuanlan.zhihu.com/p/1996685633524089868`；
- 技术结论以本地 Unreal Engine 5.7.4 源码为准；
- Epic 官方文档用于公开工具入口和通用契约。

### 16.2 官方资料

- Logging in Unreal Engine 5.7；
- Networking Insights in Unreal Engine 5.7；
- Unreal Insights；
- Low-Level Memory Tracker in Unreal Engine 5.7；
- Memory Insights；
- Testing and Debugging Networked Games。

### 16.3 关键源码

```text
Engine/Source/Runtime/Net/Iris/Public/Iris/Core/IrisDebugging.h
Engine/Source/Runtime/Net/Iris/Private/Iris/Core/IrisDebugging.cpp
Engine/Source/Runtime/Net/Iris/Public/Iris/Core/IrisLog.h
Engine/Source/Runtime/Net/Iris/Public/Iris/Core/IrisProfiler.h
Engine/Source/Runtime/Net/Iris/Private/Iris/Core/IrisProfiler.cpp
Engine/Source/Runtime/Net/Iris/Public/Iris/Core/IrisCsv.h
Engine/Source/Runtime/Net/Iris/Public/Iris/Core/IrisMemoryTracker.h
Engine/Source/Runtime/Net/Iris/Private/Iris/Core/IrisMemoryTracker.cpp
Engine/Source/Runtime/Net/Iris/Private/Iris/Stats/NetStats.h
Engine/Source/Runtime/Net/Iris/Private/Iris/Stats/NetStats.cpp
Engine/Source/Runtime/Net/Iris/Private/Iris/Stats/NetStatsContext.h
Engine/Source/Runtime/Net/Iris/Private/Iris/ReplicationSystem/ObjectReplicationBridgeDebugging.cpp
Engine/Source/Runtime/Net/Iris/Private/Iris/ReplicationSystem/ReplicationSystem.cpp
Engine/Source/Runtime/Engine/Private/Net/NetEmulationHelper.cpp
Engine/Source/Runtime/Net/Core/Public/Net/Core/Trace/NetTraceConfig.h
Engine/Source/Runtime/Net/Core/Private/Net/Core/Trace/NetTraceInternal.cpp
Engine/Source/Runtime/Core/Private/ProfilingDebugging/CsvProfiler.cpp
Engine/Source/Runtime/Core/Private/HAL/LowLevelMemTracker.cpp
```

## 17. 边界与不做事项

- 不修改 UE 源码；
- 不执行 UE 全量编译或自动化测试；
- 不声称调试命令在 Shipping 可用；
- 不把 `IrisProfiler` 描述为独立 GUI；
- 不把 `NetTrace` verbosity 与普通日志 verbosity 混为一谈；
- 不把 Networking Insights 的压缩前 bits 当作最终 wire bytes；
- 不把 CSV 的时间、数量或 KBytes 单独作为根因；
- 不把 LLM 标签增长单独判定为内存泄漏；
- 不建议在没有对象/连接范围的情况下常开 VeryVerbose；
- 不通过随意提高 priority、cull distance 或 bandwidth 来掩盖正确性问题；
- 不创建单独的小型 Part 15 Post；
- 不提交 `public/` 构建产物。

## 18. 验收标准

### 内容

- 覆盖大纲 15.1～15.7；
- 13 个 H2 章节完整；
- 完整解释日志、调试器、对象命令、Insights、CSV/NetStats、LLM 与网络仿真；
- 提供对象不复制、属性不同步、性能瓶颈三套流程；
- 明确工具边界与 Shipping/编译限制；
- 标明 UE 5.7.4 技术基线和文章来源。

### 结构

- Part 15 canonical 正确；
- 桌面和移动 TOC 共 26 个目录链接；
- 所有锚点存在且唯一；
- Part 14 下一篇链接指向 Part 15；
- Part 15 上一篇指向 Part 14，下一篇为 Part 16“配置与集成”占位；
- 统一 Post 出现且只出现一个 Part 15 路由。

### 构建与浏览器

- `npm run clean` 成功；
- `npm run build` 成功；
- 桌面 1440×1000 正常；
- 移动端 390×844 正常；
- 无 body 横向滚动；
- Part 15 页面控制台无错误；
- Part 14 → Part 15、统一 Post → Part 15 链接可用；
- 测试后清理浏览器会话、服务器、日志和临时文件。
