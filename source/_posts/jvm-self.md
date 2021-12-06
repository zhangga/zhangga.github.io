---
title: 自己动手写JVM
date: 2019-02-27 19:40:56
tags:
  - JAVA
id: jvm-self
categories:
  - 笔记
---

根据《自己动手写Java虚拟机》一书

![自己动手写JVM - 第1张  | 张嘎](https://i0.wp.com/192.144.167.243/blog/wp-content/uploads/cover-300x179.png?resize=300%2C179)

## 实现的go代码在GitHub中：[QJvm](https://github.com/zhangga/QJvm)

## 可视化查看class文件的工具：[查看class工具](https://github.com/zxh0/classpy)，启动类：ClasspyApp。书籍自身代码：[代码](https://github.com/zxh0/jvmgo-book)

 <!-- more -->

# Class文件解析：

![自己动手写JVM - 第2张  | 张嘎](https://i2.wp.com/192.144.167.243/blog/wp-content/uploads/22.png?resize=640%2C484)

如上图所示：

常量池解析：

1.读取16位的常量池大小cp_count。

2.索引从1到cp_count-1，依次读取常量信息。

3.常量信息有tag(8bit)表示常量类型。不同的类型读取数据方式不同。

// 常量池类型

const (

  CONSTANT_Class = 7

  CONSTANT_Fieldref = 9

  CONSTANT_Methodref = 10

  CONSTANT_InterfaceMethodref = 11

  CONSTANT_String = 8

  CONSTANT_Integer = 3

  CONSTANT_Float = 4

  CONSTANT_Long = 5

  CONSTANT_Double = 6

  CONSTANT_NameAndType = 12

  CONSTANT_Utf8 = 1

  CONSTANT_MethodHandle = 15

  CONSTANT_MethodType = 16

  CONSTANT_InvokeDynamic = 18

)

![自己动手写JVM - 第3张  | 张嘎](https://i1.wp.com/192.144.167.243/blog/wp-content/uploads/23.png?resize=640%2C490)

常量池类型可分为下面几大类：

| 类型         | 说明             | 具体代表类型           | class存储格式                                                |
| ------------ | ---------------- | ---------------------- | ------------------------------------------------------------ |
| numeric      | 数值型           | int/float/double等     | tag(8bit)+数值(具体类型决定)                                 |
| string       | 指向字符串       | string                 | tag(8bit)+指向utf8字符串的索引(16bit)                        |
| utf8         | 字符串           | string                 | tag(8bit)+length(16b)+bytes(length)                          |
| class        | 类信息           | class                  | tag(8bit)+指向utf8字符串的索引(16bit)                        |
| name&type    | 名字和描述(参数) | 字段、方法的名称和描述 | tag(8bit)+指向name字符串索引(16bit)+指向描述字符串的索引(16bit) |
| member       | 成员信息         | 字段、方法、接口信息等 | tag(8bit)+指向class索引(16bit)+指向name&type的索引(16bit)    |
| methodType   | 方法描述         | 方法                   | tag(8bit)+指向描述字符串的索引(16bit)                        |
| methodHandle | 方法句柄         | 方法句柄               | tag(8bit)+refKind(8b)+指向引用ref的索引(16b)                 |
| dynamic      | 动态调用         | Lambda表达式           | tag(8bit)+指定启动方法的索引(16b指向属性表)+指向name&type的索引(16b) |

# 动态调用：CONSTANT_InvokeDynamic_info

为了更好的支持[动态类型语言](http://en.wikipedia.org/wiki/Dynamic_typing#DYNAMIC)，[Java7](https://www.baidu.com/s?wd=Java7&tn=24004469_oem_dg&rsv_dl=gh_pl_sl_csd)通过[JSR292](https://jcp.org/en/jsr/detail?id=292)给JVM增加了一条新的字节码指令：invokedynamic。Java8的Lambda表达式。

以下面代码为例：

![自己动手写JVM - 第4张  | 张嘎](https://i2.wp.com/192.144.167.243/blog/wp-content/uploads/24.png?resize=640%2C239)

使用javap -v -p指令反编译生成的class文件，找到main方法，可以看到生成了一条indy指令

![自己动手写JVM - 第5张  | 张嘎](https://i1.wp.com/192.144.167.243/blog/wp-content/uploads/25.png?resize=640%2C223)

指向常量池索引为#2，查看常量池可知，确实是一个CONSTANT_InvokeDynamic_info

CONSTANT_InvokeDynamic_info {

  u1 tag;

  u2 bootstrap_method_attr_index;

  u2 name_and_type_index;

}

![自己动手写JVM - 第6张  | 张嘎](https://i0.wp.com/192.144.167.243/blog/wp-content/uploads/26.png?resize=640%2C89)

可以看到有两个参数即我们上面表中总结的参数分别为：

指定启动方法的索引(16b指向属性表)+指向name&type的索引(16b)

先看name&type

![自己动手写JVM - 第7张  | 张嘎](https://i1.wp.com/192.144.167.243/blog/wp-content/uploads/35.png?resize=640%2C125)

它描述的是这样的一个方法：

Runnable run() {…}

再看bootstrap_method_attr_index

[JVM规范](http://docs.oracle.com/javase/specs/jvms/se7/html/jvms-4.html#jvms-4.7.21)规定，如果类的常量池中存在CONSTANT_InvokeDynamic_info的话，那么attributes表中就必定**有且仅有一个**BootstrapMethods属性。BootstrapMethods属性是个变长的表，结构如下所示：

BootstrapMethods_attribute {
u2 attribute_name_index;
u4 attribute_length;
u2 num_bootstrap_methods;
{   u2 bootstrap_method_ref;
u2 num_bootstrap_arguments;
u2 bootstrap_arguments[num_bootstrap_arguments];
} bootstrap_methods[num_bootstrap_methods];
}
每一个BootstrapMethod都包含一个bootstrap_method_ref和n个bootstrap_arguments。bootstrap_method_ref是个常量池索引，指向一个CONSTANT_MethodHandle_info。而每一个bootstrap_argument也都是常量池索引，可以指向下面这些结构：

- CONSTANT_String_info
- CONSTANT_Class_info
- CONSTANT_Integer_info
- CONSTANT_Long_info
- CONSTANT_Float_info
- CONSTANT_Double_info
- CONSTANT_MethodHandle_info
- CONSTANT_MethodType_info

本例中的启动方法反编译图：

![自己动手写JVM - 第8张  | 张嘎](https://i1.wp.com/192.144.167.243/blog/wp-content/uploads/28.png?resize=640%2C132)

确实存在一个BootstrapMethods表，这个表中只有一个BootstrapMethod，它的bootstrap_method_ref是常量池#23，有三个bootstrap_arguments，分别指向常量池#24，#25，#24：

![自己动手写JVM - 第9张  | 张嘎](https://i2.wp.com/192.144.167.243/blog/wp-content/uploads/30.png?resize=640%2C76)

## CONSTANT_MethodHandle_info

[CONSTANT_MethodHandle_info](http://docs.oracle.com/javase/specs/jvms/se7/html/jvms-4.html#jvms-4.4.8)结构包含两项信息，其结构参考上面表格。

 

reference_kind是一个1到9之间的整数，具体含义可以参考[JVM规范](http://docs.oracle.com/javase/specs/jvms/se7/html/jvms-5.html#jvms-5.4.3.5)。reference_index是常量池索引，但具体索引的是什么类型的常量，需要看reference_kind：

| constant_pool entry              | reference_kind                                               |
| -------------------------------- | ------------------------------------------------------------ |
| CONSTANT_Fieldref_info           | 1 (REF_getField), 2 (REF_getStatic), 3 (REF_putField), or 4 (REF_putStatic) |
| CONSTANT_Methodref_info          | 5 (REF_invokeVirtual), 6 (REF_invokeStatic), 7 (REF_invokeSpecial), or 8 (REF_newInvokeSpecial) |
| CONSTANT_InterfaceMethodref_info | 9 (REF_invokeInterface)                                      |

通过观察常量池#23（上图中可以看到）可以看到，它的reference_kind是6（REF_invokeStatic），reference_index是#29，正好是个CONSTANT_Methodref_info：

![自己动手写JVM - 第10张  | 张嘎](https://i1.wp.com/192.144.167.243/blog/wp-content/uploads/32.png?resize=640%2C130)

引用的是java.lang.invoke.LambdaMetafactory类的静态方法metafactory()。

引用关系图：

![自己动手写JVM - 第11张  | 张嘎](https://i0.wp.com/192.144.167.243/blog/wp-content/uploads/33.png?resize=640%2C545)

JVM如何执行indy指令
前面从class文件的角度，分析了indy指令。下面让我们看看JVM是如何执行indy指令的。

- 每一个indy指令出现的地方，都叫做一个dynamic call site（动态调用点）
- 根据indy指令的操作数，可以找到一个call site specifier（调用点说明符），根据前面的分析，这个说明符其实就常量池里的CONSTANT_InvokeDynamic_info
- JVM解析（resolve）调用点说明符，得到下面三种信息：

1.一个MethodHandle，指向**bootstrap method**（启动方法）

2.方法名和方法描述，表示动态调用的方法

3.其他提供给启动方法的参数

- 接着JVM调用启动方法，并把上一步提到的信息通过参数传给启动方法
- 启动方法必须返回一个**CallSite**对象，并且，这个CallSite对象将永久和这个动态调用点关联
- 调用跟CallSite关联的MethodHandle指向的方法

 

下面是一张示意图，画出了关键点：

![自己动手写JVM - 第12张  | 张嘎](https://i2.wp.com/192.144.167.243/blog/wp-content/uploads/31-1.png?resize=640%2C227)

接着回到我们上面的常量池解析，注意ConstantLongInfo和ConstantDoubleInfo在常量池占两个位置。至此常量池解析完成。

接着class文件中存放的是类访问标识。

然后是类，超类，接口信息。都是常量池索引。

然后字段表和方法表，这俩读取方式一样，以方法表为例：

1.读取16位的方法个数，member_count

2.依次读取member_count个方法信息：

访问标识(16bit)、名称索引(16bit指向常量池)、描述符索引(16bit指向常量池)、读取方法关联的属性表。

最后读取class文件的属性表Attributes。

1.读取16位的属性个数，attributes_count

2.依次读取attributes_count个属性信息：

属性名索引(指向常量池的UTF8)、属性长度(32bit)，

根据属性名和长度新建JVM实现的属性实例。

Java虚拟机规范预定义了23种属性，可分为三组。

一、Java虚拟机必须的，5种。

二、Java类库必须的，12种。

三、提供给工具使用的，6种。可选的。

例：Code、ConstantValue、Exceptions、LineNumberTable、LocalVariableTable、SourceFile、Synthetic等

至此class文件解析完成。

 

# 线程启动：

从启动类中查找main方法。方法名：main、方法描述符：([Ljava/lang/String;)V

即：Void main(String[] xxx) {…}

解释并执行main方法。

线程Thread：

// 线程

type Thread struct {

  pc int

  stack *Stack  // 线程的帧栈

}

 

// jvm栈

type Stack struct {

  maxSize uint  // 最大大小

  size uint      // 当前大小

  _top *Frame  // 栈结构

}

 

// 帧

type Frame struct {

  lower *Frame  // 下一个帧，栈结构。

  localVars LocalVars // 局部变量表

  operandStack *OperandStack  // 操作数栈

  thread *Thread // 所属线程

  nextPC int // the next instruction after the call

}

根据main()方法的CodeAttribute(属性表，名称Code，存储方法执行的字节码信息)，获取其中的最大局部变量大小、最大操作数栈大小，新建Frame实例，将Frame实例压入当前线程的执行帧栈。

JVM会循环不停的从线程的帧栈中弹出帧Frame，执行Frame：

1.1获取frame要执行的指令编号NextPC

1.2将NextPC设置到thread的pc

2.1解码code，根据pc从CodeAttribute中的code(byte[]结构)解码

2.2先获取8bit操作指令，根据指令新建指令实例。

共分为11类：常量（constants）指令、加载（loads）指令、存储（stores）指令、
操作数栈（stack）指令、数学（math）指令、转换（conversions）指令、比
较（comparisons）指令、控制（control）指令、引用（references）指令、
扩展（extended）指令和保留（reserved）指令。

如：iconst_0，istore_1，iload_1，iinc{}，if_icmple，_goto，swap，i2b等。

2.3从属性表的code获取操作数，不同的指令具体实现。

如if_icmpeq指令，如果比较值相等则跳转，其中的跳转地址需要在方法属性表code中获取，读取code(byte[]结构)的下16位为跳转的偏移地址。

2.4设置frame的NextPC为code的pc，即记录code读取到哪个位置。

2.5执行指令实例，不同的指令具体实现。

如if_icmpeq指令，从帧的操作数栈中，弹出两个int值，比较两个值，如果相等，则设置帧frame的NextPC为 当前线程的pc + 偏移量（步骤2.3从code属性表中读取）。

重复1.1执行

上面是一个帧Frame完整的执行流程。

### **上面描述了一个简易的JVM执行流程，由线程驱动，不停的从线程的帧栈中弹出帧，执行帧：循环不停的从方法的属性表中获取code，解析成指令，执行指令，指令的执行需要操作帧frame的局部变量，操作数栈以及属性表。**

## 完整流程：

1.解析环境变量
2.类加载器
3.解析主类名
4.加载主类
加载类流程：内存中是否已加载该类，没有的话加载类
一、解析：
读取class文件字节码，解析
生成虚拟机可用的类数据，放入方法区。类数据：类基本信息、常量池、字段、方法、父类、接口、静态变量等信息。
加载类的时候会递归加载类的父类和接口。
二、链接：
1验证
2准备
计算实例字段的个数
计算静态字段的个数
分配并初始化静态变量，设置常量的值（字段信息里有常量指向的常量池的索引）

5.主类加载完成后，找到主入口方法main
6.解释执行main方法

## 方法的调用过程：

## invokeinterface invokespecial invokestatic invokevirtual 1.创建帧（帧的主要组成是Method），将帧推入栈顶， 2.将要传递的参数（实例方法会多传this），从调用者的操作数栈中弹出，放进被调用方法帧的局部变量表中。 3.主looper中，会不停的执行当前帧，这样调用的方法帧即会被执行。 4.return系列指令会把当前帧从栈中弹出，使得下一帧得以执行，从而实现方法的返回。

 类初始化

 

 

# 笔记：

1.搜索class文件

1.hello world为例，加载前需要加载超类**java.lang.Object**，在调用main()方法前，虚拟机需要准备好参数数组，加载**java.lang.String**和**java.lang.String[]**，打印需要加载**java.lang.System**类。

2.类路径：启动类路径（bootstrap classpath）jre\lib、

扩展类路径（extension classpath） jre\lib\ext、

用户类路径（user classpath）-classpath或-cp指定，使用系统分隔符指定多个路径。

2.解析class文件

1.class文件的基本数据单位是字节，数据在class文件中以大端(big-endian)方式存储。

