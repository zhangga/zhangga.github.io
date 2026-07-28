# UE5 Iris 第十八部分“最佳实践与实战案例”实施计划

## 目标

基于已批准的设计规格，创建系列第十八部分独立 HTML，内容以“证据闭环 → 性能策略 → 过滤策略 → 四类案例 → 迁移跑道 → 发布闸门”为主线。

最终路由：

```text
/html-articles/ue5-iris-guide-part-18/
```

同时更新：

- Part 17 的下一篇导航；
- 统一系列 Post；
- Part 18 到 Part 17、系列大纲附录和博客首页的导航。

技术基线：

```text
Unreal Engine 5.7.4
C:\work\st-unreal-engine
```

## 文件范围

### 新增

- `source/html-articles/ue5-iris-guide-part-18/index.html`

### 修改

- `source/html-articles/ue5-iris-guide-part-17/index.html`
- `source/_posts/ue5-iris-guide.md`

### 不修改

- `C:\work\st-unreal-engine` 下任何文件；
- Part 1～16 正文；
- `public/` 中的生成文件不纳入提交；
- 不新增 `source/_posts/ue5-iris-guide-part-18.md`。

## Task 1：建立 Part 18 页面骨架

### 1.1 文档元信息

创建完整 HTML5 文档：

```html
<!DOCTYPE html>
<html lang="zh-CN">
```

Head：

- `charset=utf-8`；
- 响应式 viewport；
- author：Jossy Zhang；
- description 包含 UE 5.7.4、最佳实践、四类案例、迁移；
- theme-color 与纸白背景一致；
- data URL favicon，不引入外部图标；
- canonical：
  `http://zhangga.github.io/html-articles/ue5-iris-guide-part-18/`；
- title：
  `UE5-Iris 网络复制系统技术分析 - 第十八部分：最佳实践与实战案例 · Jossy Zhang`。

### 1.2 视觉 token

使用“网络作战手册”配色：

```css
--paper: #f3f0e7;
--paper-deep: #e5dfd1;
--ink: #172331;
--ink-soft: #4f5d68;
--navy: #17324d;
--navy-deep: #0e2233;
--safe: #2e7859;
--safe-soft: #dce9df;
--signal: #e06b3b;
--signal-soft: #f4d9ca;
--yellow: #b07a17;
--red: #a64235;
--line: #c9c1b2;
--white: #fffdf7;
```

字体使用本地 fallback：

- display：Iowan Old Style / Palatino / Songti；
- body：Aptos / Microsoft YaHei UI / PingFang SC；
- mono：Cascadia Code / JetBrains Mono / Consolas。

不得加载外部字体。

### 1.3 Hero

内容：

- kicker：`PART 18 · BEST PRACTICES & CASES`；
- H1：`最佳实践` / `与实战案例`；
- deck：强调 measure / narrow / verify / ship；
- meta：UE 5.7.4、14 sections、capstone；
- 背景大字：`SHIP`。

Hero 使用：

- 深墨蓝；
- 安全绿细线；
- 警示橙页脚线；
- 轻量网格和仪表刻度；
- 不使用装饰图片。

## Task 2：建立导航和来源卡

### 2.1 14 个 H2

创建：

1. `operating-system`
2. `evidence-loop`
3. `push-poll`
4. `dormancy-delta`
5. `filter-layers`
6. `filter-validation`
7. `case-method`
8. `fps-case`
9. `open-world-case`
10. `battle-royale-case`
11. `mmo-case`
12. `migration-runway`
13. `release-gates`
14. `quick-reference`

每个 id 只放在 H2 本身，并添加：

```html
tabindex="-1"
data-no="01"
```

### 2.2 桌面目录

创建 sticky `aside.toc`：

- 14 个链接；
- 编号和短标题；
- hover / active 状态；
- 1080px 以下隐藏。

### 2.3 移动目录

创建 `details.toc-mobile`：

- 默认关闭；
- 同样 14 个链接；
- 820px 以下显示；
- 点击链接后正确滚动；
- 不自动关闭，便于验证当前章节。

### 2.4 来源卡

首屏后加入：

- Part 18 编号；
- 原创扩写说明；
- 本地 UE 5.7.4 技术基线；
- 知乎大纲链接；
- `SOURCE VERIFIED` 标签。

## Task 3：实现 18.0 运营闭环

### 3.1 从“能跑”到“可运营”

核心结论：

```text
能复制 ≠ 复制正确
复制正确 ≠ 满足预算
满足平均值 ≠ 满足尾延迟
一次通过 ≠ 可灰度、可回退
```

