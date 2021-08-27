---
title: 阿里云转战腾讯云-全纪录
date: 2018-10-01 12:06:11
tags:
  - 笔记
id: ali2tx
categories:
  - 笔记
---

# 机器迁移全记录。

[![hMnUVP.md.png](https://z3.ax1x.com/2021/08/27/hMnUVP.md.png)](https://imgtu.com/i/hMnUVP)

<!--more-->

### 1.JDK

/usr/local/java/下，放jdk11和jdk1.8。default软连接到jdk11。

/etc/profile 文件加入环境变量指向default。执行source /etc/profile

### 2.maven

/usr/local/mvn/下，放maven解压包，加入环境变量。

### 3.cmake

/opt下放cmake的解压包，加入环境变量。

### 4.xampp

/opt下放xampp的安装文件，xampp-xxx.run文件。

chmod -R 755 xampp-linux-xxx-installer.run 添加执行权限。

./xampp-linux-xxx-installer.run 执行安装。

安装的过程就不多说了，也不用设置什么，无非就是问你时候确定一些选项，出现提问，直接按 回车 下去即可。xampp默认安装在/opt/lampp下

安装完毕之后，并没有运行，我们需要手动启动xampp服务，也就是启动apache，ftp和mysql这些服务器。使用命令

/opt/lampp/lampp start

此时，lampp组件就成功启动了，但它并不是每次随系统启动
输入以下命令
ln -s /opt/lampp/lampp /etc/rc.d/rc3.d/S99lampp
ln -s /opt/lampp/lampp /etc/rc.d/rc4.d/S99lampp
ln -s /opt/lampp/lampp /etc/rc.d/rc5.d/S99lampp

这样，就随系统启动了！

环境安装完了，但是MySQL的密码是多少，ftp的账号密码也是多少？我们不知道，这个默认为空，还需要我们自己设置。【要先在文本上面写好先在复制安全点，不然密码设置成什么自己都不记得了】输入命令

sudo /opt/lampp/lampp security

如图所示:他会依次要求你

1、先输入xampp控制面板的密码（用户名是xampp）；

2、输入phpmyadmin的密码（用户名是pma）

3、输入mysql的密码（用户名是root）

4、输入ftp密码（用户名是daemon，默认端口21）

9、在浏览器输入服务器的ip访问看一下成功了没有？

由于服务器设置了xampp不允许远程访问，所以远程不能访问需要修改conf文件

vi /opt/lampp/etc/extra/httpd-xampp.conf

将  Require local 改成 Require all granted

/opt/lampp/lampp restart 重启xampp

到此xampp安装完成

mysql指令无法执行，简单的方法是可以直接将/opt/lampp/bin/目录添加到环境变量中，这样就可以直接使用mysql和mysqldump命令了。

打开 ~/.bashrc 文件
在最后一行加入
\# PATH
export PATH=/opt/lampp/bin:$PATH
保存退出执行该文件中的命令
source ~/.bashrc

修改/opt/lampp/etc/my.cnf 配置文件，开放3306端口。可能需要重启服务器，注意查看下mysql是否启动在33066端口上。

### 4.迁移wordpress。

### 5.redis迁移。

### 6.server和htdocs迁移。

## 7.maven私有仓库和SVN。

8.nginx安装https://www.cnblogs.com/wyd168/p/6636529.html
