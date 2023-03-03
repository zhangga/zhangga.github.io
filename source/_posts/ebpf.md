---
title: [转载]ebpf的使用
date: 2023-03-03 17:23:56
tags:
  - 服务器
id: ebpf
categories:
  - 笔记
---

原文地址：https://tonybai.com/2022/07/19/develop-ebpf-program-in-go/

# 使用Go语言开发eBPF程序

- 七月 19, 2022
- [0 条评论](https://tonybai.com/2022/07/19/develop-ebpf-program-in-go/#respond)

![img](https://tonybai.com/wp-content/uploads/develop-ebpf-program-in-go-1.png)

[本文永久链接](https://tonybai.com/2022/07/19/develop-ebpf-program-in-go) – https://tonybai.com/2022/07/19/develop-ebpf-program-in-go

在前面的[《使用C语言从头开发一个Hello World级别的eBPF程序》](https://tonybai.com/2022/07/05/develop-hello-world-ebpf-program-in-c-from-scratch)一文中，我们详细说明了如何基于C语言和libbpf库从头开发一个eBPF程序(包括其用户态部分)。那篇文章是后续有关eBPF程序开发文章的基础，因为到目前为止，无论eBPF程序的用户态部分用什么语言开发，运行于内核态的eBPF程序内核态部分还是必须由C语言开发的。这样一来，其他编程语言只能拼一下如何让eBPF程序的用户态部分的开发更为简单了，Go语言也不例外。

在Go社区中，目前最为活跃的用于开发eBPF用户态部分的Go eBPF包莫过于cilium项目开源的[cilium/ebpf](https://github.com/cilium/ebpf/)，cilium项目背后的[Isovalent公司](https://isovalent.com/)也是eBPF技术在云原生领域应用的主要推手之一。

本文我们就来说说**基于cilium/ebpf开发eBPF程序的套路**！

### 一. 探索cilium/ebpf项目示例

cilium/ebpf项目借鉴了[libbpf-boostrap](https://github.com/libbpf/libbpf-bootstrap)的思路，通过代码生成与bpf程序内嵌的方式构建eBPF程序用户态部分。为了搞清楚基于cilium/ebpf开发ebpf程序的套路，我们先来探索一下cilium/ebpf项目提供的示例代码。

我们首先来下载和看看ebpf的示例的结构。

- 下载cilium/ebpf项目

```
$ git clone https://github.com/cilium/ebpf.git
Cloning into 'ebpf'...
remote: Enumerating objects: 7054, done.
remote: Counting objects: 100% (183/183), done.
remote: Compressing objects: 100% (112/112), done.
remote: Total 7054 (delta 91), reused 124 (delta 69), pack-reused 6871
Receiving objects: 100% (7054/7054), 10.91 MiB | 265.00 KiB/s, done.
Resolving deltas: 100% (4871/4871), done.
```

- 探索ebpf项目示例代码结构

ebpf示例在examples目录下，我们以tracepoint_in_c为例看看其组织形式：

```
$tree tracepoint_in_c
tracepoint_in_c
├── bpf_bpfeb.go
├── bpf_bpfeb.o
├── bpf_bpfel.go
├── bpf_bpfel.o
├── main.go
└── tracepoint.c

0 directories, 6 files
```

根据经验判断，这里面的tracepoint.c对应的是ebpf程序内核态部分，而main.go和bpf_bpfel.go/bpf_bpfeb.go则是ebpf程序用户态部分，至于bpf_bpfeb.o/bpf_bpfel.o应该是某种中间目标文件。通过readelf -a bpf_bpfeb.o查看该中间文件：

```
$readelf -a bpf_bpfeb.o
ELF Header:
  Magic:   7f 45 4c 46 02 02 01 00 00 00 00 00 00 00 00 00
  Class:                             ELF64
  Data:                              2's complement, big endian
  Version:                           1 (current)
  OS/ABI:                            UNIX - System V
  ABI Version:                       0
  Type:                              REL (Relocatable file)
  Machine:                           Linux BPF
  Version:                           0x1
  Entry point address:               0x0
  Start of program headers:          0 (bytes into file)
  Start of section headers:          1968 (bytes into file)
  Flags:                             0x0
  Size of this header:               64 (bytes)
  Size of program headers:           0 (bytes)
  Number of program headers:         0
  Size of section headers:           64 (bytes)
  Number of section headers:         13
  Section header string table index: 1
... ...
```

我们看到这是一个内含linux bpf字节码的elf文件(Machine: Linux BPF)。

阅读了cilium/ebpf的相关文档，我搞明白了这几个文件的关系，用下面示意图呈现给大家：

![img](https://tonybai.com/wp-content/uploads/develop-ebpf-program-in-go-2.png)

ebpf程序的源码文件(比如图中tracepoint.c)经过bpf2go(cilium/ebpf提供的一个代码生成工具)被编译(bpf2go调用clang)为ebpf字节码文件bpf_bpfeb.o(大端)和bpf_bpfel.o(小端)，然后bpf2go会基于ebpf字节码文件生成bpf_bpfeb.go或bpf_bpfel.go，ebpf程序的字节码会以二进制数据的形式内嵌到这两个go源文件中，以bpf_bpfel.go为例，我们可以在其代码中找到下面内容(利用[go:embed特性](https://tonybai.com/2021/02/25/some-changes-in-go-1-16))：

```
//go:embed bpf_bpfel.o
var _BpfBytes []byte
```

main.go则是ebpf程序用户态部分的主程序，将main.go与bpf_bpfeb.go或bpf_bpfel.go之一一起编译就形成了ebpf程序。

有了对cilium/ebpf项目示例的初步探索后，我们来构建ebpf示例代码。

### 二. 构建ebpf示例代码

cilium/ebpf提供了便利的构建脚本，我们只需在ebpf/examples下面执行”make -C ..”即可进行示例代码的构建。

make构建过程会基于quay.io/cilium/ebpf-builder镜像启动构建容器，不过在国内的童鞋需要像下面一样对Makefile内容做一丁点修改，增加GOPROXY环境变量，否则wall外的go module无法拉取：

```
$git diff ../Makefile
diff --git a/Makefile b/Makefile
index 3a1da88..d7b1712 100644
--- a/Makefile
+++ b/Makefile
@@ -48,6 +48,7 @@ container-all:
        ${CONTAINER_ENGINE} run --rm ${CONTAINER_RUN_ARGS} \
                -v "${REPODIR}":/ebpf -w /ebpf --env MAKEFLAGS \
                --env CFLAGS="-fdebug-prefix-map=/ebpf=." \
+               --env GOPROXY="https://goproxy.io" \
                --env HOME="/tmp" \
                "${IMAGE}:${VERSION}" \
                $(MAKE) all
```

这之后再执行构建就会顺利得到我们所要的结果：

```
$ cd examples
$ make -C ..
make: Entering directory '/root/go/src/github.com/cilium/ebpf'
docker run --rm  --user "0:0" \
    -v "/root/go/src/github.com/cilium/ebpf":/ebpf -w /ebpf --env MAKEFLAGS \
    --env CFLAGS="-fdebug-prefix-map=/ebpf=." \
    --env GOPROXY="https://goproxy.io" \
    --env HOME="/tmp" \
    "quay.io/cilium/ebpf-builder:1648566014" \
    make all
make: Entering directory '/ebpf'
find . -type f -name "*.c" | xargs clang-format -i
go generate ./cmd/bpf2go/test
go: downloading golang.org/x/sys v0.0.0-20210906170528-6f6e22806c34
Compiled /ebpf/cmd/bpf2go/test/test_bpfel.o
Stripped /ebpf/cmd/bpf2go/test/test_bpfel.o
Wrote /ebpf/cmd/bpf2go/test/test_bpfel.go
Compiled /ebpf/cmd/bpf2go/test/test_bpfeb.o
Stripped /ebpf/cmd/bpf2go/test/test_bpfeb.o
Wrote /ebpf/cmd/bpf2go/test/test_bpfeb.go
go generate ./internal/sys
enum AdjRoomMode
enum AttachType
enum Cmd
enum FunctionId
enum HdrStartOff
enum LinkType
enum MapType
enum ProgType
enum RetCode
enum SkAction
enum StackBuildIdStatus
enum StatsType
enum XdpAction
struct BtfInfo
... ...
attr ProgRun
attr RawTracepointOpen
cd examples/ && go generate ./...
go: downloading github.com/cilium/ebpf v0.8.2-0.20220424153111-6da9518107a8
go: downloading golang.org/x/sys v0.0.0-20211001092434-39dca1131b70
Compiled /ebpf/examples/cgroup_skb/bpf_bpfel.o
Stripped /ebpf/examples/cgroup_skb/bpf_bpfel.o
Wrote /ebpf/examples/cgroup_skb/bpf_bpfel.go
Compiled /ebpf/examples/cgroup_skb/bpf_bpfeb.o
Stripped /ebpf/examples/cgroup_skb/bpf_bpfeb.o
Wrote /ebpf/examples/cgroup_skb/bpf_bpfeb.go
Compiled /ebpf/examples/fentry/bpf_bpfeb.o
Stripped /ebpf/examples/fentry/bpf_bpfeb.o
Wrote /ebpf/examples/fentry/bpf_bpfeb.go
Compiled /ebpf/examples/fentry/bpf_bpfel.o
Stripped /ebpf/examples/fentry/bpf_bpfel.o
Wrote /ebpf/examples/fentry/bpf_bpfel.go
Compiled /ebpf/examples/kprobe/bpf_bpfel.o
Stripped /ebpf/examples/kprobe/bpf_bpfel.o
Wrote /ebpf/examples/kprobe/bpf_bpfel.go
Stripped /ebpf/examples/uretprobe/bpf_bpfel_x86.o
... ...
Wrote /ebpf/examples/uretprobe/bpf_bpfel_x86.go
ln -srf testdata/loader-clang-14-el.elf testdata/loader-el.elf
ln -srf testdata/loader-clang-14-eb.elf testdata/loader-eb.elf
make: Leaving directory '/ebpf'
make: Leaving directory '/root/go/src/github.com/cilium/ebpf'
```

以uretprobe下面的ebpf为例，我们运行一下：

```
$go run -exec sudo uretprobe/*.go
2022/06/05 18:23:23 Listening for events..
```

打开一个新的terminal，然后在用户home目录下执行vi .bashrc。在上面的uretprobe程序的执行窗口我们能看到：

```
2022/06/05 18:24:34 Listening for events..
2022/06/05 18:24:42 /bin/bash:readline return value: vi .bashrc
```

这就表明uretprobe下面的ebpf程序如预期地执行了。

### 三. 使用cilium/ebpf为前文的Hello World eBPF程序开发用户态部分

有了对cilium/ebpf示例程序的初步了解，下面我们就来为前面的[《使用C语言从头开发一个Hello World级别的eBPF程序》](https://tonybai.com/2022/07/05/develop-hello-world-ebpf-program-in-c-from-scratch)一文中的那个helloworld ebpf程序开发用户态部分。

回顾一下那个hello world ebpf程序的C源码：

```
// github.com/bigwhite/experiments/tree/master/ebpf-examples/helloworld-go/helloworld.bpf.c
#include <linux/bpf.h>
#include <bpf/bpf_helpers.h>

SEC("tracepoint/syscalls/sys_enter_execve")

int bpf_prog(void *ctx) {
  char msg[] = "Hello, World!";
  bpf_printk("invoke bpf_prog: %s\n", msg);
  return 0;
}

char LICENSE[] SEC("license") = "Dual BSD/GPL";
```

当这个ebpf程序被加载到内核中后，每当execve这个系统调用被执行，该ebpf程序都会被调用一次，我们就会在/sys/kernel/debug/tracing/trace_pipe中看到对应的日志输出。

#### 1. 使用bpf2go将ebpf核心态程序转换为Go代码

根据我们在前面探索cilium/ebpf示例程序时所得到的“套路”，我们接下来第一个要做的就是将helloworld.bpf.c转换为Go代码文件，这一转换过程不可缺少的工具就是cilium/ebpf提供的bpf2go工具，我们先来安装一下该工具：

```
$go install github.com/cilium/ebpf/cmd/bpf2go@latest
```

接下来，我们可以直接使用bpf2go工具将helloworld.ebpf.c转换为对应的go源文件：

```
$GOPACKAGE=main bpf2go -cc clang-10 -cflags '-O2 -g -Wall -Werror' -target bpfel,bpfeb bpf helloworld.bpf.c -- -I /home/tonybai/test/ebpf/libbpf/include/uapi -I /usr/local/bpf/include -idirafter /usr/local/include -idirafter /usr/lib/llvm-10/lib/clang/10.0.0/include -idirafter /usr/include/x86_64-linux-gnu -idirafter /usr/include

Compiled /home/tonybai/go/src/github.com/bigwhite/experiments/ebpf-examples/helloworld-go/bpf_bpfel.o
Stripped /home/tonybai/go/src/github.com/bigwhite/experiments/ebpf-examples/helloworld-go/bpf_bpfel.o
Wrote /home/tonybai/go/src/github.com/bigwhite/experiments/ebpf-examples/helloworld-go/bpf_bpfel.go
Compiled /home/tonybai/go/src/github.com/bigwhite/experiments/ebpf-examples/helloworld-go/bpf_bpfeb.o
Stripped /home/tonybai/go/src/github.com/bigwhite/experiments/ebpf-examples/helloworld-go/bpf_bpfeb.o
Wrote /home/tonybai/go/src/github.com/bigwhite/experiments/ebpf-examples/helloworld-go/bpf_bpfeb.go
```

不过这里有一个问题，那就是bpf2go命令行后面的一系列提供给clang编译器的头文件引用路径参考了[《使用C语言从头开发一个Hello World级别的eBPF程序》](https://tonybai.com/2022/07/05/develop-hello-world-ebpf-program-in-c-from-scratch)一文中的Makefile。如果按照这些头文件路径来引用，虽然bpf2go转换可以成功，但是我们需要依赖并安装libbpf这个库，这显然不是我们想要的。

cilium/ebpf在examples中提供了一个headers目录，这个目录中包含了开发ebpf程序用户态部分所需的所有头文件，我们使用它作为我们的头文件引用路径。不过要想基于这个headers目录构建ebpf，我们需要将helloworld.bpf.c中的原头文件include语句由：

```
#include <linux/bpf.h>
#include <bpf/bpf_helpers.h>
```

改为：

```
#include "common.h"
```

接下来我们再来执行bpf2go工具进行转换：

```
$GOPACKAGE=main bpf2go -cc clang-10 -cflags '-O2 -g -Wall -Werror' -target bpfel,bpfeb bpf helloworld.bpf.c -- -I /home/tonybai/go/src/github.com/cilium/ebpf/examples/headers

Compiled /home/tonybai/go/src/github.com/bigwhite/experiments/ebpf-examples/helloworld-go/bpf_bpfel.o
Stripped /home/tonybai/go/src/github.com/bigwhite/experiments/ebpf-examples/helloworld-go/bpf_bpfel.o
Wrote /home/tonybai/go/src/github.com/bigwhite/experiments/ebpf-examples/helloworld-go/bpf_bpfel.go
Compiled /home/tonybai/go/src/github.com/bigwhite/experiments/ebpf-examples/helloworld-go/bpf_bpfeb.o
Stripped /home/tonybai/go/src/github.com/bigwhite/experiments/ebpf-examples/helloworld-go/bpf_bpfeb.o
Wrote /home/tonybai/go/src/github.com/bigwhite/experiments/ebpf-examples/helloworld-go/bpf_bpfeb.go
```

我们看到bpf2go顺利生成ebpf字节码与对应的Go源文件。

#### 2. 构建helloworld ebpf程序用户态部分

下面是参考cilium/ebpf示例而构建的helloword ebpf程序用户态部分的main.go源码：

```
// github.com/bigwhite/experiments/ebpf-examples/helloworld-go/main.go
package main

import (
    "log"
    "os"
    "os/signal"
    "syscall"

    "github.com/cilium/ebpf/link"
    "github.com/cilium/ebpf/rlimit"
)

func main() {
    stopper := make(chan os.Signal, 1)
    signal.Notify(stopper, os.Interrupt, syscall.SIGTERM)

    // Allow the current process to lock memory for eBPF resources.
    if err := rlimit.RemoveMemlock(); err != nil {
        log.Fatal(err)
    }

    // Load pre-compiled programs and maps into the kernel.
    objs := bpfObjects{}
    if err := loadBpfObjects(&objs, nil); err != nil {
        log.Fatalf("loading objects: %s", err)
    }
    defer objs.Close()

    //SEC("tracepoint/syscalls/sys_enter_execve")
    // attach to xxx
    kp, err := link.Tracepoint("syscalls", "sys_enter_execve", objs.BpfProg, nil)
    if err != nil {
        log.Fatalf("opening tracepoint: %s", err)
    }
    defer kp.Close()

    log.Printf("Successfully started! Please run \"sudo cat /sys/kernel/debug/tracing/trace_pipe\" to see output of the BPF programs\n")

    // Wait for a signal and close the perf reader,
    // which will interrupt rd.Read() and make the program exit.
    <-stopper
    log.Println("Received signal, exiting program..")
}
```

我们知道一个ebpf程序有几个关键组成：

- ebpf程序数据
- map：用于用户态与内核态的数据交互
- 挂接点(attach point)

根据[cilium/ebpf架构](https://github.com/cilium/ebpf/blob/master/ARCHITECTURE.md)的说明，ebpf包将前两部分抽象为了一个数据结构bpfObjects：

```
// github.com/bigwhite/experiments/ebpf-examples/helloworld-go/bpf_bpfel.go

// bpfObjects contains all objects after they have been loaded into the kernel.
//
// It can be passed to loadBpfObjects or ebpf.CollectionSpec.LoadAndAssign.
type bpfObjects struct {
    bpfPrograms
    bpfMaps
}
```

我们看到，main函数通过生成的loadBpfObjects函数将ebpf程序加载到内核，并填充bpfObjects结构，一旦加载bpf程序成功，后续我们便可以使用bpfObjects结构中的字段来完成其余操作，比如通过link包的函数将bpf程序与目标挂节点对接在一起(如文中的link.Tracepoint函数），这样挂接后，bpf才能在对应的事件发生后被回调执行。

下面编译执行一下该helloworld示例：

```
$go run -exec sudo main.go bpf_bpfel.go
[sudo] password for tonybai:
2022/06/05 14:12:40 Successfully started! Please run "sudo cat /sys/kernel/debug/tracing/trace_pipe" to see output of the BPF programs
```

之后新打开一个窗口，执行sudo cat /sys/kernel/debug/tracing/trace_pipe，当execve被调用时，我们就能看到类似下面的日志输出：

```
<...>-551077  [000] .... 6062226.208943: 0: invoke bpf_prog: Hello, World!
<...>-551077  [000] .... 6062226.209098: 0: invoke bpf_prog: Hello, World!
<...>-551079  [007] .... 6062226.215421: 0: invoke bpf_prog: Hello, World!
<...>-551079  [007] .... 6062226.215578: 0: invoke bpf_prog: Hello, World!
<...>-554756  [007] .... 6063476.785212: 0: invoke bpf_prog: Hello, World!
<...>-554756  [007] .... 6063476.785378: 0: invoke bpf_prog: Hello, World!
```

#### 3. 使用go generate来驱动bpf2go的转换

在生成代码方面，Go工具链原生提供了go generate工具，cilium/ebpf的examples中也是利用go generate来驱动bpf2go将bpf程序转换为Go源文件的，这里我们也来做一下改造。

首先我们在main.go的main函数上面增加一行go:generate指示语句：

```
// github.com/bigwhite/experiments/ebpf-examples/helloworld-go/main.go

// $BPF_CLANG, $BPF_CFLAGS and $BPF_HEADERS are set by the Makefile.
//go:generate bpf2go -cc $BPF_CLANG -cflags $BPF_CFLAGS -target bpfel,bpfeb bpf helloworld.bpf.c -- -I $BPF_HEADERS
func main() {
    stopper := make(chan os.Signal,  1)
    ... ...
}
```

这样当我们显式执行go generate语句时，go generate会扫描到该指示语句，并执行后面的命令。这里使用了几个变量，变量是定义在Makefile中的。当然如果你不想使用Makefile，也可以将变量替换为相应的值。这里我们使用Makefile，下面是Makefile的内容：

```
// github.com/bigwhite/experiments/ebpf-examples/helloworld-go/Makefile

CLANG ?= clang-10
CFLAGS ?= -O2 -g -Wall -Werror

LIBEBPF_TOP = /home/tonybai/go/src/github.com/cilium/ebpf
EXAMPLES_HEADERS = $(LIBEBPF_TOP)/examples/headers

all: generate

generate: export BPF_CLANG=$(CLANG)
generate: export BPF_CFLAGS=$(CFLAGS)
generate: export BPF_HEADERS=$(EXAMPLES_HEADERS)
generate:
    go generate ./...
```

有了该Makefile后，我们执行make命令便可以执行bpf2go对bpf程序的转换：

```
$make
go generate ./...
Compiled /home/tonybai/go/src/github.com/bigwhite/experiments/ebpf-examples/helloworld-go/bpf_bpfel.o
Stripped /home/tonybai/go/src/github.com/bigwhite/experiments/ebpf-examples/helloworld-go/bpf_bpfel.o
Wrote /home/tonybai/go/src/github.com/bigwhite/experiments/ebpf-examples/helloworld-go/bpf_bpfel.go
Compiled /home/tonybai/go/src/github.com/bigwhite/experiments/ebpf-examples/helloworld-go/bpf_bpfeb.o
Stripped /home/tonybai/go/src/github.com/bigwhite/experiments/ebpf-examples/helloworld-go/bpf_bpfeb.o
Wrote /home/tonybai/go/src/github.com/bigwhite/experiments/ebpf-examples/helloworld-go/bpf_bpfeb.go
```

### 四. 小结

本文我们讲解了如何基于cilium/ebpf包来开发ebpf的用户态部分。

ebpf借鉴了libbpf的思路，通过生成代码与数据内嵌的方式来构建ebpf的用户态部分。

ebpf提供了bpf2go工具，可以将bpf的C源码转换为相应的go源码。

ebpf将bpf程序抽象为bpfObjects，通过生成的loadBpfObjects完成bpf程序加载到内核的过程，然后利用ebpf库提供的诸如link之类的包实现ebpf与内核事件的关联。

ebpf包的玩法还有很多，这一篇仅仅是为了打好基础，在后续文章中，我们还会针对各种类型的bpf程序做进一步学习和说明。

本文代码可以在[这里](https://github.com/bigwhite/experiments/tree/master/ebpf-examples/helloworld-go)下载。

### 无. 参考资料

- [使用Go语言管理和分发ebpf程序](https://www.ebpf.top/post/ebpf_go/) – https://www.ebpf.top/post/ebpf_go/
- [A Pure Go eBPF library](https://lpc.events/event/4/contributions/449/attachments/239/529/A_pure_Go_eBPF_library.pdf) – https://lpc.events/event/4/contributions/449/attachments/239/529/A_pure_Go_eBPF_library.pdf
- [cilium ebpf library architecture](https://github.com/cilium/ebpf/blob/master/ARCHITECTURE.md) – https://github.com/cilium/ebpf/blob/master/ARCHITECTURE.md
