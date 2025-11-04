---
title: 开发机部署Jenkins记录
tags:
  - UE
id: jenkins
categories:
  - 笔记
date: 2025-11-04 12:05:52
---

在平时开发DS(Dedicated Server)时，有时候需要Linux环境，比如进行共享内存(Fork)测试的时候。

我一般在自己的开发机上进行编译和测试，编译脚本是根据项目的打包脚本(Jenkins/groovy)进行编写的，随着开发环境的增多，比如战场、营地，以及最近开始支持XBox和PS5，项目的打包脚本会增加越来越多的参数控制，同时脚本本身的逻辑可能也会进行迭代，这样就面临得同步维护开发机的编译脚本。正好最近开发机上碰到编译脚本打包时Stage阶段总是出错的问题，终于决定在开发机上也部署下Jenkins，通过Jenkins进行编译工作，统一下开发机和项目打包的流程，省去了多余的维护成本。

![pic](https://github.com/zhangga/picx-images-hosting/raw/master/jenkins-1.8z6xsf1j66.webp)

# 安装

## Docker部署

#### 拉取 Jenkins 镜像

```Plain
docker pull jenkinsci/blueocean
```

#### 创建数据卷

```Plain
# 创建挂载目录
sudo mkdir -p /data/jenkins_home
sudo chown -R 1000:1000 /data/jenkins_home
```

```Plain
docker run \          
  -u root \
  -d \
  -p 8080:8080 \
  -p 50000:50000 \
  -v jenkins-data:/data/jenkins_home \
  -v /var/run/docker.sock:/var/run/docker.sock \
  jenkinsci/blueocean
```

## 虚拟机安装（推荐）

#### 添加Jenkins官方仓库

```JavaScript
wget -q -O - https://pkg.jenkins.io/debian-stable/jenkins.io.key | sudo tee \
  /usr/share/keyrings/jenkins-keyring.asc > /dev/null

echo "deb [signed-by=/usr/share/keyrings/jenkins-keyring.asc] \
  https://pkg.jenkins.io/debian-stable binary/" | sudo tee \
  /etc/apt/sources.list.d/jenkins.list > /dev/null

sudo apt update
```

#### 安装

```Plain
sudo apt install jenkins -y
```

#### 修改 Jenkins systemd 配置

编辑 Jenkins 的 systemd 文件：

```Plain
sudo systemctl edit jenkins
```

添加内容（覆盖环境）：

这里主要是

* 单独设置下jdk的版本，因为我本机用的是jdk25，但是Jenkins目前只支持17-21。
* 修改 JENKINS\_HOME

```Plain
sudo mkdir -p /data00/jenkins
sudo chown -R jenkins:jenkins /data00/jenkins
sudo chmod -R 750 /data00/jenkins
```

```Plain
[Service]
Environment="JENKINS_HOME=/data00/jenkins"
Environment="JAVA_HOME=/home/java/jdk-17.0.17+10"
Environment="PATH=/home/java/jdk-17.0.17+10/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin"
```

#### 启动并设置开机自启

```Plain
sudo systemctl daemon-reexec
sudo systemctl daemon-reload
sudo systemctl enable jenkins
sudo systemctl start jenkins
sudo systemctl status jenkins
```

# 配置Jenkins

访问Jenkins界面：`http://<你的服务器IP>:8080`

### 安装插件

1. Pipeline
2. [Subversion](https://plugins.jenkins.io/subversion)
3. Git
4. Build Triggers

### 配置Label

如果你的pipeline里指定了agent label的话。

1. 登录 Jenkins Web UI。
2. 点击 ​**“Manage Jenkins” → “Nodes” → “Configure” → “Labels”**​。

# JENKINS\_HOME

如果中间想换Jenkins目录的话，建议把原目录整理拷下。

1. #### Jenkins 停止服务

```Plain
sudo systemctl stop jenkins
```

2. #### 创建新的 `JENKINS_HOME` 目录

```Plain
sudo mkdir -p /data/jenkins
sudo chown -R jenkins:jenkins /data/jenkins
sudo chmod -R 750 /data/jenkins
```

3. #### 拷贝原有数据（可选，但推荐）

如果希望保留原来的 Jenkins 配置和 job，需要把旧 `JENKINS_HOME` 内容拷贝过去：

```Plain
sudo rsync -av /var/lib/jenkins/ /data/jenkins/
sudo chown -R jenkins:jenkins /data/jenkins
```

4. #### 修改 systemd 配置

通过 systemd 覆盖配置修改 `JENKINS_HOME`：

```Plain
sudo systemctl edit jenkins
```

填入

```Plain
[Service]
Environment="JENKINS_HOME=/data/jenkins"
```

保存退出后，重新加载 systemd：

```Plain
sudo systemctl daemon-reload
sudo systemctl start jenkins
```
