# UE5 Iris 技术分析第八部分：数据流与传输设计

## 目标

根据现有《UE5 Iris 网络复制系统技术分析指南》大纲，补充系列第八部分“数据流与传输”。文章承接第七部分已经生成的量化状态和网络比特，沿一次实际发送、接收与投递反馈完整解释：

```text
复制候选与 ChangeMask
→ FReplicationWriter
→ UReplicationDataStream
→ UDataStreamManager
→ 网络包
→ UDataStreamManager
→ UReplicationDataStream
→ FReplicationReader
→ 状态应用与 RepNotify
→ ACK / Lost / Discard 反馈
```

技术结论以本地 Unreal Engine 5.7.4 源码为主要依据。大纲原文基于 UE 5.5，其章节名称可以保留，但类名、接口、常量、默认配置和行为必须按 UE 5.7.4 重新核对。

完成后的读者应能：

- 解释 `UDataStream` 的生命周期以及 `BeginWrite`、`WriteData`、`ReadData`、`ProcessPacketDeliveryStatus` 之间的对应关系。
- 理解 `FDataStreamRecord` 如何把“包里写了什么”连接到后续投递状态。
- 理解 `UDataStreamManager` 如何创建、暂停、关闭和协调多个 DataStream。
- 正确理解 DataStreamManager 的“带宽分配”边界：它协调多个流共享当前包的剩余位预算，但不是一套独立的公平带宽调度器。
- 沿 `UReplicationDataStream` 进入 `FReplicationWriter` 和 `FReplicationReader`。
- 区分游戏对象脏数据发现、逐连接调度、对象状态写入和可靠事件传输。
- 区分对象状态、可靠 Attachment、非可靠 Attachment 的丢包语义。
- 解释 Reader 如何解析对象批次、创建对象、反序列化状态、解析引用并应用到游戏对象。
- 说明 RepNotify 并不是由 Reader 直接逐函数调用，而是在 Reader 发起的状态派发和 Fragment/Bridge 应用路径中触发。
- 理解 `UChunkedDataStream` 的分块、序列号、确认、重传、顺序组装、引用导出和缓冲上限。
- 区分通用 `UChunkedDataStream` 与 ReplicationWriter 内部 Huge Object / NetBlob 路径。
- 使用 UE 5.7.4 的日志、位流错误和投递状态定位常见传输问题。

## 内容定位

- 标题：`UE5-Iris 网络复制系统技术分析 - 第八部分：数据流与传输`
- HTML 页面：`source/html-articles/ue5-iris-guide-part-8/index.html`
- 博客入口：`source/_posts/ue5-iris-guide-part-8.md`
- 完整文章路由：`/html-articles/ue5-iris-guide-part-8/`
- 目标读者：已阅读前七部分、希望掌握 Iris 逐连接写入与接收路径的 UE 网络程序员。
- 技术基线：Unreal Engine 5.7.4。
- 本地源码：`C:\work\st-unreal-engine`
- Iris 源码根目录：`Engine/Source/Runtime/Net/Iris`

本文是根据系列大纲扩写的原创技术内容，不标注为知乎转载。页尾注明作者为 Jossy Zhang，技术依据为本地 UE 5.7.4 源码与 Epic Games UE 5.7 官方资料。

本地 UE 源码仓库存在用户改动。研究期间只读访问，不写入、不格式化、不暂存、不提交该源码仓库中的任何文件。

## 范围决策

保留大纲的 `8.1` 至 `8.5` 编号和主题：

1. `8.1 DataStream 系统`
2. `8.2 DataStreamManager`
3. `8.3 ReplicationWriter（发送端）`
4. `8.4 ReplicationReader（接收端）`
5. `8.5 ChunkedDataStream（分块数据流）`

在五节内部增加必要的子节、速查表、故障分支和案例，不额外制造与大纲平级的 8.6 主题。正文结尾另设不编号的总结、源码索引和下一部分预告。

边界如下：

