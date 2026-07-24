# UE5 Iris 技术分析第十三部分：条件复制设计规格

## 1. 目标

根据《UE5 Iris 网络复制系统技术分析指南》大纲，补充第十三部分“条件复制（Conditionals）”，覆盖：

- 13.1 复制条件概述：条件复制的作用、条件类型；
- 13.2 ReplicationConditionals：生命周期条件、角色条件、自定义条件；
- 13.3 条件评估流程：检查时机、条件缓存、性能影响。

成果包括：

- 独立长篇 HTML：`/html-articles/ue5-iris-guide-part-13/`；
- 在统一系列入口 `/ue5-iris-guide/` 中增加第十三部分的链接与摘要；
- 不再创建体量较小的 `ue5-iris-guide-part-13.md`；
- 技术基线使用本地 Unreal Engine 5.7.4 源码；
- 标明文章来源、官方资料与源码依据。

## 2. 用户授权与默认决策

用户要求所有选项采用推荐方案，不再询问。因此本规格视为用户已经批准以下决策：

- 采用“条件栈 + 每连接掩码 + 单属性场景”的叙事方案；
- 使用 Part 12 的纸张、深蓝与橙色视觉系统；
- 用 HTML/CSS 图表表达掩码、连接矩阵、评估时序和动态条件状态机；
- 不生成装饰性图片；
- 设计规格与实施计划分别提交；
- 正文实施完成后保持未提交，等待用户单独要求 `commit`；
- 不修改本地 Unreal Engine 源码。

## 3. 方案比较

### 3.1 方案 A：按枚举逐项解释

从 `COND_None` 开始，按 `ELifetimeCondition` 的枚举顺序逐项说明。

优点是和源码定义一一对应，容易查找；缺点是读者会记住一串名称，却不理解过滤、脏标记、条件掩码和序列化之间的关系。

### 3.2 方案 B：只讲常用宏和配方

集中展示 `DOREPLIFETIME_CONDITION`、`DOREPLIFETIME_ACTIVE_OVERRIDE` 与动态条件宏。

优点是可以快速复制代码；缺点是容易把 `COND_Custom`、`COND_Dynamic`、对象级 `EReplicationCondition` 和连接过滤混成一套 API，也无法回答条件变化后为什么必须重新发送当前值。

### 3.3 方案 C：条件栈 + 每连接掩码 + 单属性场景（采用）

先建立三道门：

1. 对象过滤决定某连接能否看见整个对象；
2. ChangeMask 决定对象里哪些成员发生变化；
3. Conditionals 决定这些变化中的哪些成员允许发给当前连接。

随后用同一个属性贯穿声明、变脏、按连接求值、掩码裁剪、条件切换和基线修复，并把 `ELifetimeCondition`、`FReplicationConditionals`、自定义条件、动态条件、SubObject 条件分别放到这条流水线的正确位置。

该方案同时回答“是什么”“在哪里检查”“变化时怎样补偿”和“性能到底省了什么”，因此采用。

## 4. 核心技术结论

### 4.1 对象过滤与成员条件必须分开

Iris Filtering 决定一个 Net Object 是否允许复制到某连接。条件复制只在对象已经进入该连接的复制候选后，裁剪对象内部成员。

文章使用如下表达：

```text
Object Filter
    ↓ 对象是否进入连接作用域
Dirty / ChangeMask
    ↓ 哪些成员有新值
Lifetime + Custom Condition Mask
    ↓ 当前连接允许看到哪些成员
Serialize
```

不得把 `COND_OwnerOnly` 描述成对象级 OwnerOnly Filter，也不得声称属性条件可以阻止远端对象创建。

### 4.2 ChangeMask 与 Condition Mask 回答不同问题

- ChangeMask 回答“什么变了”；
- Lifetime Condition Mask 回答“对这条连接，哪些条件成立”；
- Custom Condition Mask 回答“这个对象实例上，哪些自定义成员当前激活”。

`FReplicationConditionals::ApplyConditionalsToChangeMask` 会在连接专属的 ChangeMask 副本上执行条件裁剪：

