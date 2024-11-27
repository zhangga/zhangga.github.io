---
title: 模型微调
date: 2024-08-27 18:15:22
tags:
  - 学习
id: llm-lora
categories:
  - 笔记
---

## 训练大模型的三个阶段

- 预训练：学说话
- 微调：学根据指令回答
- 偏好对齐：学会按照人类偏好回答

## 增量预训练

### 作用

- 更新知识
- 修改常识性错误
- 扩充领域知识
- ……

### 场景

- 比如把知识从去年扩充到今年
- 比如训练一个小说家小说家
- 比如他对某个历史人物记忆有错误

## 微调

### 作用

- 回答特定领域问题
- 完成特定任务
- 个性化需求，比方当我让他用某种特殊方式回答某个特定问题
- ……

### 场景

- 医疗客服
- 金融咨询
- 角色扮演

## 微调目标分类

- 指令微调 （总结、情感分析）
- 领域微调( 金融类问题回答、医疗类问题回答)
- 多任务微调
- 知识蒸馏（老师模型微调学生模型）
- 工具调用
- ……

## 微调的两个主要类型

1. 监督微调（Supervised Fine-tuning）：监督微调是指在进行微调时使用有标签的训练数据集。这些标签提供了模型在微调过程中的目标输出。在监督微调中，通常使用带有标签的任务特定数据集，例如分类任务的数据集，其中每个样本都有一个与之关联的标签。通过使用这些标签来指导模型的微调，可以使模型更好地适应特定任务。
2. 无监督微调（Unsupervised Fine-tuning）：无监督微调是指在进行微调时使用无标签的训练数据集。这意味着在微调过程中，模型只能利用输入数据本身的信息，而没有明确的目标输出。这些方法通过学习数据的内在结构或生成数据来进行微调，以提取有用的特征或改进模型的表示能力。

## 微调方法

- Lora微调
- 全参数微调
- 冻结部分参数微调

## Lora微调

### 什么是Lora

Low Rank Adapter

![img](https://raw.githubusercontent.com/zhangga/gitment-comments/master/uPic/2024-11/lora1-6ZPzRm.png)

![lora2-AxMP25](https://raw.githubusercontent.com/zhangga/gitment-comments/master/uPic/2024-11/lora2-AxMP25.png)

### Lora微调的优势

1. **效率高**：只需更新低秩适应层，而不是整个模型，更快、更高效地对大型语言模型进行微调。
2. **节省资源**：降低微调过程的复杂性，节省计算资源、能源和时间。
3. **[灵活性：适用于各种大规模语言模型，易于适应不同的任务或领域](https://ai-bot.cn/what-is-lora/)**

## 语言模型微调过程

1. 确定训练目标
2. 选择合适的基座模型 (Base、Instrcution、Chat、Code、MOE、Toolcall、VLM)，参数量
3. 选择微调框架 推荐用 https://github.com/hiyouga/LLaMA-Factory
4. 准备微调数据
   1. 找合适的数据源（自有数据\爬虫\huggingface\github\wiki\kaggle\modelscope）
   2. 数据清洗（过滤、去重、脱敏）
   3. 数据处理
      - 数据增强
      - 合成数据
      - 数据格式（text，instrcution，conversation）
5. 确定微调参数，开始微调
6. 观察loss变化
7. 模型评估
8. 合并模型，将Lora参数和Base模型参数合并导出
9. 模型量化（可选）

## 部署推理服务

推理框架

1. Transformers
2. vllm 
3. Ollama
4. Xinference
5. onnx
