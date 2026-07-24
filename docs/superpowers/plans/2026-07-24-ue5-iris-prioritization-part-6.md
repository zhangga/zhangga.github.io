# UE5 Iris 第六部分：优先级系统实施计划

## 交付目标

根据已批准的设计规格，新增第六部分完整 HTML 技术文章和对应 Hexo Post：

- `source/html-articles/ue5-iris-guide-part-6/index.html`
- `source/_posts/ue5-iris-guide-part-6.md`

完整文章路由为 `/html-articles/ue5-iris-guide-part-6/`。正文以 Unreal Engine 5.5 为技术基线，覆盖大纲 `6.1` 至 `6.8`，延续第五部分的内容深度和页面结构。

实现过程中不修改前五部分文章，不改主题模板，不引入新的前端依赖，不生成装饰性图片。内容文件完成后保持未提交状态，等待用户单独要求提交。

## 任务 1：建立 UE 5.5 技术事实表

### 读取文件

- `C:/Program Files/Epic Games/UE_5.5/Engine/Source/Runtime/Experimental/Iris/Core/Public/Iris/ReplicationSystem/Prioritization/NetObjectPrioritizer.h`
- `.../LocationBasedNetObjectPrioritizer.h`
- `.../SphereNetObjectPrioritizer.h`
- `.../SphereWithOwnerBoostNetObjectPrioritizer.h`
- `.../FieldOfViewNetObjectPrioritizer.h`
- `.../NetObjectCountLimiter.h`
- `.../ReplicationView.h`
- `.../ReplicationSystem.h`
- `.../ObjectReplicationBridgeConfig.h`
- 对应的 `Private/Iris/ReplicationSystem/Prioritization/*.cpp`
- `Engine/Config/BaseEngine.ini`

### 核对内容

1. `UNetObjectPrioritizer` 的完整生命周期和回调顺序。
2. `FNetObjectPrioritizationInfo` 的真实布局、大小和用途。
3. 优先级允许范围、默认值、累积与重置语义。
4. Sphere、Owner Boost、FOV 和 Count Limiter 的配置字段与默认值。
5. 位置来源、RepTag、WorldLocations 和脏对象更新路径。
6. `FReplicationView` 的字段、多视图结构和 ViewTarget。
7. `FReplicationPrioritization::Prioritize()` 的实际阶段与调用顺序。
8. 静态优先级、动态 Prioritizer、ViewTarget 提升和累积的组合方式。
9. `SetStaticPriority`、`SetPrioritizer`、`GetPrioritizerHandle` 的准确签名与失败语义。
10. BaseEngine.ini 中实际注册的 Prioritizer 名称及类级配置。

### 官方资料

只使用 Epic Games 官方 UE 5.5 文档和 API 页面作为网络资料。公开文档没有确认的内部细节，以本机 UE 5.5 源码为准。

### 完成标准

- 每个正文技术断言都能映射到官方文档、UE 5.5 头文件或实现文件。
- 记录版本差异风险。
- 不使用未经确认的精确行号。

## 任务 2：确定正文结构和数字模型

### 主章节

1. 第六部分导读
2. 6.1 优先级系统概述
3. 6.2 `UNetObjectPrioritizer` 基类
4. 6.3 内置优先级器
5. 6.4 `FReplicationView`
6. 6.5 优先级配置
7. 6.6 优先级系统内部实现
8. 6.7 实际应用案例
9. 6.8 小结
10. 常见问题与排查
11. 性能建议
12. 关键源码文件索引
13. 下一部分预告

### 800→120 解释性模型

建立一张自洽的多帧表格，至少包含：

- 对象类别。
- 候选数量。
- 原始动态或静态优先级。
- Owner、ViewTarget 或关键状态提升。
- 历史累积量。
- 当前帧解释性总分。
- 是否进入约 120 个对象的示意发送集合。
- 未发送对象下一帧的累积变化。

正文必须紧邻表格声明：

- 120 是教学用对象数量预算。
- 真实 Iris 写入阶段按位预算和实际状态成本工作。
- 对象大小、创建数据、附件、可靠性和历史状态都会影响本帧结果。

### 完成标准

- 数字表各列可复算。
- 连续帧结果体现高优先级对象及时发送，以及低优先级对象通过累积获得机会。
- 不把 Count Limiter、Prioritizer 和 Writer 带宽调度混为同一机制。

## 任务 3：编写完整 HTML 文章

### 模板

复用 `source/html-articles/ue5-iris-guide-part-5/index.html` 的：

- CSS 变量和编辑型文章布局。
- Hero。
- 桌面固定目录。
- 移动端折叠目录。
- 阅读进度条。
- 当前目录高亮。
- 返回顶部按钮。
- 代码块与横向滚动表格。

### 实现方式

1. 通过 `apply_patch` 创建临时生成脚本。
2. 生成脚本只读取第五部分模板，提取稳定的 CSS 和交互脚本。
3. 正文使用明确的章节数据生成目录与稳定锚点。
4. 写入 `source/html-articles/ue5-iris-guide-part-6/index.html`。
5. 验证完成后通过 `apply_patch` 删除临时生成脚本。

