---
title: 一个基于「引用计数 + 前缀头部」的共享缓冲区设计
tags:
  - UE
id: sharedbuffer
categories:
  - 笔记
date: 2026-07-04 11:02:39
---

# SharedBuffer 巧妙数据结构设计要点

> 一个基于「引用计数 + 前缀头部」的共享缓冲区设计，常见于高性能网络库 / 序列化库。
>
> 命名说明：
> - **`SharedBuffer`**（共享缓冲区，对外使用的类）
> - **`Header`**（头部元数据，藏在数据区前面的管理信息）

## 0. 原始代码

```cpp
class SharedBuffer {
    struct Header {
        size_t cap;            // 容量：这块缓冲能装多少字节
        size_t len;            // 当前实际长度：用了多少字节
        std::atomic_long ref;  // 引用计数：多少个 SharedBuffer 共享我
        // ……方法……
    };
    void *base;                // 唯一的数据成员！指向"真实数据区"的首字节
};
```

核心思想一句话：**`SharedBuffer` 对象本身只有一个指针那么大，所有元数据和数据都藏在堆上的同一块连续内存里。**

---

## 1. 内存布局：一块连续内存，头部 + 数据区

分配时一次性申请 `sizeof(Header) + cap` 字节，排列成：

```
     ┌──────────── 一块连续的堆内存 ────────────┐
     │                                          │
     ▼                                          ▼
  ┌────────┬────────┬────────┬─────────────────────────┐
  │  cap   │  len   │  ref   │      数据区 (cap 字节)     │
  └────────┴────────┴────────┴─────────────────────────┘
  ▲                          ▲
  │                          │
起始地址                    base 指向这里（数据区首字节）
(Header 头部)
  │←──────  sizeof(Header)  →│
```

关键点：
- `base` 存的是**数据区首字节地址**，不是这块内存的起始地址。
- 真正的起始地址（Header 头部）在 `base` 前方 `sizeof(Header)` 字节处。
- 头部与数据区**紧贴、连续**，缓存局部性好，一次分配、一次释放。

---

## 2. 知识点一：嵌套类型声明 ≠ 成员变量

`struct Header { ... };` 写在 `SharedBuffer` 内部，只是定义了一个**嵌套类型** `SharedBuffer::Header`，它**不占用 `SharedBuffer` 的任何字节**。

```cpp
class SharedBuffer {
    struct Header { size_t cap; size_t len; std::atomic_long ref; };

    // Header  header;  // ← 如果这样写，Header 才会内联进 SharedBuffer，对象变大
    void* base;         // ← 当前写法：只放一个指针
};
```

验证：

```cpp
sizeof(SharedBuffer) == sizeof(void*)   // 64 位平台恒为 8 字节，与 Header 里字段多少无关
```

| 写法 | Header 在哪 | sizeof(SharedBuffer) |
|---|---|---|
| `Header header;`（值成员） | 内联在 SharedBuffer 对象里 | 至少 `sizeof(Header)` |
| `void* base;`（当前） | 堆上独立分配，SharedBuffer 只存指针 | `sizeof(void*)` = 8 |

嵌套定义的作用是**类型作用域组织**：把 `Header` 藏在 `SharedBuffer` 命名空间内，避免污染外部命名空间。

---

## 3. 知识点二：指针算术，`-1` 减的是"一个元素"

```cpp
Header* header = (Header*)base - 1;   // 定位头部
```

运算顺序：
1. `(Header*)base` —— 先把 `void*` 转成 `Header*`，编译器认为它指向一个 `Header`。
2. `- 1` —— 在 `Header*` 上减 1，地址后退 **`1 × sizeof(Header)` 字节**，而不是 1 字节。

真实地址公式：

```
地址 = (char*)p ± n * sizeof(*p)
```

同样是 `-1`，指针类型不同，退的字节数完全不同：

| 表达式 | 每步字节数 | `-1` 后退 |
|---|---|---|
| `(char*)base - 1` | 1 | 1 字节 |
| `(int*)base - 1` | 4 | 4 字节 |
| `(Header*)base - 1` | `sizeof(Header)` | 整个 Header 头部 |

