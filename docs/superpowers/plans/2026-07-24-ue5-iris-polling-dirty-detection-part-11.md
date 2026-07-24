# UE5 Iris 第十一部分：轮询与脏数据检测实施计划

## 1. 交付目标

新增：

- `source/html-articles/ue5-iris-guide-part-11/index.html`
- `source/_posts/ue5-iris-guide-part-11.md`

完整文章路由：

```text
/html-articles/ue5-iris-guide-part-11/
```

Hexo Post 路由：

```text
/ue5-iris-guide-part-11/
```

文章覆盖大纲 11.1–11.7，技术基线为本地 Unreal Engine 5.7.4。

## 2. 约束

- 只读访问 `C:\work\st-unreal-engine`；
- 不修改 UE 源码；
- 不修改 Part 7/8/10 未提交文件；
- 复用 Part 10 的 HTML 视觉和交互外壳；
- Part 11 正文完成后保持未提交；
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

预期博客工作区保留 Part 7/8/10 未提交内容，不将其加入 Part 11 提交。

## 4. 源码核对

### 4.1 引擎版本

读取 `Engine/Build/Build.version`，确认版本为 5.7.4。

### 4.2 DirtyNetObjectTracker

核对：

- `DirtyNetObjects`
- `AccumulatedDirtyNetObjects`
- `ForceNetUpdateObjects`
- `MarkNetObjectStateDirty`
- `ForceNetUpdate`
- `UpdateDirtyNetObjects`
- `UpdateAndLockDirtyNetObjects`
- `UpdateAccumulatedDirtyList`
- `ReconcilePolledList`
- `FDirtyObjectsAccessor`
- 多 ReplicationSystem 的 global poll handle 与锁定策略。

### 4.3 GlobalDirtyNetObjectTracker

核对：

- object-level dirty；
- per-property `RepIndex` 范围；
- RepIndex 到 Fragment/Member Poll Mask 的映射；
- custom conditional 与禁用属性处理；
- 单 Protocol 当前只支持一个 Push owner 的限制；
- global dirty list 的 gather/reset/lock。

### 4.4 Push Model

核对：

- `WITH_PUSH_MODEL`
- `net.IsPushModelEnabled`
- `net.Iris.PushModelMode`
- `net.MakeBpPropertiesPushModel`
- `FDoRepLifetimeParams::bIsPushBased`
- `DOREPLIFETIME_WITH_PARAMS_FAST`
- `MARK_PROPERTY_DIRTY*`
- `MARK_PROPERTY_DIRTY_FROM_NAME*`
- `COMPARE_ASSIGN_AND_MARK_PROPERTY_DIRTY`
- `FLegacyPushModel` 到 Iris Global Tracker 的委托链。

### 4.5 ObjectPoller

核对：

- `PollAndCopyObjects`
- `PollAndCopySingleObject`
- `PushModelPollObject`
- `ForcePollObject`
- fully-push 与 hybrid 路径；
- `PollDirtyState` 与 `PollAllState`；
- GC 引用刷新；
- `DirtyObjectsToQuantize` 与 `DirtyObjectsThisFrame`；
- parallel poll 的 task/interleave 条件和默认值。

### 4.6 Poll Frequency Limiter

核对：

- `FramesBetweenUpdates`
- `FrameCounters`
- `FrameIndexOffsets`
- `SetPollFramePeriod`
- `SetPollWithObject`
- PollFrequency → frame period 换算；
- 起始 offset 错峰；
- dirty/force override；
- x86 SIMD、NEON 和 scalar 路径；
- `PollConfigs`、Actor `NetUpdateFrequency` 和动态更新。

### 4.7 ChangeMask

核对：

- `FChangeMaskStorageOrPointer`
- `UseInlinedStorage(BitCount <= 64)`
- `FReplicationStateMemberChangeMaskDescriptor`
- `BitOffset` / `BitCount`
- Protocol 扁平 ChangeMask；
- `QuantizeObjectStateData`
- `FChangeMaskCache`
- sparse ChangeMask serialization；
- object dirty bits / member poll mask / quantized ChangeMask 的边界。

### 4.8 帧顺序

沿 `UReplicationSystem::NetUpdate` 与 `UObjectReplicationBridge::PreSendUpdate` 核对：

```text
StartPreSendUpdate
→ UpdateDirtyObjectList
→ BuildPollList
→ PreUpdate
→ FinalizeDirtyObjects
→ PollAndCopy
→ UpdateDirtyListPostPoll
→ QuantizeDirtyStateData
→ scope/filter/prioritize/send
→ ReconcilePolledList
```

### 4.9 自动化测试

核对：

- `TestDirtyNetObjectTracker.cpp`
- `TestObjectPollFrequencyLimiter.cpp`
- `TestPreUpdateCallback.cpp`
- `TestReplicationStateDescriptorBuilder.cpp`
- Push setter/registration 示例对象。

覆盖初始无脏位、合法/非法标脏、跨帧累计、清理、PreUpdate 中标脏或 Force、错峰轮询、根对象/子对象同步轮询。

## 5. 官方资料

只引用 Epic 官方页面：

- `FDoRepLifetimeParams`
- `UObjectReplicationBridge::SetPollFrequency`
- `FRootObjectReplicationParams`
- `UReplicationSystem::NetUpdate`
- Console Commands for Network Debugging
- Testing and Debugging Networked Games

