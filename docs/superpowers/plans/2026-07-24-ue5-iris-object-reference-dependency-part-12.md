# UE5 Iris 第十二部分：对象引用与依赖实施计划

## 1. 交付目标

新增：

- `source/html-articles/ue5-iris-guide-part-12/index.html`
- `source/_posts/ue5-iris-guide-part-12.md`

完整文章路由：

```text
/html-articles/ue5-iris-guide-part-12/
```

Hexo Post 路由：

```text
/ue5-iris-guide-part-12/
```

文章覆盖大纲 12.1–12.4，技术基线为本地 Unreal Engine 5.7.4。

## 2. 约束

- 只读访问 `C:\work\st-unreal-engine`；
- 不修改 UE 源码；
- 不修改 Part 7/8/10/11 未提交文件；
- 复用 Part 11 的 HTML 视觉和交互外壳；
- Part 12 正文完成后保持未提交；
- 设计与计划文档独立提交；
- 不提交 `public/`；
- 临时脚本、浏览器产物和服务器日志必须清理。

## 3. 基线检查

实施前记录：

```powershell
git status --short --untracked-files=normal
git log --oneline -8
git -C C:\work\st-unreal-engine status --short --untracked-files=normal
```

预期博客工作区保留 Part 7/8/10/11 未提交内容，不将其加入 Part 12 提交。

## 4. 源码核对

### 4.1 引擎版本

读取：

```text
C:\work\st-unreal-engine\Engine\Build\Build.version
```

确认：

```text
MajorVersion = 5
MinorVersion = 7
PatchVersion = 4
```

### 4.2 ObjectReferenceCache

核对：

```text
Engine/Source/Runtime/Net/Iris/Public/Iris/Core/NetObjectReference.h
Engine/Source/Runtime/Net/Iris/Private/Iris/ReplicationSystem/ObjectReferenceCache.h
Engine/Source/Runtime/Net/Iris/Private/Iris/ReplicationSystem/ObjectReferenceCache.cpp
Engine/Source/Runtime/Net/Iris/Private/Iris/ReplicationSystem/ReplicationReader.cpp
Engine/Source/Runtime/Net/Iris/Private/Iris/ReplicationSystem/ReplicationWriter.cpp
```

必须确认：

- `FNetObjectReference` 的 Handle、PathToken 和 Traits；
- Object→Handle 与 Handle→CachedReference 双向缓存；
- Authority 分配 Handle；
- 静态/动态引用区别；
- Outer 链递归解析；
- Pending、Broken、NoLoad 与 Async Loading；
- Token export 先于 object reference export；
- MustBeMapped 对批次的阻塞和重试；
- full reference 读取的 16 层递归保护；
- 导出上下文去重已导出的身份。

### 4.3 NetDependencyData

核对：

```text
Engine/Source/Runtime/Net/Iris/Private/Iris/ReplicationSystem/NetDependencyData.h
Engine/Source/Runtime/Net/Iris/Private/Iris/ReplicationSystem/NetDependencyData.cpp
Engine/Source/Runtime/Net/Iris/Public/Iris/ReplicationSystem/ObjectReplicationBridge.h
Engine/Source/Runtime/Net/Iris/Private/Iris/ReplicationSystem/ObjectReplicationBridge.cpp
Engine/Source/Runtime/Net/Iris/Public/Iris/ReplicationSystem/ReplicationSystemTypes.h
```

必须确认：

- 稀疏数组按 InternalIndex 存储关系；
- Parent→Dependent 与 Dependent→Parent 双向索引；
- Creation Dependency 独立存储；
- `AddDependentObject` 的有效性、重复、SubObject 和环检查；
- `AddCreationDependencyLink` 的 Parent/Child 约束；
- 动态过滤与关系的联动；
- 三种 `EDependentObjectSchedulingHint` 的准确语义。

### 4.4 调度与创建依赖执行

核对：

```text
Engine/Source/Runtime/Net/Iris/Private/Iris/ReplicationSystem/ReplicationWriter.cpp
Engine/Source/Runtime/Net/Iris/Private/Iris/ReplicationSystem/ReplicationReader.cpp
```

必须确认：

- Dependent 优先级调整；
- `ScheduleBeforeParent` 在包容量不足时阻止 Parent；
- `ScheduleBeforeParentIfInitialState` 只在初始状态前置；
- 创建依赖 Parent Handle 的写入；
- Reader 缺少 Parent 时排队；
- Parent Broken 时 Child 不能继续创建；
- queued batch 后续重试。

### 4.5 NetTokenStore

核对：

```text
Engine/Source/Runtime/Net/Core/Public/Net/Core/NetToken/NetToken.h
Engine/Source/Runtime/Net/Iris/Public/Iris/ReplicationSystem/NetTokenStore.h
Engine/Source/Runtime/Net/Iris/Private/Iris/ReplicationSystem/NetTokenStore.cpp
Engine/Source/Runtime/Net/Iris/Public/Iris/ReplicationSystem/NameTokenStore.h
Engine/Source/Runtime/Net/Iris/Private/Iris/ReplicationSystem/NameTokenStore.cpp
Engine/Source/Runtime/Net/Iris/Public/Iris/ReplicationSystem/StringTokenStore.h
Engine/Source/Runtime/Net/Iris/Private/Iris/ReplicationSystem/StringTokenStore.cpp
Engine/Source/Runtime/Net/Iris/Public/Iris/ReplicationSystem/StructNetTokenDataStore.h
```

