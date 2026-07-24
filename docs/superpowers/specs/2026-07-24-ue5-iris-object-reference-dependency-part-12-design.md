# UE5 Iris 技术分析第十二部分：对象引用与依赖设计规格

## 1. 目标

根据《UE5 Iris 网络复制系统技术分析指南》大纲，补充第十二部分“对象引用与依赖”，覆盖：

- 12.1 `FObjectReferenceCache`：对象引用缓存、引用解析、循环引用处理；
- 12.2 `FNetDependencyData`：依赖关系定义、依赖调度、`EDependentObjectSchedulingHint`；
- 12.3 `FNetTokenStore`：Token 存储机制、名称 Token、字符串 Token、结构体 Token；
- 12.4 `UNetObjectFactory`：`UNetActorFactory`、`UNetSubObjectFactory`、自定义工厂注册。

完整文章路由为 `/html-articles/ue5-iris-guide-part-12/`，Hexo 入口为 `/ue5-iris-guide-part-12/`。

## 2. 用户授权与默认决策

用户要求所有选择采用推荐项，且不再询问。因此本规格视为用户已预先批准：

- 技术基线使用本地 Unreal Engine 5.7.4 源码；
- 使用“发送端采集引用 → 导出身份 → 接收端解析或排队 → Factory 创建 → 依赖调度”的端到端叙事；
- 保持 Part 11 的长篇独立 HTML 与短 Post 入口结构；
- 使用 HTML/CSS 图表表达身份、依赖、Token 和创建过程，不添加装饰性图片；
- 设计规格与实施计划独立提交；
- 正文实施完成后保持未提交，等待用户单独要求 `commit`；
- 不修改本地 UE 源码。

## 3. 方案比较

### 方案 A：按四个类逐一解释

依次介绍 ObjectReferenceCache、NetDependencyData、NetTokenStore 和 NetObjectFactory。

优点是对应大纲直接；缺点是读者看不出四者如何协作，也容易把“引用解析”和“对象创建”混为一谈。

### 方案 B：只讲 UObject 指针如何复制

以一个 `UPROPERTY` 对象指针为主线，只展开引用采集与解析。

优点是入门容易；缺点是无法覆盖依赖调度、Token 数据导出和自定义 Factory。

### 方案 C：身份流水线 + 四类关系边界 + 故障队列（采用）

先说明本地地址不能跨进程传输，再沿同一个对象从发送端走到接收端；中间分别放大引用缓存、Token、依赖存储和 Factory，最后用一个“动态 Actor + 装备 SubObject + 静态资产引用”的案例把四者串起来。

该方案既覆盖大纲，也能解释：

- 为什么“已经收到句柄”不等于“已经有 UObject”；
- 为什么 `AddDependentObject` 不是可靠的同包约束；
- 为什么创建依赖比普通调度依赖更强；
- 为什么 NetToken 首次出现仍需发送原始数据；
- 为什么 Factory 的 Creation Header 必须携带足够的实例化信息。

## 4. 核心技术边界

### 4.1 网络身份不是内存地址

`FNetObjectReference` 表示可在网络中寻址的对象，核心由 `FNetRefHandle`、可选 `FNetToken PathToken` 和引用 Traits 组成。文章不得把原始 `UObject*` 地址描述为线上身份。

### 4.2 静态引用与动态引用的解析方式不同

- 稳定命名对象可以通过路径、Outer 链和加载策略解析；
- 动态复制对象主要通过 Authority 分配的 `FNetRefHandle` 关联；
- 静态对象缺失可能进入加载、Pending 或 Broken 状态；
- 动态对象尚未创建时不能靠路径“猜出”实例。

### 4.3 引用导出先于引用使用

写端先收集待导出的 Token 和对象引用，再写正文状态；读端先处理 Token/引用导出，再反序列化使用这些引用的状态。文章用顺序图强调“先建字典，再读索引”。

### 4.4 MustBeMapped 是批次门控

当可加载静态引用在接收端尚未就绪时，包含它的对象批次会进入 Pending 队列。引用成功解析后重试；Broken 引用会结束等待并进入错误处理。不得把 MustBeMapped 描述为网络层 ACK。

### 4.5 循环引用不是递归复制对象内容

对象 A 指向 B、B 指向 A 时，属性中传递的是引用身份，不会递归内联两个对象的完整状态。导出上下文会去重已导出身份；路径 Outer 链读取另有 16 层递归保护。显式依赖图则拒绝形成环。

### 4.6 四种关系必须分开

