---
title: 使用v2ray搭建VPN服务
tags:
  - 笔记
id: v2ray
categories:
  - 笔记
date: 2026-03-19 16:34:51
---

记录下在aws上部署v2ray的步骤。

## Links

* [使用v2ray搭建VPN服务](https://github.com/faple-ml/blog/issues/4)

V2ray的相关仓可以直接从github上进行获取:

* Main: [https://github.com/v2ray](https://github.com/v2ray)
* MacOS: [https://github.com/v2ray/homebrew-v2ray](https://github.com/v2ray/homebrew-v2ray)
* Android: [https://github.com/v2ray/V2RayNG](https://github.com/v2ray/V2RayNG)
* Windows: [https://github.com/2dust/v2rayN](https://github.com/2dust/v2rayN)
* Other Awesome tools: [https://www.v2ray.com/en/awesome/tools.html](https://www.v2ray.com/en/awesome/tools.html)

## Installation

官方一键安装脚本: [://github.com/v2fly/fhs-install-v2ray`https`](https://github.com/v2fly/fhs-install-v2ray)

## Configs

* Path: `/usr/local/etc/v2ray/config.json`
* Manual: [://v2ray.com`https`](https://v2ray.com/)
* Sample: [://www.v2ray.com/en/welcome/start.html`https`](https://www.v2ray.com/en/welcome/start.html)

### Generate UUID
生成一个随机的UUID，用于接下来的配置中。

* 可以从 [Online UUID Generator](https://www.uuidgenerator.net/)  生成
* Linux 可以用命令 `cat /proc/sys/kernel/random/uuid` 生成


### Using as server

在服务端的`/usr/local/etc/v2ray/config.json` 设置接受端口vmess协议并向外直接转发:

/usr/local/etc/v2ray/config.json

```
{
  "inbounds": [{
      // Server port, need to add TCP security policy in AWS security group
      "port": 11223,
      "protocol": "vmess",
      "settings": {
        "clients": [{ "id": "81498305-0be0-4923-a270-df4e490a086b" }] // UUID Same as client
    }
  }],
  "outbounds": [{
    "protocol": "freedom",
    "settings": {}
  }]
}
```

### Using as client

在客户端的`/usr/local/etc/v2ray/config.json`同样文件里设置本地端口转发到服务端的 对应对口上:

/usr/local/etc/v2ray/config.json

```
{
    // Log output to var and set log level to error
    "log": {
        "access": "/var/log/v2ray/log",
        "error": "/var/log/v2ray/log",
        "loglevel": "error"
    },

    // Accept local socks request
    "inbounds": [{
        "listen": "127.0.0.1",
        "port": 11112,
        "protocol": "socks",
        "tag": "socks-inbound",
        "settings": {
            "auth": "noauth",
            "udp": true,
            "userlevel": 8,
            "ip": "127.0.0.1"
        },
        "sniffing": {
            "enabled": true,
            "destOverride": ["http", "tls"]
        }
    },

    // Accept local http request
    {
        "listen": "127.0.0.1",
        "port": 11111,
        "protocol": "http",
        "tag": "http-inbound",
        "settings": {
            "userlevel": 8
        }
    }],

    // Transfer to vps server using vmess
    "outbounds": [{
        "mux": {
            "concurrency": -1,
            "enabled": false
        },
        "protocol": "vmess",
        "settings": {
            "vnext": [{
                "address": "server.ip.address",
                "port": 11223, // Same as server
                "users": [{
                    "alterId": 0,
                    "id": "81498305-0be0-4923-a270-df4e490a086b",
                    "security": "auto",
                    "level": 8
                }]
            }]
        },
        "streamSettings": {
            "network": "tcp",
            "security":""
        },
        "tag": "proxy"
    },
    {
        "protocol": "blackhole",
        "settings": {},
        "tag": "blocked"
    },
    {
        "protocol": "freedom",
        "settings": {},
        "tag": "direct"
    }],

    "routing": {
        "domainStrategy": "IPIfNonMatch",
        "rules":[ ]
    },

    "dns": {
        "hosts": {
            "domain:github.io": "pages.github.com",
            "domain:wikipedia.org": "www.wikimedia.org",
            "domain:shadowsocks.org": "electronicsrealm.com",
            "domain:googleapis.cn": "googleapis.com"
        },
        "servers": [
            "1.1.1.1"
        ]
    },

    "policy": {
        "levels": {
            "8": {
                "connIdle": 300,
                "uplinkOnly": 1,
                "handshake": 4,
                "downlinkOnly": 1
            }
        },
        "system": {
            "statsInboundUplink": false,
            "statsInboundDownlink": false,
            "statsOutboundUplink": false,
            "statsOutboundDownlink": false
        }
    }
}
```

## Running service

客户端和服务端都启动v2ray:

Directly Run:

```sh
v2ray --config /usr/local/etc/v2ray/config.json &
```

Start as systemd service

Linux

```sh
# Set v2ray as startup service
sudo systemctl enable v2ray
sudo systemctl start v2ray
```

MacOS

```sh
sudo brew services start v2ray
```

之后在客户端使用对应代理就可以了:

linux/unix

```sh
export http_proxy = "127.0.0.1:11111"
export https_proxy = "127.0.0.1:11111"
```

在Windows上配置浏览器代理即可

## Mongo服务
下面是部署mongo服务的脚本:run_mongo.sh
```sh
#!/usr/bin/env bash
set -e

# =======================
# 配置区（按需修改）
# =======================
CONTAINER_NAME="mongo"
IMAGE="mongo:6"

HOST_PORT=27017
CONTAINER_PORT=27017

DATA_DIR="/data/mongo"

MONGO_ROOT_USER="root"
MONGO_ROOT_PASSWORD="xxxxxx"

# =======================
# 逻辑区
# =======================

echo "==> Checking Docker..."
if ! command -v docker &>/dev/null; then
  echo "Docker not found, please install Docker first."
  exit 1
fi

echo "==> Creating data dir: $DATA_DIR"
mkdir -p "$DATA_DIR"

# 如果容器已存在，先删除
if docker ps -a --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
  echo "==> Removing existing container: $CONTAINER_NAME"
  docker stop "$CONTAINER_NAME" || true
  docker rm "$CONTAINER_NAME" || true
fi

echo "==> Starting MongoDB container..."
docker run -d \
  --name "$CONTAINER_NAME" \
  --restart unless-stopped \
  -p "${HOST_PORT}:${CONTAINER_PORT}" \
  -v "${DATA_DIR}:/data/db" \
  -e MONGO_INITDB_ROOT_USERNAME="$MONGO_ROOT_USER" \
  -e MONGO_INITDB_ROOT_PASSWORD="$MONGO_ROOT_PASSWORD" \
  "$IMAGE"

echo "==> MongoDB started successfully!"
echo "==> Connect URI:"
echo "mongodb://${MONGO_ROOT_USER}:<password>@127.0.0.1:${HOST_PORT}/admin"
```
