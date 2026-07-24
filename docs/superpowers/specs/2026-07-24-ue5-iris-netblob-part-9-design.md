# UE5 Iris 技术分析第九部分：NetBlob 系统设计

## 目标

根据现有《UE5 Iris 网络复制系统技术分析指南》大纲，补充系列第九部分“NetBlob 系统”。文章承接第八部分的数据流与投递反馈，把 NetBlob 放回 Iris 的实际复制链路中，沿一份面向对象附件从创建、排队、类型路由、分片、传输、确认到接收组装和 Handler 投递的完整生命周期展开。

技术结论以本地 Unreal Engine 5.7.4 源码为主要依据。大纲中的章节名称保留，但类名、标志位、配置、默认值和行为必须按 UE 5.7.4 重新核对。

完成后的读者应能：

- 解释 `FNetBlob`、`FNetObjectAttachment` 与普通对象状态复制的区别。
- 理解 `FNetBlobCreationInfo` 中 `Type` 和 `Flags` 的协议作用。
- 区分 `Reliable`、`Ordered`、`HasExports` 与 `RawDataNetBlob` 标志。
- 说明 `FNetBlobManager` 如何注册默认 Handler、校验目标、排队附件、处理单播/多播并准备分片。
- 说明 `FNetBlobHandlerManager` 如何按 Type 创建 Blob 并路由到对应 Handler。
- 理解自定义 Handler 在收发两端配置和注册一致性的要求。
- 解释 `FPartialNetBlob` 的分片信息、`FNetBlobAssembler` 的顺序组装与断序检测。
- 区分 `FRawDataNetBlob`、ShrinkWrap 包装和 `FReliableNetBlobQueue` 的职责。
- 正确理解 ShrinkWrap 是预序列化复用，不是通用压缩算法。
- 正确理解 `FReliableNetBlobQueue` 是可靠、有序队列组件，不是 NetBlob 子类。
- 使用日志、错误上下文、队列状态和投递结果排查常见 NetBlob 问题。

## 内容定位

- 标题：`UE5-Iris 网络复制系统技术分析 - 第九部分：NetBlob 系统`
- HTML 页面：`source/html-articles/ue5-iris-guide-part-9/index.html`
- 博客入口：`source/_posts/ue5-iris-guide-part-9.md`
- 完整文章路由：`/html-articles/ue5-iris-guide-part-9/`
- 博客入口路由：`/ue5-iris-guide-part-9/`
- 目标读者：已阅读前八部分、希望理解 Iris 事件附件、类型路由与大载荷分片机制的 UE 网络程序员。
- 技术基线：Unreal Engine 5.7.4。
- 本地源码：`C:\work\st-unreal-engine`
- Iris 源码根目录：`Engine/Source/Runtime/Net/Iris`

本文是根据系列大纲扩写的原创技术内容，不标注为知乎文章转载。页尾注明作者为 Jossy Zhang，技术依据为本地 UE 5.7.4 源码与 Epic Games UE 5.7 官方资料。

本地 UE 源码仓库存在用户改动。研究期间只读访问，不写入、不格式化、不暂存、不提交该源码仓库中的任何文件。

## 方案选择

采用端到端生命周期叙事，而不是按类逐项罗列 API，也不把文章改写成单纯的可靠性排障手册。

主线如下：

```text
游戏事件 / 自定义附件
→ FNetBlobCreationInfo（Type + Flags）
→ FNetObjectAttachment
→ FNetBlobManager 排队与预处理
→ Handler 类型路由
→ 必要时拆成 PartialNetBlob
→ ReplicationWriter / ReplicationDataStream
→ 接收端创建对应 Blob
→ 可靠队列排序或等待缺失分片
→ FNetBlobAssembler 组装
→ Handler::OnNetBlobReceived
```

API、类型和配置说明作为沿途的剖面图、速查表与故障分支出现，不把五个章节写成彼此割裂的类参考手册。

## 范围与边界

保留大纲的 `9.1` 至 `9.5` 编号和主题：

1. `9.1 NetBlob 概述`
2. `9.2 NetBlobManager`
3. `9.3 NetBlobHandler 体系`
4. `9.4 Blob 分片与组装`
5. `9.5 特殊 Blob 类型`

第 `9.5` 节正文标题可扩展为“特殊 Blob 类型与支撑组件”，以准确容纳并非 Blob 子类的 `FReliableNetBlobQueue`。

边界如下：

