# UE5 Iris 第十五部分：调试与性能分析实施计划

## 1. 交付目标

新增：

```text
source/html-articles/ue5-iris-guide-part-15/index.html
```

更新：

```text
source/html-articles/ue5-iris-guide-part-14/index.html
source/_posts/ue5-iris-guide.md
```

完整文章路由：

```text
/html-articles/ue5-iris-guide-part-15/
```

统一系列入口：

```text
/ue5-iris-guide/
```

文章覆盖大纲 15.1～15.7，技术基线为本地 Unreal Engine 5.7.4。按照已实施的合并结构，不创建单独的 `ue5-iris-guide-part-15.md`。

## 2. 约束

- 只读访问 `C:\work\st-unreal-engine`；
- 不修改或编译 UE 源码；
- 复用 Part 14 的 HTML 视觉与交互外壳；
- Part 15 正文、Part 14 导航和统一 Post 完成后保持未提交；
- 设计与计划文档独立提交；
- 不提交 `public/`；
- 不添加装饰性图片、第三方脚本或外部字体；
- 临时脚本、浏览器产物和服务器日志必须清理；
- 保留用户现有未提交的 Part 13、Part 14 和统一 Post 内容；
- 不声称执行了 UE 自动化测试或项目游戏实例采集。

## 3. 基线检查

实施前执行：

```powershell
git status --short --untracked-files=normal
git log --oneline -8
git branch --show-current
git -C C:\work\st-unreal-engine status --short --untracked-files=normal
Get-Content C:\work\st-unreal-engine\Engine\Build\Build.version
```

确认：

- 博客分支为 `source`；
- 博客工作区已有 Part 13、Part 14 和统一 Post 未提交内容；
- 第十五部分设计提交为 `6ff78d4`；
- UE 工作区已有改动属于用户，本次不触碰；
- `Engine/Build/Build.version` 为 5.7.4。

## 4. 源码核对

### 4.1 日志类别

核对：

```text
Engine/Source/Runtime/Net/Iris/Public/Iris/Core/IrisLog.h
Engine/Source/Runtime/Net/Iris/Private/Iris/Core/IrisLog.cpp
Engine/Source/Runtime/Net/Iris/Private/Iris/Stats/NetStats.h
Engine/Source/Runtime/Net/Iris/Private/Iris/Stats/NetStats.cpp
Engine/Source/Runtime/Net/Iris/Private/Iris/ReplicationSystem/ObjectReplicationBridge.cpp
```

确认公开类别：

- `LogIris`；
- `LogIrisFiltering`；
- `LogIrisNetCull`；
- `LogIrisFilterConfig`；
- `LogNetStats`。

核对内部类别：

- `LogIrisRepNotify`；
- `LogIrisConditionals`；
- `LogIrisGroup`；
- `LogIrisRpc`；
- `LogIrisReferences`；
- `LogIrisChunkedDataStream`；
- `LogIrisDirtyTracker`。

正文说明 `DEFINE_LOG_CATEGORY_STATIC` 和编译期 verbosity 边界，不把所有内部类别都当成稳定公开接口。

### 4.2 `IrisDebugHelper`

核对：

```text
Engine/Source/Runtime/Net/Iris/Public/Iris/Core/IrisDebugging.h
Engine/Source/Runtime/Net/Iris/Private/Iris/Core/IrisDebugging.cpp
```

确认：

- `#if !UE_BUILD_SHIPPING`；
- `Net.Iris.DebugName`；
- `Net.Iris.DebugRPCName`；
- `Net.Iris.DebugNetRefHandle`；
- `Net.Iris.DebugNetInternalIndex`；
- 名称使用 substring 匹配；
- 无参数关闭 handle/index 条件；
- `BreakOnObjectName`；
- `BreakOnRPCName`；
- `BreakOnNetRefHandle`；
- `BreakOnInternalNetRefIndex`；
- `FilterDebuggedObject`；
- 调试器可调用的对象、句柄、状态和协议引用函数；
- `DebugNetObjectStateToString` 的内部量化状态和调试缓冲区边界。

### 4.3 对象调试命令

核对：

```text
Engine/Source/Runtime/Net/Iris/Private/Iris/ReplicationSystem/ObjectReplicationBridgeDebugging.cpp
Engine/Source/Runtime/Net/Iris/Private/Iris/ReplicationSystem/ObjectReplicationBridge.cpp
```

确认通用参数：

- `RepSystemId=X`；
- `WithSubObjects`；
- `SortByClass`；
- `SortByNetRefHandle`；
- `ConnectionId=1,5,7`。

确认命令：

