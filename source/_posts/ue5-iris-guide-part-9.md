---
title: UE5-Iris 网络复制系统技术分析 - 第九部分：NetBlob 系统
date: 2026-07-24 15:11:38
tags:
  - UE
  - Iris
  - 网络复制
id: ue5-iris-guide-part-9
categories:
  - 笔记
---

本文沿一份“命中事件附件”从创建、类型路由、逐连接排队、可靠窗口与丢包反馈，一直追踪到 Partial 分片、接收端组装和最终交付，系统讲解 UE 5.7.4 的 FNetBlob、FNetObjectAttachment、FNetBlobManager、NetBlobHandler 体系、FReliableNetBlobQueue，以及 RawData、ShrinkWrap 等特殊 Blob 的用途与边界。

技术依据：[Epic Games：FNetBlob（UE 5.7）](https://dev.epicgames.com/documentation/en-us/unreal-engine/API/Runtime/IrisCore/FNetBlob)、[UNetBlobHandler（UE 5.7）](https://dev.epicgames.com/documentation/en-us/unreal-engine/API/Runtime/IrisCore/UNetBlobHandler)、[FPartialNetBlob（UE 5.7）](https://dev.epicgames.com/documentation/en-us/unreal-engine/API/Runtime/IrisCore/FPartialNetBlob)、[FReliableNetBlobQueue（UE 5.7）](https://dev.epicgames.com/documentation/en-us/unreal-engine/API/Runtime/IrisCore/FReliableNetBlobQueue)，以及本地 Unreal Engine 5.7.4 源码与 ReplicationSystemTestPlugin 自动化测试。本文由 Jossy Zhang 根据系列大纲原创扩写。
<!-- more -->

[打开完整 HTML 文章](/html-articles/ue5-iris-guide-part-9/)
