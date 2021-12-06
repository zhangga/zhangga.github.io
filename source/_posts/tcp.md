---
title: TCP/UDP
date: 2021-09-08 22:35:25
tags:
  - 网络
  - 面试
id: tcp
categories:
  - 笔记
---

## TCP常见面试题

[TCP](https://zhuanlan.zhihu.com/p/388704023)

#### TCP协议问题

- 连接
  - 三次握手
    - 费时：4G网络(3*100ms)
    - 费力：3个数据包
    - 优化：[TCP Fast Open](https://zh.wikipedia.org/zh/TCP快速打开)
  - 半连接(初始化连接SYN超时)
    - 耗费网络资源：5次重发SYN-ACK包
    - 耗费服务器资源：63秒后断开连接(TIME_WAIT = 2*MSL)
    - 易被攻击：[SYN flood拒绝服务攻击](https://www.jianshu.com/p/6eae45826754)

<!--more-->

- 断开

  - TIME_WAIT状态
    - 2*MSL：sudo sysctl -a | grep time_wait
    - 服务器：TIME_WAIT连接，占用机器的内存资源
    - 客户端：TIME_WAIT连接，占用TCP协议的端口
  - 优化
    - 连接本机服务，首选UNIX域套接字，[提高通信效率](https://jaminzhang.github.io/network/the-difference-between-unix-domain-socket-and-tcp-ip-socket/)，也避免浪费TCP端口
    - 加快回收：sudo sysctl -w net.ipv4.tcp_tw_recycle = 1
    - 连接复用：sudo sysctl -w net.ipv4.tcp_tw_reuse = 1

- 传输

  - 保序机制：流式交付，前序包阻塞
  - 确认机制：
    - 延迟确认：滑动窗口停等，降低吞吐率
    - 快速确认：消耗带宽
    - 优化：快速确认和延迟确认两种模式自动切换
  - 超时重传：
    - 默认：必须等待RTO(Retransmission TimeOut )超时，不能快速响应当前网络状况
    - 每次RTO超时导致重传后，RTO值翻倍，一直尝试tcp_retries2次重传
    - 优化：[快速重传](https://zhuanlan.zhihu.com/p/25596865)（收到3个重复的ACK即开始重传）
  - 重传数量：
    - 默认：发送方重传收到的ACK之后所有已发送的数据包，浪费带宽
    - 优化：[选择确认](https://zhuanlan.zhihu.com/p/25596865)（只重传SACK中缺少的数据包）

- 流量控制：

  - 糊涂窗口综合症

    ：接收方每次只处理小包，或者发送方一直发送小包

    - 优化：[David D Clark算法（接收端）；Nagle算法（发送端）](https://zh.wikipedia.org/wiki/传输控制协议)（默认打开）

  - Nagle算法 + 延迟确认

    ：Http Server中Write-Write-Read模式下的40ms延迟

    - 优化：设置TCP_NODELAY选项，禁用Nagle算法

- 拥塞控制（Reno算法）：

  - 概念：
    - RTT（Round Trip Time）：往返时间（从数据包发出到收到ACK的时间）
    - RTO（Retransmission Time）：重传时间（根据RTT动态调整，作为重传定时器的超时时间，收到ACK后重置连接的重传定时器）
  - 慢启动（指数增长）
    - 每个RTT内，cwnd随收到的ACK线性自增；每个RTT后，cwnd翻倍增长
    - 丢包，或者cwnd超过慢启动门限ssthresh：进入拥塞避免阶段
  - 拥塞避免（退半避让，线性增长）
    - 丢包
      - RTO超时：ssthresh降为cwnd/2，cwnd降为1，重新进入慢启动过程
      - 3个重复ACK：进入快速重传阶段
    - cwnd超过ssthresh：
      - 每个RTT内，cwnd随收到的ACK增长1/cwnd个MSS；每个RTT后，cwnd增长1个MSS
  - 快速重传
    - ssthresh降为cwnd/2，cwnd降为ssthresh，进入快速恢复阶段
  - 快速恢复
    - cwnd设置为ssthresh+3，重传重复ACK指定的数据包
    - 收到重复ACK：cwnd自增
    - 收到新的非重复ACK：cwnd置为快速重传阶段的初始ssthresh，进入拥塞避免阶段

#### TCP 协议调优

- setsockopt
  - SOL_SOCKET

- ```
  SO_KEEPALIVE：TCP心跳（生效与否还取决于tcp_keepalive_xxx）
  
  SO_LINGER：设置close行为（FIN or RST，TIME_WAIT or not）
  
  SO_RCVBUF：设置接收缓存，覆盖tcp_rmem
  
  SO_SNDBUF：设置发送缓存，覆盖tcp_wmem
  
  SO_REUSERADDR：设置地址重用
  
      1. 多块网卡多个地址，通配符bind
  
      2. 重用处于TIME_WAIT状态的socket地址
  ```

  IPPROTO_TCP

- ```
  TCP_NODELAY：禁用Nagle算法，减少发送延时
  
  TCP_DEFER_ACCEPT：减少一次握手（仅限于Linux系统之间）
  ```

  握手

  - ```
    net.ipv4.tcp_syn_retries：客户端请求连接syn重试次数
    
    net.ipv4.tcp_synack_retries：服务器回复syn+ack重试次数
    ```

    半连接队列

  - ```
    半连接队列溢出：
    
    netstat -s | grep LISTEN
    
    4375 SYNs to LISTEN sockets dropped
    
    
    
    半连接队列调优：
    
    net.ipv4.tcp_max_syn_backlog：SYN队列长度
    
    net.ipv4.tcp_syncookies：SYN队列溢出时向对方发送syncookies，防范SYNFlood攻击
    ```

    全连接队列

- ```
  全连接队列溢出：
  
  netstat -s | grep listen
  
  22438 times the listen queue of a socket overflowed
  
  
  
  全连接队列调优：
  
  net.core.somaxcon：同listen()的backlog共同决定accept队列长度:min(backlog,somaxconn) 
  
  net.ipv4.tcp_abort_on_overflow：accept队列溢出的处理方式
  
      默认关闭：服务器accept队列溢出后，直接丢弃客户端的ACK。待RTO超时后，重发SYN+ACK给客户端（不超过net.ipv4.tcp_synack_retries次）。
  
      打开该选项：服务器accept队列溢出后，直接发送RST给客户端（connection reset by peer）。
  ```

  缓存

- ```
  net.ipv4.tcp_wmem：发送缓存
  
  net.ipv4.tcp_rmem：接收缓存
  
  net.ipv4.tcp_moderate_rcvbuf：接收缓存自动伸缩
  ```

  心跳

- ```
  net.ipv4.tcp_keepalive_time：正常心跳间隔
  
  net.ipv4.tcp_keepalive_intvl：失败重试间隔
  
  net.ipv4.tcp_keepalive_probes：失败重试次数
  ```

  TIME_WAIT

- ```
  net.ipv4.tcp_max_tw_buckets：处于TIME_WAIT状态的socket数上限
  
  net.ipv4.tcp_tw_recycle：是否尽快回收TIME_WAIT状态的socket
  
  net.ipv4.tcp_tw_reuse：是否尽量重用TIME_WAIT状态的socket
  
  net.netfilter.nf_conntrack_tcp_timeout_time_wait：socket处于TIME_WAIT状态的时间
  ```

  其他

```
net.ipv4.tcp_fin_timeout：连接主动断开方等待对端FIN包的最大时间

net.ipv4.tcp_sack：选择ACK开关

net.ipv4.tcp_timestamps：TCP时间戳开关（在TCP包头增加12个字节，能够识别超时重发包，计算RTT更精确）
```

#### UDP

##### 优点

- 速度快
  - 跨运营商网络的情况下，UDP有可能比TCP块120倍
- 穿越强
  - [UDP 打洞](https://zh.wikipedia.org/wiki/UDP打洞)

##### 缺点

- 传输不可靠
  - 应用层要设计[ARQ协议](https://zh.wikipedia.org/wiki/自动重传请求)，应对丢包
- 需要考虑数据包大小
  - 应用层要规划数据包大小，避免IP层分片影响传输效率
  - 应用层MTU多大合适？
    - UDP包数据段：2^16-1-8-20=65507
    - 局域网（Ethernet）：1500-8-20=1472
    - 广域网（Internet）：576-8-20=548
    - 游戏常用，便于记忆：500
- 简单模型低效，高性能编程复杂