- 第八部分解释 NetBlob、Attachment 和 Baseline 与传输流程的交接点。
- NetBlob 类型体系、Handler、Attachment 封装和 RPC Blob 细节留给第九部分。
- Delta Compression 的 Baseline Manager、确认状态、位数表和压缩决策留给第十部分。
- 不把第七部分的 Serializer 内容重新展开，只说明它在 Writer/Reader 中被调用的位置。
- 不把第六部分的 Prioritizer 算法重新展开，只说明其输出如何成为 Writer 的调度输入。
- 不深入 NetDriver、PacketHandler、Socket 和底层网络协议栈，只画出 Iris DataStream 与连接传输层的边界。

## 叙事策略

采用“一个包的端到端旅程”作为主线，而不是把五个类写成彼此割裂的 API 手册。

主案例延续系列的百人大逃杀场景：

1. 一名玩家受到伤害并开火，`Health` 与 `Ammo` 发生变化。
2. 前置阶段完成轮询/Push Model、过滤、优先级和 ChangeMask 更新。
3. Writer 为目标连接选择对象并组织对象批次。
4. `UReplicationDataStream` 把 Writer 接入统一 DataStream 接口。
5. DataStreamManager 把 Replication、NetToken 或其他流写入同一包预算。
6. 接收端 Manager 按流标记分发数据。
7. Reader 解析批次，将量化状态写入接收状态缓冲，创建或查找对象并派发应用。
8. 包到达时，发送端沿投递记录确认 in-flight 状态。
9. 包丢失时，区分状态重调度、可靠 Attachment 重发和非可靠 Attachment 放弃。

辅助案例用于解释 `UChunkedDataStream`：

- 一份自定义的大型比赛初始化载荷被拆成多个固定上限的 chunk。
- 发送端维护 sequence、Sent/Acked 状态和待确认队列。
- 接收端按预期 sequence 组装，等待 MustBeMapped 引用后再派发。
- 丢失 chunk 被重新发送，而不是重新发送已经确认的全部载荷。

两个案例都必须标明哪些数字来自 UE 5.7.4 常量，哪些是解释性载荷大小。不得把示例包大小、对象数量或网络条件写成引擎保证。

## 总体数据流

### 发送方向

```text
游戏状态变化
→ Poll / Push Model
→ Dirty ChangeMask
→ 逐连接 Scope 与 Priority
→ FReplicationWriter::BeginWrite
→ 调度对象、销毁信息与 Attachment
→ FReplicationWriter::Write
→ UReplicationDataStream::WriteData
→ UDataStreamManager::WriteData
→ 当前连接包的 BitStream
```

需要明确修正大纲中“ReplicationWriter 收集脏对象”的简化说法：

- 原始游戏对象脏检测发生在更早的 ReplicationSystem/Bridge 更新阶段。
- Writer 接收并同步脏 ChangeMask、Scope、Priority 等逐连接输入。
- Writer 在自己的连接状态中调度和写入对象，而不是重新扫描全部游戏对象判断属性是否变化。

### 接收方向

```text
连接收到 Iris 载荷
→ UDataStreamManager::ReadData
→ 根据包内流状态选择 DataStream
→ UReplicationDataStream::ReadData
→ FReplicationReader::Read
→ 解析销毁信息、对象批次、状态与 Attachment
→ 解析/等待对象引用
→ DispatchStateData
→ Dequantize + Apply
→ Fragment / Bridge 的 PreApply、PostApply 与 RepNotify 路径
```

### 投递反馈

```text
包序号获得 Delivered / Lost / Discard 结果
→ UDataStreamManager::ProcessPacketDeliveryStatus
→ 找到该包各流对应的 FDataStreamRecord
→ 各 DataStream 更新自身的确认、重发或清理状态
```

`Discard` 用于连接关闭或记录无法继续等待等清理场景，不等同于网络丢包重传。

## 章节结构

### 8.1 DataStream 系统

#### DataStream 解决的问题

- 把不同复制数据源统一到逐连接的位流读写接口。
- 允许自定义数据拥有自己的投递保证和确认状态。
- 把“本次写了什么”与未来的包投递结果关联。
- 允许常规复制、Token 导出和自定义大载荷共享连接传输。