因为布局是 `[Header 头部][数据区]` 且 `base` 指向数据区首字节，所以 `(Header*)base - 1` 精确后退一整个头部，落在头部起始处，且类型正好是 `Header*`，可直接 `header->cap`、`header->ref`。

**记忆口诀：指针 `-1` 减的是"一个元素"，元素多大由指针类型决定，与字节数无关。**

---

## 4. 知识点三：前缀头部（Prefix Header）技巧

这种"把元数据放在数据区前面、对外只暴露数据指针"的手法，业界称为 **prefix header / fat pointer 的变体**，也被 SDS（Redis 字符串）、部分 STL 实现、COW 字符串广泛使用。

对外接口拿到的是"干净"的数据指针，需要元数据时反向偏移取头部：

```cpp
Header* header()  { return (Header*)base - 1; }
size_t size()     { return header()->len; }
size_t capacity() { return header()->cap; }
```

优点：
- 使用方无需关心元数据，`base` 可以像普通 `char*` 一样传递。
- 元数据与数据一次分配，减少内存碎片、提升局部性。

---

## 5. 知识点四：引用计数 + 写时复制（COW）

`ref` 用 `std::atomic_long`，支持多个 `SharedBuffer` **共享同一块内存**：

- **拷贝** `SharedBuffer`：只拷贝 `base` 指针，并对 `ref` 原子自增，**不复制数据**（浅拷贝，O(1)）。
- **析构 / 释放**：`ref` 原子自减，减到 0 时才真正 `free` 整块内存。
- **写时复制（COW）**：真正要修改内容前，若 `ref > 1`，先复制出一份独享副本再改，避免影响其他共享者。

```cpp
// 伪代码
SharedBuffer(const SharedBuffer& o) : base(o.base) { header()->ref.fetch_add(1); }

~SharedBuffer() {
    if (header()->ref.fetch_sub(1) == 1)   // 我是最后一个
        free(header());                      // 释放整块（从头部起始处 free）
}
```

用 `atomic` 是为了**多线程下引用计数安全**；注意 COW 本身在多线程写场景仍需额外同步。

---

## 5.1 知识点四·进阶：原子引用计数的两个方法与内存序

引用计数的加/减通常写成两个方法，是并发编程的教科书级写法（和 `std::shared_ptr` 内部控制块几乎一致），难点全在 `std::memory_order` 的选择上：

```cpp
void SharedBuffer::Header::addref() {
    ref.fetch_add(1, std::memory_order_relaxed);   // 计数 +1
}

void SharedBuffer::Header::release() {
    if (1 == ref.fetch_sub(1, std::memory_order_acq_rel)) {
        delete this;   // 减到 0 → 我是最后一个使用者 → 释放内存
    }
}
```

### (1) fetch_add / fetch_sub 返回的是「旧值」

```cpp
ref.fetch_add(1, ...);   // 原子地做 ref = ref + 1，返回【修改前】的值
ref.fetch_sub(1, ...);   // 原子地做 ref = ref - 1，返回【修改前】的值
```

所以 `if (1 == ref.fetch_sub(1, ...))` 判断的是「旧值为 1 → 减完变成 0 → 我是最后一个」。
用旧值判断而不是「先减再读」，是为了让**判断和递减处于同一个原子操作内**，中间不会被其他线程插入，避免竞态。

### (2) addref 为什么用 relaxed（最宽松）

`relaxed` 只保证自增**本身是原子的**（不会两个线程同时 +1 却只加一次），不建立任何跨线程内存顺序约束。

够用的原因：调用 `addref` 的前提是**当前线程已持有一个有效引用**（计数至少为 1，对象此刻绝不会被销毁）。增加引用只是「多登记一个使用者」，不需要看见其他线程的数据修改，也不需要保护其他内存的读写顺序。既然没有同步需求，就用最廉价的 `relaxed`，省掉内存屏障开销。

### (3) release 为什么用 acq_rel（获取 + 释放）

`acq_rel` = `acquire` + `release` 合体，两个语义各解决一个问题：

