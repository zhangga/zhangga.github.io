---
title: centos安装LLVM和CLANG
date: 2023-03-03 17:46:17
tags:
  - 笔记
id: llvm-clang
categories:
  - 笔记
---

在 CentOS 上安装 LLVM Clang 的过程如下:

1. 首先，确保系统已经更新并安装了必要的编译工具，如gcc和make，可以通过执行以下命令完成:

```go
sudo yum update
sudo yum install gcc make
复制代码
```

1. 下载LLVM和Clang的源码包。可以在LLVM官网下载最新版本的源码包，或者使用以下命令下载:

```bash
wget http://releases.llvm.org/<version>/llvm-<version>.src.tar.xz
wget http://releases.llvm.org/<version>/cfe-<version>.src.tar.xz
复制代码
```

1. 解压源码包并进入目录:

```xml
tar xf llvm-<version>.src.tar.xz
tar xf cfe-<version>.src.tar.xz
mv cfe-<version>.src llvm-<version>.src/tools/clang
cd llvm-<version>.src
复制代码
```

1. 使用以下命令来配置、编译和安装LLVM和Clang:

```bash
mkdir build
cd build
cmake -G "Unix Makefiles" ../
make
sudo make install
复制代码
```

1. 编译完成后，可以使用 clang 和 llvm-config 命令来检查安装是否成功。

注意: 上述的请替换成你要安装的版本号，如llvm-11.0.0
