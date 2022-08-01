---
title: Linux常用命令
date: 2021-12-14 14:47:24
tags:
  - 笔记
id: linux-note
categories:
  - 笔记
---

#### Linux查看物理CPU个数、核数、逻辑CPU个数

```
# 总核数 = 物理CPU个数 X 每颗物理CPU的核数 
# 总逻辑CPU数 = 物理CPU个数 X 每颗物理CPU的核数 X 超线程数

# 查看物理CPU个数
cat /proc/cpuinfo| grep "physical id"| sort| uniq| wc -l

# 查看每个物理CPU中core的个数(即核数)
cat /proc/cpuinfo| grep "cpu cores"| uniq

# 查看逻辑CPU的个数
cat /proc/cpuinfo| grep "processor"| wc -l
```

#### 查看CPU信息（型号）

```
cat /proc/cpuinfo | grep name | cut -f2 -d: | uniq -c
```

#### 查看内存信息

```
# cat /proc/meminfo
```

#### 如何查看Linux 内核

```
uname -a
cat /proc/version
```

#### 查看机器型号（机器硬件型号）

```
dmidecode | grep "Product Name"
dmidecode
```

#### 如何查看linux 系统版本

```
cat /etc/redhat-release
lsb_release -a
cat /etc/issue
```

#### 如何查看linux系统和CPU型号，类型和大小

```
cat /proc/cpuinfo

关于CPU的核心参数说明：
· processor：指明第几个CPU处理器
· cpu cores：指明每个处理器的核心数
```

#### 如何查看linux 系统内存大小的信息，可以查看总内存，剩余内存，可使用内存等信息

```
cat /proc/meminfo
```

#### 使用taskset命令让进程运行在指定CPU上

```
执行以下命令，指定进程运行在第一个CPU（CPU0）上。
[root@VM_32_4_centos ~]# taskset -c 0 ./test.sh&

执行以下命令，获取进程状态（以下操作以进程test.sh为例，对应的pid为19155）
[root@VM_32_4_centos ~]# ps aux|grep test.sh
root     19155  0.0  0.0 113120  1204 pts/3    S+   15:26   0:00 /bin/bash ./test.sh

执行以下命令，查看进程当前运行在哪个CPU上。
[root@VM_32_4_centos ~]# taskset -p 19155
pid 19155's current affinity mask: 1
```

#### 防火墙

```shell
查看防火墙开放端口
[root@VM_32_4_centos ~]# firewall-cmd --list-ports
5000/udp 80/tcp 5044/tcp 8080/tcp 9200/tcp 5043/tcp 9100/tcp 10050/tcp 5601/tcp 5000/tcp

给防火墙添加3000端口
[root@VM_32_4_centos ~]# firewall-cmd --add-port=3000/tcp --zone=public --permanent
success

端口生效
[root@VM_32_4_centos ~]# firewall-cmd --reload
success
```

