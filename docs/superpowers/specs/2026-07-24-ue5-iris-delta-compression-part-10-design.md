# UE5 Iris 技术分析第十部分：Delta Compression 设计规格

## 1. 目标

根据《UE5 Iris 网络复制系统技术分析指南》大纲，补充第十部分“增量压缩（Delta Compression）”，覆盖：

- 10.1 增量压缩概述：原理、适用场景、性能收益；
- 10.2 `DeltaCompressionBaselineManager`：基线管理、存储、失效；
- 10.3 增量序列化：`SerializeDelta` / `DeserializeDelta`、差异计算、压缩率；
- 10.4 增量压缩配置：启用条件、类级配置、内存权衡。

完整文章路由为 `/html-articles/ue5-iris-guide-part-10/`，Hexo 入口为 `/ue5-iris-guide-part-10/`。

## 2. 用户授权与默认决策

用户要求所有选择采用推荐项，且不再询问。因此本规格视为用户已预先批准以下推荐设计：

- 技术基线使用本地 Unreal Engine 5.7.4 源码；
- 使用“源码状态机 + 双连接案例 + 位成本模型”的组合写法；
- 保持 Part 7–9 的长篇独立 HTML 与短 Post 入口结构；
- 不添加装饰性图片，使用 HTML/CSS 图表表达数据流、基线槽位与 ACK/Lost 分叉；
- 实施完成后正文保持未提交，等待用户单独要求 `commit`；
- 设计规格与实施计划独立提交，避免与正文混在同一提交中。

## 3. 方案比较

### 方案 A：纯概念手册

按 10.1–10.4 逐节解释术语和接口。

优点：

- 与大纲一一对应；
- 检索容易。

缺点：

- `CreateBaseline`、Writer、Reader、ACK/Lost 之间容易被拆散；
- 读者难以理解为什么同一对象对不同连接会产生不同位流。

### 方案 B：纯位流与压缩实验

以整数、浮点和数组的位数实验为中心。

优点：

- 性能收益直观；
- 容易说明何时增量反而更贵。

缺点：

- 弱化 `DeltaCompressionBaselineManager` 的状态和内存职责；
- 无法完整覆盖配置、失效与连接级生命周期。

### 方案 C：源码状态机 + 双连接案例 + 位成本模型（采用）

先建立三层边界，再沿两个连接的基线分叉走完整生命周期，最后用成员级编码表和内存模型判断收益。

采用理由：

- 能串联大纲四节而不变成 API 清单；
- 能复用现有 `iris-baseline` 文章的教学场景，同时修正其简化位数模型；
- 可以明确区分 ChangeMask、对象级基线选择和成员级 Delta 编码；
- 既有源码深度，也能给出可执行的配置与性能建议。

## 4. 受众与技术深度

目标读者：

- 已阅读本系列前九部分；
- 熟悉复制对象、ChangeMask、量化状态、Writer/Reader 和 DataStream；
- 希望理解 UE 5.7.4 Iris 如何维护连接级基线并评估实际收益。

文章不要求读者提前理解 `FDeltaCompressionBaselineManager` 私有布局，但会给出关键字段、状态转换、位流结构和源码位置。

## 5. 技术边界

### 5.1 本文负责

- 对象级 Delta 是否允许、何时实际启用；
- 每连接两个 Baseline 槽位及 `InvalidBaselineIndex = 2`；
- `BaselineIndexBitCount = 2` 的原因；
- 新基线创建、pending、ACK、Lost、失效、释放；
- 同一帧同对象跨连接共享量化快照；
- per-connection ChangeMask 如何累计，以及 Lost 时为何需要 Merge；
- Writer/Reader 的 full / delta / store-new-baseline 路径；
- `SerializeWithMaskDelta` 到成员 `SerializeDelta` 的调用链；
- 默认 Delta、整数 Delta、浮点 Delta 和动态状态的差异；
- 全局开关、基线创建节流、类级配置、运行时 API 和对象数量上限；
- 带宽、内存和 CPU 的权衡与测量建议。

### 5.2 本文不负责

