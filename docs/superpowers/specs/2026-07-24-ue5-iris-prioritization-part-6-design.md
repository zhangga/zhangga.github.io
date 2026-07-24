# UE5 Iris 技术分析第六部分：优先级系统设计

## 目标

根据现有《UE5 Iris 网络复制系统技术分析指南》大纲，补充系列第六部分“优先级系统（Prioritization）”。文章延续第五部分的技术深度和视觉结构，以 Unreal Engine 5.5 Iris 为分析基线，帮助读者理解对象通过过滤后，Iris 如何在逐连接带宽预算下决定发送次序。

完成后的读者应能：

- 区分过滤、优先级和实际发送三个阶段的职责。
- 理解静态优先级、动态优先级和优先级累积机制。
- 掌握 `UNetObjectPrioritizer` 的生命周期、输入和输出。
- 理解位置类 Prioritizer 如何获取、缓存和批量更新对象位置。
- 根据业务选择 Sphere、Owner Boost、Field of View 或 Count Limiter。
- 理解 `FReplicationView` 对距离、方向、多视图和 ViewTarget 提升的影响。
- 通过配置和运行时 API 为不同对象分配 Prioritizer。
- 从 `FReplicationPrioritization` 的执行流程定位优先级异常和性能问题。

## 内容定位

- 标题：`UE5-Iris 网络复制系统技术分析 - 第六部分：优先级系统`
- HTML 页面：`source/html-articles/ue5-iris-guide-part-6/index.html`
- 博客入口：`source/_posts/ue5-iris-guide-part-6.md`
- 完整文章路由：`/html-articles/ue5-iris-guide-part-6/`
- 目标读者：已阅读前五部分、希望深入 Iris 核心子系统的 UE 网络程序员。
- 技术基线：Unreal Engine 5.5 Iris。

本文属于基于系列大纲扩写的原创技术内容，不标注为知乎转载。页尾注明技术依据为 UE 5.5 Iris 官方文档与源码。引用类、接口、配置和默认值时必须先在目标版本中核对。

## 叙事策略

采用“决策流水线优先”的组织方式，同时保留大纲中的 `6.1` 至 `6.8` 编号。

全文使用两个互相配合的类比和案例：

1. 快递装车：第五部分决定包裹是否进入配送站，第六部分决定车辆容量不足时哪些包裹先上车。
2. 百人大逃杀：某连接经过过滤后仍有 800 个相关对象，而解释性预算模型假设本帧只能覆盖约 120 个对象。

每个核心章节尽量遵循以下节奏：

1. 提出带宽或调度问题。
2. 用快递装车类比建立直觉。
3. 解释核心机制和数据流。
4. 展示 API、配置或源码结构。
5. 放入百人大逃杀案例。
6. 总结误用、性能成本和版本边界。

## 章节结构

### 6.1 优先级系统概述

- 从“通过过滤的对象仍超过单帧带宽”切入。
- 明确三个阶段：
  - 过滤回答“对象是否属于该连接的复制作用域”。
  - 优先级回答“作用域内对象的相对紧迫程度”。
  - 写入和带宽调度决定“本帧实际写入哪些状态”。
- 解释静态优先级与动态优先级的差别。
- 说明优先级计算时机、数值含义和连接隔离。
- 解释未发送对象的优先级累积如何减轻饥饿。
- 给出过滤结果进入优先级系统，再进入写入阶段的总流程图。

### 6.2 `UNetObjectPrioritizer` 基类

- 介绍初始化、连接生命周期和对象生命周期。
- 解释以下接口或数据结构的职责：
  - `Init` / `Deinit`
  - `AddConnection` / `RemoveConnection`
  - `AddObject` / `RemoveObject`
  - `UpdateObjects`
  - `Prioritize`
  - `FNetObjectPrioritizationInfo`
- 解释 8 字节对象级 Prioritization Info 的设计目的，以 UE 5.5 头文件的实际声明为准。
- 说明批量输入对象索引、连接视图与输出优先级之间的关系。
- 说明 Prioritizer 如何与第五部分生成的逐连接作用域协作。
- 给出最小自定义 Prioritizer 骨架，明确标注为解释性示例。

### 6.3 内置优先级器

先介绍 `ULocationBasedNetObjectPrioritizer` 提供的位置型基础能力：

- 世界位置来自 WorldLocations 或带 `RepTag_WorldLocation` 的复制状态。
- 对象位置缓存的分配、更新和释放。
- 批量位置操作与 SIMD 优化的目的。

