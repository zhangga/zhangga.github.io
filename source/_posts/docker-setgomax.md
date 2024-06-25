---
title: 容器下设置正确的GOMAXPROCS
date: 2024-02-27 14:30:07
tags:
	- 笔记
id: docker-setgomax
categories:
	- 笔记
---

# 遇到问题

跑在k8s容器的战斗验证服务启动了比resource limit更多的worker

`runtime.GOMAXPROCS` 默认设置为物理核心数。但当在加了resource limit的容器下 `runtime.GOMAXPROCS()` 获得的不是被限额的，依然是宿主机器的物理核心数。

当GOMAXPROCS超过了其分配的配额时，可能导致不必要的上下文切换和调度开销，因为更多的 goroutines 试图在有限的 CPU 时间片上运行。

# 解决

uber开源的https://github.com/uber-go/automaxprocs

自动将GOMAXPROCS设置到容器下被限额的cpu数

# 使用方法

import _ "go.uber.org/automaxprocs"

# 适用场景

当你的程序是计算密集型或者需要有固定worker数的类型时，并且要部署到容器环境中时，可以参考上面的方法来解决`GOMAXPROCS` 和cpu限额不匹配的问题

参考

https://nemre.medium.com/is-your-go-application-really-using-the-correct-number-of-cpu-cores-20915d2b6ccb

https://segmentfault.com/a/1190000043930543