| 关系 | 解决的问题 | 强度 |
| --- | --- | --- |
| 对象引用 | 属性如何指向远端同一对象 | 身份边 |
| `AddDependentObject` | Parent 发送时如何带动 Dependent 排序/调度 | 松散调度边 |
| `AddCreationDependencyLink` | Child 创建前 Parent 必须已存在 | 硬创建边 |
| SubObject 所属 | 生命周期、Root、Outer 和批次组织 | 所属关系 |

不得把其中任何两项当作同义 API。

### 4.7 调度依赖不保证同包

`AddDependentObject` 的官方说明明确指出它是 loose dependency，数据不保证进入同一 packet。它影响调度、过滤联动和首次发送顺序，但不是事务边界。

### 4.8 三种 Scheduling Hint

- `Default`：Parent 被调度时带动 Dependent；Dependent 尚未发送初始状态时尽量进入同一 batch；
- `ScheduleBeforeParent`：Dependent 优先；有待发送数据且放不下时 Parent 也等待；
- `ScheduleBeforeParentIfInitialState`：首次状态按前置依赖处理，后续退回随 Parent 调度并位于其后。

### 4.9 创建依赖是接收端实例化门槛

`AddCreationDependencyLink(Parent, Child)` 要求 Child 只有在 Parent 已存在时才创建，并联动相关性。接收端缺少 Parent 时，Child 批次进入等待队列。

### 4.10 NetToken 不是通用压缩算法

`FNetToken` 是 32 位类型化标识：

- 20 位 Index；
- 3 位 TypeId；
- 1 位 Authority 标志；
- Index 0 无效；
- 最多 8 个类型和 `2^20 - 1` 个有效索引。

Token 的收益来自“首次导出数据，后续只传较小标识”，不保证高基数、只出现一次或持续变化的数据更省。

### 4.11 Local 与 Remote Token State 分离

`FNetTokenStore` 维护一个 Local State 和每连接 Remote State。相同数值 Token 必须结合 Authority、TypeId 和相应连接状态解释，不能当作跨 ReplicationSystem 的全局字符串池。

### 4.12 名称、字符串与结构体 Token 的边界

- `FNameTokenStore` 以 `FName` 映射 StoreKey，导出时写名称字符串；
- `FStringTokenStore` 将字符串复制到持久内存，以 CityHash64 映射 StoreKey；
- `TStructNetTokenDataStore<T>` 保存结构体完整副本，以 `GetUniqueKey()` 复用 Token；
- 结构体 Token 不自动淘汰，适合小而稳定、重复度高且集合近似有限的数据；
- 结构体中不应嵌套其他 NetToken 或 ObjectReference 类型；
- 自定义 `GetUniqueKey()` 必须保证语义唯一，不能把散列碰撞当作可接受情况。

### 4.13 Factory 负责“描述怎样创建”与“实际创建”

`UNetObjectFactory` 的两侧职责：

1. 发送端创建并序列化 `FNetObjectCreationHeader`；
2. 接收端反序列化 Header，创建或绑定 UObject；
3. Bridge 再应用初始复制状态；
4. Factory 可在 `PostInstantiation`、`PostInit` 和 `DetachedFromReplication` 处理生命周期回调。

Creation Header 同时带有 ProtocolId 和 FactoryId。

### 4.14 Actor 与 SubObject Factory 不同

- `UNetActorFactory` 区分静态、预注册和动态 Actor；
- 静态 Actor 通过对象引用查找；
- 动态 Actor Header 包含 Archetype、Level 和 SpawnInfo，并在远端 Spawn；
- `UNetSubObjectFactory` 对稳定 SubObject 通过引用绑定，对动态 SubObject 解析 Template 与 Outer 后用 `NewObject` 创建；
- SubObject Factory 不能替代 Root Actor Factory。

### 4.15 自定义 Factory 注册时机

`FNetObjectFactoryRegistry` 要求所有 Factory 在任意 Iris ReplicationSystem 创建前注册。UE 5.7.4 默认上限为 16，名称必须唯一，类型必须派生自 `UNetObjectFactory`。注销后 FactoryId 槽位可能被复用，不应永久缓存旧 ID。

## 5. 推荐文章结构

正文使用 13 个二级章节：

1. 指针出不了进程：第十二部分的问题域；
2. 一条引用从发送端走到接收端；
3. 四种关系：引用、调度、创建与所属；
4. 12.1 ObjectReferenceCache：双向缓存与引用形态；
5. 导出、解析与 MustBeMapped；
6. 循环引用、Pending 与 Broken；
7. 12.2 NetDependencyData：稀疏关系图；
8. 三种调度提示与创建依赖；
9. 12.3 NetTokenStore：类型化字典；
10. Name、String 与 Struct Token；
11. 12.4 NetObjectFactory：Creation Header 协议；
12. Actor、SubObject 与自定义 Factory；
13. 案例、排错、源码导航与总结。

