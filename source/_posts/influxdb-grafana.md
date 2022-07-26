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

[安装教程](https://cloud.tencent.com/developer/article/1701451)

#### 问题一：

![WX20211217-005210@2x-AlSghZ](https://raw.githubusercontent.com/zhangga/gitment-comments/master/uPic/2021-12/WX20211217-005210@2x-AlSghZ.png)

当前python环境为python3，修改/usr/bin/yum-config-manager使用的python版本为2即可。如下图

![WX20211217-005513@2x-8lyFc6](https://raw.githubusercontent.com/zhangga/gitment-comments/master/uPic/2021-12/WX20211217-005513@2x-8lyFc6.png)



## InfluxDB

下面一是service方式安装，二是docker方式安装，按需选择一种方式安装即可，**推荐方式1**。

1. [Install InfluxDB as a service with systemd](https://docs.influxdata.com/influxdb/v2.1/install/?t=Linux#install-influxdb-as-a-service-with-systemd)

   我的是CentOS的系统，使用yum方式安装如下：

   ![20211220115000-i3NQOj](https://raw.githubusercontent.com/zhangga/gitment-comments/master/uPic/2021-12/20211220115000-i3NQOj.jpg)

   ![20211220115209-ElUVDl](https://raw.githubusercontent.com/zhangga/gitment-comments/master/uPic/2021-12/20211220115209-ElUVDl.jpg)

   启动influxd：

   ![20211220115329-zLOFBX](https://raw.githubusercontent.com/zhangga/gitment-comments/master/uPic/2021-12/20211220115329-zLOFBX.jpg)

2. 也可以选择[Docker方式安装](https://docs.influxdata.com/influxdb/v2.1/install/?t=Docker)

#### 问题一：

如果服务器上已经使用yum安装了其他版本的influxDB，可以选择将旧版本卸载。

```
rpm -q influxdb
rpm -e influxdb
rpm -q influxdb
```



## Grafana

* 使用Grafana官网服务

  1. https://grafana.com/grafana/

  2. 创建自己的grafana cloud，如：https://zhangga.grafana.net/

  3. 配置数据源![ds1-qTTC9g](https://raw.githubusercontent.com/zhangga/gitment-comments/master/uPic/2021-12/ds1-qTTC9g.jpg)

     ![ds2-3lfW1i](https://raw.githubusercontent.com/zhangga/gitment-comments/master/uPic/2021-12/ds2-3lfW1i.jpg)

     ![ds3-Ve1we7](https://raw.githubusercontent.com/zhangga/gitment-comments/master/uPic/2021-12/ds3-Ve1we7.jpg)

  4. 配置监控面板

     ![ds4-LUiCLt](https://raw.githubusercontent.com/zhangga/gitment-comments/master/uPic/2021-12/ds4-LUiCLt.jpg)

* 云服务器安装Grafana
  1. [安装指南](https://cloud.tencent.com/developer/article/1411555)。
  2. 在腾讯云服务器(CentOS)上安装成功。
  3. 配置数据源同上。

![WX20211217-002036@2x-x6aO5K](https://raw.githubusercontent.com/zhangga/gitment-comments/master/uPic/2021-12/WX20211217-002036@2x-x6aO5K.png)

