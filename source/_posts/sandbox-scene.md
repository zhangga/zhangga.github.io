---
title: 沙盒游戏3D场景建模
date: 2021-08-30 22:13:52
tags:
  - 笔记
id: sandbox-scene
categories:
  - 笔记
---

在一次聚餐之后，晚上睡觉前突然灵感爆棚想到的实现方案。

下面是在项目内部分享的PPT，具体代码实现在github：https://github.com/zhangga/JAVAZSet

![沙盒游戏3D场景建模 - 第1张  | 张嘎](https://i2.wp.com/192.144.167.243/blog/wp-content/uploads/21-1024x579.png?resize=640%2C362)

![沙盒游戏3D场景建模 - 第2张  | 张嘎](https://i0.wp.com/192.144.167.243/blog/wp-content/uploads/22-1-1024x574.png?resize=640%2C359)

![沙盒游戏3D场景建模 - 第3张  | 张嘎](https://i0.wp.com/192.144.167.243/blog/wp-content/uploads/23-1-1024x590.png?resize=640%2C369)

## 实际碰到的一点问题：

1.把9张1024*1024的navmesh合一张的时候，原生的recast是用32位分配空间，其中14位分配给tile，所以tile有上限的考虑。

现在把recast改为用64位表示，需要宏定义。在DetourNavMesh.h中定义 #define DT_POLYREF64 1

这样tile就有28位了，不太存在超过上限的可能了。

发现问题。改完之后的dll在加载新地图的时候，内存直接飙升。

打印输出，定位到问题发生在，dtLoadNavMesh时读取到的tile的内存size值不正常，导致内存申请异常。

至此问题已经定位，navmesh文件格式和读取的格式不一致，数据错位，读取异常。

进一步跟踪，发现是C++ struct内存对齐不同导致的。客户端生成默认是8，服务器读取是按4，结果服务器少读4字节。

在DetourInit.h文件中有如下代码：#pragma pack(push,4) 控制，前后端修改一致即可。

ppt在GitHub上。[JavaZSet](https://github.com/zhangga/JAVAZSet)
