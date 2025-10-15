---
title: 查看Linux下进程占用内存
tags:
  - UE
id: linux-memory
categories:
  - 笔记
date: 2025-10-13 16:19:00
---

近期计划针对 Linux 环境下DS（Dedicated Server）的性能展开测试，重点对比下面两种运行模式的表现：

* 共享内存模式（基于Fork实现）
* 单进程多GameInstance模式

在查看共享内存模式下进程占用的内存时，碰到一些疑问，这里整理记录下。

# 遇到的问题

下面是使用top查看内存占用的情况
![top](https://github.com/zhangga/picx-images-hosting/raw/master/lm-top.1hslrostgu.webp)
发现父进程(st\_seed\_Camp)占用**931m**内存，同时各个子进程(st\_Camp\_2xxxx)占用**771m**内存。

上图还是Camp服务在启动后，没有玩家登入的情况下，内存占用的情况。很明显，771m不是子进程真正占用的情况。
![freem](https://github.com/zhangga/picx-images-hosting/raw/master/lm-freem.45i221myz0.webp)
要做性能测试，必须先能正确查看到各进程实际占用的内存才行。

# 参数的实际含义

那top命令下看到的各值实际含义是什么呢？

## 系统总体信息区

#### 第一行（系统状态）

`top - 16:33:58 up 19 days,  1:41,  0 users,  load average: 0.02, 0.07, 0.08`

* `16:33:58` → 当前时间
* `up 19 days,  1:41` → 系统已运行时间
* `0 users` → 当前登录用户数量
* `load average` → 1分钟、5分钟、15分钟平均负载（接近或大于CPU核心数表示忙）

#### 第二行（任务统计）

`Tasks:  26 total,   1 running,  25 sleeping,   0 stopped,   0 zombie`

* ​**total**​：总进程数
* ​**running**​：正在运行（使用CPU）的进程数
* ​**sleeping**​：休眠中的进程
* ​**stopped**​：被停止（信号暂停）的进程
* ​**zombie**​：僵尸进程（已退出但父进程未回收）

#### 第三行（CPU 使用情况）

`%Cpu(s):  0.6 us,  0.6 sy,  0.0 ni, 98.8 id,  0.0 wa,  0.0 hi,  0.0 si,  0.0 st`

👉 通常关注：

* **us**​**​ + sy ≈ 系统总 CPU 使用率**
* **wa** 高说明 I/O 瓶颈
* **id** 低说明 CPU 忙碌

#### 第四、五行（内存统计）

`MiB Mem :  15492.0 total,    414.3 free,   2578.1 used,  12499.6 buff/cache`

`MiB Swap:      0.0 total,      0.0 free,      0.0 used.  12502.4 avail Mem`

| **字段**       | 含义                                        |
| ---------------------- | --------------------------------------------- |
| **total**      | 内存总量                                    |
| **free**       | 完全未分配的                                |
| **used**       | 已使用的（包含 cache）                      |
| **buff/cache** | 系统缓存与文件缓冲区                        |
| **shared**     | 共享内存（tmpfs、shm）使用                  |
| **available**  | 实际可用内存（free + 可回收 cache），更准确 |

如果 Swap 使用很多（used 很大），说明内存紧张。

⚠️ 常见误区：

> “free 很小是不是内存不够用了？”
> 
> ❌ 错。Linux 会尽量利用空闲内存做缓存，提高性能。  真正可用内存是 ​**available**​。

## 进程信息区

`PID USER      PR  NI    VIRT    RES    SHR S  %CPU  %MEM     TIME+ COMMAND`

| **列名**                | 含义                                                                                   |
| ------------------------------- | ---------------------------------------------------------------------------------------- |
| **PID**                 | 进程号（Process ID）                                                                   |
| **USER**                | 启动该进程的用户                                                                       |
| **PR**                  | 优先级（Priority）数值越小优先级越高                                                   |
| **NI**                  | nice值（影响调度优先级，默认0）                                                        |
| **VIRT**                | 进程使用的虚拟内存总量（包含共享库、未实际分配的内存）                                 |
| **RES**                 | 常驻内存（Resident Set Size），即实际占用的物理内存，不含 swap                         |
| **SHR**                 | 共享内存大小（共享库等）                                                               |
| **S**                   | 进程状态：`R`=运行、`S`=睡眠、`D`=不可中断睡眠、`T`=停止、`Z`=僵尸 |
| **%CPU**                | CPU 占用百分比（多核系统可超过100）                                                    |
| **%MEM**                | 占物理内存百分比                                                                       |
| ​**TIME**​**+** | 进程累计占用 CPU 的时间（user + sys）                                                  |
| **COMMAND**             | 可执行文件或命令名称                                                                   |

#### RES

> **​RES 是进程当前驻留在物理内存（​**​​**RAM**​​**）中的总字节数**​。 它表示该进程的页表中，有多少页真正加载在内存中（没有被 swap 出去）。

**RES** 实际上是这三类内存的总和：

| **内存类型**                        | **说明**                                          |
| ------------------------------------------- | --------------------------------------------------------- |
| **私有匿名页（Private Anonymous）** | 比如堆（malloc/new）、栈、临时分配内存                  |
| **私有文件映射页（Private File）**  | 比如只被该进程使用的 mmap 文件                          |
| **共享页（Shared Pages）**          | 比如共享库、fork 后 copy-on-write 未触发的页、shm/tmpfs |

即：

**`RES = 私有内存 + 共享内存`**

# 查看进程私有内存

使用下面命令，可以查看更详细的内存占用

`cat /proc/<pid>/smaps_rollup`

| **列名**           | 含义                                                                                                                 |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| **Rss**            | Resident Set Size，进程实际驻留在物理内存中的总大小（包括共享内存）                                                  |
| **Pss**            | Proportional Set Size，分摊共享页后的真实占用                                                                        |
| **Shared\_Clean**  | 被多个进程共享、且未被修改的页面（通常是映射的可执行文件、动态库（如`.so`文件）、或只读共享内存）                |
| **Shared\_Dirty**  | 被多个进程共享、且已修改的页面（通常是共享内存（`shm`）、`mmap`写映射文件、或 copy-on-write 前的父子共享页） |
| **Private\_Clean** | 当前进程独占、但未修改（clean）的页面                                                                                |
| **Private\_Dirty** | 当前进程独占、且被修改过（dirty）的页面（堆、栈、写时复制 (COW) 页、mmap 写映射）                                    |

* 几个关键指标的关系

```TypeScript
Rss = Private_Clean + Private_Dirty + Shared_Clean + Shared_Dirty
Private = Private_Clean + Private_Dirty
Shared  = Shared_Clean + Shared_Dirty
```

所以：

* ​**USS**​**（独占内存） = Private = Private\_Clean + Private\_Dirty**
* **PSS**​**​ = Private + (Shared / N)** （N = 共享者数量）
* **RSS = Private + Shared**

## 以上面进程为例实际计算下

### PID 17（父）

![parent](https://github.com/zhangga/picx-images-hosting/raw/master/lm-parent.9ddcp1w7po.webp)

* **RSS** = 954,200 kB ≈ **932.6 ​**​**MB**
* **PSS** = 249,097 kB ≈ **243.4 ​**​**MB**  ← 每个映射到的进程分摊后的“真实占用”
* **​Private (​**​​**USS**​**)** = Private\_Clean + Private\_Dirty = 88,256 + 125,528 = **213,784 kB ≈ 208.8 ​**​**MB** ← 父进程独占的内存
* **Shared total** = Shared\_Clean + Shared\_Dirty = 70,124 + 670,292 = **740,416 kB ≈ 722.9 MB**
* **分摊的共享内存** = 722.9 MB / 21（父进程+20个子进程） = **34.4 MB**
* ​**验证**​：PSS(243.4) = Private(208.8) + 分摊的共享内存(34.4)

### PID 20（子）

![child](https://github.com/zhangga/picx-images-hosting/raw/master/lm-child.8l0h7bfh3k.webp)

* **RSS** = 790,216 kB ≈ **771.8 ​**​**MB**
* **PSS** = 85,198 kB ≈ **83.2 ​**​**MB**
* **​Private (​**​​**USS**​**)** = 0 + 49,952 = **49,952 kB ≈ 48.8 ​**​**MB**
* **Shared total** = 69,976 + 670,288 = **740,264 kB ≈ 722.8 MB**

### 非Fork下

Private的值占比会非常高（共享很少）
![nonfork](https://github.com/zhangga/picx-images-hosting/raw/master/lm-nofork.175ryjadc1.webp)

## 结论

父进程 fork 子进程时，Linux 不会立即复制内存页，而是：

* 父子共享同一份物理页；
* 这些页都标记为只读；
* 当任意一方写入时，触发 Copy-on-Write (​**COW**​)，内核才复制出新的页。

因此刚 fork 完时：

* 父子几乎完全共享；
* Private 很小，Shared 很大；
* RSS 大但 PSS 较小（因为共享页分摊了）。

# COW 后的变化趋势

随着运行时间增加、数据写入增多，各进程会对内存页发生 COW。来看几个指标的变化趋势：

| 指标                                     | 含义                                     | COW 后变化趋势 | 原因解释                                                        |
| ------------------------------------------ | ------------------------------------------ | ---------------- | ----------------------------------------------------------------- |
| Private\_Dirty                           | 私有的、已被修改的匿名页                 | 🔺 上升        | 写操作导致复制页，新页标记为 dirty。                            |
| Shared\_Clean / Shared\_Dirty            | 可共享的页（未写入）                     | 🔻 下降        | 原本共享的页被分裂成私有副本后不再共享。                        |
| RSS                                      | 实际驻留物理内存总量（Shared + Private） | 🔺 上升        | 每个进程都多了自己独有的副本，物理占用上升。                    |
| USS (Private\_Clean + Private\_Dirty)    | 独占的页（别的进程不共享）               | 🔺 上升        | 表示每个进程独占的内存越来越多。                                |
| PSS                                      | 平均分摊的真实占用                       | 🔺 上升缓慢    | 因为每个进程获得更多独占页（PSS≈USS+共享页/N），共享比例减少。 |
| 共享总量 (Shared\_Clean + Shared\_Dirty) | 各进程共同映射的物理页                   | 🔻 下降明显    | 页逐渐不再被多个进程共享。                                      |
| 总系统内存使用量                         | 所有进程 RSS 的并集                      | 🔺 显著上升    | 因为同一页被多次复制后，物理上变成多份。                        |