#### `UDataStream` 基类

按 UE 5.7.4 `DataStream.h` 解释：

- `Init` / `Deinit`
- `Update`
- `BeginWrite`
- `WriteData`
- `EndWrite`
- `ReadData`
- `ProcessPacketDeliveryStatus`
- `HasAcknowledgedAllReliableData`
- `RequestClose`

解释初始化参数：

- `NetExports`
- `Name`
- `ReplicationSystemId`
- `ConnectionId`
- `PacketWindowSize`

解释写入参数和结果：

- `EDataStreamWriteMode::Full`
- `EDataStreamWriteMode::PostTickDispatch`
- `EWriteResult::NoData`
- `EWriteResult::Ok`
- `EWriteResult::HasMoreData`
- `FBeginWriteParameters::MaxPackets`

`HasMoreData` 表示如果帧和包预算允许，流愿意继续写；它不保证 Manager 或连接一定再次调用。

#### `FDataStreamRecord`

- 记录由具体 DataStream 分配和拥有。
- 对每次真正向包写入数据的调用，未来会有对应的投递状态回调。
- 回调顺序与写入顺序保持一致。
- Record 不规定统一字段，具体流决定记录对象、ChangeMask、chunk sequence 或 Attachment 队列状态。
- 关闭连接时仍需通过 `Discard` 释放 outstanding record，避免泄漏。

#### DataStream 状态

解释 UE 5.7.4 的动态流状态：

- `Invalid`
- `PendingCreate`
- `WaitOnCreateConfirmation`
- `Open`
- `PendingClose`
- `WaitOnCloseConfirmation`

用状态图说明创建和关闭需要两端同步，不能仅在单端构造一个 UObject 就假定远端已能解析。

#### 可靠性模型

DataStream 接口本身不自动把所有数据变成可靠数据。它提供投递反馈，具体流决定：

- Delivered 后确认并释放什么。
- Lost 后重新排队什么。
- Discard 后清理什么。
- `HasAcknowledgedAllReliableData` 何时返回 true。

### 8.2 DataStreamManager

#### 定义与创建

解释 `UDataStreamDefinitions` 与 `FDataStreamDefinition`：

- `DataStreamName`
- `ClassName`
- `DefaultSendStatus`
- `bAutoCreate`
- `bDynamicCreate`
- 定义索引与两端一致性

展示 UE 5.7.4 `BaseEngine.ini` 默认自动创建的核心流：

- `NetToken`
- `Replication`

配置只作为当前源码快照说明。如果本地配置文件含用户修改，正文依据类和默认引擎意图交叉核对，避免把项目覆盖项误写为通用默认。

#### 多流协调

解释 Manager 如何：

- 对所有活动流调用 `Update`、`BeginWrite` 和 `EndWrite`。
- 跳过 `Pause` 状态的流。
- 在包中编码哪些流实际写入了数据。
- 为各流提供当前位流剩余容量。
- 汇总每个流的 `FDataStreamRecord`。
- 在接收端只对包内有数据的流调用 `ReadData`。
- 把包投递结果分派给对应流。

#### “带宽分配”的准确边界

大纲中的“带宽分配”改写为“共享包预算与继续写入协调”：

- Manager 不给每个流维护通用权重或公平份额。
- 流按配置/内部索引次序尝试写入，并共享当前 Writer 的容量。
- 子流的 `NoData`、`Ok`、`HasMoreData` 影响 Manager 的返回结果。
- `MaxPackets`、连接提供的包容量和流自身策略共同决定能否继续写。
- 需要严格按 UE 5.7.4 实现核对流头、presence bits、回滚或溢出处理，正文不预先写死未经确认的位数。

#### 动态流握手

- `CreateStream`
- `CloseStream`
- `GetStreamState`
- `SetSendStatus` / `GetSendStatus`
- 创建与关闭控制数据如何等待远端确认
- outstanding record 在关闭时如何处理

### 8.3 ReplicationWriter（发送端）

#### Writer 的位置

解释 `UReplicationDataStream` 是 DataStream 接口适配层：

