---
title: golang笔记
date: 2015-09-01 23:49:37
tags:
  - 笔记
id: golang-summary
categories:
  - 笔记
---

## go gc

- 开始标记：STW，开启写屏障，统计root对象。
- 三色标记：扫描root对象，包括全局指针和G栈上的，扫描G栈时G栈需要暂停。root标记灰色，没引用标记黑色，有引用标记黑色并把引用标记灰色，直到灰色队列为空。与用户程序并行。
- 重新扫描：STW，因为上一步并行，可能重新分配对象和赋值，通过写屏障记录下来。
- 回收白色对象
- 写屏障：记录第一次扫描时对象的状态，和第二次比对，引用状态变化的对象标记灰色，继续处理。

<!--more-->

## metux

- CAS获取锁，成功则返回
- 判断是否可进入自旋，1当前锁非饥饿且已锁定，2次数小于4，3cpu>1，4正在执行中，且队列空闲的P大于0。进入自旋会执行30次PAUSE指令。
- 自旋结束后判断当前锁的状态，饥饿模式下不会去请求锁，而会将goroutine加入队列末端。
- 自旋后CAS获取锁，成功则返回。失败则休眠当前goroutine，等待信号量唤醒。
- goroutine被唤醒后会判断是否饥饿模式（锁等待超过1ms就会进入饥饿状态），饥饿状态下获得互斥锁，如果锁等待队列中只有当前goroutine则取消饥饿状态，如果判断是正常模式，设置唤醒，重置迭代次数并重新获取锁。
- 解锁没有绑定关系，可以一个goroutine锁定，另一个goroutine解锁。
- 解锁，atomic修改锁状态，如果设置后等待锁的goroutine为0则返回，不为0说明还有其他goroutine在等待锁。
- 饥饿模式下，直接将锁交给下一个等待的goroutine，不会退出饥饿模式。
- 正常模式下，判断有没有等待者，或者goroutine已被唤醒或处于锁定。唤醒等待者并移交锁。
- 读锁：
  - 加锁：原子方法将正在读的加1，返回负数，说明有其他写锁，等待。
  - 解锁：正在读的减1，返回负数，说明有在等待的写操作，唤醒写操作
- 写锁：
  - 加锁：调用互斥锁lock，获得互斥锁，将在读goroutine数设置为负值，阻塞后续读操作，如果仍然有在读的锁持有，等待读锁完成后唤醒。
  - 解锁：恢复之前写入的负数，循环唤醒当前等待的读操作。
- sync.Once实现原理，用一个atomic变量判断函数是否已执行，如果执行过则不执行，如果未执行则尝试执行，可能多个goroutine同时尝试，加锁操作，获取锁后再检测上面的变量是否已执行，这里采用双重检测机制，执行完方法后，设置atomic变量。基本就是单例的原理。

## kitex

