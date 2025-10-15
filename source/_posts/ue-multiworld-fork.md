---
title: DS共享内存和多GameInstance性能对比
tags:
  - UE
id: ue-multiworld-fork
categories:
  - 笔记
date: 2025-10-15 14:58:47
---

# 背景描述

DS服目前使用共享内存（Fork）方案，一核可以跑25个，压测数据如下：
![insight-1](https://github.com/zhangga/picx-images-hosting/raw/master/mf-1.9kgkm6ldpf.webp)
![insight-2](https://github.com/zhangga/picx-images-hosting/raw/master/mf-2.8z6wzvvqoh.webp)
![insight-3](https://github.com/zhangga/picx-images-hosting/raw/master/mf-3.13m62jc2gh.webp)
![insight-4](https://github.com/zhangga/picx-images-hosting/raw/master/mf-4.3ns0f6e9ym.webp)

| 参数         | 数据     |
| -------------- | ---------- |
| CPU总核      | 16c \* 4 |
| 内存总量     | 64g \* 4 |
| 机器人数量   | 4800     |
| 营地数量     | 1600     |
| CPU最大占用  | <60%     |
| 内存最大占用 | <75%     |

# 预期目标

当前DS服使用 **16c\*64g ​**的机型，核心目标是降低内存占用，最终适配1:2的标配机型。

# 方案对比

鉴于多 GameInstance 与共享内存两种方案各有优劣，需通过实际跑测获取 CPU 占用、内存开销、稳定性等核心性能数据，基于准确对比结果确定最终技术方案。

| 对比维度     | 共享内存（Fork）                           | 单进程多GameInstance                                                                |
| -------------- | -------------------------------------------- | ------------------------------------------------------------------------------------- |
| 内存共享方式 | 物理内存页级共享（COW）                    | 资源只加载一份                                                                      |
| 内存开销     | 有COW的额外内存页开销                      | 无额外开销，资源内存共享，逻辑数据全部分离                                          |
| 资源加载     | 父进程预加载，子进程共享                   | 进程内加载一次，所有实例复用                                                        |
| 隔离级别     | 进程级隔离（崩溃不扩散，tick间相互没影响） | 实例级隔离（崩溃影响所有实例，tick卡顿影响其他实例）                                |
| 游戏测试     | 无额外负担                                 | 多个Instance被分配到同一个进程下，可能和分配到不同进程下，表现不一致（数据没隔离的bug） |
| 实例分配     | 无额外负担                                 | 更加复杂的分配和释放实例的策略                                                      |

## 测试环境

DS版本：`LinuxServer_Trunk-Testxxxx

```Bash
$ lscpu
Architecture:                         x86_64
CPU(s):                               32
Model name:                           Intel(R) Xeon(R) Gold 6462C
Thread(s) per core:                   2
Core(s) per socket:                   16
Socket(s):                            1
CPU MHz:                              3899.634
CPU max MHz:                          3900.0000
CPU min MHz:                          800.0000
L1d cache:                            768 KiB
L1i cache:                            512 KiB
L2 cache:                             32 MiB
L3 cache:                             60 MiB
```

```Bash
$ free -h
               total        used        free      shared  buff/cache   available
Mem:            60Gi        16Gi       3.0Gi        17Gi        41Gi        26Gi
Swap:             0B          0B          0B
```

## 测试用例

45个玩家分成15支队伍，进入15个DS服，在其中不停地移动和更换装备（这个用例的操作频率是要远高于线上玩家正常操作的）。

#### 共享内存

启动15个子进程，每个进程为一个营地实例

* 父进程

```Bash
game     2415317 2415299  1 14:27 ?        00:00:03 /data00/ds/Latest/MyProject/Binaries/Linux/MyProjectServer-Linux-Test -SvcType=xx -DsaPid=2415299 -DsaSock="/data00/dsagent/2415299.sock" -UdpHost=10.10.10.10 -NumMultiWorld=1 -Map="/Game/Project/Maps/MyMap" -NumForks=15 -WaitAndForkCmdLinePath=/data00/ds/CmdLines -BiPath="/data00/ds/logs/bi" -ABSLOG="/data00/ds/logs/MyProject_MyMap.log" -core -nothreading -longtimeouts -unattended
```

* 子进程

```Bash
game@n253-012-090:/data00/ds/logs$ cat /data00/ds/CmdLines/1

-SvcType=xx -DsaPid=2415299 -DsaSock="/data00/dsagent/2415299.sock" -Port=30001 -UdpHost=10.10.10.10 -ABSLOG="/data00/ds/logs/MyProject_30001.log" -BiPath="/data00/ds/logs/bi" -core -nothreading -longtimeouts -unattended -NODEFAULTLOG
```

#### 多GameInstance

启动一个进程，单进程下15个GameInstance实例

```Bash
game     2430225 2430210 11 16:26 ?        00:01:25 /data00/ds/Latest/MyProject/Binaries/Linux/MyProjectServer-Linux-Test -SvcType=xx -DsaPid=2430210 -DsaSock="/data00/dsagent/2430210.sock" -UdpHost=10.10.10.10 -Port=30001 -NumMultiWorld=15 -Map="/Game/Project/Maps/MyMap" -BiPath="/data00/ds/logs/bi" -ABSLOG="/data00/ds/logs/MyProject_30001.log" -nofork -core -nothreading -longtimeouts -unattended
```

## 测试结果

#### Fork vs 多Instance

![memo](https://github.com/zhangga/picx-images-hosting/raw/master/mf-mem.6ikokz1cro.webp)

#### Fork下父子

![parent](https://github.com/zhangga/picx-images-hosting/raw/master/mf-parent.102k4tuw06.webp)
![child](https://github.com/zhangga/picx-images-hosting/raw/master/mf-child.3d56m196us.webp)



# 结论

**多GameInstance方案在内存上有明显的优势。**

1. 场景启动后，玩家还没进入场景的时候，两者内存占用差不多
2. Fork模式下，玩家进入场景后内存明显增加（COW），5分钟后趋于稳定，内存增长了117%（1557m）
3. 多GameInstance模式下，玩家进入场景后内存就稳定了，内存增长了15%（189m）
