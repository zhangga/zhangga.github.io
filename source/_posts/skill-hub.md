---
title: SKILL/MCP 管理方案
tags:
  - AI
id: skill-hub
categories:
  - 笔记
date: 2026-04-30 16:46:16
---

# 背景

在电脑上第一次安装SKILL的时候，我就意识到这是一个高度定制化并且需要沉淀成个人资产的东西，不能今天看到一个好的SKILL，一个命令安装到电脑上爽了。下次一换电脑都不知道哪些SKILL是安装过的，哪些是没安装过的。

一个完备的SKILL管理应该支持下面的需求：

1. 一键分发到任何电脑上
2. 可以收集网上已有的优秀SKILL（公网[skill hub](https://skills.sh/)，他人的分享的skill代码），可以开发自己的SKILL
3. 对SKILL进行分类，按需安装，毕竟SKILL数量会慢慢膨胀

# 我的方案：

通过一键安装脚本来实现分发

```Markdown
curl -fsSL https://raw.githubusercontent.com/zhangga/aihub/main/skills/install.sh | bash
```

# 具体实现

使用Github仓库管理

## 仓库结构

![](https://github.com/zhangga/picx-images-hosting/raw/master/20260430-164911.wj60p2uih.webp)

- ​**\*\*[\`/skills\`](**​<u>./skills/</u>​**)\*\***​: 智能体扩展技能分发目录。这里存放最终对外发布和安装的 Agent 技能产物，内容由同步脚本统一生成和维护。
  
  - ​*\*详细技能列表和配置见 [skills 目录](*​<u>./skills/README.md</u>*)。\**
- ​**\*\*[\`/mcp**​​**\`](**​<u>./mcp/</u>​**)\*\***​: MCP Server 分发目录。这里存放跨客户端的一键安装脚本、registry 和 bundles，用于把 MCP server 写入 Codex、Claude Code、Claude Desktop、VS Code 等客户端配置。
- ​**\*\*[\`/local-skills\`](**​<u>./local-skills/</u>​**)\*\***​: 自研技能源码目录。用于存放你自己编写并希望纳入统一分发流程的本地 skills。
- ​**\*\*[\`/prompts\`](**​<u>./prompts/</u>​**)\*\***​: 高质量提示词模板库。沉淀了经过实际验证的、适用于不同场景的系统提示词，可直接应用于大模型的上下文。
- ​**\*\*[\`/external\`](**​<u>./external/</u>​**)\*\***​: 存放通过 Git Submodule 引入、仍需镜像分发的第三方技能仓库源。
- ​**\*\*[\`/docs\`](**​<u>./docs/</u>​**)\*\***​: 项目模板、设计说明和维护草稿。

当前 skills 分发同时支持三种来源：

* `submodule`：从 `/external` 镜像
* `local`：从 `/local-skills` 镜像
* `proxy`：不镜像代码，只在安装时直接代理执行上游安装命令

## 仓库维护

* 需要自己开发skill的时候，在local\_skills目录下开发。

![](https://github.com/zhangga/picx-images-hosting/raw/master/ScreenShot_2026-04-30_164043_873.67y2leox6i.webp)

* 需要引入外部skill或skill hub上已有的skill时，通过和AI对话，让AI来完成。

![](https://github.com/zhangga/picx-images-hosting/raw/master/ScreenShot_2026-04-30_164016_010.64egnovugr.webp)
![](https://github.com/zhangga/picx-images-hosting/raw/master/ScreenShot_2026-04-30_163931_706.86u9bqufhy.webp)

## 发布

直接提交Github即可，AI已经把相关的文件都准备就绪了。

# 推荐使用

如果你也想自建自己的skill仓库，欢迎使用下面的skill来创建仓库骨架

```Markdown
npx skills add https://github.com/zhangga/aihub --skill skill-hub-builder
```