- `Update` 转发给 Writer。
- `BeginWrite` 转发给 Writer。
- `WriteData` 调用 `FReplicationWriter::Write`。
- `ProcessPacketDeliveryStatus` 调用 `ProcessDeliveryNotification`。
- `ReadData` 转发给 Reader。

#### Writer 输入

Writer 消费而不是重新生成：

- 连接 Scope。
- Updated Priorities。
- Dirty ChangeMasks。
- 对象生命周期状态。
- Dependency 与 SubObject 关系。
- Attachment 队列。
- Baseline/Delta 可用性。

解释主要对象状态：

- PendingCreate / WaitOnCreateConfirmation / Created
- PendingDestroy / WaitOnDestroyConfirmation / Destroyed
- PendingTearOff
- SubObjectPendingDestroy
- WaitOnFlush
- HugeObject 等内部特殊状态

#### 写入阶段

沿 UE 5.7.4 的真实实现组织：

1. `BeginWrite` 建立当前批次写入上下文。
2. 同步调度输入并准备待写对象。
3. 优先处理必要的创建、销毁和 Attachment 状态。
4. `WriteObjects` 按预算组织 root object 与 subobject batch。
5. `WriteObjectBatch` / `WriteObjectAndSubObjects` 写入对象头、状态和附件。
6. Serializer 通过 Replication Protocol Operations 写入量化状态。
7. 超出当前包容量时回滚不完整写入，保留对象供后续包或帧处理。
8. `EndWrite` 提交当前批次状态并清理临时上下文。

具体阶段名称、顺序和回滚点必须从 `ReplicationWriter.cpp` 核对，不把解释性流程框写成逐行源码。

#### 全量、Delta 与 Baseline 边界

- 初始状态和无有效 Baseline 时使用对应的完整状态路径。
- 有有效 Baseline 时 Writer 可选择 Delta 路径。
- 本节只解释 Writer 如何选择并写入，以及投递结果为什么会影响 Baseline 可用性。
- Baseline Manager 内部状态和 Delta 位收益留到第十部分。

#### 可靠与不可靠

正文必须拆成三类：

1. **对象状态**
   - 目标是让远端收敛到最新状态。
   - 丢包后相关状态重新进入调度或由更新后的最新状态覆盖。
   - 不保证按事件历史逐条重放。
2. **可靠 Attachment**
   - 进入可靠队列。
   - 等待确认，丢失后重发。
   - 顺序和去重语义以 UE 5.7.4 Attachment/NetBlob 实现为准。
3. **不可靠 Attachment**
   - 丢失后不作为可靠事件重发。
   - 后续新事件不能弥补业务上必须精确执行一次的旧事件。

避免写成“ReplicationWriter 的所有数据都是可靠的”或“状态丢包后原包原样重发”。

#### 投递状态

- `ProcessDeliveryNotification`
- 更新 in-flight record。
- 确认创建、销毁和已发送状态。
- 丢包后恢复需要重新调度的位。
- 通知可靠和不可靠 Attachment 队列。
- 清理 Discard 记录。

用一个 Delivered/Lost 分叉图展示同一 Health/Ammo 更新的不同后续动作。

### 8.4 ReplicationReader（接收端）

#### 解析入口

- `UReplicationDataStream::ReadData`
- `FReplicationReader::Read`
- 读取流级调试标志与包级头。
- 读取 pending destroy、对象 batch、Attachment 和必要的 export。
- 在位流错误、长度不匹配或引用非法时向 Serialization Context 报错。

#### 对象创建与更新

区分：

- 已存在对象的状态更新。
- 初次创建的 root object。
- subobject 创建。
- 销毁、TearOff 和无效对象。
- 对象 batch 因引用或父对象未就绪而延迟。

Reader 解析网络描述并通过 ReplicationBridge/Factory 路径创建实例；正文不把 Reader 描述成直接 `NewObject` 所有类型。

#### 反序列化