- 生命周期条件不满足时清除对应成员位；
- 自定义条件通过逐字 `OldMask & ConditionalMask` 清除成员位；
- 条件刚从不满足变为满足时，重新设置相关成员位。

因此条件不是另一套数值比较，而是发送前的成员准入掩码。

### 4.3 生命周期条件来自共享协议，运行时状态来自实例与连接

`GetLifetimeReplicatedProps` 注册的条件会进入属性布局与 Iris Replication Protocol。协议由同类型对象共享，不能根据某个对象实例的临时状态决定是否注册某属性。

运行期差异由以下状态表达：

- 当前对象的 owning connection；
- 当前对象的 autonomous connection；
- 当前对象的 `ReplicatePhysics` 状态；
- 当前连接是否正在接收 initial state；
- 对象实例的 Custom active mask；
- 对象实例各 `COND_Dynamic` 属性的运行时条件。

### 4.4 `ELifetimeCondition` 的分类方式

文章不按数字顺序机械罗列，而按意图分组。

#### 无条件与禁止

- `COND_None`：没有额外条件；
- `COND_Never`：永不复制；
- `COND_Dynamic`：占位条件，未覆盖前默认等价于始终允许；
- `COND_Custom`：由对象实例上的 active mask 控制。

#### 初始状态

- `COND_InitialOnly`；
- `COND_InitialOrOwner`。

“Initial” 是每条连接第一次接收该对象状态，不是服务器启动时刻。晚加入连接仍会获得自己的 initial state。

#### Owner

- `COND_OwnerOnly`；
- `COND_SkipOwner`；
- `COND_InitialOrOwner`；
- `COND_ReplayOrOwner`。

Owner 来自对象 owning connection，不得与 autonomous connection 画等号。

#### Role 与物理

- `COND_SimulatedOnly`；
- `COND_AutonomousOnly`；
- `COND_SimulatedOrPhysics`；
- `COND_SimulatedOnlyNoReplay`；
- `COND_SimulatedOrPhysicsNoReplay`。

Iris 中只有一条连接可被标记为 `RoleAutonomous`，其余连接按 simulated 处理。`ReplicatePhysics` 是对象级布尔条件，默认关闭。

#### Replay

- `COND_ReplayOrOwner`；
- `COND_ReplayOnly`；
- `COND_SimulatedOnlyNoReplay`；
- `COND_SimulatedOrPhysicsNoReplay`；
- `COND_SkipReplay`。

正文说明这些枚举的语义，但对 5.7.4 Iris 具体支持边界保持克制：本地 `GetLifetimeConditionals` 的普通连接掩码明确启用 `SkipReplay`、未启用 `ReplayOnly`，而回放路径可能还有上层专用处理。文章不以普通连接代码推导完整 Replay 行为。

#### SubObject 专用

- `COND_NetGroup` 只适用于 SubObject 注册，不可用于属性。

### 4.5 声明 API

基础声明：

```cpp
void AConditionalPawn::GetLifetimeReplicatedProps(
    TArray<FLifetimeProperty>& OutLifetimeProps) const
{
    Super::GetLifetimeReplicatedProps(OutLifetimeProps);

    DOREPLIFETIME_CONDITION(
        AConditionalPawn,
        PrivateLoadout,
        COND_OwnerOnly);
}
```

参数化声明：

```cpp
FDoRepLifetimeParams Params;
Params.Condition = COND_SimulatedOnly;
Params.RepNotifyCondition = REPNOTIFY_OnChanged;
Params.bIsPushBased = true;
DOREPLIFETIME_WITH_PARAMS(AConditionalPawn, MovementHint, Params);
```

`FDoRepLifetimeParams` 的四个字段是：

- `Condition`；
- `RepNotifyCondition`；
- `bIsPushBased`；
- `CreateAndRegisterReplicationFragmentFunction`。

文章强调 Push Model 只改变脏状态如何报告，不替代条件判断。

### 4.6 Owner、Autonomous 与 Physics 的对象级状态

Iris 公开 API：

