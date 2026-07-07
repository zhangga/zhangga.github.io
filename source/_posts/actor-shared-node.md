---
title: 分布式 Actor 分片路由与迁移机制详解
tags:
  - UE
id: actor-shared-node
categories:
  - 笔记
date: 2026-07-07 14:24:59
---

# 分布式 Actor 分片路由与迁移机制详解

> 本文整理自一套「全区全服」分布式游戏服务器的核心寻址子系统，讲清楚一个 Actor（玩家、房间等有状态实体）在集群里**如何被定位、如何被路由、节点增删时如何在线迁移，以及如何始终保证「单点归属」**。

---

## 目录

1. [问题背景：有状态 Actor 的定位难题](#1-问题背景)
2. [核心设计：actorId → shard → node 两级映射](#2-两级映射)
3. [分片路由原理：一致性哈希环](#3-一致性哈希环)
4. [为什么每个节点要 400 个虚拟节点](#4-虚拟节点)
5. [Actor 寻址：从 actorId 找到节点](#5-actor-寻址)
6. [路由数据在 Etcd 中怎么存](#6-etcd-存储)
7. [网关如何把消息路由到对应节点](#7-网关路由)
8. [节点数量变化时的完整流程](#8-节点变化流程)
9. [Actor 迁移的完整流程（重点）](#9-迁移完整流程)
10. [如何保证「单点归属」](#10-单点归属)
11. [关键常量与总结](#11-总结)

---

<a name="1-问题背景"></a>
## 1. 问题背景：有状态 Actor 的定位难题

Actor 模型里，每个有状态实体（玩家、队伍、房间…）是一个 **Actor**：拥有独立的串行执行队列，同一时刻只在**一个线程**上处理消息，内部状态无需加锁。

在**单机**上这很简单。但在**多节点集群**里，就冒出三个必须回答的问题：

1. **定位**：一个 `actorId` 现在活在**哪台**节点上？
2. **路由**：网关 / 其它服务想给它发消息，怎么找到那台节点？
3. **归属唯一性**：扩容、缩容、宕机时，怎么保证同一个 Actor **全集群只有一个活跃实例**，绝不出现「双写」？

朴素做法是「`actorId` 直接哈希到节点」。但这会导致：**每次增删一台节点，几乎所有 Actor 的归属都要重算**，迁移量爆炸。于是引入了中间层。

---

<a name="2-两级映射"></a>
## 2. 核心设计：actorId → shard → node 两级映射

系统**不让 actorId 直接映射到节点**，而是插入一个固定的中间层 **shard（分片）**：

```
actorId  ──(纯计算, 永不变)──►  shard  ──(随拓扑变)──►  node
   玩家id                     0~10006             具体机器地址
```

| 层级 | 映射方式 | 是否随集群拓扑变化 | 是否需要存储 |
|------|----------|-------------------|-------------|
| **actorId → shard** | `abs(murmur3(actorId) % 10007)` 纯计算 | ❌ 永不变 | 只做本地缓存 |
| **shard → node** | 一致性哈希环决定，权威值落 Etcd | ✅ 唯一会变的一层 | Etcd 持久化 |

```java
// 第一层：actorId → shard（纯函数，与集群无关）
// 10007 是质数，取模分布更均匀；结果用 LRU 缓存
int getActorShard(long actorId) {
    Integer shard = cache.getIfPresent(actorId);
    if (shard == null) {
        long hash = murmur3_128().hashLong(actorId);
        shard = (int) Math.abs(hash % MAX_SHARD_COUNT); // MAX_SHARD_COUNT = 10007
        cache.put(actorId, shard);
    }
    return shard;
}

// 第二层：shard → node（查一致性哈希环 / Etcd 路由表）
String getActorNode(ActorType type, long actorId) {
    return getShardNode(type.service, getActorShard(actorId));
}
```

**为什么多这一层 shard？**

- `actor → shard` 永远不变，可以放心缓存，且**天然分散**了 Actor（10007 个桶）。
- 节点增删时，只有哈希环上**局部区间**的少数 shard 换归属，`actor → shard` 完全不动。
- 迁移的最小单位从「单个 Actor」变成「整个 shard」，批量迁移更高效。

shard 就像一个**减震层**：把「海量 Actor」和「少量节点」解耦，节点抖动被吸收在这一层内。

---

<a name="3-一致性哈希环"></a>
## 3. 分片路由原理：一致性哈希环

`shard → node` 由**一致性哈希环**决定。环用一棵有序树（`TreeMap<Long, String>`，key=哈希值，value=节点地址）表示：

```java
class ConsistentHashRouter {
    // 有序环：哈希值 → 节点地址
    NavigableMap<Long, String> ring = new TreeMap<>();
    int virtualNodeCount = 400; // 每个物理节点在环上放 400 个虚拟节点

    // 节点上线：为它生成 400 个虚拟节点撒到环上
    void onNodeAdded(Set<String> nodes) {
        for (String node : nodes)
            for (int i = 0; i < virtualNodeCount; i++) {
                long h = murmur3_128().hashString(node + "#" + i);
                ring.put(h, node);
            }
        // ... 触发迁移扫描（见后文）
    }

    // 节点下线：移除它所有的虚拟节点
    void onNodeDeleted(Collection<String> nodes) {
        ring.values().removeIf(nodes::contains);
    }

    // 查找：给定 shard 的哈希值，顺时针找环上第一个虚拟节点
    String getNode(long hash) {
        if (ring.isEmpty()) return null;
        var e = ring.ceilingEntry(hash); // 顺时针 ≥ hash 的第一个
        if (e == null) e = ring.firstEntry(); // 闭合环：绕回头部
        return e.getValue();
    }
}
```

**关键区分**（初学者最容易混淆的一点）：

- 环上**存放的**是「节点的虚拟节点」。
- 查询用的 **key** 是「shard 的哈希值」。
- 语义是：**「拿 shard 的哈希值，在节点环上顺时针命中的第一台节点，就是这个 shard 的归属节点」**。

一致性哈希的价值：**增删一台节点，只影响它相邻区间的 shard，其余 shard 全部不动。**

---

<a name="4-虚拟节点"></a>
## 4. 为什么每个节点要 400 个虚拟节点

如果每个物理节点在环上**只放 1 个点**，会出现严重的**负载倾斜**：

```
   只放 1 个点（3 台节点）              放 400 个虚拟节点
   ┌──────────────────────┐           ┌──────────────────────┐
   │  A 占据 72% 的弧长   │           │  A ≈ 33%             │
   │  B 占据 16%          │           │  B ≈ 33%             │
   │  C 占据 12%          │           │  C ≈ 34%             │
   └──────────────────────┘           └──────────────────────┘
       分布随机 → 极不均匀              大数定律 → 趋于均匀
```

因为节点的哈希落点是随机的，3 个点很容易碰巧挤在一起，导致某台节点承接了环上绝大部分弧长。

**虚拟节点的作用**：把 1 台物理节点拆成 400 个随机落点，均匀撒满整个环。由**大数定律**，落点越多，每台节点占据的总弧长越接近 `1/N`，负载自然被拉平。

**为什么恰好是 400？** 这是一个折中：

| 虚拟节点数 | 均匀性 | 环（TreeMap）规模 & 查询开销 |
|-----------|--------|------------------------------|
| 太少（如 1~10） | 倾斜严重 | 很小，但没用 |
| **400** | 足够均匀 | 4 节点 = 1600 个 key，`ceilingEntry` 是 O(log n)，可忽略 |
| 太多（如 10000） | 收益递减 | TreeMap 巨大，内存和查询成本上升 |

额外好处：**迁移也更均匀**。新增一台节点时，它插入的 400 个虚拟节点分散在环上各处，会从**每一台**老节点各匀走一小段，而不是把某一台的负载整块搬走。

---

<a name="5-actor-寻址"></a>
## 5. Actor 寻址：从 actorId 找到节点

寻址入口 `getShardNode(svc, shard)` 不只是「查表」，还承担**路由表的懒构建 + 故障重建**。核心是一段 **Etcd CAS 事务**：

```java
String getShardNode(Service svc, int shard) {
    if (etcdFault) return null;               // Etcd 异常，拒绝寻址

    // ① 先查本地缓存（由 Etcd watch 维护，见第 6 节）
    String node = localCache.get(svc, shard);
    if (node != null && isAlive(node)) return node;

    // ② 缓存没有 / 节点已死 → 用哈希环重新算一个目标节点
    String newNode = router(svc).getNode(shardHash(shard));
    if (newNode == null) return null;         // 无可用节点
    if (newNode.equals(node)) return node;    // 环也指向同一个（可能只是连接抖动）

    // ③ 用 CAS 事务把权威归属写进 Etcd（关键：保证全集群只有一个写入成功）
    var key = "shard/" + svc + "/" + shard;
    Cmp cmp = (node != null)
        ? new Cmp(key, EQUAL, node)      // 旧节点失效：期望值还是旧节点才覆盖
        : new Cmp(key, VERSION_LESS, 1); // 首次分配：期望 key 尚不存在
    TxnResponse resp = etcd.txn()
        .If(cmp)
        .Then(put(key, newNode))         // 条件成立 → 写入新归属
        .Else(get(key))                  // 条件不成立 → 读回别人已写的值
        .commit();

    // ④ 事务成功用自己算的，失败用别人已写入的 —— 无论如何全集群收敛到同一个值
    return resp.isSucceeded() ? newNode : resp.getValue();
}
```

**这段 CAS 是「单点归属」的第一道闸门**：多台节点可能同时想给同一个 shard 分配归属，但 Etcd 事务保证**只有一个 `put` 成功**，其余全部走 `Else` 分支读回同一个权威值。

---

<a name="6-etcd-存储"></a>
## 6. 路由数据在 Etcd 中怎么存

**关键认知：Etcd 里存的不是「每个 actor 在哪」，而是「每个 shard 在哪」。**

```
Etcd key-value 布局：
  shard/gs/0      = 10.0.0.3:9001
  shard/gs/1      = 10.0.0.5:9001
  shard/gs/342    = 10.0.0.3:9001
  ...
  shard/gs/10006  = 10.0.0.5:9001
```

- key 格式：`shard/{服务类型}/{shardIndex}`，value = 节点地址。
- 每个分片服务最多 **10007** 条记录，全量约 **300KB**，完全放得下。
- 因为 `actor → shard` 是纯计算，**Etcd 完全不需要知道任何 actorId**，数据量与在线玩家数无关，只与 shard 总数有关。这是「两级映射」在存储层的巨大红利。

每个节点启动时**全量拉一次 + 持续 watch 增量**，在本地维护一份 `shard → node` 缓存：

```java
void etcdWatch(Service svc) {
    String prefix = "shard/" + svc + "/";

    if (localVersion == 0) {                       // 首次：全量拉取
        GetResponse resp = etcd.get(prefix, isPrefix);
        if (resp == null) System.exit(21);         // 初次拉取不允许失败，直接退出
        localVersion = resp.revision();
        resp.getKvs().forEach(kv -> cache.put(shardOf(kv), nodeOf(kv)));
    }

    etcdFault = false;
    // 从 version+1 开始 watch，保证不漏事件、不重复
    etcd.watch(prefix, fromRevision(localVersion + 1),
        events -> {
            localVersion = events.revision();
            for (var e : events) {
                if (e.type == PUT) {
                    String old = cache.put(shardOf(e), nodeOf(e));
                    // 归属变了 → 通知本地做相应处理（如网关重绑，见第 7 节）
                    if (old != null && !old.equals(nodeOf(e)))
                        onShardNodeChange(shardOf(e), old, nodeOf(e));
                }
            }
        },
        onError,
        () -> { etcdFault = true; retryAfter(20, SECONDS); }); // watch 断开 → 标记故障并重连
}
```

`onShardNodeChange(shard, old, new)` 是整个系统感知「某分片换家了」的统一回调 —— 网关据此重绑，业务据此止血。

---

<a name="7-网关路由"></a>
## 7. 网关如何把消息路由到对应节点

网关（客户端长连接接入层）的目标：把玩家上行消息 **O(1)** 转发到玩家 Actor 所在节点。做法是**「登录时绑定一次，之后走缓存」**：

```java
class ClientSession {
    volatile String gsAddr;   // 绑定的目标节点地址（缓存）
    volatile long   userId;

    // ① 登录成功时：算一次归属，缓存地址，登记反向索引
    boolean onLogin(long userId) {
        this.userId = userId;
        String addr = getActorNode(PLAYER, userId); // actorId → shard → node
        if (addr == null) return false;
        // 把 (shard → 本 session) 登记进反向索引，供节点变化时快速找回
        gateway.addShardSession(getActorShard(userId), this.sessionId);
        updateGsChannel(addr);
        return true;
    }

    // ② 之后每条上行消息：直接用缓存地址，O(1) 转发
    void forward(Message msg) {
        var ch = innerServer.getChannel(gsAddr); // 用缓存的绑定地址
        if (ch == null) { close(); return; }     // 目标不可达 → 断开，触发重连重绑
        ch.writeAndFlush(msg);
    }

    // ③ 绑定 / 换绑目标节点
    void updateGsChannel(String addr) {
        if (addr.equals(gsAddr)) return;
        var ch = innerServer.getChannel(addr);
        if (ch == null) { close(); return; }
        gsAddr = addr;
        ch.writeAndFlush(CONNECT_NOTIFY); // 通知目标节点建立/修复到本客户端的链路
    }
}
```

网关侧维护一个**反向索引** `shardMap: shard → Set<sessionId>`，专门用于「某分片换节点了，赶紧把绑在这个分片上的在线玩家全部重绑」：

```java
// 分片归属变化（来自第 6 节的 onShardNodeChange 回调）
void onShardNodeChange(int shard, String oldNode, String newNode) {
    var sessions = shardMap.get(shard);
    if (sessions == null) return;
    for (int sid : sessions) {
        var session = getSession(sid);
        if (session != null) session.updateGsChannel(newNode); // 换绑到新节点
    }
}

// 节点宕机（Etcd 感知到删除）：在线玩家等不得，立刻主动重建路由
void onNodeDeleted(Service svc, Collection<String> deadNodes) {
    if (svc != GS) return;
    deadNodes.forEach(addr -> closeChannel(addr)); // 以 Etcd 为准，关闭旧连接
    shardMap.forEach((shard, sessions) -> {
        if (sessions.isEmpty()) return;
        // 主动触发一次 getShardNode，重算并写回新归属，加速恢复
        executor.execute(() -> getShardNode(GS, shard));
    });
}
```

**要点**：网关**不长期硬编码**目标地址，而是把地址当作可失效的缓存。归属一旦变化，就通过 `onShardNodeChange` 统一换绑；节点宕机则主动重算。转发路径本身保持 O(1)。

---

<a name="9-迁移完整流程"></a>
## 8 & 9. 节点变化 + Actor 迁移的完整流程（重点）

这是整个系统最精妙的部分。分成两层来看：**上层编排（ActorShard）** 和 **下层单体状态机（MigrateComponent）**。

### 8.1 触发：节点变化 → 环更新 → 定时扫描

系统**不在扩容瞬间同步迁移**，而是**定时扫描**（每 13 分钟一轮）。原因：
- 实现简单，无需处理「短时间多次扩容」的复杂时序。
- 兼容「停服扩容后重启补迁移」的场景。
- 迁移实时性无要求，间隔足够大时性能影响可忽略。

```java
// 节点上线/下线 → 更新环 + 把扫描计数置 2（保证拓扑变化后多扫几轮，防漏）
void onNodeAdded(...)  { ring.putAll(...); scanCount.set(2); }
void onNodeDeleted(...){ ring.removeAll(...); scanCount.set(2); }

// 每 13 分钟一轮：找出「不再属于本节点」的 shard，逐个发起迁移
scheduleAtFixedRate(() -> {
    if (scanCount.get() < 1) return;
    String self = localAddress();
    for (var entry : localShards.entrySet()) {   // 只遍历本机持有的 shard
        var shard = entry.getValue();
        if (shard.inMigrating()) continue;         // 已在迁移中，跳过
        String target = ring.getNode(shardHash(entry.getKey()));
        if (target == null) { log("no node!"); return; } // Etcd 严重异常，中断本轮
        if (self.equals(target)) continue;         // 仍属于自己，不动
        shard.migrate(target);                     // 该走了 → 发起迁移
    }
    scanCount.decrementAndGet();
}, 13, 13, MINUTES);
```

> 用 `scanCount`（计数而非布尔）是因为 `localShards` 可能被并发写入，多扫几轮能兜住个别漏掉的 shard。

### 8.1.1 为什么加节点需要定时扫描，而不是「Etcd 感知后立即改 forward 地址」

这是最容易产生的误解：**「新增一台节点，Etcd 感知到后，不是会立即改写 actor 的 forward 地址吗？」答案是不会。** 加节点改的是**内存里的哈希环**，不是 **Etcd 路由表**，二者是两个不同的东西：

| 对象 | 是什么 | 加节点时的行为 |
|------|--------|---------------|
| **一致性哈希环** | 内存里的「计算规则」，`getNode(hash)` 算出理论归属 | `onNodeAdded` **立即**把新节点 400 个虚拟节点撒进环，计算结果变了 |
| **Etcd 路由表** `shard/{svc}/{shard}` | 持久化的「权威归属」，网关/节点据此 forward | **不会自动改**，只能被 CAS 写入触发；没人写它就不变 |

**关键在于 `getShardNode` 被刻意设计成「归属还活着就绝不重算」**（回看第 5 节那段代码的前几行）：

```java
String getShardNode(svc, shard) {
    String node = localCache.get(svc, shard);
    if (node != null && isAlive(node))
        return node;                    // ★ 归属还活着 → 直接返回老节点，根本不看环！
    String newNode = router(svc).getNode(shardHash(shard)); // 只有归属为空/已死才重算
    // ... CAS 写 Etcd ...
}
```

所以加节点后，一个**归属节点仍存活**的 shard，`getShardNode` 会一直返回老节点，网关的 forward 地址纹丝不动。**这是故意的。**

**为什么不能加节点就立即改地址？** 因为 Actor 是**有状态、正在运行**的实体，不是一个纯路由指针：

- 老节点上的 Actor 内存里装着从 DB 加载的状态、运行时数据，队列里可能还有没跑完的任务、没提交的事务。
- 若加节点瞬间就把 forward 指向新节点：新节点上**根本没有这个 Actor**，它会去 DB 重新加载；而老节点内存里那份还活着、状态还在变——**同一实体出现两个活跃实例，直接破坏「单点归属」、数据错乱。**

因此搬家必须由老节点**主动做一次受控交接**（冻结 → 传状态 → 切 Etcd 路由 → 解冻），也就是 8.2/8.3 的迁移三阶段，绝不是改个地址那么简单。而这个「贵且不紧急」的交接，就用 13 分钟定时扫描 + 每 shard 再随机延迟 10~180 秒，把迁移**摊平**到时间轴上，避免扩容瞬间的迁移风暴。

### 8.1.2 对比：加节点 vs 删节点（设计精髓）

「Etcd 感知到就立即改」这个直觉，**对删节点成立，对加节点不成立**——这正是路由更新策略的精髓：

| 场景 | 老归属状态 | 路由更新方式 | 为什么 |
|------|-----------|-------------|--------|
| **删节点 / 宕机** | 老节点**已死** | **立即、按需重算**：`getShardNode` 发现 `isAlive==false` → 当场重算 + CAS 写新归属；网关 `onNodeDeleted` 还会主动触发重建 | 老 Actor 已经没了，没有 live 状态要保护，必须尽快恢复服务 |
| **加节点 / 扩容** | 老节点**还活着** | **延迟、扫描驱动**：`getShardNode` 坚持返回老节点，靠 13 分钟定时扫描做受控迁移 | 老 Actor 带着 live 状态，必须走冻结交接；且不紧急，要摊平 |

一句话总结：**宕机是「被动即时重路由」（归属没了，当场补）；扩容是「主动延迟迁移」（归属还在且活着，得体面地搬）。定时扫描正是扩容这条路唯一的搬迁触发器。**

### 8.2 上层编排：ActorShard 的三阶段迁移

`ActorShard.migrate(dest)` 先**随机延迟 10~180 秒**（打散大量分片的迁移峰值），再进入 `migrate0()` 的三阶段：

```java
void migrate(String dest) {
    scheduleAfter(random(10, 180), SECONDS, () -> {
        if (!isAlive(dest)) return;   // 目标已失效，放弃
        if (inMigrating()) return;    // 已在迁移，避免重入
        migDest = dest;
        migrate0();
    });
}

void migrate0() {
    // ── 阶段 1：冻结本 shard 内所有 Actor，等它们进入「冻结」态 ──
    List<Future> futures = new ArrayList<>();
    forEachLocalActor(actor -> {
        var f = new SettableFuture();
        futures.add(f);
        actor.migrateComponent().startMigrate(migDest, f); // 冻结 + 创建影子
    });
    Futures.successfulAsList(futures).get(4, SECONDS);      // 最多等 4 秒

    // ── 阶段 2：CAS 事务切换 Etcd 路由表（权威归属转移，重试 3 次）──
    TxnResponse resp = null;
    for (int i = 0; i < 3; i++) {
        resp = etcd.txn()
            .If(new Cmp(key, EQUAL, selfAddress))  // 期望：当前归属还是自己
            .Then(put(key, migDest))               // 成立 → 改写为目标节点
            .Else(get(key))
            .commit();
        if (resp != null) break;
    }
    if (resp == null) return; // Etcd 异常，中止（现存 actor 会被清理，无需解冻）

    // ── 阶段 3：从本地摘除 shard + 通知每个 Actor 完成迁移 ──
    if (!localShards.remove(shardIndex, this))     // 值比较，防止重复迁移
        return; // 已被别的流程迁走了
    String address = resp.isSucceeded() ? migDest : resp.getValue();
    forEachLocalActor(actor ->
        actor.migrateComponent().finishMigrate(address));
}
```

三阶段严格有序：**先冻结源端 → 再切换权威路由 → 最后摘除源端并收尾**。`localShards.remove(shardIndex, this)` 用**值比较**（只有 value 仍是「本对象」才删除并返回 true），是防止同一 shard 被并发迁移两次的关键。

### 8.3 下层状态机：MigrateComponent 的 migDest 三态

每个 Actor 挂一个 `MigrateComponent`，用一个字段 `migDest` 表达三种状态：

| `migDest` 取值 | 含义 | 对新消息的处理 |
|---------------|------|---------------|
| `null` | **正常**，未迁移 | 直接执行（`interceptExecute` 返回 false） |
| `""`（空串） | **冻结中**，正在迁移 | RPC 消息缓存进 `delayRpcs`，暂不执行 |
| 非空地址 | **已迁走** | 拒绝执行，打错误日志 |

```java
// 消息执行前的拦截钩子
boolean interceptExecute(ActorTask t) {
    if (isShadow) {                          // 我是「影子」→ 缓存等待主体迁入
        if (!shadowTimer) {
            shadowTimer = true;
            schedule(() -> cancelShadow(null), 4, SECONDS); // 防止无限等待
        }
        delayTasks.add(t);
        return true;
    }
    if (migDest == null) return false;       // 正常：放行
    if (migDest.isEmpty()) return checkDelay(t); // 冻结：缓存 RPC 到 delayRpcs
    return true;                             // 已迁走：拒绝
}

// 源端：进入冻结，创建影子
void startMigrate(String dest, Future done) {
    owner.execute(() -> {
        if (migDest != null) { done.set(); return; } // 幂等
        owner.stopSchedule();      // 停掉定时任务
        onStartMigrate();          // 业务钩子（如落库前置处理）
        migDest = "";              // → 冻结态：新 RPC 开始缓存
        createShadowActor(dest);   // 在目标节点创建影子 Actor + 传输状态/缓存
        done.set();
    });
}

// 源端：完成迁移，标记已迁走
void finishMigrate(String dest) {
    owner.execute(() -> {
        migDest = dest;            // → 已迁走态
        onFinishMigrate(dest);
    });
}

// 目标端影子：解除影子态，回放期间积压的消息
void cancelShadow(List<DelayRpc> migratedRpcs) {
    if (isShadow) { isShadow = false; recoverRuntime(); }
    // 回放源端冻结期间缓存的 RPC
    if (migratedRpcs != null)
        migratedRpcs.stream().map(this::delay2Task).forEach(owner::executeDirectly);
    // 回放影子期间自己积压的 task
    delayTasks.forEach(owner::executeDirectly);
    delayTasks.clear();
}
```

### 8.4 端到端时序

```
        源节点 A                    Etcd 路由表                 目标节点 B
  ┌──────────────────┐                                    ┌──────────────────┐
  │ ① 扫描发现 shard  │                                    │                  │
  │    该归 B 了      │                                    │                  │
  │ ② startMigrate:   │                                    │ createShadow →   │
  │    stopSchedule   │                                    │  ③ 建影子 Actor  │
  │    migDest=""     │─── 传状态 + 缓存的 delayRpcs ─────►│    isShadow=true │
  │    (新RPC开始缓存) │                                    │    (新消息缓存)   │
  │ ④ CAS 改路由 ─────┼──► shard/gs/342 = B  (权威切换) ──┐│                  │
  │ ⑤ localShards     │                                  ││                  │
  │    .remove(this)  │                                  │└─► onShardNodeChange│
  │ ⑥ finishMigrate:  │                                  │   网关换绑到 B     │
  │    migDest=B      │                                  │ ⑦ cancelShadow:   │
  │    (后续消息拒绝)  │                                  │    回放 delayRpcs  │
  └──────────────────┘                                  │    + delayTasks   │
                                                         │    正常服务       │
                                                         └──────────────────┘
```

### 8.5 迁移的三大保证

1. **不丢消息**：源端冻结期间的 RPC 存入 `delayRpcs` 随影子一起传给目标端；目标影子期间的消息存入 `delayTasks`。两者最终在 `cancelShadow` 里按序**回放**（`delay2Task` 把缓存的字节流重建成可执行的 RPC handler）。
2. **不双跑**：`Etcd CAS` 保证路由权威只切换一次；`localShards.remove(shardIndex, this)` 的**值比较**保证同一 shard 不被并发迁移两次；`migDest`「已迁走」态直接拒绝后续消息。
3. **不卡死**：影子 Actor 带一个 **4 秒兜底定时器**，即使源端迁移消息因异常没送达，影子也会自动 `cancelShadow` 解冻并回放已积压消息，避免玩家被永久卡住。

---

<a name="10-单点归属"></a>
## 10. 如何保证「单点归属」

「同一个 Actor 全集群只有一个活跃实例」由**四层机制**共同兜底：

| 层 | 机制 | 作用 |
|----|------|------|
| **权威存储** | Etcd 单条 `shard/{svc}/{shard}` 记录 + CAS 事务 | 归属只有一个权威值，写入靠 CAS 天然互斥 |
| **源端冻结迁移** | `migDest` 三态状态机（正常 / 冻结 / 已迁走） | 切换路由前先冻结源端，迁走后拒绝旧节点上的消息 |
| **网关重绑** | `onShardNodeChange` → `updateGsChannel` | 归属一变，在线玩家的上行立刻改发新节点 |
| **创建兜底** | `addLocalActor` 时校验 `getShardNode == 自己` | 并发「创建 Actor」与「迁移」时，若归属已不是本机则拒绝落地 |

```java
// 创建本地 Actor 前的最后一道校验：确认这个 shard 此刻确实归自己
String addLocalActor(ActorType type, long actorId) {
    int shard = getActorShard(actorId);
    String node = getShardNode(type.service, shard);
    if (!localAddress().equals(node)) {
        // 归属已经不是本机（可能正在迁移）→ 拒绝，返回真实归属节点
        return node;
    }
    // 归属确认是自己 → 落地
    localShards.computeIfAbsent(shard, ...).add(type, actorId);
    return null; // null 表示创建成功
}
```

核心思想：**Etcd 里的那一条 CAS 记录是唯一「物理锚点」**，任何节点想接管一个 shard，都必须先赢下这条记录的 CAS 写入；同时源端用「冻结 → 切路由 → 摘除」的顺序保证交接期不会两端同时处理。

---

<a name="11-总结"></a>
## 11. 关键常量与总结

| 常量 | 值 | 说明 |
|------|-----|------|
| 分片总数 `MAX_SHARD_COUNT` | **10007** | 质数，取模分布更均匀 |
| 每节点虚拟节点数 | **400** | 均匀性与环规模的折中 |
| 迁移扫描间隔 | **13 分钟** | 定时扫描而非扩容瞬间触发 |
| 迁移随机延迟 | **10~180 秒** | 打散大量分片的迁移峰值 |
| 影子兜底定时器 | **4 秒** | 防止影子 Actor 永久卡死 |
| Etcd 路由表容量 | ~10007 条 / ≈300KB | 与在线人数无关，只与 shard 数有关 |
| 哈希算法 | murmur3_128 | 分布均匀、计算快 |

### 一句话串起来

> **`actorId` 经纯计算落到 10007 个 `shard` 之一（永不变）；`shard` 经 400 虚拟节点的一致性哈希环落到某台 `node`，权威值以单条 CAS 记录存于 Etcd；网关登录时绑定一次、之后 O(1) 转发；节点增删时定时扫描找出该搬家的 shard，用「冻结源端 → CAS 切路由 → 摘除源端 + 影子回放积压消息」的三阶段完成在线迁移，全程靠 Etcd 单条 CAS 记录 + 源端冻结 + 网关重绑 + 创建校验四层机制，保证任一 Actor 全集群始终只有一个活跃实例。**

### 设计亮点回顾

- **两级映射**把「海量 Actor」与「少量节点」解耦，shard 是吸收拓扑抖动的减震层。
- **一致性哈希 + 虚拟节点**让增删节点只影响局部区间，且负载与迁移都均匀。
- **存储只记 shard 归属**，数据量与在线人数无关，Etcd 压力恒定。
- **定时扫描式迁移**比触发式简单、健壮，天然兼容停服扩容与多次扩容。
- **三态状态机 + 影子 Actor + 消息缓存回放**，实现了「不丢消息、不双跑、不卡死」的在线无损迁移。
