---
title: InfluxDB和Grafana搭建监控服务
date: 2021-12-16 23:53:10
tags:
	- 笔记
id: influxdb-grafana
categories:
	- 笔记
---

本篇为监控服务的环境搭建教程。

## Docker安装

docker环境可选安装，方便之后可能选择使用influxDB的docker安装环境。

[安装教程](https://cloud.tencent.com/developer/article/1701451)

#### 问题一：

![WX20211217-005210@2x-AlSghZ](https://cdn.jsdelivr.net/gh/zhangga/gitment-comments@master/uPic/2021-12/WX20211217-005210@2x-AlSghZ.png)

当前python环境为python3，修改/usr/bin/yum-config-manager使用的python版本为2即可。如下图

![WX20211217-005513@2x-8lyFc6](https://cdn.jsdelivr.net/gh/zhangga/gitment-comments@master/uPic/2021-12/WX20211217-005513@2x-8lyFc6.png)



## InfluxDB

1. [Install InfluxDB as a service with systemd](https://docs.influxdata.com/influxdb/v2.1/install/?t=Linux#install-influxdb-as-a-service-with-systemd)

   我的是CentOS的系统，使用yum方式安装如下：

   ![20211220115000-i3NQOj](https://cdn.jsdelivr.net/gh/zhangga/gitment-comments@master/uPic/2021-12/20211220115000-i3NQOj.jpg)

   ![20211220115209-ElUVDl](https://cdn.jsdelivr.net/gh/zhangga/gitment-comments@master/uPic/2021-12/20211220115209-ElUVDl.jpg)

   启动influxd：

   ![20211220115329-zLOFBX](https://cdn.jsdelivr.net/gh/zhangga/gitment-comments@master/uPic/2021-12/20211220115329-zLOFBX.jpg)

2. [Docker方式安装](https://docs.influxdata.com/influxdb/v2.1/install/?t=Docker)

#### 问题一：

如果服务器上已经使用yum安装了其他版本的influxDB，可以选择将旧版本卸载。

```
rpm -q influxdb
rpm -e influxdb
rpm -q influxdb
```



## grafana

[安装指南](https://cloud.tencent.com/developer/article/1411555)

在腾讯云服务器(CentOS)上安装成功。

![WX20211217-002036@2x-x6aO5K](https://cdn.jsdelivr.net/gh/zhangga/gitment-comments@master/uPic/2021-12/WX20211217-002036@2x-x6aO5K.png)

https://www.jianshu.com/p/21ce6ee143f3