- 解析 ChangeMask。
- 初始状态使用 initial state 路径。
- 普通更新使用 `DeserializeWithMask`。
- 有效 Baseline 使用 `DeserializeWithMaskDelta`。
- 结果进入对象的 receive state buffer。
- 读取阶段与实际应用阶段分开，以支持依赖、引用和批量派发。

#### 引用解析与派发

- MustBeMapped references。
- unresolved references。
- creation dependency。
- 延迟 batch。
- Attachment 在状态应用前后的顺序约束。
- `DispatchStateData`。
- `FDequantizeAndApplyHelper`。
- Bridge 的 initial-state apply 边界。

#### RepNotify 边界

正文使用如下准确表述：

```text
FReplicationReader
→ 组织需要派发的状态
→ FDequantizeAndApplyHelper / Replication Fragment
→ 写回游戏对象
→ Legacy PreApply / PostApply 路径
→ 对应 RepNotify
```

- Reader 控制接收、排队和派发时机。
- Fragment/Bridge 应用路径负责把量化状态写回外部对象并执行相关通知。
- RepNotify 是否触发、旧值参数、条件与顺序还受 Descriptor、Fragment 和属性配置影响。
- 不写成 `FReplicationReader::Read` 解析一个属性后立即直接调用该属性的 RepNotify。

#### 错误与安全

- Bitstream overflow/underflow。
- 对象 batch 尺寸不一致。
- 非法 Handle。
- 创建依赖断裂。
- 无法解析的对象引用。
- 不完整 Huge Object。
- Context error 后停止使用不可信数据。

### 8.5 ChunkedDataStream（分块数据流）

#### 定位和实验状态

- `UChunkedDataStream` 是用于承载大型自定义 payload 与可能引用导出的实验性 DataStream。
- 它不是 UE 5.7.4 `BaseEngine.ini` 默认自动创建的 Replication/NetToken 流。
- 使用前需要匹配的 DataStreamDefinition 和两端创建流程。
- 正文必须保留 API 注释中的 Experimental 边界。

#### 发送端

解释：

- `EnqueuePayload`
- `FSendQueueEntry`
- `SplitPayload`
- `FDataChunk`
- `DataChunksPendingSend`
- `DataChunksPendingAck`
- Sent/Acked 位图
- sequence 回绕
- `ProcessPacketDeliveryStatus`
- `HasAcknowledgedAllReliableData`

按 UE 5.7.4 当前源码说明：

- `ChunkSize = 192` 字节。
- `SequenceBitCount = 11`。
- 最大未确认 chunk 窗口由 `1 << SequenceBitCount` 推导。
- 默认发送缓冲和接收未派发缓冲上限必须从当前源码核对，并标注为当前实现值，而非永久 API 契约。

#### 接收端

- 读取显式或连续 sequence。
- 检查与 `ExpectedSeq` 的关系。
- 将 chunk 放入待组装队列。
- 根据首块记录恢复完整 payload 大小。
- 顺序组装。
- 处理 exports 与 MustBeMapped references。
- `DispatchReceivedPayload` / `DispatchReceivedPayloads`。
- 超过未派发载荷上限后进入错误状态并关闭流。

#### 可靠性

- 每个已写 chunk 通过 DataStream Record 收到投递状态。
- Delivered 标记已确认。
- Lost 允许相应 chunk 重新发送。
- 发送端只在相关 chunk 都完成后释放共享 payload。
- 接收端按 sequence 组装，避免把乱序或重复块直接派发。
- “可靠”不等于无限缓冲；发送和接收上限仍会拒绝或关闭流。

#### 与 Huge Object / NetBlob 的区别

提供对照表：

| 维度 | `UChunkedDataStream` | ReplicationWriter Huge Object 路径 |
| --- | --- | --- |
| 入口 | 自定义 payload API | 复制对象 batch 超出普通路径容量 |
| 外层 | 独立 DataStream | `UReplicationDataStream` 内部复制协议 |
| 数据组织 | ChunkedDataWriter/Reader | Attachment、Partial NetObject Attachment、NetBlob |
| 创建 | 需要 DataStreamDefinition/两端流状态 | 由复制系统内部处理 |
| 深入章节 | 本节 | 第九部分 NetBlob |

