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

本文基于 Unreal Engine 5.7.4 源码，沿一帧复制流水线拆解 DirtyNetObjectTracker、GlobalDirtyNetObjectTracker、Push Model、ObjectPoller 与 ObjectPollFrequencyLimiter，说明本帧 Dirty、跨帧 Accumulated、ForceNetUpdate、PollDirtyState 和频率错峰怎样共同决定哪些对象值得检查。

文章进一步区分对象级脏位、成员 Poll Mask 与量化 ChangeMask，给出完整 Push 属性接入示例、ForceNetUpdate 的准确边界、64-bit ChangeMask 内联存储、SIMD 频率更新、双帧追踪案例与性能测量方法。技术依据：[Epic Games：FDoRepLifetimeParams](https://dev.epicgames.com/documentation/en-us/unreal-engine/API/Runtime/Engine/FDoRepLifetimeParams?application_version=5.7)、[UObjectReplicationBridge::SetPollFrequency](https://dev.epicgames.com/documentation/en-us/unreal-engine/API/Runtime/IrisCore/UObjectReplicationBridge/SetPollFrequency?application_version=5.7)、[Console Commands for Network Debugging](https://dev.epicgames.com/documentation/unreal-engine/console-commands-for-network-debugging-in-unreal-engine?lang=en-US)，以及本地 UE 5.7.4 源码与 ReplicationSystemTestPlugin 自动化测试。本文由 Jossy Zhang 根据系列大纲原创扩写。
<!-- more -->

[打开完整 HTML 文章](/html-articles/ue5-iris-guide-part-11/)
