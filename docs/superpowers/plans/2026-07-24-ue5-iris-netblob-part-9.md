# UE5 Iris 第九部分：NetBlob 系统实施计划

## 交付目标

依据已批准的设计规格：

- `docs/superpowers/specs/2026-07-24-ue5-iris-netblob-part-9-design.md`

新增：

- `source/html-articles/ue5-iris-guide-part-9/index.html`
- `source/_posts/ue5-iris-guide-part-9.md`

目标路由：

- `/html-articles/ue5-iris-guide-part-9/`
- `/ue5-iris-guide-part-9/`

技术基线为本地 Unreal Engine 5.7.4。实施期间只读访问 `C:\work\st-unreal-engine`，不修改该源码仓库。

当前博客工作树中 Part 7 和 Part 8 HTML/Post 尚未提交。本计划及后续操作不得覆盖、删除、暂存或误提交这些文件。Part 9 内容实施完成后同样保持未提交，等待用户单独要求 `commit`。

## 任务 1：建立 UE 5.7.4 技术事实表

### 版本与初始状态

核对：

- `Engine/Build/Build.version`
- UE 源码仓库 `git status --short`
- Iris 根目录 `Engine/Source/Runtime/Net/Iris`
- ReplicationSystemTestPlugin 中的 NetBlob 测试

记录任务开始前的 UE 仓库状态，交付前再次对比。

### 核心 NetBlob 类型

核对：

- `Public/Iris/ReplicationSystem/NetBlob/NetBlob.h`
- `Private/Iris/ReplicationSystem/NetBlob/NetBlob.cpp`
- `Public/Iris/ReplicationSystem/ReplicationSystemTypes.h`

确认：

1. `FNetBlobCreationInfo` 的 `Type` 和 `Flags`。
2. `InvalidNetBlobType`。
3. `ENetBlobFlags` 各标志的真实语义。
4. `Reliable` 与 `Ordered` 的关系。
5. `FNetBlob` 的 Descriptor/量化状态路径。
6. `Serialize` / `Deserialize`。
7. `SerializeWithObject` / `DeserializeWithObject`。
8. 引用计数和动态状态释放。
9. `HasExports`、对象引用导出与 NetToken 导出。
10. `FNetObjectAttachment` 的 owner/target 对象引用。

### Manager 与发送策略

核对：

- `Private/Iris/ReplicationSystem/NetBlob/NetBlobManager.h`
- `Private/Iris/ReplicationSystem/NetBlob/NetBlobManager.cpp`
- `Public/Iris/ReplicationSystem/ReplicationSystemTypes.h`

确认：

1. Manager 初始化依赖。
2. 默认 Handler 注册。
3. 自定义 Handler 注册入口。
4. 单播和多播附件排队。
5. root object 与 subobject 校验。
6. Scope 内/外队列处理。
7. 普通队列与 OOB 队列。
8. `None`、`ScheduleAsOOB`、`SendInPostTickDispatch`、`SendImmediate`。
9. OOB 只对不可靠附件有效的约束。
10. 预序列化和分片入口。
11. 多播与连接特定序列化。
12. Manager 与逐连接 Attachment 队列的边界。

### 完成标准

- 所有正文类型、枚举、常量和行为能映射到 UE 5.7.4 文件与符号。
- 不沿用未经核对的 UE 5.5 行为。
- 不把 NetBlob 写成独立 DataStream。

## 任务 2：核对 Handler 类型体系

核对：

- `Public/Iris/ReplicationSystem/NetBlob/NetBlobHandler.h`
- `Private/Iris/ReplicationSystem/NetBlob/NetBlobHandler.cpp`
- `Private/Iris/ReplicationSystem/NetBlob/NetBlobHandlerManager.h`
- `Private/Iris/ReplicationSystem/NetBlob/NetBlobHandlerManager.cpp`
- `Private/Iris/ReplicationSystem/NetBlob/NetBlobHandlerDefinitions.h`
- `Private/Iris/ReplicationSystem/NetBlob/NetBlobHandlerDefinitions.cpp`
- `Engine/Config/BaseEngine.ini`

