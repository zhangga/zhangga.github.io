---
title: prometheus+grafana搭建监控服务
date: 2022-08-01 19:25:59
tags:
  - 监控
id: prometheus
categories:
  - 笔记
---

### 前言

之前使用过InfluxDB+Grafana的方案，主动push监控数据，现在使用Prometheus pull数据的方案，相比前一种方案，现在这种在部署上更加方便。**推荐**。

# Grafana

#### 安装

可以参考另外一篇文章: [InfluxDB和Grafana搭建监控服务](http://kwaibook.com/influxdb-grafana/)

#### Linux服务器安装

1. [官网](https://grafana.com/grafana/download)选择对应的版本下载并安装。

2. 启动grafana

   ```
   [root@cxm ~]#systemctl daemon-reload
   [root@cxm ~]#systemctl start grafana-server
   [root@cxm ~]#systemctl stop grafana-server
   [root@cxm ~]#systemctl restart grafana-server
   [root@cxm ~]#systemctl status grafana-server
   [root@cxm ~]#systemctl enable grafana-server
   ```

3. 开放3000端口

   ```
   [root@cxm ~]#firewall-cmd --list-ports
   [root@cxm ~]#firewall-cmd --add-port=3000/tcp --zone=public --permanent
   [root@cxm ~]#firewall-cmd --reload
   ```

   或者直接关闭防火墙

# Prometheus

#### 安装Prometheus

1. 创建prometheus用户，将相关的都放在该用户下，参考[文章](https://cloud.tencent.com/developer/article/1445255)
2. [官网](https://prometheus.io/download/)下载
3. 按照[文章](https://cloud.tencent.com/developer/article/1445255)中的步骤以systemctl方式启动，注意新建的data文件夹需要是prometheus用户权限的

#### 安装node_exporter

* 用来上报机器性能数据，在prometheus的官网有。

* 按照[文章](https://cloud.tencent.com/developer/article/1445255)中的方式以systemctl 启动。

  

详细参考文章：

https://mp.weixin.qq.com/s/ZXlBPHGcWeYh2hjBzacc3A

https://blog.csdn.net/shenyuanhaojie/article/details/121775976
