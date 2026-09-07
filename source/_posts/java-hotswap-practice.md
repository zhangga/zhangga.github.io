---
title: JVM 不停机热更的工程实践与原理
tags:
  - UE
id: java-hotswap-practice
categories:
  - 笔记
date: 2026-08-10 18:02:21
---

# JVM 不停机热更 Java Class 的工程实践与原理

> 面向线上服务的一种"运行时替换类字节码"能力：在不重启进程的前提下修复逻辑 bug。本文完整拆解从构建打包到运行时生效的全链路机制、关键设计取舍，以及新 Pod 拉起、版本发布等真实运维场景下的处理方式。文中所有代码均为脱敏后的示意实现，用于说明原理。

---

## 一、为什么需要热更

线上服务出现逻辑 bug 时，常规修复路径是"改代码 → 打包 → 发版 → 滚动重启"。这条路径可靠，但有两个代价：

- **时效性差**：从发现到生效往往要经过完整的 CI/CD 与灰度流程。
- **状态损失**：进程重启会丢失内存态（连接、缓存、会话、对局等），对有状态服务尤其致命。

热更（HotSwap）提供了一条补充路径：**只替换出问题的那几个类的字节码，进程继续运行，内存态不丢**。它不是发版的替代品，而是"紧急止血"的手段——正式修复最终仍要回流代码主干、随发版落地。

热更的底层能力来自 JVM 的 **Instrumentation API**。JVM 允许一个 `javaagent` 在运行时调用 `Instrumentation.redefineClasses`，用新的字节码替换已加载类的方法实现。

---

## 二、全链路概览

整条链路分为两大阶段，通过一个**分布式 KV 的键变更事件**实现"文件下发"与"生效时机"的解耦：

```
构建期 · 打包下发                          运行期 · 服务端生效
┌─────────────────────────┐              ┌─────────────────────────┐
│ ① 触发构建（指定服务/分支）│              │ ⑤ 服务 watch 感知键变更   │
│            ↓             │              │            ↓             │
│ ② 收集变更 class + diff   │              │ ⑥a 处理新增类（repair）   │
│    （只保留真正改动的类）  │   ── 信号 ──▶ │            ↓             │
│            ↓             │   KV 键变更   │ ⑥b redefineClasses ★核心 │
│ ③ 打包并下发到 patches/   │              │    （方法体原子替换）      │
│            ↓             │              │            ↓             │
│ ④ 运维触发热更信号        │              │ ⑦ 落地 classpath + 备份   │
│    （写 KV 键）           │              │    （防重启回退）          │
└─────────────────────────┘              └─────────────────────────┘
```

关键点在于：**class 文件走独立的文件下发通道，KV 键只作为"该去读补丁目录了"的信号**（键值本身仅为占位）。二者解耦，使"何时推送文件"与"何时触发生效"可以分别控制。

---

## 三、构建期：提取"最小变更集合"

热更的安全性，很大程度上取决于**只替换真正改动过的类**。替换的类越少，运行时状态被扰动的风险越低。因此构建期的核心动作是 **diff**——把新编译的产物与线上基线逐个比对，只保留发生变化的 `.class`。

### 3.1 取线上基线

从制品仓库下载当前线上版本的服务包，解出其中的 `.jar`，作为"旧代码"参照物。

### 3.2 产出新版 class

按目标服务编译（或直接使用手工放置的编译产物），解出新版本的 `.class` 文件。

### 3.3 按类名收集"class 家族"

改一个类，往往会连带编译出多个内部类/匿名类文件（如 `Foo$Inner.class`、`Foo$1.class`）。热更时它们必须**作为一个整体一起替换**，否则字节码不自洽。下面这个函数负责把"一个类名"解析成"它的完整 class 家族文件集合"：

