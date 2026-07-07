---
title: 支持多语言的全文检索
tags:
  - UE
id: fulltext-search
categories:
  - 笔记
date: 2026-07-07 23:19:13
---

# 支持多语言的全文检索

## 1. 业务需求

玩家可以按房间名或房主名进行模糊搜索，查找出对应的房间列表。

## 2. 背景介绍

房间数据根据下面的几个特性，最终决定存放在 **Redis** 中：

1. 房间属于临时数据，在存储的安全性方面要求不高。
2. 房间数据（量级跟在线玩家相关）需要支持横向扩展，不能只在单一节点的内存中。
3. 数据本身变化比较频繁，需要广播给房间内的所有玩家。
4. 玩家查看好友列表时，还要能看到好友的房间状态信息。

### 2.1 Redis 的全文索引

`redis-search` 模块支持全文索引，并且支持多语言，效果如下：

- **创建索引**

```
FT.CREATE room_index
    ON HASH
    PREFIX 1 practice:
    LANGUAGE chinese
SCHEMA
    roomName TEXT
    ownerName TEXT
```

- **插入测试数据**

```
HSET practice:1 roomName "猎人试炼场" ownerName "雾影猎人" mapId 101
HSET practice:2 roomName "雾影战士的房间" ownerName "雾影战士" mapId 102
HSET practice:3 roomName "迷雾之森" ownerName "狡猾的猎人" mapId 101
HSET practice:4 roomName "Mistfall Arena" ownerName "Mistfall Hunter" mapId 102
HSET practice:5 roomName "Shadow Training Room" ownerName "Zero" mapId 103
HSET practice:6 roomName "Fog Valley" ownerName "DragonSlayer" mapId 104
```

- **查询数据**

示例一：支持中文，可以查询出房间名或房主名带 `猎人` 的房间。

```
127.0.0.1:6379> FT.SEARCH room_index "猎人" RETURN 0
1) (integer) 2
2) "practice:1"
3) "practice:3"
```

示例二：英文也没问题，房间名和房主名都能搜出来。

```
127.0.0.1:6379> FT.SEARCH room_index "Training" RETURN 0
1) (integer) 1
2) "practice:5"

127.0.0.1:6379> FT.SEARCH room_index "Hunter" RETURN 0
1) (integer) 1
2) "practice:4"
```

### 2.2 Redis 的问题

**1. 分词规则的局限性**

由于倒排索引是通过分词来建立多键索引的，所以受限于分词规则，不是所有的模糊查找都能命中。

不过这个问题不大，一般大家搜索都是按照语义习惯输入的（搜不出来的话，换个正常的词就行了）。

示例一：英文没有使用空格分词的场景，`DragonSlayer` → `Slayer`

```
127.0.0.1:6379> FT.SEARCH room_index "Slayer" RETURN 0
1) (integer) 0
```

示例二：中文不符合分词习惯的场景，`狡猾的猎人` → `猾的`

```
127.0.0.1:6379> FT.SEARCH room_index "猾的" RETURN 0
1) (integer) 0
```

**2. 环境限制**

Redis 需要安装 `redis-search` 扩展模块才行，但目前所使用的云厂商 Redis 服务不支持安装扩展模块，因此该方案无法落地。

不过通过测试来看，如果不是 Redis 环境的问题，这种需求直接使用 `redis-search` 就解决了，非常方便。

## 3. 方案落地

既然 Redis 的方案这么好，那么在不引入其他技术限制的情况下，在 MongoDB 实现一套类似的解决方案即可。

参考方案：[全文检索方案参考](https://cloud.tencent.com/developer/article/1939649)

### 3.1 多语言支持

```
implementation("org.apache.lucene:lucene-core:10.3.2")
implementation("org.apache.lucene:lucene-analysis-icu:10.3.2")
implementation("com.belerweb:pinyin4j:2.5.0")
```

#### 3.1.1 分词

使用 `lucene`、`lucene-icu` 进行分词，目前支持的语言都没问题，效果如下：

```json
[
  {
    "txt": "The brave MistfallHunter, this is a test.",
    "lang": "en",
    "tokens": ["the", "brave", "mistfallhunter", "this", "is", "a", "test"]
  },
  {
    "txt": "勇猛的雾影猎人，这是一个测试。",
    "lang": "zh-CN",
    "tokens": ["勇猛", "的", "雾", "影", "猎人", "这", "是", "一个", "测试"]
  },
  {
    "txt": "勇猛的霧影獵人，這是一個測試。",
    "lang": "zh-TW",
    "tokens": ["勇猛", "的", "霧", "影", "獵人", "這是", "一個", "測試"]
  },
  {
    "txt": "El valiente cazador de sombras de la niebla, esto es una prueba.",
    "lang": "es",
    "tokens": ["el", "valiente", "cazador", "de", "sombras", "de", "la", "niebla", "esto", "es", "una", "prueba"]
  },
  {
    "txt": "Отважный охотник Туманных Теней, это тест.",
    "lang": "ru",
    "tokens": ["отважныи", "охотник", "туманных", "тенеи", "это", "тест"]
  },
  {
    "txt": "勇敢な霧影のハンター、これはテストです。",
    "lang": "ja",
    "tokens": ["勇敢", "な", "霧", "影", "の", "ハンタ", "これ", "は", "テスト", "てす"]
  },
  {
    "txt": "용맹한 안개 그림자 사냥꾼이여, 이것은 테스트입니다.",
    "lang": "ko",
    "tokens": ["용맹한", "안개", "그림자", "사냥꾼이여", "이것은", "테스트입니다"]
  },
  {
    "txt": "O valente caçador da sombra da névoa, isto é um teste.",
    "lang": "pt",
    "tokens": ["o", "valente", "cacador", "da", "sombra", "da", "nevoa", "isto", "e", "um", "teste"]
  },
  {
    "txt": "Der mutige Nebelschattenjäger, das ist ein Test.",
    "lang": "de",
    "tokens": ["der", "mutige", "nebelschattenjager", "das", "ist", "ein", "test"]
  },
  {
    "txt": "Le brave chasseur de l'ombre de la brume, ceci est un test.",
    "lang": "fr",
    "tokens": ["le", "brave", "chasseur", "de", "l'ombre", "de", "la", "brume", "ceci", "est", "un", "test"]
  }
]
```

#### 3.1.2 拼音

使用 `pinyin4j` 支持拼音搜索中文，效果如下：

```
你好，world！这是一个测试。
"nihao", "zhei", "shi", "yige", "ceshi"
```

### 3.2 创建索引

> 说明：通过分词 + 拼音结果构建 MongoDB 文本索引。（原文档此处配有截图）

### 3.3 搜索

- 示例一：中文搜索，索引生效
- 示例二：拼音搜索
- 示例三：韩语搜索
- 示例四：西语搜索

> 说明：以上示例在原文档中均配有搜索结果截图，验证多语言与拼音搜索均正常命中。

### 3.4 性能测试

使用 Java 的 `MongoClient` 进行端到端测试。

#### 3.4.1 分词的性能

- 中文分词加拼音耗时：`0.38ms`
- 仅分词耗时：`0.26ms`

#### 3.4.2 查询和插入的性能

构造房间名，测试插入和查询的效率。

**10 万数据量**

- 查询耗时：`3ms`
- 插入耗时：`3.5ms`

```
collection.find(Filters.text("勇猛")).limit(20).first()
```

**100 万数据量**

- 查询耗时：`10ms`
- 插入耗时：`7.5ms`

```
collection.find(Filters.text("勇猛")).limit(20).first()
```
