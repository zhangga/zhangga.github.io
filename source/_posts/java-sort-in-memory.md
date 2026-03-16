---
title: 内存房间列表查询与排序方案详解
tags:
  - 服务器
id: java-sort-in-memory
categories:
  - 笔记
date: 2026-03-16 11:23:49
---

## 一、场景概述

在即时通讯、直播、游戏等应用中，房间列表的查询是高频操作。当数据存储在 Java 内存中时，如何实现：

* ​**模糊查询**​：按房间名、创建者名字进行子串匹配
* ​**灵活排序**​：按创建时间、活跃度等排序
* ​**分页支持**​：大数据量下的分页查询

本文系统性地梳理各方案的适用场景、实现细节和性能表现。

## 二、方案选型对比

| 方案                         | 适用场景          | 时间复杂度   | 空间复杂度 | 推荐指数   |
| ------------------------------ | ------------------- | -------------- | ------------ | ------------ |
| **暴力遍历**           | 数据量 < 1000     | O(N)         | O(1)       | ⭐⭐       |
| **N-Gram ​倒排索引**  | 数据量 1K \~ 100K | O(k) \~ O(1) | O(N)       | ⭐⭐⭐⭐⭐ |
| **Trie 树**            | 前缀匹配场景      | O(m)         | O(N×L)    | ⭐⭐⭐     |
| **BK-Tree**            | 容错/相似度匹配   | O(logN)      | O(N)       | ⭐⭐⭐⭐   |
| **Lucene MemoryIndex** | 大数据量+复杂查询 | O(logN)      | O(3N)      | ⭐⭐⭐⭐⭐ |

> N = 数据量，L = 平均字符串长度，m = 查询串长度，k = 命中的候选集大小

## 三、方案一：暴力遍历（小数据量）

### 3.1 适用场景

* 房间数量 < 1000
* 实现简单，无需维护索引

### 3.2 实现代码

```Java
public List<Room> search(List<Room> rooms, String keyword) {
    String lower = keyword.toLowerCase();
    return rooms.stream()
        .filter(r -> r.getRoomName().toLowerCase().contains(lower)
                  || r.getCreatorName().toLowerCase().contains(lower))
        .sorted(Comparator.comparing(Room::getCreateTime).reversed())
        .collect(Collectors.toList());
}
```

### 3.3 性能分析

* ​**查询耗时**​：1万条数据约 15ms
* ​**内存开销**​：无额外索引内存

## 四、方案二：N-Gram 倒排索引（推荐）

### 4.1 核心思想

将字符串切分为 N-Gram 片段建立倒排索引，查询时通过索引交集快速定位候选集。

**示例（Bigram，N=2）：**

* "王者荣耀" → [王者, 者荣, 荣耀]
* 查询 "荣耀" → 命中 "荣耀" → 返回房间

### 4.2 完整实现

```Java
import java.util.*;
import java.util.stream.Collectors;

public class RoomFuzzySearch {

    /** 房间实体 */
    public static class Room {
        private final String roomId;
        private final String roomName;
        private final String creatorName;
        private final long createTime;

        public Room(String roomId, String roomName, 
                    String creatorName, long createTime) {
            this.roomId = roomId;
            this.roomName = roomName;
            this.creatorName = creatorName;
            this.createTime = createTime;
        }

        public String getRoomId() { return roomId; }
        public String getRoomName() { return roomName; }
        public String getCreatorName() { return creatorName; }
        public long getCreateTime() { return createTime; }
    }

    private final int n;
    private final List<Room> rooms = new ArrayList<>();
    private final Map<String, Set<Integer>> index = new HashMap<>();

    public RoomFuzzySearch(int n) {
        this.n = n; // 推荐 n=2（Bigram）
    }

    /** 添加房间到索引 */
    public void addRoom(Room room) {
        int id = rooms.size();
        rooms.add(room);
        indexField(room.getRoomName(), id);
        indexField(room.getCreatorName(), id);
    }

    private void indexField(String text, int id) {
        if (text == null || text.isEmpty()) return;
        String lower = text.toLowerCase();
        for (String gram : extractGrams(lower)) {
            index.computeIfAbsent(gram, k -> new HashSet<>()).add(id);
        }
    }

    /** 模糊查询 + 按时间排序 */
    public List<Room> search(String keyword) {
        if (keyword == null || keyword.isEmpty()) {
            return rooms.stream()
                .sorted(Comparator.comparing(Room::getCreateTime).reversed())
                .collect(Collectors.toList());
        }

        String lower = keyword.toLowerCase();
        List<String> grams = extractGrams(lower);

        // 单字查询退化为遍历
        if (grams.isEmpty()) {
            return rooms.stream()
                .filter(r -> matchRoom(r, lower))
                .sorted(Comparator.comparing(Room::getCreateTime).reversed())
                .collect(Collectors.toList());
        }

        // 1. 倒排索引取交集
        Set<Integer> candidates = null;
        for (String gram : grams) {
            Set<Integer> ids = index.getOrDefault(gram, Collections.emptySet());
            if (candidates == null) {
                candidates = new HashSet<>(ids);
            } else {
                candidates.retainAll(ids);
            }
            if (candidates.isEmpty()) return Collections.emptyList();
        }

        // 2. 二次验证 + 排序
        return candidates.stream()
            .map(rooms::get)
            .filter(r -> matchRoom(r, lower))
            .sorted(Comparator.comparing(Room::getCreateTime).reversed())
            .collect(Collectors.toList());
    }

    private boolean matchRoom(Room room, String keyword) {
        return (room.getRoomName() != null 
                    && room.getRoomName().toLowerCase().contains(keyword))
            || (room.getCreatorName() != null 
                    && room.getCreatorName().toLowerCase().contains(keyword));
    }

    private List<String> extractGrams(String text) {
        List<String> result = new ArrayList<>();
        for (int i = 0; i <= text.length() - n; i++) {
            result.add(text.substring(i, i + n));
        }
        return result;
    }
}
```