建立四个发布问题：

1. 谁应该收到；
2. 何时发现变化；
3. 本 tick 谁先发送；
4. 失败后能否收敛和回退。

### 3.2 优化证据环

CSS 信息图：

```text
BASELINE
  → CHANGE ONE LEVER
  → CAPTURE
  → COMPARE
  → CORRECTNESS
  → SHIP / REVERT
```

每个节点附一条产出物。

### 3.3 反模式

列出：

- 先改参数、后找问题；
- 只看平均带宽；
- 用本机 PIE 代替真实负载；
- 把“对象没发”直接归因于带宽；
- 把“开启开关”当成收益；
- 同时改 Filter、Poll、Delta，无法归因。

## Task 4：实现证据基线

### 4.1 场景合同

表格字段：

- build / map / mode；
- server tick；
- connections；
- replicated root / subobjects；
- gameplay phase；
- network profile；
- capture window；
- P50 / P95 / P99；
- correctness oracle。

### 4.2 六层漏斗

实现横向／移动纵向漏斗：

```text
REGISTERED
→ IN SCOPE
→ DIRTY
→ SCHEDULED
→ WRITTEN
→ ACKED / APPLIED
```

旁边列出对应问题与工具。

### 4.3 工具命令

代码块：

```text
-trace=net -NetTrace=1 -tracehost=localhost
```

附：

- Timing Insights；
- Networking Insights；
- Iris CSV；
- TypeStats；
- Network Emulation；
- 项目业务断言。

明确：

- 不只抓 happy path；
- 采样要覆盖 join burst、战斗峰值、travel、reconnect；
- CSV verbose 配置有数据体积成本。

## Task 5：实现 Push / Poll

### 5.1 双闸门

展示：

```ini
[SystemSettings]
Net.IsPushModelEnabled=1
net.Iris.PushModelMode=2
```

解释：

- compile gate；
- global gate；
- Iris mode；
- property push metadata；
- mark dirty；
- full push coverage。

### 5.2 决策矩阵

| 状态类型 | 推荐发现方式 | 原因 | 风险 |
| --- | --- | --- | --- |
| 高频显式 setter | Push | 修改点明确 | 漏标脏 |
| 第三方直接写 | Poll | 修改点不可控 | polling waste |
| 混合类 | Hybrid | 渐进迁移 | 误判 fully push |
| 外部系统快照 | PreUpdate + Push/Poll | 边界清晰 | 重复拷贝 |

### 5.3 PollFrequency 事实

说明：

- 单位为每秒频率；
- `0` 为每帧；
- 转换成 frame period；
- 上限 255 帧；
- 未覆盖 Actor 使用 NetUpdateFrequency；
- 动态改变 NetUpdateFrequency 在 5.7.4 有桥接支持。

### 5.4 质量指标

- PollCount；
- PollWasteCount / PollWasteMS；
- dirty hit ratio；
- missed dirty assertions；
- max update age；
- mark dirty call count；
- property correctness。

禁止宣称固定 10 倍。

## Task 6：实现 Dormancy / Delta

### 6.1 Dormancy 状态图

```text
AWAKE
  → request dormant
  → final state eligible
  → excluded from regular polling
  → gameplay mutation
  → FlushNetDormancy / wake
  → forced poll
  → AWAKE or dormant again
```

覆盖：

- `SetObjectWantsToBeDormant`；
- `NetFlushDormantObject`；
- root / subobject；
- dormant RPC CVar 边界；
- late join；
- actor initially dormant。

### 6.2 Delta 权衡板

三栏：

- 节省：重复完整状态 bits；
- 成本：baseline memory / compare / ack tracking；
- 风险：loss、baseline invalidation、condition/role transition。

真实配置：

```ini
[/Script/IrisCore.ObjectReplicationBridgeConfig]
+DeltaCompressionConfigs=(ClassName=/Script/MyGame.MyState)
```

全局 CVar：

```text
net.Iris.EnableDeltaCompression
net.Iris.MinimumNumberOfFramesBetweenBaselines
```

数值仅注明本地默认，不推荐照抄。

### 6.3 组合顺序

```text
先减少 scope
→ 再减少 poll
→ 再让静止对象 dormant
→ 最后测 delta 是否值得
```

## Task 7：实现过滤漏斗

### 7.1 层级图

```text
NOT REPLICATED / OWNER
→ CONNECTION
→ LEVEL / GROUP
→ SPATIAL GRID
→ DYNAMIC FILTER
```

每层列出：

- 谁更新；
- 更新频率；
- 典型场景；
- 热路径成本；
- 失败模式。

