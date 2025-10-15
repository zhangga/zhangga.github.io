---
title: UE DS服管理
date: 2025-06-24 10:14:32
tags: 
	- UE
id: ue_ds_manager
categories:
	- 笔记
---

# 场景服管理
## 场景服v1.0
场景服最初的流程如下：
* ds除了战场外，还会根据启动参数，跑ping
* 一个Pod下多个战场进程，父进程fork固定数量的子进程
* 战场进程将自己注册到etcd中，key: $namespace/$service_type/$ip:$port/$version，通过租约和进程退出时删除key来保证key的时效
* 场景服watch etcd中注册的key，来感知当前战场
* 战场分配时通过抢占stateKey: $namespace/$service_type/$ip:$port/$version/state
* 抢占到state后，表示战场被分配，场景服和战场服建立连接，剩下的就是业务上的内容：初始化战场、玩家数据，战场结算等
优势：
流程简单
局限：
* etcd注册的key太多
* 战场和场景服的连接过多
* 缺少战场管理，只有简单的注册和分配。无法实现自动扩缩容

注意：

## 加入Agones

## 场景服v2.0
