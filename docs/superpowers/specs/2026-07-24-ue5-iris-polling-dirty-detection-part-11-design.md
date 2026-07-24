# UE5 Iris 技术分析第十一部分：轮询与脏数据检测设计规格

## 1. 目标

根据《UE5 Iris 网络复制系统技术分析指南》大纲，补充第十一部分“轮询与脏数据检测”，覆盖：

- 11.1 脏数据检测机制概述：Poll、Push 与 Iris 混合策略；
- 11.2 `FDirtyNetObjectTracker`：三组位图、标脏、强制更新和跨帧协调；
- 11.3 Push Model：启用门槛、属性声明、标脏宏、Legacy 适配层和常见错误；
- 11.4 `FObjectPoller`：普通轮询、Push 轮询、强制轮询与并行任务；
- 11.5 `FObjectPollFrequencyLimiter`：频率换算、错峰、SIMD 更新和配置；
- 11.6 ChangeMask：对象级脏位、成员 Poll Mask 与量化 ChangeMask 的边界；
- 11.7 总结与工程最佳实践。

完整文章路由为 `/html-articles/ue5-iris-guide-part-11/`，Hexo 入口为 `/ue5-iris-guide-part-11/`。

## 2. 用户授权与默认决策

用户要求所有选择采用推荐项，且不再询问。因此本规格视为用户已预先批准：

- 技术基线使用本地 Unreal Engine 5.7.4 源码；
- 使用“帧流水线 + 三层脏状态 + 单对象双帧案例”的叙事方式；
- 保持 Part 10 的长篇独立 HTML 与短 Post 入口结构；
- 不添加装饰性图片，以 HTML/CSS 图表表达位图、门控和时间线；
- 正文实施完成后保持未提交，等待用户单独要求 `commit`；
- 设计规格与实施计划独立提交，避免与正文混在同一提交中。

## 3. 方案比较

### 方案 A：按类和 API 分章

依次罗列 Tracker、Poller、Limiter 与 ChangeMask。

优点是检索直接；缺点是读者难以理解这些对象在同一帧的先后关系，也容易把“标脏”误解为“立即发送”。

### 方案 B：只讲 Push Model 优化

围绕 `MARK_PROPERTY_DIRTY` 给出用法和性能建议。

优点是实用；缺点是覆盖不了普通 Poll、频率限制、强制更新、GC 引用刷新和 ChangeMask。

### 方案 C：帧流水线 + 三层脏状态 + 双帧案例（采用）

先回答“一个成员变化后，如何进入本帧发送候选集”，再分别放大 Tracker、Push、Poller、Limiter 和 ChangeMask，最后用同一对象连续两帧验证各层状态。

采用理由：

- 能按真实执行顺序串联大纲 11.1–11.7；
- 可以清楚区分“对象是否值得检查”“成员是否值得复制”“连接是否真的发送”；
- 能解释 Push 并非零轮询、ForceNetUpdate 并非立即发包；
- 便于给出可测量、可排查的工程建议。

## 4. 核心技术边界

### 4.1 三层脏状态必须分开

1. `FDirtyNetObjectTracker` 的对象位图决定哪些对象需要进入或绕过轮询门控；
2. per-property Push tracking 可把 `RepIndex` 映射成 Fragment 的 Member Poll Mask，缩小 Poll/Copy 范围；
3. 量化阶段生成的 ChangeMask 决定后续传播和序列化哪些成员。

它们不是同一个掩码，也不在同一阶段消费。

### 4.2 Push Model 不是“零轮询”

Push 标脏只提供“哪些对象/属性可能变化”的线索。`FObjectPoller` 仍负责读取外部状态、比较或量化，并在 GC 后按需刷新对象引用。混合 Push/Poll 对象仍需轮询非 Push Fragment。

### 4.3 标脏不等于发送

`MarkNetObjectStateDirty`、属性标脏宏和 `ForceNetUpdate` 都只影响候选集。对象仍要经过相关性、过滤、优先级、预算、序列化与传输阶段。

### 4.4 `ForceNetUpdate` 的准确含义

`ForceNetUpdate` 会设置专用位并同时将对象标脏。它可以绕过轮询频率限制，但不能承诺本帧一定写入网络包。`net.Iris.EnableForceNetUpdate` 控制“普通累计脏位是否也可绕过频率门控”的语义：

- `false`：累计 Dirty 也能绕过频率门控；
- `true`：只有 ForceNetUpdate 位能绕过频率门控。

### 4.5 Tracker 的三组位图

- `DirtyNetObjects`：本帧新标脏对象，帧末清空；
- `AccumulatedDirtyNetObjects`：跨帧累计，直到对象成功被轮询；
- `ForceNetUpdateObjects`：显式强制更新，成功轮询后清除对应位。

清理以 `ObjectsPolled` 为依据，未轮询对象的累计状态不能丢失。

### 4.6 Push 的双重启用门槛