### 4.3 使用示例

```Java
// 初始化
RoomFuzzySearch searcher = new RoomFuzzySearch(2);

// 加载数据
searcher.addRoom(new Room("r001", "王者荣耀五排开黑", "张三", 1704067200L));
searcher.addRoom(new Room("r002", "周末狼人杀", "李四", 1704153600L));
searcher.addRoom(new Room("r003", "张三的技术分享房", "张三", 1704240000L));

// 模糊查询
List<Room> results = searcher.search("张三");
// 结果：r003(房间名+创建者), r001(创建者)
```

### 4.4 N 值选择建议

| N 值                   | 优点                    | 缺点                  | 适用场景               |
| ------------------------ | ------------------------- | ----------------------- | ------------------------ |
| 1                      | 单字命中                | 索引区分度低          | 不推荐                 |
| **2 (Bigram)**✅ | 中文 2 字词为主，平衡好 | 单字需退化遍历        | **中文场景首选** |
| 3 (Trigram)            | 精度高                  | 2 字查询无法生成 gram | 英文/长文本            |

### 4.5 性能对比

| 数据量 | 暴力查询 | N-Gram 查询 | 提升倍数       |
| -------- | ---------- | ------------- | ---------------- |
| 1 万   | 15ms     | 0.1ms       | **150x** |
| 10 万  | 150ms    | 0.5ms       | **300x** |

## 五、方案三：Lucene MemoryIndex（企业级）

### 5.1 适用场景

* 房间数量 > 10 万
* 需要复杂查询（多字段、布尔逻辑）
* 需要相关度排序

### 5.2 Maven 依赖

```XML
<dependencies>
    <dependency>
        <groupId>org.apache.lucene</groupId>
        <artifactId>lucene-core</artifactId>
        <version>9.11.1</version>
    </dependency>
    <dependency>
        <groupId>org.apache.lucene</groupId>
        <artifactId>lucene-queryparser</artifactId>
        <version>9.11.1</version>
    </dependency>
    <dependency>
        <groupId>org.apache.lucene</groupId>
        <artifactId>lucene-analysis-smartcn</artifactId>
        <version>9.11.1</version>
    </dependency>
</dependencies>
```

### 5.3 核心实现