随后横向分析四类内置策略：

#### `USphereNetObjectPrioritizer`

- 内球、外球和球外区域的优先级映射。
- 距离平方、插值和批处理。
- 单视图、双视图和多视图路径。
- 玩家、载具、掉落物等空间对象的适用方式。

#### `USphereWithOwnerBoostNetObjectPrioritizer`

- 在 Sphere 结果上提高拥有者相关对象的优先级。
- Owner 信息来源和更新时机。
- 适合玩家自身 Pawn、载具或所有者敏感对象的场景。
- 避免把 Owner Boost 误解为 Owner Filtering。

#### `UFieldOfViewNetObjectPrioritizer`

- 视野锥、视线胶囊、内球和外球共同影响优先级。
- 屏幕方向相关对象与身后对象的差异。
- 高速转向、多视图和错误视图方向的边界。

#### `UNetObjectCountLimiter`

- RoundRobin 模式。
- Fill 模式与饥饿预防。
- Owned Objects Fast Lane。
- 它限制候选对象数量，而不是按距离连续评分。
- PlayerState 等对象集合的典型用途。

本节结尾提供选择决策表，比较位置依赖、方向依赖、Owner 加成、对象数量限制、成本和常见误用。

### 6.4 `FReplicationView`

- 介绍 `FReplicationView::FView` 的位置、方向和 ViewTarget 等关键信息。
- 说明视图如何从 PlayerController 或网络连接更新到 Iris。
- 解释 Prioritizer 为什么依赖视图，而不是直接查询摄像机 Actor。
- 介绍分屏和子连接形成的多视图。
- 说明多视图下对象取最高相关性或合并结果时必须以 UE 5.5 实现为准。
- 使用大逃杀观战、载具摄像机和分屏场景说明错误 View 数据的表现。

### 6.5 优先级配置

- 展示 `NetObjectPrioritizerDefinitions` 的注册结构。
- 展示 `UObjectReplicationBridgeConfig` 的类级 Prioritizer 配置。
- 说明 `FObjectReplicationBridgePrioritizerConfig` 的字段和继承规则。
- 介绍默认空间 Prioritizer、类级配置和强制启用选项。
- 展示运行时设置 Prioritizer 和静态优先级的 API。
- 说明配置片段、已核对 API 和解释性伪代码的区别。
- 给出大逃杀对象分类配置表：
  - 玩家和载具使用 Sphere 或 Owner Boost。
  - 需要方向感知的敌人或目标使用 FOV。
  - PlayerState 等集合使用 Count Limiter。
  - 比赛关键状态使用静态高优先级或适当固定策略。

### 6.6 优先级系统内部实现

以 `FReplicationPrioritization` 为核心串联执行流程：

- Prioritizer 初始化与定义加载。
- 新增和删除对象的状态更新。
- 脏对象通知与位置缓存刷新。
- 批处理辅助结构如何减少零散调用。
- 逐连接构造候选对象。
- 静态和动态优先级的合并。
- ViewTarget 或连接关键对象的提升。
- 未发送对象的优先级累积。
- 结果进入后续写入和带宽调度阶段。

重点核对并解释：

- `TChunkedArrayWithChunkManagement`
- `FPrioritizerBatchHelper`
- `FUpdateDirtyObjectsBatchHelper`
- `NotifyPrioritizersOfDirtyObjects`
- `UpdatePrioritiesForNewAndDeletedObjects`
- `InitPrioritizers`
- `Prioritize`
- `PrioritizeForConnection`
- `AddConnection` / `RemoveConnection`
- `SetStaticPriority`
- `SetPrioritizer`

源码分析展示五阶段主流程，但阶段名称和顺序必须从 UE 5.5 实现提取，不预先虚构。

### 6.7 实际应用案例

主案例为百人大逃杀连接：

1. 第五部分的过滤系统生成 800 个在作用域对象。
2. 对象按玩家、载具、掉落物、PlayerState、队伍对象和全局状态分类。
3. 各类 Prioritizer 按连接视图产生可比较的优先级。
4. ViewTarget、Owner 和关键状态获得额外保障。
5. 解释性预算模型按约 120 个对象展示第一帧选择。
6. 未发送对象通过累积提高后续帧竞争力。
7. 连续多帧表格展示高紧迫对象、普通对象和低优先级对象的变化。

“800→120”只用于解释优先级、累积和防饥饿。正文必须明确：真实 Iris 写入阶段受对象状态大小、附件、可靠性、已发送状态和位预算等因素影响，不是固定按对象数量截断。

