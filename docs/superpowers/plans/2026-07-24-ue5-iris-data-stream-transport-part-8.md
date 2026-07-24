# UE5 Iris 第八部分：数据流与传输实施计划

## 交付目标

依据已批准的设计规格：

- `docs/superpowers/specs/2026-07-24-ue5-iris-data-stream-transport-part-8-design.md`

新增：

- `source/html-articles/ue5-iris-guide-part-8/index.html`
- `source/_posts/ue5-iris-guide-part-8.md`

完整文章路由：

- `/html-articles/ue5-iris-guide-part-8/`

Hexo Post 路由：

- `/ue5-iris-guide-part-8/`

技术基线为本地 Unreal Engine 5.7.4。实施期间只读访问 `C:\work\st-unreal-engine`，不修改该源码仓库。Part 8 内容实现完成后保持未提交，等待用户单独要求 `commit`。

当前工作树中 Part 7 HTML 与 Post 尚未提交。本计划及后续操作不得覆盖、删除或误提交它们。

## 任务 1：建立 UE 5.7.4 技术事实表

### 版本与仓库状态

核对：

- `C:/work/st-unreal-engine/Engine/Build/Build.version`
- UE 源码仓库当前 `git status --short`
- Iris 根目录 `Engine/Source/Runtime/Net/Iris`

记录任务开始前的 UE 仓库状态，交付前再次对比。

### DataStream 接口

核对：

- `Public/Iris/DataStream/DataStream.h`
- `Public/Iris/DataStream/DataStreamManager.h`
- `Private/Iris/DataStream/DataStream.cpp`
- `Private/Iris/DataStream/DataStreamManager.cpp`
- `Private/Iris/DataStream/DataStreamDefinitions.h`
- `Private/Iris/DataStream/DataStreamDefinitions.cpp`

提取并确认：

1. `UDataStream` 生命周期接口。
2. `FInitParameters`、`FBeginWriteParameters`、`FUpdateParameters`。
3. `EDataStreamWriteMode`。
4. `EWriteResult`。
5. `EDataStreamState`。
6. `EDataStreamSendStatus`。
7. `FDataStreamRecord` 所有权和回调保证。
8. `HasAcknowledgedAllReliableData` 的接口边界。
9. 动态创建和关闭的状态迁移。

### DataStreamManager

从实现中确认：

1. 活动流的存储和索引。
2. `BeginWrite` 如何汇总子流状态。
3. `WriteData` 如何记录哪些流写入当前包。
4. 子流写入溢出或失败时如何恢复 Writer 位置。
5. `ReadData` 如何选择流并分派。
6. `ProcessPacketDeliveryStatus` 如何遍历包级记录。
7. `Pause`、`Send`、`NoData`、`Ok`、`HasMoreData` 的组合语义。
8. 创建/关闭控制信息如何写入和确认。
9. Manager 是否存在权重、公平份额或独立带宽分配算法。

如果源码只体现“共享剩余位预算和顺序协调”，正文明确修正大纲的“带宽分配”措辞。

### 默认流定义

核对：

- `Engine/Config/BaseEngine.ini`
- `FDataStreamDefinition`
- `UDataStreamDefinitions::FixupDefinitions`

确认 UE 5.7.4 当前快照的：

- `NetToken`
- `Replication`
- `DefaultSendStatus`
- `bAutoCreate`
- `bDynamicCreate`

由于本地 UE 仓库的 `BaseEngine.ini` 在任务开始前已被用户修改，不单独依赖该文件做永久默认值结论；与定义代码、连接初始化和测试配置交叉核对。

### 完成标准

- 所有正文接口、枚举值和状态名都能映射到 UE 5.7.4 文件和符号。
- 没有沿用大纲中未经核对的 UE 5.5 行为。
- 没有把 DataStream 接口本身误写为自动可靠。

## 任务 2：核对 ReplicationDataStream、Writer 与 Reader

### 适配层

核对：

- `Private/Iris/ReplicationSystem/ReplicationDataStream.h`
- `Private/Iris/ReplicationSystem/ReplicationDataStream.cpp`

确认每个 DataStream 回调转发到 Writer/Reader 的真实函数。

