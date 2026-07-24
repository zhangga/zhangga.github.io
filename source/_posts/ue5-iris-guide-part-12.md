---
title: UE5-Iris 网络复制系统技术分析 - 第十二部分：对象引用与依赖
date: 2026-07-24 18:10:00
tags:
  - UE
  - Iris
  - 网络复制
id: ue5-iris-guide-part-12
categories:
  - 笔记
---

本文基于 Unreal Engine 5.7.4 源码，沿“发送端采集引用、导出网络身份、接收端解析或排队、Factory 创建实例、依赖关系参与调度”的完整链路，拆解 `FObjectReferenceCache`、`FNetDependencyData`、`FNetTokenStore` 与 `UNetObjectFactory`。

文章重点区分属性对象引用、松散调度依赖、硬创建依赖和 SubObject 所属关系，解释 `MustBeMapped`、Pending/Broken、循环引用、三种 `EDependentObjectSchedulingHint`、Name/String/Struct Token，以及 `UNetActorFactory`、`UNetSubObjectFactory` 和自定义 Factory 的注册边界。技术依据包括 [Epic Games：FNetObjectReference](https://dev.epicgames.com/documentation/unreal-engine/API/Runtime/IrisCore/FNetObjectReference?application_version=5.7)、[AddDependentObject](https://dev.epicgames.com/documentation/unreal-engine/API/Runtime/IrisCore/UObjectReplicationBridge/AddDependentObject?application_version=5.7)、[FNetTokenStore](https://dev.epicgames.com/documentation/unreal-engine/API/Runtime/IrisCore/FNetTokenStore?application_version=5.7)、[UNetObjectFactory](https://dev.epicgames.com/documentation/unreal-engine/API/Runtime/IrisCore/UNetObjectFactory?application_version=5.7) 与本地 ReplicationSystemTestPlugin 自动化测试。本文由 Jossy Zhang 根据系列大纲原创扩写。

<!-- more -->

[打开完整 HTML 文章](/html-articles/ue5-iris-guide-part-12/)
