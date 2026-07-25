# UE5 Iris 第十四部分：RPC 系统实施计划

## 1. 交付目标

新增：

- `source/html-articles/ue5-iris-guide-part-14/index.html`

更新：

- `source/html-articles/ue5-iris-guide-part-13/index.html`
- `source/_posts/ue5-iris-guide.md`

完整文章路由：

```text
/html-articles/ue5-iris-guide-part-14/
```

统一系列入口：

```text
/ue5-iris-guide/
```

文章覆盖大纲 14.1～14.4，技术基线为本地 Unreal Engine 5.7.4。按照已经实施的合并结构，不创建单独的 `ue5-iris-guide-part-14.md`。

## 2. 约束

- 只读访问 `C:\work\st-unreal-engine`；
- 不修改 UE 源码；
- 复用 Part 13 的 HTML 视觉与交互外壳；
- Part 14 正文、Part 13 导航和统一 Post 更新完成后保持未提交；
- 设计与计划文档独立提交；
- 不提交 `public/`；
- 不添加装饰性图片、第三方脚本或外部字体；
- 临时脚本、浏览器产物和服务器日志必须清理；
- 保留用户现有未提交的 Part 13 内容，不覆盖、不单独提交。

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
- 博客工作区已有 Part 13 未提交内容；
- 设计提交为 `1e4cc46`；
- UE 工作区已有改动属于用户，本次不触碰；
- `Engine/Build/Build.version` 为 5.7.4。

## 4. 源码核对

### 4.1 Gameplay 入口

核对：

```text
Engine/Source/Runtime/Engine/Private/NetDriver.cpp
```

确认：

- `UNetDriver::ProcessRemoteFunction` 的对象生命周期检查；
- Iris 分支如何区分服务端 multicast 和 connection-specific unicast；
- 进入 Iris 后不回退到传统 channel 发送；
- 参数何时被复制并交给复制系统。

### 4.2 `UReplicationSystem::SendRPC`

核对：

```text
Engine/Source/Runtime/Net/Iris/Public/Iris/ReplicationSystem/ReplicationSystem.h
Engine/Source/Runtime/Net/Iris/Public/Iris/ReplicationSystem/ReplicationSystemTypes.h
Engine/Source/Runtime/Net/Iris/Private/Iris/ReplicationSystem/ReplicationSystem.cpp
```

确认：

- 两个 `SendRPC` 重载；
- 无 `ConnectionId` 为 multicast；
- 带 `ConnectionId` 为 unicast；
- 返回值是“成功排队”；
- `SetRPCSendPolicyFlags`；
- `ENetObjectAttachmentSendPolicyFlags` 的四种值；
- OOB 只适用于 unreliable attachment；
- 本地 5.7.4 的公开 multicast 路径读取函数策略，公开 unicast 路径没有读取。

### 4.3 `FNetBlobManager`

核对：

```text
Engine/Source/Runtime/Net/Iris/Private/Iris/ReplicationSystem/NetBlob/NetBlobManager.h
Engine/Source/Runtime/Net/Iris/Private/Iris/ReplicationSystem/NetBlob/NetBlobManager.cpp
```

确认：

- `SendMulticastRPC`；
- `SendUnicastRPC`；
- `GetRPCOwner`；
- root/subobject/replicated outer 的目标关系；
- 方向、连接和对象合法性检查；
- open connection 快照；
- attachment queue 与 OOB queue；
- 休眠 RPC 的允许和自动 NetFlush；
- CVar 的准确名称与默认值：
  - `net.Iris.EnableRPCs = 1`；
  - `net.Iris.RPC.AllowOnDormantObjects = true`；
  - `net.Iris.RPC.AutoNetFlushOnDormantObjects = true`。

### 4.4 `FNetRPC` 与 `UNetRPCHandler`

核对：

```text
Engine/Source/Runtime/Net/Iris/Private/Iris/ReplicationSystem/NetBlob/NetRPC.h
Engine/Source/Runtime/Net/Iris/Private/Iris/ReplicationSystem/NetBlob/NetRPC.cpp
Engine/Source/Runtime/Net/Iris/Private/Iris/ReplicationSystem/NetBlob/NetRPCHandler.h
Engine/Source/Runtime/Net/Iris/Private/Iris/ReplicationSystem/NetBlob/NetRPCHandler.cpp
```