## 6. 关键图表设计

### 6.1 身份流水线

横向展示：

```text
UObject* → FNetObjectReference → Pending Exports → Remote Cache
        → Resolve / Queue → NetObjectFactory → UObject*
```

在移动端允许横向滚动，不压缩文字。

### 6.2 四关系矩阵

用表格对比身份、顺序、创建门槛和生命周期，避免读者把 `AddDependentObject` 当成对象引用 API。

### 6.3 引用状态机

状态包含：

```text
Unknown → Pending → Resolved
                ↘ Broken
```

注明静态加载与动态实例等待走不同路径。

### 6.4 调度泳道

用三条 Parent/Dependent 时间线表现三个 Hint，重点显示 `ScheduleBeforeParent` 在包容量不足时对 Parent 的阻塞。

### 6.5 Token 账本

展示 Local Store、Connection A Remote State、Connection B Remote State，强调每连接导出确认和首次成本。

### 6.6 Factory 流水线

展示 Header 的填充、序列化、反序列化、实例化、应用初始状态和回调。

## 7. 示例设计

### 7.1 关系 API 示例

示例使用 Bridge 已返回的有效 Root Handle：

```cpp
Bridge->AddDependentObject(
    CharacterHandle,
    InventoryHandle,
    UE::Net::EDependentObjectSchedulingHint::ScheduleBeforeParentIfInitialState);

Bridge->AddCreationDependencyLink(CharacterHandle, WeaponHandle);
```

正文明确：

- Handle 必须有效；
- 当前实现不接受 SubObject 作为这些关系的端点；
- 调度依赖会拒绝环；
- 创建依赖应在关系解除时成对移除。

### 7.2 自定义 Factory 骨架

示例只展示必要接口与注册时机，不声称可直接复制编译：

```cpp
FNetObjectFactoryRegistry::RegisterFactory(
    UMyNetObjectFactory::StaticClass(),
    UMyNetObjectFactory::GetFactoryName());
```

自定义类需实现 Header 填充/读写、远端实例化、销毁和世界信息等纯虚接口。

### 7.3 结构体 Token 配置

展示 `UE_NET_NETTOKEN_GENERATED_BODY`、声明/实现 Serializer 宏和：

```ini
+ReservedTypeIds=(StoreTypeName="MyStableData", TypeID=4)
```

注明 TypeID 必须未占用，配置必须在两端一致。

## 8. 页面与交互设计

- 复用 Part 11 的纸张、深蓝、信号橙视觉系统；
- Hero 背景大字改为 `IDENTITY`；
- 桌面端粘性目录，移动端折叠目录；
- 13 个目录项与 13 个 `h2[id]` 一一对应；
- 保留阅读进度、当前章节高亮、返回顶部和打印样式；
- 所有图表设置 `min-width` 与 `overflow-x: auto`；
- 代码块、表格和长路径不得撑破 390px 视口；
- 尊重 `prefers-reduced-motion`。

## 9. Hexo Post

Front matter：

```yaml
---
title: UE5-Iris 网络复制系统技术分析 - 第十二部分：对象引用与依赖
date: 2026-07-24 18:10:00
tags:
  - UE
  - Iris
  - 网络复制
id: ue5-iris-guide-part-12
categories:
  - 笔记
---
```

Post 提供两段摘要、文章来源与官方技术依据，并链接到：

```markdown
[打开完整 HTML 文章](/html-articles/ue5-iris-guide-part-12/)
```

## 10. 文章来源

HTML 顶部和 Post 中都注明：

> 本文由 Jossy Zhang 根据《UE5 Iris 网络复制系统技术分析指南》系列大纲原创扩写，技术结论依据本地 Unreal Engine 5.7.4 源码、ReplicationSystemTestPlugin 自动化测试与 Epic Games 官方文档。

不得暗示文章由 Epic Games 官方发布。

## 11. 源码与测试依据

文章主要依据：

