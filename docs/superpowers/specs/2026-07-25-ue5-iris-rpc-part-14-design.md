# UE5 Iris 技术分析第十四部分：RPC 系统设计规格

## 1. 目标

根据《UE5 Iris 网络复制系统技术分析指南》大纲，补充第十四部分“RPC 系统”，覆盖：

- 14.1 RPC 概述：Iris 中的 RPC 处理、与传统 RPC 的区别；
- 14.2 RPC 发送：`SendRPC`、多播与单播、可靠性保证；
- 14.3 RPC 接收：RPC 分发、参数反序列化、执行上下文；
- 14.4 RPC 传输实现：`FNetRPC`、`UNetRPCHandler`、`UNetObjectBlobHandler`、`UPartialNetObjectAttachmentHandler`。

成果包括：

- 独立长篇 HTML：`/html-articles/ue5-iris-guide-part-14/`；
- 在统一系列入口 `/ue5-iris-guide/` 中增加第十四部分的链接与摘要；
- 将 Part 13 底部的“下一篇”占位更新为 Part 14 链接；
- 不创建体量较小的 `ue5-iris-guide-part-14.md`；
- 技术基线使用本地 Unreal Engine 5.7.4 源码；
- 标明文章来源、Epic Games 官方资料与源码依据。

## 2. 用户授权与默认决策

用户要求所有选项采用推荐方案，不再询问。因此本规格视为用户已经批准以下决策：

- 采用“单次远程调用生命周期 + 投递契约 + Handler 边界”的叙事方案；
- 使用“武器开火”RPC 作为贯穿发送、传输、接收和异常路径的示例；
- 保留 Part 13 的纸张、深蓝与橙色视觉系统；
- 用 HTML/CSS 图表表达状态与事件边界、收件人矩阵、发送流水线、顺序和丢包时序、接收校验关卡、Handler 职责；
- 不生成装饰性图片；
- 设计规格与实施计划分别提交；
- 正文实施完成后保持未提交，等待用户单独要求 `commit`；
- 不修改本地 Unreal Engine 源码。

## 3. 方案比较

### 3.1 方案 A：按类与接口逐项解释

依次介绍 `UReplicationSystem::SendRPC`、`FNetRPC`、`UNetRPCHandler`、`UNetObjectBlobHandler` 和 `UPartialNetObjectAttachmentHandler`。

优点是和大纲及源码文件一一对应；缺点是读者会得到一组类名，却不清楚一次普通 `UFUNCTION` 调用为什么进入这些组件、可靠性在哪里生效、接收端何时真正执行函数。

### 3.2 方案 B：只讲 Gameplay RPC 用法

围绕 `UFUNCTION(Server)`、`Client`、`NetMulticast`、`Reliable` 和 ownership 给出常用配方。

优点是容易上手；缺点是与本系列的源码分析定位不符，也不能解释 Iris 如何用 NetBlob/ObjectAttachment 替代传统 ActorChannel bunch 内部路径。

### 3.3 方案 C：单次调用生命周期 + 投递契约 + Handler 边界（采用）

用一次“客户端请求开火、服务器确认并多播表现”的调用贯穿：

1. Gameplay 调用生成代码与 callspace 判断；
2. `UNetDriver::ProcessRemoteFunction` 进入 Iris；
3. `UReplicationSystem::SendRPC` 选择单播或多播；
4. `FNetBlobManager` 校验方向、连接、对象和休眠状态；
5. `UNetRPCHandler::CreateRPC` 创建 `FNetRPC`；
6. 参数量化、对象引用导出和函数定位；
7. Attachment 按连接入队，并由 `FReplicationWriter` 调度；
8. 大负载需要时由 Partial Handler 预序列化和拆片；
9. 接收端解析对象、函数和参数；
10. 校验方向与 ownership，在 RPC 上下文中调用 `ProcessEvent`。

同时用“投递契约”集中解释可靠、不可靠、有序、单播、多播、作用域、OOB 和立即发送提示，最后用 Handler 职责图纠正大纲中 `UNetObjectBlobHandler` 的归类误读。

