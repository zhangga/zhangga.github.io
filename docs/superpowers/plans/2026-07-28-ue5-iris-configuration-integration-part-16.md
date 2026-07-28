# UE5 Iris 第十六部分“配置与集成”实施计划

> 设计依据：`docs/superpowers/specs/2026-07-28-ue5-iris-configuration-integration-part-16-design.md`

## 目标

新增基于 Unreal Engine 5.7.4 源码校准的第十六部分长篇 HTML，更新 Part 15 下一篇导航与统一系列 Post，并完成静态、Hexo 和浏览器验证。

## 文件范围

### 新增

- `source/html-articles/ue5-iris-guide-part-16/index.html`

### 修改

- `source/html-articles/ue5-iris-guide-part-15/index.html`
- `source/_posts/ue5-iris-guide.md`

### 不修改

- `C:\work\st-unreal-engine` 下任何文件；
- 已有 Part 1～14；
- `public/` 中的生成文件不纳入提交；
- 不新增 `source/_posts/ue5-iris-guide-part-16.md`。

## Task 1：建立 Part 16 HTML 骨架

### 1.1 复用结构

从 Part 15 提取并复用：

- UTF-8 HTML5 head；
- 暖纸 / 深蓝 / 橙色 CSS token；
- Hero、桌面目录、移动目录、文章来源卡片；
- 阅读进度、返回顶部和 IntersectionObserver；
- Footer 与章节导航；
- 响应式断点、打印和 reduced-motion。

### 1.2 修改元信息

- title：`UE5-Iris 网络复制系统技术分析 - 第十六部分：配置与集成`
- description：包含 UE 5.7.4、启用契约、NetDriver、配置对象和 PIE；
- canonical：`/html-articles/ue5-iris-guide-part-16/`
- Hero 背景字：`CONFIGURE`
- Kicker：`PART 16 · CONFIGURATION & INTEGRATION`
- 技术基线：`Unreal Engine 5.7.4`

### 1.3 创建 13 个 H2 与目录

按设计规格建立并双向校验：

1. `boot-contract`
2. `control-plane`
3. `selection`
4. `enable`
5. `module-load`
6. `config-map`
7. `polling`
8. `filter-priority`
9. `advanced-config`
10. `netdriver`
11. `pie`
12. `profiles`
13. `migration`

### 验证

```powershell
rg -n '<h1|<h2|href="#' source/html-articles/ue5-iris-guide-part-16/index.html
```

预期：

- 1 个 H1；
- 13 个带唯一 id 的 H2；
- 桌面和移动目录均指向同一组 id。

## Task 2：写启用契约与选择优先级

### 2.1 启动契约

写入五道门：

```text
编译可见 → 插件装载 → NetDriver 获准 → 策略选择 → ReplicationSystem 创建
```

加入失败症状与验证入口：

| 门 | 失败表现 | 验证 |
| --- | --- | --- |
| 编译 | Iris header / symbol 不可见 | `SetupIrisSupport` |
| 插件 | `IrisCore` 未加载 | 插件描述符、模块日志 |
| 能力 | 强制参数仍回退 | `IrisNetDriverConfigs` |
| 策略 | 默认走 Generic | CVar / GameMode / cmdline |
| 构造 | Bridge / RepSystem 创建失败 | LogNet / LogIris |

### 2.2 选择优先级

实现 CSS 阶梯图：

```text
IrisNetDriverConfigs capability
  → global CVar default
  → GameInstance / GameMode
  → PIE dedicated-server following
  → command line final override
  → IrisCore loaded
```

说明：

- `-UseIrisReplication=1` 仍受 `bCanUseIris` 限制；
- `-UseIrisReplication=0` 强制 Generic；
- `NetDriverName` > wildcard > definition；
- 更改 CVar 不会改造已有 NetDriver。

### 2.3 三种启用方式

提供配置文件、命令行、控制台/C++ 对照表，并给出适用场景：

- 项目默认；
- CI / A/B / 紧急回退；
- 测试中“先设值、创建 NetDriver、再恢复”的受控用法。

### 验证

```powershell
rg -n 'bCanUseIris|UseIrisReplication|GameInstance|GameMode|热切换|NetDriverName' source/html-articles/ue5-iris-guide-part-16/index.html
```

## Task 3：写 UE 5.7.4 最小启用与模块加载

### 3.1 最小项目配置

完整代码块：

- `.uproject` 的 Iris 插件；
- 游戏模块 `Build.cs` 的 `SetupIrisSupport(Target)`；
- `DefaultEngine.ini` 的 `IrisNetDriverConfigs`、SubObject 列表和 CVar。

