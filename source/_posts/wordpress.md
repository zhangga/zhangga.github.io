---
title: WordPress上传权限问题及主题
date: 2018-10-11 20:19:37
tags:
  - 笔记
id: wordpress
categories:
  - 笔记
---

[![htjgKI.md.png](https://z3.ax1x.com/2021/08/30/htjgKI.md.png)](https://imgtu.com/i/htjgKI)

<!--more-->

打开所有写权限

chmod 777 /usr/local/lampp/htdocs/zzq/

修改文件夹所属用户组。查看用户组指令：cat /etc/group   别人都是www:www  我是daemon

chown -R daemon:daemon zzq

还原文件夹权限

chmod 755 /usr/local/lampp/htdocs/zzq/

## 主题网站

http://ztmao.com/
