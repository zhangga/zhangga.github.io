---
title: C++ 虚函数与虚函数表机制笔记
tags:
  - UE
id: vptrtable
categories:
  - 笔记
date: 2026-07-29 15:37:17
---

# C++ 虚函数与虚函数表机制笔记

> **来源**：《C++虚函数表实现机制以及用C语言对其进行的模拟实现》 — 陪她去流浪（桃子），2014-10-30
> 原文链接：<https://blog.twofei.com/496/>
>
> 本文为个人学习笔记，核心结论与示例均整理自上述原文。

---

## 一、为什么需要虚函数

虚函数是 C++ 实现 **多态（动态绑定）** 与 **接口函数** 的基础：

- 可以定义一个 **基类指针**，让它指向一个 **继承类** 对象。
- 通过基类指针调用函数时，能在 **运行时** 决定到底调用基类的函数还是继承类的函数。

一句话概括：没有虚函数，C++ 的多态就无从谈起。

---

## 二、C++ 对象的内存布局

观察内存布局的常用手段：

- 用 `offsetof` 宏输出成员变量的偏移；
- 用调试器（如 VS）直接查看对象内存。

### 1. 只有数据成员的对象

```cpp
class Base1 {
public:
    int base1_1;
    int base1_2;
};
```

| 字段 | 偏移 |
|---|---|
| `sizeof(Base1)` | 8 |
| `offsetof(Base1, base1_1)` | 0 |
| `offsetof(Base1, base1_2)` | 4 |

结论：成员变量按 **声明顺序** 从上到下依次存放；对象大小等于所有成员变量（内存对齐后）之和。

### 2. 含有非虚函数的对象

```cpp
class Base1 {
public:
    int base1_1;
    int base1_2;
    void foo() {}
};
```

布局与偏移与上例 **完全相同**。原因：

- 非虚函数不会发生动态绑定，不影响对象布局；
- 调用非虚函数时，调用哪个函数在 **编译期** 就已确定（取决于当前指针类型）。

### 3. 拥有一个虚函数的对象

```cpp
class Base1 {
public:
    int base1_1;
    int base1_2;
    virtual void base1_fun1() {}
};
```

| 字段 | 偏移 |
|---|---|
| `sizeof(Base1)` | 12 |
| `__vfptr` | 0 |
| `base1_1` | 4 |
| `base1_2` | 8 |

对象最前面 **多出了 4 个字节**，这就是 **虚函数表指针 `__vfptr`**（vtable pointer）：

- 类型为 `void**`，它是一个 **指针**，而不是数组；
- 指向一张 **虚函数表**（一个函数指针数组）；
- 表中的每一项是对应虚函数的地址，例如 `[0] = &Base1::base1_fun1`。

伪代码示意：

```cpp
void*        __fun[1] = { &Base1::base1_fun1 };
const void** __vfptr  = &__fun[0];
```

> **为什么 `__vfptr` 是"指向指针数组的指针"，而不是直接内嵌一个指针数组？**
> 因为虚函数表本身 **不属于对象的一部分**，对象里只保存一个指向它的指针 `__vfptr`，这样可以让同类的所有对象共享同一份表。
> 注意 `const void**` 中的 `const` 修饰的是虚函数表内容，而非 `__vfptr` 本身。

### 4. 拥有多个虚函数的对象

```cpp
class Base1 {
public:
    int base1_1;
    int base1_2;
    virtual void base1_fun1() {}
    virtual void base1_fun2() {}
};
```

关键现象：**多加一个虚函数，对象大小依然是 12 字节**。

- 新增虚函数只是往虚函数表里 **多加一项**（`[1] = &Base1::base1_fun2`）；
- 对象布局、大小不受影响。

伪代码：

```cpp
void*        __fun[] = { &Base1::base1_fun1, &Base1::base1_fun2 };
const void** __vfptr = &__fun[0];
```

**重要结论**：

> 同一个类的不同实例 **共用同一份虚函数表**，它们各自的 `__vfptr` 都指向这同一张表。
> 虚函数表是 **编译器在编译期** 就构造好的，只存在一份；定义对象时编译器自动把对象的 `__vfptr` 指向它。

---

## 三、继承下的内存布局

### 5. 单继承（继承类自身无虚函数）

```cpp
class Base1 {
    int base1_1; int base1_2;
    virtual void base1_fun1() {}
    virtual void base1_fun2() {}
};
class Derive1 : public Base1 {
    int derive1_1; int derive1_2;
};
```

布局规律：**基类部分在上，继承类新增成员在下**。前半部分就是完整的 `Base1`（虚表指针 + 成员变量），虚函数表 `[0][1]` 仍是 `base1_fun1()`、`base1_fun2()`。