该方案能同时回答“Gameplay 表面是否改变”“Iris 内部怎样传”“失败或丢包时发生什么”“各 Handler 到底负责什么”，因此采用。

## 4. 核心技术结论

### 4.1 RPC 是一次性调用，不是持久状态

文章先给出选择边界：

| 需求 | 推荐机制 | 原因 |
| --- | --- | --- |
| 晚加入者仍应看到结果 | Replicated Property | 状态会进入后续快照 |
| 丢过一次也能由下一次状态覆盖 | Replicated Property | 不依赖每个中间事件 |
| 播放枪口火焰、音效等瞬时表现 | Unreliable RPC | 过期事件没有补发价值 |
| 必须执行且允许阻塞后续调用 | Reliable RPC | ACK 前持续重发 |
| 客户端向服务器提交意图 | Server RPC + 服务端校验 | 服务器保持权威 |

RPC 是单向的，没有返回值。返回结果应通过另一个 RPC 或复制状态表达。文章不得把 RPC 描述成状态复制的替代品，也不得暗示可靠 RPC 会让晚加入连接补执行历史调用。

### 4.2 Gameplay 声明与执行表面保持兼容，传输内核改变

Epic 的 Iris 迁移文档说明，RPC 的声明和执行与通用复制系统保持一致。因此 Gameplay 层仍然使用：

```cpp
UFUNCTION(Server, Unreliable)
void ServerFire(FVector_NetQuantize Origin, FVector_NetQuantizeNormal Direction);

UFUNCTION(NetMulticast, Unreliable)
void MulticastFireFX(FVector_NetQuantize Origin, FVector_NetQuantizeNormal Direction);
```

关键差异在底层路径：

```text
传统路径（概念化）
UFunction → NetDriver → ActorChannel → Bunch → Packet

Iris 路径
UFunction → NetDriver → UReplicationSystem::SendRPC
          → FNetRPC / ObjectAttachment
          → ReplicationWriter / ReplicationDataStream
          → Packet
```

文章不把传统系统的 `Bunch` 术语直接套到 Iris 的实现细节上；只在对比时说明 Gameplay 契约兼容、传输载体改变。

### 4.3 `UNetDriver::ProcessRemoteFunction` 是 Gameplay 与 Iris 的交界

本地 UE 5.7.4 的 `UNetDriver::ProcessRemoteFunction`：

- 拒绝正在销毁的 Actor，并按配置处理 torn-off Actor 的 RPC；
- 复制出调用参数；
- 存在 Iris `UReplicationSystem` 时：
  - 服务端 `NetMulticast` 调用无 `ConnectionId` 的 `SendRPC`；
  - `Server`、`Client` 等点对点调用取得 Actor 的 `UNetConnection`，再调用带 `ConnectionId` 的 `SendRPC`；
- 一旦走入 Iris 分支就返回，不再回退到传统 ActorChannel 发送路径。

这解释了为什么 Gameplay 代码不需要直接构造 `FNetRPC`，也解释了两个 `SendRPC` 重载为何分别对应多播和单播。

### 4.4 `SendRPC` 返回“已入队”，不是“远端已执行”

公开接口：

```cpp
bool SendRPC(
    const UObject* RootObject,
    const UObject* SubObject,
    const UFunction* Function,
    const void* Parameters);

bool SendRPC(
    uint32 ConnectionId,
    const UObject* RootObject,
    const UObject* SubObject,
    const UFunction* Function,
    const void* Parameters);
```

第一个重载是多播，第二个重载是单播。返回 `true` 的语义是调用已经成功排入复制队列，不能解释为：

- 已经写入当前网络包；
- 对端已经收到；
- 对端已经执行；
- Gameplay 校验一定通过。

### 4.5 发送前的四层资格检查

`FNetBlobManager` 在创建 RPC 前检查：

1. 全局开关：`net.Iris.EnableRPCs` 默认 1；
2. 方向：客户端只能向服务器发送允许的函数，服务器只能向客户端或多播方向发送；
3. 连接：单播连接必须有效且仍然打开；
4. 目标对象：RootObject / SubObject 必须能映射到已复制对象或可用的 replicated outer。