必须确认：

- 20 位 Index、3 位 TypeId、1 位 Authority；
- Index 0 无效；
- Local State 与每连接 Remote State；
- 类型化 DataStore 注册；
- 首次数据导出和后续 Token 复用；
- Name 与 String Store 的存储方式；
- Struct Store 的 UniqueKey、持久副本和无淘汰策略；
- 结构体 Token 的宏与 ReservedTypeIds 配置；
- Token 不适合高基数或一次性数据。

### 4.6 NetObjectFactory

核对：

```text
Engine/Source/Runtime/Net/Iris/Public/Iris/ReplicationSystem/NetObjectFactory.h
Engine/Source/Runtime/Net/Iris/Private/Iris/ReplicationSystem/NetObjectFactory.cpp
Engine/Source/Runtime/Net/Iris/Public/Iris/ReplicationSystem/NetObjectFactoryRegistry.h
Engine/Source/Runtime/Net/Iris/Private/Iris/ReplicationSystem/NetObjectFactoryRegistry.cpp
Engine/Source/Runtime/Engine/Public/Net/Iris/ReplicationSystem/NetActorFactory.h
Engine/Source/Runtime/Engine/Private/Net/Iris/ReplicationSystem/NetActorFactory.cpp
Engine/Source/Runtime/Engine/Public/Net/Iris/ReplicationSystem/NetSubObjectFactory.h
Engine/Source/Runtime/Engine/Private/Net/Iris/ReplicationSystem/NetSubObjectFactory.cpp
Engine/Source/Runtime/Engine/Private/Net/Iris/ReplicationSystem/NetEngineFactories.cpp
```

必须确认：

- Creation Header 的 ProtocolId 与 FactoryId；
- Create/Write/Read/Instantiate 流程；
- `PostInstantiation`、`PostInit`、`DetachedFromReplication`；
- Actor 的静态、预注册和动态 Header；
- 动态 Actor 的 Archetype、Level、Transform/Velocity；
- SubObject 的静态绑定与动态 Template/Outer 创建；
- 内置 Actor/SubObject Factory 的注册；
- 自定义 Factory 注册时机、唯一名称和 16 个默认上限；
- FactoryId 槽位可复用。

### 4.7 自动化测试

用作行为导航：

```text
Engine/Plugins/Runtime/ReplicationSystemTestPlugin/Source/Private/Tests/ReplicationSystem/TestObjectReferences.cpp
Engine/Plugins/Runtime/ReplicationSystemTestPlugin/Source/Private/Tests/ReplicationSystem/TestDependentObjects.cpp
Engine/Plugins/Runtime/ReplicationSystemTestPlugin/Source/Private/Tests/ReplicationSystem/TestStructNetTokenDataStore.cpp
Engine/Plugins/Runtime/ReplicationSystemTestPlugin/Source/Private/Tests/ReplicationSystem/TestNetObjectFactory.cpp
Engine/Plugins/Runtime/ReplicationSystemTestPlugin/Source/Private/Tests/ReplicationSystem/ReplicatedTestObjectFactory.h
Engine/Plugins/Runtime/ReplicationSystemTestPlugin/Source/Private/Tests/ReplicationSystem/ReplicatedTestObjectFactory.cpp
```

正文可点名：

- `TestPartialResolveOfArrayReferences`
- `TestOutOfOrderResolveInFastArray`
- `TestDependentObjectScheduledBeforeParent`
- `TestDependentObjectScheduledBeforeParentIfInitialState`
- `TestCircularDependencyIsDenied`
- `StructAsNetTokenPropertyWithIris`
- `CanReceiveInvalidTokenIndexGracefully`
- `NetFactoryRegistration`

不声称本次执行 UE 自动化测试。

## 5. 官方资料

引用 Epic Games 5.7 API：

- `FNetObjectReference`
- `UObjectReplicationBridge::AddDependentObject`
- `UObjectReplicationBridge::AddCreationDependencyLink`
- `FNetToken`
- `FNetTokenStore`
- `FNameTokenStore`
- `FStringTokenStore`
- `UNetObjectFactory`
- `UNetActorFactory`
- `UNetSubObjectFactory`
- `FNetObjectFactoryRegistry`

外链使用 `https://dev.epicgames.com/`，HTML 中添加：

```html
target="_blank" rel="noopener noreferrer"
```

## 6. HTML 实施

### 6.1 复用外壳

复制 Part 11 的：

- Meta、主题色和内联 favicon；
- Hero；
- 桌面粘性目录；
- 移动折叠目录；
- 文章卡片；
- 源码路径、代码块、表格；
- 阅读进度与 IntersectionObserver；
- 返回顶部；
- Print 和 reduced-motion 样式。

