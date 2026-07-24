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

本文把“只发脏成员”和“相对已确认历史编码”拆开，基于 Unreal Engine 5.7.4 源码讲解 ChangeMask、逐连接 Baseline 与成员 SerializeDelta 的三层边界，并沿 DeltaCompressionBaselineManager、Writer、wire 和 Reader 走完双槽位、pending、ACK/Lost、失效与丢包恢复。

文章还覆盖类级 DeltaCompressionConfigs、SetDeltaCompressionStatus、全局 CVar、对象容量、整数与浮点 Delta 位成本，以及快照内存和动态状态 clone/free 的工程权衡。技术依据：[Epic Games：SetDeltaCompressionStatus](https://dev.epicgames.com/documentation/unreal-engine/API/Runtime/IrisCore/UReplicationSystem/SetDeltaCompressionStatus)、[FNetSerializeDeltaArgs](https://dev.epicgames.com/documentation/en-us/unreal-engine/API/Runtime/IrisCore/FNetSerializeDeltaArgs)、[FNetSerializer](https://dev.epicgames.com/documentation/en-us/unreal-engine/API/Runtime/IrisCore/FNetSerializer)，以及本地 Unreal Engine 5.7.4 源码与 ReplicationSystemTestPlugin 自动化测试。本文由 Jossy Zhang 根据系列大纲原创扩写。
<!-- more -->

[打开完整 HTML 文章](/html-articles/ue5-iris-guide-part-10/)