```cpp
ReplicationSystem->SetOwningNetConnection(NetRefHandle, OwnerConnectionId);

ReplicationSystem->SetReplicationConditionConnectionFilter(
    NetRefHandle,
    UE::Net::EReplicationCondition::RoleAutonomous,
    AutonomousConnectionId,
    true);

ReplicationSystem->SetReplicationCondition(
    NetRefHandle,
    UE::Net::EReplicationCondition::ReplicatePhysics,
    true);
```

边界：

- `SetReplicationConditionConnectionFilter` 在 5.7.4 只支持 `RoleAutonomous`；
- 同一对象同时只能有一个 autonomous connection；
- `SetReplicationCondition` 在 5.7.4 只支持 `ReplicatePhysics`；
- owning connection 与 autonomous connection 可相同，但语义不同；
- 改变 owning/autonomous/physics 会标记全局生命周期条件状态为脏，并按需要使增量压缩基线失效。

### 4.7 `FReplicationConditionals` 的状态布局

`FReplicationConditionals` 维护：

- 每对象状态：15 位 autonomous connection id、1 位 `bRepPhysics`；
- 每连接、每对象的上一次 `FConditionalsMask`；
- 每对象、每 RepIndex 的 dynamic condition 映射；
- `ObjectsWithDirtyLifetimeConditionals`；
- 属性自定义 active mask 的接入与更新；
- SubObject 条件评估。

`FConditionalsMask` 是 16 位掩码，只承载属性生命周期条件 0～15。`COND_NetGroup` 的值为 16，通过 SubObject group 路径单独处理。

源码注释明确说明该类大部分逻辑用于 backward compatibility mode，部分路径较慢；文章不能把当前反射属性兼容路径描述成 Iris 最终唯一形态。

### 4.8 `COND_Custom` 的正确用法

声明：

```cpp
DOREPLIFETIME_CONDITION(
    AConditionalPawn,
    DebugSnapshot,
    COND_Custom);
```

切换：

```cpp
DOREPLIFETIME_ACTIVE_OVERRIDE(
    AConditionalPawn,
    DebugSnapshot,
    bReplicateDebugSnapshot);
```

需要明确：

- active override 是每对象实例状态；
- 它不是每连接回调，不可读取某条连接专属状态来做判断；
- 高频切换会带来额外工作；
- 从关闭切到开启时，Iris 会把成员标脏，并使相关基线失效，确保当前值能再次发出；
- `COND_Custom` 不用于 SubObject 的连接选择。

### 4.9 `COND_Dynamic` 与 `COND_Custom` 的差别

声明：

```cpp
DOREPLIFETIME_CONDITION(
    AConditionalPawn,
    TacticalMarker,
    COND_Dynamic);
```

运行时切换：

```cpp
DOREPDYNAMICCONDITION_SETCONDITION_FAST(
    AConditionalPawn,
    TacticalMarker,
    COND_OwnerOnly);
```

初始化覆盖可在 `GetReplicatedCustomConditionState` 中使用：

```cpp
DOREPDYNAMICCONDITION_INITCONDITION_FAST(
    AConditionalPawn,
    TacticalMarker,
    COND_SkipOwner);
```

区别：

| 机制 | 运行时改变什么 | 粒度 | 适用问题 |
| --- | --- | --- | --- |
| `COND_Custom` | 该成员 active / inactive | 每对象 | 这个对象现在要不要发送该成员 |
| `COND_Dynamic` | 该成员采用哪个 `ELifetimeCondition` | 每对象，评估时仍按连接 | 该成员现在要 OwnerOnly、SkipOwner 还是 Never |

只有最初声明为 `COND_Dynamic` 的属性才可用动态条件 API 改写。它不是任意 Lambda，也不是逐连接自定义谓词。

源码注释要求动态条件变化发生时立即调用 setter，而不是等到 `PreReplication`；对已经复制过的 Custom Delta / Fast Array 属性动态改条件可能产生意外行为，正文必须保留这项警告。

### 4.10 每连接条件求值

