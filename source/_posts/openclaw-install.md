---
title: openclaw-install
tags:
  - AI
id: openclaw-install
categories:
  - 笔记
date: 2026-03-23 21:32:59
---

# 安装 OpenClaw

1. Windows下，以管理员身份打开 PowerShell。

![](https://github.com/zhangga/picx-images-hosting/raw/master/openclaw-1.2kshfvb7dc.webp)

2. 执行以下命令安装 OpenClaw。

* Windows：`iwr -useb `​`https://openclaw.ai/install.ps1`​` | iex`
* MacOS：`curl -fsSL `​`https://openclaw.ai/install.sh`​` | bash`

# 配置 OpenClaw

安装后，根据引导进行配置。如果跳过了的话，或者需要重新配置，使用命令：

`openclaw onboard --install-daemon`

1. Yes
2. QuickStart

![](https://github.com/zhangga/picx-images-hosting/raw/master/openclaw-2.3rbsoh1pik.webp)

3. Skip for now
4. All providers
5. Keep current

![](https://github.com/zhangga/picx-images-hosting/raw/master/openclaw-3.1apk9jvncz.webp)

6. Skip for now
7. Skip for now

![](https://github.com/zhangga/picx-images-hosting/raw/master/openclaw-4.6m4gu9i34e.webp)

8. Yes

![](https://github.com/zhangga/picx-images-hosting/raw/master/openclaw-5.1lce2pbm3n.webp)

9. 空格选中Skip for now，然后回车确认

![](https://github.com/zhangga/picx-images-hosting/raw/master/openclaw-6.2h8vi5lp0x.webp)

10. 接下来几个API相关的全默认的No

![](https://github.com/zhangga/picx-images-hosting/raw/master/openclaw-7.45i8fccbtp.webp)

11.  hooks相关的，除了Skip for now之外，全部用空格选中，然后回车确认

![](https://github.com/zhangga/picx-images-hosting/raw/master/openclaw-8.7lkk7fmlmm.webp)

12. Open the Web UI

![](https://github.com/zhangga/picx-images-hosting/raw/master/openclaw-9.4690y8v7g.webp)

13.  http://127.0.0.1:18789/chat?session=main

![](https://github.com/zhangga/picx-images-hosting/raw/master/openclaw-10.2kshfvfr3z.webp)

14.  同时后台会有一个gateway进程运行，不要关闭

![](https://github.com/zhangga/picx-images-hosting/raw/master/openclaw-11.58hxq8a6js.webp)

15.  OpenClaw启动成功！

# 配置大模型

可以使用火山云的 [Coding Plan计划](https://www.volcengine.com/activity/codingplan)，收费可控。

1. [获取 API Key](https://console.volcengine.com/ark/region:ark+cn-beijing/apikey)。先准备好大模型的API Key，可以参考火山云的文档

https://www.volcengine.com/docs/82379/2183190?lang=zh#f05bb565

2. 在PowerShell输入命令：`openclaw config`

![](https://github.com/zhangga/picx-images-hosting/raw/master/openclaw-12.26m1p08ucm.webp)

3. Local
4. Model

![](https://github.com/zhangga/picx-images-hosting/raw/master/openclaw-13.8hh1mvxo6e.webp)

5. Volcano Engine

![](https://github.com/zhangga/picx-images-hosting/raw/master/openclaw-14.73uiiumm5h.webp)

6. Paste API key now

![](https://github.com/zhangga/picx-images-hosting/raw/master/openclaw-16.et2u3phgx.webp)

7. 复制第一步准备好的API Key

![](https://github.com/zhangga/picx-images-hosting/raw/master/openclaw-17.3d5cxlxqy8.webp)

![](https://github.com/zhangga/picx-images-hosting/raw/master/openclaw-18.73uiiumm5p.webp)

8. 保持默认的 `volcengine-plan/ark-code-latest` 即可

![](https://github.com/zhangga/picx-images-hosting/raw/master/openclaw-19.232frafrn0.webp)

9. Continue 完成配置

![](https://github.com/zhangga/picx-images-hosting/raw/master/openclaw-20.6f18ytz357.webp)

10. 在PowerShell输入命令，重启生效：`openclaw gateway restart`

![](https://github.com/zhangga/picx-images-hosting/raw/master/openclaw-22.83alw0pdbd.webp)

# 常用命令

* 重启网关：`openclaw gateway restart`
* 打开主界面：`openclaw dashboard`  或者加 --no-open 查看连接和token，以便在其他机器上访问