- `Net.Iris.PrintNetInfoOfObject`；
- `Net.Iris.PrintReplicatedObjects`；
- `Net.Iris.PrintRelevantObjects`；
- `Net.Iris.PrintRelevantObjectsToConnection`；
- `Net.Iris.PrintAlwaysRelevantObjects`；
- `Net.Iris.PrintNetCullDistances`；
- `Net.Iris.PrintPushBasedStatuses`；
- `Net.Iris.PrintDynamicFilterClassConfig`；
- `Net.Iris.PrintDynamicFilterClassConfigIssues`。

重点核对 `PrintNetInfoOfObject`：

- `FindByName`；
- `FindByClass`；
- `FindById`；
- `ConnectionId`；
- quantized state；
- relevant / filter；
- ReplicationWriter / Reader；
- priority；
- delta compression；
- world location / cull distance；
- dependents 和 creation dependencies。

### 4.4 NetTrace

核对：

```text
Engine/Source/Runtime/Net/Core/Public/Net/Core/Trace/NetTraceConfig.h
Engine/Source/Runtime/Net/Core/Public/Net/Core/Trace/Private/NetTraceInternal.h
Engine/Source/Runtime/Net/Core/Private/Net/Core/Trace/NetTraceInternal.cpp
Engine/Source/Runtime/Engine/Private/UnrealEngine.cpp
```

确认：

- `-NetTrace=<verbosity>`；
- `NetTrace.SetTraceVerbosity`；
- `None = 0`；
- `Trace = 1`；
- `Verbose = 2`；
- `VeryVerbose = 3`；
- 非 Shipping / Test 编译期上限默认 `VeryVerbose`；
- Shipping / Test 默认 `Verbose`；
- frame / packet stats counters；
- poll / quantize / write per-object timers 在高 verbosity 下记录。

### 4.5 `IrisProfiler` 与 CPU scopes

核对：

```text
Engine/Source/Runtime/Net/Iris/Public/Iris/Core/IrisProfiler.h
Engine/Source/Runtime/Net/Iris/Public/Iris/Core/IrisCsv.h
Engine/Source/Runtime/Net/Iris/Private/Iris/ReplicationSystem/ReplicationSystem.cpp
Engine/Source/Runtime/Net/Iris/Private/Iris/ReplicationSystem/ObjectReplicationBridge.cpp
Engine/Source/Runtime/Net/Iris/Private/Iris/ReplicationSystem/Filtering/ReplicationFiltering.cpp
Engine/Source/Runtime/Net/Iris/Private/Iris/ReplicationSystem/Prioritization
```

确认：

- `IRIS_PROFILER_SCOPE` 默认映射到 CPU Profiler Trace；
- Shipping 默认关闭 `IRIS_PROFILER_ENABLE`；
- protocol name scope 只在 CPU trace capture 时增加显著成本；
- low-level verbose scope 在 Shipping / Test 默认关闭；
- `IRIS_CSV_PROFILER_SCOPE` 同时提供 CPU trace 与 CSV timing；
- `ReplicationSystem_NetUpdate` 的阶段顺序；
- filtering、conditionals、quantize、prioritization、data streams 和 post-send scopes；
- `ReplicationBridge_PreUpdate`；
- `ReplicationBridge_PollAndCopy`；
- `ReplicationPollAndCopyTask`。

正文不得把 `IrisProfiler` 描述为独立应用。

### 4.6 Iris CSV 与客户端 Profiler

核对：

```text
Engine/Source/Runtime/Net/Iris/Private/Iris/IrisConfig.cpp
Engine/Source/Runtime/Net/Iris/Private/Iris/Core/IrisProfiler.cpp
Engine/Source/Runtime/Core/Private/ProfilingDebugging/CsvProfiler.cpp
```

确认：

- `CsvProfile Start`；
- `CsvProfile Stop`；
- `CsvProfile Frames=N`；
- `Iris` 主类别；
- `IrisClient`；
- `IrisClientDetailObjectCreate`；
- `IrisClientDetailRepNotify`；
- `IrisClientDetailRPC`；
- `IrisClientBlockedByAsyncLoading`；
- `net.Iris.EnableDetailedClientProfiler`；
- client profiler 记录 object create、RepNotify、RPC 和 async loading block；
- 详细客户端统计默认不面向 Shipping。

### 4.7 `NetStats` / `NetStatsContext`

核对：

```text
Engine/Source/Runtime/Net/Iris/Private/Iris/Stats/NetStats.h
Engine/Source/Runtime/Net/Iris/Private/Iris/Stats/NetStats.cpp
Engine/Source/Runtime/Net/Iris/Private/Iris/Stats/NetStatsContext.h
```

