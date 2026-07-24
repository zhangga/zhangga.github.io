# UE5 Iris 第十部分：Delta Compression 实施计划

## 1. 交付目标

新增：

- `source/html-articles/ue5-iris-guide-part-10/index.html`
- `source/_posts/ue5-iris-guide-part-10.md`

完整文章路由：

```text
/html-articles/ue5-iris-guide-part-10/
```

Hexo Post 路由：

```text
/ue5-iris-guide-part-10/
```

文章覆盖大纲 10.1–10.4，技术基线为本地 Unreal Engine 5.7.4。

## 2. 约束

- 只读访问 `C:\work\st-unreal-engine`；
- 不修改 UE 源码；
- 不修改 Part 7/8 未提交文件；
- 复用 Part 9 的 HTML 视觉和交互结构；
- Part 10 正文实施完成后保持未提交；
- 设计与计划文档独立提交；
- 不提交 `public/`；
- 临时脚本、浏览器产物和服务器日志必须清理。

## 3. 基线检查

实施前记录：

```powershell
git status --short --untracked-files=normal
git log --oneline -5
git -C C:\work\st-unreal-engine status --short --untracked-files=normal
```

预期博客工作区只保留 Part 7/8 未提交内容，设计和计划提交后文档目录干净。

## 4. 源码核对

### 4.1 引擎版本

读取：

```text
C:\work\st-unreal-engine\Engine\Build\Build.version
```

确认：

- Major 5；
- Minor 7；
- Patch 4。

### 4.2 Baseline Manager

核对：

- `MaxBaselineCount = 2`
- `InvalidBaselineIndex = 2`
- `BaselineIndexBitCount = 2`
- `LastAckedBaselineIndex`
- `PendingBaselineIndex`
- `CreateBaseline`
- `DestroyBaseline`
- `LostBaseline`
- `GetBaseline`
- `FBaselineSharingContext`
- `MinimumNumberOfFramesBetweenBaselines`
- `net.Iris.EnableDeltaCompression`

### 4.3 存储与内存

核对：

- `FDeltaCompressionBaselineStorage`
- `FReplicationStateStorage`
- snapshot reserve / commit / cancel；
- 引用计数共享；
- dynamic state clone/free；
- per-object/per-connection ChangeMask 三份布局；
- capacity 与 `MaxDeltaCompressedObjectCount`。

### 4.4 Writer

核对：

- 无有效 Baseline 时的 full-with-mask 路径；
- 有效 Baseline 时的 delta 路径；
- 新 Baseline index 轮换；
- pending 的设置时机；
- Delivered 推进 last-acked；
- Lost 调用 `LostBaseline`；
- baseline 失效后的回退；
- initial state 的 DeltaCompressInitialState 路径。

### 4.5 Reader

核对：

- 读取 2-bit BaselineIndex；
- `bIsNewBaseline`；
- `StoredBaselines[0/1]`；
- `LastStoredBaselineIndex` / `PrevStoredBaselineIndex`；
- `DeserializeWithMaskDelta`；
- 存储当前 ReceiveState 为新 Baseline；
- 旧接收 Baseline 的释放。

### 4.6 Serializer

核对：

- `FNetSerializeDeltaArgs::Prev`
- `FNetDeserializeDeltaArgs::Prev`
- 默认 Delta；
- 8/16/32/64-bit 整数 Delta 表；
- float/double 位模式 Delta；
- Array/Struct dynamic state；
- ChangeMask 与 Serializer Delta 的边界。

### 4.7 配置

核对：

- `FObjectReplicationBridgeDeltaCompressionConfig`
- `DeltaCompressionConfigs`
- `ShouldClassBeDeltaCompressed`
- `SetDeltaCompressionStatus`
- Protocol `SupportsDeltaCompression`
- `MaxDeltaCompressedObjectCount` 默认 2048；
- NetDriver 配置覆盖；
- 全局 CVar 和创建节流 CVar。

