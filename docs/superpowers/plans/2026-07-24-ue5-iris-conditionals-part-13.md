# UE5 Iris 第十三部分：条件复制实施计划

## 1. 交付目标

新增：

- `source/html-articles/ue5-iris-guide-part-13/index.html`

更新：

- `source/_posts/ue5-iris-guide.md`

完整文章路由：

```text
/html-articles/ue5-iris-guide-part-13/
```

统一系列入口：

```text
/ue5-iris-guide/
```

文章覆盖大纲 13.1～13.3，技术基线为本地 Unreal Engine 5.7.4。按照已经实施的合并结构，不创建单独的 `ue5-iris-guide-part-13.md`。

## 2. 约束

- 只读访问 `C:\work\st-unreal-engine`；
- 不修改 UE 源码；
- 复用 Part 12 的 HTML 视觉与交互外壳；
- Part 13 正文和统一 Post 更新完成后保持未提交；
- 设计与计划文档独立提交；
- 不提交 `public/`；
- 不添加装饰性图片或外部脚本；
- 临时脚本、浏览器产物和服务器日志必须清理。

## 3. 基线检查

实施前执行：

```powershell
git status --short --untracked-files=normal
git log --oneline -8
git -C C:\work\st-unreal-engine status --short --untracked-files=normal
```

确认：

- 博客工作区仅包含当前步骤预期文件；
- 当前分支为 `source`；
- UE 工作区已有改动属于用户，本次不触碰；
- `Engine/Build/Build.version` 为 5.7.4。

## 4. 源码核对

### 4.1 条件枚举与声明宏

核对：

```text
Engine/Source/Runtime/CoreUObject/Public/UObject/CoreNetTypes.h
Engine/Source/Runtime/Engine/Public/Net/UnrealNetwork.h
Engine/Source/Runtime/Engine/Public/Net/RepLayout.h
```

确认：

- `ELifetimeCondition` 0～16 的名称和边界；
- `COND_Dynamic` 默认允许，只有声明为该条件的属性可动态覆盖；
- `COND_Never` 永不复制；
- `COND_NetGroup` 只用于 SubObject；
- `FDoRepLifetimeParams` 的四个字段；
- `DOREPLIFETIME_CONDITION`；
- `DOREPLIFETIME_WITH_PARAMS`；
- `DOREPLIFETIME_ACTIVE_OVERRIDE`；
- `DOREPDYNAMICCONDITION_INITCONDITION_FAST`；
- `DOREPDYNAMICCONDITION_SETCONDITION_FAST`。

### 4.2 Property Conditions

核对：

```text
Engine/Source/Runtime/Net/Core/Public/Net/Core/PropertyConditions/PropertyConditions.h
Engine/Source/Runtime/Net/Core/Private/Net/Core/PropertyConditions/PropertyConditions.cpp
Engine/Source/Runtime/Net/Core/Public/Net/Core/PropertyConditions/RepChangedPropertyTracker.h
Engine/Source/Runtime/Net/Core/Private/Net/Core/PropertyConditions/RepChangedPropertyTracker.cpp
```

确认：

- Active Override 以对象和 RepIndex 为粒度；
- Dynamic Condition 通过 tracker 更新；
- Dynamic setter 的调用时机要求；
- Push Model 下条件变化会触发属性脏标记；
- Custom Delta / Fast Array 动态改条件的警告。

### 4.3 Iris 对象级条件

核对：

```text
Engine/Source/Runtime/Net/Iris/Public/Iris/ReplicationSystem/Conditionals/ReplicationCondition.h
Engine/Source/Runtime/Net/Iris/Public/Iris/ReplicationSystem/ReplicationSystem.h
Engine/Source/Runtime/Net/Iris/Private/Iris/ReplicationSystem/ReplicationSystem.cpp
```

确认：

- `EReplicationCondition::RoleAutonomous`；
- `EReplicationCondition::ReplicatePhysics`；
- `SetOwningNetConnection`；
- `SetReplicationConditionConnectionFilter` 只支持 `RoleAutonomous`；
- 只有一条连接可为 autonomous；
- `SetReplicationCondition` 只支持 `ReplicatePhysics`；
- physics 条件默认关闭。