确认按类型统计：

- PreUpdate time / count；
- Poll time / count；
- PollWaste time / count；
- Quantize time / count；
- Write time / count / bits；
- WriteWaste time / count / bits；
- WriteCreationInfo count / bits；
- WriteExports count。

确认汇总统计：

- scheduled / replicated root object count；
- replicated object count；
- masked-out state；
- delta compressed object count；
- replicating connection count；
- active / waiting / stalling huge objects；
- pending objects / dependencies；
- huge object send queue。

确认：

- child context 在并行工作中使用；
- 结束时累加到 parent context；
- `net.Iris.Stats.ShouldIncludeSubObjectWithRoot` 默认 true；
- 统计收集随 CSV capture 启用。

### 4.8 内存跟踪

核对：

```text
Engine/Source/Runtime/Net/Iris/Public/Iris/Core/IrisMemoryTracker.h
Engine/Source/Runtime/Net/Iris/Private/Iris/Core/IrisMemoryTracker.cpp
Engine/Source/Runtime/Core/Private/HAL/LowLevelMemTracker.cpp
```

确认标签：

- `Iris`；
- `IrisState` / `State`；
- `IrisInitialization` / `Initialization`；
- `IrisConnection` / `Connection`；
- `NetTokenStructState`。

确认：

- 子标签 parent 为 `Iris`；
- 汇总到 Networking summary；
- `-LLM`；
- `-LLMCSV`；
- `stat LLM`；
- `stat LLMFULL`；
- `DumpLLM`；
- `LLM.LLMWriteInterval`；
- LLM 在 Shipping 完全禁用；
- 标签是 allocation attribution，不是自动泄漏诊断。

### 4.9 网络仿真

核对：

```text
Engine/Source/Runtime/Engine/Private/Net/NetEmulationHelper.cpp
Engine/Source/Runtime/Engine/Classes/Engine/NetDriver.h
Engine/Source/Runtime/Engine/Private/NetConnection.cpp
```

确认：

- `DO_ENABLE_NET_TEST = !(UE_BUILD_SHIPPING)`；
- `NetEmulation.PktLoss`；
- `NetEmulation.PktLag`；
- `NetEmulation.PktLagVariance`；
- `NetEmulation.PktOrder`；
- `NetEmulation.PktDup`；
- incoming loss / lag；
- jitter / buffer bloat；
- RPC-specific unreliable drop commands；
- `NetEmulation.Off` 和 `NetEmulation.DropNothing`。

## 5. 官方资料

引用 Epic Games 5.7 页面：

- Logging in Unreal Engine；
- Networking Insights；
- Low-Level Memory Tracker；
- Unreal Insights；
- Memory Insights；
- Testing and Debugging Networked Games。

规则：

- 外部链接全部使用 HTTPS；
- 页面参数指定 `application_version=5.7`；
- 普通日志命令和工具入口优先使用官方文档；
- Iris 内部命令、CSV 类别、LLM 标签和编译边界以本地 5.7.4 源码为准；
- 不引用第三方教程作为技术结论依据；
- Networking Insights 的 packet size 注明是压缩前数据。

## 6. HTML 实施

### 6.1 创建文件

目标：

```text
source/html-articles/ue5-iris-guide-part-15/index.html
```

复用 Part 14 的自包含页面骨架，用 `apply_patch` 创建和修改文件。

### 6.2 Metadata

设置：

- `lang="zh-CN"`；
- 作者 `Jossy Zhang`；
- 标题“UE5-Iris 网络复制系统技术分析 - 第十五部分：调试与性能分析”；
- 描述包含 `IrisDebugHelper`、`PrintNetInfoOfObject`、Networking Insights、CSV、NetStats 和 LLM；
- canonical：`http://zhangga.github.io/html-articles/ue5-iris-guide-part-15/`；
- theme color 与 Part 14 一致；
- 内联 favicon。

### 6.3 Hero

内容：

- Part 15 / Debugging & Performance；
- 主标题“调试与性能分析”；
- 副标题强调“从偶发症状到可复现、可定位、可比较的证据链”；
- 技术基线 UE 5.7.4；
- 文章来源跳转；
- 背景大字 `EVIDENCE`。

### 6.4 目录

桌面和移动端均包含 13 项：

1. `#evidence-chain`
2. `#tool-map`
3. `#checkpoints`
4. `#symptoms`
5. `#logging`
6. `#debug-helper`
7. `#object-commands`
8. `#insights`
9. `#csv-netstats`
10. `#waste`
11. `#memory`
12. `#runbooks`
13. `#practice`

