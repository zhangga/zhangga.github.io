---
title: 设计模式笔记
date: 2017-04-01 18:40:51
tags:
  - 读书笔记
id: design-mode
categories:
  - 笔记
---

1.简单工厂模式

2.策略模式

<!--more-->

策略模式是一种定义一系列算法的方法，从概念上来看，所有这些算法完成的都是相同的工作，只是实现不同，它可以以相同的方式调用所有的算法，减少了各种算法类与使用算法类之间的耦合。

策略模式的Strategy类层次为Context定义了一系列的可供重用的算法或行为。继承有助于析取出这些算法中的公共功能。

3.单一职责原则

规则总是很美好，呵呵

就一个类而言，应该仅有一个引起它变化的原因。

如果一个类承担的职责过多，就等于把这些职责耦合在一起，一个职责的变化可能会削弱或者抑制这个类完成其他职责的能力。这种耦合会导致脆弱的设计，当变化发生时，设计会遭受到意想不到的破坏。

软件设计真正要做的许多内容，就是发现职责并把那些职责相互分离。

如果你能够想到多于一个的动机去改变一个类，那么这个类就具有多于一个的职责。

4.开放-封闭原则

开放-封闭原则，是说软件实体（类、模块、函数等等）应该可以扩展，但是不可修改。

对于扩展是开放的，对于更改是封闭的。

无论模块是多么封闭，都会存在一些无法对之封闭的变化。既然不可能完全封闭，设计人员必须对于他设计的模块应该对哪种变化封闭做出选择。他必须先猜测出最有可能发生的变化种类，然后构造抽象来隔离那些变化。

等到变化发生时立即采取行动。

开发人员应该仅对程序中呈现出频繁变化的那些部分做出抽象，然而，对于应用程序中的每个部分刻意进行抽象同样不是一个好主意。拒绝不成熟的抽象和抽象本身一样重要。

5.依赖倒转原则

高层模块不应该依赖低层模块，两个都应该依赖抽象。

抽象不应该依赖细节，细节应该依赖抽象。

里氏代换原则：子类型必须能够替换掉它们的父类型。

6.装饰模式

装饰模式：动态地给一个对象添加一些额外的职责，就增加功能来说，装饰模式比生成子类更为灵活。

```
Person穿衣服为例：
abstract class Show {

public abstract void show();

}

class Persion : Show {

public override void show() { 具体实现 }

}

abstract class Decorator : Show {

protected Show show;

public void setDecorator(Show show) {

this.show = show;

}

public override void show() {

if (show != null) {

show.show();

}

}

}

class DecoratorA : Decorator {

public override void show() { super.show(); 具体实现; }

}

装饰模式：

Person p = new Person();

DecoratorA da = new DecoratorA();

DecoratorB db = new DecoratorB();

DecoratorC dc = new DecoratorC();

da.setDecorator(p);

db.setDecorator(da);

dc.setDecorator(db);

dc.show();
```

7.代理模式

代理模式：为其他对象提供一种代理以控制对这个对象的访问。

```abstract class Subject {
public abstract void request();

}

class RealSubject : Subject {

public override void request() {实现}

}

class Proxy : Subject {

RealSubject realSubject;

public override void request() {

realSubject.request();

}

}

Client:

Proxy proxy = new Proxy();

proxy.request();
```

8.工厂方法模式

9.原型模式

对象拷贝。深拷贝。浅拷贝。

10.模板方法模式

11.迪米特法则

迪米特法则：如果两个类不必彼此直接通信，那么这两个类就不应当发生直接的相互作用。如果其中一个类需要调用另一个类的某一个方法的话，可以通过第三者转发这个调用。

强调类之间的松耦合。

12.外观模式

13.建造者模式

建造者模式：将一个复杂对象的构建与它的表示分离，使得同样的构建过程可以创建不同的表示。

建造者模式是在当创建复杂对象的算法应该独立于该对象的组成部分以及它们的装配方式时适用的模式。

14.观察者模式

当一个对象的改变需要同时改变其他对象，而且它不知道具体有多少对象有待改变时，应该考虑使用观察者模式。

一个抽象模型有两个方面，其中一方面依赖于另一方面，这时用观察者模式可以将这两者封装在独立的对象中使它们各自独立地改变和复用。

总结：观察者模式所做的工作其实就是在解除耦合。让耦合的双方都依赖于抽象，而不是依赖于具体。从而使得各自的变化都不会影响另一边的变化。

C#的委托delegate