- NetBlob 不是独立网络通道，最终仍接入第八部分讲解的 ReplicationWriter 与 ReplicationDataStream 传输链。
- 普通复制状态、ChangeMask 和 Serializer 不重新展开，只用于对照 NetBlob 的事件/附件语义。
- RPC 是 NetObjectAttachment 的重要实例，但本部分只用它说明体系位置；RPC 参数序列化、目标解析和函数执行留给第十四部分。
- 对象引用只讲 `HasExports` 与分片携带引用导出的交接点，完整解析和依赖算法留给第十二部分。
- Delta Compression 与 Baseline Manager 留给第十部分。
- 不深入 NetDriver、PacketHandler、Socket 或底层拥塞控制。
- 不把 `UChunkedDataStream` 与 PartialNetBlob 混为同一种分块协议。

## 技术模型与关键修正

### NetBlob 类型模型

`FNetBlobCreationInfo` 由 `Type` 和 `Flags` 构成：

- `Type` 用于接收端选择能够创建和处理该 Blob 的 Handler。
- `Flags` 由具体 Blob 的协议和发送语义决定，不应假设所有标志都由基类自动序列化。

UE 5.7.4 的 `ENetBlobFlags` 至少包括：

- `Reliable`：可靠且相对于其他可靠 Blob 有序；隐含 `Ordered`。
- `RawDataNetBlob`：标识 RawData 派生路径，便于分片时避免重复序列化。
- `HasExports`：Blob 含有需要导出的对象引用或 NetToken。
- `Ordered`：相对于其他 Ordered Blob（包括可靠 Blob）保持顺序；仅 Ordered 的不可靠 Blob只发送一次。

`FNetObjectAttachment` 是面向特定对象的 NetBlob 基类，保存排队所有者引用和实际目标对象引用。文章必须区分：

| 数据类别 | 主要语义 | 丢失后的目标 |
| --- | --- | --- |
| 普通复制状态 | 让远端收敛到最新状态 | 后续状态可覆盖，或重新调度相关 ChangeMask |
| 可靠 NetObjectAttachment | 事件/附件必须可靠、有序到达 | 保留队列并重发未确认序列 |
| 不可靠 Ordered Attachment | 保持与 Ordered 流的相对顺序 | 只发送一次，不转成可靠重发 |

### NetBlobManager

`FNetBlobManager` 的文章职责模型包括：

- 从 `UReplicationSystem` 获得连接、对象引用缓存和 Handle 管理器等依赖。
- 注册默认 Handler，并接受自定义 Handler 注册。
- 为连接增删通知 Handler 管理器。
- 校验目标引用和 root/subobject 关系。
- 将单播或多播附件放入待处理队列。
- 根据对象处于连接 Scope 内外的情况处理队列。
- 处理普通附件队列和 OOB 附件队列。
- 在需要时预序列化附件并交给 Partial Handler 分片。
- 把处理后的附件交给逐连接的 Attachment 发送队列。

发送策略必须按 UE 5.7.4 源码解释：

- `None`
- `ScheduleAsOOB`：尽早调度到 OOB 路径，仅对不可靠附件有效。
- `SendInPostTickDispatch`：提示在 PostTickDispatch 阶段发送。
- `SendImmediate`：组合 OOB 与 PostTickDispatch 语义。

Manager 组织附件和发送时机，但不独自实现所有包级可靠性。确认、丢失和重传行为继续通过 Attachment 队列、ReplicationWriter 记录和第八部分的 Packet Delivery Status 链闭环。

### Handler 体系

`UNetBlobHandler` 负责一种 Blob 类型：

- 根据 `FNetBlobCreationInfo` 创建接收实例。
- 接收已经反序列化或完成组装的 Blob。
- 在需要时维护逐连接状态。

`FNetBlobHandlerManager` 负责：

- 按 Handler Definitions 给注册 Handler 分配 Type。
- 建立 Type 到 Handler 的映射。
- 根据接收的 CreationInfo 创建正确 Blob。
- 将完整 Blob 路由到对应 Handler。
- 在连接增删时通知相关 Handler。

自定义 Handler 若要接收网络数据，必须在定义中配置，并在收发两端注册。文章不把“同名类”当成协议一致性的充分条件；Type 映射、配置和版本也必须一致。

自动注册的内建 Handler 与用户注册的自定义 Handler 分开说明。`UNetRPCHandler`、`UPartialNetObjectAttachmentHandler` 和 `UNetObjectBlobHandler` 只用来展示体系位置，不在本部分展开 RPC 执行。

### PartialNetBlob 与组装