确认：

- `FNetRPC : FNetObjectAttachment`；
- reliable 标志；
- 非 multicast 的 ordered 标志；
- `FFunctionLocator`；
- 追溯 super function；
- 参数 descriptor；
- 参数 quantize / dequantize；
- 对象引用导出；
- 24-bit payload length；
- 约 2 MiB 的格式理论上限；
- 对象/函数解析失败时按长度跳过；
- bitstream position 校验；
- `FNetRPCCallContext`；
- `CallFunction` 的方向、ownership、协议和生命周期校验；
- forward delegate；
- `FScopedNetContextRPC` / Receiving mode；
- `ProcessEvent`；
- 参数析构。

### 4.5 函数描述符

核对：

```text
Engine/Source/Runtime/Net/Iris/Public/Iris/ReplicationState/ReplicationStateDescriptor.h
Engine/Source/Runtime/Net/Iris/Private/Iris/ReplicationState/ReplicationStateDescriptorBuilder.cpp
```

确认：

- `FReplicationStateMemberFunctionDescriptor` 保存 `UFunction` 与参数 descriptor；
- `FunctionCount`；
- 函数描述符进入 Replication Protocol；
- RPC 使用 descriptor index + function index 定位，而不是把完整函数名写进每次 payload。

### 4.6 Attachment 写入

核对：

```text
Engine/Source/Runtime/Net/Iris/Private/Iris/ReplicationSystem/ReplicationWriter.h
Engine/Source/Runtime/Net/Iris/Private/Iris/ReplicationSystem/ReplicationWriter.cpp
```

确认：

- normal attachment 与 OOB attachment 的路由；
- 目标对象必须已进入可复制状态；
- scope 外目标的丢弃规则；
- pending destroy 边界；
- reliable / ordered queue；
- attachment 和对象状态共同调度；
- 多播在连接维度产生实际写入。

### 4.7 Partial 与 Object Blob Handler

核对：

```text
Engine/Source/Runtime/Net/Iris/Private/Iris/ReplicationSystem/NetBlob/PartialNetObjectAttachmentHandler.h
Engine/Source/Runtime/Net/Iris/Private/Iris/ReplicationSystem/NetBlob/PartialNetObjectAttachmentHandler.cpp
Engine/Source/Runtime/Net/Iris/Private/Iris/ReplicationSystem/NetBlob/NetObjectBlobHandler.h
Engine/Source/Runtime/Net/Iris/Private/Iris/ReplicationSystem/NetBlob/NetObjectBlobHandler.cpp
```

确认：

- attachment 预序列化；
- shrink-wrap；
- overflow 后拆分 partial blobs；
- 接收端重组；
- 默认 192 / 256 / 850 bytes 阈值的准确语境；
- `UNetObjectBlobHandler` 服务于 huge replicated object state；
- `FNetObjectBlob` 为 reliable；
- Object Blob 的特殊接收路径；
- `UNetObjectBlobHandler::OnNetBlobReceived` 不是普通 RPC 接收入口。

### 4.8 自动化测试源码

核对：

```text
Engine/Plugins/Runtime/ReplicationSystemTestPlugin/Source/Private/Tests/ReplicationSystem/RPC/TestObjectRPC.cpp
Engine/Plugins/Runtime/ReplicationSystemTestPlugin/Source/Private/Tests/ReplicationSystem/RPC/RPCTestFixture.h
Engine/Plugins/Runtime/ReplicationSystemTestPlugin/Source/Private/Tests/ReplicationSystem/RPC/RPCTestFixture.cpp
Engine/Plugins/Runtime/ReplicationSystemTestPlugin/Source/Private/Tests/ReplicationSystem/RPC/ReplicatedTestObjectWithRPC.h
```

正文可用作行为依据：