确认：

1. `INetBlobReceiver`。
2. `UNetBlobHandler::CreateNetBlob`。
3. `UNetBlobHandler::OnNetBlobReceived`。
4. 逐连接回调。
5. Handler Definitions 的配置字段。
6. Type 分配和映射规则。
7. `FNetBlobHandlerManager::RegisterHandler`。
8. `CreateNetBlob` 和 `OnNetBlobReceived` 的错误路径。
9. `GNetError_UnsupportedNetBlob`。
10. 自动注册 Handler 与用户注册 Handler 的区别。
11. 两端配置和注册一致性要求。
12. Handler 数量、Type 位数或其他当前实现限制。

本地 `BaseEngine.ini` 在任务开始前已有用户修改。配置结论必须与定义代码和测试交叉核对，不把用户覆盖项写成永久引擎默认值。

### 完成标准

- Type 到 Handler 的创建、路由和错误链准确。
- 自定义 Handler 清单不包含未经编译验证的生产代码。
- RPC 只作为 Handler 实例和边界提示。

## 任务 3：核对 PartialNetBlob 与组装

核对：

- `Public/Iris/ReplicationSystem/NetBlob/PartialNetBlob.h`
- `Private/Iris/ReplicationSystem/NetBlob/PartialNetBlob.cpp`
- `Public/Iris/ReplicationSystem/NetBlob/NetBlobAssembler.h`
- `Private/Iris/ReplicationSystem/NetBlob/NetBlobAssembler.cpp`
- `Public/Iris/ReplicationSystem/NetBlob/SequentialPartialNetBlobHandler.h`
- `Private/Iris/ReplicationSystem/NetBlob/SequentialPartialNetBlobHandler.cpp`
- `Private/Iris/ReplicationSystem/NetBlob/PartialNetObjectAttachmentHandler.h`
- `Private/Iris/ReplicationSystem/NetBlob/PartialNetObjectAttachmentHandler.cpp`

确认：

1. 分片前预序列化路径。
2. `FPartialNetBlob` 的 CreationInfo、序列、首片和末片信息。
3. 原始 Blob Type/Flags 的还原方式。
4. 对象引用和 NetToken exports 的携带方式。
5. `MaxPartBitCount`。
6. `MaxPartCount`。
7. 总载荷上限的推导。
8. 分片数量计算。
9. 可靠与不可靠分片的差异。
10. `FNetBlobAssembler::AddPartialNetBlob`。
11. `IsReadyToAssemble`。
12. `IsSequenceBroken`。
13. `Assemble`。
14. 首片缺失、序列断裂、超限和位流错误。

正文中的 128 字节、4096 片和 512 KiB 仅在源码确认后使用，并标注为当前类默认值，可被配置覆盖。

### Partial 与 ChunkedDataStream 边界

生成对照表，至少区分：

- 所属外层。
- 入口 API。
- 分片格式。
- 可靠队列和 ACK 路径。
- 目标对象绑定。
- 接收端组装器。
- 配置和大小边界。

不把第八部分的 ChunkedDataStream sequence、chunk 大小或窗口值套用到 PartialNetBlob。

## 任务 4：核对特殊类型与可靠队列

核对：

- `Public/Iris/ReplicationSystem/NetBlob/RawDataNetBlob.h`
- `Private/Iris/ReplicationSystem/NetBlob/RawDataNetBlob.cpp`
- `Public/Iris/ReplicationSystem/NetBlob/ShrinkWrapNetBlob.h`
- `Private/Iris/ReplicationSystem/NetBlob/ShrinkWrapNetBlob.cpp`
- `Public/Iris/ReplicationSystem/NetBlob/ReliableNetBlobQueue.h`
- `Private/Iris/ReplicationSystem/NetBlob/ReliableNetBlobQueue.cpp`
- `Private/Iris/ReplicationSystem/AttachmentReplication.h`
- `Private/Iris/ReplicationSystem/AttachmentReplication.cpp`

确认：