- 公司开源的RPC框架，[github](https://github.com/cloudwego/kitex)
- 底层网络基于Netpoll实现，kite基于golang的net实现，BIO，每个连接都需要一个goroutine，大量连接时，上下文切换开销。
- Netpoll基于epoll实现，epoll是linux提供的多路复用网络IO模型，TCP读写都是通过缓冲区来实现的，操作系统为每个tcp连接维护读、写缓冲区。epoll基于监听读写缓冲区事件来实现对网络连接的读写和管理。epoll通过红黑树实现对fd(文件描述符)的高效查找，为每个监听的网络io向操作系统注册回调函数，有网络io发送的时候回调函数将对应的事件加入rdlist中，epoll只需要判断rdlist是不是空即可。
  - 自建epoll管理连接状态
  - 自建内存池，提高buffer性能
  - 支持批量系统命令调用
  - 协程池
  - 多种交互模式（双向streaming，Oneway）
  - 协议扩展
- 通过netpoll模型，实现G1在M上进行IO操作时，将G1移到epoll监听中，M继续执行P上其他可执行的G2，刚才那个阻塞G1IO调用结束后，再加回到P的队列中或Global队列中。实现以同步的模式写异步逻辑。

## java gc

- 将内存划分成region，每个region表示eden，survivor，old，huge。跟踪各个region垃圾回收价值，维护优先级列表，避免在整个堆中进行垃圾回收。
- region间是复制算法
- 可预测停顿时间的模型
- Eden younggc stw, 45%, 并发标记，混合回收，fullgc。

## 调优

- 减少string与byte[]转换。
- 文本连接用strings.Builder，和bytes.Buffer比起来底层没有内存分配和拷贝，是byte slice结构到string结构的转换。
- 同java一样，slice和map预分配空间，减少内存拷贝，map还可减少rehash。
- 函数中尽可能使用值而不是指针，这可能会和大家常听到的用指针避免对象的拷贝矛盾，主要是因为指针会使逃逸分析将变量分配在堆上。这个规则同样适用于函数的recv，指针仅仅应该表示可修改权。slice类型如非必要不要包含指针。但是channel传递的对象，无论指针还是值都会把对象分配到堆上，直接传指针就行。
- map尽量存值而不是指针。
- 使用sync.Pool优化内存，适用短周期小内存对象，必须清楚对象的生命周期。放入pool前先置0。
- 不带缓冲区的channel不发生内存拷贝。
- atomic优化。

## pprof

- Cpu/heap/goroutine/mutex/block/thread
- top/source/flame graph
- trace，mmu可以查看用户程序cpu时间占比，确定gc是否耗时过长。
- Cpu top视图和web视图
  - flat函数自身耗时和占比
  - cum函数自身及其调用其他总耗时及占比
  - list根据制定的正则查找代码，显示每行时间占比
- heap
  - 同上类似 source视图查看每行代码内存情况
  - 累计和当前持有的对象数和大小
- goroutine
  - 火焰图查看
- mutex
  - 可查看锁耗时的具体情况，以及代码
- block
  - pprof中一些过小的调用节点可能不会展示，block中可能能看到的具体信息小于count计数
- 采样原理
  - cpu。进程开始采样，向操作系统启动定时器，操作系统每隔10ms向进程发送一次信号，进程收到信号，记录调用堆栈。进程会启动写缓冲的goroutine，每隔100ms将堆栈信息写入输出流，采样停止时，停止计时器，写缓冲结束输出。
  - goroutine和threadcreate。StopTheWorld->遍历用户发起的goroutine/m列表->输出创建g/m的堆栈->StartTheWorld。
  - heap。只能采样堆内存，每分配512K记录一次，记录分配情况和释放情况，可以算出当前使用情况。
  - metux/block。采样抢锁/阻塞操作次数和耗时，超过阈值才会记录。发生的时候上报时间和堆栈信息上报profiler，profiler根据策略进行一些丢弃和统计。

## 缓存

- Fetcher,BatchFetcher,Loader,BatchLoader.
- 回源(Loader)要保证安全，避免缓存击穿时引发雪崩。
  - singleflight：锁加共享。
  - 多级缓存。
- 缓存穿透：不存在的数据要缓存。
- 缓存击穿：某一瞬间缓存失效，大量请求落到db上。
- 缓存策略：
  - 缓存优先：缓存命中返回。miss->回源->更新缓存->返回。
  - 回源优先（兜底）：回源成功->更新缓存->返回结果。回源失败->缓存->命中返回，未命中返回失败。
  - 缓存优先，同步回源，回源失败逻辑过期数据兜底：缓存命中返回。缓存miss->回源成功->更新缓存->返回，回源失败->逻辑过期数据返回，逻辑数据失败->返回失败。
  - 缓存优先，过期数据兜底，异步回源：缓存命中返回。缓存miss->逻辑过期数据->返回->异步回源->更新缓存。缓存miss->逻辑过期数据失败->同步回源->更新缓存->返回结果。
  - 只读缓存：只从缓存中读数据，有其他方式更新缓存，一般是全量缓存。
  - 只回源：缓存降级。
- 字节缓存：map<int64, []byte> 不包含指针，加速GC。对象缓存：map<string, interface{}>包含指针。
- 大key，10K或5000个元素。

## java性能

- 堆外内存
- kwaibook春节笔记
- 缓存击穿：json反序列化和序列化性能，缓存失效后，读db前先加锁，本地缓存，拆除大key

- sandbox笔记

## 匹配

- open match有三个微服务，frontend，director，MMF。
- 简化了微服务的数量，可以在单个服务器运行，也可以在集群运行。
- 通过动态配置，方便不同项目组动态接入匹配模式。
- 支持一个游戏运行多个匹配模式，同一玩家可以同时匹配多个模式。
- 每个匹配模式对应一个匹配算法，如先来先匹配-斗地主，同城匹配。
- 支持了RPC和RMQ返回匹配结果。
- 匹配流程，gameserver创建ticket，发送给匹配服放入ticketpool中。匹配服务会定时从池中取出ticket，mmf算法会选取合适的ticket匹配，创建match。match创建进一步进行过滤，去除重复匹配的票，删除异常的match，最后将结果通知gameserver，删除ticket。
- 按elo分数组队，

## Redis

- https://www.jianshu.com/p/125bba448cdd
- [一个简单请求如何被处理](https://cbsheng.github.io/posts/redis里一个简单请求如何被处理/)
- IO多路复用，监听端口6379，socket封装成事件，注册到事件循环器里，还有回调函数。client新连接建立时，回调函数accept，返回一个FD，也注册进事件循环器里。这样之后client发送请求时，FD可读，事件循环器捕获到事件并调用对应的函数。
- 每个连接都是client对象，存储命令，输入/出缓冲区。
- 事件循环器拿到就绪事件的文件描述符后，判断可读还是可写，调用对应的回调函数。
- 数据结构
  - stirng： int、embstr、raw。不能用c++string来代替，c++string不支持预分配
  - List：ziplist、linkedlist
  - hash：ziplist、hashtable
  - set：intset、hashtable
  - zset：ziplist、skiplist+table
  - hash实现：sizemask=size-1，链地址头插法，rehash

## Limiter

- 滑动窗口：redis指令，ZREMRANGEBYSCORE上个窗口前的值，ZCARD查看当前值，判断和want是否限流，不限流的话，ZADD(timestamp, timestamp+i)，设置过期时间，返回当前ZCARD数。
- 固定窗口：根据时间封装key，可以是一些多维的参数key，incr方法返回判断是否限流，设置过期时间。

~~性能分析 golang课程~~

~~匹配 p5 elo~~

~~网关~~

tcp、kcp

https://zhuanlan.zhihu.com/p/388704023

##### redis：

https://segmentfault.com/a/1190000040206818

https://zhuanlan.zhihu.com/p/148562122

https://www.jianshu.com/p/125bba448cdd

[https://cbsheng.github.io/posts/redis%e9%87%8c%e4%b8%80%e4%b8%aa%e7%ae%80%e5%8d%95%e8%af%b7%e6%b1%82%e5%a6%82%e4%bd%95%e8%a2%ab%e5%a4%84%e7%90%86/](https://cbsheng.github.io/posts/redis里一个简单请求如何被处理/)

java锁流程，读写锁，延迟队列。

java自带排序，blog

mysql，blog

https://mp.weixin.qq.com/s?__biz=MzUxNTQyOTIxNA==&mid=2247484041&idx=1&sn=76d3bf1772f9e3c796ad3d8a089220fa&chksm=f9b784b8cec00dae3d52318f6cb2bdee39ad975bf79469b72a499ceca1c5d57db5cbbef914ea&token=2025456560&lang=zh_CN#rd

https://blog.csdn.net/ibigboy/article/details/104571930?depth_1-

http://blog.codinglabs.org/articles/theory-of-mysql-index.html

mongo

https://www.infoq.cn/article/tencent-ranking-system-practice-and-challenges