- `TestBasicObjectRPC`；
- `TestMultiCastSendImmediateRPC`；
- `TestSubObjectRPC`；
- `TestUnreliableRPCIsOrderedWithReliableRPCToClient`；
- `TestUnreliableRPCIsOrderedWithReliableRPCToServer`；
- `TestUnreliableRPCIsNotResentAfterPacketLoss`；
- `TestShortLivedSubObjectReliableRPC`；
- `TestSubObjectMulticastRPCIsNotReplicatedToNonOwningConnection`；
- `TestOvercommitOrderedUnreliableRPC`。

不声称本次执行 UE 自动化测试。

## 5. 官方资料

引用 Epic Games 官方页面：

- Remote Procedure Calls；
- Replicated Object Execution Order；
- Migrate to Iris；
- `UReplicationSystem::SendRPC`；
- `UReplicationSystem` API；
- Introduction to Iris。

规则：

- 外部链接全部使用 HTTPS；
- 官方页面当前可能展示 5.8，具体 5.7.4 内部行为以本地源码为准；
- Gameplay 契约优先使用官方文档；
- Iris 具体 Ordered、OOB、Handler 和阈值行为优先使用本地 5.7.4 源码；
- 不引用第三方教程作为技术结论依据。

## 6. HTML 实施

### 6.1 创建目录与文件

目标：

```text
source/html-articles/ue5-iris-guide-part-14/index.html
```

复用 Part 13 的自包含页面骨架，用 `apply_patch` 创建和修改文件。

### 6.2 Metadata

设置：

- `lang="zh-CN"`；
- 作者 `Jossy Zhang`；
- 标题“UE5-Iris 网络复制系统技术分析 - 第十四部分：RPC 系统”；
- 描述包含 `SendRPC`、`FNetRPC`、可靠性、参数反序列化、Partial Handler；
- canonical：`http://zhangga.github.io/html-articles/ue5-iris-guide-part-14/`；
- theme color 与 Part 13 一致；
- 内联 favicon。

### 6.3 Hero

内容：

- Part 14 / RPC System；
- 主标题“RPC 系统”；
- 副标题强调“Gameplay 看见一次函数调用，Iris 运输一份有目标、有顺序、有生命周期的对象附件”；
- 技术基线 UE 5.7.4；
- 文章来源跳转；
- 背景大字 `REMOTE CALL`。

### 6.4 目录

桌面和移动端均包含 13 项：

1. `#event-not-state`
2. `#decision`
3. `#journey`
4. `#overview`
5. `#callspace`
6. `#send`
7. `#delivery`
8. `#policy`
9. `#payload`
10. `#receive`
11. `#subobject-security`
12. `#transport`
13. `#practice`

目录文字和 `<section id>` 一一对应。

### 6.5 章节内容

#### 第 1 节：RPC 是一次调用，不是一份状态

- 以武器开火开场；
- 解释单向、无返回值、瞬时事件；
- 指出晚加入者不会回放历史 RPC；
- 给出“RPC 不负责最终真相”的核心结论。

#### 第 2 节：状态还是事件

- 二分决策图；
- 声音/粒子、输入意图、弹药、门状态、回合结果等案例；
- reliable 不是把事件变成持久状态；
- 业务序列号与幂等建议。

#### 第 3 节：一次开火 RPC 的端到端旅程

- 从 generated stub 到 `ProcessEvent` 的 10 步流水线；
- 标出 Gameplay / NetDriver / ReplicationSystem / NetBlob / Writer / Receiver 层；
- 给出各阶段最常见失败点。

#### 第 4 节：14.1 表面兼容，内核换轨

- 引用迁移文档；
- 对比 ActorChannel/Bunch 与 FNetRPC/ObjectAttachment；
- 说明本章聚焦 Iris 5.7.4 内部路径；
- 给出关键源码入口。

#### 第 5 节：Callspace、方向与 ownership

- Server / Client / Remote / NetMulticast 表；
- `UFUNCTION` 示例；
- owning connection；
- client 调 Server RPC 的所有权前提；
- 多播从客户端调用只本地执行的 Gameplay 规则；
- 服务端权威和输入校验。

#### 第 6 节：14.2 `SendRPC`