### 4.4 `FReplicationConditionals`

核对：

```text
Engine/Source/Runtime/Net/Iris/Private/Iris/ReplicationSystem/Conditionals/ReplicationConditionals.h
Engine/Source/Runtime/Net/Iris/Private/Iris/ReplicationSystem/Conditionals/ReplicationConditionals.cpp
```

确认：

- 每对象 autonomous / physics 状态；
- 每连接、每对象的上一条件掩码；
- Dynamic Condition 映射；
- `ObjectsWithDirtyLifetimeConditionals`；
- `GetLifetimeConditionals`；
- `ApplyConditionalsToChangeMask`；
- 生命周期条件从关闭变开启时补脏；
- Custom mask 的逐字 AND；
- owner、autonomous、physics、custom、dynamic 变化时的基线失效；
- backward compatibility mode 注释与性能边界。

### 4.5 SubObject 条件

核对：

```text
Engine/Source/Runtime/Net/Iris/Private/Iris/ReplicationSystem/Conditionals/ReplicationConditionals.cpp
Engine/Source/Runtime/Net/Iris/Public/Iris/ReplicationSystem/ObjectReplicationBridge.h
Engine/Source/Runtime/Net/Iris/Private/Iris/ReplicationSystem/ObjectReplicationBridge.cpp
```

确认：

- `GetSubObjectsToReplicate`；
- 子对象条件使用父对象的生命周期掩码；
- `COND_NetGroup` 的 Owner、Replay 与其他 filter group 路径；
- 父 SubObject 被排除时，层级子对象不能独立复制；
- `COND_Custom` 不作为 SubObject 条件。

### 4.6 自动化测试

用作行为依据：

```text
Engine/Plugins/Runtime/ReplicationSystemTestPlugin/Source/Private/Tests/ReplicationSystem/Conditionals/TestConditionals.cpp
Engine/Plugins/Runtime/ReplicationSystemTestPlugin/Source/Private/Tests/ReplicationSystem/Conditionals/TestDynamicCondition.cpp
```

正文可点名：

- `ToOwnerStateIsReplicatedToOwner`
- `SkipOwnerStateIsNotReplicatedToOwner`
- `CanSwitchAutonmousConnection`
- `CanMixConditions`
- `HierarchicalSubObjectIsNotReplicatedToOwnerUnlessParentIs`
- `PushBased_COND_InitialOnly`
- `DynamicConditionIsReplicatedByDefault`
- `DynamicConditionSupportsOwnerOnly`
- `DynamicConditionSupportsGoingFromNotReplicatedToReplicated`

不声称本次执行 UE 自动化测试。

## 5. 官方资料

引用 Epic Games 官方页面：

- Conditional Property Replication；
- `FDoRepLifetimeParams`；
- Components of Iris；
- Migrate to Iris；
- `UE::Net::EReplicationCondition`；
- `UReplicationSystem::SetReplicationConditionConnectionFilter`；
- `FReplicationSystemUtil::SetReplicationCondition`。

规则：

- 外部链接全部使用 HTTPS；
- 官方页面若展示 5.8 或旧版兼容说明，具体 5.7.4 行为以本地源码为准；
- 不引用第三方教程作为技术结论依据。

## 6. HTML 实施

### 6.1 创建目录与文件

目标：

```text
source/html-articles/ue5-iris-guide-part-13/index.html
```

用 `apply_patch` 创建文件，不用 shell 重定向写正文。

### 6.2 Metadata

设置：

- `lang="zh-CN"`；
- 作者 `Jossy Zhang`；
- 标题“UE5-Iris 网络复制系统技术分析 - 第十三部分：条件复制”；
- 描述包含 `FReplicationConditionals`、`ELifetimeCondition`、Custom、Dynamic、ChangeMask；
- canonical：`http://zhangga.github.io/html-articles/ue5-iris-guide-part-13/`；
- theme color 与 Part 12 一致；
- 内联 favicon。

### 6.3 Hero

内容：

- Part 13 / Conditionals；
- 主标题“条件复制”；
- 副标题突出“同一个 ChangeMask，为不同连接裁成不同答案”；
- 技术基线 UE 5.7.4；
- 文章来源跳转；
- 背景大字 `CONDITION`。