显著提示：

- Iris 插件 `EnabledByDefault=false`；
- `GameNetDriver` 在 BaseEngine 中已经 `bCanUseIris=true`，项目显式项用于表达和防止数组覆盖歧义；
- 本地 UE 5.7.4 不加入 `TargetRules.bUseIris`。

### 3.2 模块时间线

用 HTML/CSS 时间线表示：

```text
Iris.uplugin
→ FIrisModule
→ IrisCore
→ NetCore
→ cmdline override
→ serializers
→ legacy push-model compatibility
→ factory delegates
```

### 3.3 首次验证清单

- 启动日志出现 `Iris ReplicationSystem[n] ... is created`；
- `NetDriver->IsUsingIrisReplication()` 为 true；
- `PrintReplicatedObjects RepSystemId=n` 有目标对象；
- 客户端连接、属性、RPC、SubObject 冒烟通过；
- 用 `-UseIrisReplication=0` 验证回退。

## Task 4：写配置三层地图

### 4.1 定义层

覆盖：

- `UNetObjectFilterDefinitions`
- `UNetObjectPrioritizerDefinitions`
- 名称、实现类、ConfigClass
- 第一条有效 Prioritizer 是默认空间 Prioritizer

### 4.2 类映射层

覆盖 `UObjectReplicationBridgeConfig`：

- `PollConfigs`
- `FilterConfigs`
- `PrioritizerConfigs`
- `DeltaCompressionConfigs`
- `CriticalClassConfigs`
- `DefaultSpatialFilterName`
- `RequiredNetDriverChannelClassName`

### 4.3 参数层

覆盖：

- `UNetObjectGridFilterConfig`
- `UReplicationFilteringConfig`
- Sphere / FOV / OwnerBoost Config
- `UReplicationStateDescriptorConfig`

### 4.4 信息图

制作三列地图：

```text
名字注册 → Gameplay 类映射 → 算法数值
```

每列包含“配置段、关键字段、何时读取、常见错误”。

## Task 5：写 Poll、Filter 与 Prioritizer

### 5.1 Poll

解释：

- 完整类路径；
- 0 = 每帧；
- `bIncludeSubclasses`；
- 子类深度优先；
- `Actor` / `Object` 禁止作为覆盖类；
- `MaxTickRate / PollFrequency` 转为最多 255 帧周期；
- Push Model 与 fallback polling。

提供分层示例：

```ini
+PollConfigs=(ClassName=/Script/MyGame.MyCharacter,PollFrequency=30,bIncludeSubclasses=true)
+PollConfigs=(ClassName=/Script/MyGame.MyNPC,PollFrequency=10,bIncludeSubclasses=true)
+PollConfigs=(ClassName=/Script/MyGame.MyWorldItem,PollFrequency=2,bIncludeSubclasses=true)
```

### 5.2 Filter

说明：

- Filter 必须先注册再映射；
- `Spatial` 和 `NotRouted` 默认定义；
- `None` 是不使用动态 Filter；
- `FilterProfile` 同时可被 Grid profile 与 hysteresis profile 查找；
- `bForceEnableOnAllInstances` 的风险。

### 5.3 Prioritizer

说明：

- 静态优先级、默认空间优先级和指定 Prioritizer；
- Sphere、OwnerBoost、FOV、CountLimiter；
- 优先级累积和 1.0 阈值；
- “更高优先级”不增加总带宽。

## Task 6：写 Delta、Grid、Hysteresis 与 Descriptor

### 6.1 Delta

加入启用条件图：

```text
global CVar
∧ class mapping
∧ manager capacity
∧ usable baseline
→ delta path
```

关联 Part 10，不重复完整 Baseline 算法。

### 6.2 Grid

列出 UE 5.7.4 源码默认：

- Cell 20000 × 20000；
- Cull 15000；
- 精确距离 true；
- ViewPos recent frame 2；
- object cull frame 4。

说明：

- 单位是 Unreal Unit；
- cell size、cull distance、view speed 共同决定边界；
- profile 控制 `FrameCountBeforeCulling`；
- 项目值必须由对象密度和移动速度验证。

### 6.3 Hysteresis

区分：

- Grid 内部 recent cells / recent objects；
- ReplicationFiltering 的 scope hysteresis。

提供 profile 示例，并说明 throttle 可能额外延长 N-1 帧。

### 6.4 Descriptor

说明：