### 6.5 章节内容

#### 第 1 节：调试是证据链

- 以敌人偶发消失开场；
- 区分 symptom、observation、hypothesis、proof；
- 强调单层证据不能外推；
- 给出最小复现卡。

#### 第 2 节：工具分工地图

- 日志、对象命令、断点、Timing、Networking、CSV、LLM 的问题矩阵；
- 快照、时间线、聚合三个观察尺度；
- 说明先缩对象和连接，再扩大采集。

#### 第 3 节：七检查点

- identity；
- relevant；
- dirty / poll / condition；
- prioritize / budget；
- quantize / write；
- receive / parse；
- apply / RepNotify；
- 每一步的工具和失败含义。

#### 第 4 节：15.1 症状与复现

- 常见问题清单；
- 功能、性能、容量三类；
- 记录 server/client、PIE、RepSystemId、ConnectionId、NetRefHandle；
- 给出关键源码索引入口。

#### 第 5 节：15.2 日志

- Iris 日志类别；
- 七档日志级别；
- `log` 与 `-LogCmds`；
- Saved/Logs；
- VeryVerbose 成本；
- 敌人消失案例中怎样关联对象、连接和时间窗口。

#### 第 6 节：`IrisDebugHelper`

- 构建边界；
- `DebugName`；
- `DebugRPCName`；
- `DebugNetRefHandle`；
- `DebugNetInternalIndex`；
- break / filter helpers；
- debugger functions；
- quantized internal state 与原始 Gameplay 值的边界。

#### 第 7 节：对象命令

- `PrintNetInfoOfObject` 搜索方式；
- 单对象输出卡；
- relevant / filter / cull / priority / delta / dependencies；
- 其他全局清单命令；
- common args；
- “敌人消失”命令序列。

#### 第 8 节：Insights

- `-trace=net -NetTrace=1 -tracehost=localhost`；
- NetTrace 0～3；
- Timing Insights CPU phase；
- Networking Insights packet / content / stats / counters；
- incoming / outgoing 和 connection selection；
- 压缩前 packet size 边界。

#### 第 9 节：15.4 CSV 与 NetStats

- `IrisProfiler` 是 trace scope；
- `CsvProfile Start/Stop/Frames`；
- time / count / KBytes 三维指标；
- server phase 和 client detail categories；
- `NetStatsContext` child / parent aggregation；
- root / subobject 统计归属。

#### 第 10 节：Waste 与预算

- Poll Waste；
- Write Waste；
- scheduled vs replicated；
- creation info / export burst；
- huge object wait / stall；
- time 上升时怎样用 count 和 KBytes 区分规模、单位成本与无效工作。

#### 第 11 节：15.5 内存

- Iris LLM 标签树；
- `-LLM` / `-LLMCSV`；
- `stat LLMFULL`；
- State / Connection / Initialization 的归一化方法；
- 稳态、断连、卸载后的回落；
- LLM 归属与 Memory Insights 调用栈的配合；
- 不把标签上涨直接写成泄漏。

#### 第 12 节：15.6 三套 Runbook

- 对象不复制；
- 属性不同步；
- 性能瓶颈；
- 每套给出问题、命令、预期证据、下一步；
- 补充快速参考表。

#### 第 13 节：网络仿真、15.7 清单与总结

- `NetEmulation.PktLoss`；
- `PktLag` / variance；
- unreliable RPC targeted drop；
- 一次改变一个变量；
- 开发、测试、发布三阶段 checklist；
- 命令速查；
- 官方资料和源码索引；
- 前后篇导航；
- 下一部分“配置与集成”预告。

### 6.6 来源区

写明：

- 系列大纲来源；
- 第十五部分由 Jossy Zhang 原创扩写；
- 技术基线为本地 UE 5.7.4；
- 官方资料链接；
- 关键源码清单；
- 本次未执行 UE 自动化测试或真实项目 trace。

### 6.7 页间导航

Part 15 底部：

- 上一篇：`/html-articles/ue5-iris-guide-part-14/`；
- 中间：`/ue5-iris-guide/`；
- 下一篇：第十六部分“配置与集成”占位，暂不链接。

更新 Part 14：

- 将“下一篇：第十五部分”占位改为链接；
- URL：`/html-articles/ue5-iris-guide-part-15/`。

## 7. 统一 Post 更新

更新 `source/_posts/ue5-iris-guide.md`：