- 重复展开 Part 7 的全部 NetSerializer 类型；
- 重复展开 Part 8 的 DataStream 封包与传输反馈框架；
- 重复展开 Part 9 的 Attachment/NetBlob；
- 完整讲解 Part 11 的 Poll、Push Model 和 DirtyNetObjectTracker；
- 把示例位数宣称为最终 UDP 包大小；
- 把私有实现描述为跨版本稳定 API。

## 6. 核心技术结论

### 6.1 三层机制必须分开

1. ChangeMask 决定本次需要处理哪些成员；
2. 对象级 Baseline 决定这些成员相对哪份已确认量化状态编码；
3. 成员 `SerializeDelta` 决定具体值差异如何写入 bitstream。

ChangeMask 不是 Delta，Delta 也不会自动省掉所有未变化成员。

### 6.2 启用是多道门

对象真正进入 Delta 路径至少需要：

- `net.Iris.EnableDeltaCompression` 全局开关为真；
- 对象 Protocol 具有 `EReplicationProtocolTraits::SupportsDeltaCompression`；
- 类配置或 `SetDeltaCompressionStatus(..., Allow)` 允许；
- Manager 有可用的 per-object/baseline 存储；
- 当前连接存在有效、已确认 Baseline，或者能够创建新的 Baseline。

官方 API 明确说明 `SetDeltaCompressionStatus` 只是允许，不保证实际使用。

### 6.3 两槽位不是两个全局版本

- `MaxBaselineCount = 2`；
- 每个连接、每个对象都有槽位 0/1；
- `InvalidBaselineIndex = 2`，因此索引字段需要 2 bits；
- Writer 维护 `LastAckedBaselineIndex` 与 `PendingBaselineIndex`；
- Reader 维护 `LastStoredBaselineIndex`、`PrevStoredBaselineIndex` 和两个接收快照。

不同连接的 ACK/Lost 进度可以分叉，所以同一对象同一帧可产生不同位流。

### 6.4 新 Baseline 不能立即作为压缩依据

当前发送状态可被保存为 pending Baseline，但只有承载它的记录 Delivered 后，Writer 才将其变为 `LastAckedBaselineIndex`。在确认前不能假设接收端已经存好该快照。

### 6.5 Lost 与普通 Destroy 不同

- Delivered：销毁旧已确认 Baseline，将 pending 推进为 last-acked；
- Lost：`LostBaseline` 释放 pending，并把该 Baseline 对应的 ChangeMask 合并回连接累计 mask；
- Destroy：释放 Baseline，但不合并 ChangeMask；
- 条件变化或其他失效事件：使相关 Baseline 不再可用，Writer 回退到无有效 Baseline 的路径。

### 6.6 同帧快照共享

`FBaselineSharingContext` 保证同一次 `SendUpdate` 内，同一对象为多个连接创建新 Baseline 时可以共享同一份量化状态快照，通过引用计数持有。连接仍保留各自的槽位和 ChangeMask；共享的是状态存储，不是连接进度。

### 6.7 基线创建有节流

- `net.Iris.MinimumNumberOfFramesBetweenBaselines` 默认 60；
- 对象没有任何 Baseline 时允许创建第一份；
- 后续创建受帧间隔限制；
- `PrevBaselineCreationFrame` 是 per-object 状态，因此节流不是每连接独立计时；
- 当前默认值和私有策略必须在升级引擎后重新核对。

### 6.8 初始状态与对象级 Delta 是两件事

`net.Iris.DeltaCompressInitialState` 默认开启时，初始状态可以相对 Protocol 的 default state 调用 Delta 序列化。这不等同于“已有已确认连接 Baseline”；它是 creation/initial-state 的独立优化路径。

### 6.9 成员级 Delta 不保证更小

- 默认 Delta 可能只增加“与 Prev 相同”1 bit；若不同则继续写完整值；
- 16-bit 整数使用表 `{0, 4, 10}`，索引 2 bits：相同为 2 bits，小差值可为 6/12 bits，大差值为 18 bits；
- 8-bit 整数对非零差异可能是 1-bit 索引加 8-bit 完整值，比普通 8 bits 更大；
- 浮点数按其量化位模式做 Delta bit packing，而不是数学意义上的浮点减法压缩；
- 因此必须按真实数据分布测量，而不是只看类型名称。