- 编译期需要 `WITH_PUSH_MODEL`；
- 运行期需要 `net.IsPushModelEnabled`；
- Iris 还通过 `net.Iris.PushModelMode` 控制适配层模式。

源码中 `net.Iris.PushModelMode` 默认值为 2，但 `net.IsPushModelEnabled` 默认关闭，因此不能宣称 Push 在所有项目中默认生效。

### 4.7 频率限制按帧计数

`FObjectPollFrequencyLimiter` 使用 `uint8` 周期与计数器：

```text
FramesBetweenUpdates
= floor(MaxTickRate / max(0.001, PollFrequency)) - 1
```

结果限制为 0–255；0 表示每帧轮询，255 表示每 256 帧一次。相同频率对象通过起始偏移错峰，根对象和子对象可共享轮询帧。

### 4.8 ChangeMask 小对象内联

`FChangeMaskStorageOrPointer` 在 `BitCount <= 64` 时使用 64-bit 内联存储，超过 64 bits 才从分配器获取外部内存。成员描述符以 `BitOffset + BitCount` 映射成员，数组等成员可占多个 bit。

### 4.9 性能收益必须测量

不采用“大约快 10 倍”的普遍结论。文章只给成本模型：

```text
每帧总成本
= 候选对象发现
+ PreUpdate
+ 外部状态读取/比较
+ 量化
+ ChangeMask 与序列化
```

Push 主要降低前四项中的无效检查，频率限制降低检查频率，ChangeMask 降低后续成员处理范围。最终收益依赖对象数、变化率、Fragment 结构、连接数和平台。

教学带宽示例使用 10 个 32-bit 成员、仅 1 个变化：

```text
完整成员值：320 bits
简化成员选择模型：10-bit mask + 32-bit member = 42 bits
理论减少：86.9%
```

该数字明确排除稀疏掩码编码、对象/批次/DataStream/packet header 和具体 NetSerializer，不能当作最终包大小。

## 5. 推荐文章结构

页面设置 13 个主章节，桌面和移动目录一致：

1. 第十一部分导读：状态变化为什么不会自动进入网络；
2. 一帧全景图：从 Gameplay 写值到发送候选；
3. 11.1 脏数据检测机制概述；
4. 11.2 `FDirtyNetObjectTracker`；
5. 11.3 Push Model；
6. 11.4 `FObjectPoller`；
7. 11.5 `FObjectPollFrequencyLimiter`；
8. 11.6 ChangeMask；
9. 一个对象、连续两帧；
10. 性能成本模型与测量；
11. 接入清单与最佳实践；
12. 故障排查、源码与测试索引；
13. 11.7 总结与 Part 12 预告。

## 6. 关键章节设计

### 6.1 帧全景图

按 UE 5.7.4 的执行顺序展示：

```text
StartPreSendUpdate
→ UpdateDirtyObjectList
→ BuildPollList
→ PreUpdate
→ FinalizeDirtyObjects / lock
→ PollAndCopy
→ UpdateDirtyListPostPoll
→ QuantizeDirtyStateData
→ Filter / Prioritize / Send
→ ReconcilePolledList
```

强调发现、复制、量化和发送是不同阶段。

### 6.2 Push 示例

给出完整、安全的 C++ 示例：

- `FDoRepLifetimeParams::bIsPushBased = true`；
- `DOREPLIFETIME_WITH_PARAMS_FAST`；
- Setter 先比较、再赋值、最后 `MARK_PROPERTY_DIRTY_FROM_NAME`；
- 提醒 static array 使用专用宏；
- 说明漏标导致更新可能被跳过；
- 说明宏调用不会立即序列化。

### 6.3 Poller

比较三条路径：

- 普通 `PollAndCopyObjects`；
- `PushModelPollObject`；
- `ForcePollObject`。

补充 32 个 polling tasks、每次交错 16 words（512 个对象位、64 bytes）的 UE 5.7.4 源码默认值，并标注均为私有实现细节。

### 6.4 Frequency Limiter

展示：

- 频率到周期换算；
- 计数器 underflow 后命中并重载；
- dirty/force override 与 relevant mask 合并；
- x86 每批处理 32 个对象，另有 NEON 和标量路径；
- `PollConfigs` 类级覆盖、Actor `NetUpdateFrequency` 回退和动态更新。

### 6.5 ChangeMask

使用三层卡片：

```text
Object Dirty Bits
→ Member Poll Mask
→ Quantized ChangeMask
```

说明 Protocol 将各 ReplicationState 的 ChangeMask 扁平拼接；`FReplicationStateMemberChangeMaskDescriptor` 支持成员占多个 bit；网络侧使用 sparse ChangeMask，而不是把教学示例中的原始 mask 原样发送。

### 6.6 双帧案例

对象包含 `Health`（Push）、`Position`（Poll）和一个子对象。第一帧只改 Health，第二帧 Position 自然变化：