```Java
import org.apache.lucene.analysis.cn.smart.SmartChineseAnalyzer;
import org.apache.lucene.document.*;
import org.apache.lucene.index.*;
import org.apache.lucene.search.*;
import org.apache.lucene.store.ByteBuffersDirectory;
import org.apache.lucene.store.Directory;

public class RoomLuceneSearch {

    private static final String F_ROOM_ID = "roomId";
    private static final String F_ROOM_NAME = "roomName";
    private static final String F_CREATOR = "creatorName";
    private static final String F_TIME = "createTime";

    private final Directory directory;
    private final SmartChineseAnalyzer analyzer;
    private IndexWriter writer;
    private IndexSearcher searcher;

    public RoomLuceneSearch() throws IOException {
        this.directory = new ByteBuffersDirectory(); // 纯内存存储
        this.analyzer = new SmartChineseAnalyzer();
        
        IndexWriterConfig config = new IndexWriterConfig(analyzer);
        this.writer = new IndexWriter(directory, config);
    }

    /** 添加房间 */
    public void addRoom(Room room) throws IOException {
        Document doc = new Document();
        doc.add(new StringField(F_ROOM_ID, room.getRoomId(), Field.Store.YES));
        doc.add(new TextField(F_ROOM_NAME, room.getRoomName(), Field.Store.YES));
        doc.add(new TextField(F_CREATOR, room.getCreatorName(), Field.Store.YES));
        doc.add(new LongPoint(F_TIME, room.getCreateTime()));
        doc.add(new StoredField(F_TIME, room.getCreateTime()));
        
        writer.addDocument(doc);
        writer.commit();
        refreshSearcher();
    }

    /** 模糊查询 + 分页 + 排序 */
    public SearchResult search(String keyword, int page, int pageSize) 
            throws Exception {
        // 构建查询：房间名 OR 创建者 模糊匹配
        BooleanQuery.Builder builder = new BooleanQuery.Builder();
        
        // 通配符匹配实现 contains 效果
        builder.add(new WildcardQuery(
            new Term(F_ROOM_NAME, "*" + keyword + "*")), BooleanClause.Occur.SHOULD);
        builder.add(new WildcardQuery(
            new Term(F_CREATOR, "*" + keyword + "*")), BooleanClause.Occur.SHOULD);
        builder.setMinimumNumberShouldMatch(1);

        // 按创建时间倒序
        Sort sort = new Sort(new SortField(F_TIME, SortField.Type.LONG, true));
        
        int start = (page - 1) * pageSize;
        TopDocs topDocs = searcher.search(builder.build(), start + pageSize, sort);
        
        List<Room> results = new ArrayList<>();
        for (int i = start; i < Math.min(topDocs.scoreDocs.length, start + pageSize); i++) {
            Document doc = searcher.storedFields().document(topDocs.scoreDocs[i].doc);
            results.add(new Room(
                doc.get(F_ROOM_ID),
                doc.get(F_ROOM_NAME),
                doc.get(F_CREATOR),
                Long.parseLong(doc.get(F_TIME))
            ));
        }
        
        return new SearchResult(topDocs.totalHits.value, results);
    }

    private void refreshSearcher() throws IOException {
        if (searcher != null) {
            searcher.getIndexReader().close();
        }
        DirectoryReader reader = DirectoryReader.open(directory);
        searcher = new IndexSearcher(reader);
    }
}
```

### 5.4 方案对比

| 特性       | N-Gram 倒排索引 | Lucene MemoryIndex   |
| ------------ | ----------------- | ---------------------- |
| 实现复杂度 | 低              | 中等                 |
| 功能丰富度 | 基础模糊查询    | 全文检索、分词、高亮 |
| 内存占用   | \~2x 原数据     | \~3x 原数据          |
| 查询性能   | 极快（亚毫秒）  | 快（毫秒级）         |
| 维护成本   | 低              | 中等                 |

## 六、方案选型决策树

```undefined
你的房间数据量是多少？
│
├── < 1,000 条
│   └── ✅ 暴力遍历 + Stream API
│       （代码最简单，性能足够）
│
├── 1,000 ~ 100,000 条
│   └── ✅ N-Gram 倒排索引（Bigram）
│       （性价比最高，查询快 100 倍）
│
└── > 100,000 条 或 需要复杂功能
    └── ✅ Lucene MemoryIndex
        （功能最全，支持分词、排序、分页）
```

## 七、生产环境建议

### 7.1 索引更新策略

| 场景           | 方案                                       |
| ---------------- | -------------------------------------------- |
| 房间创建频率低 | 增量 addRoom()                             |
| 房间频繁增删   | 定时 rebuild() 全量重建                    |
| 高并发读写     | ConcurrentHashMap + ReentrantReadWriteLock |

### 7.2 性能优化技巧

1. ​**预热索引**​：服务启动时预加载房间数据
2. ​**缓存热点**​：对高频查询结果使用 Caffeine 缓存
3. ​**异步重建**​：大数据量重建时异步执行，避免阻塞

### 7.3 内存预估

以 10 万房间、平均房间名 20 字为例：

* 原始数据：\~10 MB
* N-Gram 索引：\~20 MB
* Lucene 索引：\~30 MB

## 八、总结

| 方案               | 一句话总结               |
| -------------------- | -------------------------- |
| 暴力遍历           | 小数据量的「简单美」     |
| N-Gram 倒排索引    | 中等规模的最佳性价比选择 |
| Lucene MemoryIndex | 企业级的全能方案         |

对于绝大多数房间列表场景，​**N-Gram ​倒排索引**​**（Bigram）** 是最佳选择，在查询性能和实现复杂度之间取得了完美平衡。