`GetLifetimeConditionals(ConnectionId, ParentObjectIndex, bInitialState)` 计算：

- 是否 owner；
- 是否 autonomous / simulated；
- 是否启用 physics；
- 是否 initial state；
- 对应的组合条件。

同一个对象对三条连接可得到三套不同掩码。例如：

| 属性 | Owner + Autonomous | Non-owner + Simulated | Late join + Simulated |
| --- | --- | --- | --- |
| `COND_OwnerOnly` | 发 | 不发 | 不发 |
| `COND_SkipOwner` | 不发 | 发 | 发 |
| `COND_AutonomousOnly` | 发 | 不发 | 不发 |
| `COND_InitialOnly` | 首次发 | 首次发 | 首次发 |

该矩阵用于纠正“Owner 等于 Autonomous”和“InitialOnly 只在服务器出生时发送”两个常见误解。

### 4.11 条件缓存与重新显露

Iris 在 `ConnectionInfos[ConnectionId].ObjectConditionals[ObjectIndex]` 保存上一套生命周期条件掩码。

当前掩码与上一掩码比较后：

- 若条件仍满足，保留原 ChangeMask；
- 若条件不满足，清除对应位；
- 若条件从不满足变为满足，主动设置成员 ChangeMask 位。

这不是缓存属性值，而是缓存“上一轮该连接的条件结果”，用于发现成员重新可见。

### 4.12 基线失效不是可选优化

条件从隐藏切到可见时，远端可能从未收到最新值。只重新打开条件但不标脏，会让远端继续保留旧值；只标脏但仍沿用不适用的 delta baseline，也可能编码出错误增量。

本地 5.7.4 源码中的策略包括：

- owning connection 变化时，使新旧 owner 的基线失效；
- autonomous connection 变化时，标记 RemoteRole，更新全局条件并使受影响连接的基线失效；
- physics 条件启用时，使所有连接的相关基线失效；
- Custom 从关闭切到开启时，标脏并使所有连接基线失效；
- Dynamic 从“可能隐藏”切到“可能可见”时，标脏并使所有连接基线失效。

正文将其概括为“重新显露 = 重新发送当前真值”，不把 baseline 细节夸大为每次条件求值都会全量复制。

### 4.13 条件检查时机

文章使用下列时序：

```text
Gameplay changes value
  → Push mark / Poll detects dirty
  → Copy & quantize shared state
  → Object filtering and scheduling
  → For each connection: build lifetime condition mask
  → Apply lifetime + custom masks to connection ChangeMask
  → Serialize allowed members
```

条件裁剪发生在发送路径的每连接阶段。它可以减少该连接的成员序列化和带宽，但通常不会反向取消已经发生的全局轮询、拷贝与量化工作。

### 4.14 性能结论

推荐顺序：

1. 能用稳定内置条件时，优先 `COND_OwnerOnly`、`COND_SkipOwner` 等；
2. 需要按对象开关时使用 `COND_Custom`；
3. 需要在多种内置连接语义间切换时使用 `COND_Dynamic`；
4. 不要为省极小字段带宽而高频翻转条件；
5. 若整个对象对连接无用，使用对象过滤，不要给所有属性都加条件；
6. Push Model 与条件组合：前者减少变化检测工作，后者减少连接发送内容；
7. 用实际连接数、对象数、条件翻转频率和字段尺寸做测量。

### 4.15 SubObject 条件

SubObject 的生命周期条件通过父对象的条件掩码求值，但有额外规则：

- `COND_NetGroup` 查询该 SubObject 所属的 Net Object Group；
- Owner group 映射到 owner 语义；
- Replay group 映射到 replay 语义；
- 其他 filter group 查询连接过滤状态；
- 父 SubObject 被排除时，层级中的子 SubObject 不能越过父节点独立复制。

文章只把它作为属性条件的边界扩展，不在本篇重复 Part 8 的完整 SubObject 注册流程。

## 5. 推荐文章结构

正文使用 13 个二级章节：

