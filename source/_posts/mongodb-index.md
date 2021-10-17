---
title: MongoDB索引详解
date: 2021-09-14 00:00:00
tags:
  - 笔记
id: mongodb-index
categories:
  - 笔记
---

# 索引基础知识

## 什么是索引

索引最常用的比喻就是书籍的目录，查询索引就像查询一本书的目录。本质上目录是将书中一小部分内容信息（比如题目）和内容的位置信息（页码）共同构成，而由于信息量小（只有题目），所以我们可以很快找到我们想要的信息片段，再根据页码找到相应的内容。同样索引也是只保留某个域的一部分信息（建立了索引的field的信息），以及对应的文档的位置信息。 假设我们有如下文档（每行的数据在MongoDB中是存在于一个Document当中）

| 姓名 | id   | 部门 | city      | score |
| :--- | :--- | :--- | :-------- | :---- |
| 张三 | 2    | xxx  | Beijing   | 90    |
| 李四 | 1    | xxx  | Shanghai  | 70    |
| 王五 | 3    | xxx  | guangzhou | 60    |

<!-- more -->

假如我们想找id为2的document(即张三的记录)，如果没有索引，我们就需要扫描整个数据表，然后找出所有为2的document。当数据表中有大量documents的时候，这个时间就会非常长（从磁盘上查找数据还涉及大量的IO操作)。建立索引后会有什么变化呢？MongoDB会将id数据拿出来建立索引数据，如下

| 索引值 | 位置 |
| :----- | :--- |
| 1      | pos2 |
| 2      | pos1 |
| 3      | pos3 |

这样我们就可以通过扫描这个小表找到document对应的位置。