## 7. 推荐文章结构

页面设置 12 个主章节，桌面和移动目录一致：

1. 第十部分导读：为什么“只发变化”还需要 Baseline；
2. 三层压缩地图：ChangeMask / Baseline / Serializer Delta；
3. 10.1 增量压缩概述；
4. 10.2 `DeltaCompressionBaselineManager`；
5. 10.3 增量序列化；
6. 10.4 增量压缩配置；
7. 双连接、同一对象：ACK/Lost 后的基线分叉；
8. Writer → wire → Reader 完整旅程；
9. 位成本与压缩率模型；
10. 内存、CPU 与失效成本；
11. 故障排查、源码与测试索引；
12. 总结与下一部分预告。

## 8. 章节设计

### 8.1 导读

- 从 Part 9 回到状态复制；
- 解释“只发送脏成员”不等于“成员值已经增量编码”；
- 提出本文主问题：双方如何确认“相对哪一份状态”。

### 8.2 三层压缩地图

使用分层卡片和流水线：

```text
Poll / Push → ChangeMask
             ↓
per-connection LastAcked Baseline
             ↓
SerializeWithMaskDelta
             ↓
member SerializeDelta(Source, Prev)
```

给出三类常见混淆的反例。

### 8.3 10.1 增量压缩概述

- 使用“版本文档 + 已签收版本”类比；
- 解释完整状态、无有效 Baseline 的 full-with-mask、有效 Baseline 的 delta；
- 适用：状态较大、更新频繁、值局部变化、连接稳定；
- 不适用：一次性对象、小状态、变化幅度随机、连接丢包率高、动态状态克隆昂贵；
- 强调收益需减去 Baseline header、成员 Delta 元数据和内存/CPU。

### 8.4 10.2 Manager

拆成五个子节：

1. Manager 的职责和生命周期；
2. `FPerObjectInfo`、`FObjectBaselineInfo`、`FInternalBaseline`；
3. 两槽位和状态存储；
4. ChangeMask 累计与 Lost Merge；
5. 同帧共享、节流与条件失效。

使用二维图展示“对象 × 连接 × 槽位”，并单独画引用共享。

### 8.5 10.3 增量序列化

按调用链解释：

```text
ReplicationWriter::SerializeObjectStateDelta
→ FReplicationProtocolOperations::SerializeWithMaskDelta
→ FReplicationStateOperations::SerializeDeltaWithMask
→ FNetSerializer::SerializeDelta
```

接收端反向：

```text
ReplicationReader::DeserializeObjectStateDelta
→ DeserializeWithMaskDelta
→ DeserializeDeltaWithMask
→ FNetSerializer::DeserializeDelta
```

补充：

- `Prev` 指向已确认量化状态；
- ChangeMask 仍写入 bitstream；
- 默认 Delta、整数表驱动 Delta、浮点位模式 Delta；
- dynamic state 需要 clone/free；
- 初始状态相对 default state 的独立路径。

### 8.6 10.4 配置

列出四层控制：

1. 全局 CVar；
2. Protocol 支持；
3. Bridge 类级 `DeltaCompressionConfigs`；
4. 运行时 `SetDeltaCompressionStatus`；
5. 系统容量 `MaxDeltaCompressedObjectCount`。

提供配置示例，但明确示例应放入项目配置，且类路径必须按项目类型调整。

### 8.7 双连接案例

对象：

```text
S0 = { Health=100, Ammo=30 }
S1 = { Health=80,  Ammo=30 }
S2 = { Health=80,  Ammo=25 }
```

流程：

- A/B 先确认 S0；
- Health 更新后为两连接建立 pending S1；
- A Delivered，B Lost；
- A 基于 S1 发送 Ammo 差异；
- B 回退到 S0，Lost Merge 使 Health 重新进入需要发送的集合；
- 两客户端最终收敛到 S2。