```bash
collect_class_family() {
    local class_name=$1
    local target_dir=$2
    local copy_func=${3:-copy_class_file}   # 可插拔的拷贝策略，默认普通拷贝
    local class_path

    # 判断是全限定名（含 . 或 /）还是简单名
    if [[ "$class_name" == *.* || "$class_name" == */* ]]; then
        class_path=${class_name//./\/}      # 包名转目录：com.example.Foo -> com/example/Foo
        # 主类：按路径精确匹配
        find . -path "*/${class_path}.class" | while read -r clz; do
            "$copy_func" "$clz" "$target_dir"
        done
        # 内部类/匿名类：Foo$*.class
        find . -path "*/${class_path}\$*.class" | while read -r clz; do
            "$copy_func" "$clz" "$target_dir"
        done
    else
        # 简单名：只能按文件名匹配
        find . -name "${class_name}.class" | while read -r clz; do
            "$copy_func" "$clz" "$target_dir"
        done
        find . -name "${class_name}\$*.class" | while read -r clz; do
            "$copy_func" "$clz" "$target_dir"
        done
    fi
}
```

设计要点：

- **两次 `find`**：一次抓主类，一次抓 `$` 内部类/匿名类，保证 class 家族完整。
- **全限定名 vs 简单名**：全限定名用 `-path` 带包路径精确匹配，**无歧义**；简单名只能用 `-name` 按文件名匹配，若多个包里有同名类会**全部命中**，存在误收风险。生产实现应对简单名做歧义冲突检测。
- **可插拔拷贝策略**（`${3:-copy_class_file}`）：普通改动类走一种拷贝，新增类走另一种（下文详述）。

### 3.4 MD5 去重

对收集到的每个 class，与基线里的同名 class 比对哈希，**相同即删除**；若最终剩余数量为 0，说明没有实际变更，直接失败退出、不产出空包：

```bash
for file in "$curdir"/*.class; do
    curMd5=$(md5sum "$file" | awk '{print $1}')
    baseMd5=$(md5sum "$BASE_DIR/${file##*/}" | awk '{print $1}')
    if [ "$curMd5" = "$baseMd5" ]; then
        rm -rf "$file"     # 哈希一致 = 未改动，剔除
    fi
done
```

> **进阶做法**：更严谨的实现会跳过 shell 层的 `md5sum`，直接读两边 `.jar` 内的字节码做逐字节比较，并对简单类名做多根歧义检测——确定性更高。

### 3.5 打包下发

把补丁目录打成压缩包，上传到制品/发布系统，再由发布系统同步到目标服务器的工作目录 `patches/`，等待运行期信号。

---

## 四、运行期：Agent 注册与触发

### 4.1 javaagent 注册（能力来源）

框架 jar 的清单中声明了 `Premain-Class` 与 `Agent-Class`，都指向热更 Agent 类。服务启动时通过 `-javaagent:framework.jar` 加载它，JVM 在 `premain` 阶段把 `Instrumentation` 句柄保存为静态字段——**这是后续能调用 `redefineClasses` 的唯一入口**：

```java
public static void premain(String args, Instrumentation inst) {
    HotSwapAgent.inst = inst;   // 保存句柄，供热更时使用
}
```

> 若启动参数缺少 `-javaagent`，`inst` 为 null，热更会直接失败并提示"未添加此特性，请检查 javaagent 启动参数"。

### 4.2 触发链路（基于 KV watch）

```
运维调用热更接口
    → 服务端向 KV 写入键 hotswap/<service>（值仅为占位）
        → 目标服务 watch 到该键的 PUT 事件
            → 调用 HotSwap.reloadAllClass()
```

用 KV 键变更做信号、文件走独立通道，好处是天然支持"先把文件铺到所有节点，再统一触发生效"。

---

## 五、核心原理：redefineClasses 如何工作

`reloadAllClass()` 的主流程（已省略异常分支）：

```java
public static String reloadAllClass() {
    // ① 先处理新增类（见第六节）
    String repairErr = HotSwapAgent.moveRepairPatchToWorkDir();
    if (repairErr != null) return repairErr;

    // ② 用 ASM 读字节码解析出全限定类名（不依赖文件名），得到 类名 -> File
    Map<String, File> files = HotSwapAgent.getFullClassNameFiles();
    if (files.isEmpty()) return "can't find class files in patches";

    // ③ 批量重定义
    return HotSwapAgent.reloadAllClasses(files);
}
```