休眠相关开关：

- `net.Iris.RPC.AllowOnDormantObjects` 默认 true；
- `net.Iris.RPC.AutoNetFlushOnDormantObjects` 默认 true。

默认行为允许在休眠对象上调用 RPC，并隐式触发 NetFlush。文章强调这不是“休眠对象完全免费”：可能同时唤起应发送的属性状态，需要按项目语义和带宽成本设计。

### 4.6 单播与多播的真正收件人

#### 单播

- 带 `ConnectionId`；
- 只排给这一条有效、开放连接；
- `Server` RPC 的目标是服务端连接；
- `Client` RPC 的目标来自 Actor owning connection；
- 发送端和接收端都检查方向，服务端接收时还检查调用者 ownership。

#### 多播

- 服务端调用时，对调用瞬间的 open connections 建立候选快照；
- 真正写入某连接前仍受目标对象是否已向该连接复制、是否在 scope 中等条件约束；
- 新连接不会回放此前的多播；
- 对 SubObject 的多播也不会绕过对象/子对象作用域。

文章不得写成“`NetMulticast` 一定发给所有客户端”。准确表达是“发给当前开放、且目标对象对其可投递的连接”。

### 4.7 `FNetRPC` 是 ObjectAttachment

`FNetRPC` 继承 `FNetObjectAttachment`。创建时记录：

- RPC 目标对象引用；
- `FFunctionLocator`：
  - `DescriptorIndex`；
  - `FunctionIndex`；
- 函数参数对应的 `FReplicationStateDescriptor`；
- 量化后的参数状态；
- 需要导出的对象引用。

`FFunctionLocator` 不直接发送函数名，而是通过对象 Replication Protocol 中的描述符索引和函数索引定位。函数描述符保存：

```cpp
struct FReplicationStateMemberFunctionDescriptor
{
    const UFunction* Function;
    const FReplicationStateDescriptor* Descriptor;
};
```

其中第二个描述符描述 RPC 参数布局和序列化方式。

### 4.8 参数在发送排队前量化

`FNetRPC::Create`：

- 先追溯到最顶层的 super function；
- 从对象协议中查找函数 locator；
- 为非空参数描述符分配 quantized state；
- 用 `FReplicationStateOperations::Quantize` 立即量化调用参数；
- 收集量化参数内需要导出的对象引用；
- 零参数 RPC 跳过内存分配和量化。

这一设计把 Gameplay 临时参数转换成可在后续网络调度阶段安全持有的 Iris 内部状态。文章不得暗示队列一直保存调用者栈上的原始参数地址。

### 4.9 RPC wire payload

普通 `FNetRPC` 的序列化内容可概括为：

```text
[24-bit RPC 总位数]
[目标对象/子对象引用（随对象发送时可省略冗余部分）]
[函数定位符：2-bit nibble 数 + DescriptorIndex + FunctionIndex]
[量化参数]
[参数中的引用导出]
```

24 位长度字段允许的理论最大 RPC payload 是 `(1 << 24) - 1` bits，约 2 MiB 减 1 bit。这个上限是格式保护边界，不是推荐的 Gameplay RPC 大小，也不是网络 MTU。

接收时长度字段还用于：

- 对象或函数无法解析时跳过整段 RPC；
- 校验实际读取位置与声明长度是否一致；
- 检测 bitstream mismatch，避免后续数据错位。

### 4.10 可靠、非可靠与 Ordered 的 Iris 行为

`UNetRPCHandler::CreateRPC` 根据 `UFunction` 标志设置：

- `FUNC_NetReliable` → `ENetBlobFlags::Reliable`；
- 非 `FUNC_NetMulticast` → `ENetBlobFlags::Ordered`。

因此在 UE 5.7.4 Iris 中：

