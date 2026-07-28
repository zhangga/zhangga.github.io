# UE5 Iris 第十七部分“高级主题”实施计划

> 设计依据：`docs/superpowers/specs/2026-07-28-ue5-iris-advanced-topics-part-17-design.md`

## 目标

新增一篇基于 Unreal Engine 5.7.4 源码校准的第十七部分长篇 HTML，讲清自定义 Filter、Prioritizer、ReplicationFragment、大规模多人优化和 Gameplay 系统集成；同时更新 Part 16 下一篇导航与统一系列 Post，并完成静态、Hexo、桌面和移动浏览器验证。

## 文件范围

### 新增

- `source/html-articles/ue5-iris-guide-part-17/index.html`

### 修改

- `source/html-articles/ue5-iris-guide-part-16/index.html`
- `source/_posts/ue5-iris-guide.md`

### 不修改

- `C:\work\st-unreal-engine` 下任何文件；
- Part 1～15 正文；
- `public/` 中的生成文件不纳入提交；
- 不新增 `source/_posts/ue5-iris-guide-part-17.md`。

## Task 1：建立 Part 17 HTML 骨架

### 1.1 复用系列结构

从 Part 16 复用：

- UTF-8 HTML5 head；
- 暖纸、深蓝、橙色 CSS token；
- Hero、桌面目录、移动目录、来源卡片；
- 阅读进度、返回顶部和 IntersectionObserver；
- Footer 与章节导航；
- 响应式、打印和 reduced-motion 样式。

### 1.2 修改元信息

- title：`UE5-Iris 网络复制系统技术分析 - 第十七部分：高级主题 · Jossy Zhang`
- description：包含 UE 5.7.4、自定义 Filter、Prioritizer、ReplicationFragment、规模化与 Gameplay 集成；
- canonical：`/html-articles/ue5-iris-guide-part-17/`
- Hero 背景字：`EXTEND`
- Kicker：`PART 17 · ADVANCED TOPICS`
- 技术基线：`Unreal Engine 5.7.4`

### 1.3 创建 13 个 H2

1. `decision-gate`
2. `extension-map`
3. `filter-contract`
4. `stealth-filter`
5. `filter-performance`
6. `prioritizer-contract`
7. `combat-prioritizer`
8. `filter-priority-pipeline`
9. `fragment-contract`
10. `gameplay-fragment`
11. `scale`
12. `gameplay-integration`
13. `checklist`

### 验证

```powershell
rg -n '<h1|<h2|href="#' source/html-articles/ue5-iris-guide-part-17/index.html
```

预期：

- 1 个 H1；
- 13 个唯一 H2；
- 桌面和移动目录均能命中全部 H2。

## Task 2：写 17.0 高级定制决策

### 2.1 最窄扩展点阶梯

实现六级阶梯：

```text
配置内置机制
→ Connection / Group / Static Priority
→ Dynamic Filter
→ Dynamic Prioritizer
→ Fragment / Serializer
→ Bridge / DataStream
```

每级列出适用需求、维护成本和升级信号。

### 2.2 “不要自定义”决策树

至少覆盖：

- owner-only；
- 固定少量连接；
- 大量对象共享受众；
- 空间相关性；
- 仅需改变先后顺序；
- 特殊位流；
- 特殊采集 / 应用；
- 非标准对象生命周期或传输语义。

### 2.3 关键源码地图

按 Filter、Prioritizer、Fragment、GAS 案例、Physics 边界分类列路径，并说明：

- Public 头文件是扩展契约；
- Private 实现用于理解行为，不建议项目直接依赖；
- TestPlugin Mock 用于学习调用顺序；
- GameplayAbilities Fragment 是生产级参考，但不可照抄业务逻辑。

## Task 3：写 Filter 生命周期和批处理契约

### 3.1 生命周期图

```text
OnInit
  → AddConnection*
  → AddObject*
  → UpdateObjects
  → PreFilter
  → Filter(connection, batch)*
  → PostFilter
  → RemoveObject / RemoveConnection
  → OnDeinit
```

注明：

- `Filter` 同一连接也可能调用多次；
- `OutAllowedObjects` 入参未定义；
- 只对 `FilteredObjects` 中负责的对象作出完整决定；
- `GroupFilteredOutObjects` 已在更早阶段被排除；
- 连接、对象和最大内部索引都具有独立生命周期。

### 3.2 参数表

列出：

| 类型 | 关键字段 | 用途 | 陷阱 |
| --- | --- | --- | --- |
| `FNetObjectFilterInitParams` | counts / system / config | 初始化容量 | 把 current max 当 absolute max |
| `FNetObjectFilteringInfo` | 8-byte data | 每对象小索引 | 放大对象或指针 |
| `FNetObjectFilterAddObjectParams` | protocol / state buffer / profile | 缓存 descriptor 信息 | 直接解释量化 state |
| `FNetObjectFilterUpdateParams` | updated indices | 批量更新快照 | 每帧遍历全部对象 |
| `FNetObjectFilteringParams` | output / connection / view | 写可见集合 | 忘记初始化输出 |

