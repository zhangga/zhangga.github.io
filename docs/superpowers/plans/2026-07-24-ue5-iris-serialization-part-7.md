# UE5 Iris 第七部分：序列化系统实施计划

## 交付目标

根据已批准的设计规格，新增第七部分完整 HTML 技术文章和对应 Hexo Post：

- `source/html-articles/ue5-iris-guide-part-7/index.html`
- `source/_posts/ue5-iris-guide-part-7.md`

完整文章路由为 `/html-articles/ue5-iris-guide-part-7/`。正文以本地 Unreal Engine 5.7.4 源码为技术基线，覆盖大纲 `7.1` 至 `7.19`，延续第六部分的内容深度和页面结构。

实现过程中只读访问 `C:\work\st-unreal-engine`，不修改该 UE 源码仓库。内容文件完成后保持未提交状态，等待用户单独要求提交。

## 任务 1：建立 UE 5.7.4 序列化技术事实表

### 版本与源码根目录

- `C:/work/st-unreal-engine/Engine/Build/Build.version`
- `C:/work/st-unreal-engine/Engine/Source/Runtime/Net/Iris`

### 核心接口

- `Public/Iris/Serialization/NetSerializer.h`
- `Public/Iris/Serialization/NetSerializerConfig.h`
- `Public/Iris/Serialization/NetSerializationContext.h`
- `Public/Iris/Serialization/NetBitStreamReader.h`
- `Public/Iris/Serialization/NetBitStreamWriter.h`
- `Public/Iris/Serialization/NetSerializerRegistry.h`
- 对应的 `Private/Iris/Serialization` 实现文件

### 复杂状态与描述符

- ChangeMask 相关头文件和实现。
- `ArrayPropertyNetSerializer`。
- `StringNetSerializer`。
- `NameNetSerializer`。
- `RotatorNetSerializers`。
- `PackedIntNetSerializers`。
- Replication State Descriptor 与 Serializer 选择路径。
- 具名结构 Serializer 注册与 Registry Delegate。
- Iris 序列化自动化测试中的最小自定义 Serializer 示例。

### 核对内容

1. `FNetSerializer` 在 5.7.4 中的完整字段和 Traits。
2. Builder、声明宏、实现宏和注册宏的实际签名。
3. 每个回调的参数结构、输入输出和错误传播。
4. SourceType、QuantizedType 和 Config 的关系。
5. Dynamic State 与 Net Reference 的生命周期。
6. Writer/Reader 的固定比特写入、溢出和读取语义。
7. ChangeMask 的存储和成员映射。
8. 数组、FString、FName、Rotator 和 PackedInt 的真实实现。
9. Delta 接口的基础职责和第十部分边界。
10. 自定义 Struct Serializer 接入 Descriptor 的实际路径。

### 官方资料

只使用 Epic Games 官方 UE 5.7 文档和 API 页面作为网络资料。公开文档没有确认的内部细节，以本地 UE 5.7.4 源码为准，并明确源码仓库是非 Promoted 的项目分支。

### 完成标准

- 技术断言能映射到 UE 5.7.4 源码或 Epic 官方 UE 5.7 文档。
- 不使用 UE 5.5 路径推断 5.7 行为。
- 不使用未经确认的精确行号。

## 任务 2：生成内置 Serializer 清单和分类

### 扫描范围

- `Public/Iris/Serialization/*NetSerializer*.h`
- `Private/Iris/Serialization/*NetSerializer*.cpp`
- 必要的 Engine/StructUtils/Gameplay 相关 Iris Serializer

### 统计口径

- 以具备实际 `FNetSerializer` 定义的 Serializer 为条目。
- 配置类不单独计数。
- 同名声明与实现不重复计数。
- Byte/Short、Signed/Unsigned 等具有独立行为的变体分别计数。
- 内部测试 Serializer 不计入生产速查表。

### 输出

- 当前 UE 5.7.4 源码快照中的文件数。
- Serializer 名称、支持类型、动态状态、引用、Delta 和用途表。
- 文章中的“数量”必须注明统计口径和版本。

## 任务 3：核对并设计 `FHealthNetSerializer`

### 数据模型

- SourceType：`FReplicatedHealth`。
- 范围：0.0–1000.0。
- 步长：0.1。
- QuantizedType：能容纳 0–10000 的整数。
- 完整编码：14 bits。

### 实现核对

1. Config 是否需要继承 `FNetSerializerConfig`。
2. Serializer 的 Version、Traits 和类型别名。
3. `Serialize` / `Deserialize` 参数签名。
4. `Quantize` / `Dequantize` 参数签名。
5. `IsEqual` / `Validate` 参数签名。
6. 默认 Config 的定义位置。
7. 声明与实现宏。
8. 具名结构 Serializer 注册委托。
9. USTRUCT 和 UPROPERTY 的接入方式。
10. Build.cs 所需模块依赖。

### 验证模型

- 0、0.1、999.9、1000 的往返。
- 半步舍入。
- 负数、超上限、NaN 和 Infinity。
- 14-bit 最大可表示值与合法索引范围。
- IsEqual 在 Source 与 Quantized 两种状态下的语义。

### 完成标准

- 示例按 5.7.4 源码逐项核对。
- 明确标注“可编译导向，未执行完整 UE 工程构建”。
- 不虚构不存在的宏或注册 API。

## 任务 4：编写正文与百人大逃杀位预算

### 顶级章节

