---
title: Nexus搭建开发组的私有仓库
date: 2018-11-10 19:33:23
tags:
  - 笔记
id: nexus
categories:
  - 笔记
---

**目录**

- [一、私有仓库的价值](https://www.cnblogs.com/fanzhenyong/p/7709434.html#_label0)
- 二、准备工作
  - 2.1、安装Java编译环境
    - [2.1.1、安装](https://www.cnblogs.com/fanzhenyong/p/7709434.html#_label1_0)
    - [2.1.2、验证](https://www.cnblogs.com/fanzhenyong/p/7709434.html#_label1_0)
    - [2.1.3、设置环境变量](https://www.cnblogs.com/fanzhenyong/p/7709434.html#_label1_0)
  - [2.2、虚拟机访问互联网](https://www.cnblogs.com/fanzhenyong/p/7709434.html#_label1_1)
- 三、安装Nexus
  - [3.1、下载nexus](https://www.cnblogs.com/fanzhenyong/p/7709434.html#_label2_0)
  - [3.2、部署](https://www.cnblogs.com/fanzhenyong/p/7709434.html#_label2_1)
  - 3.3、系统服务
    - [3.3.1、编辑系统服务文件](https://www.cnblogs.com/fanzhenyong/p/7709434.html#_label2_2)
    - [3.3.2、设置为自启动服务](https://www.cnblogs.com/fanzhenyong/p/7709434.html#_label2_2)
- 四、设置Nexus
  - [4.1、浏览器登录](https://www.cnblogs.com/fanzhenyong/p/7709434.html#_label3_0)
  - [4.2、进入管理界面](https://www.cnblogs.com/fanzhenyong/p/7709434.html#_label3_1)
  - [4.3、增加新的代理源](https://www.cnblogs.com/fanzhenyong/p/7709434.html#_label3_2)
  - [4.3、设置私用仓库可重复发布](https://www.cnblogs.com/fanzhenyong/p/7709434.html#_label3_3)
- 五、安装maven并设置私用仓库
  - [5.1、下载安装](https://www.cnblogs.com/fanzhenyong/p/7709434.html#_label4_0)
  - [5.2、设置环境变量](https://www.cnblogs.com/fanzhenyong/p/7709434.html#_label4_1)
  - [5.3、测试](https://www.cnblogs.com/fanzhenyong/p/7709434.html#_label4_2)
  - [5.4、配置](https://www.cnblogs.com/fanzhenyong/p/7709434.html#_label4_3)

**正文**[回到顶部](https://www.cnblogs.com/fanzhenyong/p/7709434.html#_labelTop)

![Nexus搭建开发组的私有仓库 - 第1张  | 张嘎](https://i0.wp.com/192.144.167.243/blog/wp-content/uploads/3-1-1024x495.png?resize=640%2C309)

# 一、私有仓库的价值

　　开发Java应用系统，用到Maven、sbt和 Gradle等构建工具，在构建过程中一般需要从互联网下载依赖库，构建私有仓库就是为了在开发组或者部门内共用，从而节省整体的下载成本和构建成本。下面先以Maven为例说明。

　　Maven是一个强大的构建工具，一般用于Java项目。Maven项目基于对象模型(POM)，可以通过一小段描述信息来管理项目的构建，报告和文档的软件项目管理工具。Maven 除了以程序构建能力为特色之外，还提供高级项目管理工具。由于 Maven 的缺省构建规则有较高的可重用性，所以常常用两三行 Maven 构建脚本就可以构建简单的项目。

Maven的Java项目一般需要下载第三方组件，下载后构成本地仓库，为了减少网络对构建项目的影响，一般会构建私服仓库，代理第三方库。Nexus就是构建私服仓库的优秀软件。

![Nexus搭建开发组的私有仓库 - 第2张  | 张嘎](https://i1.wp.com/images2017.cnblogs.com/blog/1082089/201710/1082089-20171022220431849-1095286350.png?w=640&ssl=1)

图 1 三层仓库架构[回到顶部](https://www.cnblogs.com/fanzhenyong/p/7709434.html#_labelTop)

# 二、准备工作

## 2.1、安装Java编译环境

Java编译环境包括核心的JDK和编译工具，因为Java的编译工具有很多种，而开源项目作者的随意性很高，常用的工具有maven，gradle,sbt，ant等等，本文关注Maven。

因为Oracle不再维护Java1.7，所以采用Java 1.8作为编译核心.

### 2.1.1、安装

操作系统采用Centos7.4

```
yum install java-1.8.0-openjdk-devel java-1.8.0-openjdk java-1.8.0-openjdk-headless -y
```

### 2.1.2、验证

查看jdk版本号

![Nexus搭建开发组的私有仓库 - 第3张  | 张嘎](https://i0.wp.com/common.cnblogs.com/images/copycode.gif?w=640&ssl=1)

```
java -version
Picked up _JAVA_OPTIONS: -Xmx2048m -XX:MaxMetaspaceSize=512m -Djava.awt.headless=true
openjdk version "1.8.0_131"
OpenJDK Runtime Environment (build 1.8.0_131-b12)
OpenJDK 64-Bit Server VM (build 25.131-b12, mixed mode)
```

![Nexus搭建开发组的私有仓库 - 第4张  | 张嘎](https://i0.wp.com/common.cnblogs.com/images/copycode.gif?w=640&ssl=1)

### 2.1.3、设置环境变量

```
vi ~/.bashrc
```

增加

```
export JAVA_HOME=/usr/lib/jvm/java
export JRE_HOME=${JAVA_HOME}/jre
export CLASSPATH=.:$JRE_HOME/lib/rt.jar:$JAVA_HOME/lib/dt.jar:$JAVA_HOME/lib/tools.jar
export PATH=$JAVA_HOME/bin:$PATH
```

即刻生效

```
source ~/.bashrc
```

## 2.2、虚拟机访问互联网

```
vi /etc/sysconfig/network-scripts/ifcfg-ens32
```

注：环境不同网卡名会不同

增加天津联通的DNS（注：作者在天津，请按个人本地的运行商做相应修改）

```
DNS1=202.99.96.68
DNS2=202.99.104.68
```

在实际测试中感觉天津电信的DNS更加靠谱，访问一些特殊网站返回的IP能够顺利访问，大家根据实践选择吧

```
DNS1=219.150.32.132
DNS2=219.146.0.130
```

重新启动网络

```
systemctl restart network
```

测试

```
ping www.163.com
PING 163.xdwscache.ourglb0.com (42.81.9.47) 56(84) bytes of data.
64 bytes from 42.81.9.47 (42.81.9.47): icmp_seq=1 ttl=128 time=9.66 ms
64 bytes from 42.81.9.47 (42.81.9.47): icmp_seq=2 ttl=128 time=10.4 ms…
```

[回到顶部](https://www.cnblogs.com/fanzhenyong/p/7709434.html#_labelTop)

# 三、安装Nexus

## 3.1、下载nexus

从官方网站现在最新3.X版

https://www.sonatype.com/download-oss-sonatype

下载（2018年3月）最新版nexus-3.9.0-01-unix.tar.gz （）

## 3.2、部署

先规划存储私有仓库的目录，作者本机的/opt目录空间较多，所以以/opt为例

```
cd /opt/scm
tar -xf ~/download/nexus-3.9.0-01-unix.tar.gz -C .
```

生成两个目录

```
nexus-3.9.0-01
sonatype-work
```

## 3.3、系统服务

### 3.3.1、编辑系统服务文件

![Nexus搭建开发组的私有仓库 - 第5张  | 张嘎](https://i0.wp.com/common.cnblogs.com/images/copycode.gif?w=640&ssl=1)

```
vi /etc/systemd/system/nexus.service

[Unit]
Description=nexus service
After=network.target

[Service]Type=forking
LimitNOFILE=65536
ExecStart=/opt/scm/nexus-3.9.0-01/bin/nexus start
ExecStop=/opt/scm/nexus-3.9.0-01/bin/nexus stop
User=ansible
Restart=on-abort

[Install]
WantedBy=multi-user.target
```

![Nexus搭建开发组的私有仓库 - 第6张  | 张嘎](https://i0.wp.com/common.cnblogs.com/images/copycode.gif?w=640&ssl=1)

### 3.3.2、设置为自启动服务

```
sudo systemctl  daemon-reload
sudo systemctl start nexus.service
sudo systemctl status nexus.service
sudo systemctl enable nexus.service
```

启动报错：1./etc/systemd/system/nexus.service文件的user不对
2.修改/opt/scm/nexus/bin/nexus 启动的JAVA_HOME 如：INSTALL4J_JAVA_HOME_OVERRIDE=/usr/local/java/jdk1.8/

[回到顶部](https://www.cnblogs.com/fanzhenyong/p/7709434.html#_labelTop)

# 四、设置Nexus

## 4.1、浏览器登录

http://192.168.154.11:8081/

![Nexus搭建开发组的私有仓库 - 第7张  | 张嘎](https://i0.wp.com/images2017.cnblogs.com/blog/1082089/201710/1082089-20171022220256240-534211558.png?w=640&ssl=1)

用户名的密码为：admin admin123

## 4.2、进入管理界面

![Nexus搭建开发组的私有仓库 - 第8张  | 张嘎](https://i1.wp.com/images2017.cnblogs.com/blog/1082089/201710/1082089-20171022220317318-1530787694.png?w=640&ssl=1)

## 4.3、增加新的代理源

![Nexus搭建开发组的私有仓库 - 第9张  | 张嘎](https://i0.wp.com/images2017.cnblogs.com/blog/1082089/201710/1082089-20171022220331802-1557956595.png?w=640&ssl=1)

设置名称和URL

![Nexus搭建开发组的私有仓库 - 第10张  | 张嘎](https://i1.wp.com/images2017.cnblogs.com/blog/1082089/201710/1082089-20171022220342224-1667350164.png?w=640&ssl=1)

Cache统一设置为200天 288000

![Nexus搭建开发组的私有仓库 - 第11张  | 张嘎](https://i1.wp.com/images2017.cnblogs.com/blog/1082089/201710/1082089-20171022220350271-1209294422.png?w=640&ssl=1)

 逐个增加常用代理

![Nexus搭建开发组的私有仓库 - 第12张  | 张嘎](https://i0.wp.com/common.cnblogs.com/images/copycode.gif?w=640&ssl=1)

```
1. aliyun
http://maven.aliyun.com/nexus/content/groups/public
2. apache_snapshot
https://repository.apache.org/content/repositories/snapshots/
3. apache_release
https://repository.apache.org/content/repositories/releases/
4. atlassian
https://maven.atlassian.com/content/repositories/atlassian-public/
5. central.maven.org
http://central.maven.org/maven2/
6. datanucleus
http://www.datanucleus.org/downloads/maven2
7. maven-central （安装后自带，仅需设置Cache有效期即可）
https://repo1.maven.org/maven2/
8. nexus.axiomalaska.com
http://nexus.axiomalaska.com/nexus/content/repositories/public
9. oss.sonatype.org
https://oss.sonatype.org/content/repositories/snapshots
10.pentaho
https://public.nexus.pentaho.org/content/groups/omni/
```

![Nexus搭建开发组的私有仓库 - 第13张  | 张嘎](https://i0.wp.com/common.cnblogs.com/images/copycode.gif?w=640&ssl=1)

再次强调，在

How long (in minutes) to cache metadata before rechecking the remote repository.处

统一设置为

288000 即200天，当然可以设置为更长的时间

设置maven-public

将这些代理加入Group

![Nexus搭建开发组的私有仓库 - 第14张  | 张嘎](https://i0.wp.com/images2017.cnblogs.com/blog/1082089/201710/1082089-20171022220400959-1653481781.png?w=640&ssl=1)

## 4.3、设置私用仓库可重复发布

　　Nexus安装后自带maven-releases，maven-snapshots两个仓库，用于将生成的jar包发布在这两个仓库中，在实际开发中需要将maven-releases设置为可以重复发布。

　　maven-releases

![Nexus搭建开发组的私有仓库 - 第15张  | 张嘎](https://i0.wp.com/images2018.cnblogs.com/blog/1082089/201803/1082089-20180317135112096-935379506.png?w=640&ssl=1)

　　注：maven-snapshots缺省是可以重新部署的。[回到顶部](https://www.cnblogs.com/fanzhenyong/p/7709434.html#_labelTop)

# 五、安装maven并设置私用仓库

## 5.1、下载安装

从maven官网下载3.5.0 http://maven.apache.org/download.cgi

```
cd tools
tar -xf ../download/apache-maven-3.5.0-bin.tar.gz –C .
```

## 5.2、设置环境变量

vi ~/.bashrc

增加

```
export PATH=/home/ansible/tools/apache-maven-3.5.0/bin:$PATH
```

即刻生效

source ~/.bashrc

## 5.3、测试

![Nexus搭建开发组的私有仓库 - 第16张  | 张嘎](https://i0.wp.com/common.cnblogs.com/images/copycode.gif?w=640&ssl=1)

```
mvn -v

Picked up _JAVA_OPTIONS: -Xmx2048m -XX:MaxMetaspaceSize=512m -Djava.awt.headless=true
Apache Maven 3.5.0 (ff8f5e7444045639af65f6095c62210b5713f426; 2017-04-04T03:39:06+08:00)
Maven home: /home/ansible/tools/apache-maven-3.5.0
Java version: 1.8.0_102, vendor: Oracle Corporation
Java home: /usr/lib/jvm/java-1.8.0-openjdk-1.8.0.102-4.b14.el7.x86_64/jre
Default locale: en_US, platform encoding: UTF-8
OS name: "linux", version: "3.10.0-514.el7.x86_64", arch: "amd64", family: "unix"
```

## 5.4、配置

vi ~/tools/apache-maven-3.5.0/conf/settings.xml（本地服务器可以使用localhost，开发组其他服务器则修改为对应Nexus服务器的域名或者IP地址）

![Nexus搭建开发组的私有仓库 - 第17张  | 张嘎](https://i0.wp.com/common.cnblogs.com/images/copycode.gif?w=640&ssl=1)

```
<settings>
  <pluginGroups>  
     <pluginGroup>org.sonatype.plugins</pluginGroup>  
  </pluginGroups> 
  <mirrors>
    <mirror>
      <id>nexus</id>
      <mirrorOf>*</mirrorOf>
      <url>http://localhost:8081/repository/maven-public/</url>
    </mirror>
  </mirrors>
  <profiles>
    <profile>
      <id>nexus</id>
      <!--Enable snapshots for the built in central repo to direct -->
      <!--all requests to nexus via the mirror -->
      <repositories>
        <repository>
          <id>central</id>
          <url>http://central</url>
          <releases><enabled>true</enabled></releases>
          <snapshots><enabled>true</enabled></snapshots>
        </repository>
      </repositories>
     <pluginRepositories>
        <pluginRepository>
          <id>central</id>
          <url>http://central</url>
          <releases><enabled>true</enabled></releases>
          <snapshots><enabled>true</enabled></snapshots>
        </pluginRepository>
      </pluginRepositories>
    </profile>
  </profiles>
  <activeProfiles>
    <!--make the profile active all the time -->
    <activeProfile>nexus</activeProfile>
  </activeProfiles>
  <servers>
    <server>
      <id>nexus</id>
      <username>admin</username>
      <password>admin123</password>
    </server>
  </servers>
</settings>
```