替换：

- 标题、描述、Canonical；
- Part 编号和发布日期；
- Hero 大字；
- 目录与正文；
- 上一篇、下一篇链接；
- 所有 Part 11 专属图表。

### 6.2 新增视觉组件

- `.identity-stack`
- `.reference-pipeline`
- `.relationship-matrix`
- `.reference-shape`
- `.resolution-state`
- `.queued-batch`
- `.dependency-graph`
- `.scheduling-lanes`
- `.token-ledger`
- `.factory-flow`

组件要求：

```css
overflow-x: auto;
```

内部图形设置合理 `min-width`，移动端允许图表自身滚动，不能让 `body` 横向溢出。

### 6.3 章节

使用 13 个 `h2`：

1. `pointer-is-local`
2. `end-to-end`
3. `four-relationships`
4. `object-reference-cache`
5. `export-resolve`
6. `cycles-and-queues`
7. `dependency-data`
8. `scheduling-and-creation`
9. `net-token-store`
10. `token-types`
11. `net-object-factory`
12. `actor-subobject-custom`
13. `case-debug-summary`

桌面与移动目录必须各包含同样的 13 个锚点。

### 6.4 必须包含的技术词

```text
FNetObjectReference
FObjectReferenceCache
FNetRefHandle
PathToken
MustBeMapped
Pending
Broken
FNetDependencyData
AddDependentObject
AddCreationDependencyLink
EDependentObjectSchedulingHint
Default
ScheduleBeforeParent
ScheduleBeforeParentIfInitialState
FNetToken
FNetTokenStore
FNameTokenStore
FStringTokenStore
TStructNetTokenDataStore
FNetTokenStoreState
FNetObjectCreationHeader
UNetObjectFactory
UNetActorFactory
UNetSubObjectFactory
FNetObjectFactoryRegistry
```

### 6.5 禁止的错误表述

- “UObject 指针直接复制到客户端”；
- “Handle 一到就一定能得到 UObject”；
- “MustBeMapped 是 ACK”；
- “循环引用会递归复制整个对象图”；
- “AddDependentObject 保证同一个网络包”；
- “创建依赖等于普通调度依赖”；
- “NetToken 是任意数据压缩算法”；
- “Token 是全局跨连接字符串池”；
- “Struct Token 会自动淘汰”；
- “Factory 可以在 Iris 已运行后随时注册”。

## 7. Post 实施

创建：

```text
source/_posts/ue5-iris-guide-part-12.md
```

要求：

- UTF-8；
- Front matter 日期 `2026-07-24 18:10:00`；
- 两段内容摘要；
- `<!-- more -->`；
- 文章来源；
- 指向完整 HTML 的站内链接；
- 不复制完整正文。

## 8. 静态校验

读取 HTML 并验证：

- `<!DOCTYPE html>`；
- `lang="zh-CN"`；
- UTF-8 meta；
- Canonical；
- 13 个 `h2[id]`；
- 两套目录均为 13 项；
- 所有目录 href 对应真实 ID；
- 不存在重复 ID；
- 内部锚点全部可解析；
- 外链为 HTTPS；
- `_blank` 外链有 `noopener noreferrer`；
- 上一篇指向 Part 11；
- 下一篇指向 Part 13；
- Post 链接指向 Part 12 HTML；
- 文章来源存在；
- 必需技术词全部存在；
- 文件不是乱码。

## 9. 构建验证

运行：

```powershell
npm run build
```

随后验证：

```text
public/html-articles/ue5-iris-guide-part-12/index.html
public/ue5-iris-guide-part-12/index.html
```

源 HTML 与生成 HTML 计算 SHA-256，应一致。

`public/` 作为构建产物保留但不提交。

## 10. 浏览器验证

浏览器测试前读取并遵循 `playwright-cli` 技能。

启动本地静态服务器，验证：

### 桌面 1440×1000

- Hero、13 项目录、正文与 Footer 显示正常；
- 当前章节高亮随滚动变化；
- 目录锚点跳转正确；
- 图表、表格和代码块不互相覆盖；
- 返回顶部可用；
- `document.documentElement.scrollWidth === window.innerWidth`。

### 移动 390×844

- 桌面目录隐藏，移动目录出现；
- Hero 标题不截断；
- 正文无页面级横向溢出；
- 图表可局部横向滚动；
- 代码块可滚动；
- 返回顶部不遮挡正文。

### Hexo Post

- `/ue5-iris-guide-part-12/` 正常打开；
- “打开完整 HTML 文章”跳到 Part 12；
- 返回、前进和直接访问均正常。

记录控制台：

- 由主题外部字体/CDN导致的已知非阻塞失败可记录；
- 本文自身 JS 错误必须为 0。

## 11. 收尾

- 停止本地静态服务器；
- 删除 `.playwright-cli`、临时截图和日志；
- 确认未修改 UE 工作区；
- `git status --short` 中只新增 Part 12 正文/Post，外加用户原有未提交文件；
- 不提交 Part 12 正文；
- 汇报设计提交、计划提交、正文路径和验证结果。