### 7.2 Level Group

依据 `UEngineReplicationBridge` 描述：

- create level group；
- actor 加入；
- NetDriver 更新 per-connection status；
- runtime actor level change；
- seamless travel；
- PlayerController 特例。

不虚构 `ULevelStreamingNetObjectFilterConfig`。

### 7.3 Grid

展示本地 5.7.4 默认：

- cell 20000 × 20000；
- default cull 15000；
- exact cull true；
- view hysteresis 2 frames；
- object hysteresis 4 frames。

以“源码默认，不是推荐值”明显标记。

### 7.4 Group

用队伍、频道、副本、观战四个事件驱动案例。

### 7.5 Dynamic

标记：

- last resort；
- one dynamic filter per object；
- per-connection batch；
- cannot resurrect；
- cache / SoA / bitset；
- scale slope must be measured。

## Task 8：实现过滤验证

### 8.1 真值矩阵

维度：

- owner / teammate / enemy / spectator；
- level loaded / unloaded；
- near / far；
- visible / hidden；
- join / leave；
- owner change；
- split screen / multi view。

### 8.2 边界测试

- 跨 grid cell；
- cull distance 边缘；
- 高速载具；
- teleports；
- streaming transition；
- group add/remove；
- dynamic cache invalidation；
- root / subobject。

### 8.3 监控

- in-scope count；
- filtered count by layer；
- cull tests；
- filter CPU；
- relevance churn；
- create / destroy burst；
- missing expected object assertions。

## Task 9：实现案例阅读方法

建立案例模板：

1. 场景假设；
2. 对象分层；
3. scope；
4. dirty / poll；
5. priority；
6. payload；
7. failure injection；
8. metrics；
9. rollback。

用“不是配置答案，而是评审清单”作为章节主句。

## Task 10：实现 FPS 案例

### 10.1 特征

- 少量高价值战斗对象；
- movement / hit / weapon state 高频；
- owner 和 locked target 尾延迟敏感；
- 世界物件差异大。

### 10.2 策略蓝图

| Tier | 对象 | Scope | Dirty | Priority |
| --- | --- | --- | --- | --- |
| A | owner pawn / weapon | owner + relevant | push | owner boost |
| B | nearby enemies | grid | push/hybrid | spatial/FOV |
| C | pickups | grid + dormancy | push + wake | normal |
| D | scoreboard | global/group | low-rate | count limiter |

### 10.3 回归

- fire / reload / weapon swap；
- prediction accept / reject；
- owner change / respawn；
- packet loss；
- spectator；
- hit validation；
- travel。

### 10.4 回退信号

- combat max update age；
- owner property mismatch；
- reliable queue growth；
- visibility leak；
- frame P99。

## Task 11：实现开放世界 RPG 案例

### 11.1 特征

- root objects 多；
- streaming / world partition；
- 静态交互物多；
- AI 分层；
- 高速坐骑和 teleport。

### 11.2 策略

```text
Level lifecycle
→ Grid scope
→ AI near/mid/far tiers
→ Dormant static state
→ event-driven group state
```

### 11.3 回归

- cell load / unload；
- seamless travel；
- fast traversal；
- teleport；
- late join；
- quest state；
- dormant chest / door；
- AI aggro transition。

## Task 12：实现百人大逃杀案例

### 12.1 三层预算

提供演算：

```text
45 × 20 × 18B = 16,200 B/s
150 × 4 × 12B = 7,200 B/s
99 × 1 × 24B = 2,376 B/s
state subtotal = 25,776 B/s ≈ 206 kbps/connection
```

显著标注：

- 假设值；
- 仅 state payload；
- 不是引擎默认或上线预算；
- 必须由 NetTrace 实测 bytes/update 替换。

### 12.2 未计入项

- headers；
- RPC；
- NetBlob；
- resend；
- export；
- join burst；
- voice；
- platform transport。

### 12.3 战局阶段

- lobby；
- drop；
- early spread；
- shrinking circle；
- final circle；
- post match。

每阶段 scope 和 dirty 分布不同，不能只测空地图。

### 12.4 饥饿与公平

- owner / combat max age；
- distant player eventual progress；
- PlayerState count limiter；
- spectator；
- reconnect；
- late join。

## Task 13：实现 MMO 案例

### 13.1 五个规模数

- online；
- shard；
- AOI；
- visible objects / connection；
- handoff burst。

### 13.2 边界图

```text
LOGIN / MATCHMAKING
        ↓
    SHARD A ── handoff ── SHARD B
      ↓ AOI                  ↓ AOI
ReplicationSystem A     ReplicationSystem B
```

