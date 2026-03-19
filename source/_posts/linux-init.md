---
title: linux开发环境配置
tags:
  - Linux
id: linux-init
categories:
  - 笔记
date: 2026-03-19 16:56:30
---

## Links
- [linux-zsh](https://sysin.org/blog/linux-zsh/)

## 修改ssh支持password
1. sudo -i切换到root，passwd your_username修改密码
2. 修改/etc/ssh/sshd_config，将PasswordAuthentication no修改为PasswordAuthentication yes
3. 重启ssh服务，systemctl restart sshd

## 推荐安装 fzf
```sh
git clone --depth=1 https://github.com/junegunn/fzf.git ~/.fzf
~/.fzf/install
```

## 推荐安装 autojump
```sh
sudo apt install -y autojump
source /usr/share/autojump/autojump.sh on startup
echo '. /usr/share/autojump/autojump.sh' >> ~/.zshrc
```

## 安装SVN
```sh
sudo apt install subversion -y
```
解决每次都需要输密码的问题，可以在~/.subversion/config（如果没有的话，先用一次svn命令）

将auth区段的password-stores配置项解开，设置为simple

## 安装docker
```sh
sudo dnf install -y docker
sudo systemctl enable docker
sudo systemctl start docker
sudo usermod -aG docker $USER && newgrp docker
```