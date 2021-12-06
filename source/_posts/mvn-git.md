---
title: IDEA+MAVEN+GIT项目管理
date: 2018-08-04 10:53:23
tags:
  - 杂乱
id: mvn-git
categories:
  - 笔记
---

## 安装maven

下载地址：http://maven.apache.org/download.cgi#

解压到D盘Maven文件夹下：

在Maven文件夹下新建一个Repository文件夹，用作仓库。

修改D:\Maven\apache-maven-3.6.0\conf下settings.xml文件：

添加：

```
<localRepository>D:\Maven\Repository</localRepository>
```

<!--more-->

在mirrors下添加阿里云远程镜像，速度贼快：

<!– 阿里云仓库 –>
<mirror>
<id>alimaven</id>
<mirrorOf>central</mirrorOf>
<name>aliyun maven</name>
<url>http://maven.aliyun.com/nexus/content/repositories/central/</url>
</mirror>

<mirror>
<id>alimaven</id>
<name>aliyun maven</name>
<url>http://maven.aliyun.com/nexus/content/groups/public/</url>
<mirrorOf>central</mirrorOf>
</mirror>

在profiles下添加，修改jdk为11：

<profile>
<id>jdk-11</id>
<activation>
<activeByDefault>true</activeByDefault>
<jdk>11</jdk>
</activation>
<properties>
<maven.compiler.source>11</maven.compiler.source>
<maven.compiler.target>11</maven.compiler.target>
<maven.compiler.compilerVersion>11</maven.compiler.compilerVersion>
</properties>
</profile>

添加环境变量：
M2_HOME
D:\Maven\apache-maven-3.6.0
Path
%M2_HOME%\bin;

## idea建立maven

在settings里面：

![IDEA+MAVEN+GIT项目管理 - 第1张  | 张嘎](https://img-blog.csdn.net/20170818231853882?watermark/2/text/aHR0cDovL2Jsb2cuY3Nkbi5uZXQveHV5YW9xaWFveWFvZ2U=/font/5a6L5L2T/fontsize/400/fill/I0JBQkFCMA==/dissolve/70/gravity/SouthEast)

## 安装git

git下载地址 ：https://gitforwindows.org/
安装完成后，在开始菜单里找到“Git”->“Git Bash”，蹦出一个类似命令行窗口的东西，就说明Git安装成功！
安装完成后，还需要最后一步设置，在命令行输入：

$ git config –global user.name “Your Name”
$ git config –global user.email “email@example.com”

具体过程请参见：
[廖雪峰Git安装](https://www.liaoxuefeng.com/wiki/0013739516305929606dd18361248578c67b8067c8c017b000/00137396287703354d8c6c01c904c7d9ff056ae23da865a000)

## git clone远程项目

在“Git Bash”命令行里输入：ssh-keygen -t rsa -C “your.email@example.com” -b 4096

会在本地用户目录下的.ssh文件夹下生成id_rsa和id_rsa.pub文件，

将id_rsa.pub公钥文件加入到远程git/Setttings/SSH Keys里面。

右键菜单“Git GUI”

## 码云

码云是目前国内比较好的代码托管平台。
码云官方教程如下：
[码云教程](http://git.mydoc.io/?t=153739)
安装好插件后可以将之前建立的项目托管到码云上。