分片路径以 `UPartialNetObjectAttachmentHandler`、`USequentialPartialNetBlobHandler`、`FPartialNetBlob` 和 `FNetBlobAssembler` 为核心：

1. 原始附件被预序列化为位载荷。
2. 分片器按配置把载荷拆成连续 PartialNetBlob。
3. 分片携带首片/末片、序列和还原原始 Blob 所需的信息。
4. 首片负责建立组装上下文；后续片必须符合预期序列。
5. 可靠和不可靠分片分别进入相应队列语义。
6. 组装器检测断序和不完整序列。
7. 所有分片到齐后恢复原始 CreationInfo 与载荷，并创建原始 Blob。
8. 完整 Blob 再交回原 Type 对应的 Handler。

UE 5.7.4 `USequentialPartialNetBlobHandlerConfig` 的类默认值：

- `MaxPartBitCount = 128 * 8`
- `MaxPartCount = 4096`
- 由两者推导的默认理论总载荷上限为 4,194,304 bit，即 512 KiB。

这些数字必须标注为当前源码类默认值，而不是跨版本 API 保证；Engine 或项目配置可以覆盖它们。文章同时保留源码中的警告：发送需要分片和组装的巨大 Blob 并非推荐的常规方案。

### 特殊类型与支撑组件

`FRawDataNetBlob`：

- 用于已经写入位流的无状态原始数据。
- `Serialize` 与 `SerializeWithObject` 都直接处理原始位缓冲。
- 分片和组装对该类型具有优化路径。
- 不把它描述为任意大文件传输接口。

`FShrinkWrapNetBlob` 与 `FShrinkWrapNetObjectAttachment`：

- 面向一个 Blob 需要发送到多个目标的场景。
- 把原 Blob 预序列化一次，再重复发送已序列化缓冲。
- 优化的是重复序列化 CPU 成本。
- 它不承诺压缩位数，也不是通用压缩算法。
- 接收端仍按原始 Blob 类型反序列化。

`FReliableNetBlobQueue`：

- 是可靠、有序传递辅助队列，不是 `FNetBlob` 派生类。
- 当前 `MaxUnackedBlobCount = 1024`。
- 维护 Sent、Acked、FirstSeq、LastSeq 和未发送数量。
- 一个 `FReplicationRecord` 最多记录四段离散序列，允许同一包中重发丢失数据并首次发送新 Blob。
- Delivered 推进确认状态；Lost 使相关未确认序列重新具备发送资格；Discard 用于清理而不是普通丢包重发。
- 接收端只在顺序允许时向上层提供可靠 Blob。

## 主案例

延续前文战斗场景：

- `Health` 与 `Ammo` 继续走普通对象状态复制。
- 一份“命中事件附件”使用自定义可靠 `FNetObjectAttachment`。
- 小载荷直接发送。
- 解释性大载荷触发 PartialNetBlob 分片。
- 接收端只有在可靠顺序满足且所有分片组装成功后，才把原始附件交给自定义 Handler。

端到端流程：

```text
服务器战斗结算
├─ Health / Ammo → 普通状态复制
└─ 命中事件附件 → 自定义可靠 FNetObjectAttachment
                         ↓
              FNetBlobManager 校验目标对象
                         ↓
                单播队列 / 多播连接集合
                         ↓
             预序列化并判断是否需要分片
                         ↓
       普通附件 或 多个连续 PartialNetBlob
                         ↓
         ReplicationWriter 写入附件与投递记录
                         ↓
       Delivered：确认并推进可靠发送窗口
       Lost：清除对应 Sent 状态并重新调度
                         ↓
     接收端按 Type 创建 Blob、恢复有序队列
                         ↓
       分片完整后由 FNetBlobAssembler 组装
                         ↓
          自定义 Handler::OnNetBlobReceived
```

案例设置三个分支：

1. 小型可靠附件：直接排队、发送、确认和处理。
2. 大型可靠附件：多个分片中有一片丢失，已确认分片保留，只重发缺失的可靠分片；完整后再处理原始 Blob。
3. 不可靠 Ordered 附件：保持与其他 Ordered/可靠 Blob 的顺序约束，但自身只发送一次，丢失后不会变成可靠重发。

案例中的载荷大小、包容量和丢包位置均标注为解释性假设。源码常量与示例数据严格区分。

## 章节结构

### 导读

- 用“状态”和“事件附件”的差异引出 NetBlob。
- 承接第八部分 ReplicationWriter 与 Packet Delivery Status。
- 给出端到端总览图和本文边界。

