---
title: JVisualVM远程调试
date: 2018-08-01 10:51:44
tags:
  - 笔记
id: jvm-remote
categories:
  - 笔记
---

# 一、使用jstatd

linux下使用 hostname -i  查看hostname对应的IP

确保远程连接使用的ip在列表里，不在的话jvisualvm无法使用ip远程连接。

不在的话vi /etc/hosts  在里面加入。

<!--more-->

进入jdk的bin目录下：/usr/java/jdk1.8/bin/

新建文件jstatd.all.policy

写入内容：

grant codebase “file:${java.home}/../lib/tools.jar” {
permission java.security.AllPermission;
};

编写启动脚本：startJstatd.sh

\#!/bin/bash
nohup $JAVA_HOME/bin/jstatd -J-Djava.rmi.server.hostname=172.16.200.82 -p 1099 -J-Djava.security.policy=jstatd.all.policy -J-Dcom.sun.management.jmxremote.authenticate=false -J-Dcom.sun.management.jmxremote.ssl=false -J-Dcom.sun.management.jmxremote.port=1199 &

（-J-Djava.rmi.server.logCalls=true  参数能看到日志输出）

脚本里有jstatd 和 jmx的配置。只要jstatd的配置也OJBK。

确保linux的jstatd端口（默认1099）对外开放，然后使用jvisualvm远程连接即可。

# 二、使用jmx

找到配置文件$JAVA_HOME/jre/lib/management/jmxremote.password.template,复制一份并改名为jmxremote.password,

使用chmod +w jmxremote.password  将文件加入写权限

然后打开jmxremote.passwrod，取消以下两行注释：

\#monitorRole QED#controlRole R&D monitorRole为用户名 QED为密码 执行：chmod 400 jmxremote.password指令。 JVM启动脚本加入启动参数：JAVA_PARAMS=”$JAVA_PARAMS -Djava.rmi.server.hostname=47.95.10.167 -Dcom.sun.management.jmxremote.port=1199 -Dcom.sun.management.jmxremote.ssl=false -Dcom.sun.management.jmxremote.authenticate=true”（可以关闭验证也OJBK）