| 类型 | Reliable | Ordered | 丢包行为 |
| --- | --- | --- | --- |
| Reliable unicast | 是 | 是 | ACK 前重发，阻塞相关有序队列 |
| Unreliable unicast | 否 | 是 | 不重发；若投递则与可靠/单播序列保持对象内顺序 |
| Reliable multicast | 是 | 否（不因非多播规则获得 Ordered） | 对已排入的连接可靠重发 |
| Unreliable multicast | 否 | 否 | 丢包即丢失 |

自动化测试表明：

- 单播的 unreliable 可以和 reliable RPC 保持顺序；
- unreliable RPC 丢包后不会重发；
- ordered unreliable 在预算超限时可能积压或按配置在 tick 末丢弃。

文章要把源码事实与通用文档措辞分开：通用文档常将 Unreliable 概括为“无顺序保证”，而 UE 5.7.4 Iris 的非多播实现额外打了 Ordered 标志。不能把这个实现细节扩大为跨对象、跨连接或所有 RPC 类型的全局顺序保证。

### 4.11 可靠不等于适合所有重要信息

可靠 RPC 会持续重发，后续相关有序流量可能等待 ACK。推荐规则：

- 过期后无价值的表现事件使用 unreliable；
- 可由最新状态覆盖的结果使用 replicated property；
- 必须执行一次的低频控制命令才考虑 reliable；
- 高频输入不要逐帧发送 reliable；
- 不依赖多个 Actor 之间的调用顺序；
- 对必须按业务顺序处理的跨对象事件，携带 sequence / epoch 并在 Gameplay 层验证。

### 4.12 Send Policy 不是同步调用

Iris 的 `ENetObjectAttachmentSendPolicyFlags`：

- `None`：默认附件队列；
- `ScheduleAsOOB`：走 OOB attachment queue，尽早调度，只适用于 unreliable attachment；
- `SendInPostTickDispatch`：提示在 `PostTickDispatch` 发送当前 OOB unreliable attachments；
- `SendImmediate`：前两者组合。

关键边界：

- `SendImmediate` 仍然是排队和调度提示，不是同调用栈同步送达；
- OOB 目标对象必须已经进入该连接的 replicated state；
- 公开 `SetRPCSendPolicyFlags` 在本地 5.7.4 的 `UReplicationSystem` 公开多播 `SendRPC` 路径读取；公开单播重载没有读取该函数策略表；
- 策略功能受 `net.Iris.Attachments.AllowSendPolicyFlags` 控制；
- 不可靠 OOB 的低延迟收益伴随额外包、CPU 或带宽成本。

文章以 `TestMultiCastSendImmediateRPC` 的行为为依据，说明 immediate 多播可在 `PostTickDispatch` 阶段早于普通排队多播抵达，但不声称本次执行了该测试。

### 4.13 Attachment 队列与对象作用域

普通 RPC 作为目标对象的 attachment 入队，并让对象带上待发送附件；OOB RPC 使用专门的 attachment object index 和队列。

`FReplicationWriter` 在连接维度处理：

- 目标对象是否已开始复制；
- 是否仍在 scope；
- 是否已经 pending destroy；
- attachment 是否能和对象状态一起发送；
- 连接可用的写入预算；
- reliable window / ACK / resend；
- partial attachment 的组装。

多播并不是“一次序列化复制 N 份字节”这么简单。因为对象引用导出、scope 和连接状态可能不同，最终写入存在连接特定工作。

### 4.14 大负载由 Partial Handler 预序列化和拆片

`UPartialNetObjectAttachmentHandler` 会：

- 先尝试把 attachment 预序列化为 `FShrinkWrapNetObjectAttachment`；
- 缓冲区足够时保留为单个 shrink-wrap attachment；
- 溢出时拆成带序列的 partial blobs；
- 接收端按顺序组装后交回原 handler。

本地 5.7.4 默认阈值包括：

- 通用/可靠预序列化阈值约 192 bytes；
- 客户端 unreliable split 阈值 850 bytes；
- 服务端 unreliable split 阈值 256 bytes。

这些值是 handler 配置默认值，不等于通用 MTU，也不应作为 Gameplay RPC “允许大小”。文章的建议仍是让 RPC 参数紧凑，大数据改用状态复制、专用流或分块协议。