1. 第十三部分开场：对象能看见，不代表每个字段都该看见；
2. 先看全景：Object Filter、ChangeMask、Condition Mask 三道门；
3. 建立心智模型：条件、实例状态与连接上下文三个轴；
4. 13.1 条件概述：`ELifetimeCondition` 分类；
5. 条件声明：`FDoRepLifetimeParams` 与 `DOREPLIFETIME_*`；
6. 生命周期与角色矩阵：Owner、Autonomous、Initial、Physics、Replay；
7. 13.2 `FReplicationConditionals`：状态布局与职责；
8. Custom 与 Dynamic：两个运行时机制；
9. 对象级条件与 SubObject 条件：`EReplicationCondition`、`COND_NetGroup`；
10. 13.3 条件评估：每连接生成掩码并裁剪 ChangeMask；
11. 条件缓存、补脏与基线失效；
12. 三连接案例与性能策略；
13. 排错、源码导航、自动化测试与总结。

## 6. 关键图表

### 6.1 三道门流水线

横向展示对象过滤、ChangeMask、Condition Mask 和 Serialize，明确每道门解决的问题。

### 6.2 条件分类表

按 Initial、Owner、Role/Physics、Replay、Runtime、SubObject 分类，而不是按枚举值排列。

### 6.3 三连接矩阵

列为 Owner+Autonomous、普通 Simulated、晚加入 Simulated；行为格使用“首次发送 / 发送 / 屏蔽”。

### 6.4 评估时间线

显示共享的 Poll/Quantize 与每连接的 Condition/Serialize 分界。

### 6.5 Dynamic 状态机

```text
COND_Dynamic (default allow)
    ├─→ COND_OwnerOnly
    ├─→ COND_SkipOwner
    └─→ COND_Never
             ↓ switch to visible
       Dirty + Baseline invalidation
```

### 6.6 条件栈位运算

用一组 8 位示意：

```text
Dirty mask       1110 1010
Lifetime allowed 1011 1110
Custom active    1111 0111
Result           1010 0010
```

仅作概念图，不能暗示所有生产协议只有 8 位。

## 7. 示例设计

使用 `AConditionalPawn`，属性如下：

- `PrivateLoadout`：`COND_OwnerOnly`；
- `MovementHint`：`COND_SimulatedOnly` + Push Model；
- `SpawnSeed`：`COND_InitialOnly`；
- `DebugSnapshot`：`COND_Custom`；
- `TacticalMarker`：`COND_Dynamic`。

单个案例覆盖：

1. Owner + Autonomous 连接收到私有负载与 TacticalMarker；
2. 普通 Simulated 连接收到 MovementHint，不收到 PrivateLoadout；
3. 晚加入连接仍收到 SpawnSeed；
4. DebugSnapshot 开启时补发当前值；
5. TacticalMarker 从 OwnerOnly 切到 SkipOwner 后，对两类连接重新显露；
6. 物理状态开启后，`COND_SimulatedOrPhysics` 成员对 autonomous connection 也可见。

代码片段以说明 API 为目标，不声称可脱离项目上下文直接编译。

## 8. 排错清单

文章至少覆盖：

- 属性始终不发：检查 `UPROPERTY(Replicated...)`、注册条件、对象过滤和脏标记；
- OwnerOnly 发错连接：检查 owning connection，不要只看 `Owner` 指针；
- SimulatedOnly 行为异常：检查 autonomous condition connection；
- Custom 切开后仍是旧值：检查是否通过官方 override API 切换，避免私自维护布尔值；
- Dynamic setter 无效：确认属性最初声明为 `COND_Dynamic`；
- InitialOnly 晚加入不发：检查对象是否真的向该连接发送 initial state；
- SubObject 不出现：先检查父 SubObject 与注册组条件；
- 带宽没有下降：条件可能只省发送内容，而轮询、量化或对象调度仍然发生；
- 高频条件切换成本高：检查补脏、缓存更新和 baseline invalidation。

## 9. UE 5.7.4 源码依据

正文源码导航至少包含：