1. RawData 的位缓冲存储与序列化。
2. RawData 的分片/组装快速路径。
3. ShrinkWrap 预序列化和多目标复用。
4. ShrinkWrap 对 exports 的保留。
5. 接收端仍按原始 Blob 类型处理。
6. ShrinkWrap 不保证减少位数。
7. `FReliableNetBlobQueue` 不是 Blob 子类。
8. `MaxUnackedBlobCount`。
9. 发送窗口和 sequence 到槽位映射。
10. Sent/Acked 位图。
11. `FReplicationRecord` 的序列段数量和位宽。
12. Serialize、Commit 和 Delivery Status 顺序。
13. Delivered、Lost 与 Discard。
14. 接收端 Peek/Pop 和不可靠队列处理。
15. reliable/unreliable/ordered 在 AttachmentReplication 中的实际集成。

### 完成标准

- 可靠队列的数字与当前 5.7.4 实现一致。
- 不把 ShrinkWrap 写成压缩算法。
- 不把 RawData 写成推荐的大文件接口。
- Delivered/Lost/Discard 不混淆。

## 任务 5：用测试交叉核对行为

核对：

- `Engine/Plugins/Runtime/ReplicationSystemTestPlugin/Source/Private/Tests/ReplicationSystem/NetBlob`
- 相关 Attachment 与 ReplicationWriter/Reader 测试

重点寻找：

1. Handler 注册与 Unsupported 类型。
2. RawData 序列化。
3. Partial 分片和组装。
4. reliable/unreliable Partial 序列。
5. 序列断裂和错误传播。
6. ReliableNetBlobQueue 的 ACK、NAK、重发、乱序和窗口。
7. 多个离散发送序列。
8. Packet Delivery Status 对附件的影响。

测试与实现不一致时，以当前实现和测试共同支持的最窄结论为正文表述。

## 任务 6：编写完整 HTML 文章

创建：

`source/html-articles/ue5-iris-guide-part-9/index.html`

复用 Part 8 的稳定页面结构和交互，不修改 Part 8：

- metadata 与 canonical。
- Hero。
- 桌面粘性目录。
- 移动折叠目录。
- 阅读进度。
- 当前章节高亮。
- 返回顶部。
- 代码块和宽表格独立横向滚动。

顶级结构：

1. 导读。
2. 9.1 NetBlob 概述。
3. 9.2 NetBlobManager。
4. 9.3 NetBlobHandler 体系。
5. 9.4 Blob 分片与组装。
6. 9.5 特殊 Blob 类型与支撑组件。
7. 端到端案例。
8. 故障排查。
9. 关键源码索引。
10. 总结与下一部分。

文章必须包含：

- 状态复制与附件双路径。
- Type + Flags 速查。
- Manager/Handler 路由。
- 自定义 Handler 注册清单。
- send policy 表。
- reliable/unreliable/ordered 语义表。
- Partial 分片字段和组装时间线。
- ReliableQueue ACK/Lost/Discard 时间线。
- RawData、ShrinkWrap、Partial、ReliableQueue 对照。
- Partial 与 ChunkedDataStream 对照。
- 小型可靠附件、大型可靠分片和不可靠 Ordered 三个案例分支。
- 故障排查矩阵。
- UE 5.7.4 源码索引和官方资料。

页面要求：

- `lang="zh-CN"`。
- UTF-8。
- title、description、author 和 canonical 正确。
- Epic 外链使用 `target="_blank" rel="noopener noreferrer"`。
- 来源注明 Jossy Zhang 原创整理。
- 技术依据注明本地 UE 5.7.4 与 Epic 官方 UE 5.7。
- 上一部分链接到 Part 8。
- 下一部分预告第十部分 Delta Compression。

## 任务 7：创建 Hexo Post

使用 `apply_patch` 创建：

`source/_posts/ue5-iris-guide-part-9.md`

包含：

- 正确 Front Matter。
- NetBlob 生命周期摘要。
- UE 5.7.4 官方/源码依据。
- `<!-- more -->`。
- `[打开完整 HTML 文章](/html-articles/ue5-iris-guide-part-9/)`。