批量重定义的实现：

```java
public static String reloadAllClasses(Map<String, File> classFiles) {
    if (inst == null) return "未添加 javaagent 特性";

    var defs = new ArrayList<ClassDefinition>();
    for (var e : classFiles.entrySet()) {
        var cls  = Class.forName(e.getKey());              // 必须是【已加载】的类
        var code = loadBytesFromClassFile(e.getValue());   // 新字节码
        defs.add(new ClassDefinition(cls, code));
    }

    // 一次性原子替换全部类的方法体
    inst.redefineClasses(defs.toArray(new ClassDefinition[0]));

    onReloadSuccess(classFiles);   // 落地 classpath + 备份，防重启丢失
    return "hot swap success";
}
```

**`redefineClasses` 的语义**：用新字节码替换已加载类的方法实现，同一进程内**原子生效**——不重启、不更换类加载器、不清空已有对象的实例状态与静态状态。这正是它适合线上快速修逻辑 bug 的原因。

**两个细节值得注意**：

- **用 ASM 解析类名而非文件名**：补丁文件名可能被打包过程改写，但字节码里的类名是权威的。用 `ClassReader` 读出 `node.name` 再 `Class.forName`，避免文件名与真实类名不一致导致的错配。
- **批量而非逐个**：一次 `redefineClasses(defs...)` 传入全部 `ClassDefinition`，要么全成功要么全失败，避免"改了一半"的中间态。

---

## 六、进阶：热更时如何处理"新增类"

这是最容易被误解的部分。**新增类根本不走 `redefineClasses`**。

### 6.1 为什么新增类不能用 redefineClasses

`ClassDefinition` 的构造要求先给出一个**已加载的 `Class<?>` 对象**：

```java
var cls = Class.forName(className);   // ← 新类会在这里抛 ClassNotFoundException
var def = new ClassDefinition(cls, code);
```

`redefineClasses` 的语义是"**重定义已存在的类**"。新类从未被 JVM 加载过，没有对应的 `Class` 对象可替换，`Class.forName` 直接抛 `ClassNotFoundException`。这是 JVM 层面的硬限制，不是实现选择。

### 6.2 打包侧：新增类保留包路径

普通类和新增类使用**两个不同的拷贝函数**，区别只在"是否保留包目录结构"：

```bash
# 普通热更类：路径拍平成单层文件名（给 redefineClasses 用，服务端靠 ASM 读真实类名）
copy_class_file() {
    local clz=$1; local target_dir=$2
    local flat=${clz#./}; flat=${flat////\.}          # / 全部替换为 .
    cp "$clz" "${target_dir}/${flat}"                 # -> com.example.Foo.class
}

# 新增类：保留原始包路径（给类加载器按包名查找用）
copy_repair_class_file() {
    local clz=$1; local target_dir=$2
    local rel=${clz#./}
    local dst="${target_dir}/${rel}"
    mkdir -p "$(dirname "$dst")"                       # 重建包目录
    cp "$clz" "$dst"                                  # -> com/example/Foo.class
}
```

新增类通过独立参数触发，显式指定 repair 通道与保留路径的拷贝策略：

```bash
collect_class_family "$each" "${HOME}/patches/repair" copy_repair_class_file
```

**为什么普通类可以拍平、新类必须保留目录？**
普通类给 `redefineClasses` 用，服务端用 ASM 读字节码里的真实类名，文件名怎么放都行。而新类要被**类加载器按包路径查找**——`com.example.Foo` 必须物理存放在 `com/example/Foo.class`，否则加载器找不到它。

### 6.3 服务端：把 repair 类"归位"到类加载根

服务端在跑 `redefineClasses` **之前**，先执行 `moveRepairPatchToWorkDir()`（它是整个流程的第一步）：

