---
title: claude-proxy
tags:
  - UE
id: claude-proxy
categories:
  - 笔记
date: 2026-04-21 18:32:34
---

# AWS + Xray + mihomo + 住宅代理 完整搭建教程

> 目标：所有设备通过加密隧道连接 VPS，VPS 智能分流，Anthropic/Claude 流量走住宅代理

---

## 整体架构

```
手机 (Hiddify)  /  电脑 (Clash Verge Rev)
         │
         │  VLESS + Reality 加密隧道 (端口 443)
         ▼
┌──────────────────────────────────────┐
│          AWS EC2 (美西/东京)          │
│                                      │
│  Xray (端口 443)                     │
│    ↓ 所有流量转发到本地 socks5       │
│  mihomo (127.0.0.1:7890)            │
│    ├─ Anthropic/Claude → 住宅代理    │
│    └─ 其他流量 → 直连上网            │
└──────────────────────────────────────┘
         │                    │
         ▼                    ▼
   住宅代理 (IPRoyal)     直连 Internet
         │
         ▼
   api.anthropic.com
```

**关键点：**

- Xray 负责加密隧道（客户端 ↔ VPS）
- mihomo 负责智能分流（哪些走住宅代理，哪些直连）
- 两者串联，7890 端口仅本地监听，不暴露公网
- 客户端只需连接 Xray 的 443 端口

---

# 第一部分：AWS EC2 创建

## 1.1 创建实例

| 配置项 | 推荐值 |
|---|---|
| 区域 | us-west-1 (美西) 或 ap-northeast-1 (东京) |
| AMI | Ubuntu Server 24.04 LTS |
| 实例类型 | t3.micro（免费套餐 750h/月） |
| 存储 | 8–20 GB gp3 |

## 1.2 安全组配置

| 类型 | 协议 | 端口 | 来源 | 用途 |
|---|---|---|---|---|
| SSH | TCP | 22 | My IP | SSH 登录 |
| Custom TCP | TCP | 443 | 0.0.0.0/0 | Xray 入站 |

> **只开 22 和 443**，mihomo 的 7890 不需要开放（仅本地使用）

## 1.3 分配弹性 IP

1. EC2 → Elastic IPs → Allocate → Associate 到实例
2. 记下弹性 IP：`<你的公网IP>`

---

# 第二部分：安装 Xray

## 2.1 SSH 登录

```bash
ssh -i your-key.pem ubuntu@<你的公网IP>
sudo apt update && sudo apt upgrade -y
```

## 2.2 安装 Xray

```bash
bash <(curl -L https://github.com/XTLS/Xray-install/raw/main/install-release.sh)
```

## 2.3 赋予低端口权限

```bash
sudo setcap cap_net_bind_service=+ep /usr/local/bin/xray
```

## 2.4 生成密钥

```bash
# 生成 UUID
xray uuid
# 记下输出，例如：a1b2c3d4-e5f6-7890-abcd-ef1234567890

# 生成 Reality 密钥对
xray x25519
# 记下 Private key 和 Public key

# 生成 Short ID
openssl rand -hex 8
# 记下输出，例如：a1b2c3d4e5f67890
```

## 2.5 配置 Xray（关键：出站走 mihomo）

```bash
sudo nano /usr/local/etc/xray/config.json
```

```json
{
    "log": {
        "loglevel": "warning"
    },
    "dns": {
	"queryStrategy": "UseIPv4",
        "servers": [
            "8.8.8.8",
            "1.1.1.1"
        ]
    },
    "inbounds": [
        {
            "listen": "0.0.0.0",
            "port": 443,
            "protocol": "vless",
            "settings": {
                "clients": [
                    {
                        "id": "<替换为你的UUID>",
                        "flow": "xtls-rprx-vision"
                    }
                ],
                "decryption": "none"
            },
            "streamSettings": {
                "network": "tcp",
                "security": "reality",
                "realitySettings": {
                    "show": false,
                    "dest": "www.apple.com:443",
                    "xver": 0,
                    "serverNames": [
                        "www.apple.com",
                        "apple.com"
                    ],
                    "privateKey": "<替换为你的Private Key>",
                    "shortIds": [
                        "<替换为你的Short ID>"
                    ]
                }
            },
            "sniffing": {
                "enabled": true,
                "destOverride": [
                    "http",
                    "tls",
                    "quic"
                ]
            }
        }
    ],
    "outbounds": [
        {
            "protocol": "freedom",
            "tag": "direct",
            "settings": {
                "domainStrategy": "UseIPv4"
            }
        },
        {
            "tag": "proxy-via-mihomo",
            "protocol": "socks",
            "settings": {
                "servers": [
                    {
                        "address": "127.0.0.1",
                        "port": 7890
                    }
                ]
            }
        },
        {
            "protocol": "blackhole",
            "tag": "block"
        }
    ],
    "routing": {
        "domainStrategy": "IPIfNonMatch",
        "domainMatcher": "hybrid",
        "rules": [
            {
                "type": "field",
                "outboundTag": "proxy-via-mihomo",
                "domain": [
                    "domain:anthropic.com",
                    "domain:anthropic.ai",
                    "domain:api.anthropic.com",
                    "domain:claude.ai",
                    "domain:claudecode.ai",
                    "domain:ifconfig.me"
                ]
            }
        ]
    }
}
```

