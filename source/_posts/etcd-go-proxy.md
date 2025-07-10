---
title: etcd go客户端无法正常连接
tags:
  - UE
id: etcd_go_proxy
categories:
  - 笔记
date: 2025-07-10 21:52:02
---

# 问题描述
golang项目在Windows下开发没问题，换到Linux下发现etcd无法连接。
# 问题排查
1. 排查网络。Linux机器和etcd服务之前网络是通的
2. 排查etcd用户名，密码。使用etcdctl发现是能正常获取值的
3. 降级etcd clientV3版本，降到之前确认没问题的版本，发现还是不行
4. 基本确认是这台Linux机器有一些什么特别的设置
5. 在本地安装Linux服务，发现无论是否开启密码验证，都能连接本地etcd服务
6. 确认是网络的问题
7. 检查发现开启了HTTP_PROXY和HTTPS_PROXY，关闭后可以正确连接远程etcd服务
# 问题原因
问了下gpt goClient和etcdctl之前的区别，回答如下：

你遇到的现象是：

系统设置了 HTTP_PROXY（或 http_proxy）环境变量。
用 Go 的 etcd client（如 go.etcd.io/etcd/client/v3）连接 etcd 失败。
但用 etcdctl 命令行工具却能正常连接。
这实际上是一个在企业/云环境下很常见的情况，下面详细解释原因和解决办法。

原因分析
Go 的 etcd client 默认遵循 HTTP(S)_PROXY 环境变量。
Go 1.4+ 的 http(s) 库会自动读取 HTTP_PROXY、HTTPS_PROXY、NO_PROXY 等变量，把所有 HTTP、HTTPS 请求通过代理转发。
虽然 etcd client 默认是 gRPC，但底层用的 net/http/transport，依然会读取代理环境变量。
etcdctl 默认不走代理。
etcdctl 用自己的 dial 方式，不理会 HTTP_PROXY。
etcd 节点通常在内网，走代理会失败。
解决方法
方案1：设置 NO_PROXY
让 Go client 直连内网 etcd，不走代理，需要设置 NO_PROXY 变量，指定 etcd 的 IP/域名/端口：

假设 etcd 地址为 10.37.55.13:2369

bash
export NO_PROXY=10.37.55.13,127.0.0.1,localhost
或者（如果端口也要区分，可以写成如下，但一般只填主机）：

bash
export NO_PROXY=10.37.55.13,10.37.55.13:2369,127.0.0.1,localhost
你可以把这句加到你的服务启动脚本前面，或者在 shell 里全局设置。

方案2：Go 代码里禁用代理
如果你不能或不想改环境变量，可以在代码里禁用代理。例如：

Go
import (
    "net/http"
    "go.etcd.io/etcd/client/v3"
)

tr := http.DefaultTransport.(*http.Transport).Clone()
tr.Proxy = nil // 禁用代理

cli, err := clientv3.New(clientv3.Config{
    Endpoints:   []string{"http://10.37.55.13:2369"},
    DialTimeout: 5 * time.Second,
    DialOptions: []grpc.DialOption{
        grpc.WithContextDialer(func(ctx context.Context, addr string) (net.Conn, error) {
            d := net.Dialer{}
            return d.DialContext(ctx, "tcp", addr)
        }),
    },
})
不过直接设置 NO_PROXY 更简单。

总结
etcdctl 不受 HTTP_PROXY 影响；Go etcd client 会被 HTTP_PROXY 影响。
解决方案：设置 NO_PROXY 包含你 etcd 的 IP/域名。
推荐方法：在你的 shell 或服务启动脚本里加上 export NO_PROXY=...。