不复用现有短文的“13/29 bits”作为最终引擎位数；正文用“教学模型位数”和“真实引擎额外开销”两栏区分。

### 8.8 Wire 与接收端

更新路径的核心结构：

```text
LastAckedBaselineIndex : 2 bits
if valid:
    bIsNewBaseline     : 1 bit
    sparse ChangeMask
    member deltas
else:
    CreatedBaselineIndex : 2 bits
    sparse ChangeMask
    full member values
```

Reader 根据 BaselineIndex 选择 `StoredBaselines[0/1]`，反序列化后可将当前 ReceiveState 存为新槽位。

### 8.9 位成本

建立三组对照：

- 8-bit 整数：非零差异可能比 full 多 1 bit；
- 16-bit 整数：小差异通常有收益，大差异可能多 1 bit；
- 默认 Delta：相同值 1 bit，不同值为 1 bit + full。

所有数字只表示成员编码，不包含对象句柄、batch、ChangeMask 稀疏编码、Baseline header、DataStream 和 packet header。

### 8.10 内存与 CPU

内存模型包含：

- Manager per-object/per-connection 槽位；
- 每连接累计 ChangeMask + 两个 Baseline ChangeMask；
- 实际量化快照；
- dynamic state 深拷贝；
- 接收端最多两个 Stored Baseline；
- 同帧快照共享带来的缓解。

CPU 模型包含：

- clone/free dynamic state；
- Sparse ChangeMask；
- Serializer Delta；
- 失效/丢包后的重建；
- 多连接状态查找。

### 8.11 排查与源码索引

排查顺序：

1. 确认全局 CVar；
2. 确认类配置或 API；
3. 确认 Protocol trait；
4. 确认对象容量；
5. 检查 baseline 创建节流；
6. 检查 pending/ACK/Lost；
7. 检查条件变化是否触发 invalidation；
8. 用 NetTrace/日志比较 full 与 delta 位数。

列出 Writer、Reader、Manager、Storage、InvalidationTracker、ReplicationOperations、NetSerializerBuilder、BitPacking 和自动化测试文件。

### 8.12 下一部分

预告 Part 11“轮询与脏数据检测”，把问题从“相对哪个历史状态编码”转向“当前状态如何被判定为需要复制”。

## 9. 页面与交互设计

### 9.1 视觉延续

沿用 Part 9：

- 米白纸张背景；
- 深蓝 Iris 主色；
- 橙红信号色；
- 左侧 sticky 目录；
- 移动端折叠目录；
- 阅读进度条；
- 回到顶部；
- 上一篇/大纲/下一篇导航；
- 页尾文章来源。

### 9.2 新增组件

- `.compression-stack`：三层机制堆栈；
- `.baseline-matrix`：连接 × 槽位矩阵；
- `.fork-lanes`：A/B ACK/Lost 分叉时间线；
- `.wire-layout`：Baseline header 位布局；
- `.cost-bars`：full/delta 位成本比较；
- `.memory-equation`：内存模型；
- `.gate-chain`：启用门控链。

所有宽组件必须在移动端独立横向滚动，不得撑宽页面。

### 9.3 可访问性

- 语义化 `header/main/article/aside/footer`；
- 所有 H2/H3 有唯一 id；
- 目录链接对应实际锚点；
- 外链使用 `target="_blank" rel="noopener noreferrer"`；
- 图形组件提供 `aria-label`；
- 颜色之外使用文字、符号和边框表达状态；
- 移动端不依赖 hover。

## 10. Hexo Post

Post front matter：

```yaml
---
title: UE5-Iris 网络复制系统技术分析 - 第十部分：增量压缩
date: 2026-07-24 16:10:00
tags:
  - UE
  - Iris
  - 网络复制
id: ue5-iris-guide-part-10
categories:
  - 笔记
---
```

摘要必须：

- 点明 UE 5.7.4；
- 概括 Baseline Manager、ACK/Lost、SerializeDelta 和配置；
- 注明 Jossy Zhang 根据系列大纲原创扩写；
- 包含官方资料链接；
- 用 `<!-- more -->` 分隔；
- 链接完整 HTML。