委托就是一种引用方法的类型。一旦为委托分配了方法，委托将与该方法具有完全相同的行为。委托方法的使用可以像其他任何方法一样，具有参数和返回值。委托可以看做是对函数的抽象，是函数的类，委托的实例将代表一个具体的函数。

一个委托可以搭载多个方法，所有方法被依次唤起。可以使得委托对象所搭载的方法并不需要属于同一个类。

委托对象所搭载的所有方法必须具有相同的原形和形式，也就是拥有相同的参数列表和返回值类型。

15.抽象工厂模式

抽象工厂模式：提供一个创建一系列相关或相互依赖对象的接口，而无需指定它们具体的类。

16.状态模式

状态模式：当一个对象的内在状态改变时允许改变其行为，这个对象看起来像是改变了其类。

状态模式主要解决的是当控制一个对象状态转换的条件表达式过于复杂时的情况。把状态的判断逻辑转移到表示不同状态的一系列类当中，可以把复杂的判断逻辑简化。

17.适配器模式

适配器模式：将一个类的接口转换成客户希望的另外一个接口。Adapter模式使得原本由于接口不兼容而不能一起工作的那些类可以一起工作了。

18.备忘录模式

备忘录：在不破坏封装性的前提下，捕获一个对象的内部状态，并在该对象之外保存这个状态。这样以后就可将该对象恢复到原先保存的状态。

19.组合模式

组合模式：将对象组合成树形结构以表示“部分-整体”的层次结构。组合模式使得用户对单个对象和组合对象的使用具有一致性。

20.迭代器模式

迭代器模式：提供一种方法顺序访问一个聚合对象中各个元素，而又不暴露该对象的内部表示。

21.单例模式

单例模式：保证一个类仅有一个实例，并提供一个访问它的全局访问点。

单例模式和静态工具类Static方法的区别：静态工具类不保存状态，仅提供一些静态方法或静态属性来让你使用，而单例类是有状态的。静态工具类不能用于继承多态，而单例虽然实例唯一，却是可以有子类来继承。静态类只不过是一些方法属性的集合，而单例却是有着唯一的对象实例。

### 1、懒汉式，线程不安全

```
public class Singleton {  
    private static Singleton instance;  
    private Singleton (){}  
  
    public static Singleton getInstance() {  
    if (instance == null) {  
        instance = new Singleton();  
    }  
    return instance;  
    }  
}
```

### 2、懒汉式，线程安全

```
public class Singleton {  
    private static Singleton instance;  
    private Singleton (){}  
    public static synchronized Singleton getInstance() {  
    if (instance == null) {  
        instance = new Singleton();  
    }  
    return instance;  
    }  
}
```

### 3、饿汉式

```
public class Singleton {  
    private static Singleton instance = new Singleton();  
    private Singleton (){}  
    public static Singleton getInstance() {  
    return instance;  
    }  
}
```

### 4、双检锁/双重校验锁（DCL，即 double-checked locking）

```
public class Singleton {  
    private volatile static Singleton singleton;    // 加volatile的作用，防止singleton变量在new的时候引用逃逸
    private Singleton (){}  
    public static Singleton getSingleton() {  
    if (singleton == null) {  
        synchronized (Singleton.class) {  
        if (singleton == null) {  
            singleton = new Singleton();  
        }  
        }  
    }  
    return singleton;  
    }  
}
```

### 5、登记式/静态内部类

```
public class Singleton {  
    private static class SingletonHolder {  
    private static final Singleton INSTANCE = new Singleton();  
    }  
    private Singleton (){}  
    public static final Singleton getInstance() {  
    return SingletonHolder.INSTANCE;  
    }  
}
```

### 6、枚举

```
public enum Singleton {  
    INSTANCE;  
    public void whateverMethod() {  
    }  
}
```

22.桥接模式

合成/聚合复用原则：尽量使用合成/聚合，尽量不要使用类继承。组合优于继承。

桥接模式：将抽象部分与它的实现部分分离，使它们都可以独立的变化。

23.命令模式

24.职责链模式

职责链模式：使多个对象都有机会处理请求，从而避免请求的发送者和接收者之间的耦合关系。将这个对象连成一条链，并沿着这条链传递该请求，直到有一个对象处理它为止。

25.中介者模式

26.享元模式

27.解释器模式

解释器模式：给定一个语言，定义它的文法的一种表示，并定义一个解释器，这个解释器使用该表示来解释语言中的句子。

28.访问者模式

访问者模式：表示一个作用于某对象结构中的各元素操作。它使你可以在不改变各元素的类的前提下定义作用于这些元素的新操作。