### 3.3 Traits

- `Spatial`
- `NeedsUpdate`

用“是否需要 WorldLocation”和“是否需要 UpdateObjects”两个判断解释。

## Task 4：写隐身 Filter 案例

### 4.1 需求矩阵

| 对象状态 | Owner | 队友 | 敌方已侦测 | 敌方未侦测 | 观战 |
| --- | --- | --- | --- | --- | --- |
| 普通 | 允许 | 允许 | 允许 | 允许 | 项目规则 |
| 隐身 | 允许 | 允许 | 允许 | 禁止 | 项目规则 |

强调服务器权威，不能用客户端上报的“已侦测”直接决定可见性。

### 4.2 可编译方向骨架

提供：

- `UStealthNetObjectFilterConfig`；
- `UStealthNetObjectFilter` 头文件；
- 生命周期 override 列表；
- SoA 缓存成员；
- `PreFilter` / `Filter` 的批处理骨架。

代码中明确用 `// Project hook` 标记项目必须补全的快照来源，不使用私有 `GetReplicationSystemInternal()`。

### 4.3 项目伪代码

只用明确标记的伪代码描述：

```text
Allowed = Owner ∪ Team ∪ Detected ∪ SpectatorPolicy
Allowed -= GroupFilteredOut
OutAllowedObjects = Allowed ∩ FilteredObjects
```

### 4.4 注册与分配

加入 `DefaultEngine.ini` 注册和 C++ 分配示例，包含：

- `GetFilterHandle`；
- `InvalidNetObjectFilterHandle`；
- `SetFilter` 返回值；
- 对象必须已经有有效 `FNetRefHandle`；
- 失败日志和 fallback；
- 一个对象只能设置一个 Dynamic Filter。

## Task 5：写 Filter 性能和故障排查

### 5.1 热路径预算

推荐：

- `PreFilter` 统一构建连接快照；
- `UpdateObjects` 只更新 dirty 对象；
- per-object info 保存小索引；
- SoA、bit array、连续批次；
- 复用 scratch buffer；
- 发布版本关闭逐对象日志。

禁止：

- UObject 查找；
- GameplayTag 容器扫描；
- 射线检测；
- 动态分配；
- 每连接重复构建相同世界快照。

### 5.2 故障矩阵

| 症状 | 首查 | 常见原因 |
| --- | --- | --- |
| FilterName 无效 | definitions | 路径 / 模块名错误 |
| 对象从未进入 Filter | `AddObject` | `SetFilter` 失败 |
| 所有对象消失 | output bitset | 未显式设位 |
| Group 排除后无法放回 | 管线阶段 | 设计预期 |
| 隐身延迟一帧 | snapshot timing | Update / PreFilter 时序 |
| CPU 随连接数爆炸 | Filter 热路径 | 动态规则成本 |
| 分屏玩家看不到对象 | `View.Views` | 只处理第一个 View |

## Task 6：写 Prioritizer 契约

### 6.1 阈值与累积图

```text
0.0 ≤ p < 1.0  → 本 tick 不进入候选
p ≥ 1.0        → 有变化时可进入候选
未发送          → 继续累积
发送成功        → 重置
```

显著标注：

- 不是 0～1 概率；
- 大于 1 合法；
- 不是强制发送；
- 不增加总带宽。

### 6.2 生命周期和参数

覆盖：

- `Init` / `Deinit`；
- max index grow；
- connection；
- add / remove object；
- update；
- pre / prioritize / post；
- 同一连接可分批调用；
- `Priorities[ObjectIndex]` 用 object index 访问。

### 6.3 max 合成规则

加入正确代码：

```cpp
const float Calculated = FMath::Max(0.0f, Score);
Params.Priorities[ObjectIndex] =
    FMath::Max(Params.Priorities[ObjectIndex], Calculated);
```

说明多个 View、静态优先级和其他来源可能已经写入更高值。

## Task 7：写战斗 Prioritizer 案例

### 7.1 分数模型

```text
Base
+ OwnerBoost
+ InCombatBoost
+ LockedTargetBoost
+ RecentlyDamagedBoost
+ DistanceAndFovTerm
```

使用项目示例值但明确要求 profiling：

- Base 0.25；
- Combat +0.55；
- Locked +0.60；
- RecentDamage +0.35；
- Owner +0.75；
- Clamp 0～3。

### 7.2 缓存布局

- `FNetObjectPrioritizationInfo` 保存缓存索引；
- 位置、flags、owner connection 分成 SoA；
- `UpdateObjects` 读取已量化状态时必须正确解量化；
- 更推荐 gameplay 系统在安全边界提供只读快照；
- `Prioritize` 只做算术和连续内存访问。

