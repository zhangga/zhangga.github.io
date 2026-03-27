---
title: claudecode
tags:
  - UE
id: claudecode
categories:
  - 笔记
date: 2026-03-24 12:01:11
---

# 安装

https://code.claude.com/docs/zh-CN/overview#terminal

# 常用命令

## 配置文件

> 官方文档：https://code.claude.com/docs/zh-CN/settings

| 类型         | 个人-全局配置                 | 项目-公共配置                                    | 项目-本地配置                                                                |
| -------------- | ------------------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------ |
| 配置文件地址 | `~/.claude/settings.json` | `/`
`.claude/settings.json` | `/`
`.claude/settings.local.json`>

> 自动 ignore |
> | 优先级       | 1                             | 2                                                | 3                                                                            |

### 案例

* 火山方舟 coding plan 模型

[火山文档](https://www.volcengine.com/docs/82379/2183190?lang=zh)

```JSON
{
  "autoUpdatesChannel": "latest",
  "env": {
    "ANTHROPIC_AUTH_TOKEN": "xxxxxxxxxxx",
    "ANTHROPIC_BASE_URL": "https://ark.cn-beijing.volces.com/api/coding",
    "ANTHROPIC_DEFAULT_HAIKU_MODEL": "ark-code-latest",
    "ANTHROPIC_DEFAULT_OPUS_MODEL": "ark-code-latest",
    "ANTHROPIC_DEFAULT_SONNET_MODEL": "ark-code-latest",
    "ANTHROPIC_MODEL": "ark-code-latest"
  }
}
```

* cc-switch

![](https://my.feishu.cn/space/api/box/stream/download/asynccode/?code=YmJiNmQyZTJlM2I4NzQ2OGVjOTc4YjNjOTE5ZDIzMzhfeGZQS01TQTVMbUNPSWtzZEtwd0ZDRUpCRmxxeGlMZ2RfVG9rZW46UUk4cWJaa3JvbzRSOU14UmxFVWNGT0pNblBoXzE3NzQ0MDM0NDY6MTc3NDQwNzA0Nl9WNA)

## 权限控制

https://code.claude.com/docs/zh-CN/permissions

可以直接修改`~/.claude/settings.json`

比如修改允许 Bash 执行 svn 所有的操作、允许调用 python3 脚本、禁止执行 git。

```JSON
{
    "permissions": {
        "allow": ["Bash(svn *)", "Bash(python3 *)"],
        "dent": ["Bash(git *)"]
    }
}
```

## 会话管理

### 会话：`session`

每次启动 claude 都是一个新的 Session，在这次 Session 中上下文持续积累，关闭后重新打开就清空。

会话数据存储在：`~/.claude/projects`

### 会话恢复：`/resume`

## 上下文管理

### 上下文窗口：`/context`

查看当前会话上下文状态

### 自动压缩

当前会话上下文达到阈值会自动压缩，可能造成信息失真，不利于精准完成任务。

建议将功能拆分成尽可能独立、尽可能自闭换的小任务。完成小任务后清空上下文，再进行下一个任务。

### 主动压缩：`/compact`不建议

大部分情况下不需要主动压缩，要不参考上面的建议拆分小任务，要不自动压缩。

### 主动清空：`/clear`

在明确任务完成后，建议主动使用clear清空上下文，再进行下一个任务。

# CLAUDE.md

> 除了ClaudeCode，其他大部分工具用的是AGENTS.md，其实是一样的东西。

项目一开始建议使用 `/init` 来生成 `CLAUDE.md`。

## 工作机制

> CLAUDE.md内容只是作为一段Prompt插入到消息列表开头，随着上下文增加，模型在上下文的表现会越来越差。如果CLAUDE.md占据了大量无效、错误的信息，会直接影响长任务的执行效果。
> 
> 所以上下文并非越多越好，只需保留关键指引，持续迭代完善。

## 上下文压缩对CLAUDE.md的影响（无）

压缩后，CLAUDE.md还会被加到消息列表的头部。

## 超长上下文对CLAUDE.md的影响（有）

受限于LLM对超长上下文的的处理能力，即使CLAUDE.md没有被压缩，也有可能因为过长的上下文导致LLM失焦，不能完全遵循Prompt。

从上面的工作机制也能看出来，CLAUDE.md只是作为Message List的开头，也不是`System Prompt`，指令遵循上也不一定完全符合预期。

## 最佳实践

https://www.humanlayer.dev/blog/writing-a-good-claude-md

CLAUDE.md 是个持续迭代的过程，并非初始化一次就结束了。

可以通过一些工具自动初始化，但是要进行人工删减，后续过程发现不按照期望规则做事，则需要动态更新和调整，或者查漏补缺。

1. 保持正确性，删除错误内容
2. 保持精准干练，删除冗余无效内容
3. 不要把什么任务都丢给LLM（一些确定性，能用脚本或工具完成的，可以直接在流程里做）

# 内置TOOL

## 工作机制

ClaudeCode本身设计了一套工具

## 最佳实践

实际业务中如果有不使用的工具可以直接禁用，减少过多或者不必要的工具造成LLM决策工具召回出现问题。

```Dockerfile
{
    "permissions": {
        "allow": ["Bash(svn *)", "Bash(python3 *)"],
        "dent": [
            "WebFetch",
            "WebSearch"
        ]
    }
}
```

> System Tools 是 Claude Code 针对编码场景开发的特定工具，无论是 Grep、Read 等都有一些设计特色和实现特点，值得学习。

* `TodoWrite`：我们经常看到 todo 列表的更新能力
* `AskUserQestion`：TUI 上询问用户问题，然后选择、输入等能力

SKILL、MCP、Agent 都会被转化成 Tools 或者 TOOLs 中的某个位置传入给模型，LLM 通过 function calling 进行工具召回和参数提取决策

* SKILL：会将 name + description 传入到 `SKILL` tool 的 Description 中
* MCP：mcp tool 会直接挂到 tools 列表汇总
* Agent：会挂在到 `TASK` tool 的 Description 中

# MCP

大多数MCP Server就是API的包装器，现在Tool比较实用。

## 配置

```JSON
{
  "mcpServers": {
    "github-personal": {
      "command":"npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": {
          "GITHUB_PERSONAL_ACCESS_TOKEN": "${GITHUB_PERSONAL_TOKEN}"
      }
    }
  }
}
```

### 优先级

![](https://my.feishu.cn/space/api/box/stream/download/asynccode/?code=MDFhMDM1ZDhiNDFlNTg2YWNjYmMwYTdhYWNjMTgyMThfRFlEVmM1WHN2TU1lTE5qRHBVRmx1Ymg4cDFpQlAzdERfVG9rZW46Tk1ZR2JlRktHb3pGemJ4Vk0wUmNMcFJLbkNkXzE3NzQ0MDM0NDY6MTc3NDQwNzA0Nl9WNA)

## 启动过程

claude在启动的时候会自动连接所有MCP Servers，并解析出Tools，如果有失败，会在右下角提示。

## `/mcp`

查看状态

## 工作机制

MCP 的 tools 是如何传给模型的？在 Tools 章节我们已经了解到，所有的工具都会通过接口的 tools 字段。将描述+参数 schema 传递给模型，LLM 会通过 Function Calling 决定调用哪个工具做什么任务。

MCP Server建立连接后，即可拉取所有工具。

### 权限控制

MCP 工具授权的基本规则：

* ​**授权单个 TOOL：mcp\_\_**​**<mcp server name>**​​**\_\_**​**<mcp server tool>**
* ​**授权所有 TOOL：mcp\_\_**​**<mcp server name>**​**\_\_\* ​**

```Dockerfile
{
  "permissions": {
    "allow": [
      "mcp__icon-park-mcp__search_icons"
    ]
  }
}
```

### 召回MCP Server Tool

本质上就是通过 `mcp__<mcp server name>__<mcp tool name>` 的规则构造出一个 Tool，然后追加到工具列表中。

对于工具的召回，仍然依赖上下文，基于 Function Calling 决定在什么时候召回什么工具，参数是什么。

## 最佳实践

1. 控制MCP Server数量，控制MCP Server Tools启用数量
2. 减少MCP Server Tool输出内容，只保留有用信息
3. 不盲目追捧（SKILL）、拉踩（MCP）
   1. 工具简单、无编排依赖，并且在执行过程中会多次召回使用，并非面向某个特定场景任务的功能，仍然可以保持 MCP 的接入方式。
   2. 不额外干预的情况下，MCP Tool 的召回效果、执行效率是超过 SKILL 的。
   3. 如果涉及多个工具编排、有依赖性、工具过多、会引入额外的 prompt 描述，更适合通过 SKILL 的方式实现。

# SKILL

https://code.claude.com/docs/zh-CN/skills

## 基本组成

每个 skill 都是一个以 `SKILL.md` 作为入口点的目录：

```Plain
my-skill/
├── SKILL.md           # 主要说明（必需）
├── template.md        # Claude 要填写的模板
├── examples/
│   └── sample.md      # 显示预期格式的示例输出
└── scripts/    
    └── validate.sh    # Claude 可以执行的脚本
```

## SKILL元数据

除了 markdown 内容外，你可以使用 `SKILL.md` 文件顶部 `---` 标记之间的 YAML frontmatter 字段来配置 skill 行为：

```Plain
---
name: my-skill
description: What this skill does
disable-model-invocation: true
allowed-tools: Read, Grep
---

Your skill instructions here...
```

所有字段都是可选的。建议使用 `description`，以便 Claude 知道何时使用该 skill。

> 元数据的支持需要看具体的 AI Coding 工具，一般情况下，除了 name 和 description，不太需要非常深入的了解，按需使用即可

## 配置&加载

建议在项目维度配置SKILLS。

CLAUDE启动后会扫描skills下的目录，提取出`SKILL.md`中的`name`和`description`。

## `/skills`

查看当前session扫描出的列表。

ClaudeCode支持SKILLS热更新，不需要重启。

一键安装SKILL：https://www.npmjs.com/package/skills

## 权限控制

```Dockerfile
{
  "permissions": {
    "allow": [
      "mcp__icon-park-mcp__search_icons",
      "Skill"
    ]
  }
}
```

* ​**Skill**​: 放行所有技能
* ​**Skill(name)**​：放行某个技能

## 使用方式

* 基于上下文自动召回
* 手动精准触发：命令`/使用的技能`

在SKILL元数据中支持配置禁止模型召回，允许手动调用

```YAML
---
name: my-skill
description: What this skill does
disable-model-invocation: true # 禁止模型召回
user-invocable: true # 允许出现在 slash command 中让用户手动执行
---

Your skill instructions here...
```

## 工作机制

【基于上下文自动召回】章节简单介绍了上下文召回模式的工作流程，涉及两次模型调用与相关内容读取，也就是“渐进式披露”的概念。

### 模型如何召回SKILL

在Claude的`内置TOOL`中，有一个`Skill`的工具，我们的skill在安装后，会将skill的description塞到`内置Skill`工具的描述中，模型在FunctionCalling的时候，基于描述发现有可以使用的skill。FunctionCalling的结果：

```Dockerfile
tool_use: Skill
params:
    skill： your-skill-name
    args：params
```

技能不是万金油，单工具召回效率和召回效果远不如 mcp tool，mcp tool 作为 tool list 的一员，而 skill 只是将你的 description 塞入到 `Skill` 这个 tool 的工具描述中。

> 网络传言 anthropic 在预训练阶段和后训练阶段有针对性强化 Skill 的召回，但是没找到具体内容和信息

**技能描述的好坏，直接影响工具的召回效果，上下文膨胀后，SKILL 召回效率和效果会下降**

### 读取SKILL.md

模型在召回阶段只是说要调用`Skill`这个工具，参数是`your-skill-name`，工具调用的结果是，去读取`your-skill-name`的`SKILL.md`。

在调用Skill之后，ClaudCode会插入一些上下文：

1. skill的路径：这个路径主要是为了后续读取resources和scripts。
2. ARGUMENTS：将提取出来的args插入SKILL.md底部。

翻译后的SKILL.md作为完整的prompt再次输入给模型。

### SKILL.md动态注入上下文

```YAML
---
name: pr-summary
description: Summarize changes in a pull request
context: fork
agent: Explore
allowed-tools: Bash(gh *)
---

## Pull request context
- PR diff: !`gh pr diff`
- PR comments: !`gh pr view --comments`
- Changed files: !`gh pr diff --name-only`

## Your task
Summarize this pull request...
```

基于动态注入上下文的能力，很多信息可以直接在SKILL.md中写，无需让LLM进行多次决策和工具调用。

警惕恶意SKILL。

## 最佳实践

https://platform.claude.com/docs/zh-CN/agents-and-tools/agent-skills/best-practices#claude-2

* SKILL替代MCP完成领域问题解决
* 结合CLAUDE.md提高SKILL召回率

> 将 SKILL + 具体触发 Case 描述补充到 CLAUDE.md 中，对于召回效果有一定提升

* 使用高质量的模型来完善SKILL内容，再用性价比的模型来跑任务
* 能工程化的工作不要让LLM决策执行

# HOOK

https://code.claude.com/docs/zh-CN/hooks-guide

## 实践案例

通过ClaudeCode Hook机制，将AI生成代码diff上传至统计平台，最终计算AI代码贡献率的端到端方案。

核心在于将本地生成的代码变更(diff)与最终合入代码库的记录进行关联。整个流程分三步：

1. 客户端采集：在开发者环境中，通过hook机制，每次AI交互结束时自动捕获生成的代码patch。
2. 数据上报：将捕获的patch及相关元信息（仓库、用户信息等）作为埋点事件，上传至统计平台。
3. 最终归因：定时拉取数据，并结合代码库的commit记录，计算准确的AI贡献率。

## 执行案例

* 利用hook自动格式化代码
* 利用hook发送飞书通知
* 利用hook监控是否触发上下文压缩

## 退出码机制

https://code.claude.com/docs/en/hooks#hook-input-and-output

## 最佳实践

利用hook优化工程自动化能力，而非完全依赖LLM

# SubAgent

* 只能通过上下文召回，不能通过手动直接触发
* 独立的上下文
* 支持设置独立的权限、允许的SKILL、子agent的hook、工具、模型

## 配置与开发

https://code.claude.com/docs/zh-CN/sub-agents

`~/.claude/agents/`

所有在agents目录下的md文件，只要使用了YAML Formatter的写法，并且有name，都会被识别成SubAgent，与文件的位置没有关系。

## 工作机制

### 如何传给模型

和SKILL类似，SubAgent并不会直接插入到模型上下文或者工具列表，而是插入到`Task`这个工具的description中。实际中，SubAgent要么有非常明显的领域特色或者功能场景，要么需要非常清晰的指令描述（比如使用AgentXXX），否则召回难度比较大。

### 如何被召回

```Dockerfile
tool_name: Task
params:
    subagent_type： your-agent-name
    prompt：输入给SubAgent的prompt
```

### 如何工作

1. 提取的prompt+CLAUDE.md作为输入
2. 组织调整SystemPrompt，不具备动态上下文注入的能力
3. 控制模型的Tools，过滤掉了Task、PlanMode等工具

### SubAgent的输出如何作用给主Agent

SubAgent是通过Task Tool召回的，因此SubAgent的结果会作为Task Tool工具调用的结果插入到Message List中，而中间的执行过程不会出现在MainAgent的消息列表。

# Plugin

https://code.claude.com/docs/zh-CN/plugins

Plugin可以理解为对上面的能力（MCP、Skill、Hook、SlashCommand、Agents）的集合，方便共享。

## 工作机制

1. 需要配置插件市场
2. 如果是项目级别的安装，插件安装后，会在`.claude/settings.json`中配置使用的plugin
3. 在首次启动的时候，会通过git clone将marketplace repo复制到本地，将plugin文件夹移动到缓存目录`~/.claude/plugins/cache`
4. ClaudeCode从plugins中加载相关组件（SKILL、Agent、Hook）
5. 私有源不会自动更新，需要进行设置才会自动更新

```Dockerfile
claude plugin marketplace list
claude plugin marketplace update
claude plugin update demo-plugin@demo-marketplace --scope project
```

## 项目级别自动安装和生效

在`.claude/settings.json`中配置好marketplace和自动安装的plugin，注意plugin名字和marketplace名字要一致。

```JSON
{
  "permissions": {
    "defaultMode": "bypassPermissions"
  },
  "enabledPlugins": {
​    ​"demo-plugin@demo-marketplace":​ ​true
  },
​  ​"extraKnownMarketplaces":​ ​{
​    ​"demo-marketplace":​ ​{
​      ​"source":​ ​{
​        ​"source":​ ​"git",
​        ​"url":​ ​"git@github.com:zhangga/claude-code-demo-marketplace.git"
​      ​}
​    ​}
​  ​}
}
```

# 总结

1. **关注 Context Window，任务尽可能小而独立，clear 无用上下文，降低干扰**
2. **CLAUDE.md 内容不是越多越好，少而精即是多**
3. **MCP Server 不是工作单元，工作单元是 mcp server tool，召回效率高于 SKILL、Agent，适合单点持续工作**
4. **SKILL 是工作单元，但是召回效率不如 MCP，description 是关键因子，相同领域最好只有一个 SKILL，配合 CLAUDE.md 效果更好，用好动态上下文注入能力**
5. **Slash Command 已经与 SKILL.md 融合，一些纯手动触发的场景，及时屏蔽，避免被作为 SKILL 注入到上下文被召回**
6. **能工程化的任务多利用Hooks，但是安全性是第一考量，别人开发的 Hook 一定要 review 代码**
7. **SubAgent 没有经历非常明确的场景，但是上下文隔离与并行任务处理的场景仍然可以考虑**
8. **Plugin 仍然适合团队级别最佳实践与相关能力集成，如果觉得概念太多或者聚焦打造项目范本，plugin 是首选**