### 4.15 `UNetObjectBlobHandler` 不是普通 RPC Handler

大纲把它列在“RPC 传输实现”下，但本地源码的真实职责是处理超大的 replicated object state：

- 创建 reliable `FNetObjectBlob`；
- 依赖 partial blobs 拆分和组装；
- 走专用对象状态装配/反序列化路径；
- `OnNetBlobReceived` 不应作为普通 handler 回调被调用。

正文保留该类以完整覆盖大纲，但必须画成 `FNetBlobManager` 下与 `UNetRPCHandler` 并列的兄弟路径：

```text
FNetBlobManager
├─ UNetRPCHandler
│  └─ FNetRPC：一次函数调用
├─ UPartialNetObjectAttachmentHandler
│  └─ 大 attachment 的预序列化、拆片、组装
└─ UNetObjectBlobHandler
   └─ 超大 replicated object state，不是普通 RPC
```

不得写成“RPC 先进入 NetObjectBlobHandler，再进入 Partial Handler”。

### 4.16 接收端解析与执行

接收路径：

1. `UNetRPCHandler::OnNetBlobReceived` 构造 `FNetRPCCallContext`；
2. `FNetRPC::ResolveFunctionAndObject`：
   - 解析 target object；
   - 取得对象 Replication Protocol；
   - 校验 descriptor / function index；
   - 取得 `UFunction` 和参数描述符；
3. `FNetRPC::CallFunction`：
   - 验证对象仍有 instance protocol、未停止复制；
   - 验证 `FUNC_Net`；
   - 验证 RPC 方向；
   - 服务端验证发送连接拥有目标对象；
   - 分配并初始化外部参数内存；
   - dequantize 参数；
   - 对 Blueprint 派生覆盖按名称解析实际函数；
   - 广播可选的 forward delegate；
   - 在 RPC 网络上下文中调用 `Object->ProcessEvent`；
   - 销毁包含非平凡类型的参数值。

文章用“六道接收关卡”表示：对象 → 协议 → 函数 → 方向 → ownership → 参数/执行。

### 4.17 安全边界

引擎只负责结构性与权限前置校验，Gameplay 仍必须校验：

- 射速、弹药、冷却；
- 位置和视线是否合理；
- 输入序号是否重复或过期；
- 参数范围；
- 调用频率；
- 目标对象是否仍处于允许状态。

`WithValidation` 是一种可用机制，但不能代替完整的服务端权威规则。文章的示例让客户端发送“开火意图”，服务器决定是否生成伤害与权威状态。

## 5. 文章结构

正文使用 13 个二级章节：

1. `#event-not-state`：RPC 是一次调用，不是一份状态；
2. `#decision`：属性复制还是 RPC；
3. `#journey`：一次开火 RPC 的端到端旅程；
4. `#overview`：14.1 Gameplay 表面兼容，Iris 传输内核改变；
5. `#callspace`：调用空间、方向、ownership 和 UFUNCTION；
6. `#send`：14.2 `SendRPC`、单播与多播；
7. `#delivery`：Reliable、Unreliable、Ordered 和丢包；
8. `#policy`：发送策略、OOB、休眠与作用域；
9. `#payload`：`FNetRPC` 的函数定位、量化参数与引用导出；
10. `#receive`：14.3 解析、校验、反序列化和执行上下文；
11. `#subobject-security`：SubObject 生命周期与服务端安全；
12. `#transport`：14.4 Handler 职责、大负载与正确边界；
13. `#practice`：场景推演、性能、调试、源码索引与总结。

桌面和移动端目录必须各包含上述 13 项，锚点一一对应。

## 6. 视觉与交互

### 6.1 视觉系统

- 背景：暖纸色；
- 主色：深蓝；
- 强调色：橙红；
- 成功/允许：绿色；
- 警告：琥珀色；
- 危险/丢弃：红色；
- Hero 背景大字：`REMOTE CALL`；
- 保留 Part 13 的衬线标题、无衬线正文和等宽源码字体。