### Writer

核对：

- `Private/Iris/ReplicationSystem/ReplicationWriter.h`
- `Private/Iris/ReplicationSystem/ReplicationWriter.cpp`
- `Private/Iris/ReplicationSystem/ReplicationRecord.h`
- `Private/Iris/ReplicationSystem/AttachmentReplication.h`
- `Private/Iris/ReplicationSystem/AttachmentReplication.cpp`

重点提取：

1. 对象生命周期状态。
2. `UpdateScope`、`UpdateDirtyChangeMasks`、`UpdatePriorities` 等输入。
3. `BeginWrite`、`Write`、`EndWrite`。
4. `WriteObjects`。
5. `WriteObjectBatch`。
6. `WriteObjectAndSubObjects`。
7. 创建、销毁和 TearOff 路径。
8. 当前包预算不足时的回滚。
9. full state 与 delta state 的选择边界。
10. `ProcessDeliveryNotification`。
11. Delivered、Lost、Discard 对状态和 Attachment 的不同处理。
12. `AreAllReliableAttachmentsSentAndAcked`。

正文必须把“原始脏检测”和“Writer 同步逐连接 ChangeMask 并调度对象”分开。

### Reader

核对：

- `Private/Iris/ReplicationSystem/ReplicationReader.h`
- `Private/Iris/ReplicationSystem/ReplicationReader.cpp`
- Replication Protocol Operations。
- `FDequantizeAndApplyHelper`。
- Replication Fragment 与 Bridge apply 路径。

重点提取：

1. `FReplicationReader::Read` 的顶层阶段。
2. destroy、object batch 和 Attachment 解析。
3. 初始状态、普通状态、delta 状态的反序列化入口。
4. receive state buffer。
5. Handle、父对象、creation dependency 和 MustBeMapped reference。
6. deferred batch。
7. `DispatchStateData`。
8. Apply 前后的 Attachment 顺序。
9. Legacy pre/post apply 与 RepNotify 的真实边界。
10. bitstream overflow、underflow 和错误传播。

### 可靠性事实表

正文采用三分法并逐项寻找源码依据：

| 数据类型 | Lost 后行为 | 目标语义 |
| --- | --- | --- |
| 对象状态 | 重新调度相关状态或发送更新后的最新状态 | 最终收敛 |
| 可靠 Attachment | 保留、重排并等待 ACK | 可靠事件 |
| 非可靠 Attachment | 不按可靠队列重发 | 一次尝试 |

避免宣称“状态包总是可靠”或“Lost 后原包原样发送”。

### 完成标准

- 主流程图与 UE 5.7.4 真实入口一致。
- RepNotify 不被描述成 Reader 直接逐字段调用。
- 第九部分 NetBlob 与第十部分 Delta/Baseline 边界清楚。

## 任务 3：核对 ChunkedDataStream

核对：

- `Public/Iris/ReplicationSystem/ChunkedDataStream/ChunkedDataStream.h`
- `Private/Iris/ReplicationSystem/ChunkedDataStream/ChunkedDataStream.cpp`
- `Private/Iris/ReplicationSystem/ChunkedDataStream/ChunkedDataStreamCommon.h`
- `Private/Iris/ReplicationSystem/ChunkedDataStream/ChunkedDataWriter.h`
- `Private/Iris/ReplicationSystem/ChunkedDataStream/ChunkedDataWriter.cpp`
- `Private/Iris/ReplicationSystem/ChunkedDataStream/ChunkedDataReader.h`
- `Private/Iris/ReplicationSystem/ChunkedDataStream/ChunkedDataReader.cpp`

确认：

1. Experimental 定位。
2. `EnqueuePayload`。
3. 发送和接收缓冲上限。
4. `ChunkSize`。
5. `SequenceBitCount` 和 sequence mask。
6. 最大未确认 chunk 数。
7. 首块、连续 sequence 与 export chunk 标志。
8. `DataChunksPendingSend` 和 `DataChunksPendingAck`。
9. Sent/Acked 位图。
10. Delivered/Lost 处理。
11. `ExpectedSeq` 和组装队列。
12. `DispatchReceivedPayload`。
13. MustBeMapped references。
14. 未派发缓冲溢出后的错误状态。

