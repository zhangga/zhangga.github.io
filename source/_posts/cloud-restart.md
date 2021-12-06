---
title: 云服务器重启事项
date: 2019-03-13 19:50:13
tags:
  - 网站
id: cloud-restart
categories:
  - 笔记
---

今天遇到腾讯云服务器控制台连上就断开的问题。和腾讯云沟通后反馈可能是由于cpu长时间负载过高引起的。

![云服务器重启时需要启动的服务 - 第1张  | 张嘎](https://i2.wp.com/192.144.167.243/blog/wp-content/uploads/5-2.png?resize=640%2C111)

登陆服务器后查看状态，发现进程：dblaunch的cpu负载高达200%。最后定位问题发生在lampp配置和权限的问题。注释掉下面这两行重启即可。

![云服务器重启时需要启动的服务 - 第2张  | 张嘎](https://i0.wp.com/192.144.167.243/blog/wp-content/uploads/51.png?resize=640%2C388)

## 正好记录下重启服务器时需要启动的服务，以免遗漏。

1.lampp

2.redis

3./usr/local/server下需要启动的服务

4.maven仓库