### 6. 存在基类虚函数覆盖（override）

```cpp
class Derive1 : public Base1 {
    int derive1_1; int derive1_2;
    virtual void base1_fun1() {}   // 覆盖基类
};
```

现象：虚函数表中原本的 `Base1::base1_fun1()` 项 **被替换为 `Derive1::base1_fun1()`**。

> 此后无论通过 `Derive1` 指针还是 `Base1` 指针调用 `base1_fun1()`，调用的都是 **被重写后的版本 —— 多态发生了！**

### 7. 继承类定义了基类没有的新虚函数

```cpp
class Derive1 : public Base1 {
    int derive1_1; int derive1_2;
    virtual void derive1_fun1() {}  // 新增虚函数
};
```

现象：从对象大小和成员偏移看，**表面上和第 5 种情况完全一样**，看不到新增的虚函数。真相要从汇编入手。

调用 `pd1->derive1_fun1();` 对应的汇编（VS，`__thiscall`）：

```asm
mov  eax, dword ptr [pd1]     ; eax = d1 的地址
mov  edx, dword ptr [eax]     ; edx = __vfptr = 虚函数表地址
mov  esi, esp
mov  ecx, dword ptr [pd1]     ; this 存入 ecx
mov  eax, dword ptr [edx+8]   ; edx+8 = 表第 3 项 __vftable[2]
call eax                      ; 调用虚函数
```

关键点解读：

- 因为 `__vfptr` 是对象的第一个成员，所以 `&__vfptr == &d1`；
- `edx+8` 取的是虚函数表 **第 3 个元素** `__vftable[2]`。

**结论**：

> 继承类新增的虚函数被 **追加到基类虚函数表的后面**。
> 基类只知道自己的 `[0][1]` 两项，即使后面追加了 `[2]`，也完全不影响基类。

> **必须用指针（或引用）调用才会触发动态绑定。**
> `d1.derive1_fun1();` 直接用对象调用不会动态绑定；`pd1->derive1_fun1();` 用指针调用才会。

---

## 四、多继承布局（要点）

```cpp
class Base1 { int base1_1, base1_2; virtual void base1_fun1(); virtual void base1_fun2(); };
class Base2 { int base2_1, base2_2; virtual void base2_fun1(); virtual void base2_fun2(); };

class Derive1 : public Base1, public Base2 {
    int derive1_1, derive1_2;
    virtual void base1_fun1() {}   // 覆盖 Base1
    virtual void base2_fun2() {}   // 覆盖 Base2
    virtual void derive1_fun1() {} // 自身新增
    virtual void derive1_fun2() {}
};
```

多继承下，对象会 **包含多张虚函数表指针**（每个带虚表的直接基类各一份），并按基类声明顺序排列：

- 每个基类子对象保留自己的虚表指针；
- 被覆盖的虚函数项在对应基类的虚表中被替换为派生类版本；
- 派生类自身新增的虚函数，通常追加到 **第一个基类** 的虚表之后。

> 原文还进一步讨论了若干边界情况：第 1 个基类没有虚表、两个基类都没有虚表、以及三个基类"有/无/有"虚表的组合布局。详见原文对应章节。

---

## 五、用 C 语言模拟虚函数机制（思路）

虚函数机制本质上就是 **"对象头部藏一个函数指针数组指针 + 通过下标间接调用"**，因此可用纯 C 模拟：

1. 用结构体的第一个成员放一个 `void** vptr`（虚表指针）；
2. 构造一张 `void* vtable[]`（函数指针数组），填入各成员函数地址；
3. 每个"成员函数"显式接收 `this` 指针作为第一个参数；
4. 调用时通过 `obj->vptr[i](obj, ...)` 完成间接调用，实现动态分发。

这样即可用 C 复现 C++ 虚函数在运行期的动态绑定行为。完整可运行源码见原文 **源代码** 章节。

---

## 六、核心速记

- 有虚函数的对象，头部多一个 `__vfptr`（`void**`），指向共享的虚函数表。
- 虚函数表由编译器在编译期生成，**同类所有实例共享一份**。
- 增加虚函数只改虚表内容，**不改变对象大小/布局**（除首次引入 `__vfptr`）。
- 覆盖基类虚函数 = 替换虚表中对应项 → 多态。
- 派生类新增虚函数 = 追加到基类虚表之后。
- **只有用指针/引用调用才会动态绑定**；用对象直接调用不会。

---

*本笔记整理自：<https://blog.twofei.com/496/>（陪她去流浪 · 桃子）。*