### 6.2 信息图

使用纯 HTML/CSS，至少包含：

- “持久状态 vs 一次性事件”二分图；
- Client / Server / NetMulticast 收件人矩阵；
- 端到端 RPC 流水线；
- Reliable / Unreliable / Ordered 契约矩阵；
- 普通队列与 OOB / SendImmediate 时序图；
- 接收端校验关卡；
- Handler 职责树；
- 丢包与重传时间线。

### 6.3 交互与可访问性

- 桌面 sticky TOC；
- 移动端 `<details>` TOC；
- 阅读进度条；
- 当前章节高亮；
- “回到顶部”按钮；
- `prefers-reduced-motion` 降级；
- 所有可聚焦元素有 `:focus-visible`；
- 横向表格放入 `.table-scroll`；
- 390px 宽度不得产生 body 横向滚动；
- 不依赖第三方 JavaScript 或字体服务。

## 7. 来源说明

正文来源区写明：

- 本文由 Jossy Zhang 根据系列大纲原创扩写；
- 大纲来源为 Smartuil 发布的知乎文章；
- 技术结论以本地 Unreal Engine 5.7.4 源码和 `ReplicationSystemTestPlugin` 测试源码为准；
- Epic 官方文档用于 Gameplay 契约与公开 API 说明；
- 未执行 UE 自动化测试，不得把“测试源码存在”写成“测试已通过”。

大纲来源链接：

```text
https://zhuanlan.zhihu.com/p/1996685633524089868
```

官方资料：

- Remote Procedure Calls；
- Replicated Object Execution Order；
- Migrate to Iris；
- `UReplicationSystem::SendRPC`；
- `UReplicationSystem` API。

官方资料链接使用 HTTPS；站内 canonical 延续项目现有 HTTP 约定。

## 8. 关键源码与测试

### 8.1 发送入口

```text
Engine/Source/Runtime/Engine/Private/NetDriver.cpp
Engine/Source/Runtime/Net/Iris/Public/Iris/ReplicationSystem/ReplicationSystem.h
Engine/Source/Runtime/Net/Iris/Public/Iris/ReplicationSystem/ReplicationSystemTypes.h
Engine/Source/Runtime/Net/Iris/Private/Iris/ReplicationSystem/ReplicationSystem.cpp
```

### 8.2 RPC 与队列

```text
Engine/Source/Runtime/Net/Iris/Private/Iris/ReplicationSystem/NetBlob/NetBlobManager.h
Engine/Source/Runtime/Net/Iris/Private/Iris/ReplicationSystem/NetBlob/NetBlobManager.cpp
Engine/Source/Runtime/Net/Iris/Private/Iris/ReplicationSystem/NetBlob/NetRPC.h
Engine/Source/Runtime/Net/Iris/Private/Iris/ReplicationSystem/NetBlob/NetRPC.cpp
Engine/Source/Runtime/Net/Iris/Private/Iris/ReplicationSystem/NetBlob/NetRPCHandler.h
Engine/Source/Runtime/Net/Iris/Private/Iris/ReplicationSystem/NetBlob/NetRPCHandler.cpp
Engine/Source/Runtime/Net/Iris/Private/Iris/ReplicationSystem/ReplicationWriter.h
Engine/Source/Runtime/Net/Iris/Private/Iris/ReplicationSystem/ReplicationWriter.cpp
```

### 8.3 大负载与对象 Blob

```text
Engine/Source/Runtime/Net/Iris/Private/Iris/ReplicationSystem/NetBlob/PartialNetObjectAttachmentHandler.h
Engine/Source/Runtime/Net/Iris/Private/Iris/ReplicationSystem/NetBlob/PartialNetObjectAttachmentHandler.cpp
Engine/Source/Runtime/Net/Iris/Private/Iris/ReplicationSystem/NetBlob/NetObjectBlobHandler.h
Engine/Source/Runtime/Net/Iris/Private/Iris/ReplicationSystem/NetBlob/NetObjectBlobHandler.cpp
```