- `Runtime/CoreUObject/Public/UObject/CoreNetTypes.h`
- `Runtime/Engine/Public/Net/UnrealNetwork.h`
- `Runtime/Net/Core/Public/Net/Core/PropertyConditions/PropertyConditions.h`
- `Runtime/Net/Core/Public/Net/Core/PropertyConditions/RepChangedPropertyTracker.h`
- `Runtime/Net/Iris/Public/Iris/ReplicationSystem/Conditionals/ReplicationCondition.h`
- `Runtime/Net/Iris/Public/Iris/ReplicationSystem/ReplicationSystem.h`
- `Runtime/Net/Iris/Private/Iris/ReplicationSystem/Conditionals/ReplicationConditionals.h`
- `Runtime/Net/Iris/Private/Iris/ReplicationSystem/Conditionals/ReplicationConditionals.cpp`
- `Runtime/Net/Iris/Private/Iris/ReplicationSystem/ReplicationSystem.cpp`
- `Plugins/Runtime/ReplicationSystemTestPlugin/Source/Private/Tests/ReplicationSystem/Conditionals/TestConditionals.cpp`
- `Plugins/Runtime/ReplicationSystemTestPlugin/Source/Private/Tests/ReplicationSystem/Conditionals/TestDynamicCondition.cpp`

## 10. 官方资料

只使用 Epic Games 官方文档：

- Conditional Property Replication；
- `FDoRepLifetimeParams` API；
- Components of Iris；
- Migrate to Iris；
- `UE::Net::EReplicationCondition` API；
- `UReplicationSystem::SetReplicationConditionConnectionFilter` API；
- `FReplicationSystemUtil::SetReplicationCondition` API。

官方文档当前展示版本可能高于本地 5.7.4，正文中凡涉及具体枚举、字段或行为的结论均以本地 5.7.4 源码为准。

## 11. 视觉与交互

- 复用 Part 12 的纸张背景、深蓝 hero、橙色强调和双栏目录；
- Hero 背景字改为 `CONDITION`；
- 桌面端固定目录，移动端折叠目录；
- 13 个目录项与 13 个 `<section>` 一一对应；
- 代码块支持横向滚动；
- 表格在窄屏可横向滚动；
- 所有图表使用语义化 HTML/CSS；
- 文章顶部保留阅读进度条；
- 当前章节随滚动高亮；
- 无外部字体或脚本依赖。

## 12. 文章来源与导航

文章顶部明确写：

> 文章来源：本文由 Jossy Zhang 根据《UE5 Iris 网络复制系统技术分析指南》系列大纲原创扩写；技术结论依据本地 Unreal Engine 5.7.4 源码、ReplicationSystemTestPlugin 自动化测试与 Epic Games 官方文档。

底部导航：

- 上一篇：第十二部分“对象引用与依赖”；
- 系列目录：统一入口；
- 下一篇：第十四部分“RPC 系统”，标记为后续内容，不提供不存在的死链接。

## 13. 验收标准

### 内容

- 13 个二级章节完整覆盖大纲；
- 区分对象过滤、ChangeMask 与属性条件；
- 准确解释 Owner 与 Autonomous；
- 准确解释 `COND_Custom` 与 `COND_Dynamic`；
- 准确解释条件缓存、重新显露、补脏和基线失效；
- 包含 SubObject / `COND_NetGroup` 边界；
- 包含三连接场景、性能策略、排错和源码测试导航；
- 明确 UE 5.7.4 技术基线与文章来源。

### 结构

- 生成 `source/html-articles/ue5-iris-guide-part-13/index.html`；
- 更新 `source/_posts/ue5-iris-guide.md`；
- 统一入口包含大纲及 Part 1～13 共 14 个唯一 HTML 路由；
- 不创建新的小型 Part 13 Post。

### 技术

- HTML 语义、标题、canonical 与 metadata 正确；
- 桌面和移动端无页面级横向溢出；
- 目录锚点完整且唯一；
- 外部链接使用 HTTPS；
- `npm run clean` 与 `npm run build` 成功；
- 浏览器中 Part 13 和统一入口可访问；
- Part 13 页面控制台无错误；
- 不提交 `public/` 等构建产物。
