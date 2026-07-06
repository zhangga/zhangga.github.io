---
title: 令牌桶限流：一个 long 字段搞定的时间戳法实现详解
tags:
  - UE
id: timebased-bucket
categories:
  - 笔记
date: 2026-07-06 22:46:02
---

> 本文以分布式游戏服务器网关（TCP 长连接接入层）为例，详细拆解**时间戳法（Timestamp-based）令牌桶**的原理、代码、数学模型，以及它相对经典实现的优劣。

## 一、为什么需要限流

在长连接网关上，每个客户端连接都可能因为**外挂、脚本、抓包重放、协议攻击**而在短时间内狂发协议包。如果不加约束，单个恶意连接就能把后端游戏服（GameServer）的消息队列打爆，拖垮整个区服。

因此接入层需要一个**每连接（per-connection）级别**的限流器，目标是：

- 允许**正常玩家的突发**（比如刚进游戏时集中拉数据），不误伤；
- 限制**长期的高频率发包**（稳态速率），拦住脚本与攻击；
- 开销要极小——网关要扛几万甚至几十万连接，每个连接的限流状态**不能占太多内存，更不能起定时器**。

令牌桶（Token Bucket）天然满足「突发 + 稳态」双重语义，是这类场景的首选。

## 二、令牌桶的三种实现思路

令牌桶的核心模型是：一个容量为 `N` 的桶，以固定速率往里放令牌，每处理一个请求消耗一个令牌，桶空则拒绝。它同时表达了两件事：

- **桶容量 `N`** —— 允许的最大突发量；
- **填充速率 `r`** —— 允许的长期平均速率。

实现上通常有三种做法：

| 实现方式 | 核心数据 | 特点 |
|---|---|---|
| **定时器填充法** | 令牌计数 + 定时任务 | 起一个定时器周期性给桶加令牌。语义直观，但每个桶一个定时器，海量连接下调度开销爆炸。 |
| **惰性计算法** | 令牌数 + 上次填充时间戳 | 不用定时器，每次请求时根据「距上次的时间差 × 速率」补算令牌。需要存 2 个字段并做乘除。 |
| **时间戳法（本文）** | 仅一个虚拟时间戳 `lastRecvTime` | 连令牌数都不存，用**一个 `long` 时间戳同时表达「桶里还剩多少令牌」**。无定时器、每连接仅 1 个字段、逻辑极简。 |

本文的服务器采用了**第三种：时间戳法**。这是三者中内存与计算开销最低的方案，非常适合网关这种超高连接数的场景。

## 三、配置参数

限流参数由一个全局单例 `TokenBucketLimiter` 持有（所有连接共享同一套阈值）：

```java
public class TokenBucketLimiter {
    private int tokenCount = 200;   // 令牌桶容量 N
    private int interval = 200;     // 每个令牌的生成间隔，单位 ms（速率 r = 1/interval）
    private int bucketFillTime;        // 装满整桶所需时间 = N * interval

    public void init(int tokenCount, int interval) {
        if (tokenCount > 0) this.tokenCount = tokenCount;
        if (interval > 0)   this.interval = interval;
        bucketFillTime = this.tokenCount * this.interval; // 200 * 200 = 40000ms
    }

    public int getBucketFillTime() { return bucketFillTime; }
    public int getInterval()    { return interval; }
}
```

关键量：

- **容量 `N = 200 `**：最多允许攒 200 个令牌，即最大突发 200 条消息。
- **间隔 `interval = 200ms`**：每 200ms 生成 1 个令牌，稳态速率 = **5 条/秒**。
- **装满时间 `bucketFillTime = N × interval = 200 × 200 = 40000ms`**：从空桶到满桶需要 40 秒。这个派生量是整个算法的关键常量。

## 四、核心算法：`lastRecvTime` 的语义

限流状态存在每条连接的 Handler 上，**只有一个字段**：

```java
private long lastRecvTime;
```

它**不是**「上次真正收到消息的时间」，而是一个精心维护的**虚拟时间戳**。它的语义是：

> **`now − lastRecvTime` 这段时间差，就代表桶里当前可用的令牌量（换算成时间）。**

