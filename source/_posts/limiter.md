---
title: 服务流控方案总结
date: 2020-12-26 14:09:12
tags:
  - 笔记
id: limiter
categories:
  - 笔记
---

转载自：https://developer.aliyun.com/article/765912

### 一 流控的场景

流控的意义其实无需多言了。最常用的场景下，流控是为了保护下游有限的资源不被流量冲垮，保证服务的可用性，一般允许流控的阈值有一定的弹性，偶尔的超量访问是可以接受的。

有的时候，流控服务于收费模式，比如某些云厂商会对调用 API 的频次进行计费。既然涉及到钱，一般就不允许有超出阈值的调用量。

这些不同的场景下，适用的流控算法不尽相同。大多数情况下，使用 Sentinel 中间件已经能很好地应对，但 Sentinel 也并不是万能的，需要思考其他的流控方案。

### 二 接口定义

为了方便，以下所有的示例代码实现都是基于 Throttler 接口。

Throttler 接口定义了一个通用的方法用于申请单个配额。

当然你也可以定义一个 tryAcquire(String key, int permits) 签名的方法用于一次申请多个配额，实现的思路是一样的。

有些流控算法需要为每个 key 维护一个 Throttler 实例。

```
public interface Throttler {
    /**
     * 尝试申请一个配额
     *
     * @param key     申请配额的key
     * @return 申请成功则返回true，否则返回false
     */
    boolean tryAcquire(String key);
}
```

### 三 单机流控

#### 1 简单窗口

> 简单窗口是我自己的命名，有些地方也叫做固定窗口，主要是为了跟后面的滑动窗口区分。

流控是为了限制指定时间间隔内能够允许的访问量，因此，最直观的思路就是基于一个给定的时间窗口，维护一个计数器用于统计访问次数，然后实现以下规则：

- 如果访问次数小于阈值，则代表允许访问，访问次数 +1。
- 如果访问次数超出阈值，则限制访问，访问次数不增。
- 如果超过了时间窗口，计数器清零，并重置清零后的首次成功访问时间为当前时间。这样就确保计数器统计的是最近一个窗口的访问量。

**代码实现 SimpleWindowThrottler**

```
/**
 * 毫秒为单位的时间窗口
 */
private final long windowInMs;
/**
 * 时间窗口内最大允许的阈值
 */
private final int threshold;
/**
 * 最后一次成功请求时间
 */
private long lastReqTime = System.currentTimeMillis();
/**
 * 计数器
 */
private long counter;

public boolean tryAcquire(String key) {
    long now = System.currentTimeMillis();
    // 如果当前时间已经超过了上一次访问时间开始的时间窗口，重置计数器，以当前时间作为新窗口的起始值
    if (now - lastReqTime > windowInMs) {       #1
        counter = 0;
        lastReqTime = now;                  #2
    }
    if (counter < threshold) {                  #3
        counter++;                          #4
        return true;
    } else {
        return false;
    }
}
```

另外一种常见的场景是根据不同的 key 来做流控，每个 key 有单独的时间窗口、阈值配置，因此需要为每个 key 维护一个单独的限流器实例。

**切换到多线程环境**
在现实应用中，往往是多个线程来同时申请配额，为了比较简洁地表达算法思路，示例代码里面都没有做并发同步控制。

以简单窗口的实现为例，要转换为多线程安全的流控算法，一种直接的办法是将 tryAcquire 方法设置为 synchronized。

当然一种感觉上更高效的办法也可以是修改读写变量的类型：

```
private volatile long lastReqTime = System.currentTimeMillis();
private LongAdder counter = new LongAdder();
```

不过这样其实并不真正“安全”，设想以下的场景，两个线程 A、线程 B 前后脚尝试获取配额，#1 位置的判断条件满足后，会同时走到 #2 位置修改 lastReqTime 值，线程 B 的赋值会覆盖线程 A，导致时间窗口起始点向后偏移。同样的，位置 #3 和 #4 也会构成竞争条件。当然如果对流控的精度要求不高，这种竞争也是能接受的。

**临界突变问题**

简单窗口的流控实现非常简单，以 1 分钟允许 100 次访问为例，如果流量均匀保持 200 次/分钟的访问速率，系统的访问量曲线大概是这样的（按分钟清零）：