查找过程示意图如下：![图片来源MongoDB官网](https://upload-images.jianshu.io/upload_images/3959253-7e2a31d0b5301c9f.png?imageMogr2/auto-orient/strip%7CimageView2/2/w/1240)

为什么这样速度会快呢？这主要有几方面的因素

1. 索引数据通过B+树来存储，从而使得搜索的时间复杂度为O(log<sub>d</sub><sup>N</sup>)级别的(d是B+树的度, 通常d的值比较大，比如大于100)，比原先O(N)的复杂度大幅下降。这个差距是惊人的，以一个实际例子来看，假设d=100，N=1亿，那么O(log<sub>d</sub><sup>N</sup>) = 8, 而O(N)是1亿。是的，这就是算法的威力。
2. 索引本身是在高速缓存当中，相比磁盘IO操作会有大幅的性能提升。（需要注意的是，有的时候数据量非常大的时候，索引数据也会非常大，当大到超出内存容量的时候，会导致部分索引数据存储在磁盘上，这会导致磁盘IO的开销大幅增加，从而影响性能，所以务必要保证有足够的内存能容下所有的索引数据）

当然，事物总有其两面性，在提升查询速度的同时，由于要建立索引，所以写入操作时就需要额外的添加索引的操作，这必然会影响写入的性能，所以当有大量写操作而读操作比较少的时候，且对读操作性能不需要考虑的时候，就不适合建立索引。当然，目前大多数互联网应用都是读操作远大于写操作，因此建立索引很多时候是非常划算和必要的操作。

关于索引原理的详细解释可以参考文章[MySQL索引背后的数据结构及算法原理](http://blog.codinglabs.org/articles/theory-of-mysql-index.html)，虽然讲得是MySQL但是原理相似。

## MongoDB有哪些类型的索引

### 单字段索引 （Single Field Index）

这个是最简单最常用的索引类型，比如我们上边的例子，为id建立一个单独的索引就是此种类型。

```
 # 为id field建立索引，1表示升序，-1表示降序，没有差别
db.employee.createIndex({'id': 1})
```



需要注意的是通常MongoDB会自动为我们的文档插入'_id' field，且已经按照升序进行索引，如果我们插入的文档中包含有'_id' field，则MongoDB就不会自动创建'_id' field，但是需要我们自己来保证唯一性从而唯一标识一个文档

### 复合索引 (Compound Index)

符合索引的原理如下图所示：![复合索引示意图](https://upload-images.jianshu.io/upload_images/3959253-6b00f39c08c49406.png?imageMogr2/auto-orient/strip%7CimageView2/2/w/1240)上图查询索引的时候会先查询userid，再查询score，然后就可以找到对应的文档。 对于复合索引需要注意以下几点：

#### 索引field的先后顺序很关键，影响有两方面：

1. MongoDB在复合索引中是根据prefix排序查询，就是说排在前面的可以单独使用。我们创建一个如下的索引

   ```
   db.collection.createIndex({'id': 1, 'city': 1, 'score': 1})
   ```

我们如下的查询可以利用索引

```
db.collection.find({'id': xxx})
db.collection.find({'id': xxx, 'city': xxx})
db.collection.find({'id': xxx, 'city':xxx, 'score': xxxx})
```



但是如下的查询无法利用该索引

```
db.collection.find({'city': xxx})
db.collection.find({'city':xxx, 'score': xxxx})
```



还有一种特殊的情况，就是如下查询：

```
db.collection.find({'id': xxx, 'score': xxxx})
```



这个查询也可以利用索引的前缀'id'来查询，但是却不能针对score进行查询，你可以说是部分利用了索引，因此其效率可能不如如下索引：

```
db.collection.createIndex({'id': 1, 'score': 1})
```



2.过滤出的document越少的field越应该放在前面，比如此例中id如果是唯一的，那么就应该放在最前面，因为这样通过id就可以锁定唯一一个文档。而如果通过city或者score过滤完成后还是会有大量文档，这就会影响最终的性能。

#### 索引的排序顺序不同

复合索引最末尾的field，其排序顺序不同对于MongoDB的查询排序操作是有影响的。 比如：

```
db.events.createIndex( { username: 1, date: -1 } )
```



这种情况下， 如下的query可以利用索引：

```
db.events.find().sort( { username: 1, date: -1 } )
```



但是如下query则无法利用index进行排序

```
db.events.find().sort( { username: 1, date: 1 } )
```



### 多key索引 （Multikey Index）

这个主要是针对数据类型为数组的类型，如下示例：

```
{"name" : "jack", "age" : 19, habbit: ["football, runnning"]}
db.person.createIndex( {habbit: 1} )  // 自动创建多key索引
db.person.find( {habbit: "football"} )
```



### 其它类型索引

另外，MongoDB中还有其它如哈希索引，地理位置索引以及文本索引，主要用于一些特定场景，具体可以参考官网，在此不再详解

### 索引属性

索引主要有以下几个属性:

- unique：这个非常常用，用于限制索引的field是否具有唯一性属性，即保证该field的值唯一

- partial：很有用，在索引的时候只针对符合特定条件的文档来建立索引，如下

  ```
  db.restaurants.createIndex(
     { cuisine: 1, name: 1 },
     { partialFilterExpression: { rating: { $gt: 5 } } } //只有当rating大于5时才会建立索引
  )
  ```

这样做的好处是，我们可以只为部分数据建立索引，从而可以减少索引数据的量，除节省空间外，其检索性能也会因为较少的数据量而得到提升。

- sparse：可以认为是partial索引的一种特殊情况，由于MongoDB3.2之后已经支持partial属性，所以建议直接使用partial属性。
- TTL。 可以用于设定文档有效期，有效期到自动删除对应的文档。

# 通过explain结果来分析性能

我们往往会通过打点数据来分析业务的性能瓶颈，这时，我们会发现很多瓶颈都是出现在数据库相关的操作上，这时由于数据库的查询和存取都涉及大量的IO操作，而且有时由于使用不当，会导致IO操作的大幅度增长，从而导致了产生性能问题。而MongoDB提供了一个explain工具来用于分析数据库的操作。直接拿官网的示例来做说明：

假设我们在inventory collection中有如下文档：

```
{ "_id" : 1, "item" : "f1", type: "food", quantity: 500 }
{ "_id" : 2, "item" : "f2", type: "food", quantity: 100 }
{ "_id" : 3, "item" : "p1", type: "paper", quantity: 200 }
{ "_id" : 4, "item" : "p2", type: "paper", quantity: 150 }
{ "_id" : 5, "item" : "f3", type: "food", quantity: 300 }
{ "_id" : 6, "item" : "t1", type: "toys", quantity: 500 }
{ "_id" : 7, "item" : "a1", type: "apparel", quantity: 250 }
{ "_id" : 8, "item" : "a2", type: "apparel", quantity: 400 }
{ "_id" : 9, "item" : "t2", type: "toys", quantity: 50 }
{ "_id" : 10, "item" : "f4", type: "food", quantity: 75 }
```



假设此时没有建立索引，做如下查询：

```
db.inventory.find( { quantity: { $gte: 100, $lte: 200 } } )
```



返回结果如下：

```
{ "_id" : 2, "item" : "f2", "type" : "food", "quantity" : 100 }
{ "_id" : 3, "item" : "p1", "type" : "paper", "quantity" : 200 }
{ "_id" : 4, "item" : "p2", "type" : "paper", "quantity" : 150 }
```



这是我们可以通过explain来分析整个查询的过程：

```
# explain 有三种模式： "queryPlanner", "executionStats", and "allPlansExecution".
# 其中最常用的就是第二种"executionStats"，它会返回具体执行的时候的统计数据
db.inventory.find(
   { quantity: { $gte: 100, $lte: 200 } }
).explain("executionStats")
```



explain的结果如下：

```
{
   "queryPlanner" : {
         "plannerVersion" : 1,
         ...
         "winningPlan" : {
            "stage" : "COLLSCAN",
            ...
         }
   },
   "executionStats" : {
      "executionSuccess" : true,
      "nReturned" : 3,  # 查询返回的document数量
      "executionTimeMillis" : 0, # 执行查询所用的时间
      "totalKeysExamined" : 0, # 总共查询了多少个key，由于没有使用索引，因此这里为0
      "totalDocsExamined" : 10, # 总共在磁盘查询了多少个document，由于是全表扫描，我们总共有10个documents，因此，这里为10
      "executionStages" : {
         "stage" : "COLLSCAN",  # 注意这里，"COLLSCAN"意味着全表扫描
         ...
      },
      ...
   },
   ...
}
```



上面的结果中有一个"stage"字段，上例中stage为"COLLSCAN"，而MongoDB总共有如下几种stage：

- COLLSCAN – Collection scan
- IXSCAN – Scan of data in index keys
- FETCH – Retrieving documents
- SHARD_MERGE – Merging results from shards
- SORT – Explicit sort rather than using index order

现在我们来创建一个索引：

```
db.inventory.createIndex( { quantity: 1 } )
```



再来看下explain的结果



```
db.inventory.find(
   { quantity: { $gte: 100, $lte: 200 } }
).explain("executionStats")
```



结果如下：

```
{
   "queryPlanner" : {
         "plannerVersion" : 1,
         ...
         "winningPlan" : {
               "stage" : "FETCH",
               "inputStage" : {
                  "stage" : "IXSCAN",  # 这里"IXSCAN"意味着索引扫描
                  "keyPattern" : {
                     "quantity" : 1
                  },
                  ...
               }
         },
         "rejectedPlans" : [ ]
   },
   "executionStats" : {
         "executionSuccess" : true,
         "nReturned" : 3,
         "executionTimeMillis" : 0,
         "totalKeysExamined" : 3,  # 这里nReturned、totalKeysExamined和totalDocsExamined相等说明索引没有问题，因为我们通过索引快速查找到了三个文档，且从磁盘上也是去取这三个文档，并返回三个文档。
         "totalDocsExamined" : 3,
         "executionStages" : {
            ...
         },
         ...
   },
   ...
}
```



再来看下如何通过explain来比较compound index的性能，之前我们在介绍复合索引的时候已经说过field的顺序会影响查询的效率。有时这种顺序并不太好确定（比如field的值都不是unique的），那么怎么判断哪种顺序的复合索引的效率高呢，这就像需要explain结合hint来进行分析。 比如我们要做如下查询：

```
db.inventory.find( {
   quantity: {
      $gte: 100, $lte: 300
   },
   type: "food"
} )
```



会返回如下文档：

```
{ "_id" : 2, "item" : "f2", "type" : "food", "quantity" : 100 }
{ "_id" : 5, "item" : "f3", "type" : "food", "quantity" : 300 }
```



现在我们要比较如下两种复合索引

```
db.inventory.createIndex( { quantity: 1, type: 1 } )
db.inventory.createIndex( { type: 1, quantity: 1 } )
```



分析索引 { quantity: 1, type: 1 }的情况



```
# 结合hint和explain来进行分析
db.inventory.find(
   { quantity: { $gte: 100, $lte: 300 }, type: "food" }
).hint({ quantity: 1, type: 1 }).explain("executionStats") # 这里使用hint会强制数据库使用索引 { quantity: 1, type: 1 }
```



explain结果

```
{
   "queryPlanner" : {
      ...
      "winningPlan" : {
         "stage" : "FETCH",
         "inputStage" : {
            "stage" : "IXSCAN",
            "keyPattern" : {
               "quantity" : 1,
               "type" : 1
            },
            ...
            }
         }
      },
      "rejectedPlans" : [ ]
   },
   "executionStats" : {
      "executionSuccess" : true,
      "nReturned" : 2,
      "executionTimeMillis" : 0,
      "totalKeysExamined" : 5,  # 这里是5与totalDocsExamined、nReturned都不相等
      "totalDocsExamined" : 2,
      "executionStages" : {
      ...
      }
   },
   ...
}
```



再来看下索引 { type: 1, quantity: 1 } 的分析



```
db.inventory.find(
   { quantity: { $gte: 100, $lte: 300 }, type: "food" }
).hint({ type: 1, quantity: 1 }).explain("executionStats")
```



结果如下：



```
{
   "queryPlanner" : {
      ...
      "winningPlan" : {
         "stage" : "FETCH",
         "inputStage" : {
            "stage" : "IXSCAN",
            "keyPattern" : {
               "type" : 1,
               "quantity" : 1
            },
            ...
         }
      },
      "rejectedPlans" : [ ]
   },
   "executionStats" : {
      "executionSuccess" : true,
      "nReturned" : 2,
      "executionTimeMillis" : 0,
      "totalKeysExamined" : 2, # 这里是2，与totalDocsExamined、nReturned相同
      "totalDocsExamined" : 2,
      "executionStages" : {
         ...
      }
   },
   ...
}
```



可以看出后一种索引的totalKeysExamined返回是2，相比前一种索引的5，显然更有效率。

# References

- [MongoDB Index](https://docs.mongodb.com/manual/indexes/)
- [MySQL索引背后的数据结构及算法原理](http://blog.codinglabs.org/articles/theory-of-mysql-index.html)
- [MongoDB索引原理](http://www.mongoing.com/archives/2797)
- [Analyze Query Performance](https://docs.mongodb.com/manual/tutorial/analyze-query-plan/)