不得把两者写成同一个类或同一套 chunk 格式。

#### 大载荷案例

使用一份解释性的 64 KiB 比赛初始化载荷：

- 计算 `ceil(65536 / 192)` 个 chunk。
- 说明最后一块大小。
- 展示第 N 块丢失、其他块确认后只重发缺失块的过程。
- 说明真实总位数还包含 sequence、首块、长度、流 presence、export 和包级开销。
- 不把 64 KiB 写成推荐上限或默认用法。

## 端到端案例

### 正常到达

1. `Health: 100.0 → 73.5`，`Ammo: 30 → 29`。
2. ChangeMask 标记对应成员。
3. 对目标连接，Writer 已拥有 scope 与 priority 输入。
4. Writer 在对象 batch 中写入 Handle、状态标记、ChangeMask 和序列化后的字段。
5. ReplicationDataStream 返回有数据。
6. Manager 写入流存在信息并保存包级 record。
7. Reader 读取 batch，将量化状态写入 receive state buffer。
8. 引用解析完成后，状态经 Fragment/Bridge 应用。
9. RepNotify 在应用路径中按配置执行。
10. Delivered 回调确认本次 in-flight 状态。

### 包丢失

1. Manager 收到 Lost。
2. ReplicationDataStream 将结果转给 Writer。
3. 对象状态重新进入需要发送的状态，但可被后续最新 Health/Ammo 覆盖。
4. 可靠 Attachment 保留并重新排队。
5. 非可靠 Attachment 不按可靠事件重发。
6. 未确认创建、销毁或 Baseline 状态按各自规则处理。

### 连接关闭

1. outstanding record 收到 Discard。
2. 各流释放记录和引用。
3. 动态流和连接状态完成清理。
4. 不将 Discard 误判为应继续重发的普通 Lost。

## 技术依据与源码索引

主要核对以下 UE 5.7.4 文件：

### DataStream

- `Public/Iris/DataStream/DataStream.h`
- `Public/Iris/DataStream/DataStreamManager.h`
- `Private/Iris/DataStream/DataStream.cpp`
- `Private/Iris/DataStream/DataStreamManager.cpp`
- `Private/Iris/DataStream/DataStreamDefinitions.h`
- `Private/Iris/DataStream/DataStreamDefinitions.cpp`
- `Engine/Config/BaseEngine.ini`

### Replication Stream、Writer 与 Reader

- `Private/Iris/ReplicationSystem/ReplicationDataStream.h`
- `Private/Iris/ReplicationSystem/ReplicationDataStream.cpp`
- `Private/Iris/ReplicationSystem/ReplicationWriter.h`
- `Private/Iris/ReplicationSystem/ReplicationWriter.cpp`
- `Private/Iris/ReplicationSystem/ReplicationReader.h`
- `Private/Iris/ReplicationSystem/ReplicationReader.cpp`
- `Private/Iris/ReplicationSystem/ReplicationRecord.h`
- `Private/Iris/ReplicationSystem/ReplicationConnections.h`
- `Private/Iris/ReplicationSystem/ReplicationConnections.cpp`
- Replication Protocol Operations、Fragment 与 Bridge 的实际应用路径

### ChunkedDataStream

- `Public/Iris/ReplicationSystem/ChunkedDataStream/ChunkedDataStream.h`
- `Private/Iris/ReplicationSystem/ChunkedDataStream/ChunkedDataStream.cpp`
- `Private/Iris/ReplicationSystem/ChunkedDataStream/ChunkedDataStreamCommon.h`
- `Private/Iris/ReplicationSystem/ChunkedDataStream/ChunkedDataWriter.h`
- `Private/Iris/ReplicationSystem/ChunkedDataStream/ChunkedDataWriter.cpp`
- `Private/Iris/ReplicationSystem/ChunkedDataStream/ChunkedDataReader.h`
- `Private/Iris/ReplicationSystem/ChunkedDataStream/ChunkedDataReader.cpp`

### Tests

