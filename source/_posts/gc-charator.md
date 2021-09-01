---
title: 常见垃圾收集器的特点
date: 2019-03-31 19:54:08
tags:
  - 笔记
id: gc-charator
categories:
  - 笔记
---

#### CMS（Concurrent Mark Sweep）收集器

![常见垃圾收集器的特点 - 第1张  | 张嘎](https://i2.wp.com/192.144.167.243/blog/wp-content/uploads/11.png?resize=640%2C175)

**缺点：**1.CMS收集器对CPU资源非常敏感。并发执行的特性，会对用户线程产生影响。
2.CMS收集器无法处理浮动垃圾。并发清理阶段用户线程还在运行着，伴随程序运行自然还会有新的垃圾不断产生，CMS无法处理他们。
3.采用标记-清楚算法实现，产生内存碎片。

#### G1（Garbage-First）收集器

![常见垃圾收集器的特点 - 第2张  | 张嘎](https://i0.wp.com/192.144.167.243/blog/wp-content/uploads/12.png?resize=640%2C173)

**特点：**1.并发与并行。
2.分代收集。
3.空间整合。标记-整理算法。
4.可预测的停顿。降低停顿时间是G1和CMS共同的关注点。
5.G1可以进行垃圾收集的范围包括新生代和老年代。将整个Java堆划分为多个大小相等的独立区域，虽然还保留新生代和老年代的概念，但新生代和老年代不再是物理隔离的了，它们都是一部分Region的集合。**化整为零的思路，并维护优先队列，使得G1收集器实现可预测的停顿。**
6.可达性分析时跨Region对象引用的问题，虚拟机维护Remembered Set来避免全堆扫描。

#### ZGC（）收集器

#### 堆外内存导致溢出错误

堆外内存不在垃圾回收的范围内，如果发生内存溢出的情况，也有可能是堆外内存引起的，常见的堆外内存包括：
1.Direct Memory。可通过-XX:MaxDirectMemorySize调整大小，内存不足时抛出OutOfMemoryError或者OutOfMemoryError: Direct buffer memory。
2.线程堆栈。可通过-Xss调整大小，内存不足时抛出StackOverflowError或者OutOfMemoryError: unable to create new native thread。
3.Socket缓存区。IOException: Too many open files。
4.JNI代码。调用本地库，本地库使用的内存也不在堆中。
5.虚拟机和GC。虚拟机和GC的代码执行也要消耗一定的内存。