明确 Iris 不提供：

- shard ownership transfer；
- persistence；
- cross-shard messaging；
- global consistency；
- service discovery；
- fleet autoscaling。

### 13.3 MMO 验收

- dense hub；
- world boss；
- auction / chat 非 Actor 数据；
- cross-zone handoff；
- reconnect；
- mass login；
- hot shard；
- failover。

## Task 14：实现迁移跑道

### 14.1 五阶段

CSS runway：

1. Inventory；
2. Shadow；
3. Correctness；
4. Performance；
5. Rollout。

每阶段包含：

- 输入；
- 动作；
- exit criteria；
- rollback。

### 14.2 差异矩阵

| Legacy | Iris | 迁移动作 |
| --- | --- | --- |
| IsNetRelevantFor | Filtering | 提取规则 |
| GetNetPriority | Prioritizer | 建立排序模型 |
| ReplicationGraph | filters/prioritizers | 重建节点语义 |
| ReplicateSubobjects | registered list | 注册生命周期 |
| custom NetSerialize | NetSerializer audit | 警告与兼容测试 |
| polling | push/hybrid | 标脏覆盖 |

### 14.3 自动化

建议：

- 双路径测试套件；
- property oracle；
- RPC order assertions；
- dormancy tests；
- owner/role transition；
- packet loss；
- join/travel/reconnect；
- capture diff；
- canary dashboard。

不得声称本次已经运行这些测试。

## Task 15：实现发布闸门

### 15.1 Scorecard

四组：

- correctness；
- performance；
- network resilience；
- operations。

每项状态：

- PASS；
- WATCH；
- BLOCK。

这是静态解释组件，不做虚假的互动数据。

### 15.2 回退树

```text
correctness regression?
  → stop rollout
protocol mismatch?
  → version gate / rollback
CPU P99 regression?
  → restore config / disable cohort
bandwidth regression?
  → inspect scope before lowering frequency
```

### 15.3 常见失败

- Push 漏标脏；
- PollFrequency 单位误读；
- dormancy 未 flush；
- delta baseline 成本反增；
- Group 状态未更新；
- Grid 边缘 churn；
- Dynamic Filter CPU 爆炸；
- prioritizer starvation；
- subobject 未注册；
- custom serializer 不兼容；
- RPC / OnRep 时序假设；
- join burst 未测。

## Task 16：实现快速参考、来源与导航

### 16.1 快速参考表

提供：

- 优化动作 → 主要降低的成本；
- 对象类型 → 起步策略；
- 指标异常 → 首查阶段；
- 开关 → 本地默认 → 验证要求。

### 16.2 源码索引

至少列出：

```text
Engine/Build/Build.version
Engine/Config/BaseEngine.ini
Net/Iris/.../ObjectReplicationBridgeConfig.h
Net/Iris/.../ObjectReplicationBridge.cpp
Net/Iris/.../LegacyPushModel.cpp
Net/Iris/.../Polling/ObjectPoller.cpp
Net/Iris/.../Filtering/NetObjectGridFilter.h
Net/Iris/.../DeltaCompression/DeltaCompressionBaselineManager.cpp
Engine/.../EngineReplicationBridge.cpp
ReplicationSystemTestPlugin/.../TestDormancy.cpp
ReplicationSystemTestPlugin/.../TestObjectDeltaSerialization.cpp
```

### 16.3 官方来源

加入安全外链：

- Iris Introduction；
- Components；
- Filtering；
- Prioritization；
- Migrate；
- Networking Insights；
- Network Emulation；
- Network Debugging Console Commands；
- 知乎大纲。

### 16.4 验证声明

声明：

- 静态核对本地 5.7.4；
- 未修改／编译 UE；
- 未运行 plugin tests；
- 未运行项目联机；
- 未做百人／千人压测；
- 示例数字必须替换。

### 16.5 Chapter nav

```html
<a href="/html-articles/ue5-iris-guide-part-17/">Previous</a>
<a href="/html-articles/ue5-iris-guide-outline/#section-21">Next: 附录</a>
```

## Task 17：实现阅读交互

### 17.1 Reading progress

scroll 时：

```text
root.scrollTop / (root.scrollHeight - root.clientHeight)
```

写入顶部进度条 width。

### 17.2 Active TOC

流程：

- 收集 `.toc a`；
- href 定位 H2；
- H2 找最近 section；
- IntersectionObserver 观察 section；
- 用 section 内 H2 id 更新 `aria-current`。

