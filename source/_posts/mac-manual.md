---
title: Mac使用手册
date: 2021-10-08 21:32:29
tags:
	- 笔记
id: mac-manual
categories:
	- 笔记
---

### [Mac新手使用指南](https://post.smzdm.com/p/679153/)



# MAC环境安装

1. **iTerm2安装**

https://iterm2.com/

2. **brew安装**

`/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"`

将以上命令粘贴至终端。参考：https://brew.sh/index_zh-cn

3. **golang环境安装**

安装golang最新版。

`brew install go`

查看版本：

`go version`

配置golang环境变量：

打开 ~/.bash_profile 文件，没有的话新建，在最后输入

`export GOPATH=Go 开发包的默认安装目录如：/usr/local/go`

`export GOBIN=$GOPATH/bin`

`export PATH=$PATH:$GOBIN`

`source  ~/.bash_profile` 文件，使之生效

zsh的配置文件为：~/.zshrc

多版本共存和切换：

https://www.jianshu.com/p/363e4d39e694

4. **goland安装**

官网下载最新版：https://www.jetbrains.com/go/

按照下面文档中**在线安装方式**，安装goland无限试用插件：

https://cloud.tencent.com/developer/article/1822218

5. **GitLab sshkey**

安装git：

`brew install git`

安装步骤生成ssh key：

https://www.jianshu.com/p/253ca7c2e80c

将ssh key添加到gitlab中：

如下图所示：

![img](https://cdn.nlark.com/yuque/0/2021/png/23040547/1635316093307-f25b8425-ab02-4ec9-b6ed-ef09e568fb2f.png)

6. **Docker安装**

`brew install --cask --appdir=/Applications docker`

7. **svn安装**

svn client命令行安装：

`brew install svn`

mac也可选择Cornerstone。

8. **MongoDB安装**

`brew tap mongodb/brew`

`brew install mongodb-community@4.4`

配置mongo bin的PATH

在~/.bash_profile中追加PATH

`export MONGO_BIN=/usr/local/opt/mongodb-community@4.4/bin`

`export PATH=$PATH:$MONGO_BIN:.`

9. **golua环境**

- **首先安装lua环境：**

[官网](http://www.lua.org/download.html)下载最新版 lua-5.4.3.tar.gz

解压下载的压缩包，运行终端，进入解压后的文件夹

执行命令 `make macosx`

执行命令 `make test`

结果显示如下：

![img](https://cdn.nlark.com/yuque/0/2021/png/23040547/1635391960697-8ff980d8-906f-4e15-a0bf-f0a1a444e1e2.png)

执行命令 `sudo make install`，并输入密码，开始执行安装

安装完成后使用`lua -v` 查看版本

- **golua环境**

1. **添加文件/usr/local/lib/pkgconfig/lua5.4.pc**

内容如下：

prefix=/usr/local
exec_prefix=${prefix}
libdir=${exec_prefix}/lib
includedir=${prefix}/include

Name: liblua
Description: Lua5.4.3
Version: 5.4.3
Requires:
Libs: -L${libdir} -llua
Cflags: -I${includedir} -I${includedir}/lua

1. **终端执行：**`brew install pkg-config`
2. **终端执行：**`go get github.com/zhao02game/golua/lua`

10. **其他安装**

`brew install coreutils ag etcd redis zsh`

11. **终端定制**

https://segmentfault.com/a/1190000014992947