- `updated` 改为当前日期时间；
- 开头“已发布”改为第 1～15 部分；
- 主题串补充调试与性能分析；
- “全部文章”表增加第十五部分；
- “内容简介”增加第十五部分摘要；
- 摘要链接到 `/html-articles/ue5-iris-guide-part-15/`；
- 保留原来源说明；
- 继续说明第 5 部分起为原创扩写；
- 不创建单独 Part 15 Post。

## 8. 静态验证

### 8.1 HTML 结构

检查：

- 一个 `<h1>`；
- 13 个 `<h2>`；
- 26 个 TOC anchor links；
- 13 个 article section id；
- 无重复 id；
- 所有内部 `href="#..."` 都有目标；
- canonical 唯一且正确；
- 外部链接使用 HTTPS；
- 站内链接使用根相对路径；
- HTML 可由 `parse5` 解析且无 parse errors。

### 8.2 必须出现的术语

- `IrisDebugHelper`；
- `Net.Iris.DebugName`；
- `Net.Iris.DebugRPCName`；
- `Net.Iris.DebugNetRefHandle`；
- `Net.Iris.PrintNetInfoOfObject`；
- `Net.Iris.PrintRelevantObjectsToConnection`；
- `RepSystemId`；
- `ConnectionId`；
- `NetRefHandle`；
- `IrisProfiler`；
- `Unreal Insights`；
- `Networking Insights`；
- `CsvProfile`；
- `NetStatsContext`；
- `IrisMemoryTracker`；
- `IrisState`；
- `IrisConnection`；
- `NetEmulation.PktLoss`。

### 8.3 语义防错

人工搜索检查：

- “Shipping”附近必须说明命令或编译边界；
- “IrisProfiler”附近必须写 trace scope / 埋点；
- “packet size”附近必须写压缩前；
- “LLM”与“泄漏”附近必须写不能单独判定；
- “VeryVerbose”附近必须写输出成本；
- “priority/cull/bandwidth”附近不得写成未经证明的第一步修复；
- “测试”附近不得写本次 UE 测试已通过；
- “网络仿真”附近必须写一次改变一个变量。

### 8.4 统一入口

确认：

- outline + Part 1～15 共 16 条文章路由；
- Part 15 路由在文章表和摘要各出现一次；
- 不出现旧的小 Post 路径；
- Part 14 和 Part 15 导航互通。

## 9. 构建

执行：

```powershell
npm run clean
npm run build
```

确认：

- 命令退出码为 0；
- 生成 `public/html-articles/ue5-iris-guide-part-15/index.html`；
- 生成 `public/ue5-iris-guide/index.html`；
- 构建没有模板或资源错误；
- `public/` 不进入提交。

## 10. 浏览器验证

浏览器测试前完整读取：

```text
C:\Users\Admin\.agents\skills\playwright-cli\SKILL.md
```

### 10.1 桌面 1440×1000

- Hero、桌面 TOC、13 个章节、来源区和页间导航正常；
- 阅读进度条工作；
- 当前章节高亮；
- 信息图、表格、代码块和 LLM 树无溢出；
- 页面控制台无错误；
- Part 14 “下一篇”可进入 Part 15；
- Part 15 “上一篇”可返回 Part 14；
- 统一 Post 可进入 Part 15。

### 10.2 移动端 390×844

- 桌面 TOC 隐藏，移动 TOC 可展开；
- body `scrollWidth <= clientWidth`；
- 表格和管线在容器内横向滚动；
- Hero、命令卡、Runbook 和导航卡片不撑破页面；
- “回到顶部”按钮可用；
- 移动目录点击后关闭。

### 10.3 已知噪音

- 统一 Post 若因主题外部字体 CDN 出现错误，应与 Part 15 自包含页面控制台结果分开记录；
- Part 15 不依赖外部字体，目标是零控制台错误。

## 11. 清理

验证后：

- 关闭 Playwright 会话；
- 停止本地静态服务器；
- 清理 `.playwright-cli`；
- 清理临时日志、截图和辅助脚本；
- 确认没有遗留 node / python server；
- 确认 UE 工作区状态未因本次任务改变；
- 确认 `public/` 未进入 Git 状态；
- 最终 Git 状态只保留预期的 Part 13、Part 14、Part 15 与统一 Post 修改。

## 12. 提交策略

已经单独提交：

```text
docs: design Iris debugging article
```

本计划单独提交：

```text
docs: plan Iris debugging article
```

正文阶段暂不提交：

```text
source/html-articles/ue5-iris-guide-part-15/index.html
source/html-articles/ue5-iris-guide-part-14/index.html
source/_posts/ue5-iris-guide.md
```

等用户后续明确要求 `commit` 时，再将 Part 13、Part 14、Part 15 正文、统一 Post 和导航更新一起提交。