- 两个公开重载；
- “queued != delivered”；
- NetDriver 如何选重载；
- 单播与多播候选连接矩阵；
- 对象、子对象、replicated outer；
- 连接关闭与方向错误的处理。

#### 第 7 节：可靠、非可靠、Ordered 与丢包

- 四种组合矩阵；
- resend / ACK / head-of-line；
- UE5.7.4 非 multicast Ordered 实现；
- 跨 Actor 不保证原调用顺序；
- 丢包时间线；
- reliable 使用清单和反例。

#### 第 8 节：发送策略、OOB、休眠与 scope

- default queue vs OOB/PostTickDispatch 时序；
- `ScheduleAsOOB` / `SendImmediate`；
- 仅 unreliable；
- 策略在 5.7.4 公开 multicast / unicast 路径的边界；
- 休眠 RPC 默认触发 NetFlush；
- OOB 对象必须已复制；
- multicast 仍受 scope 约束。

#### 第 9 节：`FNetRPC` payload

- `FNetRPC : FNetObjectAttachment`；
- function locator；
- function parameter descriptor；
- quantize；
- reference export；
- 24-bit payload size；
- 零参数优化；
- 格式上限不是设计预算。

#### 第 10 节：14.3 接收、校验与执行

- `UNetRPCHandler::OnNetBlobReceived`；
- `ResolveFunctionAndObject`；
- 六道校验关卡；
- dequantize；
- Blueprint override；
- forward delegate；
- `FScopedNetContextRPC`；
- `ProcessEvent`；
- 参数析构；
- 跳过无效 payload 和 bitstream mismatch。

#### 第 11 节：SubObject 与安全

- RootObject / SubObject / replicated outer；
- 短生命周期可靠 SubObject RPC；
- scope 外和非 owning 连接；
- 服务端 ownership 只是第一层；
- 射速、弹药、位置、冷却、序号等 Gameplay 校验；
- 不让 RPC 决定权威状态。

#### 第 12 节：14.4 Handler 责任边界

- Handler 职责树；
- `UNetRPCHandler`；
- `FNetRPC`；
- `UPartialNetObjectAttachmentHandler`；
- shrink-wrap 和 partial assembly；
- 默认内部阈值；
- `UNetObjectBlobHandler` 负责 huge object state；
- 明确它不是普通 RPC 的必经路径。

#### 第 13 节：实战、性能、调试和总结

- 客户端开火 + 服务端确认 + 多播表现完整场景；
- 选择 reliable/unreliable；
- 参数瘦身；
- RPC 频率和带宽；
- Iris 日志与 NetTrace；
- `net.Iris.EnableRPCs` 等 CVar；
- 测试源码清单；
- 关键源码索引；
- 最佳实践 checklist；
- 下一部分“调试与性能分析”预告。

### 6.6 来源区

写明：

- 系列大纲来源；
- 第十四部分由 Jossy Zhang 原创扩写；
- 技术基线为本地 UE 5.7.4；
- 官方资料链接；
- 源码与测试文件清单；
- 未执行 UE 自动化测试。

### 6.7 页间导航

Part 14 底部：

- 上一篇：`/html-articles/ue5-iris-guide-part-13/`；
- 中间：`/ue5-iris-guide/`；
- 下一篇：第十五部分“调试与性能分析”占位，暂不链接。

更新 Part 13：

- 将“下一篇：第十四部分”占位改为链接；
- URL：`/html-articles/ue5-iris-guide-part-14/`。

## 7. 统一 Post 更新

更新 `source/_posts/ue5-iris-guide.md`：

- `updated` 改为 2026-07-25；
- 开头“已发布”改为第 1～14 部分；
- 主题串补充 RPC 系统；
- “全部文章”表增加第十四部分；
- “内容简介”增加第十四部分摘要；
- 摘要链接到 `/html-articles/ue5-iris-guide-part-14/`；
- 保留原来源说明；
- 继续说明第 5 部分起为原创扩写；
- 不创建单独 Part 14 Post。

## 8. 静态验证

### 8.1 HTML 结构

检查：