1. 第七部分导读
2. 7.1 序列化系统概述
3. 7.2 `FNetSerializer`
4. 7.3 量化
5. 7.4 内置序列化器
6. 7.5 自定义 Health Serializer
7. 7.6 BitStream
8. 7.7 Delta 基础接口
9. 7.8 ChangeMask
10. 7.9 数组
11. 7.10 字符串与名称
12. 7.11 Rotator 变体
13. 7.12 PackedInt
14. 7.13 注册与宏
15. 7.14 速查表
16. 7.15 游戏案例
17. 7.16 生产化指南
18. 7.17 故障排查
19. 7.18 性能建议
20. 7.19 总结
21. 关键源码文件索引
22. 下一部分预告

### 百人大逃杀角色状态

- Position。
- Rotation。
- Health。
- Shield。
- WeaponId。
- Ammo。
- Inventory。
- PlayerDisplayName。
- StableType/Resource Name。

### 两类预算

1. 初次创建或完整状态。
2. 本帧只改变 Health 与 Ammo。

表格区分：

- 字段载荷 bits。
- ChangeMask 或存在标志。
- 动态长度/引用的额外成本。
- 解释性假设。
- 无法仅凭字段模型确定的真实协议开销。

### 完成标准

- 数据旅程贯穿全文。
- Health 14-bit 模型可复算。
- 不把字段位数直接等同于包大小。
- Delta 只讲接口，不侵入第十部分。

## 任务 5：生成 HTML 与 Hexo Post

### HTML

复用第六部分的：

- CSS 变量和文章布局。
- Hero。
- 桌面粘滞目录。
- 移动折叠目录。
- 阅读进度。
- 桌面/移动当前章节高亮。
- 返回顶部。
- 代码块与横向滚动表格。

通过 `apply_patch` 创建临时 Node 生成脚本，提取第六部分稳定样式和交互，生成：

`source/html-articles/ue5-iris-guide-part-7/index.html`

生成后删除临时脚本。

### Hexo Post

创建：

`source/_posts/ue5-iris-guide-part-7.md`

Front Matter：

- 标题：`UE5-Iris 网络复制系统技术分析 - 第七部分：序列化系统`
- 日期：实施时写入 2026-07-24 的具体时分。
- 标签：`UE`、`Iris`、`网络复制`
- ID：`ue5-iris-guide-part-7`
- 分类：`笔记`

正文包含：

- 准确摘要。
- Epic 官方 UE 5.7 技术依据。
- `<!-- more -->`
- `[打开完整 HTML 文章](/html-articles/ue5-iris-guide-part-7/)`

## 任务 6：静态结构和技术内容检查

### 自动检查

- 单一 HTML 文档结构。
- 所有 ID 唯一。
- 所有 hash 链接有目标。
- 桌面与移动目录条目数一致。
- 外部新窗口链接包含安全属性。
- 7.1–7.19 全部存在。
- 无 Unicode replacement character。
- 无未展开模板变量。
- 无伪造源码行号。
- Post 路由正确。
- `git diff --check` 无错误。

### 技术检查

- 序列化、量化、ChangeMask 和 Delta 明确区分。
- Health 宏、Traits、参数结构和注册路径与 5.7.4 一致。
- 数组动态状态生命周期与源码一致。
- FString 编码、FName/Token 结论与 5.7.4 一致。
- Rotator 精度和 PackedInt 位数模型可复算。
- Serializer 数量有明确统计口径。

## 任务 7：Hexo 构建和路由验证

运行：

```powershell
npm run build
```

验证：

- `public/ue5-iris-guide-part-7/index.html`
- `public/html-articles/ue5-iris-guide-part-7/index.html`

检查构建日志、UTF-8 内容、摘要链接和完整 HTML 复制结果。

## 任务 8：浏览器验收

在独立端口启动 Hexo 服务器并记录明确 PID。

### 桌面端 `1440×1000`

- Hero、来源说明和 UE 5.7.4 标识。
- 粘滞目录、内部滚动和当前章节高亮。
- 22 个顶级章节跳转。
- Health 代码、位数表和源码速查表。
- 阅读进度和返回顶部。
- 无页面级横向溢出。

### 移动端 `390×844`

- 桌面目录隐藏。
- 折叠目录可展开并高亮。
- 长代码与宽表格独立横向滚动。
- 标题、来源说明和页脚正常换行。
- 无页面级横向溢出。

### Post

- 打开 `/ue5-iris-guide-part-7/`。
- 确认摘要和官方来源。
- 点击完整文章链接并到达正确路由。

### 运行时

- 控制台无 JavaScript 错误。
- 完成后重置视口并完成标签页清理。

## 任务 9：清理和交付

1. 停止本次 Hexo 预览进程。
2. 删除临时脚本和日志。
3. 确认 UE 5.7.4 源码仓库状态没有因本任务变化。
4. 确认博客仓库只新增 Part 7 目标文件，不误改现有未提交内容。
5. 汇总构建、结构和浏览器验收结果。
6. 保持 Part 7 HTML 与 Post 未提交，等待用户要求 `commit`。

## 最终验收清单

- [ ] UE 5.7.4 技术事实核对完成。
- [ ] 内置 Serializer 清单有明确统计口径。
- [ ] `FHealthNetSerializer` 示例按源码核对。
- [ ] 7.1–7.19 全覆盖且无重复章节。
- [ ] Delta 内容边界正确。
- [ ] 百人大逃杀位预算自洽。
- [ ] HTML 与 Post 路径正确。
- [ ] 静态结构检查通过。
- [ ] Hexo 构建成功。
- [ ] 桌面和移动端验收通过。
- [ ] 临时文件、服务和浏览器视口已清理。
- [ ] UE 源码仓库未被修改。
- [ ] Part 7 内容保持未提交。
