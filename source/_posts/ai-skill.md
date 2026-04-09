---
title: AI Skill 小技巧
tags:
  - AI
id: ai-skill
categories:
  - 笔记
date: 2026-03-23 21:28:47
---

- https://code.claude.com/docs/zh-CN/skills

# 构建Skill的工作流
### 描述意图
1. skill的主要功能目标，明确能力边界
2. 什么提示词可以触发skill，定义触发条件
3. 最终交付结果的格式，规范预期输出
4. 是否需要测试用例，成功和失败的用例

另外一种推荐的方式时，在会话中和cc一起具体的完成某个任务，然后让他根据这个任务来构建skill。

## 优化改进
引用官方文档：
Currently Claude has a tendency to "undertrigger" skills — to not use them when they'd be useful. To combat this, please make the skill descriptions a little bit "pushy".

Try hard to explain the why behind everything you're asking the model to do. If you find yourself writing ALWAYS or NEVER in all caps, that's a yellow flag — reframe and explain the reasoning.

- cc对是否触发skill的策略比较保守，所以我们的描述可以激进点，提高触发的概率，然后让cc来最终决策是否使用。
- 告诉cc在什么情况下应该使用这个skill，甚至是强制使用，可以多列举一些触发的关键词。
- SKILL.md主体内容保持在500行以内，超过的放入references/中，主体保留引用。
  