- `Engine/Plugins/Runtime/ReplicationSystemTestPlugin/Source/Private/Tests/DataStream`
- 与 Writer、Reader、PacketDeliveryStatus、Huge Object 和 ChunkedDataStream 相关的自动化测试

网络资料只使用 Epic Games 官方 UE 5.7 文档和 API 页面作为主要技术来源。内部实现以本地源码快照为准。

## 技术准确性规则

- 不从 UE 5.5 的路径或接口反推 UE 5.7。
- 不把大纲中的“带宽分配”直接描述成权重公平调度。
- 不把脏属性发现全部归给 `FReplicationWriter`。
- 不把 DataStream 接口本身描述成自动可靠。
- 不把对象状态复制描述成可靠事件队列。
- 不把 Lost 描述成必然原包原样重发。
- 不把 RepNotify 描述成 Reader 解析字段时直接调用。
- 不把 `UChunkedDataStream` 和 Huge Object / Partial NetObject Attachment 混为一谈。
- 不把 `ChunkSize`、sequence 位数和缓冲默认值描述成跨版本永久常量。
- 不提前展开第九部分的 NetBlob Handler 体系。
- 不提前展开第十部分的 Baseline Manager 和 Delta 算法。
- 不引用易漂移的精确源码行号；使用文件和符号名。
- 源码摘录、解释性伪代码和案例计算要明确标记。
- 无法从源码确认的调度或顺序细节退回概念级说明。

## 页面与视觉设计

复用第七部分的编辑型技术文章样式：

- 深蓝渐变 Hero。
- 桌面端粘性目录并允许内部滚动。
- 移动端折叠目录。
- 阅读进度条。
- 桌面和移动端当前章节高亮。
- 代码块与宽表格独立横向滚动。
- 返回顶部按钮。
- 原创来源、UE 5.7.4 基线和官方资料页尾说明。

Hero：

- 主标题：`UE5-Iris 网络复制系统技术分析`
- 副标题：`第八部分：数据流与传输`
- 标签突出 `UE 5.7.4`、`DataStream`、`Writer / Reader` 与 `Packet Delivery`

主要可视化全部使用 HTML/CSS 文本图，不生成装饰性图片：

1. 发送、接收和投递反馈总流程。
2. `UDataStream` 生命周期与 Record 回路。
3. Manager 中多流共享包预算示意。
4. Writer 的对象状态、可靠 Attachment、非可靠 Attachment 丢包分支。
5. Reader 的 Read、Resolve、Dispatch、Apply、RepNotify 阶段图。
6. Chunk sequence、ACK、重发与组装时间线。
7. `ChunkedDataStream` 与 Huge Object 路径对照表。

顶级目录包含：

- 导读。
- `8.1` 至 `8.5`。
- 端到端案例与故障排查。
- 关键源码索引。
- 下一部分。

## Hexo Post

创建：

`source/_posts/ue5-iris-guide-part-8.md`

Front Matter：

- 标题：`UE5-Iris 网络复制系统技术分析 - 第八部分：数据流与传输`
- 日期：实施时写入 2026-07-24 的具体时刻。
- 标签：`UE`、`Iris`、`网络复制`
- ID：`ue5-iris-guide-part-8`
- 分类：`笔记`

正文包括：

- 端到端数据旅程摘要。
- UE 5.7.4 技术基线说明。
- `<!-- more -->`
- `[打开完整 HTML 文章](/html-articles/ue5-iris-guide-part-8/)`

不修改 Part 7 未提交文章，除非用户另行要求补充前后篇链接。

## 错误处理与故障排查

至少覆盖：

- DataStream 定义缺失或两端索引不一致。
- 动态流一直停在 `WaitOnCreateConfirmation`。
- `SetSendStatus(Pause)` 后误判为 Writer 无数据。
- Writer 有脏状态但对象不在连接 scope。
- 对象有优先级但当前包容量不足。
- BitStream overflow 后错误提交半个对象 batch。
- 包 Lost 后把状态与可靠事件用同一种重试模型处理。
- Reader batch 长度不一致或 underflow。
- 对象 Handle 无效。
- 父对象或 MustBeMapped 引用未就绪。
- 状态已反序列化但尚未派发，误以为游戏对象应立即变化。
- RepNotify 未执行或执行时机与预期不一致。
- ChunkedDataStream 发送队列满。
- 接收端未及时 Dispatch 导致未派发缓冲超过上限。
- sequence/组装错误导致流关闭。
- 把通用 ChunkedDataStream 当成 ReplicationWriter Huge Object 内部实现。

