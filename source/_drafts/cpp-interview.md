---
title: C++面试题目
tags:
  - 笔记
id: cpp-interview
categories:
  - 笔记
---

## C++基础

* C++隐式类类型转换
  * 《C++ Primer》中提到：
  * “可以用单个形参来调用的构造函数定义了从形参类型到该类类型的一个隐士转换。”
  * https://www.cnblogs.com/QG-whz/p/4472566.html

* C++里的this指针是什么意思？可以用delete this吗？什么情况下可以使用？
  * https://blog.csdn.net/weiwangchao_/article/details/4746969
  * 只要你小心，一个对象请求自杀，是可以的。
    * 你必须100%确定，this对象是用new分配的（不是用new[]，也不是用定位放置new，也不是一个栈上的局部对象，也不是全局的，也不是另一个对象的成员，而是明白的普通的new）。
    * 引申问题：怎样避免栈上的delete this？强制对象必须new出来？
    * 你必须100%的确定，该成员函数是this对象最后调用的成员函数。
    * 你必须100%的确定，剩下的成员函数（delete this之后的）不接触到this对象任何一块（包括调用任何其他成员函数或访问任何数据成员）。
    * 你必须100%的确定，在delete this之后不再使用this指针。换句话说，你不能去检查它，将它和其他指针比较，和NULL比较，打印它，转换它，对它做任何事。
* 虚构函数和protected析构函数
  * https://blog.csdn.net/u012260238/article/details/78973009
* C++中=defaule和=delete使用
  * https://blog.csdn.net/lmb1612977696/article/details/80035487
  * =delete表示禁止使用编译器默认生成的函数
  * 假如上面的几个函数中，不想使用其中某个，可以将其定义为private，或者使用=delete
* C++中explicit关键字有啥用
  * https://blog.csdn.net/gatieme/article/details/50867575
  * 可以阻止不应该允许的经过构造函数进行的隐式转换发生
* C++final关键字
  * 禁用继承：
  * 禁用重写：

