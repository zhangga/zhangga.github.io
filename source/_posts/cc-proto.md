---
title: cocos creator使用protobuf ts版
date: 2018-05-03 20:15:07
tags:
  - 前端
id: cc-proto
categories:
  - 笔记
---

一、安装npm nodejs下的包管理器

官网：https://nodejs.org  下载最新稳定版安装。如node-v8.11.4-x64.msi。

<!--more-->

双击安装

一路点next下去，安装完成。

在nodejs文件夹下新建两个文件夹：node_cache、node_global。

然后运行以下两条命令：

### npm config set prefix “D:\IDE\nodejs\node_global”

### npm config set cache “D:\IDE\nodejs\node_cache”

### npm config set registry=http://registry.npm.taobao.org  配置镜像站

配置完后使用npm config list显示所有配置信息。

### 增加环境变量NODE_PATH 内容是：D:\IDE\nodejs\node_global\node_modules

重启命令行生效。

二、安装protobufjs

命令行执行：npm init

然后安装：npm install protobufjs -g

安装成功后，在nodejs\node_global文件夹下有对应文件。

三、生成js、ts文件

编写proto文件。

进入node_modules.bin目录，或者添加到环境变量path里
\* 第一步生成js:
\* pbjs -t static-module -w commonjs -o test.js test.proto
\* 第二步生成ts:
\* pbts -o test.d.ts test.js

四、项目中使用proto

在项目的根目录下，运行命令

npm init

npm install protobufjs