- `SupportsStructNetSerializerList` 的安全验证前提；
- `EnsureFullyPushModelClassNames`；
- `bEnsureAllClassesAreFullyPushModel`；
- 与 Part 7 / Part 11 的边界。

## Task 7：写 NetDriver 集成与系统实例

### 7.1 构造流水线

制作：

```text
CreateNetDriver_Local
→ WillNetDriverUseIris
→ PostCreation
→ InitBase
→ CreateReplicationSystem
→ GameInstance config override
→ Bridge
→ Factory
→ SetReplicationSystem
```

### 7.2 容量配置

表格列出：

| FNetDriverReplicationSystemConfig | Params 默认 | 调整代价 |
| --- | --- | --- |
| MaxReplicatedObjectCount | 65536 | 内存和容量 |
| InitialNetObjectListCount | 65536 | 首次分配 vs 扩容 |
| NetObjectListGrowCount | 16384 | 扩容次数与碎片 |
| PreAllocatedMemoryBuffersObjectCount | 65536 | cache / 内存 |
| MaxReplicationWriterObjectCount | 0 | client authority 容量 |
| MaxDeltaCompressedObjectCount | 2048 | baseline 内存 |
| MaxNetObjectGroupCount | 2048 | group 容量 |
| bAllowParallelTasks | false | server-only workload |

提示：NetDriver 配置中的 0 表示不覆盖 Params 默认，不是“容量为零”。

### 7.3 混合模式

用支持 / 不支持两栏卡片：

- 支持：不同 NetDriver、进程、GameMode 启动选择；
- 不支持：同 NetDriver Actor 分流、已有 NetDriver 热切换、Iris + RepGraph 同驱动。

## Task 8：写 PIE 多实例

### 8.1 隔离图

```text
PIE Server World → GameNetDriver → RepSystem 0
PIE Client 1     → GameNetDriver → RepSystem 1
PIE Client 2     → GameNetDriver → RepSystem 2
```

图中标注“仅为一次运行示例；ID 由空槽分配且可复用”。

### 8.2 Dedicated Server PIE 跟随

说明 `WillNetDriverUseIris` 对 GameNetDriver 的特殊逻辑：

- PIE；
- 非 dedicated client context；
- 找 PIE instance 0；
- 若它是 Dedicated Server，客户端跟随服务器当前系统；
- 之后命令行参数仍有最终覆盖权。

### 8.3 调试命令

提供：

```text
Net.Iris.PrintReplicatedObjects RepSystemId=<id>
Net.Iris.PrintDynamicFilterClassConfig RepSystemId=<id>
Net.Iris.PrintNetInfoOfObject FindByName=<name> RepSystemId=<id> ConnectionId=<id>
```

提示：省略 `RepSystemId` 默认 0，在多 PIE 时可能查询错误实例。

## Task 9：写三套完整起步配置

### 9.1 公共启用头

避免三次重复大段 `.uproject`，先给公共配置，再为各画像给算法段。

### 9.2 FPS

示例类：

- `MyCharacter`
- `MyProjectile`
- `MyPickup`
- `MyObjective`

目标：

- 高频移动对象优先；
- 空间物件可过滤；
- 避免 PlayerState 全量每帧；
- 验证射击、投射物、拾取和目标点。

### 9.3 开放世界 RPG

示例类：

- `MyPlayerCharacter`
- `MyNPC`
- `MyWorldItem`
- `MyQuestActor`

目标：

- 分级 poll；
- 大 cell / cull 起点；
- 稳定边缘 profile；
- NPC / WorldItem hysteresis；
- 验证传送、坐骑、流送和密集城镇。

### 9.4 竞速

示例类：

- `MyRaceVehicle`
- `MyTrackPickup`
- `MyTrackHazard`

目标：

- 注册 `RacingFOV`；
- 车辆用 FOV；
- 赛道物件用 Spatial；
- 验证高速运动、视锥、后方车辆和多 View。

### 9.5 每套配置后的测量卡

统一列出：

- 正确性；
- `IrisPollCount / Waste`；
- `IrisWriteCount / KBytes`；
- relevant object count；
- 边缘进入 / 离开延迟；
- 连接数与对象数扩容。

## Task 10：写迁移、故障矩阵与来源

### 10.1 五阶段迁移

实现横向或纵向路线图：

1. Legacy baseline；
2. 编译和双路启动；
3. 兼容性修复；
4. 配置与性能；
5. 默认启用与回退演练。

### 10.2 故障矩阵

至少覆盖：

