---
title: Weex环境搭建
date: 2018-07-25 20:36:23
tags:
  - 前端
id: weex-dev0
categories:
  - 笔记
---

## 一、安装node.js

点击链接 [http://nodejs.cn/download/](https://link.jianshu.com/?t=http://nodejs.cn/download/) 选择你需要安装的版本（windows ，mac，linux 3种系统的版本），下载你需要的版本

![Weex环境搭建 - 第1张  | 张嘎](https://i0.wp.com/upload-images.jianshu.io/upload_images/63643-4c3b9f270d217291.png?w=640&ssl=1)

<!--more-->

点击安装包，下一步，下一步，安装完成即可。
执行查看node版本号

```
node -v
```

显示当前node版本号

```
deiMac:~ li$ node -v
v8.1.0
```

查看npm配置信息

```
npm config ls
```

2.修改路径

这里需要修改两个路径，module路径和cache路径

module对应prefix

cache对应cache

首先在别的盘新建两个目录

D:\nodejs\node_global

D:\nodejs\node_cache

然后依次执行

修改配置文件（userconfig C:\Users\zhangga\.npmrc）中对应的路径

或者命令行修改

npm config set prefix”D:\nodejs\node_global”

npm config set cache”D:\nodejs\node_cache”

3.修改环境变量

新增环境变量 NODE_HOME

![Weex环境搭建 - 第2张  | 张嘎](https://blog.csdn.net/wkkyo/article/details/52799488)

![Weex环境搭建 - 第3张  | 张嘎](https://img-blog.csdn.net/20161013135353107?watermark/2/text/aHR0cDovL2Jsb2cuY3Nkbi5uZXQv/font/5a6L5L2T/fontsize/400/fill/I0JBQkFCMA==/dissolve/70/gravity/Center)

修改Path，追加 %NODE_HOME%\;%NODE_HOME%\node_global\;

使用淘宝NPM源

```
$ npm install -g cnpm --registry=https://registry.npm.taobao.org
```

## 二、安装webpack

```
//全局安装
$ cnpm install -g webpack
```

或者

```
//安装到你的项目目录
$ cd 你的工程目录
$ cnpm install --save-dev webpack
```

## 三、安装serve

```
//全局安装
$ cnpm install -g serve
```

或者

```
//安装到你的项目目录
$ cd 你的工程目录
$ cnpm install  serve
```

## 四、安装weexpack

首先，全局安装 weex-pack 命令：

```
$ cnpm install -g weexpack
```

或者 在 clone 的 weexpack 根目录下执行

```
$ cnpm install
```

1. 创建 weexpack 工程

```
$ weexpack create appName
```

使用WebStrom打开创建的工程目录如下

![Weex环境搭建 - 第4张  | 张嘎](https://i2.wp.com/upload-images.jianshu.io/upload_images/63643-9f0f43e765b4f787.png?w=640)

2.进入创建的工程目录，并且安装相关依赖

```
$ cd appName && cnpm install
```

安装完第三方依赖，工程目录添加了node_modules目录

![Weex环境搭建 - 第5张  | 张嘎](https://i0.wp.com/upload-images.jianshu.io/upload_images/63643-ef5d1f547e4d5e25.png?w=640)

### weex-toolkit和weexpack的区别

weex-toolkit 初始化的项目是针对开发单个 Weex 页面而设计的，也就是说这样的项目只包括单个页面开发需要的东西，比如前端页面源文件、webpack 配置、npm 脚本等。项目产生的输出就是一个 JS Bundle 文件，可以自由的进行部署。
weex-pack 是初始化一个完整的 App 工程，包括 Android 和 iOS 的整个 App 起步，前端页面只是其中的一部分。这样的项目最终产出是一个 Android App 和一个 iOS App。

## 五、创建.babelrc文件

将ES6转成ES5代码执行

```
{ "presets": ["es2015"] }
```

## 六、发布安卓

安装androidSDK，配置环境变量。

npm run build

weex platform add android

weex build android

坑：