![image.png](https://ucc.alicdn.com/pic/developer-ecology/55c271e1437d49e2822a5f3114659474.png)

但如果流量并不均匀，假设在时间窗口开始时刻 0:00 有几次零星的访问，一直到 0:50 时刻，开始以 10 次/秒的速度请求，就会出现这样的访问量图线：

![image.png](https://ucc.alicdn.com/pic/developer-ecology/71496c33553043328fd24f9e6c58a352.png)

在临界的 20 秒内（0:50~1:10）系统承受的实际访问量是 200 次，换句话说，最坏的情况下，在窗口临界点附近系统会承受 2 倍的流量冲击，这就是简单窗口不能解决的临界突变问题。

#### 2 滑动窗口

如何解决简单窗口算法的临界突变问题？既然一个窗口统计的精度低，那么可以把整个大的时间窗口切分成更细粒度的子窗口，每个子窗口独立统计。同时，每过一个子窗口大小的时间，就向右滑动一个子窗口。这就是滑动窗口算法的思路。

![image.png](https://ucc.alicdn.com/pic/developer-ecology/64e7d74023a84b75a17fc320b152fa27.png)

如上图所示，将一分钟的时间窗口切分成 6 个子窗口，每个子窗口维护一个独立的计数器用于统计 10 秒内的访问量，每经过 10s，时间窗口向右滑动一格。

回到简单窗口出现临界跳变的例子，结合上面的图再看滑动窗口如何消除临界突变。如果 0:50 到 1:00 时刻（对应灰色的格子）进来了 100 次请求，接下来 1:00~1:10 的 100 次请求会落到黄色的格子中，由于算法统计的是 6 个子窗口的访问量总和，这时候总和超过设定的阈值 100，就会拒绝后面的这 100 次请求。

**代码实现（参考 Sentinel）**

Sentinel 提供了一个轻量高性能的滑动窗口流控算法实现，看代码的时候可以重点关注这几个类：

1）功能插槽 StatisticSlot 负责记录、统计不同纬度的 runtime 指标监控信息，例如 RT、QPS 等。

Sentinel 内部使用了 slot chain 的责任链设计模式，每个功能插槽 slot 有不同的功能（限流、降级、系统保护），通过 ProcessorSlotChain 串联在一起。

参考官方 Wiki：
https://github.com/alibaba/Sentinel/wiki/Sentinel工作主流程

2）StatisticSlot 使用 StatisticNode#addPassRequest 记录允许的请求数，包含秒和分钟两个维度。

3）具体记录用到的是 Metric 接口，对应实现类 ArrayMetric，背后真正的滑动窗口数据结构是 LeapArray 。

4）LeapArray 内部维护了滑动窗口用到的关键属性和结构，包括：

a）总窗口大小 intervalInMs，滑动子窗口大小 windowLengthInMs，采样数量sampleCount：

sampleCount = intervalInMs / windowLengthInMs

当前实现默认为 2，而总窗口大小默认是 1s，也就意味着默认的滑动窗口大小是 500ms。可以通过调整采样数量来调整统计的精度。

b）滑动窗口的数组 array，数组中每个元素以 WindowWrap 表示，其中包含：

- windowStart：滑动窗口的开始时间。
- windowLength：滑动窗口的长度。
- value：滑动窗口记录的内容，泛型表示，关键的一类就是 MetricBucket，里面包含了一组 LongAdder 用于记录不同类型的数据，例如请求通过数、请求阻塞数、请求异常数等等。

记录请求的逻辑说白了，就是根据当前时间获取所属的滑动窗口，然后将该窗口的统计值 +1 即可。但实际上，获取当前所属的时间窗口这一步隐含了不少细节，详细的实现可以从 LeapArray#currentWindow 中找到，源码的注释写得很详细，这里就不多提了。

这里借助一张其他同学画的图表述以上的流程：

![image.png](https://ucc.alicdn.com/pic/developer-ecology/94326f15088f4750acd811ec75b43252.png)

以上的流程基于 3.9.21 版本的源码，早先版本的 Sentinel 内部版本实现不尽相同，使用了一个叫 SentinelRollingNumber 的数据结构，但原理是类似的。

**精度问题**

现在思考这么一个问题：滑动窗口算法能否精准地控制任意给定时间窗口 T 内的访问量不大于 N？

答案是否定的，还是将 1 分钟分成 6 个 10 秒大小的子窗口的例子，假设请求的速率现在是 20 次/秒，从 0:05 时刻开始进入，那么在 0:05~0:10 时间段内会放进 100 个请求，同时接下来的请求都会被限流，直到 1:00 时刻窗口滑动，在 1:00~1:05 时刻继续放进 100 个请求。如果把 0:05~1:05 看作是 1 分钟的时间窗口，那么这个窗口内实际的请求量是 200，超出了给定的阈值 100。

如果要追求更高的精度，理论上只需要把滑动窗口切分得更细。像 Sentinel 中就可以通过修改单位时间内的采样数量 sampleCount 值来设置精度，这个值一般根据业务的需求来定，以达到在精度和内存消耗之间的平衡。

**平滑度问题**

使用滑动窗口算法限制流量时，我们经常会看到像下面一样的流量曲线。

![image.png](https://ucc.alicdn.com/pic/developer-ecology/d80a395b5cb24ca59f2b97d4fb55893e.png)

突发的大流量在窗口开始不久就直接把限流的阈值打满，导致剩余的窗口内所有请求都无法通过。在时间窗口的单位比较大时（例如以分为单位进行流控），这种问题的影响就比较大了。在实际应用中我们要的限流效果往往不是把流量一下子掐断，而是让流量平滑地进入系统当中。

#### 3 漏桶

滑动窗口无法很好地解决平滑度问题，再回过头看我们对于平滑度的诉求，当流量超过一定范围后，我们想要的效果不是一下子切断流量，而是将流量控制在系统能承受的一定的速度内。假设平均访问速率为 v, 那我们要做的流控其实是流速控制，即控制平均访问速率 v ≤ N / T。

在网络通信中常常用到漏桶算法来实现流量整形。漏桶算法的思路就是基于流速来做控制。想象一下上学时经常做的水池一边抽水一边注水的应用题，把水池换成水桶（还是底下有洞一注水就开始漏的那种），把请求看作是往桶里注水，桶底漏出的水代表离开缓冲区被服务器处理的请求，桶口溢出的水代表被丢弃的请求。在概念上类比：

- 最大允许请求数 N：桶的大小
- 时间窗口大小 T：一整桶水漏完的时间
- 最大访问速率 V：一整桶水漏完的速度，即 N/T
- 请求被限流：桶注水的速度比漏水的速度快，最终导致桶内水溢出

假设起始时刻桶是空的，每次访问都会往桶里注入一单位体积的水量，那么当我们以小于等于 N/T 的速度往桶里注水时，桶内的水就永远不会溢出。反之，一旦实际注水速度超过漏水速度，桶里就会产生越来越多的积水，直到溢出为止。同时漏水的速度永远被控制在 N/T 以内，这就实现了平滑流量的目的。

漏桶算法的访问速率曲线如下：
![image.png](https://ucc.alicdn.com/pic/developer-ecology/68127312b88a4bb3ac0b4a1caf297f6c.png)

附上一张网上常见的漏桶算法原题图：

![image.png](https://ucc.alicdn.com/pic/developer-ecology/1299847fdcb042289fa10067ab074949.png)

**代码实现 LeakyBucketThrottler**

```
/**
 * 当前桶内剩余的水
 */
private long left;
/**
 * 上次成功注水的时间戳
 */
private long lastInjectTime = System.currentTimeMillis();
/**
 * 桶的容量
 */
private long capacity;
/**
 * 一桶水漏完的时间
 */
private long duration;
/**
 * 桶漏水的速度，即 capacity / duration
 */
private double velocity;

public boolean tryAcquire(String key) {
    long now = System.currentTimeMillis();
    // 当前剩余的水 = 之前的剩余水量 - 过去这段时间内漏掉的水量
    // 过去这段时间内漏掉的水量 = (当前时间-上次注水时间) * 漏水速度
    // 如果当前时间相比上次注水时间相隔太久（一直没有注水），桶内的剩余水量就是0（漏完了）
    left = Math.max(0, left - (long)((now - lastInjectTime) * velocity));
    // 往当前水量基础上注一单位水，只要没有溢出就代表可以访问
    if (left + 1 <= capacity) {
        lastInjectTime = now;
        left++;
        return true;
    } else {
        return false;
    }
}
```

**漏桶的问题**

漏桶的优势在于能够平滑流量，如果流量不是均匀的，那么漏桶算法与滑动窗口算法一样无法做到真正的精确控制。极端情况下，漏桶在时间窗口 T 内也会放进相当于 2 倍阈值 N 的流量。

设想一下，如果访问量相比窗口大小 N 大很多，在窗口（0~T）一开始的 0 时刻就直接涌进来，使得漏桶在时间 t（ 0≈t

虽然可以通过限制桶大小的方式使得访问量控制在 N 以内，但这样做的副作用是流量在还未达到限制条件就被禁止。

还有一个隐含的约束是，漏桶漏水的速度最好是一个整数值（即容量 N 能够整除时间窗口大小 T ），否则在计算剩余水量时会有些许误差。

#### 4 令牌桶

漏桶模型中，请求来了是往桶里注水，如果反一下，把请求放行变成从桶里抽水，对应的，把注水看作是补充系统可承受流量的话，漏桶模型就变成了令牌桶模型。

理解漏桶之后，再看令牌桶就很简单了，抄一段令牌桶的原理：

> 令牌桶算法的原理是系统以恒定的速率产生令牌，然后把令牌放到令牌桶中，令牌桶有一个容量，当令牌桶满了的时候，再向其中放令牌，那么多余的令牌会被丢弃；当想要处理一个请求的时候，需要从令牌桶中取出一个令牌，如果此时令牌桶中没有令牌，那么则拒绝该请求。

![image.png](https://ucc.alicdn.com/pic/developer-ecology/c17f0f04ac0642cd8764e477b0880e26.png)

**代码实现 TokenBucketThrottler**

令牌桶与漏桶本质上是一样的，因此漏桶的代码稍微改下就可以变成令牌桶。

```
long now = System.currentTimeMillis();
left = Math.min(capacity, left + (long)((now - lastInjectTime) * velocity));
if (left - 1 > 0) {
    lastInjectTime = now;
    left--;
    return true;
} else {
    return false;
}
```

生产环境中使用令牌桶的话，可以考虑借助 Guava 中提供的 RateLimiter。它的实现是多线程安全的，调用 RateLimiter#acquire 时，如果剩余令牌不足，会阻塞线程一段时间直至有足够的可用令牌（而不是直接拒绝，这在某些场景下很有用）。除去默认的 SmoothBursty 策略外，RateLimiter 还提供了一种叫 SmoothWarmingUp 的策略，支持设置一个热身期，热身期内，RateLimiter 会平滑地将放令牌的速率加大，直致最大速率。设计这个的意图是为了满足那种资源提供方需要热身时间，而不是每次访问都能提供稳定速率的服务的情况(比如带缓存服务，需要定期刷新缓存) 。RateLimiter 有一个缺点是只支持 QPS 级别。

**漏桶、令牌桶的区别**

虽然两者本质上只是反转了一下，不过在实际使用中，适用的场景稍有差别：

1）漏桶：用于控制网络中的速率。在该算法中，输入速率可以变化，但输出速率保持恒定。常常配合一个 FIFO 队列使用。

想象一下，漏桶的破洞是固定大小的，因此漏水的速率是可以保持恒定的。

2）令牌桶：按照固定速率往桶中添加令牌，允许输出速率根据突发大小而变化。

举个例子，一个系统限制 60 秒内的最大访问量是 60 次，换算速率是 1 次/秒，如果在一段时间内没有访问量，那么对漏桶而言此刻是空的。现在，一瞬间涌入 60 个请求，那么流量整形后，漏桶会以每秒 1 个请求的速度，花上 1 分钟将 60 个请求漏给下游。换成令牌桶的话，则是从令牌桶中一次性取走 60 个令牌，一下子塞给下游。

#### 5 滑动日志

一般情况下，上述的算法已经能很好地用于大部分实际应用场景了，很少有场景需要真正完全精确的控制（即任意给定时间窗口T内请求量不大于 N ）。如果要精确控制的话，我们需要记录每一次用户请求日志，当每次流控判断时，取出最近时间窗口内的日志数，看是否大于流控阈值。这就是滑动日志的算法思路。

设想某一个时刻 t 有一个请求，要判断是否允许，我们要看的其实是过去 t - N 时间段内是否有大于等于 N 个请求被放行，因此只要系统维护一个队列 q，里面记录每一个请求的时间，理论上就可以计算出从 t - N 时刻开始的请求数。

考虑到只需关心当前时间之前最长 T 时间内的记录，因此队列 q 的长度可以动态变化，并且队列中最多只记录 N 条访问，因此队列长度的最大值为 N。

> 滑动日志与滑动窗口非常像，区别在于滑动日志的滑动是根据日志记录的时间做动态滑动，而滑动窗口是根据子窗口的大小，以子窗口维度滑动。

**伪代码实现**

算法的伪代码表示如下：

```
# 初始化
counter = 0
q = []

# 请求处理流程
# 1.找到队列中第一个时间戳>=t-T的请求，即以当前时间t截止的时间窗口T内的最早请求
t = now
start = findWindowStart(q, t)

# 2.截断队列，只保留最近T时间窗口内的记录和计数值
q = q[start, q.length - 1] 
counter -= start

# 3.判断是否放行，如果允许放行则将这次请求加到队列 q 的末尾
if counter < threshold
    push(q, t)
    counter++
    # 放行
else
    # 限流
```

findWindowStart 的实现依赖于队列 q 使用的数据结构，以简单的数组为例，可以使用二分查找等方式。后面也会看到使用其他数据结构如何实现。

如果用数组实现，一个难点可能是如何截断一个队列，一种可行的思路是使用一组头尾指针 head 和 tail 分别指向数组中最近和最早的有效记录索引来解决， findWindowStart 的实现就变成在 tail 和 head 之间查找对应元素。

**复杂度问题**

虽然算法解决了精确度问题，但代价也是显而易见的。

首先，我们要保存一个长度最大为 N 的队列，这意味着空间复杂度达到 O(N)，如果要针对不同的 key 做流控，那么空间上会占用更多。当然，可以对不活跃 key 的队列进行复用来降低内存消耗。

其次，我们需要在队列中确定时间窗口，即通过 findWindowStart 方法寻找不早于当前时间戳 t - N 的请求记录。以二分查找为例，时间复杂度是 O(logN)。

### 四 分布式流控

现实中的应用服务往往是分布式部署的，如果共用的资源（例如数据库）或者依赖的下游服务有流量限制，那么分布式流控就要派上用场了。

虽然可以给每台应用服务器平均分配流控配额，把问题转换为单机流控，但如果碰到流量不均匀、机器宕机、临时扩缩容等场景，这种做法的效果不佳。

分布式环境下做流控的核心算法思路其实与单机流控是一致的，区别在于需要实现一种同步机制来保证全局配额。同步机制的实现可以有中心化和去中心化两种思路：

1）中心化：配额由一个中心系统统一管控，应用进程通过向中心系统申请的方式获取流控配额。

- 状态的一致性在中心系统维护，实现简单。
- 中心系统节点的不可用会导致流控出错，需要有额外的保护。例如，中心化流控在中心存储不可用时，往往会退化为单机流控。

2）去中心化：应用进程独立保存和维护流控配额状态，集群内周期性异步通讯以保持状态一致。

- 相比中心化方案，去中心化方案能够降低中心化单点可靠性带来的影响，但实现上比较复杂，状态的一致性难以保证。
- 在 CAP 中去中心化更加倾向于 A 而中心化更倾向于 C。

去中心化方案在生产环境中没有见过，因此下文只讨论中心化流控的思路。

#### 1 接入层入口流控

应用接入的网络架构中，在应用服务器之前往往有一层 LVS 或 Nginx 做统一入口，可以在这一层做入口的流控。本质上这就是单机流控的场景。

以 Nginx 为例，Nginx 提供了 ngx_http_limit_req_module 模块用于流控，底层使用的是漏桶算法。

一个 Nginx 流控配置的示例如下，表示每个 IP 地址每秒只能请求 10 次 /login/ 接口。

```
limit_req_zone $binary_remote_addr zone=mylimit:10m rate=10r/s;

server {
    location /login/ {
        limit_req zone=mylimit;

        proxy_pass http://my_upstream;
    }
}
```

Nginx 的流控指令还支持更多配置，比如说配置 limit_req 指令时加上 burst 和 nodelay 参数来允许一定程度的突发，或者结合 geo 和 map 指令来实现黑白名单流控，具体可以参考 Nginx 官方文档：
Rate Limiting with NGINX and NGINX Plus（https://www.nginx.com/blog/rate-limiting-nginx/）。

如果自带的模块不能满足，那就上自定义的 lua 模块吧，参考 OpenResty 提供的 Lua 限流模块 lua-resty-limit-traffic。

#### 2 TokenServer 流控

> 这里借用了 Sentinel 中的 TokenServer 叫法，Sentinel 集群流控的介绍可以参考官方文档：Sentinel集群流控（https://github.com/alibaba/Sentinel/wiki/集群流控）。

这类流控的思路是找一个 TokenServer 来专门来管控流控配额，包括统计总调用量，判断单个请求是否允许等等，应用服务器作为客户端与 TokenServer 通信来获取配额。因为流控的逻辑在 TokenServer 内部统一处理，因此单机流控中讨论的算法同样适用。

很自然地能想到，这类流控非常依赖于 TokenServer 的性能和可用性。

性能方面，单点的 TokenServer 很容易成为瓶颈，查 Sentinel 源码，其中使用了 Netty 来做网络通信，数据包采用自定义格式，其他性能优化能找到的不多。

可用性方面，就像 Sentinel 官方文档中讲的，若在生产环境使用 TokenServer 集群限流，必须要解决以下问题：

Token Server 自动管理、调度（分配/选举 Token Server）

Token Server 高可用，在某个 Server 不可用时自动 failover 到其它机器

目前 Sentinel 的 TokenServer 默认并没有实现这些能力，需要定制或增加其他系统来实现，例如，采用一种分布式一致性协议来做集群选举，或者借助一组 monitor 来监控状态，实现成本还是挺高的。

#### 3 存储式流控

存储式流控的思想是通过一个存储系统来保存流控的计数值等统计信息，应用从存储中获取统计信息，然后将最新的请求信息再写入存储中。存储系统可以选择现成的 MySQL 数据库或者 Redis 缓存等，一般从性能出发选择缓存的比较多。这里选择 Tair 和 Redis 做例子。

**Tair 流控**

比较简单，直接上代码实现。

```
public boolean tryAcquire(String key) {
  // 以秒为单位构建tair的key
  String wrappedKey = wrapKey(key);
  // 每次请求+1，初始值为0，key的有效期设置5s
  Result<Integer> result = tairManager.incr(NAMESPACE, wrappedKey, 1, 0, 5);
  return result.isSuccess() && result.getValue() <= threshold;
}

private String wrapKey(String key) {
  long sec = System.currentTimeMillis() / 1000L;
  return key + ":" + sec;
}
```

是不是感觉太简单了点？得益于 Tair 的高性能，这种方式可以很好地支撑大流量。

这种 Tair 流控的方案实际上用的简单窗口的思路，每个 key 以每秒为一个时间窗口做 QPS 控制（QPM/QPD 原理类似）。关键在于用到了 Tair 的这个 API：

> incr

Result incr(int namespace, Serializable key, int value, int defaultValue, int expireTime)
描述
增加计数。注意：incr 前不要 put！！
参数
namespace - 申请时分配的 namespace
key - key 列表，不超过 1k
value - 增加量
defaultValue - 第一次调用 incr 时的 key 的 count 初始值，第一次返回的值为 defaultValue + value。
expireTime - 数据过期时间，单位为秒，可设相对时间或绝对时间（Unix 时间戳）。expireTime = 0，表示数据永不过期。expireTime > 0，表示设置过期时间。若 expireTime > 当前时间的时间戳，则表示使用绝对时间，否则使用相对时间。expireTime < 0，表示不关注过期时间，若之前设过过期时间，则已之前的过期时间为准，若没有，则作为永不过期处理，但当前 mdb 统一当做永不过期来处理。
返回值
Result 对象，返回值可为负值。当 key 不存在时，第一次返回 defaultValue+ value。后续的 incr 基于该值增加 value。

当然这种方式也有缺点：

- 简单窗口的临界突变问题。
- Tair 的可靠性问题，需要有降级方案。上面其实也说了，中心化的流控一般都需要搭配降级的单机流控。
- 集群机器的时间同步问题。由于生成 key 会用到集群机器的本地时间，因此要求机器时间必须是一致的。

打个比方，不同机器时间稍微差个 10ms，在时间窗口的间隔点上的统计就会产生比较大的误差，比如说在同一时刻，一台机器时间是 0.990，一台是 1.000，两者调用 incr 时操作的 key 不一样，精度自然就会受影响。

**Redis 流控**

Redis 支持丰富的数据结构，性能也不错，其“单进程”模型方便同步控制，因此非常适合用来做分布式流控的存储。

1）简单窗口实现

使用 Redis 实现简单窗口流控的思路跟使用 Tair 是一致的。Redis 也提供了 INCR 命令用于计数，同时 Redis 的“单进程”模型也提供了很好的并发保护。Redis 的官方文档就写了如何使用 INCR 来实现 Rate Limiter，我这里稍作翻译了下：

> Redis INCR key(https://redis.io/commands/incr)

以简单窗口为例，最简单直接的实现如下：

```
FUNCTION LIMIT_API_CALL(ip)
ts = CURRENT_UNIX_TIME()
keyname = ip+":"+ts
current = GET(keyname)
IF current != NULL AND current > 10 THEN
    ERROR "too many requests per second"
ELSE
    MULTI
        INCR(keyname,1)
        EXPIRE(keyname,10)
    EXEC
    PERFORM_API_CALL()
END
```

实现上与上述的 Tair 类似，也是对每个 key 以秒为单位维护一个计数器，差别在于因为 Redis 没有提供原子的 INCR + EXPIRE 指令，所以在 INCR 之后需要再调用一次 EXPIRE 来设置 key 的有效期。同时在外层以 MULTI 和 EXEC 包裹以保证事务性。

如果不想每次都调用 EXPIRE，可以考虑第二种方式：

```
FUNCTION LIMIT_API_CALL(ip):
current = GET(ip)
IF current != NULL AND current > 10 THEN
    ERROR "too many requests per second"
ELSE
    value = INCR(ip)
    IF value == 1 THEN
        EXPIRE(ip,1)
    END
    PERFORM_API_CALL()
END
```

计数器的有效期在第一次 INCR 时设置为 1s，因此不需要对 key 进行额外处理。

不过需要注意的是，这种方式存在一种隐藏的竞争条件。如果客户端在第一次调用了 INCR 后，由于应用崩溃或其他原因没有调用 EXPIRE，计数器会一直存在。

针对方式二的这个问题，可以用 lua 脚本解决：

```
local current
current = redis.call("incr",KEYS[1])
if tonumber(current) == 1 then
    redis.call("expire",KEYS[1],1)
end
```

第三种方式是通过 Redis 的 list 结构来实现。更复杂一些但可以记录下每次的请求。

```
FUNCTION LIMIT_API_CALL(ip)
current = LLEN(ip)
IF current > 10 THEN
    ERROR "too many requests per second"
ELSE
    IF EXISTS(ip) == FALSE              #1
        MULTI
            RPUSH(ip,ip)
            EXPIRE(ip,1)
        EXEC
    ELSE
        RPUSHX(ip,ip)
    END
    PERFORM_API_CALL()
END
```

这里也有一个隐含的竞争条件，在执行到 EXIST 判断这一行（#1 位置）时，两个客户端的 EXIST 命令可能都会返回 false，因此 MULTI/EXEC 块里的命令会被执行两次，不过这种情况很少出现，不太会影响计数器的准确性。

上述的几种方式还可以进一步优化，因为 INCR 和 RPUSH 这些命令都会返回操作后的计数器值，所以可以使用 set-then-get 的方式获取计数器值。

将简单窗口改造成滑动窗口也是类似的思路，把单一的 key 换成一个 hash 结构，hash 里面为每个子窗口保存一个计数值，在统计时，将同个 hash 中所有子窗口的计数值相加即可。

2）令牌桶/漏桶实现

用 Redis 实现令牌桶或者漏桶也非常简单。以令牌桶为例，在实现上，可以用两个 key 分别存储每个用户的可用 token 数和上次请求时间，另一种可能更好的办法是使用 Redis 的 hash 数据结构。

下图的示例是一个用户 user_1 当前在 Redis 中保存的流控配额数据：令牌桶中当前剩余 2 个 token，最近一次访问的时间戳是 1490868000。

![image.png](https://ucc.alicdn.com/pic/developer-ecology/7a12af696eef4851ab16afb0d44426ea.png)

当收到一个新请求时，Redis 客户端要执行的操作与我们在单机流控算法中看到的一样。首先，从对应 hash 中获得当前配额数据（HGETALL），根据当前时间戳、上次请求的时间戳和 token 填充速度计算要填充的 token 数；然后，判断是否放行，更新新的时间戳和 token 数（HMSET）。

一个示例如下：

![image.png](https://ucc.alicdn.com/pic/developer-ecology/2e0a53670860429faca7b77337931117.png)

同样的，如果要求比较高的精度，这里必须要对客户端的操作做并发控制。

不做同步控制可能导致的问题示例：桶里只有一个 token，两个客户端同时请求时出现并发冲突，结果是请求都会放行。

![image.png](https://ucc.alicdn.com/pic/developer-ecology/c86cda7753e4469b8f517da77be5a4af.png)

lua 代码示例如下：

```
local tokens_key = KEYS[1]
local timestamp_key = KEYS[2]

local rate = tonumber(ARGV[1])
local capacity = tonumber(ARGV[2])
local now = tonumber(ARGV[3])
local requested = tonumber(ARGV[4])

local fill_time = capacity/rate
local ttl = math.floor(fill_time*2)

local last_tokens = tonumber(redis.call("get", tokens_key))
if last_tokens == nil then
  last_tokens = capacity
end

local last_refreshed = tonumber(redis.call("get", timestamp_key))
if last_refreshed == nil then
  last_refreshed = 0
end

local delta = math.max(0, now-last_refreshed)
local filled_tokens = math.min(capacity, last_tokens+(delta*rate))
local allowed = filled_tokens >= requested
local new_tokens = filled_tokens
if allowed then
  new_tokens = filled_tokens - requested
end

redis.call("setex", tokens_key, ttl, new_tokens)
redis.call("setex", timestamp_key, ttl, now)

return { allowed, new_tokens }
```

3）滑动日志实现

得益于 Redis 的 Sorted Set 结构，实现滑动日志变得异常简单。流程大致如下：

a）每个用户有一个对应的 Sorted Set 记录请求日志。

- 其中每个元素的 key 和 value 可以是相同的，即请求的时间戳。
- Sorted Set 可以根据时间窗口大小设置有效期，比如时间窗口为 1s 时设置过期时间 5s，在请求量不大时可以节省 Redis 服务器内存。

b）当收到一个新的用户请求时，首先通过 ZREMRANGEBYSCORE 命令删除 Sorted Set 中过期的元素，这里的过期即：

请求时间戳 t < 当前时间戳 now - 时间窗口大小 interval

c）使用 ZADD 将当前请求添加到 Set 中。

d）使用 ZCOUNT 获取当前剩余 Set 大小，判断是否需要流控。

```
long now = System.currentTimeMillis();
long maxScoreMs = now - windowInSecond * 1000;

Transaction redis = jedisPool.getResource().multi();
redis.zremrangeByScore(key, 0, maxScoreMs);
redis.zadd(key, now, now + "-" + Math.random()); // 加入一个随机值使得member不重复
redis.expire(key, windowInSecond);
redis.exec();
```

另一个 JS 实现的代码示例：
https://github.com/peterkhayes/rolling-rate-limiter/blob/master/index.js

由于滑动日志算法的空间复杂度较其他算法高，使用滑动日志算法时，需要注意监控 Redis 内存的使用量。

4）并发控制

上面的几种算法都提到了不做并发控制可能带来的竞态条件，但额外的并发控制必然会带来性能下降，通常需要在精度和性能之间做取舍。Redis 流控的并发控制常见的有几类：

- 使用 Redis 事务 MULTI/EXEC。
- 使用 RedLock（https://redis.io/topics/distlock） 等分布式锁，要求每个客户端操作前先获取对应 key 的分布式锁。
- Lua 脚本。

最好通过性能测试来决定使用哪一种方式。

#### 4 扩展的一些思考

分布式流控带来了网络通信、加锁同步等开销，会对性能带来一定影响。同时分布式环境的可靠性也会带来更多挑战。如何设计一个高性能、高可靠性的分布式流控系统？这可能是个涉及到整个系统方方面面的大话题。

分享一下个人的一些思考，欢迎讨论：

1）根据实际诉求，合理搭配不同层的多级流控是个不错的方式，尽量把流量拦在外层。例如常见的接口层 Nginx 流控 + 应用层流控。

2）选择一个合适的缓存系统保存流控的动态数据，这个一般跟着公司的统一技术架构走。

3）将流控的静态配置放到配置中心（例如 Diamond）。

4）设计时要考虑分布式流控不可用的情况（例如缓存挂掉），必要时切到单机流控，使用 Sentinel 成熟可靠。

5）很多时候对精度的要求没那么高，因为一般都会允许一定的突发量。这时候可以做一些性能的优化。性能的最大瓶颈在于每次请求都会访问一次缓存，我之前在设计时就采用了一种折中的办法：

- 将可用配额的一部分，按一定比例（例如 50%），先预分配给集群内的机器。一般是平均分配，如果预先就已经知道每台机器的流量权重，可以加权分配。每台机器消耗配额的速率不同，中间也可能有机器宕机，可能有扩缩容，因此预分配的比例不宜太大，当然也不宜太小。
- 每台机器在配额耗尽时，向中心系统请求配额，这里的一个优化点是每台机器会记录自身配额消耗的速率（等同于承受的流量速率），按照速率大小申请不同大小的配额，消耗速率大则一次性申请更多。
- 在整体可用配额不足一定比例时（例如 10%），限制每台机器一次可申请的配额数，按剩余窗口大小计算发放配额的大小，并且每次发放量不超过剩余配额的一定比例（例如 50%），使得剩余的流量能够平滑地过渡。

五 总结

分布式流控的算法其实是单机流控的延伸，算法本质是一样的。这里按我的个人理解总结了上述几种流控算法的复杂度和适用场景。
![image.png](https://ucc.alicdn.com/pic/developer-ecology/4ba212a1a7de40a6ba7601faa653b4d9.png)