### 7.3 注册、分配、回退

提供：

- prioritizer definitions；
- config 类配置；
- `GetPrioritizerHandle`；
- `SetPrioritizer`；
- 失败回退 `SetStaticPriority`。

### 7.4 验证指标

- 平均与 P95 等待 tick；
- 各类别实际发送率；
- 饥饿对象数量；
- owner / target / combat 命中率；
- 多 View 行为；
- saturation 下 write bytes 和 dropped candidates。

## Task 8：写 Filter 与 Prioritizer 协作

制作六段管线：

```text
Connection / Group
→ Dynamic Filter
→ dirty / resend
→ Prioritizer
→ budget / packet
→ Fragment / Serializer
```

加入四条推论：

- Filter 是集合削减，Prioritizer 是集合内排序；
- 已过滤对象不会因为高优先级复活；
- 没有变化的对象不会仅因高优先级凭空产生状态；
- 发送是否发生仍受带宽、可靠队列、依赖和包预算影响。

## Task 9：写 Fragment 契约

### 9.1 职责边界

对照：

| 扩展点 | 决定什么 | 不决定什么 |
| --- | --- | --- |
| NetSerializer | 值如何量化和写位流 | 对象相关性 |
| Fragment | 状态如何采集 / 应用 / 回调 | 连接带宽 |
| Filter | 对象对连接是否允许 | 属性编码 |
| Prioritizer | 候选顺序 | 权威状态 |

### 9.2 Traits 矩阵

分四组展示：

- send / receive；
- ownership / lifecycle；
- target buffer / partial state；
- polling / push / callbacks。

对 `HasInterpolation` 添加 5.7.4 “Not implemented” 警示。

### 9.3 推荐升级路径

```text
UPROPERTY
→ PropertyReplicationFragment
→ FastArray
→ Custom NetSerializer
→ Custom Fragment
```

列出进入下一层的必要信号。

## Task 10：写 GameplayAbilities 自定义 Fragment 源码解剖

### 10.1 注册链

```text
PropertyNetSerializerInfoRegistry
→ custom fragment creator
→ new Fragment(Context Traits | DeleteWithInstanceProtocol)
→ RegisterReplicationFragment
```

### 10.2 发送路径

- `FPropertyReplicationState`；
- `NeedsPoll`；
- Push-based dirtiness Traits；
- `PollReplicatedState`；
- Serializer `IsEqual` 和 state key。

### 10.3 接收路径

- persistent target state buffer；
- raw quantized state；
- Serializer `Dequantize`；
- 特殊 GameplayCue 应用语义；
- `CollectOwner`；
- `CallRepNotifies`。

### 10.4 关键骨架

正文只写约 30～50 行原创伪骨架，避免大段复制 Epic 源码；旁注每一行对应的真实源码入口。

## Task 11：写千人规模优化

### 11.1 乘法模型

用信息图展示：

```text
TotalObjects
× ScopeRatioPerConnection
× DirtyRatio
× BitsPerUpdate
× ConnectionCount
```

### 11.2 四张预算卡

- CPU：Poll / Filter / Prioritize / Serialize / Write / Apply；
- Bandwidth：state / RPC / NetBlob / ack / header；
- Memory：protocol / state / per-connection scope / baseline / history；
- Operations：join burst / travel / reconnect / shard handoff。

### 11.3 优化顺序

实现七步漏斗：

1. 减少对象 / Fragment；
2. Push / Poll；
3. Connection / Group / Grid；
4. Prioritization；
5. frequency / delta / budget；
6. Insights / CSV / logs；
7. custom batch extensions。

### 11.4 分片边界

明确：

- Iris 不提供跨服务器对象所有权转移；
- shard handoff、持久化、全局事件和跨区消息是项目架构；
- 一个大世界可用多个 server / ReplicationSystem，但一致性协议需项目实现；
- 不承诺“1000 人单服”。

## Task 12：写 GAS、Physics、AI 集成

### 12.1 GAS

写三层：

```text
GAS gameplay semantics
→ Iris-compatible serializers / fragments
→ transport
```

验证矩阵：

- server；
- owner；
- simulated proxy；
- prediction accept / reject；
- minimal / mixed / full；
- tag / effect / cue / montage / target data。

注明本地 5.7.4 CVar：

```text
AbilitySystem.Fix.ReplicateTagCountContainerWithIris
```

默认值为 false，不给出无条件生产启用建议。

### 12.2 Physics

对照：

- Iris state delivery；
- Default Replication；
- Predictive Interpolation；
- Resimulation；
- error correction；
- render interpolation。

用“状态运输 ≠ 物理预测”作核心结论。

### 12.3 AI

分层：

- server-only decision；
- replicated observable result；
- remote presentation proxy；
- security boundary。

