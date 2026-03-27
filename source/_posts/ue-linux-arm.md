---
title: 交叉编译DS LinuxArm64
tags:
  - UE
id: ue-linux-arm
categories:
  - 笔记
date: 2026-03-24 13:52:49
---

[虚幻引擎的Linux开发要求 | 虚幻引擎 5.7 文档 | Epic Developer Community](https://dev.epicgames.com/documentation/zh-cn/unreal-engine/linux-development-requirements-for-unreal-engine?application_version=5.7#cross-compile-toolchain)

> **交叉编译**让游戏开发者可以在Windows上对Linux进行开发。 目前，交叉编译仅支持Windows，而Mac用户目前只能使用<u>[原生编译](https://dev.epicgames.com/documentation/zh-cn/unreal-engine/linux-development-requirements-for-unreal-engine?application_version=5.5#native-toolchain)</u>。 此外，我们支持、测试并提供了适用于Linux-x86\_64平台的库和工具链。

# Window环境

参考文章：https://aws.amazon.com/cn/blogs/gametech/compiling-unreal-engine-5-dedicated-servers-for-aws-graviton-ec2-instances/

### 安装工具

* 安装交叉编译的工具

https://dev.epicgames.com/documentation/en-us/unreal-engine/linux-development-requirements-for-unreal-engine?application\_version=5.7

![](https://github.com/zhangga/picx-images-hosting/raw/master/dsarm64_1.7p46648w12.webp)

### Plugin支持

整理项目下的Plugins目录，确保Server用到的插件，都添加了`LinuxArm64`平台的支持。

示例：SkinnedDecalComponent.uplugin

```JSON
{
        "FileVersion": 3,
        "Version": 13,
        "VersionName": "3.0",
        "FriendlyName": "SkinnedDecalComponent",
        "Description": "Decal system that follows Skeletal Mesh Bone Deformations & Morph Targets.",
        "Category": "Rendering",
        "CreatedBy": "Eddie Ataberk",
        "CreatedByURL": "",
        "DocsURL": "https://docs.google.com/document/d/143XU1cLZiNeu347StrXHoC3RRKb8tRS-z-wtS2RvTA8",
        "MarketplaceURL": "com.epicgames.launcher://ue/marketplace/product/05b6b0f2f8f049aaa469a1da4e09275c",
        "SupportURL": "",
        "EngineVersion": "5.7.1",
        "CanContainContent": true,
        "Installed": true,
        "Modules": [
                {
                        "Name": "SkinnedDecalComponent",
                        "Type": "Runtime",
                        "LoadingPhase": "Default",
                        "PlatformAllowList": [
                                "Win64",
                                "Mac",
                                "Linux",
                                "LinuxArm64",
                                "IOS",
                                "Android",
                                "XSX",
                                "PS5",
                                "WinGDK"
                        ]
                }
        ]
}
```

### 编译

```bash
sudo apt update​
sudo apt install -y \​
    build-essential cmake ninja-build automake libtool pkg-config autoconf \​
    unzip git subversion wget curl \​
    libssl-dev libcurl4-openssl-dev \​
    python3 python3-pip \​
    libglib2.0-0 libatk1.0-0 libatk-bridge2.0-0 libdrm2 libxcomposite1 libxdamage1 \​
    libxfixes3 libxrandr2 libgbm1 libxkbcommon0 libxkbcommon-x11-0 libpango1.0-0 libasound2 \​
    apt-transport-https ca-certificates gnupg-agent software-properties-common
```

在FortniteServer.Target.cs上加入一行:
```C#
if (Target.Platform == UnrealTargetPlatform.LinuxArm64)
{
  	// 优化 linux-arm64 编译,指定最小的cpu类型
		MinArm64CpuTarget = Arm64TargetCpuType.Graviton3;
    // 如果运行支持在AVX2架构上，换成这一行
    // MinCpuArchX64 = MinimumCpuArchitectureX64.AVX2;
    // 这样可以让游戏在构建时启用针对这些平台的专用优化。
    // 根据我们的观察，这样做大约能带来8%的cpu开销下降。
}
```

* Cook

![](https://github.com/zhangga/picx-images-hosting/raw/master/dsarm64_2.3ns6rqcm0f.webp)

* Pack

![](https://github.com/zhangga/picx-images-hosting/raw/master/dsarm64_3.77e4hjfbse.webp)

* 添加可执行权限

chmod +x xxxxxServer

![](https://github.com/zhangga/picx-images-hosting/raw/master/dsarm64_4.175yct5q42.webp)

* 准备项目其他环境

DS启动需要打包过程中生成的`Version`文件，由于Windows工作流下没有这一步，直接在打包好的根目录下添加下即可。

```SQL
$ cat Version     
Trunk-Test0
commit 25e125d515f695184
Merge: 3d09e0d c30888
Author: xxxxx
Date:   Sun Jan 4 16:43:18 2026 +0800

    Merge branch 'xxxx' of xxxx/unreal-engine into xxxxx
------------------------------------------------------------------------
r2079371 | xxxxxx | 2026-01-05 22:18:18 +0800 (Mon, 05 Jan 2026) | 1 line

【UI】【任务系统】任务界面资源入版
------------------------------------------------------------------------
ClientVersion:{"Dun_Ver": 116, "Camp_Ver": 107, "DsInter_Ver": 104}
```

![](https://github.com/zhangga/picx-images-hosting/raw/master/dsarm64_5.2oc3ek9uuo.webp)

### 运行

启动DSAgent项目运行即可。

### 镜像

扩展Dockerfile支持交叉编译

```Dockerfile
# 编译 DSAgent 进程
FROM --platform=$BUILDPLATFORM ​golang:1.25.5-bookworm as builder

ARG TARGETOS
ARG TARGETARCH
ARG SERVER_VERSION=unknown
ARG COMMIT_SHA1=unknown
ARG COMMIT_MSG_RAW=unknown

ENV SERVER_VERSION=${SERVER_VERSION}
ENV COMMIT_SHA1=${COMMIT_SHA1}
ENV COMMIT_MSG_RAW=${COMMIT_MSG_RAW}

RUN apt-get update && apt-get install -y \
    build-essential git bash perl \
    gcc-aarch64-linux-gnu g++-aarch64-linux-gnu \
    && rm -rf /var/lib/apt/lists/*

ENV GOPROXY='https://goproxy.cn,https://goproxy.io,direct'
ENV GOPRIVATE='xxx.org/*'

WORKDIR /app

COPY go.mod go.sum ./
RUN go mod download

COPY . ./

RUN if [ "${TARGETARCH}" = "arm64" ]; then \
      export CC=aarch64-linux-gnu-gcc; \
      export CXX=aarch64-linux-gnu-g++; \
    fi && \
    GOOS=${TARGETOS} GOARCH=${TARGETARCH} \
    CGO_ENABLED=1 \
    make build \
    SERVER_VERSION="$SERVER_VERSION" \
    COMMIT_SHA1="$COMMIT_SHA1" \
    COMMIT_MSG_RAW="$COMMIT_MSG_RAW"

# 构建最终镜像
FROM debian:12

# 构建参数接收版本号
ARG APP_VERSION
# 设置环境变量（容器运行时可用）
ENV APP_VERSION=$APP_VERSION

RUN set -eux; \
    if [ -f /etc/apt/sources.list ]; then \
      sed -i 's|deb.debian.org|mirrors.xxx.org|g' /etc/apt/sources.list; \
    else \
      printf '%s\n' \
        "deb http://mirrors.xxx.org/debian bookworm main contrib non-free" \
        "deb http://mirrors.xxx.org/debian-security bookworm-security main contrib non-free" \
        "deb http://mirrors.xxx.org/debian bookworm-updates main contrib non-free" \
        > /etc/apt/sources.list; \
    fi

RUN apt-get update && \
  apt-get install -y dstat sysstat iftop gdb sudo python3 && apt clean && \
  rm -rf /var/lib/apt/lists/*

RUN useradd -m xxx
RUN echo "xxx ALL=(ALL) NOPASSWD:ALL" >> /etc/sudoers
WORKDIR /home/xxx

USER xxx
ENV LANG=C.UTF-8

# 拷贝dsagent相关文件
COPY --from=builder ​--chown=xxx:xxx /app/bin ./
COPY --from=builder ​--chown=xxx:xxx /app/configs ./configs

# 拷贝docker需要的文件
COPY --from=builder ​--chown=xxx:xxx /app/docker ./

# 拷贝DS相关文件
RUN mkdir -p ./XXXX/CmdLines
COPY --chown=xxx:xxx ds_general/Engine ./XXXX/LinuxServer/Engine
COPY --chown=xxx:xxx ds_general/*.* ./XXXX/LinuxServer/
COPY --chown=xxx:xxx ds_general/xxxx/Binaries ./XXXX/LinuxServer/xxxx/Binaries
COPY --chown=xxx:xxx ds_general/xxxx/Content ./XXXX/LinuxServer/xxxx/Content
COPY --chown=xxx:xxx ds_general/Version ./XXXX/LinuxServer/

ENTRYPOINT ["./dsagent"]
CMD ["run", "-c=configs/config_prod.yaml"]
```

#### 支持同Tag多架构