也就是说，令牌数被隐式编码成了「当前时刻与 `lastRecvTime` 的距离」：

- `lastRecvTime` 离 `now` **越远**（差越大）→ 令牌**越多**；
- `lastRecvTime` **追上** `now`（差为 0）→ 桶**空**，拒绝；
- 令牌上限对应 `now − lastRecvTime ≤ bucketFillTime`，即 `lastRecvTime` 最多退到 `now − bucketFillTime`（满桶线）。

完整代码只有十几行：

```java
private boolean checkTokenBucketLimiter() {
    var timeNow = System.currentTimeMillis();

    // ① 首次调用：把 lastRecvTime 设成"满桶"状态，直接放行
    if (lastRecvTime == 0) {
        lastRecvTime = timeNow - TokenBucketLimiter.getInstance().getBucketFillTime();
        return true;
    }

    // ② 消费一个令牌 = 把 lastRecvTime 往前推 interval
    long newTime = lastRecvTime + TokenBucketLimiter.getInstance().getInterval();
    if (newTime <= timeNow) {
        // ③ 令牌上限封顶：防止长期不发攒出超过 N 的令牌
        lastRecvTime = Math.max(newTime, timeNow - TokenBucketLimiter.getInstance().getBucketFillTime());
        return true;
    }

    // ④ newTime > now：令牌不足，拒绝
    return false;
}
```

### 逐行拆解

| 代码 | 含义 |
|---|---|
| `lastRecvTime == 0`（首次） | 未初始化。设为 `now − bucketFillTime`，即**满桶**，第一条消息必然放行。 |
| `newTime = lastRecvTime + interval` | 试图**消费一个令牌**：把虚拟时间戳往前推一个 `interval`。 |
| `if (newTime <= timeNow)` | 判断桶里**是否还有令牌**。推进后若仍不超过 `now`，说明令牌够用，放行。 |
| `lastRecvTime = Math.max(newTime, now − bucketFillTime)` | **最精妙的一行**：正常情况下 `lastRecvTime = newTime`；但若连接长期空闲，`newTime` 会远小于 `now − bucketFillTime`，用 `max` 把它**钳制在满桶线**，防止攒出超过 `N` 的令牌——这就是「桶容量上限」的实现。 |
| `return false`（`newTime > now`） | 令牌不足。虚拟时间戳已经追上甚至超过了真实时间，桶空，拒绝。 |

### 一图理解「赛跑」模型

把时间轴想象成一条直线，`now`（真实时间）和 `lastRecvTime`（虚拟时间戳）在上面赛跑：

```
时间轴 ───────────────────────────────────────────►
        │◄──────── 可用令牌 (now - lastRecvTime) ───────►│
        │                                                │
   lastRecvTime                                         now
   (桶状态)                                          (真实时间)
```

- **每放行一条消息**：`lastRecvTime += interval`，虚拟戳向右追一步（令牌 −1）。
- **真实时间流逝**：`now` 自然向右移，相当于**自动补令牌**（让 `lastRecvTime` 相对"落后"，差变大）。
- **两者赛跑**：
  - 发得慢 → `lastRecvTime` 追不上 `now`，令牌越攒越多（但被 `now − bucketFillTime` 挡在满桶线）；
  - 发得太快 → `lastRecvTime` 越过 `now`，`newTime > now`，拒绝。

**这就是为什么不需要定时器**：真实时间本身就是免费的、连续的令牌发生器。

## 五、满桶重置：善待正常玩家

除了首次进入，代码还在一个业务时机主动重置为满桶：

```java
// 收到进入游戏协议时
if (msgId == Msg_CEnterGame) {
    resetTokenBucketLimiter();
}

private void resetTokenBucketLimiter() {
    lastRecvTime = System.currentTimeMillis()
                 - TokenBucketLimiter.getInstance().getBucketFillTime(); // 满桶
}
```

**为什么要重置？** 玩家刚进入游戏（`Msg_CEnterGame`）的一瞬间，客户端往往会**集中发一批初始化请求**——拉背包、拉任务、同步好友、加载场景等。这波请求是完全正常的突发。通过在进游戏时刷满令牌桶，让这波突发顺利通过，**避免误伤正常玩家**，同时进游戏之后又回到稳态限速，继续拦截异常高频发包。