```java
public static String moveRepairPatchToWorkDir() throws IOException {
    var repairDir = new File(PATCH_REPAIR_DIR);
    if (!repairDir.exists()) return null;

    var workDir = new File(".");        // 类加载根，且是 classpath 第一项
    var children = listFiles(repairDir);

    // ① 冲突检测：先扫一遍，不动任何文件
    List<String> conflicts = new ArrayList<>();
    for (var child : children) {
        collectRepairPatchConflicts(repairDir, child, workDir, conflicts);
    }
    if (!conflicts.isEmpty()) {         // 有冲突则整批失败，避免部分成功的脏状态
        return "repair patch conflict with ./ : " + String.join(", ", conflicts);
    }

    // ② 冲突检查通过，连同目录结构移动到 ./
    for (var child : children) {
        moveRepairPatch(child, new File(workDir, child.getName()));
    }
    FileUtils.deleteDirectory(repairDir);
    return null;
}
```

冲突检测的语义是：repair 目录只允许放**真正的新文件**。若工作目录下已存在同路径的 class，说明它其实是"已存在类"而非"新增类"，不该走 repair 通道——此时整批失败并归档，不做任何移动。

### 6.4 新类如何真正"生效"——懒加载

关键：`moveRepairPatchToWorkDir` **并没有主动加载新类**，它只是把 `.class` 文件放到了类加载器能扫到、且优先级最高的位置（`./`）。新类真正被加载，发生在**运行时第一次引用它时**：

1. 某个被热更过的老方法（通过 `redefineClasses` 改进来的新逻辑）第一次 `new Foo()` 或引用 `Foo.class`；
2. JVM 的应用类加载器（双亲委派）此时才去 classpath 搜 `com/example/Foo.class`，在 `./` 命中，按标准流程加载、链接、初始化。

所以新类的典型用法是**配合方法体热更一起上**：改一个已有类的方法体（走 redefine），让它去调用一个全新的类（走 repair），从而绕过"不能给已有类加方法/字段"的限制——**需要新逻辑就新开一个类装，而不是往老类里塞**。

### 6.5 两条通道对比

| 维度 | 普通热更类（redefine） | 新增类（repair） |
|---|---|---|
| 目标 | 改已加载类的方法体 | 引入 JVM 里不存在的新类 |
| 打包命名 | 拍平成单层文件名 | 保留包路径目录结构 |
| 落地目录 | `patches/` | `patches/repair/` → 移到 `./` |
| JVM 机制 | `Instrumentation.redefineClasses` | 类加载器懒加载（双亲委派） |
| 生效时机 | 调用瞬间原子生效 | 运行时第一次引用该类时 |
| 关键限制 | 不能改字段/方法签名/继承 | 必须是全新类，与 `./` 已有文件不能冲突 |
| 失败处理 | 单类找不到即整批失败 | 有冲突即整批失败并归档 |

---

## 七、防重启兜底机制

`redefineClasses` 只改内存中已加载的字节码。若进程重启，JVM 会重新从 classpath 加载"旧 jar 里的老类"，热更就丢了。为此需要把热更结果落盘到 classpath，并做备份。三个目录各司其职：

| 目录 | 用途 |
|---|---|
| `patches/` | 补丁 class 的落地处；redefine 前移到日期命名子目录归档 |
| `patches/classpath/` | 加入启动 classpath；redefine 成功后按包名复制到此，**确保重启后仍加载新字节码** |
| `patches/deprecated/` | 复制新 class 时，classpath 下的同名旧 class 移到此保留，便于回溯 |
| `patches/repair/` | 新增类按包路径存放，redefine 前移到工作根 `./` 生效 |

**classpath 的顺序是关键**。启动脚本里补丁目录排在原始 jar **之前**：

```sh
cpath="./:patches/classpath/:lib/*"
```

类加载器先命中热更后的 class，原 jar 里的老版本被"遮蔽"。启动时还会校验关键类确实是从 `patches/classpath` 加载的，不符则告警。