### 6.4 目录

桌面和移动端均包含 13 项：

1. `#gate`
2. `#pipeline`
3. `#model`
4. `#overview`
5. `#declaration`
6. `#matrix`
7. `#conditionals`
8. `#runtime`
9. `#objects`
10. `#evaluation`
11. `#cache`
12. `#scenario`
13. `#debug`

目录文字和 `<section id>` 一一对应。

### 6.5 章节内容

#### 第 1 节：对象能看见，不代表每个字段都该看见

- 以队伍游戏中的 Owner 私有背包、Simulated 移动提示、Initial 随机种子开场；
- 区分 Object Filter 与成员 Condition；
- 给出本篇三条结论。

#### 第 2 节：三道门流水线

- Object Filter；
- Dirty / ChangeMask；
- Lifetime + Custom Condition Mask；
- Serialize；
- 使用流程图说明条件所在阶段。

#### 第 3 节：三个轴

- 声明时条件；
- 对象实例状态；
- 连接上下文；
- 解释同一属性为何对不同连接得到不同结果。

#### 第 4 节：13.1 条件分类

- 无条件与禁止；
- Initial；
- Owner；
- Role / Physics；
- Replay；
- Runtime；
- SubObject；
- 给出分类表和易错边界。

#### 第 5 节：声明 API

- `GetLifetimeReplicatedProps`；
- `DOREPLIFETIME_CONDITION`；
- `FDoRepLifetimeParams`；
- `DOREPLIFETIME_WITH_PARAMS`；
- Push Model 与 RepNotify 不替代条件。

#### 第 6 节：生命周期与角色矩阵

- Owner 不等于 Autonomous；
- Initial 是每连接；
- Simulated 是“非 autonomous”，不是简单“非 owner”；
- Physics 影响组合条件；
- Replay 条件只描述已经验证的边界。

#### 第 7 节：13.2 `FReplicationConditionals`

- 每对象数据；
- 每连接缓存；
- Dynamic map；
- dirty object bit array；
- 16 位 mask 与 `COND_NetGroup` 分流；
- backward compatibility mode。

#### 第 8 节：Custom 与 Dynamic

- 声明和切换代码；
- 粒度与适用场景对比；
- Dynamic 默认允许；
- 只有 `COND_Dynamic` 声明可改；
- 不可把 Custom 写成逐连接谓词；
- Fast Array 警告。

#### 第 9 节：对象级条件与 SubObject

- owning connection；
- RoleAutonomous；
- ReplicatePhysics；
- `COND_NetGroup`；
- 父子层级限制。

#### 第 10 节：13.3 每连接评估

- `GetLifetimeConditionals`；
- `ApplyConditionalsToChangeMask`；
- 生命周期成员遍历；
- Dynamic 条件替换；
- Custom mask AND；
- 显示概念位运算。

#### 第 11 节：缓存、补脏与基线

- 上一次条件掩码；
- 从隐藏到可见；
- 为什么必须补脏；
- 为什么需要 baseline invalidation；
- owner / autonomous / physics / custom / dynamic 的触发差异。

#### 第 12 节：三连接案例与性能

- Owner + Autonomous；
- Non-owner + Simulated；
- Late join + Simulated；
- 属性接收矩阵；
- 条件只省每连接发送工作，不必然省轮询量化；
- 稳定内置条件优先，高频切换谨慎。

#### 第 13 节：排错、源码与总结

- 排错决策树；
- 源码导航；
- 自动化测试导航；
- 官方资料卡片；
- 七条总结；
- Part 14 RPC 预告。

### 6.6 文章来源

顶部固定使用：

```text
文章来源：本文由 Jossy Zhang 根据《UE5 Iris 网络复制系统技术分析指南》系列大纲原创扩写；技术结论依据本地 Unreal Engine 5.7.4 源码、ReplicationSystemTestPlugin 自动化测试与 Epic Games 官方文档。
```

### 6.7 导航

底部：

- 上一篇链接 `/html-articles/ue5-iris-guide-part-12/`；
- 系列目录链接 `/ue5-iris-guide/`；
- 下一篇显示“第十四部分：RPC 系统（后续）”，不加死链接。