- **release 语义**：像一道单向屏障，保证本线程在 `fetch_sub` **之前**的所有内存写入（比如刚往缓冲区写过数据），不会被重排到递减之后。这样其他线程一旦观察到这次递减，就一定能看到完整的数据写入——把自己的修改「发布」出去。
- **acquire 语义**：保证最后归零、要执行 `delete this` 的线程，在 `fetch_sub` **之后**能完整看到其他所有线程之前的写入——「接收」前面所有线程发布的修改，才能安全销毁，否则析构时可能读到过期数据。

| 场景 | 需要的语义 | 作用 |
|---|---|---|
| 非最后一个线程递减 | `release` | 把自己的修改发布出去，让后来者能看到 |
| 最后一个线程递减到 0 | `acquire` | 接收前面所有线程的修改，才能安全销毁 |

因为**同一行代码既可能是「非最后一个」也可能是「最后一个」**（取决于运行时哪个线程最后到达），所以两种语义都要，合起来就是 `acq_rel`。

### (4) delete this 惯用法

- 由于 `fetch_sub` 的原子性，全世界**只有一个线程**能拿到旧值 `1`，因此 `delete this` 只执行一次，不会重复释放。
- `delete this` 后 `this` 立即失效，必须是函数的**最后一条语句**，之后绝不能再访问任何成员。

### (5) 进阶优化（了解即可）

工业级实现常把 `acquire` 开销从「每次递减」降到「仅归零那一次」：递减用较便宜的 `release`，确认归零后再补一个 `acquire` 屏障才销毁，效果等价、开销更低：

```cpp
if (1 == ref.fetch_sub(1, std::memory_order_release)) {
    std::atomic_thread_fence(std::memory_order_acquire);  // 归零时才补 acquire
    delete this;
}
```

入门直接用 `acq_rel` 更简洁易懂，正确性完全没问题。

---

## 6. 知识点五：内存对齐带来的实际大小差异

理论上 `sizeof(Header) = 8 + 8 + 4 = 20`，但受**内存对齐**影响：

- `std::atomic_long` 在 64 位平台常按 8 字节对齐 / 大小为 8。
- 编译器会在结构体尾部补齐（padding），使 `sizeof(Header)` 成为对齐值的整数倍。
- 实际 `sizeof(Header)` 常为 **24 字节**，数据区从对齐后的偏移开始。

所以不要手写死 `base - 20`，**永远用 `sizeof(Header)`（即 `(Header*)base - 1`）**让编译器算，才能自动兼容对齐和平台差异。

---

## 7. 释放时的陷阱

因为 `base` 不是 `malloc` 返回的原始地址，**释放时必须回退到头部**：

```cpp
free(header());       // 正确：free((Header*)base - 1)
// free(base);        // 错误！base 不是分配起始地址，会导致未定义行为
```

分配同理，`malloc` 之后要把返回指针**向后偏移 `sizeof(Header)`** 才得到 `base`：

```cpp
void* mem = malloc(sizeof(Header) + cap);
Header* h = new (mem) Header{cap, 0, 1};   // placement new 构造头部
base = (void*)(h + 1);                      // base = 头部之后的数据区
```

---

## 8. 一图总结知识点

| # | 知识点 | 一句话 |
|---|---|---|
| 1 | 嵌套类型 | 类内 `struct Header{}` 只是声明类型，不占对象内存 |
| 2 | 指针算术 | `-1` 退一个元素 = `sizeof(*p)` 字节，非 1 字节 |
| 3 | 前缀头部 | 元数据藏数据前，对外只给数据指针，反向偏移取头 |
| 4 | 引用计数 | `atomic ref` 实现 O(1) 浅拷贝共享 + 归零释放 |
| 4+ | 内存序 | `addref` 用 `relaxed`；`release` 用 `acq_rel`，判旧值==1 才 `delete this` |
| 5 | 写时复制 | 改前判断 `ref>1` 则先复制，隔离共享者 |
| 6 | 内存对齐 | 用 `sizeof(Header)` 而非硬编码字节数 |
| 7 | 分配/释放 | `free` 和 `malloc` 都针对头部起始地址，别用 base |

---

## 9. 延伸阅读关键词

- Prefix header / intrusive metadata
- Copy-on-write (COW) string
- Reference counting、`std::shared_ptr` 控制块的相似思路
- placement new / 手动内存管理
- Redis SDS (Simple Dynamic Strings) 的头部布局