---

## 八、运维视角：新 Pod 与版本发布

热更是"运行时改内存"，而容器会重建、服务会发版。这两个场景下热更结果如何延续与收敛，取决于 **持久化存储**、**classpath 优先级** 与 **清理标记** 三个机制。

### 8.1 新 Pod 拉起会重新走热更流程吗？

**不会重放 `redefineClasses`，但新 Pod 启动后加载的就是热更后的字节码。**

`redefineClasses` 只作用于当时在跑的进程内存，新 Pod 是全新进程，不会、也不需要重新执行一遍 redefine。但热更结果已落盘：成功时会把补丁 class 复制进 `patches/classpath/`，并（在开启持久化时）备份到共享网络存储。新 Pod 的启动脚本会从持久化目录把补丁拷回工作目录：

```sh
# 启动时：持久化目录有热更数据就复制到工作目录
if [ -d "$persist/patches" ]; then
    cp -r "$persist"/patches/* ./patches
fi
```

再配合前述 classpath 顺序（`patches/classpath/` 在 `lib/*` 之前），新 Pod **加载出来的就是热更后的版本**，行为与老 Pod 一致。

> **前提**：必须开启持久化（共享存储备份）。若未配置，新 Pod 只能加载原始 jar，会"丢热更"。

### 8.2 下次发版，这些热更怎么处理？

**发版既不会自动合并热更，也不会自动清理。** 发版换的是镜像里的 jar，而热更 class 存活在持久化存储上，两者生命周期独立。存在两种走向：

| 走向 | 行为与风险 |
|---|---|
| **默认不清理** | 新 jar 已就位，但持久化存储上 `patches/classpath/` 仍在，新 Pod 仍优先加载旧热更 class。**若新版本已在 jar 里正式修复了同一个类，旧热更 class 反而会把正式修复"盖回旧逻辑"**——这是最典型的坑。 |
| **投放清理标记** | 在持久化热更目录放一个清理标记文件，新 Pod 启动前清空所有热更残留，改为纯净加载新 jar。清理后标记文件自身也被删除，不影响后续热更。 |

清理逻辑示意：

```sh
# 启动时：存在清理标记就清空历史热更数据
if [ -f "$persist/clean_tag" ]; then
    rm -rf "$persist"/patches "$persist"/config "$persist"/clean_tag
fi
```

**发版实践**：每次正式发版前，务必确认新 jar 是否已包含线上热更的修复；若已包含，就要投放清理标记清除持久化存储上的旧热更，否则旧 class 会覆盖正式修复。

---

## 九、JVM HotSwap 的能力边界

标准 `redefineClasses` 受 JVM 能力限制，理解这些边界才能安全使用：

- **能做**：修改已有方法的方法体（改逻辑、改常量、修 bug）。
- **不能做**：新增/删除字段、新增/删除方法、修改方法签名、改变继承关系或类修饰符——这类操作会抛 `UnmodifiableClassException`，热更失败。
- **结构性改动的出路**：走"新增类 → repair 通道"以补 classpath 的方式绕过；或走常规发版重启。

---

## 十、总结

这套热更方案的核心思想可以概括为三点：

1. **最小变更**：构建期通过 diff 只提取真正改动的 class，替换面越小、风险越低。
2. **两条通道**：改逻辑用 `redefineClasses`（方法体原子替换），加东西用新类走 classpath 懒加载——正好补上 JVM HotSwap "不能给已有类增删成员" 的能力缺口。
3. **解耦与收敛**：文件下发与生效时机通过 KV 键解耦；热更产物靠持久化 + classpath 优先级在新 Pod 上延续，靠清理标记在发版时收敛。

最后强调：**热更是"临时补丁"，不是发版的替代品**。正式修复应回流代码主干、随发版落地，并在发版时清理对应的临时补丁，避免补丁长期累积、造成版本漂移和难以排查的"幽灵 bug"。