给出近、中、远三级示例，但不把客户端 AI 代理描述成权威模拟。

## Task 13：写总结、来源和导航

### 13.1 检查表

分为：

- 扩展前；
- 实现时；
- 性能；
- 正确性；
- 上线前。

### 13.2 故障矩阵

至少覆盖：

- Filter 未注册；
- output bitset 未初始化；
- Prioritizer 覆盖已有值；
- state buffer 误转换；
- Fragment trait 不一致；
- RepNotify 不触发；
- GAS owner / proxy 差异；
- physics jitter；
- AI 隐私泄漏；
- 规模化 CPU / bandwidth 误判。

### 13.3 来源

加入：

- 系列大纲知乎链接；
- Epic 官方 Iris Introduction / Components / Filtering / Prioritization / Migration；
- Epic GAS 概览；
- 本地 UE 5.7.4 源码树。

声明：

- 本文为原创扩写；
- 具体符号和行为以本地 5.7.4 为技术基线；
- 未编译 UE、未运行插件项目测试、未做千人压测。

### 13.4 章节导航

Part 17：

- Previous：Part 16；
- Next：非链接占位 `第十八部分：最佳实践与实战案例（后续）`。

## Task 14：更新 Part 16 和统一 Post

### 14.1 Part 16

把：

```html
<div><span>NEXT →</span><b>第十七部分：高级主题（后续）</b></div>
```

改成：

```html
<a href="/html-articles/ue5-iris-guide-part-17/"><span>NEXT →</span><b>第十七部分：高级主题</b></a>
```

### 14.2 统一 Post

更新：

- `updated`；
- 首段 `第 1～17 部分`；
- 主题列表加入高级主题；
- 表格新增 Part 17；
- 内容简介新增 Part 17；
- 链接 `/html-articles/ue5-iris-guide-part-17/`。

### 验证

```powershell
rg -n 'part-17|第十七部分|1～17' source/_posts/ue5-iris-guide.md source/html-articles/ue5-iris-guide-part-16/index.html source/html-articles/ue5-iris-guide-part-17/index.html
```

## Task 15：静态验证

### 15.1 HTML 结构

使用仓库现有 Node 依赖解析 HTML，检查：

- doctype / lang / charset；
- title / canonical；
- H1 = 1；
- H2 = 13；
- id 唯一；
- TOC href 全命中；
- 内部链接目标存在；
- 外部链接安全属性；
- 无空 href；
- 无外部脚本；
- 无 `锟` 等 mojibake；
- 源码和生成文件关键正文哈希一致。

### 15.2 内容边界

```powershell
rg -n '0[～-]1|保证.*发送|增加.*总带宽|HasInterpolation|GetReplicationSystemInternal|确定性物理|1000.*单服' source/html-articles/ue5-iris-guide-part-17/index.html
```

预期这些词只出现在纠偏、否定或边界说明中。

### 15.3 Git

```powershell
git diff --check
git status --short
git diff --stat
```

## Task 16：Hexo 构建

先读取 `package.json` scripts，再执行仓库已有构建命令。

预期：

- exit 0；
- `public/html-articles/ue5-iris-guide-part-17/index.html` 存在；
- `public/ue5-iris-guide/index.html` 存在；
- 生成页面包含正确 canonical、Part 17 链接和中文正文；
- `public/` 不纳入提交。

## Task 17：浏览器验证

开始前完整读取本轮 `playwright-cli` skill。

### 桌面视口

验证：

- Part 17 返回 200；
- Hero、13 项目录、来源卡、决策树、Filter / Priority / Fragment 信息图、规模模型和集成矩阵可见；
- 桌面目录 sticky；
- active TOC 和阅读进度更新；
- Part 16 → Part 17；
- Part 17 → Part 16；
- 系列 Post → Part 17；
- 控制台无 error / warning。

### 移动视口

验证：

- 无页面级横向溢出；
- 折叠目录可展开并跳转；
- code、table 自己横向滚动；
- Hero 和底部导航不截断；
- 返回顶部工作；
- reduced-motion 下行为降级。

## Task 18：清理与交付

- 删除浏览器测试生成的临时截图、日志和 `.playwright-cli` 产物；
- 保留 `public/` 生成结果但不 stage；
- 检查 UE 源码工作区与实施前状态一致；
- 确认设计规格和实施计划已各自提交；
- 确认正文相关文件保持未提交；
- 报告文件、两次文档提交和全部验证结果。

## 完成定义

- 设计规格和实施计划各自有独立提交；
- Part 17 HTML 完整，技术事实与本地 UE 5.7.4 一致；
- Part 16 / Part 17 / 统一 Post 链接闭环；
- 静态、Hexo、桌面和移动浏览器验证通过；
- UE 源码保持原样；
- 正文改动保持未提交，等待用户后续明确 `commit`。