排查顺序：

```text
连接与 DataStream 状态
→ Manager 是否允许发送
→ Writer Scope / Priority / Dirty ChangeMask
→ WriteData 结果与写入位数
→ Packet Delivery Status
→ Reader 位流错误
→ Handle / Dependency / Reference
→ DispatchStateData
→ Dequantize / Apply / RepNotify
```

## 验收标准

### 内容

- 覆盖大纲 `8.1` 至 `8.5` 的全部主题。
- DataStream 生命周期和 Record 回调关系准确。
- Manager 多流协调与“带宽分配”边界清楚。
- Writer 的脏数据输入、调度、序列化和投递反馈路径完整。
- 对象状态、可靠 Attachment 和非可靠 Attachment 语义明确区分。
- Reader 的读取、引用解析、派发、应用和 RepNotify 边界准确。
- ChunkedDataStream 的当前 UE 5.7.4 chunk、sequence、ACK 和缓冲模型可从源码复核。
- 明确区分 ChunkedDataStream 与 Huge Object / NetBlob。
- 百人大逃杀主案例从发送走到接收和 ACK/Lost。
- 大载荷案例计算自洽，并声明解释性假设。
- 含故障排查、源码索引、术语速查和下一部分预告。

### 技术

- 所有公开类、函数、枚举和常量均与 UE 5.7.4 源码核对。
- Writer/Reader 内部符号来自当前本地源码。
- 默认 DataStream 配置经 `BaseEngine.ini` 与定义代码交叉核对。
- RepNotify 结论经 Fragment/Bridge 应用路径核对。
- Packet Delivery Status 行为经实现与测试交叉核对。
- 源码摘录、伪代码和解释性案例标注清晰。
- 外部技术链接只使用 Epic 官方 UE 5.7 页面。

### 页面

- HTML 与 Post 均为 UTF-8，无替换字符。
- 所有目录锚点存在且 ID 不重复。
- Post 能跳转到完整 HTML。
- 桌面端无页面级横向溢出，粘性目录和高亮正常。
- 移动端无页面级横向溢出，目录可展开并高亮。
- 代码块和宽表格可以独立横向滚动。
- 阅读进度和返回顶部正常。
- 页面脚注明原创来源和 UE 5.7.4 技术依据。
- 控制台无 JavaScript 错误。

### 构建与验证

- `npm run build` 成功。
- 生成：
  - `/ue5-iris-guide-part-8/`
  - `/html-articles/ue5-iris-guide-part-8/`
- 静态检查确认：
  - `8.1` 至 `8.5` 全部存在。
  - 锚点和本地链接有效。
  - 外链安全属性完整。
  - 无 Unicode replacement character。
  - 无未展开模板变量。
  - `git diff --check` 通过。
- 浏览器验证：
  - 桌面视口 `1440×1000`。
  - 移动视口 `390×844`。
  - Post 到完整 HTML 的跳转正确。
- 测试后停止本地服务并清理临时文件。
- 确认 UE 源码仓库状态未因本任务变化。

## 非目标

- 不修改本地 UE 5.7.4 源码。
- 不创建或编译 UE 测试插件。
- 不执行完整 Unreal Engine 构建。
- 不深入底层 Socket、PacketHandler 或拥塞控制。
- 不实现自定义生产 DataStream 类。
- 不完整展开 NetBlob、RPC 或 Attachment Handler 体系。
- 不完整展开 Delta Compression 与 Baseline Manager。
- 不生成装饰性插图。
- 不修改或提交当前未提交的 Part 7 HTML/Post。
- 正文实现完成后保持未提交，等待用户单独要求 `commit`。