外链全部使用：

```html
target="_blank" rel="noopener noreferrer"
```

## 6. HTML 实施

### 6.1 复用外壳

从 Part 10 复用：

- `<style>` 与响应式断点；
- hero；
- desktop sticky 目录；
- mobile details 目录；
- source note；
- 阅读进度、目录高亮、回顶脚本；
- 页尾系列导航。

替换：

- title、description、canonical；
- hero 和技术基线；
- 13 项目录；
- 全部正文；
- Part 11 专属图形 CSS；
- 上一篇/下一篇链接。

### 6.2 新增 CSS

实现：

- `.dirty-pipeline`
- `.tracker-bits`
- `.poll-modes`
- `.push-contract`
- `.frequency-wheel`
- `.mask-anatomy`
- `.frame-journey`
- `.cost-model`

所有宽组件：

```css
width: 100%;
min-width: 0;
overflow-x: auto;
```

### 6.3 章节

创建 13 个 H2：

1. `section-01` 导读；
2. `section-02` 一帧全景图；
3. `section-03` 11.1；
4. `section-04` 11.2；
5. `section-05` 11.3；
6. `section-06` 11.4；
7. `section-07` 11.5；
8. `section-08` 11.6；
9. `section-09` 双帧案例；
10. `section-10` 性能成本；
11. `section-11` 接入清单；
12. `section-12` 排查、源码与测试；
13. `section-13` 11.7 总结与 Part 12。

### 6.4 必须包含的技术词

- `FDirtyNetObjectTracker`
- `FGlobalDirtyNetObjectTracker`
- `DirtyNetObjects`
- `AccumulatedDirtyNetObjects`
- `ForceNetUpdateObjects`
- `MarkNetObjectStateDirty`
- `ForceNetUpdate`
- `FObjectPoller`
- `PushModelPollObject`
- `ForcePollObject`
- `FObjectPollFrequencyLimiter`
- `FramesBetweenUpdates`
- `FrameCounters`
- `FChangeMaskStorageOrPointer`
- `FReplicationStateMemberChangeMaskDescriptor`
- `DirtyObjectsToQuantize`
- `WITH_PUSH_MODEL`
- `net.IsPushModelEnabled`
- `net.Iris.PushModelMode`
- `net.Iris.UseFrequencyBasedPolling`
- `net.Iris.EnableForceNetUpdate`
- `net.Iris.Poll.FilterOutNonDirtyPushBasedObjects`
- `MARK_PROPERTY_DIRTY_FROM_NAME`

### 6.5 禁止的错误表述

- Push 完全取消轮询；
- MarkDirty 立即发送；
- ForceNetUpdate 保证本帧发包；
- ChangeMask 就是 DirtyNetObjectTracker 的对象位图；
- 86.9% 是真实 packet 固定节省；
- Push 在 UE 5.7.4 所有项目中默认开启；
- 私有 CVar 或布局是跨版本稳定 API。

## 7. Post 实施

创建 `source/_posts/ue5-iris-guide-part-11.md`：

```yaml
---
title: UE5-Iris 网络复制系统技术分析 - 第十一部分：轮询与脏数据检测
date: 2026-07-24 17:10:00
tags:
  - UE
  - Iris
  - 网络复制
id: ue5-iris-guide-part-11
categories:
  - 笔记
---
```

摘要包含：

- UE 5.7.4；
- Tracker、Push、Poller、Frequency Limiter、ChangeMask；
- 官方资料；
- Jossy Zhang 根据系列大纲原创扩写；
- `<!-- more -->`；
- `/html-articles/ue5-iris-guide-part-11/`。

## 8. 静态校验

执行只读检查：

- HTML5 单文档骨架；
- 13 个 H2；
- desktop/mobile TOC 各 13 项且顺序一致；
- H2 id 唯一；
- 所有本页 hash 链接存在目标；
- 无不安全外链；
- 无 UTF-8 replacement character；
- 无 `TODO/TBD/占位`；
- 无行尾空白；
- 宽组件有 overflow 防护；
- Post front matter、id、日期和链接正确；
- source note 同时出现于顶部和页尾。

## 9. 构建验证

执行：

```powershell
npm run build
```

验证：

- `public/ue5-iris-guide-part-11/index.html`
- `public/html-articles/ue5-iris-guide-part-11/index.html`
- source/public 完整 HTML SHA-256 一致；
- 构建无错误；
- `public/` 不加入 Git。

## 10. 浏览器验证

在本地服务中验证：

### 桌面 1440×1000

- sticky 目录可见；
- mobile TOC 隐藏；
- 目录高亮与锚点跳转正常；
- 阅读进度与回顶正常；
- 无整页横向溢出。

### 移动 390×844

- desktop TOC 隐藏；
- mobile TOC 可展开；
- 宽组件仅内部滚动；
- 无整页横向溢出；
- Post 入口可进入完整 HTML；
- console 无本文脚本错误。

## 11. 收尾

- 清理临时脚本、浏览器截图、server log 和 session；
- `git diff --check`；
- 确认只新增 Part 11 Post 与 HTML；
- 保持正文未提交；
- 报告设计/计划提交、正文文件、验证结果和既有非阻塞问题。