## 11. 文章来源

完整 HTML 的顶部技术依据和页尾均注明：

- 作者：Jossy Zhang；
- 内容性质：根据系列大纲原创扩写；
- 技术依据：本地 Unreal Engine 5.7.4 源码快照；
- 测试依据：`ReplicationSystemTestPlugin`；
- 官方资料：Epic Games UE 5.7 API 文档。

## 12. 源码依据

本地只读源码根目录：

```text
C:\work\st-unreal-engine
```

核心文件：

- `DeltaCompressionBaselineManager.h/.cpp`
- `DeltaCompressionBaselineStorage.h/.cpp`
- `DeltaCompressionBaselineInvalidationTracker.h/.cpp`
- `ReplicationWriter.cpp`
- `ReplicationReader.cpp`
- `ReplicationOperations.cpp`
- `ReplicationStateStorage.h/.cpp`
- `ReplicationProtocolManager.cpp`
- `NetSerializer.h`
- `NetSerializerBuilder.inl`
- `BitPacking.h/.cpp`
- `IntNetSerializerBase.h`
- `FloatNetSerializers.cpp`
- `ObjectReplicationBridgeConfig.h`
- `ObjectReplicationBridge.cpp`
- `ReplicationSystem.h/.cpp`
- `TestObjectDeltaSerialization.cpp`

## 13. 官方资料

- `UReplicationSystem::SetDeltaCompressionStatus`
- `FNetSerializeDeltaArgs`
- `FNetDeserializeDeltaArgs`
- `FNetSerializer`
- `FObjectReplicationBridgeDeltaCompressionConfig`
- `UObjectReplicationBridgeConfig`
- Components of Iris

## 14. 验收标准

### 14.1 内容

- 覆盖大纲 10.1–10.4；
- 明确 UE 5.7.4；
- 明确 ChangeMask / Baseline / Serializer Delta 三层边界；
- 正确解释两个 Baseline 槽位和 2-bit index；
- 正确解释 pending、ACK、Lost Merge、失效和共享；
- 正确解释初始状态相对 default state 的独立路径；
- 正确解释成员级 Delta 可能变大；
- 包含配置、收益、内存和故障排查；
- 注明文章来源。

### 14.2 HTML

- 单一合法文档骨架；
- 12 个主章节；
- 桌面/移动目录各 12 项且一致；
- id 唯一；
- 所有 hash 链接有目标；
- 外链安全属性完整；
- 无模板残留和 UTF-8 替换字符；
- 无行尾空白。

### 14.3 构建

- `npm run build` 成功；
- 生成 `/ue5-iris-guide-part-10/`；
- 生成 `/html-articles/ue5-iris-guide-part-10/`；
- source/public 完整 HTML 哈希一致。

### 14.4 浏览器

桌面 1440×1000：

- sticky 目录可见，移动目录隐藏；
- 无整页横向溢出；
- 目录跳转和当前章节高亮正常；
- 进度条、回到顶部正常。

移动 390×844：

- 桌面目录隐藏，折叠目录可用；
- 无整页横向溢出；
- 表格、代码、位布局、矩阵、时间线和成本图独立滚动；
- Post 入口可跳转到完整 HTML；
- 文章脚本无控制台错误。

主题已有第三方字体 CDN 错误可记录为非本文阻塞项。

## 15. 工作区约束

- 不修改 `C:\work\st-unreal-engine`；
- 不覆盖 Part 7/8 的未提交文件；
- 不把 `public/` 构建产物加入提交；
- 不提交 Part 10 正文，直到用户单独要求；
- 临时生成器、校验器、服务器日志和 Playwright 产物必须清理。

## 16. 自检

- 无未完成标记或占位章节；
- 章节结构覆盖大纲且不越界；
- 技术结论与 UE 5.7.4 源码一致；
- “允许 Delta”与“实际使用 Delta”区分明确；
- 示例位数与最终网络包大小区分明确；
- 两连接示例与 Manager 的 per-connection 状态一致；
- 设计范围可由一个实施计划完成。