**配置说明：**

| 配置项 | 说明 |
|---|---|
| `inbounds` | 端口 443，VLESS + Reality 加密入站 |
| `outbounds[0]` | **关键**：Anthropic 流量转发给本地 mihomo (127.0.0.1:7890) |
| `outbounds[1]` | 其他流量直连上网 |
| `routing.rules[0]` | Anthropic/Claude 域名走 mihomo |
| `routing.rules[1]` | 其他流量直连 |

> 这样 Xray 在入站层加密，在出站层根据域名分流：Anthropic 走 mihomo → 住宅代理，其他直连。

---

# 第三部分：安装和配置 mihomo

## 3.1 安装 mihomo

```bash
# 下载
wget https://github.com/MetaCubeX/mihomo/releases/latest/download/mihomo-linux-amd64.gz

# 解压安装
gunzip mihomo-linux-amd64.gz
chmod +x mihomo-linux-amd64
sudo mv mihomo-linux-amd64 /usr/local/bin/mihomo

# 创建目录
sudo mkdir -p /etc/mihomo /var/log/mihomo

# 下载 GeoIP 数据
sudo wget -O /etc/mihomo/Country.mmdb \
  https://github.com/MetaCubeX/meta-rules-dat/releases/download/latest/country.mmdb

# 验证
mihomo -v
```

## 3.2 配置 mihomo

```bash
sudo nano /etc/mihomo/config.yaml
```

```yaml
# === mihomo 配置 ===
# 仅监听本地，接收 Xray 转发的 Anthropic 流量

mixed-port: 7890
allow-lan: false           # 不允许外部连接，仅本地
bind-address: "127.0.0.1"  # 仅绑定本地
mode: rule
log-level: info

# DNS
dns:
  enable: true
  listen: 127.0.0.1:1053
  enhanced-mode: fake-ip
  fake-ip-range: 198.18.0.1/16
  nameserver:
    - 8.8.8.8
    - 1.1.1.1

# ========== 住宅代理节点 ==========
# ⚠️ 替换为你的 IPRoyal 住宅代理信息
proxies:
  - name: "IPRoyal-住宅代理"
    type: socks5
    server: <住宅代理地址>         # 替换：IPRoyal 给的 IP 或域名
    port: <住宅代理端口>           # 替换：如 12324
    username: <代理用户名>         # 替换
    password: <代理密码>           # 替换

  # 备用节点（如有多个代理）
  # - name: "SOAX-住宅代理"
  #   type: http
  #   server: <备用IP>
  #   port: <端口>
  #   username: <用户名>
  #   password: <密码>

# 代理组
proxy-groups:
  - name: "PROXY"
    type: select
    proxies:
      - "IPRoyal-住宅代理"
      # - "SOAX-住宅代理"

# ========== 路由规则 ==========
rules:
  # Anthropic / Claude 全部走住宅代理
  - DOMAIN-SUFFIX,anthropic.com,PROXY
  - DOMAIN-SUFFIX,anthropic.ai,PROXY
  - DOMAIN-SUFFIX,api.anthropic.com,PROXY
  - DOMAIN-SUFFIX,claude.ai,PROXY
  - DOMAIN-SUFFIX,claudecode.ai,PROXY

  # Anthropic 官方 IP 段（备用）
  - IP-CIDR,23.23.0.0/16,PROXY
  - IP-CIDR,104.18.0.0/16,PROXY

  # ifconfig.me测试IP是否生效
  - DOMAIN-SUFFIX,ifconfig.me,PROXY

  # 兜底：其他流量直连
  - MATCH,DIRECT
```

## 3.3 创建 systemd 服务

```bash
sudo tee /etc/systemd/system/mihomo.service << 'EOF'
[Unit]
Description=mihomo Proxy
After=network.target

[Service]
Type=simple
ExecStart=/usr/local/bin/mihomo -d /etc/mihomo
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable mihomo
```