- 展示不同位图何时置位；
- 展示频率门控何时被绕过；
- 展示 fully-push 与 hybrid 的差别；
- 展示 ChangeMask 何时产生；
- 展示成功轮询后哪些位被清理；
- 明确发送仍可能被后续预算延迟。

## 7. 页面与交互设计

沿用 Part 10：

- 米白纸张背景、深蓝主色、橙红信号色；
- 左侧 sticky 目录、移动折叠目录；
- 阅读进度条、回到顶部；
- 上一篇/大纲/下一篇导航；
- 页尾文章来源。

新增组件：

- `.dirty-pipeline`：帧流水线；
- `.tracker-bits`：三组对象位图；
- `.poll-modes`：Poll/Push/Force 三路径；
- `.push-contract`：声明与标脏契约；
- `.frequency-wheel`：周期与错峰；
- `.mask-anatomy`：三层掩码；
- `.frame-journey`：双帧案例；
- `.cost-model`：CPU/带宽成本模型。

所有宽组件设置 `width: 100%; min-width: 0; overflow-x: auto`，移动端只能组件内部滚动，不得撑宽页面。

## 8. Hexo Post

```yaml
---
title: UE5-Iris 网络复制系统技术分析 - 第十一部分：轮询与脏数据检测
date: 2026-07-24 17:10:00
tags:
  - UE
  - Iris
  - 网络复制
id: ue5-iris-guide-part-11
categories:
  - 笔记
---
```

摘要必须点明 UE 5.7.4、Tracker/Push/Poller/Limiter/ChangeMask，并包含官方资料链接、原创扩写说明、`<!-- more -->` 和完整 HTML 链接。

## 9. 文章来源

完整 HTML 顶部技术依据与页尾均注明：

- 作者：Jossy Zhang；
- 内容性质：根据系列大纲原创扩写；
- 技术依据：本地 Unreal Engine 5.7.4 源码快照；
- 测试依据：`ReplicationSystemTestPlugin`；
- 官方资料：Epic Games UE 5.7 API 与网络调试文档。

## 10. 源码与测试依据

本地只读源码根目录：

```text
C:\work\st-unreal-engine
```

核心文件：

- `DirtyNetObjectTracker.h/.cpp`
- `GlobalDirtyNetObjectTracker.h/.cpp`
- `LegacyPushModel.h/.cpp`
- `PushModel.h/.cpp`
- `ObjectPoller.h/.cpp`
- `ObjectPollFrequencyLimiter.h/.cpp`
- `ObjectReplicationBridge.h/.cpp`
- `ReplicationSystem.cpp`
- `ChangeMaskUtil.h/.cpp`
- `ReplicationStateDescriptor.h`
- `ReplicationOperations.cpp`
- `ReplicationOperationsInternal.cpp`
- `TestDirtyNetObjectTracker.cpp`
- `TestObjectPollFrequencyLimiter.cpp`
- `TestPreUpdateCallback.cpp`
- `TestReplicationStateDescriptorBuilder.cpp`

## 11. 官方资料

- `FDoRepLifetimeParams`
- `UObjectReplicationBridge::SetPollFrequency`
- `FRootObjectReplicationParams`
- `UReplicationSystem::NetUpdate`
- Console Commands for Network Debugging
- Testing and Debugging Networked Games

## 12. 验收标准

### 内容

- 覆盖大纲 11.1–11.7；
- 明确技术基线 UE 5.7.4；
- 正确解释 Tracker 三组位图和清理时机；
- 正确解释 Push 双重启用门槛、宏契约和 per-property tracking 限制；
- 正确解释 Poller 普通/Push/Force 路径；
- 正确解释频率换算、错峰、SIMD 和 dirty override；
- 正确区分对象位图、Member Poll Mask 与 ChangeMask；
- 不把 MarkDirty、ForceNetUpdate 或 ChangeMask 描述为立即发包；
- 所有性能数字注明模型边界；
- 注明文章来源。

### HTML

- 单一合法文档骨架；
- 13 个主章节；
- 桌面/移动目录各 13 项且一致；
- id 唯一，所有 hash 链接有目标；
- 外链使用 `target="_blank" rel="noopener noreferrer"`；
- 无模板残留、UTF-8 替换字符和行尾空白；
- 桌面与移动端无整页横向溢出。

### 构建与浏览器

- `npm run build` 成功；
- Post 和完整 HTML 路由均生成；
- source/public 完整 HTML 哈希一致；
- 1440×1000 与 390×844 下目录、锚点、进度条、回顶和 Post 跳转正常；
- 文章脚本无控制台错误；
- 主题既有第三方字体 CDN 错误可记录为非本文阻塞项。

## 13. 工作区约束

- 不修改 `C:\work\st-unreal-engine`；
- 不覆盖 Part 7/8/10 未提交文件；
- 不提交 `public/`；
- Part 11 正文保持未提交，直到用户单独要求；
- 临时校验器、服务器日志和浏览器产物必须清理。
