---
title: influxDB和grafana环境搭建
date: 2021-12-16 23:53:10
tags:
	- 笔记
id: influxdb-grafana
categories:
	- 笔记
---

本篇为监控服务的环境搭建教程。

## Docker安装

[安装教程](https://cloud.tencent.com/developer/article/1701451)

#### 问题一：

![WX20211217-005210@2x-AlSghZ](https://cdn.jsdelivr.net/gh/zhangga/gitment-comments@master/uPic/2021-12/WX20211217-005210@2x-AlSghZ.png)

当前python环境为python3，修改/usr/bin/yum-config-manager使用的python版本为2即可。如下图

![WX20211217-005513@2x-8lyFc6](https://cdn.jsdelivr.net/gh/zhangga/gitment-comments@master/uPic/2021-12/WX20211217-005513@2x-8lyFc6.png)



## influxDB

[Docker方式安装](https://docs.influxdata.com/influxdb/v2.1/install/?t=Docker)

上面为使用Docker的方式安装，在腾讯云服务器(CentOS)上成功。文档中也有在Linux服务器上安装的方式。

![WX20211217-010459@2x-VqTczr](https://cdn.jsdelivr.net/gh/zhangga/gitment-comments@master/uPic/2021-12/WX20211217-010459@2x-VqTczr.png)



## grafana

[安装指南](https://cloud.tencent.com/developer/article/1411555)

在腾讯云服务器(CentOS)上安装成功。

![WX20211217-002036@2x-x6aO5K](https://cdn.jsdelivr.net/gh/zhangga/gitment-comments@master/uPic/2021-12/WX20211217-002036@2x-x6aO5K.png)

https://www.jianshu.com/p/21ce6ee143f3

