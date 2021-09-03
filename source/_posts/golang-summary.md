---
title: golang笔记
date: 2015-09-01 23:49:37
tags:
  - 笔记
id: golang-summary
categories:
  - 笔记
---

### go gc

- 开始标记：STW，开启写屏障，统计root对象。
- 三色标记：扫描root对象，包括全局指针和G栈上的，扫描G栈时G栈需要暂停。root标记灰色，没引用标记黑色，有引用标记黑色并把引用标记灰色，直到灰色队列为空。与用户程序并行。
- 重新扫描：STW，因为上一步并行，可能重新分配对象和赋值，通过写屏障记录下来。
- 回收白色对象
- 写屏障：记录第一次扫描时对象的状态，和第二次比对，引用状态变化的对象标记灰色，继续处理。

### java gc

- 将内存划分成region，每个region表示eden，survivor，old，huge。跟踪各个region垃圾回收价值，维护优先级列表，避免在整个堆中进行垃圾回收。
- region间是复制算法
- 可预测停顿时间的模型
- Eden younggc stw, 45%, 并发标记，混合回收，fullgc。

### 调优

- 减少string与byte[]转换。
- 少量小本文+，大量小文本strings.Join()，大量大文本bytes.Buffer。

### java性能

- 堆外内存
- kwaibook春节笔记
- sandbox笔记

go kitex

性能分析 golang课程

匹配

网关

redis