| 症状 | 首查 | 常见原因 |
| --- | --- | --- |
| 命令行强制仍 Generic | `bCanUseIris` / module | NetDriver 无资格、插件未加载 |
| CVar 改了没变化 | NetDriver 创建时间 | 已有 NetDriver 不热切换 |
| FilterName 无效 | definitions | 名字未注册、类路径错误 |
| Poll override 不生效 | class path / cvar | 父子类覆盖、override 关闭 |
| 多 PIE 查错对象 | RepSystemId | 默认查 0 |
| 无缝旅行 ensure | GameMode request | 新旧模式要求不同系统 |
| 内存突然增加 | preallocation / capacities | 过度预分配 |

### 10.3 来源

加入：

- 系列大纲知乎链接；
- Introduction to Iris；
- Migrate to Iris；
- Filtering；
- Prioritization；
- Console Commands；
- 本地 UE 5.7.4 源码树。

声明：

- 原创扩写；
- 本地源码为技术基线；
- 未编译 UE、未跑插件测试或项目压测。

## Task 11：更新前后导航与统一 Post

### 11.1 Part 15

把：

```html
<div><span>NEXT →</span><b>第十六部分：配置与集成（后续）</b></div>
```

改为：

```html
<a href="/html-articles/ue5-iris-guide-part-16/"><span>NEXT →</span><b>第十六部分：配置与集成</b></a>
```

### 11.2 Part 16

底部导航：

- Previous：Part 15；
- Next：非链接占位 `第十七部分：高级主题（后续）`。

### 11.3 统一 Post

更新：

- `updated`；
- 首段 `第 1～16 部分`；
- 首段主题加入“配置与集成”；
- 表格新增 Part 16；
- 内容简介新增 Part 16；
- 正文链接到 `/html-articles/ue5-iris-guide-part-16/`。

### 验证

```powershell
rg -n 'part-16|第十六部分|1～16' source/_posts/ue5-iris-guide.md source/html-articles/ue5-iris-guide-part-15/index.html source/html-articles/ue5-iris-guide-part-16/index.html
```

## Task 12：静态验证

### 12.1 HTML 结构脚本

检查：

- doctype / lang / charset；
- title / canonical；
- H1 = 1；
- H2 = 13；
- id 唯一；
- TOC href 全部命中；
- 内部链接目标存在；
- 外部链接使用 `rel="noopener noreferrer"`；
- 无空 href；
- 无 `�`。

### 12.2 Git 检查

```powershell
git diff --check
git status --short
git diff --stat
```

### 12.3 文字边界

搜索错误声明：

```powershell
rg -n '热切换|同一个 NetDriver.*Legacy|Target\.cs|最佳配置|测试通过' source/html-articles/ue5-iris-guide-part-16/index.html
```

预期：只在否定、边界或说明语境出现。

## Task 13：Hexo 构建

先读取 `package.json` scripts，再使用仓库已有构建命令。

预期：

- 命令 exit 0；
- `public/html-articles/ue5-iris-guide-part-16/index.html` 存在；
- `public/ue5-iris-guide/index.html` 存在；
- 生成页面包含正确 canonical、Part 16 链接与中文文本。

构建产生的 `public/` 变更不提交。

## Task 14：浏览器验证

开始前完整读取本轮 `playwright-cli` skill。

### 桌面视口

验证：

- Part 16 返回 200；
- Hero、13 项目录、来源卡、信息图、三份配置和章节导航可见；
- 桌面目录 sticky；
- 滚动后 active TOC 和阅读进度更新；
- Part 15 → Part 16；
- Part 16 → Part 15；
- 系列 Post → Part 16；
- 控制台无 error。

### 移动视口

验证：

- 无页面级横向溢出；
- 折叠目录可展开并跳转；
- 代码块和表格自身可横向滚动；
- Hero 与底部导航不截断；
- 返回顶部按钮工作；
- reduced-motion 下滚动行为降级。

## Task 15：清理与交付

- 删除测试期间的临时截图或日志；
- 若 `public/` 被构建改动且属于忽略项，保留生成结果但不 stage；
- 确认只剩 3 个正文相关文件未提交；
- 不提交正文，等待用户后续明确 `commit`；
- 报告设计规格提交、实施计划提交、正文文件和验证结果。

## 完成定义

- 设计规格和实施计划各自已有提交；
- Part 16 HTML 内容完整、技术事实与 UE 5.7.4 源码一致；
- Part 15 / Part 16 / 统一 Post 链接闭环；
- 静态、Hexo、桌面与移动浏览器验证通过；
- UE 源码保持原样；
- 正文改动保持未提交。
