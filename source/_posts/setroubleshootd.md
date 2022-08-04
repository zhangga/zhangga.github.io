---
title: setroubleshootd引起的CPU高负载问题
date: 2022-08-04 14:48:53
tags:
  - 笔记
id: setroubleshootd
categories:
  - 笔记
---

## 记一次setroubleshootd进程引起的CPU高负载问题

![20220804145148-hCCDzh](https://raw.githubusercontent.com/zhangga/gitment-comments/master/uPic/2022-08/20220804145148-hCCDzh.jpg)

上图可以看到CPU和内存在机器上都不正常

`$ top`查看具体进程为`setroubleshootd`

继续通过指令查看：`tail -f  /var/log/audit/audit.log`

输出如下：

```
type=SYSCALL msg=audit(1659596208.000:3732435): arch=c000003e syscall=4 success=no exit=-13 a0=7fd01c268280 a1=7fd01c267fc0 a2=7fd01c267fc0 a3=0 items=0 ppid=1 pid=75904 auid=4294967295 uid=986 gid=980 euid=986 suid=986 fsuid=986 egid=980 sgid=980 fsgid=980 tty=(none) ses=4294967295 comm="ftdc" exe="/usr/bin/mongod" subj=system_u:system_r:mongod_t:s0 key=(null)
type=PROCTITLE msg=audit(1659596208.000:3732435): proctitle=2F7573722F62696E2F6D6F6E676F64002D66002F6574632F6D6F6E676F642E636F6E66
type=AVC msg=audit(1659596208.000:3732436): avc:  denied  { getattr } for  pid=75904 comm="ftdc" path="/sys/fs/fuse/connections" dev="fusectl" ino=1 scontext=system_u:system_r:mongod_t:s0 tcontext=system_u:object_r:fusefs_t:s0 tclass=dir permissive=0
```

可以看到pid，并且是mongodb引起的。

继续查看mongodb的日志：`tail -f /var/log/messages`

输出如下：

```
**************************#012#012If you believe that mongod should be allowed getattr access on the cgroup directory by default.#012Then you should report this as a bug.#012You can generate a local policy module to allow this access.#012Do#012allow this access for now by executing:#012# ausearch -c 'ftdc' --raw | audit2allow -M my-ftdc#012# semodule -i my-ftdc.pp#012
Aug  3 23:58:48 localhost setroubleshoot: failed to retrieve rpm info for /sys/fs/cgroup
Aug  3 23:58:48 localhost setroubleshoot: SELinux is preventing /usr/bin/mongod from search access on the directory /sys/fs/cgroup. For complete SELinux messages run: sealert -l 8df77a62-a31a-4213-8d52-f65ae3ffce6f
Aug  3 23:58:48 localhost python: SELinux is preventing /usr/bin/mongod from search access on the directory /sys/fs/cgroup.#012#012*****  Plugin catchall (100. confidence) suggests   
```

上面日志中可以看到原因是：`/usr/bin/mongod from search access on the directory /sys/fs/cgroup`

并且提示了可以执行命令：`sealert -l 8df77a62-a31a-4213-8d52-f65ae3ffce6f` 查看完整信息。

如下：

```
[root@vmcommon fs]# sealert -l 8df77a62-a31a-4213-8d52-f65ae3ffce6f

(setroubleshoot:123729): Gtk-WARNING **: 15:02:31.126: Locale not supported by C library.
	Using the fallback 'C' locale.
SELinux is preventing /usr/bin/mongod from search access on the directory /sys/fs/cgroup.

*****  Plugin catchall (100. confidence) suggests   **************************

If you believe that mongod should be allowed search access on the cgroup directory by default.
Then you should report this as a bug.
You can generate a local policy module to allow this access.
Do
allow this access for now by executing:
# ausearch -c 'mongod' --raw | audit2allow -M my-mongod
# semodule -i my-mongod.pp


Additional Information:
Source Context                system_u:system_r:mongod_t:s0
Target Context                system_u:object_r:cgroup_t:s0
Target Objects                /sys/fs/cgroup [ dir ]
Source                        mongod
Source Path                   /usr/bin/mongod
Port                          <Unknown>
Host                          localhost.localdomain
Source RPM Packages           mongodb-org-server-6.0.0-1.el7.x86_64
Target RPM Packages
Policy RPM                    selinux-policy-3.13.1-268.el7.noarch
Selinux Enabled               True
Policy Type                   targeted
Enforcing Mode                Enforcing
Host Name                     vmcommon
Platform                      Linux vmcommon 3.10.0-1160.el7.x86_64 #1 SMP Mon
                              Oct 19 16:18:59 UTC 2020 x86_64 x86_64
Alert Count                   184449
First Seen                    2022-08-02 11:11:38 CST
Last Seen                     2022-08-04 14:52:59 CST
Local ID                      8df77a62-a31a-4213-8d52-f65ae3ffce6f

Raw Audit Messages
type=AVC msg=audit(1659595979.0:3727845): avc:  denied  { search } for  pid=75904 comm="ftdc" name="/" dev="tmpfs" ino=1164 scontext=system_u:system_r:mongod_t:s0 tcontext=system_u:object_r:cgroup_t:s0 tclass=dir permissive=0


type=SYSCALL msg=audit(1659595979.0:3727845): arch=x86_64 syscall=statfs success=no exit=EACCES a0=5567cc31f9a0 a1=7fd01c267f40 a2=7fd01c2681a0 a3=0 items=0 ppid=1 pid=75904 auid=4294967295 uid=986 gid=980 euid=986 suid=986 fsuid=986 egid=980 sgid=980 fsgid=980 tty=(none) ses=4294967295 comm=ftdc exe=/usr/bin/mongod subj=system_u:system_r:mongod_t:s0 key=(null)

Hash: mongod,mongod_t,cgroup_t,dir,search
```

* 具体原因是因为安装的MongoDB 6版本需要的SELinux的问题，具体可以查看官网文档：

[configure-selinux](https://www.mongodb.com/docs/manual/tutorial/install-mongodb-on-red-hat/#configure-selinux)

### 还有一种情况需要注意

之前mongodb启动进程的文件`/tmp/mongodb-27017.sock`权限不是用户mongod的，比如：

```
$ ll /tmp/
total 824
drwxr-xr-x. 2 root  root      18 Aug  1 21:33 hsperfdata_root
-rwx------. 1 root  root     836 Aug  1 21:36 ks-script-0MAoJL
-rwx------. 1 root  root    1237 Aug  1 21:36 ks-script-EGB51o
srwx------. 1 root  root       0 Aug  4 15:44 mongodb-27017.sock
```

需要把`/tmp/mongodb-27017.sock`这个文件删除后再尝试启动mongo
