---
title: UE 5.8 的 Graviton4 优化：从编译参数到实际运行效果
tags:
  - UE
id: ue5.8-arm-build
categories:
  - 笔记
date: 2026-09-08 14:15:38
---

# UE 5.8 的 Graviton4 优化：从编译参数到实际运行效果

源码基准：Epic 官方 UE 5.8.2 快照 `16d75d84714512edfb744e1fd0a59e9c74d57873`。本文解释实现、收益机制、公开实测及验证方法；没有对本项目进行 Linux ARM64 构建、反汇编或性能测试。

## 1. UE 增加的是 CPU 编译目标，收益发生在生成的程序中

UE 5.8 的关键改动很小：增加 `Arm64TargetCpuType.Graviton4`，将它映射为 **`-mcpu=neoverse-v2+crypto`**。UBT 负责把选择传递给 Clang，具体指令选择和 CPU 调优由 LLVM 完成。它没有在这次改动中重写游戏逻辑，也没有增加编译缓存；因此这里的“编译优化”指生成更适合目标 CPU 的代码，不能直接理解为缩短工程编译时间。[Graviton4 引入提交](https://github.com/EpicGames/UnrealEngine/commit/7d9b8ff76e1ce50813d57daa2f808dffa1eb42b9)

该提交于 2026-04-16 落入 5.8 分支，CL 52782583；同日另一提交增加 `GravitonSVE`。新增的是这两个目标，已有的 CPU 选择机制、Graviton2、Graviton3 不能一起算成 5.8 新功能。[GravitonSVE 引入提交](https://github.com/EpicGames/UnrealEngine/commit/925ffc81d70ebf6609999c615fe2cbba728296e5)

已经精读的实现链如下；节点名称对应实际源码符号：

```mermaid
flowchart LR
    A[TargetRules.MinArm64CpuTarget] --> B[UEBuildTarget.SetupGlobalEnvironment]
    B --> C[CppCompileEnvironment.MinArm64CpuTarget]
    C --> D[LinuxToolChain.GetCompileArguments_Global]
    D --> E[ClangToolChain.GetCompileArguments_Global]
    E --> F[GetCompileArguments_Architecture]
    F --> G[ARM64 分支生成 CPU 参数]
```

入口见 [TargetRules.cs:2660](https://github.com/EpicGames/UnrealEngine/blob/16d75d84714512edfb744e1fd0a59e9c74d57873/Engine/Source/Programs/UnrealBuildTool/Configuration/Rules/TargetRules.cs#L2660)，赋值见 [UEBuildTarget.cs:6213](https://github.com/EpicGames/UnrealEngine/blob/16d75d84714512edfb744e1fd0a59e9c74d57873/Engine/Source/Programs/UnrealBuildTool/Configuration/UEBuildTarget.cs#L6213)，最终分派见 [ClangToolChain.cs:986](https://github.com/EpicGames/UnrealEngine/blob/16d75d84714512edfb744e1fd0a59e9c74d57873/Engine/Source/Programs/UnrealBuildTool/Platform/Clang/ClangToolChain.cs#L986)。完整调用链和版本证据保留在[前篇源码核验报告](UE5.8-Graviton4-Compiler-Optimization-20260908.md)。

在已有的 Linux ARM64 Server Target 规则中，核心设置是：

```csharp
MinArm64CpuTarget = Arm64TargetCpuType.Graviton4;
```

此属性带有 `RequiresUniqueBuildEnvironment`，并有命令行与 XML 绑定；实际应用还要遵守目标的构建环境约束。本文没有验证本项目 Target 配置，也没有精读命令行属性解析器，因而不提供猜测的 CLI 拼接命令。[TargetRules 定义](https://github.com/EpicGames/UnrealEngine/blob/16d75d84714512edfb744e1fd0a59e9c74d57873/Engine/Source/Programs/UnrealBuildTool/Configuration/Rules/TargetRules.cs#L2660)

| UBT 目标 | 当前源码实际追加参数 | 应如何理解 |
| --- | --- | --- |
| `Default` | 此 CPU 分派没有对应 case | 此处不追加 Graviton 专用参数；其它平台参数仍须看实际命令 |
| `Graviton2` | `-march=armv8.2-a+fp16+rcpc+dotprod+crypto`；`-mtune=neoverse-n1` | 较早代际的 ISA 基线与 N1 调优 |
| `GravitonSVE` | `-mcpu=neoverse-512tvb+crypto` | 面向 Graviton3/4 的跨代 SVE 目标 |
| `Graviton3` | `-mcpu=neoverse-512tvb+bf16+rng+crypto`；`-mtune=neoverse-v1` | 在公共 SVE 目标上指定 V1 调优及扩展 |
| `Graviton4` | `-mcpu=neoverse-v2+crypto` | V2 指令能力与调优，允许使用 SVE2 等能力 |

上表以 [UE 的完整 ARM64 分派](https://github.com/EpicGames/UnrealEngine/blob/16d75d84714512edfb744e1fd0a59e9c74d57873/Engine/Source/Programs/UnrealBuildTool/Platform/Clang/ClangToolChain.cs#L986)为准，不能用 AWS 通用推荐参数替代。

## 2. 一条 `-mcpu` 同时改变两类决策

第一类是**允许生成什么指令**。目标 CPU 的特性集合决定编译器是否可以选用 SVE2、LSE、整数矩阵或加密指令。第二类是**在合法方案中选哪个更划算**：不同 CPU 的指令延迟、执行资源和代价估计，会影响调度、指令组合、向量化及展开等选择。AWS 的 ARM64 指南明确区分架构能力和 CPU 调优，并说明 `-mcpu` 同时指定二者。[AWS C/C++ 指南](https://github.com/aws/aws-graviton-getting-started/blob/main/c-c%2B%2B.md)

PR 作者说明，Neoverse V2 目标已经包含 SVE2、bf16、rng、dotprod、fp16、rcpc、i8mm、LSE/LSE2 等能力及调优，因此无需再重复 Graviton3 的 `+bf16+rng` 或另加 `-mtune`。`+crypto` 显式保留，原因是部分工具链默认特性选择可能排除 crypto。这是作者对实现取舍的解释，不是本次逐一实测全部扩展的结果。[PR 作者说明](https://github.com/EpicGames/UnrealEngine/pull/14667#issuecomment-4253701944)

LLVM 16 已增加 Neoverse V2 支持；UE 5.8 的 Linux SDK 更新使用 Clang 20.1.8。因而 UE 这次主要把现成的 LLVM 能力接入 UBT，而不是新写一个 ARM 后端。CPU 名称相同也不意味着不同 LLVM 版本生成相同代码；例如 LLVM 21 又调整 V2 模型，不能把后续版本效果计入 UE 这套工具链。[LLVM 16 发布说明](https://releases.llvm.org/16.0.0/docs/ReleaseNotes.html#changes-to-the-aarch64-backend)、[UE 5.8 发布说明](https://dev.epicgames.com/documentation/unreal-engine/unreal-engine-5-8-release-notes)、[Arm 的 LLVM 21 更新说明](https://developer.arm.com/community/arm-community-blogs/b/tools-software-ides-blog/posts/what-is-new-in-llvm-21)

## 3. 效果矩阵：哪些代码可能受益，需要什么条件

下表描述编译机制和适用条件，不是本项目的热点清单或收益预测。

| 能力 | 可能改善的工作 | 触发条件 | 不会仅因选择 G4 自动发生 |
| --- | --- | --- | --- |
| NEON | 连续数组的浮点、整数批处理 | 已有 SIMD 实现，或编译器证明向量化合法且有利 | 所有标量循环都向量化；NEON 也不是 G4 新增 |
| SVE | 可向量化循环、掩码处理、部分搜索与比较 | 工具链能识别模式，数据依赖及访存允许 | 对象遍历自动变成连续批处理 |
| SVE2 | 某些整数、位操作、直方图、媒体内核 | 有匹配指令模式或专门优化的实现 | 任意计算因“SVE2”名称获得固定倍数提升 |
| V2 调优 | 调度、指令组合与循环策略 | 优化器实际使用对应目标信息 | 消除串行依赖、锁等待、随机访存 |
| LSE | 原子读改写、部分竞争热点 | 对应原子操作落到 LSE 路径 | 消除所有锁或缓存行竞争；G2 已支持 LSE |
| crypto | AES/SHA 等匹配操作 | 库或 intrinsic 实现实际采用扩展 | 自动替换任何加密库实现或提升普通玩法代码 |
| BF16 / I8MM | 特定精度的推理、矩阵内核 | 数据类型、算法和库内核匹配 | 把普通 FP32 运算自动改为 BF16 或 int8 |
| RNG | 显式调用硬件随机接口 | 使用对应 intrinsic，处理返回状态 | 替换应用 PRNG，或保持原有随机序列 |
| PGO / LTO | 热路径布局、内联、跨模块优化 | 单独启用且正确构建、训练 | 由 `Graviton4` 选项自动开启 |

矩阵依据 LLVM 的[向量化机制](https://releases.llvm.org/20.1.0/docs/Vectorizers.html)、[V2 调度模型引入记录](https://lists.llvm.org/pipermail/all-commits/Week-of-Mon-20230612/122435.html)、Arm 的[ACLE 扩展接口](https://arm-software.github.io/acle/main/acle.html)及后文各案例；实际效果须落实到目标函数和产物验证。

## 4. NEON、SVE、SVE2：从“能用”到“实际用了”

NEON 以固定宽度 SIMD 处理多个数据元素；SVE 提供可伸缩向量与谓词，使同一套循环表达可以适配不同向量长度，并对有效元素进行掩码操作。SVE2 扩展了整数和位处理等能力，覆盖更多传统 SIMD 工作负载。它们不是三个依次替换全部代码的开关。[Arm SVE/SVE2 说明](https://developer.arm.com/community/arm-community-blogs/b/architectures-and-processors-blog/posts/sve-sve2-enablement-in-simd-library)

尤其要避免“G4 的 SVE 更宽，所以自然翻倍”的推断：Arm 资料给出的 G3E/V1 SVE 向量宽度为 256 位，G4/V2 为 128 位，执行组织不同；宽度一个数字不能代表整体吞吐。`neoverse-512tvb` 中的 512 指总向量带宽目标，也不能读成 512 位寄存器。[Arm Graviton4 分析](https://developer.arm.com/community/arm-community-blogs/b/servers-and-cloud-computing-blog/posts/leading-hpc-performance-with-graviton4)、[GCC 对 neoverse-512tvb 的定义](https://gcc.gnu.org/onlinedocs/gcc/AArch64-Options.html)

对于普通 C/C++ 循环，LLVM 大体要解决三个问题：变换是否保持语义，候选方案是否值得采用，然后才生成向量代码。别名关系不清楚时可以增加运行时检查，数据重叠则走标量路径；复杂控制流、依赖或无法处理的调用也可能阻止向量化。因此“目标支持 SVE2”只回答了可用指令集合，不能替代合法性与代价判断。[LLVM VPlan 设计](https://llvm.org/docs/VectorizationPlan.html)、[Clang 循环优化提示](https://clang.llvm.org/docs/LanguageExtensions.html)

浮点归约还涉及计算顺序。重排加法可能改变舍入结果，不能为了让 SIMD 生效就无条件放宽浮点语义。诊断时先看编译器为什么放弃，再决定数据与算法是否允许变换。[LLVM 20 向量化文档](https://releases.llvm.org/20.1.0/docs/Vectorizers.html)

### 例一：搜索循环可以变成带谓词的 SVE 比较

Arm 介绍 LLVM 18 的 `AArch64LoopIdiomTransform` 时，展示了“逐字节比较，遇到不相同即停止”的模式。识别成功后可以一次比较多字节，用谓词定位退出位置；转换包含跨页运行时检查和标量后备，不能简单理解为无条件读取更宽的数据。作者在 SPEC `557.xz_r` 上报告 V2 约 5% 的改善。[Arm LLVM 18 说明](https://developer.arm.com/community/arm-community-blogs/b/tools-software-ides-blog/posts/p1-whats-new-in-llvm-18)

下面是对该机制的语义概括，不是本次生成的汇编：

```text
标量：读取一对字节 → 比较 → 决定退出或前进 → 重复
向量：检查适用条件 → 批量比较有效字节 → 从谓词结果确定退出位置
                     └ 条件不满足时走标量后备
```

该结果证明特定循环识别确有价值；它不能证明 UE 的任意字符串处理都会命中同一变换。原文示例命令使用 `-O3 -mcpu=neoverse-v1`，也不是本文为 UE G4 编译得到的命令或结果。

### 例二：SVE2 的价值可以来自更合适的操作，而非更宽的向量

AWS 在 x265 的 `saoCuStatsE0` 优化案例中，用 SVE2 的 `histseg` 与 `add` 替代原实现中多条比较、累加操作。以同一 C 实现为基线，NEON 内核为 2.7 倍，SVE2 内核为 3.2 倍；由此计算 SVE2 相对 NEON 吞吐提高约 18.52%。[AWS 视频编码优化](https://aws.amazon.com/blogs/opensource/video-encoding-on-graviton-in-2025/)

这里有三层边界：它是特定函数吞吐，不是整个编码器速度；是库作者专门改写的内核，不是已证明 Clang 自动从任意 C 生成的结果；更不是 UE Server 的收益。其启示是，当分析发现热点与某类 SVE2 操作匹配时，可以考虑专门的实现，而不能只看二进制中是否出现 SVE 指令。

## 5. V2 调度和代价模型：不增加新指令也可能改变性能

LLVM 为 Neoverse V2 引入了专用调度模型，依据 Arm 软件优化指南描述机器行为。模型为编译器提供指令延迟和执行资源等信息，使其能比较不同安排；不必出现 SVE2，普通标量或 NEON 代码也可能因目标调优而改变。[V2 模型提交](https://lists.llvm.org/pipermail/all-commits/Week-of-Mon-20230612/122435.html)

一个具体例子是 LLVM 对 V2 前后索引 load/store 模型的修正：地址更新部分被建模为过高延迟，会影响依赖链估计。修正描述的是“编译器理解 CPU 的精度”，并非 CPU 本身突然获得新指令。[LLVM D159254](https://reviews.llvm.org/D159254)

由此可以解释为什么 `-march` 与 `-mtune` 要分开理解：前者放宽指令集合，后者改善对指定机器的选择；`-mcpu` 把二者合在一起。也能解释为什么“参数已传入”与“热点已改善”之间仍有距离：若真实瓶颈主要是内存等待或不可并行依赖，调整指令安排的收益空间可能很小。这是机制分析，本文没有据此判断本项目存在何种瓶颈。

## 6. LSE：减少原子操作重试，但不是 Graviton4 独有

Arm 的公开示例将一个原子加法分别编译为 LL/SC 循环与 LSE 指令。以下仅摘取指令名称和关键操作，来自该示例的 GCC 产物；不代表本次 UE/Clang 的实际反汇编。[Arm LSE 实例](https://learn.arm.com/learning-paths/servers-and-cloud-computing/lse/example/)

```text
LL/SC：ldaxr → add → stlxr → cbnz（存储失败则重试）
LSE：  ldaddal（以原子读改写操作表达加法）
```

还存在第三种实现：outline atomics。面向较旧架构编译时，代码调用辅助函数；辅助函数运行时判断 CPU 能力，选择 LSE 或 LL/SC。因此 Default 构建也有可能已经通过 helper 使用 LSE，不能仅凭 `-mcpu` 的有无断言之前全是重试循环。Clang 文档提供 `-moutline-atomics`，但本文没有验证 UE 当前 Default 命令是否启用它。[Clang 20 命令参考](https://releases.llvm.org/20.1.0/tools/clang/docs/ClangCommandLineReference.html)、[Arm LSE 实例](https://learn.arm.com/learning-paths/servers-and-cloud-computing/lse/example/)

直接指定具有 LSE 的目标，可以使适用操作直接使用该 ISA；收益可能来自减少软件重试和 helper 开销，但不保证消除缓存一致性争用。原子操作的内存序仍须保持，不能随意把 acquire/release 改成 relaxed。[LLVM 原子操作语义](https://releases.llvm.org/20.1.0/docs/Atomics.html)

这一点对归因特别重要：Graviton2 已支持 LSE。若 G2 基线和 G4 构建的热点早已使用相同 LSE 指令，不能再把“获得 LSE”计入 G4 增量。Arm 的 N1 Java 测试还表明，启用 LSE 的吞吐收益会随 JDK 内存布局修复从 11% 变为 2%；共享缓存行问题会显著影响结果。[AWS Graviton 指南](https://github.com/aws/aws-graviton-getting-started/blob/main/c-c%2B%2B.md)、[Arm N1 Java 分析](https://developer.arm.com/community/arm-community-blogs/b/architectures-and-processors-blog/posts/java-performance-on-neoverse-n1)

## 7. crypto、BF16、I8MM、RNG 各自只解决特定工作

`+crypto` 让匹配的加密扩展可用，但是否受益还取决于实际库和执行路径。若链接的是已经编译完成的库，改变外层 Target 参数并不能证明该库内部重新生成了代码。需要核对库版本、构建方式、运行时分派和被调用的实现。[Arm 架构特性选项](https://developer.arm.com/documentation/102284/6-16-2LTS/armclang-Reference/armclang-Command-line-Options/-march)

BF16 和 I8MM 对特定机器学习及矩阵内核有用，但有不同的数据精度与指令接口。Graviton3 已有 BF16；普通 FP32 游戏计算不会因为选用 G4 就自动转成 BF16。要采用这类路径，需要库内核和精度策略明确配合，而不是把一次编译器目标选择当成精度变更授权。[Arm Graviton3 推理分析](https://developer.arm.com/community/arm-community-blogs/b/servers-and-cloud-computing-blog/posts/machine-learning-inference-on-aws-graviton3)、[Arm ACLE](https://arm-software.github.io/acle/main/acle.html)

RNG 扩展对应显式硬件随机接口，ACLE 还定义了结果状态。它不会自动替换程序已有的伪随机数生成器；需要固定种子和可复现序列的逻辑，更不能据此宣称获得等价加速。是否使用该接口是算法层面的选择。[Arm ACLE 随机数接口](https://arm-software.github.io/acle/main/acle.html)

## 8. PGO、LTO 与数据布局：解决 CPU 目标之外的问题

PGO 告诉优化器哪些路径经常执行，用于热路径布局、内联等选择。它需要代表真实业务的训练负载；训练偏差可能使未覆盖的重要场景变差。典型流程是生成 profile 的构建、运行训练、合并数据、使用 profile 重新构建，最终测试的是优化产物，不能拿插桩构建的耗时做结论。[Clang 20 PGO 文档](https://releases.llvm.org/20.1.0/tools/clang/docs/UsersManual.html#profile-guided-optimization)

LTO 扩大优化器可见范围，使跨编译单元的优化成为可能。ThinLTO 利用模块摘要、函数导入和并行后端控制成本。只有最终原生机器码的第三方库，不具有同等的跨 LLVM IR 优化可见性。[LLVM LTO 设计](https://llvm.org/docs/LinkTimeOptimization.html)、[ThinLTO 设计](https://clang.llvm.org/docs/ThinLTO.html)

UE 分别暴露 `bAllowLTCG`、`bPreferThinLTO`、`bPGOProfile`、`bPGOOptimize`；Graviton4 的两处新增代码没有自动启用这些选项。[Epic Target Reference](https://dev.epicgames.com/documentation/en-us/unreal-engine/unreal-engine-build-tool-target-reference)、[Graviton4 提交](https://github.com/EpicGames/UnrealEngine/commit/7d9b8ff76e1ce50813d57daa2f808dffa1eb42b9)

数据布局则决定访存形态。若热点每次只处理大量对象的同一个字段，连续字段数组与跨对象取字段可能给编译器完全不同的访存问题；LLVM 的合法性、别名和代价判断说明，数据组织会影响是否值得向量化。但 `MinArm64CpuTarget` 的已读实现只有配置传递和参数分派，并不负责把项目对象布局重构为数组布局。是否值得改结构，须先拿到真实热点与访问模式证据。[LLVM 向量化文档](https://releases.llvm.org/20.1.0/docs/Vectorizers.html)、[UE 参数分派](https://github.com/EpicGames/UnrealEngine/blob/16d75d84714512edfb744e1fd0a59e9c74d57873/Engine/Source/Programs/UnrealBuildTool/Platform/Clang/ClangToolChain.cs#L986)

这几种手段可以配合，但百分比不能简单相加。LTO 可能暴露一个可内联的调用，内联后才能识别向量循环；PGO 又可能改变内联取舍。需要分别测试组合，才知道增量与相互影响。

## 9. 公开数据到底证明了多少

以下均是官方公开测试，不是本项目实测。每行只在原文明确的比较范围内有效，不把更换 CPU、编译器或库版本的总收益归因于 UE 5.8 的单一参数。

| 案例 | 原文可核验的对照与结果 | 可以说明什么 | 不能说明什么 |
| --- | --- | --- | --- |
| AWS UE Lyra，2024-08-30 | 同为 `r8g.2xlarge`，default→opt；Windows 客户端 FPS 35.23→37.2，计算得 +5.59%；Server CPU 76.01%→75.50%，下降 0.51 个百分点 | 作者的优化构建在该场景出现改善 | 未公开完整 flags、编译器和 UE 补丁版本；不能归因于 UE 5.8 或单个 `-mcpu` |
| LLVM 18 循环识别 | SPEC `557.xz_r`，V2 约 +5%；V1 +6%～7% | 某类字节比较循环转 SVE 的公开效果 | 未披露完整可复现实验配置；不是 UE 全程序结果 |
| N1 上的 LSE | 同一 `m6g.16xlarge`、Ubuntu Focal；JDK 11.0.8 启/禁 LSE 吞吐 +11%，11.0.10 为 +2% | 原子指令与数据布局会共同影响收益 | 不是 G4 新增能力，也不是 UE 的原子热点收益 |
| x265 编译器对照 | C8g，Ubuntu 24.04 包的 Clang 18 对 GCC 13，平均 +11% | 编译器选择有实际影响 | 编译器版本和实现均变化，不能视为 CPU target A/B |
| x265 SVE2 专门内核 | `saoCuStatsE0`，相对 C 基线：NEON 2.7 倍、SVE2 3.2 倍；两者换算 +18.52% 吞吐 | 匹配算法的专门 SVE2 实现有效 | 不是整个编码器提速 3.2 倍，也不是自动向量化保证 |

表格来源依次为 [AWS UE Lyra 测试](https://aws.amazon.com/cn/blogs/china/using-graviton-4-to-build-ue5-dedicated-server-for-the-ultimate-cost-effectiveness/)、[Arm LLVM 18](https://developer.arm.com/community/arm-community-blogs/b/tools-software-ides-blog/posts/p1-whats-new-in-llvm-18)、[Arm N1 Java](https://developer.arm.com/community/arm-community-blogs/b/architectures-and-processors-blog/posts/java-performance-on-neoverse-n1)、[AWS 视频编码优化](https://aws.amazon.com/blogs/opensource/video-encoding-on-graviton-in-2025/)。换算百分比由表内数值计算。

UE 那组数据尤其需要按测量对象阅读。作者使用 AI bot 与 headless client 压测、单核亲和性限制，统计 15 分钟 CPU 均值；FPS 来自 Windows 客户端的 `stat fps`，不能当作 Dedicated Server 的 tick 时间。其“空闲 CPU + FPS”评分也不是具有统一量纲的容量指标，不宜据此推导每核可部署多少实例。文章概括的“10%～25%”不等于其 G4 default→opt 那一行的 FPS 增幅。[AWS UE 测试方法与表格](https://aws.amazon.com/cn/blogs/china/using-graviton-4-to-build-ue5-dedicated-server-for-the-ultimate-cost-effectiveness/)

此外，内核倍数必然受到占比限制。仅作数学示例：若一个热点占总耗时 20%，该热点加速 2 倍，其余工作完全不变，总加速比为 `1 / (0.8 + 0.2 / 2) ≈ 1.111`，即吞吐上限约提高 11.1%、总耗时下降 10%。这不是项目预测，而是说明为什么必须先确定热点占比。

## 10. 兼容性与生效范围

`MinArm64CpuTarget` 声明的是最低 CPU 能力。Graviton4 产物允许包含旧 CPU 不支持的指令，不应作为 Graviton2/3 的通用部署包；GravitonSVE 的代码注释面向 Graviton3/4，明确排除没有 SVE 的 Graviton2。注释对未来 CPU 的设计意图，也不能替代实际兼容测试。[UE 枚举与兼容说明](https://github.com/EpicGames/UnrealEngine/blob/16d75d84714512edfb744e1fd0a59e9c74d57873/Engine/Source/Programs/UnrealBuildTool/System/CppCompileEnvironment.cs#L167)

选择部署目标时，至少要分别检查：应用重编译范围、第三方原生库、系统库与运行时路径。CPU 参数不会追溯改写已经生成的机器码。混合 G3/G4 集群可以评估公共 SVE 产物，固定 G4 集群则值得测试专用构建；这属于待验证方案，不是本文已经验收的部署结果。

本项目架构文档记录了 TypeScript 与 Puerts，但本文没有读取其具体运行时后端配置。若其中存在 V8 JIT 生成代码的路径，C++ 构建参数本身不能证明这部分 JavaScript 机器码也使用相同目标；V8 有自己的编译流水线。项目实际覆盖范围仍未验证。[项目架构规则](../../.trae/rules/project-architecture.md)、[V8 Maglev 编译流水线](https://v8.dev/blog/maglev)

## 11. 如何在项目中证明收益：先归因，再测试容量

以下是后续实验方案，尚未执行。

### 11.1 先确认产物，再比较性能

第一步固定 UE 提交、Clang/SDK、构建类型和依赖版本。检查日志中的 `Targeted minimum ARM64 CPU architecture: Graviton4`，再查看实际 C++ response file 是否有 `-mcpu=neoverse-v2+crypto`。日志证明规则被读到，response file 才对应实际编译动作。[LinuxToolChain.cs:67](https://github.com/EpicGames/UnrealEngine/blob/16d75d84714512edfb744e1fd0a59e9c74d57873/Engine/Source/Programs/UnrealBuildTool/Platform/Linux/LinuxToolChain.cs#L67)

第二步选取真实热点，比较各构建的反汇编与优化诊断。需要回答：是否出现新的向量路径；LSE 是直接指令还是 helper；循环是否仍受别名或控制流限制；目标函数是否其实来自未重编译的库。可以对相关编译动作使用以下 LLVM 诊断能力，而不把“指令出现了”当作性能验收：[LLVM 20 诊断选项](https://releases.llvm.org/20.1.0/docs/Vectorizers.html)

```text
-Rpass=loop-vectorize
-Rpass-missed=loop-vectorize
-Rpass-analysis=loop-vectorize
-fsave-optimization-record
```

这些是 Clang 诊断参数，不是本文已验证的 UBT 命令行入口；落地时应先确认工程如何向目标编译动作传参。

### 11.2 用两阶段矩阵拆开 CPU 目标与 PGO/LTO

所有首阶段产物均在同一 Graviton4 机器运行，保持场景、服务器配置、CPU 亲和性、优化等级、LTO/PGO 状态等一致。

| 阶段 | 构建组合 | 要回答的问题 |
| --- | --- | --- |
| CPU 目标 | Default、Graviton2、GravitonSVE、Graviton4 | 默认→明确 ISA 基线→公共 SVE→V2 专用目标，各自增量是多少 |
| LTO | SVE / G4 分别关闭、启用同一种 LTO | 跨模块优化是否有效，是否与 CPU 目标相互影响 |
| PGO | SVE / G4 分别不使用、使用同一代表性训练流程 | 热路径信息的收益是否独立、训练是否覆盖关键场景 |
| 组合 | SVE / G4 + LTO + PGO | 最终组合是否仍有收益，是否存在回退 |

四个 CPU 目标并不是每一步只改变一个微观因素，尤其 SVE→G4 同时改变 ISA 与调优；该矩阵可以测目标整体增量，不能单独隔离 SVE2 的贡献。如需更细归因，应对已确认热点设计受控的小实验，并逐条记录实际 flags。

### 11.3 以 Server 延迟和达标容量验收

先在固定负载下测 Dedicated Server 自身的 tick/关键线程时间，记录 p50、p95、p99，必要时加 p99.9；再在相同延迟目标下增加负载或实例数。客户端 FPS 可作体验关联指标，但不替代 Server 指标。Unreal Insights 支持 CPU、frame、bookmark 等 trace 通道，可用于定位线程时间；采样配置要一致，并对最终候选进行相同条件的低干扰复测。[Unreal Insights 参考](https://dev.epicgames.com/documentation/unreal-engine/unreal-insights-reference-in-unreal-engine-5?lang=en-US)

每组记录原始时间序列、负载数量、CPU 使用率、内存、错误及超时；在采集能力允许时加入 cycles、instructions、分支和缓存缺失信息。轮换 A/B 顺序并重复运行，报告分布和离散程度。只观察平均 CPU 下降，无法判断尾部延迟或容量是否改善。

结果统一用明确分母表达：吞吐提升为 `新吞吐 / 旧吞吐 - 1`；耗时下降为 `1 - 新耗时 / 旧耗时`；CPU 利用率差值写“百分点”。PGO/LTO 本次没有找到可直接归因到 UE G4 的公开 A/B，因此不为项目预填预计收益。

## 12. 结论的证据等级

| 等级 | 本文已经支持的结论 |
| --- | --- |
| 官方源码已确认 | UE 5.8 新增 G4/SVE 目标；G4 输出 `-mcpu=neoverse-v2+crypto`；配置经过 UBT 编译环境进入 Clang ARM64 分支 |
| 官方机制有依据 | CPU 特性影响合法指令，调度/代价模型影响选择；向量化、LSE、PGO、LTO 各有触发条件 |
| 官方公开他测 | Lyra、xz、N1 Java、x265 的表内结果；只适用于各自测试范围 |
| 待本项目验证 | Linux ARM64 构建与依赖覆盖、实际热点指令、运行兼容性、tick 分布、可承载容量及成本收益 |

因此，UE 5.8 的确定价值是让 V2 专用编译目标成为正式 UBT 配置；性能价值则取决于热点能否利用新指令或更好的调优，以及这些热点占总负载的比例。下一步最有信息量的工作，是同一 G4 环境中的 CPU 目标对照、热点产物检查和 Server 延迟测试，而不是给所有 ARM 优化预设一个统一提速百分比。

附录：[UE 5.8 Graviton4 编译优化实现核验](UE5.8-Graviton4-Compiler-Optimization-20260908.md)。其中保留固定源码链接、引入提交、完整参数映射与已读调用链。Epic 源码链接需具备对应 GitHub 仓库访问权限。