### 64 KiB 案例

计算并复核：

```text
PayloadBytes = 65536
ChunkSize = 192
ChunkCount = ceil(65536 / 192)
LastChunkBytes = 65536 - floor(65536 / 192) * 192
```

若余数为 0，最后一块仍是完整 chunk；正文按实际计算结果表述。

### Huge Object 边界

从 Writer/Reader 的 Huge Object、PartialNetObjectAttachmentHandler 和 Attachment 路径提取最少必要事实，生成与 `UChunkedDataStream` 的对照表，不展开 NetBlob 类型体系。

### 完成标准

- 所有常量按 5.7.4 当前实现标记。
- 64 KiB 计算正确。
- 通用 ChunkedDataStream 与复制系统内部 Huge Object 路径不混淆。

## 任务 4：编写文章内容

### 顶级结构

1. 第八部分导读。
2. 端到端传输总览。
3. 8.1 DataStream 系统。
4. 8.2 DataStreamManager。
5. 8.3 ReplicationWriter。
6. 8.4 ReplicationReader。
7. 8.5 ChunkedDataStream。
8. 百人大逃杀端到端案例。
9. 故障排查。
10. 关键源码索引。
11. 总结和下一部分预告。

### 8.1

至少包含：

- DataStream 解决的问题。
- 生命周期表。
- WriteMode 与 EWriteResult 表。
- Record 所有权与投递反馈图。
- 动态流状态图。
- DataStream 不自动提供统一可靠性的说明。

### 8.2

至少包含：

- 定义和自动/动态创建。
- UE 5.7.4 默认核心流。
- 多流包结构的解释图。
- Manager 写入/读取/反馈三条路径。
- Pause 和 Send。
- “带宽分配”校准。
- 创建与关闭握手。

### 8.3

至少包含：

- ReplicationDataStream 适配关系。
- Writer 输入表。
- 对象生命周期状态。
- BeginWrite/Write/EndWrite 主流程。
- batch、subobject、destroy 与附件。
- 包预算与回滚。
- 状态/可靠附件/非可靠附件三分法。
- Delivered/Lost/Discard 分叉。
- Delta 只讲交接点。

### 8.4

至少包含：

- Read 顶层流程。
- 对象创建与更新。
- initial/full/delta deserialize。
- receive state buffer。
- 引用、依赖和 deferred batch。
- Dispatch 与 Apply。
- RepNotify 准确边界。
- 错误处理。

### 8.5

至少包含：

- Experimental 定位和创建要求。
- 发送队列、分块与 sequence。
- ACK、丢包和重发。
- 接收组装和派发。
- exports/MustBeMapped。
- 缓冲上限。
- 64 KiB 解释性案例。
- 与 Huge Object 的对照表。

### 内容标记

正文明确区分：

1. UE 5.7.4 源码事实。
2. 解释性伪代码或流程图。
3. 百人大逃杀案例假设。
4. 跨版本可能变化的实现值。

## 任务 5：生成 HTML 页面

复用 Part 7 的稳定样式和交互：

- CSS 变量。
- Hero。
- 桌面粘性目录。
- 移动折叠目录。
- 当前章节高亮。
- 阅读进度。
- 返回顶部。
- 代码块与表格横向滚动。

通过 `apply_patch` 创建临时 Node 生成脚本。脚本读取 Part 7 HTML，保留通用 CSS/JS 外壳，替换：

- metadata。
- canonical URL。
- Hero 标题、标签和 deck。
- 桌面/移动目录。
- source note。
- article body。
- footer。

运行生成脚本创建：

`source/html-articles/ue5-iris-guide-part-8/index.html`

生成后用 `apply_patch` 删除临时脚本。

HTML 需要：

- `lang="zh-CN"`。
- UTF-8。
- 正确 author、description、canonical 和 title。
- Epic 外链使用 `target="_blank" rel="noopener noreferrer"`。
- 来源注明 Jossy Zhang 原创整理。
- 技术依据注明 UE 5.7.4 与 Epic 官方 UE 5.7。
- 上一篇链接到 Part 7。
- 下一篇预告为第九部分 NetBlob 系统。

