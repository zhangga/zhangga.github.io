---
title: 战场进程异常退出问题的排查
tags:
  - UE
id: container-oom-kill
categories:
  - 笔记
date: 2026-11-18 17:20:57
---

# 容器子进程突然退出时的 OOM 排查手册

遇到“业务中断、连接关闭、容器仍在运行”，先记下**退出时间和时区、原节点、原 Pod UID 或容器 ID、工作进程名**。最快的确认方法是查事发节点的内核日志，把 OOM 受害进程与这一次退出对上。容器内存实验放在取证之后，以免新实验改变待查的计数。

## 在事发节点按退出时间查受害进程

使用 Kubernetes 时，可从 Pod 取节点和容器 ID。若 Pod 已重建，请从当时的日志标签或监控记录取原实例信息。

```bash
NS='实际命名空间'
POD='事发 Pod 名'
kubectl -n "$NS" get pod "$POD" -o jsonpath='node={.spec.nodeName}{"  pod_uid="}{.metadata.uid}{"\n"}{range .status.containerStatuses[*]}{.name}{"  "}{.containerID}{"\n"}{end}'
```

在**原 Linux 节点**粘贴下面的命令，按提示输入一次退出的时间，带上 `UTC` 或原始时区偏移。命令自动查询前后各两分钟。多次退出可分别查询。

```bash
(
    printf '输入退出时间（YYYY-MM-DD HH:MM:SS UTC 或带数字时区偏移）> '
    IFS= read -r incident_time
    [ -n "$incident_time" ] || exit 1
    event_epoch=$(date -d "$incident_time" +%s) || exit 1
    sudo journalctl --utc --since "@$((event_epoch - 120))" \
        --until "@$((event_epoch + 120))" \
        -o short-iso-precise --no-pager _TRANSPORT=kernel |
        grep -Ei 'oom[-_]kill|out of memory|kill(ed)? process|oom_reaper'
)
```

| 查到的记录 | 如何判断 |
|---|---|
| `Killed process <宿主机PID> (<进程名>)` | 将时间、进程名与业务退出对齐，再用相邻 `oom-kill:` 记录的 `pid=` 和 `task_memcg=` 核对原 Pod 或容器。匹配后即可认定这次退出是内核 OOM kill。容器内 PID 和宿主机 PID 可能不同。 |
| `CONSTRAINT_MEMCG` 或 `global_oom` | 前者看 `oom_memcg=`，定位哪个内存 cgroup 触及限制。后者转查节点整体的内存和 swap。`task_memcg=` 标识受害进程所属组。 |
| 只有 `invoked oom-killer`、退出码 `137` 或连接关闭 | 还缺受害进程证据。`137` 与 `SIGKILL` 一致，手动或外部管理程序终止进程也可能得到相同退出码。 |

若 journal 已无该时段，可在集中日志平台查相同的 UTC 时间窗，也可以在节点的轮转归档里检索，再按归档使用的时区核对时间。

```sh
sudo zgrep -hiE 'oom[-_]kill|out of memory|kill(ed)? process|oom_reaper' \
    /var/log/kern.log* /var/log/messages* /var/log/syslog* 2>/dev/null
```