### 9.1 NetBlob 概述

- NetBlob 解决的问题与适用场景。
- `FNetBlobCreationInfo`。
- `FNetBlob` 生命周期、引用计数和序列化入口。
- Descriptor/量化状态路径与覆写序列化函数的两种实现方式。
- `FNetObjectAttachment` 的 owner/target 引用。
- `ENetBlobFlags` 速查。
- 普通状态、可靠附件和不可靠 Ordered 附件对照。

### 9.2 NetBlobManager

- 初始化依赖和默认 Handler。
- `QueueNetObjectAttachment`。
- 单播与多播。
- root object 与 subobject 的目标校验。
- Scope 内/外处理阶段。
- OOB 与 PostTickDispatch 策略。
- 预序列化和分片入口。
- Manager 与逐连接 Attachment 队列的边界。
- RPC 入口仅作为系统位置说明。

### 9.3 NetBlobHandler 体系

- `INetBlobReceiver`。
- `UNetBlobHandler`。
- Handler Definitions。
- `FNetBlobHandlerManager` 的注册、Type 分配、创建与路由。
- 默认 Handler 与自定义 Handler。
- 双端一致性要求。
- 自定义 Handler 的概念性开发清单，不提供未经编译验证的完整生产代码。

### 9.4 Blob 分片与组装

- 为什么普通包预算容纳不下单个 Blob。
- Partial Handler 的预序列化路径。
- `FPartialNetBlob` 的分片元数据。
- 类默认分片配置与覆盖边界。
- `FNetBlobAssembler` 的状态与顺序检查。
- reliable/unreliable 分片差异。
- 丢片、断序、超限和组装错误。
- 与第八部分 `UChunkedDataStream` 的对照表。

### 9.5 特殊 Blob 类型与支撑组件

- `FRawDataNetBlob`。
- `FShrinkWrapNetBlob`。
- `FShrinkWrapNetObjectAttachment`。
- `FReliableNetBlobQueue`。
- 类型/组件选择表。
- 常见误用清单。

### 端到端案例

- 小型可靠命中事件。
- 大型可靠附件分片与缺片重发。
- 不可靠 Ordered 事件的丢失语义。
- 与 `Health` / `Ammo` 普通状态的并行路径。

### 故障排查

- Type、Handler、Manager、队列、分片、组装和最终投递的排查顺序。
- 常见症状、可能原因和核对点表格。

### 关键源码索引

- 按核心类型、Manager/Handler、分片、特殊类型、Attachment 集成和测试分组。

### 下一部分

- 预告第十部分 Delta Compression 与 Baseline Manager。

## 错误处理与故障排查

至少覆盖：

- 自定义 Handler 未在两端定义或注册，触发 `UnsupportedNetBlob`。
- Type 映射、Handler 定义或配置不一致。
- 目标对象引用无效、对象尚未复制或 root/subobject 关系错误。
- 把仅对不可靠附件有效的 `ScheduleAsOOB` 用于可靠附件。
- 可靠发送窗口达到当前 1024 个未确认 Blob 上限。
- 连接长期没有 ACK，Sent/Acked/FirstSeq 无法前进。
- 分片数量或总位数超过配置上限，拆分失败。
- 首片缺失、序列中断、CreationInfo 不一致或组装位流错误。
- Lost 后错误释放可靠 Blob。
- 把不可靠 Blob 无限重试。
- 把 ShrinkWrap 误解为位数压缩。
- Handler 在 Serialization Context 已有错误后继续消费数据。
- 把 PartialNetBlob 与 `UChunkedDataStream` 的 chunk 格式或可靠性模型混为一谈。

推荐排查顺序：

```text
Handler 定义与 Type 映射
→ 目标对象引用与连接 Scope
→ Manager 排队及发送策略
→ 是否触发预序列化/分片
→ ReliableQueue 窗口与序列
→ Packet Delivery Status
→ 接收端创建 Blob
→ Partial 序列与组装
→ Handler 最终投递
```

## 技术依据与源码索引

### 核心类型

- `Public/Iris/ReplicationSystem/NetBlob/NetBlob.h`
- `Private/Iris/ReplicationSystem/NetBlob/NetBlob.cpp`
- `Public/Iris/ReplicationSystem/ReplicationSystemTypes.h`

### Manager 与 Handler