### 8.4 函数与参数描述符

```text
Engine/Source/Runtime/Net/Iris/Public/Iris/ReplicationState/ReplicationStateDescriptor.h
Engine/Source/Runtime/Net/Iris/Private/Iris/ReplicationState/ReplicationStateDescriptorBuilder.cpp
```

### 8.5 测试源码

```text
Engine/Plugins/Runtime/ReplicationSystemTestPlugin/Source/Private/Tests/ReplicationSystem/RPC/TestObjectRPC.cpp
Engine/Plugins/Runtime/ReplicationSystemTestPlugin/Source/Private/Tests/ReplicationSystem/RPC/RPCTestFixture.h
Engine/Plugins/Runtime/ReplicationSystemTestPlugin/Source/Private/Tests/ReplicationSystem/RPC/RPCTestFixture.cpp
Engine/Plugins/Runtime/ReplicationSystemTestPlugin/Source/Private/Tests/ReplicationSystem/RPC/ReplicatedTestObjectWithRPC.h
Engine/Plugins/Runtime/ReplicationSystemTestPlugin/Source/Private/Tests/ReplicationSystem/Serialization/TestNameNetSerializer.cpp
Engine/Plugins/Runtime/ReplicationSystemTestPlugin/Source/Private/Tests/ReplicationSystem/Serialization/TestRemoteObjectReferenceNetSerializer.cpp
```

正文可点名：

- `TestBasicObjectRPC`；
- `TestMultiCastSendImmediateRPC`；
- `TestSubObjectRPC`；
- `TestUnreliableRPCIsOrderedWithReliableRPCToClient`；
- `TestUnreliableRPCIsOrderedWithReliableRPCToServer`；
- `TestUnreliableRPCIsNotResentAfterPacketLoss`；
- `TestShortLivedSubObjectReliableRPC`；
- `TestSubObjectMulticastRPCIsNotReplicatedToNonOwningConnection`；
- `TestOvercommitOrderedUnreliableRPC`。

## 9. 边界与不做事项

- 不修改 UE 源码；
- 不执行完整 UE 编译；
- 不声称执行了 ReplicationSystemTestPlugin 自动化测试；
- 不把 `SendRPC == true` 解释为远端执行成功；
- 不把 reliable 解释为无成本、无阻塞或跨 Actor 全局有序；
- 不把 `SendImmediate` 解释为同步发送；
- 不把 `NetMulticast` 解释为无条件到达所有客户端；
- 不把 `UNetObjectBlobHandler` 描述成普通 RPC 的必经 handler；
- 不把 192 / 256 / 850 bytes 的内部阈值描述成网络 MTU；
- 不把 24 位格式上限当作推荐 RPC 负载大小；
- 不创建单独的小型 Part 14 Post；
- 不提交 `public/` 构建产物。

## 10. 验收标准

### 内容

- 覆盖大纲 14.1～14.4；
- 13 个 H2 章节完整；
- 明确状态与事件的选择边界；
- 完整解释 `ProcessRemoteFunction → SendRPC → FNetRPC → Attachment → CallFunction`；
- 解释单播、多播、可靠性、顺序、OOB、休眠、scope、SubObject 和安全边界；
- 明确 `UNetObjectBlobHandler` 的真实职责；
- 标明 UE 5.7.4 技术基线和文章来源。

### 结构

- Part 14 canonical 正确；
- 桌面和移动 TOC 共 26 个目录链接；
- 所有锚点均存在且唯一；
- Part 13 下一篇链接指向 Part 14；
- Part 14 上一篇指向 Part 13，下一篇指向 Part 15 主题占位；
- 统一 Post 出现且只出现一个 Part 14 路由。

### 构建与浏览器

- `npm run clean` 成功；
- `npm run build` 成功；
- 桌面 1440×1000 正常；
- 移动端 390×844 正常；
- 无 body 横向滚动；
- Part 14 页面控制台无错误；
- Part 13 → Part 14、统一 Post → Part 14 链接可用；
- 测试后清理浏览器会话、服务器、日志和临时文件。