### 页面元数据

- `lang="zh-CN"`
- 作者沿用站点 `_config.yml`
- 标题与描述指向第六部分
- Canonical 指向站点内第六部分路由
- Hero 标明 Unreal Engine 5.5

### 内容标注

- 已核对源码：标注“UE 5.5 源码节选”。
- INI 内容：标注“配置示例”。
- 非完整可编译代码：标注“解释性骨架”或“解释性伪代码”。
- 800→120 表：标注“解释性预算模型”。

### 完成标准

- 至少包含 6.1–6.8 八个大纲章节。
- 覆盖五个 Prioritizer 层次或实现。
- 覆盖 ReplicationView、配置、内部流程和四种游戏类型。
- 页尾注明原创整理和 UE 5.5 技术依据。
- 不包含知乎转载说明。

## 任务 4：创建 Hexo Post

### 新增文件

`source/_posts/ue5-iris-guide-part-6.md`

### Front Matter

- 标题：`UE5-Iris 网络复制系统技术分析 - 第六部分：优先级系统`
- 日期：`2026-07-24`，具体时分在实施时写入
- 标签：`UE`、`Iris`、`网络复制`
- ID：`ue5-iris-guide-part-6`
- 分类：`笔记`

### 正文

- 一段准确摘要。
- Epic Games UE 5.5 技术依据链接。
- `<!-- more -->`
- `[打开完整 HTML 文章](/html-articles/ue5-iris-guide-part-6/)`

### 完成标准

- Post 不重复完整正文。
- Post 到完整 HTML 的链接为站点绝对路径。

## 任务 5：静态结构和内容验证

### 自动检查

使用一次性 Node 只读检查脚本验证：

- 单一 `DOCTYPE`、`html`、`body`。
- 所有 ID 唯一。
- 所有 `href="#..."` 均存在目标。
- 桌面与移动目录条目数等于主章节数。
- 外部新窗口链接包含 `noopener noreferrer`。
- 官方 Epic 链接存在。
- 不含知乎链接。
- 不含 Unicode replacement character。
- 不含 `.cpp:数字` 或 `.h:数字` 形式的伪行号。
- Post 包含正确完整文章路由。
- 6.1–6.8 均存在。
- `git diff --check` 无空白错误。

### 人工技术检查

- Owner Boost 与 Owner Filtering 明确区分。
- Count Limiter 与 Writer 带宽预算明确区分。
- 多视图行为与源码一致。
- 优先级累积公式和重置条件与 UE 5.5 一致。
- 解释性数字模型不冒充引擎固定算法。

## 任务 6：Hexo 构建和路由验证

### 命令

```powershell
npm run build
```

### 验证文件

- `public/ue5-iris-guide-part-6/index.html`
- `public/html-articles/ue5-iris-guide-part-6/index.html`

### 验证内容

- 构建日志没有错误。
- 生成 Post 中包含 `/html-articles/ue5-iris-guide-part-6/`。
- 完整 HTML 文件被原样复制。

## 任务 7：浏览器验收

### 预览

在独立端口启动 Hexo 本地服务器，记录并在结束时停止其明确进程。

### 桌面端

使用 1440×1000 视口检查：

- Hero 标题、摘要和元信息。
- 固定目录显示和当前章节高亮。
- 所有表格、代码块和预算模型。
- 目录跳转后标题位置。
- 阅读进度条。
- 页尾来源说明。
- 无页面级横向溢出。

### 移动端

使用 390×844 视口检查：

- 桌面目录隐藏。
- 移动目录可展开。
- 标题正常换行。
- 表格和代码块只在自身容器横向滚动。
- 返回顶部按钮可用。
- 无页面级横向溢出。

### Post

- 打开 `/ue5-iris-guide-part-6/`。
- 确认标题、摘要、技术依据和完整文章链接。
- 点击链接并确认到达第六部分完整 HTML。

### 运行时

- 控制台无警告和错误。
- 验收后重置临时视口并关闭自动化创建的标签页。

## 任务 8：清理和交付

1. 停止只属于本次验收的 Hexo 预览进程。
2. 删除临时生成脚本和预览日志。
3. 确认没有修改或删除前五部分文件。
4. 运行最终结构检查。
5. 查看 `git status --short`。
6. 向用户报告新增文件、构建结果和浏览器验收结果。
7. 保持第六部分文章和 Post 未提交，等待用户要求 `commit`。

## 最终验收清单

- [ ] UE 5.5 技术事实全部核对。
- [ ] 6.1–6.8 全部覆盖。
- [ ] 800→120 多帧模型自洽且边界声明清晰。
- [ ] HTML 和 Post 路径正确。
- [ ] 结构检查全部通过。
- [ ] Hexo 构建成功。
- [ ] 桌面和移动端浏览器验收通过。
- [ ] Post 跳转成功。
- [ ] 临时文件和进程已清理。
- [ ] 工作区只包含预期的第六部分交付文件。