---

# 第四部分：启动服务（注意顺序）

**必须先启动 mihomo，再启动 Xray**（因为 Xray 出站依赖 mihomo 的 7890 端口）

```bash
# 1. 启动 mihomo
sudo systemctl start mihomo
sleep 2

# 2. 确认 mihomo 在监听
sudo ss -tlnp | grep 7890
# 应看到：LISTEN  127.0.0.1:7890

# 3. 启动/重启 Xray
sudo systemctl restart xray

# 4. 确认 Xray 在监听
sudo ss -tlnp | grep 443
# 应看到：LISTEN  0.0.0.0:443
```

## 开启 BBR 加速（推荐）

```bash
echo "net.core.default_qdisc=fq" | sudo tee -a /etc/sysctl.conf
echo "net.ipv4.tcp_congestion_control=bbr" | sudo tee -a /etc/sysctl.conf
sudo sysctl -p
```

---

# 第五部分：验证

## 5.1 验证 mihomo 住宅代理链路

```bash
# 测试 mihomo 能否通过住宅代理上网
curl -x socks5h://127.0.0.1:7890 https://ifconfig.me
# 应返回住宅代理的 IP（不是 VPS IP）

# 测试 Anthropic 连通性
curl -x socks5h://127.0.0.1:7890 -I https://api.anthropic.com
# 应返回 HTTP 200 或 404（不是 403/451）
```

## 5.2 验证 Xray 直连流量

```bash
# 从外部（手机/电脑）连接 Xray 后访问 ip.sb
# 应返回 VPS 的公网 IP（直连流量不走住宅代理）
```

## 5.3 验证 Anthropic 走住宅代理

```bash
# 从外部连接 Xray 后，在终端设置代理
# 然后 curl https://api.anthropic.com
# 观察 mihomo 日志
sudo journalctl -u mihomo -f
# 应看到 anthropic.com → PROXY 的日志
```

---

# 第六部分：客户端配置

## 6.1 获取公钥（如果之前没记下）

```bash
xray x25519 -i "<你的Private Key>"
# 记下输出的 Public key
```

## 6.2 生成通用链接

将以下链接中的占位符替换后保存，**所有设备通用**：

```
vless://<UUID>@<你的公网IP>:443?encryption=none&flow=xtls-rprx-vision&security=reality&sni=www.apple.com&fp=chrome&pbk=<Public Key>&sid=<Short ID>&type=tcp#AWS-Xray
```

## 6.3 Mac：Clash Verge Rev

### 下载

https://github.com/clash-verge-rev/clash-verge-rev/releases

- M 芯片：`Clash.Verge_x.x.x_aarch64.dmg`
- Intel：`Clash.Verge_x.x.x_x64.dmg`

### 配置

Profiles → New → Local → 创建 `.yaml` 文件：

```yaml
mixed-port: 7890
allow-lan: false
mode: rule
log-level: info

dns:
  enable: true
  enhanced-mode: fake-ip
  nameserver:
    - 8.8.8.8
    - 1.1.1.1

proxies:
  - name: "AWS-Reality"
    type: vless
    server: <你的公网IP>
    port: 443
    uuid: <你的UUID>
    network: tcp
    udp: true
    tls: true
    flow: xtls-rprx-vision
    client-fingerprint: chrome
    reality-opts:
      public-key: <你的Public Key>
      short-id: <你的Short ID>
    servername: www.apple.com

proxy-groups:
  - name: "Proxy"
    type: select
    proxies:
      - "AWS-Reality"

rules:
  # Anthropic / Claude 走代理
  - DOMAIN-SUFFIX,anthropic.com,Proxy
  - DOMAIN-SUFFIX,anthropic.ai,Proxy
  - DOMAIN-SUFFIX,claude.ai,Proxy
  - DOMAIN-SUFFIX,claudecode.ai,Proxy
  # Google 等常用站点走代理
  - DOMAIN-SUFFIX,google.com,Proxy
  - DOMAIN-SUFFIX,youtube.com,Proxy
  - DOMAIN-SUFFIX,github.com,Proxy
  # 其他直连
  - MATCH,DIRECT
```

### 启用

1. Profiles → 选中配置
2. Settings → 打开 **System Proxy**
3. 访问 https://ipinfo.io 验证

### Claude Code 使用

```bash
# Clash Verge Rev 开启后，终端设置代理
export http_proxy="http://127.0.0.1:7890"
export https_proxy="http://127.0.0.1:7890"

# 或者在 ~/.bashrc 中永久配置
echo 'export http_proxy="http://127.0.0.1:7890"' >> ~/.bashrc
echo 'export https_proxy="http://127.0.0.1:7890"' >> ~/.bashrc
source ~/.bashrc

# 验证
curl https://api.anthropic.com
# 应能连通
```