子进程单独退出时，主进程可以继续运行，容器的 `restartCount` 可以一直是零。若历史日志完整却查不到匹配的 OOM 受害进程，再查父进程回收的退出状态。正常返回时沿退出码查业务调用点，`SIGSEGV` 或 `SIGABRT` 查崩溃转储，单独的 `SIGKILL` 还应核对管理程序或节点上的终止记录。[Linux 内核 OOM 日志实现](https://github.com/torvalds/linux/blob/master/mm/oom_kill.c)

## 只有容器权限时，读取 OOM 计数

在原业务容器中执行以下**只读**命令。它从当前 shell 所属的内存 cgroup 查找计数文件，支持常见的 v1、v2 和容器私有挂载。查到后可在同一 shell 重复运行 `cat "$OOM_FILE"`，比较下一次退出前后的读数。

```sh
v1_rel=$(awk -F: '$2 ~ /(^|,)memory(,|$)/ {print $3; exit}' /proc/self/cgroup)
v2_rel=$(awk -F: '$1 == "0" {print $3; exit}' /proc/self/cgroup)
OOM_FILE=''
for f in "/sys/fs/cgroup/memory${v1_rel%/}/memory.oom_control" \
         "/sys/fs/cgroup${v2_rel%/}/memory.events" \
         /sys/fs/cgroup/memory/memory.oom_control /sys/fs/cgroup/memory.events; do
    [ -r "$f" ] || continue
    grep -qx "$$" "${f%/*}/cgroup.procs" 2>/dev/null || continue
    OOM_FILE=$f
    break
done
if [ -n "$OOM_FILE" ]; then
    printf '计数文件 %s\n' "$OOM_FILE"
    cat "$OOM_FILE"
else
    echo '当前挂载未找到本容器的内存计数文件，请查原节点。'
fi
```

关注 `oom_kill` 在退出前后的**增量**。增加 1 表示该计数范围内有一个进程被内核 OOM 杀掉。共享 cgroup 时，还需匹配具体进程。`oom`、`max` 或 v1 的 `memory.failcnt` 增长只能说明出现过分配压力或触限。容器重建后的计数无法追溯旧实例。[cgroup v1 计数说明](https://docs.kernel.org/admin-guide/cgroup-v1/memory.html#oom-control) · [cgroup v2 计数说明](https://docs.kernel.org/admin-guide/cgroup-v2.html)

## 三次子进程退出的排查经过

同一服务的三个工作子进程先后退出。前两次业务日志都截在相似的数据更新操作附近，但其中一次在更早时成功执行过同样的操作。第三个进程在启动数秒后退出，日志里还没出现该操作。

管理进程的会话关闭与父进程回收子进程记录在同一毫秒。管理进程会在会话关闭后释放实例，其读超时分支会继续等待读取。已有记录能确认子进程退出，也解释了为什么会看到连接关闭，但无法把三次退出归因为网络超时或同一行业务代码。

随后用内存分配实验核对了退出码和内核计数。**实验窗口内确实发生了一次 OOM kill。** 历史三次退出仍缺各自的内核受害进程记录，只能把 OOM 列为优先核查的原因。

## 隔离实验　完整的 `test.py` 和容器执行命令

原始终端记录包含调用命令和输出，未包含 `test.py` 正文。下面的脚本按当时的行为重建。单个 Python 进程申请固定的 2 GiB 匿名内存并逐页写入，让内核实际为这些页面分配内存。脚本写完即退出。

取证完成后，选择独立的 Linux 测试容器进行复现，例如将内存上限设为 256 MiB 并禁用 swap。需要 `python3`、`sh`、`awk`、`grep` 和 `mktemp`。在容器里粘贴下面**一整段**即可。它在临时目录写入 `test.py`，沿用现场的前后两次 `awk` 读数和退出码采集命令，并为不同的 cgroup 挂载增加了路径和读数校验。现场使用的文件是 `/sys/fs/cgroup/memory/memory.oom_control`。

```sh
(
    set -eu
    work_dir=$(mktemp -d)
    cd "$work_dir"
    cat > test.py <<'PY'
import mmap
import os

size_bytes = 2 * 1024**3
print(f"开始分配 2 GiB，PID = {os.getpid()}", flush=True)

with mmap.mmap(-1, size_bytes, flags=mmap.MAP_PRIVATE | mmap.MAP_ANONYMOUS) as pages:
    for offset in range(0, size_bytes, mmap.PAGESIZE):
        pages[offset] = 1

print("已写入 2 GiB，正常退出。", flush=True)
PY

    # 优先使用现场的 cgroup v1 文件，再兼容 v2 和完整层级挂载。
    oom_file=/sys/fs/cgroup/memory/memory.oom_control
    if ! grep -qx "$$" "${oom_file%/*}/cgroup.procs" 2>/dev/null || [ ! -r "$oom_file" ]; then
        v1_rel=$(awk -F: '$2 ~ /(^|,)memory(,|$)/ {print $3; exit}' /proc/self/cgroup)
        v2_rel=$(awk -F: '$1 == "0" {print $3; exit}' /proc/self/cgroup)
        oom_file=''
        for f in "/sys/fs/cgroup/memory${v1_rel%/}/memory.oom_control" \
                 "/sys/fs/cgroup${v2_rel%/}/memory.events" /sys/fs/cgroup/memory.events; do
            [ -r "$f" ] || continue
            grep -qx "$$" "${f%/*}/cgroup.procs" 2>/dev/null || continue
            oom_file=$f
            break
        done
    fi
    if [ -z "$oom_file" ]; then
        echo '无法读取本测试容器的 OOM 计数，停止实验。' >&2
        exit 1
    fi
    oom_before=$(awk '$1=="oom_kill" {print $2}' "$oom_file")
    [ -n "$oom_before" ] || { echo '缺少起始 oom_kill 读数，停止实验。' >&2; exit 1; }

    test_exit_code=0
    python3 -u test.py || test_exit_code=$?

    oom_after=$(awk '$1=="oom_kill" {print $2}' "$oom_file")
    [ -n "$oom_after" ] || { echo '缺少结束读数，无法计算增量。' >&2; exit 1; }
    printf '\n退出码：%s\nOOM计数：%s -> %s\n新增OOM kill：%s\n' \
        "$test_exit_code" "$oom_before" "$oom_after" \
        "$((oom_after - oom_before))"
)
```

### 现场实测输出（PID 已脱敏）

```text
开始分配 2 GiB，PID = <已脱敏>

退出码：137
OOM计数：30 -> 31
新增OOM kill：1
```

`oom_kill` 从 30 增至 31，加上 Python 退出码 137，强烈支持该次测试进程被 OOM 杀掉。先前的 30 是历史累计值，不包含受害进程身份。

复测时若退出码为 0 且增量为 0，说明该轮脚本完成了分配。若整个测试容器被成组杀掉，测量 shell 可能来不及打印结束计数，此时应在原节点查对应时间的受害进程记录。