## 7. 更新统一 Post

编辑：

```text
source/_posts/ue5-iris-guide.md
```

修改：

- 更新 `updated` 时间；
- “第 1～12 部分”改为“第 1～13 部分”；
- 总览描述加入条件复制；
- 表格增加第十三部分；
- Part 12 摘要后增加 Part 13 摘要和 HTML 链接；
- 保持文章不是外部转载，不加入知乎来源；
- 保持已有 1～12 链接不变。

## 8. 静态验证

### 8.1 HTML 结构

检查：

```powershell
rg -n "<h2|<section id=|href=\"#" source/html-articles/ue5-iris-guide-part-13/index.html
rg -n "http://" source/html-articles/ue5-iris-guide-part-13/index.html
```

验收：

- 13 个 `<h2>`；
- 13 个唯一 section id；
- 桌面目录 13 项；
- 移动目录 13 项；
- 所有目录锚点存在；
- 仅 canonical 可使用站点既有 HTTP；
- 外部资料链接全部 HTTPS；
- 无空 `href`；
- 无不存在的 Part 14 链接。

### 8.2 术语

必须出现：

- `ELifetimeCondition`
- `FReplicationConditionals`
- `ApplyConditionalsToChangeMask`
- `FConditionalsMask`
- `FDoRepLifetimeParams`
- `DOREPLIFETIME_CONDITION`
- `COND_Custom`
- `COND_Dynamic`
- `DOREPDYNAMICCONDITION_SETCONDITION_FAST`
- `EReplicationCondition::RoleAutonomous`
- `EReplicationCondition::ReplicatePhysics`
- `COND_NetGroup`
- baseline invalidation / 基线失效
- UE 5.7.4
- 文章来源

### 8.3 统一入口

检查：

- Part 13 行存在；
- Part 13 摘要存在；
- `/html-articles/ue5-iris-guide-part-13/` 只计为一个唯一目标；
- 大纲 + Part 1～13 共 14 个唯一 HTML 路由；
- 没有新增小型 Part 13 Post。

### 8.4 Diff

执行：

```powershell
git diff --check
git diff --stat
git status --short
```

确认只包含：

- Part 13 HTML；
- 统一 Post 更新。

设计规格与实施计划已经分别提交，不应出现在未提交 diff 中。

## 9. Hexo 构建

执行：

```powershell
npm run clean
npm run build
```

验证：

- 命令成功；
- `public/html-articles/ue5-iris-guide-part-13/index.html` 存在；
- `public/ue5-iris-guide/index.html` 存在；
- 生成页包含 Part 13 链接；
- 不提交 `public/`。

## 10. 浏览器验证

浏览器自动化前完整重读 `playwright-cli` 技能。

启动本地站点后验证：

### 10.1 桌面端

视口 `1440 × 1000`：

- Part 13 返回 200；
- hero、固定目录、文章来源、13 节正文和底部导航可见；
- `document.documentElement.scrollWidth <= window.innerWidth`；
- 目录滚动高亮；
- 页面控制台无错误。

### 10.2 移动端

视口 `390 × 844`：

- Part 13 返回 200；
- 移动目录可展开；
- 代码块、表格和图表只在自身区域横向滚动；
- 页面级无横向溢出；
- 文章来源布局不重叠。

### 10.3 统一入口

- `/ue5-iris-guide/` 返回 200；
- Part 13 表格行和摘要存在；
- 点击 Part 13 链接进入正确 HTML；
- 若主题已有外部字体 CDN 403，只记录为既有环境噪声，不误判为本篇错误。

## 11. 清理

- 关闭本地服务器；
- 关闭浏览器会话；
- 删除临时脚本、截图、日志；
- 不删除用户文件；
- 确认 `public/` 未进入 Git 状态。

## 12. 最终状态

已提交：

- 设计规格；
- 实施计划。

保持未提交：

- `source/html-articles/ue5-iris-guide-part-13/index.html`
- `source/_posts/ue5-iris-guide.md`

最终回复报告：

- 两个文档提交哈希；
- 正文与统一入口文件；
- 静态检查、Hexo 构建和浏览器验证结果；
- 内容仍未提交，等待用户后续 `commit`。
