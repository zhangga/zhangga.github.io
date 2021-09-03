---
title: golang笔记
date: 2015-09-01 23:49:37
tags:
  - 笔记
id: golang-summary
categories:
  - 笔记
---

### go gc

- 开始标记：STW，开启写屏障，统计root对象。
- 三色标记：扫描root对象，包括全局指针和G栈上的，扫描G栈时G栈需要暂停。root标记灰色，没引用标记黑色，有引用标记黑色并把引用标记灰色，直到灰色队列为空。与用户程序并行。
- 重新扫描：STW，因为上一步并行，可能重新分配对象和赋值，通过写屏障记录下来。
- 回收白色对象
- 写屏障：记录第一次扫描时对象的状态，和第二次比对，引用状态变化的对象标记灰色，继续处理。

### kitex

- 公司开源的RPC框架，[github](https://github.com/cloudwego/kitex)
- 底层网络基于Netpoll实现，kite基于golang的net实现，BIO，每个连接都需要一个goronntine，大量连接时，上下文切换开销。
- Netpoll基于epoll实现，epoll是linux提供的多路复用网络IO模型，TCP读写都是通过缓冲区来实现的，操作系统为每个tcp连接维护读、写缓冲区。epoll基于监听读写缓冲区事件来实现对网络连接的读写和管理。epoll通过红黑树实现对fd(文件描述符)的高效查找，为每个监听的网络io向操作系统注册回调函数，有网络io发送的时候回调函数将对应的事件加入rdlist中，epoll只需要判断rdlist是不是空即可。
  - 自建epoll管理连接状态
  - 自建内存池，提高buffer性能
  - 支持批量系统命令调用
  - 协程池
  - 多种交互模式（双向streaming，Oneway）
  - 协议扩展
- 通过netpoll模型，实现G1在M上进行IO操作时，将G1移到epoll监听中，M继续执行P上其他可执行的G2，刚才那个阻塞G1IO调用结束后，再加回到P的队列中或Global队列中。实现以同步的模式写异步逻辑。

### java gc

- 将内存划分成region，每个region表示eden，survivor，old，huge。跟踪各个region垃圾回收价值，维护优先级列表，避免在整个堆中进行垃圾回收。
- region间是复制算法
- 可预测停顿时间的模型
- Eden younggc stw, 45%, 并发标记，混合回收，fullgc。

### 调优

- 减少string与byte[]转换。
- 少量小本文+，大量小文本strings.Join()，大量大文本bytes.Buffer。

### java性能

- 堆外内存
- kwaibook春节笔记
- sandbox笔记

go kitex

性能分析 golang课程

匹配

网关

redis

