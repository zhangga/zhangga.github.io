---
title: iris-baseline
tags:
  - UE
id: iris-baseline
categories:
  - 笔记
date: 2026-07-24 12:15:41
---
# 两个连接、同一对象——基线分叉与序列化实战

> Iris 原理精讲 · 进阶篇 · 多连接基线（Multi-Connection Baseline）

用一个 `ABot` 对象、两个连接 A/B，逐帧演示：**当一个连接丢包、导致基线进度分叉后，同一个对象在同一帧要发出两条完全不同的比特流。**

---

## 🍔 生活类比：给两个朋友寄"改动清单"

你在装修，要把每次改动告诉两个朋友。朋友 A 每封信都收到了，所以你只需告诉他"这次又改了啥"。朋友 B 上一封信丢了，你得把"上次那封 + 这次"的改动**一起补给他**。同一次装修，寄给两人的信内容不一样——因为你得**记住每个人上次看到的是哪个版本（基线）**。

---

## 对象设定

`ABot` 的复制状态描述符里有 3 个成员，ChangeMask 共 3 位：

| 成员 | ChangeMask 位 | 序列化位宽 |
|---|---|---|
| `Health`（int） | bit0 | 16 bit |
| `Ammo`（int） | bit1 | 8 bit |
| `Location`（FVector） | bit2 | 本例不改，始终不发 |

初始两个连接都已确认（ACK）**基线索引 0**，对应快照 `S0 = {Health=100, Ammo=30}`。

---

## ▶ 逐帧演示

观察连接 A / B 各自的**已确认基线**、**累积 ChangeMask**（🔴=脏）、以及本帧真正写出的**比特流**如何随基线分叉而不同。

### FRAME 0 — 初始

A、B 都确认基线0 = `S0{H=100, A=30}`。

| | 连接 A 🔵 | 连接 B 🟠 |
|---|---|---|
| 已确认基线 (LastAcked) | 索引0 · S0{H=100, A=30} | 索引0 · S0{H=100, A=30} |
| 累积 ChangeMask | `000` | `000` |
| 本帧比特流 | *（本帧无变化，不发送）* | *（本帧无变化，不发送）* |

---

### FRAME 10 — Health 100→80

A、B 都基于 S0 发增量，各建 pending 基线1 = S1。**此刻 A、B 完全同步（同帧共享 S1 快照）。**

| | 连接 A 🔵 | 连接 B 🟠 |
|---|---|---|
| 已确认基线 | 索引0 · S0{H=100, A=30} | 索引0 · S0{H=100, A=30} |
| 累积 ChangeMask | 🔴`Health` `001` | 🔴`Health` `001` |
| 本帧比特流 | `[对象句柄]`<br>`[基线索引=00]` // 基于 S0 解压<br>`[ChangeMask=001]` // Health 脏<br>`[Health=80]` // 16 bit | 与 A **完全相同** |
| 载荷 | ≈ **21 bit**（句柄外：2+3+16） | ≈ **21 bit**（与 A 相同） |

---

### FRAME 11 · 确认 — 分叉发生 ⚡

A 的包被 ACK → `A.LastAcked=1`；B 丢包 → `LostBaseline`，Health 脏位合并回 B。

> ⚡ **基线分叉发生**：A 停在 S1，B 退回 S0（且 Health 脏位复活）。

| | 连接 A 🔵 | 连接 B 🟠 |
|---|---|---|
| 已确认基线 | 索引1 · S1{H=80, A=30} ✓ACK | 索引0 · S0{H=100, A=30} ✗丢包 |
| 累积 ChangeMask | `000` | 🔴`Health` `001` |
| 说明 | 已确认，等待下次变化 | LostBaseline：Health 脏位合并回累积 mask |
| 确认进度 | LastAcked 0→**1** | LastAcked **仍=0** |

---

### FRAME 11 · 发送 — Ammo 30→25 ⚡

目标同为 `S2{H=80, A=25}`，但 A/B 基线不同 → 增量不同。

> ⚡ **同一对象同一帧，A 发 13 bit，B 发 29 bit。**

