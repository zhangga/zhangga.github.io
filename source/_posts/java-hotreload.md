---
title: 为什么删掉一条日志，会导致 Java 热更失败？
tags:
  - UE
id: java-hotreload
categories:
  - 笔记
date: 2026-09-28 11:43:52
---

# 为什么删掉一条日志，会导致 Java 热更失败？

一次业务修复中，开发者删除了一个不再适用的校验分支，包括分支中的日志和提前返回，并调整了后续处理逻辑。代码能够正常编译，源码也没有显式增删字段、方法或修改继承关系。然而，热更新时报错：

```text
java.lang.UnsupportedOperationException:
class redefinition failed: attempted to delete a method
```

排查后的结论是：**删除日志减少了对父类 `protected` 字段的访问，导致 javac 少生成了一个合成访问器。JVM 检查新旧 class 时，发现方法被删除，因此拒绝热更。**

本文根据一次实际排查整理，项目、业务、类名和包名均已泛化。代码片段用于解释机制，不代表完整业务实现；字节码摘录保留了问题相关的结构，类名作了对应替换。复现环境为 Temurin OpenJDK 25+36，热更入口为标准 `Instrumentation.redefineClasses`。

先看这个场景的类关系。父类位于一个包中，声明了日志字段：

```java
// demo.core.BaseHandler
public abstract class BaseHandler {
    protected static final Logger logger =
            LoggerFactory.getLogger(BaseHandler.class);
}
```

业务 Handler 位于另一个包中，并在方法内部创建匿名任务：

```java
// demo.feature.RequestHandler
public class RequestHandler extends BaseHandler {
    public void handle() {
        new Task() {
            @Override
            protected boolean process() {
                // 省略业务处理
                logger.error("validation failed");
                return false;
            }
        }.run();
    }
}
```

这里的 `Task` 代表一个无关的任务基类，不继承 `BaseHandler`。编译后，实际上存在三个独立的类：

| 类 | 继承关系 | 所在包 |
| --- | --- | --- |
| `BaseHandler` | 日志字段的声明者 | `demo.core` |
| `RequestHandler` | 继承 `BaseHandler` | `demo.feature` |
| `RequestHandler$1` | 继承 `Task` | `demo.feature` |

`RequestHandler$1` 是匿名内部类。它在源码中嵌套于 Handler，但并没有因此继承 Handler。Java 的包名也不赋予层级访问权限：不同包之间，即使名字存在前缀关系，也不能按同包处理。

这就带来了访问权限上的差异。外层 `RequestHandler` 是 `BaseHandler` 的子类，可以跨包访问其 `protected static logger`。匿名类 `$1` 本身既不是 `BaseHandler` 的子类，也不在 `demo.core` 包中，不能以自己的身份直接读取这个字段。

