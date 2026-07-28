---
title: decltype 与将亡值（xvalue）详解
tags:
  - UE
id: cpp-decltype-and-xvalue
categories:
  - 笔记
date: 2026-07-28 11:19:52
---

# C++ 进阶：decltype 与将亡值（xvalue）详解

> 本文从值类别（左值 / 右值）体系出发，系统讲解 C++ 中的 `decltype` 类型推导与将亡值（xvalue），并配有代码示例与对比表格，适合有一定 C++ 基础的读者阅读与分享。

---

## 目录

- [一、前置：值类别体系](#一前置值类别体系)
- [二、decltype 详解](#二decltype-详解)
- [三、将亡值（xvalue）详解](#三将亡值xvalue详解)
- [四、速查总结](#四速查总结)

---

## 一、前置：值类别体系

要理解 `decltype` 和将亡值，先要建立 C++11 之后的**值类别（value category）** 概念。所有表达式按两个维度划分：

- **是否有身份（identity）**：能否标识一个确定的、有地址的对象。
- **是否可移动（movable）**：其资源能否被安全地「窃取」。

由此得到三种基本值类别，以及两个复合类别：

```
                        expression（表达式）
                       /                    \
             glvalue（泛左值）            rvalue（右值）
             有身份                       可移动
            /        \                  /        \
    lvalue 左值    xvalue 将亡值    xvalue 将亡值   prvalue 纯右值
    有身份         有身份·可移动                   无身份·可移动
    不可移动
```

关系式：

- `lvalue + xvalue = glvalue`（都有身份）
- `xvalue + prvalue = rvalue`（都可移动）
- **xvalue（将亡值）是 glvalue 与 rvalue 的交集**

| 值类别 | 有身份 | 可移动 | 典型示例 |
|---|:---:|:---:|---|
| **lvalue** 左值 | ✅ | ❌ | 变量名 `x`、`arr[i]`、`*p` |
| **xvalue** 将亡值 | ✅ | ✅ | `std::move(x)`、`static_cast<T&&>(x)` |
| **prvalue** 纯右值 | ❌ | ✅ | 字面量 `42`、`a + b`、`foo()` |

---

## 二、decltype 详解

`decltype` 是 C++11 引入的类型推导关键字，能在**编译期**获取一个表达式的类型。与 `auto` 不同，它会**原样保留**引用和 cv 限定符（`const` / `volatile`）。可以理解为：「问编译器——这个东西到底是什么类型？」

### 2.1 两种推导形态

`decltype` 的推导方式取决于括号里放的是「变量名」还是「表达式」：

```cpp
int x = 0;
const int& rx = x;

decltype(x)     a;      // int         —— 变量名：取“声明类型”
decltype(rx)    b = x;  // const int&  —— 完整保留 const 和 &
decltype(x + 1) c;      // int         —— 表达式：结果是 prvalue → int
```

### 2.2 核心规则

`decltype(e)` 先判断 `e` 的形态：

**规则一：无括号的标识符 / 成员访问**
如 `decltype(x)`、`decltype(obj.m)`，结果为该实体**声明时的类型**，一字不差（完整保留 `const` 与 `&`）。

**规则二：其他任意表达式**
根据表达式的**值类别**加工基础类型 `T`：

| 值类别 | 推导结果 |
|---|---|
| prvalue（纯右值） | `T` |
| lvalue（左值） | `T&` |
| xvalue（将亡值） | `T&&` |

### 2.3 经典陷阱：多加一层括号

```cpp
int x = 0;
decltype(x)    a;      // int   —— 规则一：变量名
decltype((x))  b = x;  // int&  —— 规则二：(x) 是左值表达式 → T&
```

`(x)` 不再是「标识符」，而是一个求值为左值的表达式，于是套用规则二得到 `int&`。这一区别在实际代码中经常导致意外的引用类型。

### 2.4 decltype 与 auto 的区别

`auto` 会像值传递那样**退化**（丢弃引用、顶层 const，数组退化为指针），而 `decltype` **精确保留**原始类型。

| 场景 | `auto` 的结果 | `decltype(expr)` 的结果 |
|---|---|---|
| `const int& r` | `int`（丢掉 `const` 和 `&`） | `const int&`（完整保留） |
| 数组 `int arr[10]` | `int*`（退化为指针） | `int[10]`（保留数组类型） |
| 表达式 `x + 1` | `int` | `int`（prvalue） |
| 带括号 `(x)` | `int` | `int&`（左值） |

### 2.5 decltype(auto)（C++14）

`decltype(auto)` 结合两者优点：用 `auto` 的写法**触发初始化器推导**，但用 `decltype` 的**精确规则**去推导，因此能完美保留引用和 cv 限定。最典型的用途是**完美转发返回类型**：

```cpp
template <typename F, typename... Args>
decltype(auto) wrapper(F f, Args&&... args) {
    return f(std::forward<Args>(args)...); // 原样保留 f 的返回类型（值/引用都不变）
}

int  g();
int& h();
decltype(auto) a = g(); // int
decltype(auto) b = h(); // int&
```

若改用普通 `auto` 作返回类型，`h()` 的引用会被退化为 `int`，无法透传引用。

### 2.6 主要使用场景

`decltype` 最常见于**模板与泛型编程**——当返回类型依赖模板参数、编译期还不知道具体类型时使用。C++11 里常配合尾置返回类型（trailing return type）：

```cpp
template <typename T, typename U>
auto add(T t, U u) -> decltype(t + u) {   // 返回类型 = t + u 的类型
    return t + u;
}
```

其他常见用途：

- 声明与某表达式同类型的变量；
- 在 SFINAE / concepts 中做类型探测；
- 配合 `std::declval` 在**不真正构造对象**的前提下推导成员函数返回类型。

> 一句话：凡是需要「精确复刻某个表达式的类型（含引用与 const）」的地方，就用 `decltype`。

---

## 三、将亡值（xvalue）详解

**将亡值（xvalue，eXpiring value）** 是 C++11 引入的值类别，指「一个即将销毁、但其资源可以被安全『窃取』（移动）的对象」。它是连接左值和纯右值的桥梁：既像左值一样标识着一个具体对象（**有身份**），又像右值一样允许被移动（**可移动**）。

### 3.1 名字的含义

- 它标识一个真实存在的对象 → 所以是「值」；
- 这个对象即将结束生命 → 所以「将亡」；
- 因此可以放心地把它的资源移动走。

### 3.2 什么会产生将亡值

| 表达式 | 是否将亡值 | 说明 |
|---|:---:|---|
| `std::move(x)` | ✅ | 本质是把左值强制转换为右值引用，结果是 xvalue |
| `static_cast<T&&>(x)` | ✅ | 转换为右值引用类型的表达式 |
| 返回 `T&&` 的函数调用 | ✅ | 如 `std::move` 的返回值 |
| `std::move(obj).member` | ✅ | 将亡对象的非引用成员 |
| `42`、`a + b`（字面量 / 运算结果） | ❌ | 是 prvalue（纯右值，无身份） |
| 变量名 `x` | ❌ | 是 lvalue（有身份但不可移动） |

### 3.3 核心意义：移动语义

将亡值存在的根本目的，是为**移动语义（move semantics）** 提供依据。当编译器判断表达式是右值（prvalue 或 xvalue）时，可调用**移动构造 / 移动赋值**而非拷贝，从而「窃取」资源（如堆内存指针）而不做深拷贝。

```cpp
std::string a = "hello world";
std::string b = a;              // a 是左值 → 拷贝构造（复制整块内存）
std::string c = std::move(a);   // std::move(a) 是将亡值 → 移动构造（窃取指针）
// 此后 a 处于“有效但未指定”的状态，因为资源已被移走
```

注意：`std::move(a)` 本身**不移动任何东西**，它只是把左值 `a` 转成将亡值（右值引用），从而让重载决议**选中移动构造函数**。真正的资源转移发生在移动构造函数内部。

---

## 四、速查总结

**decltype**

- 变量名 / 成员访问 → 声明类型（保留 `const` 与 `&`）；
- 其他表达式 → 按值类别：prvalue→`T`，lvalue→`T&`，xvalue→`T&&`；
- `decltype((x))` 会多得到一层引用，是常见陷阱；
- 与 `auto` 的区别：`auto` 退化，`decltype` 精确保留；
- `decltype(auto)`（C++14）用于完美转发返回类型。

**将亡值（xvalue）**

- 定义：有身份 + 可移动，是 glvalue 与 rvalue 的交集；
- 来源：`std::move`、`static_cast<T&&>`、返回 `T&&` 的函数等；
- 意义：让编译器选中移动构造 / 移动赋值，实现高效资源转移；
- 是 C++11 移动语义的基石。
