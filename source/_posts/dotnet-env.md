---
title: mac下.net环境问题
date: 2024-06-13 21:02:24
tags:
	- 笔记
id: dotnet-env
categories:
	- 笔记
---

# 官方文档

* https://learn.microsoft.com/zh-cn/dotnet/core/runtime-discovery/troubleshoot-app-launch?pivots=os-macos

我遇到的问题是mac上装了多个.net环境，在Rider下运行.net程序报错，.NET location: Not found。

# .net相关路径

1. Mac下.net的安装路径在该文件下

   `/etc/dotnet/install_location`

2. 我的电脑上两个.net的路径在

   * /usr/local/share/dotnet/
   * ~/.dotnet

3. 删除一个多余的，只保留一个