这体现了令牌桶「突发容量」与「稳态速率」解耦的价值：容量给正常突发留足空间，速率守住长期底线。

## 六、数学模型小结

设初始满桶，令牌数 `tokens = (now − lastRecvTime) / interval`：

- **稳态吞吐**：长期平均放行速率 = `1 / interval` = 5 条/秒（不管怎么攒，平均线守得住）。
- **最大突发**：桶满时可瞬间连续放行 `N = 200` 条（`now − lastRecvTime = bucketFillTime = 40000ms`，恰好 200 个 200ms）。
- **恢复时间**：从空桶回到满桶需要 `bucketFillTime = 40s`；恢复到 1 个令牌只需 `interval = 200ms`。

## 七、优势

- **极致省内存**：每条连接只需 **1 个 `long`（8 字节）**，没有独立的令牌计数器、时间戳对、锁或队列。几十万连接的网关能轻松扛住。
- **零定时器**：不依赖任何调度线程或周期任务补令牌，用「真实时间流逝」天然充当令牌发生器。避免了海量定时任务的调度开销和 GC 压力。
- **无锁、逻辑极简**：整个判断就是一次读、几次加减和一个 `Math.max`，纯算术、无阻塞。每个连接的 Handler 单线程处理，天然线程安全，连 CAS 都不需要。
- **突发与稳态解耦**：`N`（容量）控制突发，`interval`（速率）控制稳态，两个维度独立可调；配合业务时机重置，能精细地"善待正常玩家、卡死异常流量"。
- **惰性计算**：只在消息到来时计算，空闲连接**零成本**——不发消息就完全不占 CPU。

## 八、局限与注意点

- **依赖墙钟 `System.currentTimeMillis()`**：如果系统时钟被回拨（NTP 校时、手动改时间），`now` 变小可能导致短时间内判断异常（虚拟戳"超前"于真实时间，令牌短暂冻结）。生产上需保证时钟单调或容忍这种边界。
- **只做「是否放行」，不做排队/整流**：这是**拒绝式**限流（超了直接 `ctx.close()` 断连），不是**平滑排队**。它适合网关"拦攻击"，不适合需要"削峰填谷、请求缓冲"的场景——后者应选漏桶（Leaky Bucket）或带队列的实现。
- **精度受 `interval` 粒度限制**：令牌以 `interval`（200ms）为最小时间单位换算，无法表达亚毫秒级的精细速率。对游戏协议 QPS 足够，但不适合超高频、要求微秒级精度的场景。
- **单机、per-connection，非分布式配额**：这是每条连接各自独立的桶，不是「一个玩家跨多台网关的全局配额」。若要做跨节点的全局限流，需引入 Redis 等共享存储（代价是网络往返，失去本方案的零开销优势）。
- **参数为全局共享**：所有连接共用同一套 `N / interval` 阈值，无法按玩家等级/VIP 差异化限流。若有此需求需扩展为多套配置。

## 九、与经典实现的对比

| 维度 | 时间戳法（本文） | 定时器填充法 | 惰性计算法（令牌数+时间戳） |
|---|---|---|---|
| 每连接内存 | **1 个 long** | 计数器 + 定时器句柄 | 2 个字段（令牌数 + 时间戳） |
| 是否需定时器 | **否** | 是（海量时开销大） | 否 |
| 计算复杂度 | 加减 + 一次 max | 定时回调 | 乘除补算令牌 |
| 突发支持 | 是 | 是 | 是 |
| 平滑排队 | 否（拒绝式） | 否 | 否 |
| 适用规模 | **超高连接数网关** | 少量对象 | 中高连接数 |

## 十、结语

这个实现的精髓在于一次**语义转换**：把「桶里还剩多少令牌」这个状态，等价编码成「一个虚拟时间戳距当前时间有多远」。这一步转换换来了**零定时器、单字段、无锁**的极致轻量，非常契合长连接网关"连接数巨大、单连接状态必须极小"的约束。

它不是万能的——不做整流、依赖墙钟、精度有限——但在「用最小代价拦住异常高频发包、同时不误伤正常突发」这个明确目标下，是一个教科书级的工程取舍范例。