- `Iris/Core/NetObjectReference.h`
- `Iris/ReplicationSystem/ObjectReferenceCache.h/.cpp`
- `Iris/ReplicationSystem/ReplicationReader.cpp`
- `Iris/ReplicationSystem/ReplicationWriter.cpp`
- `Iris/ReplicationSystem/NetDependencyData.h/.cpp`
- `Iris/ReplicationSystem/ObjectReplicationBridge.h/.cpp`
- `Iris/ReplicationSystem/NetTokenStore.h/.cpp`
- `Iris/ReplicationSystem/NameTokenStore.h/.cpp`
- `Iris/ReplicationSystem/StringTokenStore.h/.cpp`
- `Iris/ReplicationSystem/StructNetTokenDataStore.h`
- `Iris/ReplicationSystem/NetObjectFactory.h/.cpp`
- `Iris/ReplicationSystem/NetObjectFactoryRegistry.h/.cpp`
- `Net/Iris/ReplicationSystem/NetActorFactory.h/.cpp`
- `Net/Iris/ReplicationSystem/NetSubObjectFactory.h/.cpp`

自动化测试导航：

- `TestObjectReferences.cpp`
- `TestDependentObjects.cpp`
- `TestStructNetTokenDataStore.cpp`
- `TestNetObjectFactory.cpp`
- `ReplicatedTestObjectFactory.h/.cpp`

文章不声称执行 UE 自动化测试，只把这些测试作为可复核的行为依据。

## 12. 官方资料

- [FNetObjectReference](https://dev.epicgames.com/documentation/unreal-engine/API/Runtime/IrisCore/FNetObjectReference?application_version=5.7)
- [UObjectReplicationBridge::AddDependentObject](https://dev.epicgames.com/documentation/unreal-engine/API/Runtime/IrisCore/UObjectReplicationBridge/AddDependentObject?application_version=5.7)
- [UObjectReplicationBridge::AddCreationDependencyLink](https://dev.epicgames.com/documentation/unreal-engine/API/Runtime/IrisCore/UObjectReplicationBridge/AddCreationDependencyLink?application_version=5.7)
- [FNetToken](https://dev.epicgames.com/documentation/unreal-engine/API/Runtime/NetCore/FNetToken?application_version=5.7)
- [FNetTokenStore](https://dev.epicgames.com/documentation/unreal-engine/API/Runtime/IrisCore/FNetTokenStore?application_version=5.7)
- [FNameTokenStore](https://dev.epicgames.com/documentation/unreal-engine/API/Runtime/IrisCore/FNameTokenStore?application_version=5.7)
- [FStringTokenStore](https://dev.epicgames.com/documentation/unreal-engine/API/Runtime/IrisCore/FStringTokenStore?application_version=5.7)
- [UNetObjectFactory](https://dev.epicgames.com/documentation/unreal-engine/API/Runtime/IrisCore/UNetObjectFactory?application_version=5.7)
- [UNetActorFactory](https://dev.epicgames.com/documentation/unreal-engine/API/Runtime/Engine/UNetActorFactory?application_version=5.7)
- [UNetSubObjectFactory](https://dev.epicgames.com/documentation/unreal-engine/API/Runtime/Engine/UNetSubObjectFactory?application_version=5.7)
- [FNetObjectFactoryRegistry](https://dev.epicgames.com/documentation/unreal-engine/API/Runtime/IrisCore/FNetObjectFactoryRegistry?application_version=5.7)

## 13. 验收标准

### 内容

- 覆盖大纲 12.1–12.4；
- 明确四类关系边界；
- 包含三种 Scheduling Hint；
- 包含 Name/String/Struct Token；
- 包含 Actor/SubObject/自定义 Factory；
- 说明 MustBeMapped、Pending、Broken 和循环引用；
- 所有版本敏感结论与 UE 5.7.4 源码一致；
- 注明文章来源。

### HTML

- 13 个 `h2[id]`；
- 桌面与移动目录各 13 个有效锚点；
- 无重复 ID、无失效内部锚点；
- 外链使用 HTTPS，并加 `rel="noopener noreferrer"`；
- 390px 宽度下无正文横向溢出；
- JS 关闭时正文和链接仍可阅读。

### 构建与浏览器

- `npm run build` 成功；
- `public/html-articles/ue5-iris-guide-part-12/index.html` 与源文件一致；
- 桌面 1440×1000 无布局异常；
- 移动 390×844 无正文溢出；
- `/ue5-iris-guide-part-12/` 可跳转到完整 HTML；
- 控制台无由本文代码导致的错误。

## 14. 工作区约束

- 只读访问 `C:\work\st-unreal-engine`；
- 不修改 Part 7/8/10/11 的未提交文件；
- 不提交 `public/`；
- 正文仅新增 Part 12 文件；
- 临时服务器、截图和浏览器产物在结束前清理；
- 提交设计规格时只暂存本规格文件。