| | 连接 A 🔵 | 连接 B 🟠 |
|---|---|---|
| 已确认基线 | 索引1 · S1{H=80, A=30} | 索引0 · S0{H=100, A=30} |
| 累积 ChangeMask | 🔴`Ammo` `010` | 🔴`Health` 🔴`Ammo` `011` |
| 本帧比特流 | `[对象句柄]`<br>`[基线索引=01]` // 基于 S1 解压<br>`[ChangeMask=010]` // 仅 Ammo 脏<br>`[Ammo=25]` // 8 bit | `[对象句柄]`<br>`[基线索引=00]` // 基于 S0 解压<br>`[ChangeMask=011]` // Health+Ammo 脏<br>`[Health=80]` // 16 bit（补发）<br>`[Ammo=25]` // 8 bit |
| 载荷 | ≈ **13 bit**（2+3+8）· 新基线索引 (1+1)%2=0 | ≈ **29 bit**（2+3+16+8）· 新基线索引 (0+1)%2=1 |

---

### FRAME 11 · 客户端 — 收敛 ✓

客户端各按包里基线索引找本地快照叠加增量，收敛到 S2。

> ✓ **殊途同归：两端最终都是 `S2{H=80, A=25}`。**

| | 客户端 A 🔵 | 客户端 B 🟠 |
|---|---|---|
| 解压过程 | 本地基线 S1{H=80,A=30}<br>+ Ammo=25<br>= **S2{H=80, A=25}** ✓ | 本地基线 S0{H=100,A=30}<br>+ Health=80, Ammo=25<br>= **S2{H=80, A=25}** ✓ |
| Location | bit2=0 未发，沿用旧值 | bit2=0 未发，沿用旧值 |

---

## 🧠 演示里发生了什么（对照源码）

1. **Frame 10 改 Health**：A、B 都基于 S0 发增量，各自新建 pending 基线1=S1。同帧同对象的 state 快照靠引用计数**共享**（`FBaselineSharingContext`）。
2. **Frame 11 确认分叉**：A 的包被 ACK → `A.LastAcked=1`（`ProcessDelivered`, `ReplicationWriter.cpp:1217-1230`）；B 丢包 → `LostBaseline`（`cpp:1730-1736`）把 Health 脏位**合并回** B 的累积 mask（`EChangeMaskBehavior::Merge`），B.LastAcked 仍停在 0。
3. **Frame 11 改 Ammo**：目标同为 S2，但 A 基于 S1 只需发 Ammo；B 基于 S0 必须补发 Health+Ammo。基线索引按 `(LastAcked+1)%2` 轮换（`cpp:2528`）。
4. **客户端解压**：各自按包里的基线索引（2bit）找本地快照叠加增量，殊途同归收敛到 S2。

---

## 🔎 比特流结构（SerializeObjectStateDelta, cpp:2259-2281）

每个脏对象的包体：

```
[对象句柄] → [基线索引 2bit] → [ChangeMask] → [各脏成员的量化值]
```

- **基线索引** 告诉客户端"基于你本地哪个快照解压"；
- **ChangeMask** 里为 0 的成员（如本例 Location）双方都不发，客户端沿用旧值。

---

## ✦ 本课记住

- 同一对象、同一帧，不同连接因**基线不同**会发出**不同长度/内容的比特流**。
- 丢包连接靠 `LostBaseline` 把脏位**合并回累积 mask**，保证不漏字段（本例 B 补发 Health）。
- 基线是 **0↔1 双缓冲轮换**，不是无限版本号；索引随 ACK 前进。
- 量化只做一次，A/B **复用同一份量化值**，只是"发不发、相对谁发"不同。

---

## 🎯 自测

**问：** B 连接丢包后，下一帧只改了 Ammo，为什么 B 的比特流里 Health 也出现了？

<details>
<summary>点击查看答案</summary>

**答：** 丢包使 Health 脏位被合并回 B 的累积 mask，且 B 基线里 Health 仍是旧值，必须补发。

B 的基线还停在 S0（Health=100），`LostBaseline` 把 Health 脏位合并回来，所以要相对 S0 补发 Health=80。

</details>

---

## 附：涉及的引擎源码位置（UE5.7）

| 机制 | 文件 | 位置 |
|---|---|---|
| ACK 处理 `ProcessDelivered` | `ReplicationWriter.cpp` | 1217-1230 |
| 丢包 `LostBaseline` 合并脏位 | `ReplicationWriter.cpp` | 1730-1736 |
| 基线索引轮换 `(LastAcked+1)%2` | `ReplicationWriter.cpp` | 2528 |
| 增量序列化 `SerializeObjectStateDelta` | `ReplicationWriter.cpp` | 2259-2281 |
| 同帧快照共享 `FBaselineSharingContext` | `DeltaCompressionBaselineManager.h` | 167-172 |
| `MaxBaselineCount = 2`（双缓冲） | `DeltaCompressionBaselineManager.h` | 56-58 |