- `Private/Iris/ReplicationSystem/NetBlob/NetBlobManager.h`
- `Private/Iris/ReplicationSystem/NetBlob/NetBlobManager.cpp`
- `Public/Iris/ReplicationSystem/NetBlob/NetBlobHandler.h`
- `Private/Iris/ReplicationSystem/NetBlob/NetBlobHandler.cpp`
- `Private/Iris/ReplicationSystem/NetBlob/NetBlobHandlerManager.h`
- `Private/Iris/ReplicationSystem/NetBlob/NetBlobHandlerManager.cpp`
- `Private/Iris/ReplicationSystem/NetBlob/NetBlobHandlerDefinitions.h`
- `Private/Iris/ReplicationSystem/NetBlob/NetBlobHandlerDefinitions.cpp`

### 分片与组装

- `Public/Iris/ReplicationSystem/NetBlob/PartialNetBlob.h`
- `Private/Iris/ReplicationSystem/NetBlob/PartialNetBlob.cpp`
- `Public/Iris/ReplicationSystem/NetBlob/NetBlobAssembler.h`
- `Private/Iris/ReplicationSystem/NetBlob/NetBlobAssembler.cpp`
- `Public/Iris/ReplicationSystem/NetBlob/SequentialPartialNetBlobHandler.h`
- `Private/Iris/ReplicationSystem/NetBlob/SequentialPartialNetBlobHandler.cpp`
- `Private/Iris/ReplicationSystem/NetBlob/PartialNetObjectAttachmentHandler.h`
- `Private/Iris/ReplicationSystem/NetBlob/PartialNetObjectAttachmentHandler.cpp`

### 特殊类型和可靠队列

- `Public/Iris/ReplicationSystem/NetBlob/RawDataNetBlob.h`
- `Private/Iris/ReplicationSystem/NetBlob/RawDataNetBlob.cpp`
- `Public/Iris/ReplicationSystem/NetBlob/ShrinkWrapNetBlob.h`
- `Private/Iris/ReplicationSystem/NetBlob/ShrinkWrapNetBlob.cpp`
- `Public/Iris/ReplicationSystem/NetBlob/ReliableNetBlobQueue.h`
- `Private/Iris/ReplicationSystem/NetBlob/ReliableNetBlobQueue.cpp`

### Attachment 集成

- `Private/Iris/ReplicationSystem/AttachmentReplication.h`
- `Private/Iris/ReplicationSystem/AttachmentReplication.cpp`
- `Private/Iris/ReplicationSystem/ReplicationWriter.h`
- `Private/Iris/ReplicationSystem/ReplicationWriter.cpp`
- `Private/Iris/ReplicationSystem/ReplicationReader.h`
- `Private/Iris/ReplicationSystem/ReplicationReader.cpp`

### Tests

- `Engine/Plugins/Runtime/ReplicationSystemTestPlugin/Source/Private/Tests/ReplicationSystem/NetBlob`
- 与 Attachment、ReliableNetBlobQueue、PartialNetBlob、Assembler 和 Packet Delivery Status 相关的自动化测试。

外部技术资料只使用 Epic Games UE 5.7 官方文档和 API 页面作为主要来源。内部实现以本地 UE 5.7.4 源码快照为准。

## 技术准确性规则

- 不从 UE 5.5 的接口和常量反推 UE 5.7。
- 不把 NetBlob 描述成独立 DataStream 或独立网络通道。
- 不把 `FReliableNetBlobQueue` 写成 Blob 子类。
- 不把 `Reliable`、`Ordered` 和不可靠发送混为一谈。
- 不把状态复制丢包模型套用到可靠事件附件。
- 不把 ShrinkWrap 描述成压缩算法或保证降低位数。
- 不把 `RawDataNetBlob` 描述成推荐的大文件传输方案。
- 不把 PartialNetBlob 与 ChunkedDataStream 的分片格式、窗口或 ACK 模型混为一谈。
- 不把 `ScheduleAsOOB` 描述成可靠附件通用的“立即发送”开关。
- 不把 RPC Handler 的存在等同于已经解释了完整 RPC 执行流程。
- 不提前展开对象引用解析、Delta Baseline 或底层 Socket。
- 源码常量、配置默认值和解释性案例数字必须明确区分。
- 不引用易漂移的精确源码行号；使用文件和符号名。
- 无法从源码确认的顺序或调度细节退回概念级表述。

## 页面与视觉设计

复用第七、八部分的编辑型技术文章样式：