### 4.8 自动化测试

核对 `TestObjectDeltaSerialization.cpp`：

- 单连接新 Baseline；
- 丢包后最终收敛；
- 多客户端；
- conditional 状态切换；
- subobject；
- dynamic state；
- pending destroy/cancel；
- CVar 控制创建节流。

## 5. 官方资料

只使用 Epic 官方页面：

- `UReplicationSystem::SetDeltaCompressionStatus`
- `FNetSerializeDeltaArgs`
- `FNetDeserializeDeltaArgs`
- `FNetSerializer`
- `FObjectReplicationBridgeDeltaCompressionConfig`
- `UObjectReplicationBridgeConfig`
- Components of Iris

完整 HTML 中所有官方链接：

- 新窗口打开；
- `rel="noopener noreferrer"`；
- 链接标题注明 UE 5.7 或 API 名称。

## 6. HTML 生成策略

### 6.1 复用外壳

从 Part 9 提取：

- `<style>`；
- 页面布局；
- hero；
- sticky 目录；
- mobile details；
- source note；
- progress/back-top JS；
- 页尾导航。

替换：

- title；
- description；
- canonical；
- hero 文案；
- 目录；
- article 内容；
- Part 10 专属 CSS；
- 上一篇/下一篇。

### 6.2 新增 CSS

实现：

- `.compression-stack`
- `.baseline-matrix`
- `.fork-lanes`
- `.wire-layout`
- `.cost-bars`
- `.memory-equation`
- `.gate-chain`
- `.bit-cost-table`

所有 min-width 图形容器本身必须设置：

```css
width: 100%;
min-width: 0;
overflow-x: auto;
```

内部行使用 `width: max-content; min-width: 100%`。

### 6.3 文章章节

创建 12 个 H2：

1. `section-01` 导读；
2. `section-02` 三层压缩地图；
3. `section-03` 10.1；
4. `section-04` 10.2；
5. `section-05` 10.3；
6. `section-06` 10.4；
7. `section-07` 双连接分叉；
8. `section-08` 完整收发旅程；
9. `section-09` 位成本；
10. `section-10` 内存与 CPU；
11. `section-11` 排查、源码与测试；
12. `section-12` 总结与 Part 11。

### 6.4 关键内容

正文必须包含：

- `FDeltaCompressionBaselineManager`
- `FDeltaCompressionBaselineStorage`
- `FDeltaCompressionBaselineInvalidationTracker`
- `FReplicationStateStorage`
- `FReplicationWriter::SerializeObjectStateDelta`
- `FReplicationReader::DeserializeObjectStateDelta`
- `SerializeWithMaskDelta`
- `DeserializeWithMaskDelta`
- `FNetSerializeDeltaArgs`
- `FNetDeserializeDeltaArgs`
- `MaxBaselineCount = 2`
- `InvalidBaselineIndex = 2`
- `BaselineIndexBitCount = 2`
- `LastAckedBaselineIndex`
- `PendingBaselineIndex`
- `FBaselineSharingContext`
- `net.Iris.EnableDeltaCompression`
- `net.Iris.MinimumNumberOfFramesBetweenBaselines`
- `net.Iris.DeltaCompressInitialState`
- `MaxDeltaCompressedObjectCount = 2048`
- `DeltaCompressionConfigs`
- `SetDeltaCompressionStatus`
- ACK / Lost / invalidation；
- 8-bit / 16-bit 成员位成本；
- dynamic state 内存；
- 两连接分叉示例。

## 7. Post

创建 `source/_posts/ue5-iris-guide-part-10.md`。

Front matter：

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

正文：

- 一段内容摘要；
- 一段官方资料和源码依据；
- `<!-- more -->`；
- 完整 HTML 链接。

## 8. 静态校验

编写一次性 Node 校验器，检查：