避免直接观察 H2 导致长章节中途丢失 active 状态。

### 17.3 Back to top

- 620px 后显示；
- reduced-motion 下 `auto`；
- 其他情况 `smooth`。

### 17.4 响应式约束

必须设置：

```css
.article-shell,
.layout,
article,
section {
  min-width: 0;
}

.table-wrap,
.codeblock,
.budget-calc,
.filter-stack {
  max-width: 100%;
  overflow-x: auto;
}

article code,
.callout strong,
.callout strong code {
  overflow-wrap: anywhere;
  word-break: break-word;
}
```

防止长 CVar、表格和公式造成页面级溢出。

## Task 18：更新 Part 17

把：

```html
<div><span>NEXT →</span><b>第十八部分：最佳实践与实战案例（后续）</b></div>
```

改成：

```html
<a href="/html-articles/ue5-iris-guide-part-18/"><span>NEXT →</span><b>第十八部分：最佳实践与实战案例</b></a>
```

并把正文下一篇预告从将来时改为实际可访问描述。

## Task 19：更新统一 Post

修改：

- `updated`；
- 已发布范围 `1～18`；
- 首段主题加入最佳实践、案例和迁移；
- 全部文章表新增 Part 18；
- 内容简介新增 Part 18；
- 链接 `/html-articles/ue5-iris-guide-part-18/`。

不改变前 17 篇条目。

## Task 20：静态验证

使用仓库现有 Node 依赖解析 HTML：

- parse5 parse error = 0；
- H1 = 1；
- H2 = 14；
- H2 ids 与计划完全一致；
- duplicate ids = 0；
- TOC hash links = 28；
- missing hash targets = 0；
- external links 全部有 `_blank noopener noreferrer`；
- external scripts = 0；
- empty links = 0；
- mojibake = false；
- Part 17 backlink = true；
- Post link = true；
- outline appendix link = true。

再执行：

```powershell
git diff --check
git status --short
```

## Task 21：Hexo 构建

先核对 `package.json`：

```powershell
Get-Content -Raw package.json
```

执行：

```powershell
npm run build
```

检查：

- exit 0；
- `public/html-articles/ue5-iris-guide-part-18/index.html` 存在；
- source 与 public Part 18 SHA-256 一致；
- `public/ue5-iris-guide/index.html` 包含 Part 18 链接；
- `public/` 不 stage。

## Task 22：浏览器验证

开始前读取本轮 `playwright-cli` skill 和需要的 session / run-code reference。

启动本地 Hexo server，使用独立 Playwright session `iris18`。

### 22.1 桌面 1440 × 1000

检查：

- HTTP 200；
- title；
- H1 = 1；
- H2 = 14；
- desktop TOC visible；
- mobile TOC hidden；
- Hero `SHIP`；
- 来源卡；
- 主要信息图；
- 无横向溢出；
- 点击 TOC 后标题顶部正确；
- active TOC；
- progress；
- back-to-top；
- Part 18 → Part 17；
- Part 18 → outline appendix；
- console 0 error / 0 warning。

### 22.2 导航闭环

检查：

- Part 17 → Part 18；
- series Post → Part 18；
- Part 18 → Part 17；
- Part 18 → outline `#section-21`。

### 22.3 移动 390 × 844

检查：

- `documentElement.scrollWidth === innerWidth`；
- desktop TOC hidden；
- mobile TOC visible；
- details 初始关闭；
- 展开并点击链接；
- hash 和目标 top 正确；
- code / table / budget 局部滚动；
- chapter nav 单列；
- back-to-top；
- console 0 error / 0 warning。

### 22.4 Reduced motion

验证：

- CSS 动画禁用；
- back-to-top 使用 auto；
- 页面功能不依赖动画。

## Task 23：清理与交付

关闭：

- Playwright session；
- 本地 Hexo server。

删除：

- `.playwright-cli` 快照和 console log；
- 临时 server log。

最终确认：

- `git diff --check`；
- blog git status；
- UE git status 与实施前一致；
- 设计提交存在；
- 计划提交存在；
- Part 18 正文相关改动仍未提交。

## 完成定义

- 设计规格与实施计划各有独立提交；
- Part 18 HTML 完整覆盖大纲 18.0～18.5；
- 技术事实与本地 UE 5.7.4 一致；
- Part 17、Part 18、outline appendix、统一 Post 导航闭环；
- 静态、Hexo、桌面和移动验证通过；
- 无页面级横向溢出；
- 独立页控制台无 error / warning；
- UE 源码未修改；
- 正文保持未提交，等待用户后续 `commit`。