不过，从 Java 源码层面看，这段访问位于外层子类的类体之内，符合语言规则，因此可以通过编译。[JLS 对 protected 访问的规定](https://docs.oracle.com/javase/specs/jls/se25/html/jls-6.html#jls-6.6.2.1)

为了让合法的源码满足 JVM 对实际访问类的检查，javac 在外层 Handler 中生成一个中转方法。下面是便于理解的伪代码：

```java
class RequestHandler extends BaseHandler {
    // 编译器生成，源码中没有这个声明
    static Logger access$000() {
        return logger;
    }
}

class RequestHandler$1 extends Task {
    protected boolean process() {
        RequestHandler.access$000().error("validation failed");
        return false;
    }
}
```

这条访问路径可以画成：

```text
匿名类 RequestHandler$1.process()
        │ 调用同包可见的方法
        ▼
外层类 RequestHandler.access$000()
        │ 以 BaseHandler 子类的身份读取字段
        ▼
父类 BaseHandler.logger
```

匿名类与外层类位于同一包，可以调用这个包可见的静态方法；真正读取 `logger` 的字节码位于外层子类中，满足 `protected` 访问要求。[JVM 字段与方法的访问检查规则](https://docs.oracle.com/javase/specs/jvms/se25/html/jvms-5.html#jvms-5.4.4)

**`access$000()` 是 class 文件中的真实方法。** 用 `javap -v -p` 可以看到类似下面的结果：

```text
static org.slf4j.Logger access$000();
  descriptor: ()Lorg/slf4j/Logger;
  flags: ACC_STATIC, ACC_SYNTHETIC
  Code:
    0: getstatic  ... logger:Lorg/slf4j/Logger;
    3: areturn
```

`ACC_STATIC` 表示静态方法；`ACC_SYNTHETIC` 表示这是编译器生成的合成方法；描述符 `()Lorg/slf4j/Logger;` 表示它无参数、返回 `Logger`。方法体只做两件事：读取静态字段并返回。

`SYNTHETIC` 标记不会让这个方法免于热更检查。它有自己的名称、描述符和访问标志，也属于类的方法集合。严格来说，这里是“合成访问器”，与泛型擦除产生、带有 `ACC_BRIDGE` 标记的桥接方法是不同机制。

回到这次变更。在所用编译器的实际产物中，修改前有四处日志访问，分别使用四个合成访问器。删除其中一处后，结果如下：

| 日志位置（已泛化） | 修改前调用 | 修改后调用 |
| --- | --- | --- |
| 前置状态检查失败 | `access$000()` | `access$000()` |
| 规则配置缺失 | `access$100()` | `access$100()` |
| 累计数量达到阈值，被旧逻辑判为异常 | `access$200()` | 该日志被删除 |
| 后续处理失败 | `access$300()` | `access$200()` |

四个访问器的方法体都只是返回同一个 `logger`。源码删除了第三处访问，重新编译后，最后一处访问的编号前移，最终消失的是 `access$300()`：

```text
旧 RequestHandler.class
  access$000() → Logger
  access$100() → Logger
  access$200() → Logger
  access$300() → Logger

新 RequestHandler.class
  access$000() → Logger
  access$100() → Logger
  access$200() → Logger
```

**这不是 Java 语言保证的“一条日志对应一个访问器”。** 访问器是否生成、是否复用以及如何编号，属于编译器实现细节。这里的数量和编号来自本次实际产物，换用其他编译器或版本时，应重新检查字节码。

热更系统拿到这些 class 后，通常会执行类似的代码：

```java
Class<?> loadedClass = Class.forName(className);
ClassDefinition definition =
        new ClassDefinition(loadedClass, replacementBytes);

instrumentation.redefineClasses(definition);
```

这会更新已经加载的类，同时保留现有类身份和对象。标准重定义接口允许修改方法体，但对类结构有明确约束，例如禁止增删字段或方法、修改方法签名以及改变继承关系。[JVMTI RedefineClasses 约束](https://docs.oracle.com/en/java/javase/25/docs/specs/jvmti.html#RedefineClasses)

JVM 比较的是新旧 class 定义。因此，这次失败的因果链是：

```text
删除校验分支中的日志
    → 对继承的 protected logger 少了一处访问
    → javac 少生成一个合成访问器
    → 新 class 缺少旧 class 中的 access$300()
    → JVM 判定发生了方法删除
    → 热更失败
```

即使新代码已经不再调用 `access$300()`，也不能通过这项结构检查。接口不会因为一个方法“看起来已无调用者”就允许删除它。

如果一次 `redefineClasses` 调用提交了多个类，其中一个类违反限制，会导致这次调用中的所有类都不安装新定义。这是单次调用的整体语义；如果热更平台分多次调用，就需要分别分析每批结果。[JVMTI 对失败与安装结果的说明](https://docs.oracle.com/en/java/javase/25/docs/specs/jvmti.html#RedefineClasses)

排查时，验证分成两部分。首先，用相同编译环境分别编译修改前后的源码，比较外层类和匿名内部类的方法、字段与描述符。其次，用隔离类加载器加载旧版本，再通过 Java Agent 提供的 `Instrumentation` 实际执行重定义，无需启动完整业务服务。

字节码对比表明：匿名内部类的字段、构造器和原有 Lambda 方法签名没有变化；外层类缺少一个合成访问器。重定义实验则直接复现了 `attempted to delete a method`。

为了进一步确认因果关系，在实验副本中保留业务修复，同时在原日志位置恢复一次合理的日志访问。例如，旧逻辑把“累计数量已经满足要求”视为异常，新逻辑允许继续完成操作，可以改成：

```java
int remaining = Math.max(0, required - accumulated);

if (remaining == 0) {
    logger.info(
            "Requirements already satisfied, accumulated={}, required={}",
            accumulated, required);
}

// 按新规则继续处理，不在这里报错返回
```

这样既保留了业务修复，又保留了这一处 `logger` 访问。本次编译生成的四个访问器恢复，方法结构与旧版本一致，验证结果如下：

| 实验 | 结果 |
| --- | --- |
| 旧版本 → 删除日志后的版本 | 重定义失败：尝试删除方法 |
| 旧版本 → 保留合理日志访问的修正版 | 外层类与匿名内部类重定义成功 |

这个实验验证的是类重定义兼容性。业务处理、日志频率和部署流程仍应按各自的验证要求检查，不能用重定义成功代替业务测试。

这里需要保留的是编译产物中的结构，而不是单纯保留一行源码。`if (false) { logger.info(...); }` 之类的不可达代码可能在编译时被消除，不能用作可靠的结构占位。仅仅保证日志数量相同也不是通用判据：访问的成员、生成的方法名、描述符和标志都需要与实际旧产物核对。

这个现象也不会因为使用新版本 JDK 就自动消失。现代 JVM 的 Nestmates 机制允许同一个 nest 中的类相互访问 `private` 成员，但不会让匿名类自动获得外层类跨包访问父类 `protected` 成员的资格。本次 JDK 25 产物中，`NestMembers` 属性与 `access$...` 方法同时存在。[JVM 对 nest 与访问权限的定义](https://docs.oracle.com/javase/specs/jvms/se25/html/jvms-5.html#jvms-5.4.4)

在实践中，发布前可以先检查实际产物：

```bash
# -p 显示全部访问级别的方法；-s 显示描述符
javap -p -s 'RequestHandler.class'
javap -p -s 'RequestHandler$1.class'

# -v 查看 synthetic 等标志；-c 查看具体调用与字段访问
javap -v -p 'RequestHandler.class'
javap -c -p 'RequestHandler$1.class'
```

比较时应覆盖外层类、匿名内部类以及 Lambda 等生成的方法，尤其留意 `access$...`、`lambda$...`、捕获变量字段、构造器参数和访问标志。`javap` 适合人工定位；自动化检查可以解析 class 结构，再结合实际重定义实验验证。

比较基准应尽量使用与线上已加载版本一致的产物。只重新编译一份“旧源码”，可能遗漏原编译器、编译参数、依赖或已有补丁造成的差异。如果运行时还有字节码增强，也需要把增强后的定义纳入分析。

这次问题留下的经验是：**源码层面的“只改方法体”，并不保证字节码层面也只改了方法体。** 对 Java 热更而言，编译器生成的成员同样属于兼容性边界，最终应以 class 结构和实际重定义结果为依据。
