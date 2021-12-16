---
title: 游戏服务器网络库
date: 2021-12-06 19:37:35
tags:
  - 网络
id: servernet
categories:
  - 服务器技术
---

最近在开发golang的游戏服网络库，基础开发已经完成，准备做性能测试，在思考测试用例的时候，参考了下主要网络库的测试场景，在这里做一下汇总。

## 游戏网络库

#### 背景

通过封装TCP/UDP网络连接，向上层业务提供 **可靠、易用** 的网络库。

获取网络层的控制权，先于业务做一些探索并最终赋能业务。

<!-- more -->

#### 特性

1. 易用性

* 遵循golang net的接口规范，保证通用性。
* 弱网环境下保证消息顺序、可靠，不需要业务层做额外工作。
* 可以发送可靠消息，TCP消息，UDP消息。
* 方便开启/关闭TCP/UDP以及双通道通信。

2. 可靠性

* 对网络连接进一步封装成逻辑连接(session)，将短时间内的断线重连作为同一个连接，对业务层透明。
* 保证任何情况下消息的可靠，在TCP/UDP上封装KCP，保证UDP的可靠，以及断线重连下同一个逻辑连接(不同的TCP连接)消息的可靠性。
* 支持上行/下行分别走不同的通道。
* 针对游戏大包下发的场景(如登录游戏，进入场景/副本等)，优先使用TCP发包。
* 根据网络时延自动选择TCP或UDP。
* 网络连接自动选择就近IP，登录到就近部署区域。

#### 总结

针对游戏服务器特性在设计网络库的时候需要特别关注的一些地方：

1. 游戏业务重。在handler中处理一条消息业务的时候一般都涉及到I/O操作，如果同步执行的话，CPU主要消耗会在等待I/O操作上。此时handler必须要异步处理，这就涉及到上下文切换、I/O协作等需要考虑的代价。
2. 过多长链接的问题。在使用golang net网路库设计框架时，一般都是新启一个协程goroutine去处理一个连接的read事件，在大量连接的情况下需要考虑协程的上下文切换开销，以及空闲连接占用的问题。
3. 网络库在处理消息合包/拆包的情况下，对消息buffer的拷贝次数。常用的方案是RingBuffer和[Nocopy Buffer](https://www.infoq.cn/article/fea7chf9moohbxbtyres)，参考netty和netpoll。
4. 必须收到完整的数据包才可以继续处理，不能收到一半就开始处理。
5. 水平触发、边缘触发，对编程模型的影响。



## 网络库性能调研

### 现状

现在的网络库基于golang/net实现，golang/net本身已经是一个简洁高效的网络库。

但在海量连接的业务场景下，特别是我们这种大网关的背景下，每个连接一组goroutine(一个接收消息的，一个发送消息的)，此时大量goroutine存在的情况下可能出现的问题：

1. 资源占有：消耗的资源就会呈线性趋势暴涨，首先给go runtime scheduler造成极大的压力和侵占系统资源，然后资源占用又反过来影响runtime的调度，导致性能下降。
2. 网络抖动：在系统抖动时，大量网络请求断开并重连，伴随着的是大量协程的创建，退出的协程依旧在allg结构中，造成gc的扫描。

1. 减少内存拷贝：新的网络库中解析过一次协议了，直接将buffer交给上层，减少copy。借鉴netpoll的设计，无锁且zero copy。
2. buffer扩容时copy原数组的问题，只能扩容无法缩容，占有大量内存。linkedbuffer。

### 常见开源库

### [gnet](https://github.com/panjf2000/gnet)

[gnet介绍](https://strikefreedom.top/go-netpoll-io-multiplexing-reactor)

#### 优势

- 海量连接，高频创建销毁。
- 高性能，低损耗。

- 支持TCP、UDP。
- Multi-Reactors、Multi-Reactors+Goruntine Pool两种网络模型。

#### 可借鉴优化

- 🔲内置 goroutine 池，由开源库 [ants](https://github.com/panjf2000/ants) 提供支持
- 🔲内置 bytes 内存池，由开源库 [bytebufferpool](https://github.com/valyala/bytebufferpool) 提供支持

- 🔲高效、可重用而且自动伸缩的环形内存 buffer
- 🔲支持异步写操作

### [netpoll](https://github.com/cloudwego/netpoll)

[netpoll介绍](https://blog.csdn.net/ByteDanceTech/article/details/106066621?utm_medium=distribute.pc_aggpage_search_result.none-task-blog-2~aggregatepage~first_rank_ecpm_v1~rank_v31_ecpm-6-106066621.pc_agg_new_rank&utm_term=netpoll%E5%92%8Cgnet&spm=1000.2123.3001.4430)

#### 优势

- 适合重业务的RPC。
- 高效连接池，管理连接状态。

- 协程池，控制goroutine。
- 内存管理。

- NoCopy Buffer。

#### 劣势

- 不支持UDP。

#### 可借鉴优化

- 🔲丰富的测试场景

- 🔲[LinkBuffer](https://github.com/cloudwego/netpoll/blob/main/nocopy_linkbuffer.go) 提供可以流式读写的 nocopy API
- 🔲[gopool](https://github.com/bytedance/gopkg/tree/develop/util/gopool) 提供高性能的 goroutine 池

- 🔲[mcache](https://github.com/bytedance/gopkg/tree/develop/lang/mcache) 提供高效的内存复用
- 🔲IsActive 支持检查连接是否存活