- 深蓝渐变 Hero。
- 标签突出 `UE 5.7.4`、`NetBlob`、`Handler` 和 `Reliable / Partial`。
- 桌面端粘性目录并允许目录内部滚动。
- 移动端折叠目录。
- 阅读进度条。
- 桌面和移动端当前章节高亮。
- 代码块、位布局与宽表格独立横向滚动。
- 返回顶部按钮。
- 原创来源、UE 5.7.4 基线与官方资料页尾说明。

主要可视化全部使用 HTML/CSS 文本图：

1. 状态复制与 NetObjectAttachment 双路径。
2. `FNetBlob` / `FNetObjectAttachment` / Handler 类型关系。
3. Manager 与 Handler 的创建和路由流程。
4. 可靠附件的排队、写入、ACK 和重发闭环。
5. PartialNetBlob 首片、连续片、末片与组装时间线。
6. Lost/Delivered 分支。
7. RawData、ShrinkWrap、Partial 与 ReliableQueue 对照。
8. PartialNetBlob 与 ChunkedDataStream 对照。

顶级目录包括：

- 导读
- `9.1` 至 `9.5`
- 端到端案例
- 故障排查
- 关键源码索引
- 下一部分

## Hexo Post

创建：

`source/_posts/ue5-iris-guide-part-9.md`

Front Matter：

- 标题：`UE5-Iris 网络复制系统技术分析 - 第九部分：NetBlob 系统`
- 日期：实施时写入 2026-07-24 的具体时刻。
- 标签：`UE`、`Iris`、`网络复制`
- ID：`ue5-iris-guide-part-9`
- 分类：`笔记`

正文包括：

- NetBlob 从创建到组装和 Handler 投递的摘要。
- UE 5.7.4 技术基线说明。
- `<!-- more -->`
- `[打开完整 HTML 文章](/html-articles/ue5-iris-guide-part-9/)`

不修改 Part 7 或 Part 8 的未提交文章，除非用户另行要求补充前后篇链接。

## 验收标准

### 内容

- 覆盖大纲 `9.1` 至 `9.5` 的全部主题。
- 端到端 NetBlob 生命周期完整。
- 普通状态、可靠附件和不可靠 Ordered 附件区分准确。
- Manager、Handler Manager 和逐连接 Attachment 队列边界清楚。
- Handler 定义、注册和 Type 映射要求准确。
- Partial 分片、可靠性、组装和断序错误可从源码复核。
- RawData、ShrinkWrap 和 ReliableQueue 的类型定位准确。
- 明确区分 PartialNetBlob 与 ChunkedDataStream。
- 战斗主案例贯穿创建、发送、丢包、组装和投递。
- 包含故障排查、源码索引、术语速查和下一部分预告。

### 技术

- 所有公开类、函数、枚举和常量与 UE 5.7.4 源码核对。
- `MaxPartBitCount`、`MaxPartCount` 和 `MaxUnackedBlobCount` 标注为当前实现/类默认值。
- Handler Type 路由、默认 Handler 和自定义 Handler 行为经实现复核。
- Packet Delivery Status 行为经实现和测试交叉核对。
- 源码摘录、解释性伪代码和案例计算标注清楚。
- 外部技术链接只使用 Epic Games UE 5.7 官方页面。

### 页面

- HTML 与 Post 均为 UTF-8，无 Unicode replacement character。
- 所有目录锚点存在且 ID 不重复。
- Post 可跳转到完整 HTML。
- 桌面端无页面级横向溢出，粘性目录和高亮正常。
- 移动端无页面级横向溢出，目录可展开并高亮。
- 代码块、位布局和宽表格可以独立横向滚动。
- 阅读进度和返回顶部正常。
- 页脚注明原创来源和 UE 5.7.4 技术依据。
- 控制台无本文引入的 JavaScript 错误。

### 构建与验证

- `npm run build` 成功。
- 生成：
  - `/ue5-iris-guide-part-9/`
  - `/html-articles/ue5-iris-guide-part-9/`
- 静态检查确认：
  - `9.1` 至 `9.5` 全部存在。
  - 锚点和本地链接有效。
  - 外链安全属性完整。
  - 无替换字符。
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
- 不实现生产级自定义 Handler。
- 不完整展开 RPC 参数与函数执行。
- 不完整展开对象引用与依赖。
- 不展开 Delta Compression 与 Baseline Manager。
- 不深入底层 Socket、PacketHandler 或拥塞控制。
- 不生成装饰性插图。
- 不修改或提交当前未提交的 Part 7、Part 8 HTML/Post。
- 正文实施完成后保持未提交，等待用户单独要求 `commit`。