不修改 Part 7 文件。

## 任务 6：创建 Hexo Post

使用 `apply_patch` 创建：

`source/_posts/ue5-iris-guide-part-8.md`

包含：

- 正确 Front Matter。
- 文章摘要。
- UE 5.7.4 官方/源码依据。
- `<!-- more -->`。
- 完整 HTML 链接。

日期使用 2026-07-24 的实施时刻。

## 任务 7：静态检查

自动检查：

1. HTML 只有一个文档结构。
2. 所有 ID 唯一。
3. 所有 hash 链接有目标。
4. 桌面与移动目录项目一致。
5. 所有外部新窗口链接有安全属性。
6. `8.1` 至 `8.5` 均存在。
7. 关键类名存在。
8. 无 Unicode replacement character。
9. 无未展开模板变量。
10. Post 路由正确。
11. `git diff --check` 通过。
12. Part 7 文件内容未被本任务改变。

技术检查：

- Manager 不被写成公平调度器。
- Writer 不被写成原始脏属性扫描器。
- 状态、可靠附件、非可靠附件明确区分。
- RepNotify 路径表述准确。
- ChunkedDataStream 常量和缓冲值来自 5.7.4。
- ChunkedDataStream 与 Huge Object 明确区分。

## 任务 8：Hexo 构建

运行：

```powershell
npm run build
```

验证：

- `public/ue5-iris-guide-part-8/index.html`
- `public/html-articles/ue5-iris-guide-part-8/index.html`

检查构建日志、UTF-8 内容、摘要链接和静态 HTML 拷贝结果。

## 任务 9：浏览器验收

浏览器验收前读取并遵循当前环境提供的 `playwright-cli` 技能。

启动独立 Hexo 预览服务，记录 PID，避免影响用户已有服务。

### 桌面端 `1440×1000`

- Hero 和 UE 5.7.4 标签。
- 原创来源说明。
- 粘性目录和当前章节高亮。
- 所有顶级章节跳转。
- Writer/Reader 流程图。
- 可靠性对照表。
- ChunkedDataStream 与 Huge Object 对照表。
- 阅读进度和返回顶部。
- 无页面级横向溢出。

### 移动端 `390×844`

- 桌面目录隐藏。
- 折叠目录可以展开。
- 当前章节高亮。
- 长代码和宽表格独立横向滚动。
- inline code、长路径和链接正常换行。
- 无页面级横向溢出。

### Post

- 打开 `/ue5-iris-guide-part-8/`。
- 确认摘要与来源。
- 点击完整文章链接到达正确路由。

### 运行时

- 控制台无 JavaScript 错误。
- 内部锚点和返回顶部正常。
- 桌面/移动视口测试完成后恢复浏览器状态。

## 任务 10：清理与交付

1. 停止本次 Hexo 预览服务。
2. 删除临时生成脚本、日志和截图。
3. 再次检查 UE 源码仓库状态，确认与任务开始前一致。
4. 检查博客仓库状态：
   - 保留原有 Part 7 未提交文件。
   - 只新增 Part 8 HTML 与 Post。
   - 不提交 Part 8 内容。
5. 汇总静态检查、构建和浏览器验收结果。

## 最终验收清单

- [ ] UE 5.7.4 DataStream 技术事实核对完成。
- [ ] Manager 多流协调与带宽边界准确。
- [ ] Writer 输入、调度和投递反馈准确。
- [ ] Reader 解析、派发、Apply 与 RepNotify 边界准确。
- [ ] 三类可靠性语义清楚。
- [ ] ChunkedDataStream 常量与状态来自 5.7.4。
- [ ] ChunkedDataStream 与 Huge Object 未混淆。
- [ ] 64 KiB 案例计算正确。
- [ ] 8.1–8.5 全部覆盖。
- [ ] HTML 与 Post 路由正确。
- [ ] 静态检查通过。
- [ ] Hexo 构建通过。
- [ ] 桌面与移动浏览器验收通过。
- [ ] 临时文件和服务已清理。
- [ ] UE 源码仓库未被修改。
- [ ] Part 7 用户文件未被改变或误提交。
- [ ] Part 8 内容保持未提交。