日期使用 2026-07-24 的实施时刻。

## 任务 8：静态检查

自动检查：

1. HTML 只有一个文档结构。
2. 所有 ID 唯一。
3. 所有 hash 链接有目标。
4. 桌面与移动目录项目一致。
5. 所有外部新窗口链接有安全属性。
6. `9.1` 至 `9.5` 均存在。
7. 关键类型和常量存在。
8. 无 Unicode replacement character。
9. 无未展开模板变量。
10. Post 路由正确。
11. `git diff --check` 通过。
12. Part 7、Part 8 文件未被改变。

技术检查：

- NetBlob 未被写成独立 DataStream。
- Reliable 隐含 Ordered。
- 不可靠 Ordered 不被写成可靠重发。
- OOB 限制表述准确。
- Handler Type 路由准确。
- ReliableQueue 不被写成 Blob 子类。
- ShrinkWrap 不被写成压缩算法。
- Partial 默认值来自 UE 5.7.4。
- Partial 与 ChunkedDataStream 未混淆。
- RPC、对象引用和 Delta 边界清楚。

## 任务 9：Hexo 构建

运行：

```powershell
npm run build
```

验证：

- `public/ue5-iris-guide-part-9/index.html`
- `public/html-articles/ue5-iris-guide-part-9/index.html`

检查构建日志、UTF-8 内容、摘要链接和完整 HTML 拷贝结果。

## 任务 10：浏览器验收

浏览器验收前读取并遵循当前环境提供的 `playwright-cli` 技能。

启动独立 Hexo 预览服务，记录进程或端口，避免影响用户已有服务。

### 桌面端 `1440×1000`

- Hero 和 UE 5.7.4 标签。
- 原创来源说明。
- 粘性目录和当前章节高亮。
- 所有顶级章节跳转。
- Manager/Handler 路由图。
- Partial 分片与组装时间线。
- ReliableQueue 投递反馈图。
- 类型及 Partial/Chunked 对照表。
- 阅读进度和返回顶部。
- 无页面级横向溢出。

### 移动端 `390×844`

- 桌面目录隐藏。
- 折叠目录可展开。
- 当前章节高亮。
- 长代码和宽表格独立横向滚动。
- inline code、长路径和链接正常换行。
- 无页面级横向溢出。

### Post

- 打开 `/ue5-iris-guide-part-9/`。
- 确认摘要和来源。
- 点击完整文章链接到达正确路由。

### 运行时

- 控制台无本文引入的 JavaScript 错误。
- 内部锚点和返回顶部正常。

## 任务 11：清理与交付

1. 停止本次 Hexo 预览服务。
2. 删除临时生成脚本、浏览器日志和截图。
3. 再次检查 UE 源码仓库状态，确认与任务开始前一致。
4. 检查博客仓库状态：
   - 保留原有 Part 7 和 Part 8 未提交文件。
   - 只新增 Part 9 HTML 与 Post。
   - 不提交 Part 9 内容。
5. 汇总静态检查、构建和浏览器验收结果。

## 最终验收清单

- [ ] UE 5.7.4 NetBlob 核心类型事实核对完成。
- [ ] Manager 及发送策略准确。
- [ ] Handler Type 注册、创建与路由准确。
- [ ] Partial 分片与 Assembler 组装准确。
- [ ] RawData 和 ShrinkWrap 定位准确。
- [ ] ReliableNetBlobQueue 窗口、记录与投递反馈准确。
- [ ] 状态、可靠附件和不可靠 Ordered 附件明确区分。
- [ ] PartialNetBlob 与 ChunkedDataStream 未混淆。
- [ ] 9.1–9.5 全部覆盖。
- [ ] HTML 与 Post 路由正确。
- [ ] 静态检查通过。
- [ ] Hexo 构建通过。
- [ ] 桌面与移动浏览器验收通过。
- [ ] 临时文件和服务已清理。
- [ ] UE 源码仓库未被修改。
- [ ] Part 7、Part 8 用户文件未被改变或误提交。
- [ ] Part 9 内容保持未提交。