本节末尾简要比较：

- FPS：FOV 和 Owner Boost 权重更高。
- 开放世界 RPG：Sphere 分层和大规模对象密度更重要。
- 竞速游戏：高速移动、多视图和载具 Owner Boost 更关键。
- 大逃杀：空间评分、PlayerState 限量和队伍关键对象组合使用。

### 6.8 小结

- 知识点总结。
- Prioritizer 继承关系和职责表。
- 选择 Prioritizer 的决策树。
- 常见故障排查表。
- 性能优化建议。
- 关键源码文件索引。
- 调试检查清单。
- 下一部分“序列化系统”预告。

## 完整数据流

百人大逃杀示例的数据流如下：

1. Bridge 将对象注册到 ReplicationSystem。
2. 第五部分的过滤系统为连接生成作用域。
3. Prioritization 更新新增、删除和脏对象缓存。
4. 连接提供一个或多个 Replication View。
5. 每个 Prioritizer 批量计算其负责对象的逐连接动态优先级。
6. 静态优先级、动态结果、ViewTarget 和特殊提升规则被合并。
7. 未发送历史产生的累积量参与后续帧计算。
8. 优先级结果交给复制写入和带宽预算阶段。
9. 写入阶段根据实际位成本决定本帧发送内容。
10. 未发送对象保留并在后续帧继续竞争。

## 技术准确性与异常处理

- 优先使用 Epic 官方 UE 5.5 Iris 文档和本机 UE 5.5 源码。
- 不将类名、配置名或行为从更新版本直接反推到 UE 5.5。
- 源码内容分为三类并显式标注：
  - 核对过的接口或结构摘录。
  - 项目配置示例。
  - 为解释流程编写的简化伪代码或预算模型。
- 不虚构精确行号。
- 不把优先级数值描述为跨 Prioritizer 绝对统一的物理量；以相对顺序和具体实现为准。
- 不把 Count Limiter、动态 Prioritizer 和后续带宽写入阶段混为同一机制。
- 不把 Owner Boost 描述成可见性或安全边界；对象是否允许复制仍由过滤系统决定。
- 如果某项默认值、SIMD 分支或多视图合并细节无法在 UE 5.5 中确认，则退回概念级说明并标注版本边界。
- 明确 Iris 位于 Experimental 模块，后续版本可能调整 API、配置和内部实现。

## 页面与视觉设计

- 复用第五部分的编辑型技术文章样式：
  - 深蓝渐变 Hero。
  - 桌面固定目录。
  - 移动端折叠目录。
  - 阅读进度条。
  - 当前章节高亮。
  - 代码块和可横向滚动表格。
- Hero 文案：
  - 主标题：`UE5-Iris 网络复制系统技术分析`
  - 副标题：`第六部分：优先级系统`
- 用文本流程图和表格表达执行流水线与多帧数字推演。
- 不生成装饰性图片。
- 页面不显示“文章来源：知乎”；页尾注明作者原创整理及 UE 5.5 技术依据。

## 验收标准

### 内容

- 覆盖大纲 `6.1` 至 `6.8` 的全部主题。
- 清楚区分过滤、优先级和实际发送。
- 覆盖所有大纲要求的内置 Prioritizer。
- 解释 `FReplicationView` 和多视图。
- 至少包含一套完整大逃杀 Prioritizer 配置方案。
- 包含自洽的 800→120 多帧数字推演，并明确它是解释性模型。
- 对 FPS、开放世界 RPG 和竞速游戏给出差异化建议。
- 关键代码和配置均标注其性质。
- 包含故障排查、性能建议和源码索引。

### HTML

- 所有章节拥有唯一稳定锚点。
- 桌面目录和移动目录与章节数量一致。
- 无嵌套链接、重复 ID、外部热链图片或不安全链接。
- 代码块和表格在窄屏内部滚动，不造成页面级横向溢出。
- 页面元数据、标题和描述与第六部分一致。

### 博客

- Post 标题、摘要、标签、分类和完整 HTML 链接正确。
- Hexo 构建成功。
- 生成后的 Post 能访问第六部分完整 HTML 页面。

### 浏览器验收

- 桌面端检查 Hero、固定目录、锚点高亮、代码块、表格和页尾。
- 390 像素宽移动端检查折叠目录、标题换行、代码滚动和表格滚动。
- 检查阅读进度和返回顶部。
- 检查 Post 到完整 HTML 页面的跳转。
- 页面无运行时警告或错误。