1. UTF-8 无 U+FFFD；
2. 单一 doctype/html/head/body；
3. title/canonical；
4. id 唯一；
5. 所有 hash target 存在；
6. desktop TOC 12 项；
7. mobile TOC 12 项；
8. 双端 TOC 一致；
9. 12 个顶层 H2；
10. 10.1–10.4 齐全；
11. 外链安全属性；
12. 无 `${...}` 残留；
13. 无行尾空白；
14. 关键技术短语齐全；
15. 文章来源齐全；
16. 上一篇/大纲/下一篇导航齐全；
17. Post front matter 和全文路由；
18. `<!-- more -->` 单一；
19. Post 来源说明；
20. 新增宽组件包含独立 overflow 规则。

执行：

```powershell
node .tmp-validate-part10.js
git diff --check
```

校验后通过 `apply_patch` 删除临时脚本。

## 9. Hexo 构建

执行：

```powershell
npm run build
```

检查：

- `public/ue5-iris-guide-part-10/index.html`
- `public/html-articles/ue5-iris-guide-part-10/index.html`

比较 source/public 完整 HTML SHA-256：

```powershell
Get-FileHash -Algorithm SHA256 ...
```

要求完全一致。

## 10. 浏览器验收

### 10.1 准备

- 完整读取 `playwright-cli` 技能；
- 启动唯一端口的本地静态服务器；
- 记录并验证 PID；
- 使用独立 Playwright session；
- 验收结束关闭 session 和 server。

### 10.2 桌面 1440×1000

检查：

- 文档 title；
- body/document 无横向溢出；
- desktop TOC 显示；
- mobile TOC 隐藏；
- 12 个目录项；
- 12 个主章节；
- 点击 `section-05`、`section-07` 后 hash 正确；
- 当前目录高亮；
- progress > 0；
- back-top 可见并能返回顶部。

### 10.3 移动 390×844

检查：

- body/document 无横向溢出；
- desktop TOC 隐藏；
- mobile TOC 显示；
- details 可展开；
- 12 个链接；
- 目录跳转和高亮；
- `pre`、`.table-scroll`、`.wire-layout`、`.baseline-matrix`、`.fork-lanes`、`.cost-bars` 可独立横向滚动。

### 10.4 Post

检查：

- Post 标题；
- 来源说明；
- 完整 HTML 链接可见；
- 点击后进入正确路由。

### 10.5 控制台

记录：

- article page console error；
- page error；
- >= 400 response；
- request failure。

主题第三方字体 CDN 403 若与 Part 8/9 一致，记录为非本文阻塞项。

## 11. 清理

必须删除：

- HTML 生成脚本；
- 静态校验脚本；
- 浏览器检查脚本；
- `.playwright-cli` 本次产物；
- server stdout/stderr；
- 其他 `.tmp-part10*`。

必须确认：

- Playwright 无活动 session；
- 本地测试端口无 listener；
- Part 10 内容未 stage；
- Part 7/8 未修改；
- UE 工作区状态与实施前一致。

## 12. 最终交付

最终回复包括：

- 两个新增文件的绝对链接；
- 内容覆盖范围；
- 静态校验结果；
- Hexo 构建结果；
- 桌面/移动浏览器结果；
- 第三方字体 CDN 非阻塞告警；
- UE 源码未修改；
- Part 7/8 保持原样；
- Part 10 正文未提交，等待 `commit`。

## 13. 完成检查表

- [ ] 源码与测试核对完成
- [ ] 官方链接核对完成
- [ ] HTML 12 章完成
- [ ] Post 完成
- [ ] 文章来源完成
- [ ] 静态校验通过
- [ ] Hexo 构建通过
- [ ] source/public 哈希一致
- [ ] 桌面浏览器通过
- [ ] 移动浏览器通过
- [ ] Post 路由通过
- [ ] 临时文件清理
- [ ] Git 状态复核
- [ ] UE 工作区复核