## 6.4 iPhone：Hiddify Next

### 下载

App Store 搜索 **Hiddify**（需美区 Apple ID，免费）

### 配置

打开 Hiddify → **+** → 粘贴第 6.2 节生成的 `vless://` 链接 → 保存 → 连接

## 6.5 Android：Hiddify Next 或 v2rayNG

### Hiddify

- Google Play 搜索 **Hiddify**
- 或 GitHub 下载 APK：https://github.com/hiddify/hiddify-app/releases
- 粘贴同一条 `vless://` 链接

### v2rayNG

- GitHub：https://github.com/2dust/v2rayNG/releases
- 打开 → **+** → 从剪贴板导入 → 粘贴链接

---

# 第七部分：流量路径说明

连接后，不同流量的走向：

| 流量类型 | 路径 | 出口 IP |
|---|---|---|
| 访问 Google/YouTube | 客户端 → Xray → **直连** | VPS 公网 IP |
| 访问 api.anthropic.com | 客户端 → Xray → **mihomo → 住宅代理** | 住宅代理 IP |
| 访问 claude.ai | 客户端 → Xray → **mihomo → 住宅代理** | 住宅代理 IP |
| 访问国内网站 | 客户端 → **直连**（Clash 规则 DIRECT） | 本机 IP |

---

# 第八部分：故障排查

## 常见问题

| 问题 | 排查 |
|---|---|
| Xray 443 端口没监听 | `sudo setcap cap_net_bind_service=+ep /usr/local/bin/xray && sudo systemctl restart xray` |
| mihomo 7890 没监听 | `sudo systemctl status mihomo` 查看错误日志 |
| 能上 Google 但 Anthropic 403 | 住宅代理 IP 有问题，联系 IPRoyal 更换 |
| 所有网站都打不开 | mihomo 可能没启动，Xray 转发到 7890 失败，先检查 mihomo |
| Anthropic 返回 451 | 出口 IP 被识别为代理，需要更纯净的住宅 IP |
| Clash Verge 连不上 | 检查 `client-fingerprint: chrome` 是否填写 |

## 日志排查命令

```bash
# Xray 日志
sudo journalctl -u xray -f --no-pager

# mihomo 日志
sudo journalctl -u mihomo -f --no-pager

# 检查端口
sudo ss -tlnp | grep -E '443|7890'

# 测试住宅代理本身
curl -x socks5://127.0.0.1:7890 https://ifconfig.me
```

---

# 第九部分：维护命令速查

```bash
# ===== 启动（先 mihomo 后 Xray）=====
sudo systemctl start mihomo
sudo systemctl start xray

# ===== 停止 =====
sudo systemctl stop xray
sudo systemctl stop mihomo

# ===== 重启（改配置后）=====
sudo systemctl restart mihomo
sudo systemctl restart xray

# ===== 查看状态 =====
sudo systemctl status mihomo
sudo systemctl status xray

# ===== 编辑配置 =====
sudo nano /usr/local/etc/xray/config.json    # Xray 配置
sudo nano /etc/mihomo/config.yaml             # mihomo 配置

# ===== 更换住宅代理 =====
# 1. 编辑 /etc/mihomo/config.yaml 中的 proxies 段
# 2. sudo systemctl restart mihomo
# 3. curl -x socks5://127.0.0.1:7890 https://ifconfig.me  验证新 IP
```

---

# 附录

## A. AWS 免费套餐

| 资源 | 免费额度 | 时间 |
|---|---|---|
| t3.micro | 750 小时/月 | 12 个月 |
| EBS | 30 GB | 12 个月 |
| 数据传出 | 100 GB/月 | 永久 |

## B. 成本估算

| 项目 | 月费用 |
|---|---|
| AWS EC2 (免费套餐内) | $0 |
| AWS EC2 (免费套餐后) | ~$8–10 |
| IPRoyal ISP 代理 (30天) | ~$2.70/IP |
| **总计** | **$2.70–$13/月** |

## C. 安全建议

1. 定期更新：`sudo apt update && sudo apt upgrade -y`
2. 开启 UFW 防火墙：仅放行 22 和 443
3. 不要分享 UUID、密钥等配置信息
4. 开启 AWS 账单告警，防止意外扣费
5. 住宅代理定期检查 IP 信誉度

---

> 文档版本：v2.0 | 更新日期：2026-04-21
> 