- 一个 `<h1>`；
- 13 个 `<h2>`；
- 26 个 TOC anchor links；
- 13 个 section id；
- 无重复 id；
- 所有内部 `href="#..."` 都有目标；
- canonical 唯一且正确；
- 外部链接使用 HTTPS；
- 站内链接使用根相对路径。

### 8.2 技术术语

必须出现：

- `UNetDriver::ProcessRemoteFunction`；
- `UReplicationSystem::SendRPC`；
- `FNetBlobManager`；
- `FNetRPC`；
- `UNetRPCHandler`；
- `UNetObjectBlobHandler`；
- `UPartialNetObjectAttachmentHandler`；
- `FNetObjectAttachment`；
- `FFunctionLocator`；
- `Quantize` / `Dequantize`；
- `Reliable` / `Ordered`；
- `ScheduleAsOOB` / `SendImmediate`；
- `ProcessEvent`；
- `net.Iris.EnableRPCs`。

### 8.3 语义防错

搜索并人工检查：

- “所有客户端”附近必须有 relevant/scope 条件；
- “立即”附近不得出现同步保证；
- `SendRPC` 返回值附近必须写 queued；
- `NetObjectBlobHandler` 附近必须写“不是普通 RPC”；
- 192 / 256 / 850 bytes 附近必须写内部默认阈值、不是 MTU；
- 24-bit / 2 MiB 附近必须写格式上限、不是推荐大小；
- 测试名附近必须写“测试源码”，不得写“本次测试通过”。

### 8.4 统一入口

确认：

- outline + Part 1～14 共 15 条文章路由；
- Part 14 路由只出现一次于文章表、一次于内容摘要链接；
- 不出现旧的小 Post 路径；
- Part 13 和 Part 14 导航互通。

## 9. 构建

执行：

```powershell
npm run clean
npm run build
```

确认：

- 命令退出码为 0；
- 生成 `public/html-articles/ue5-iris-guide-part-14/index.html`；
- 生成 `public/ue5-iris-guide/index.html`；
- 构建没有 broken link 或模板错误；
- `public/` 不进入提交。

## 10. 浏览器验证

浏览器测试前完整读取：

```text
C:\Users\Admin\.agents\skills\playwright-cli\SKILL.md
```

启动本地站点后验证：

### 桌面 1440×1000

- Hero、桌面 TOC、13 个章节、来源区和页间导航正常；
- 阅读进度条工作；
- 当前章节高亮；
- source tables / diagrams 无溢出；
- 页面控制台无错误；
- Part 13 “下一篇”可进入 Part 14；
- Part 14 “上一篇”可返回 Part 13；
- 统一 Post 可进入 Part 14。

### 移动端 390×844

- 桌面 TOC 隐藏、移动 TOC 可展开；
- body `scrollWidth <= clientWidth`；
- 表格在容器内横向滚动；
- Hero、代码块、Handler 树和导航卡片不撑破页面；
- “回到顶部”按钮可用。

### 已知噪音

- 统一 Post 的主题若加载外部字体 CDN 出现 403，应与 Part 14 自包含页面控制台结果分开记录；
- Part 14 本身不依赖外部字体，目标是零控制台错误。

## 11. 清理

验证后：

- 关闭 Playwright 会话；
- 停止本地静态服务器；
- 清理 `.playwright-cli`；
- 清理临时日志、截图和辅助脚本；
- 确认没有遗留 node/python server；
- 确认 UE 工作区状态未因本次任务改变；
- 最终 `git status --short` 只保留预期的 Part 13 / Part 14 内容与统一 Post 修改。

## 12. 提交策略

已经单独提交：

```text
docs: design Iris RPC article
```

本计划单独提交：

```text
docs: plan Iris RPC article
```

正文阶段暂不提交：

```text
source/html-articles/ue5-iris-guide-part-14/index.html
source/html-articles/ue5-iris-guide-part-13/index.html
source/_posts/ue5-iris-guide.md
```

等用户后续明确要求 `commit` 时，再将 Part 13 与 Part 14 正文、统一 Post 和导航更新一起提交。
