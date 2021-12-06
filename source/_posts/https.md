---
title: JAVA HTTPS服务
date: 2019-01-12 19:39:20
tags:
  - JAVA
id: https
categories:
  - 笔记
---

## 分自签证书和CA证书两种方式。

# 一、制作一张自签证书（jks格式）

```
#keytool -genkey -keysize 2048 -validity 3650 -keyalg RSA -dname "CN=myyiba.com" -keypass 123456 -storepass 123456 -keystore myyiba.jks
```

keytool为JDK提供的生成证书工具

- -keysize 2048 密钥长度2048位（这个长度的密钥目前可认为无法被暴力破解）
- -validity 3650 证书有效期3650天
- -keyalg RSA 使用RSA非对称加密算法
- -dname “CN=myyiba.com” 设置Common Name为myyiba.com，这是我的域名
- -keypass 123456 密钥的访问密码为123456
- -storepass 123456 密钥库的访问密码为123456（其实这两个密码也可以设置一样，通常都设置一样，方便记）
- -keystore myyiba.jks 指定生成的密钥库文件为 myyiba .jks

完了之后就拿到了myyiba.jks这个密钥库文件了，把它放到自己的项目目录下，比如：/usr/local/server/project/resource/myyiba.jks

```
项目示例：github下HttpServerInitializer
```

<!-- more -->

# 在程序初始化的时候生成SSLContext

```
keyStore ks = KeyStore.getInstance("JKS");
InputStream ksInputStream = new FileInputStream("/usr/local/server/project/resource/myyiba.jks");
ks.load(ksInputStream, "123456".toCharArray());
keyManagerFactory kmf = KeyManagerFactory.getInstance(KeyManagerFactory.getDefaultAlgorithm());
kmf.init(ks, "123456".toCharArray());
SSLContext sslContext = SSLContext.getInstance("TLS");
sslContext.init(kmf.getKeyManagers(), null, null);
```

这个过程在整个程序周期只需要做一次，最好try-catch一下，以便检查异常，好了之后保存好sslContext，后面用到。

# 在ChannelInitializer的initChannel中

```
@Override
protected void initChannel(SocketChannel socketChannel) throws Exception {
SSLEngine sslEngine = sslContext.createSSLEngine();
sslEngine.setUseClientMode(false); //服务器端模式
sslEngine.setNeedClientAuth(false); //不需要验证客户端
socketChannel.pipeline().addLast("ssl", new SslHandler(sslEngine)); //搞定
//...
}
```

# 二、CA证书

例如微信小程序的服务器，需要CA证书的HTTPS服务，阿里云提供免费的SSL证书，申请证书后，下载tomcat版。解压有后两个文件：xxx.pfx和pfx-password.txt。

[![hBsD5q.md.png](https://z3.ax1x.com/2021/09/01/hBsD5q.md.png)](https://imgtu.com/i/hBsD5q)

pfx文件类似上面的自签证书xxx.jks文件。加载证书的密码在
pfx-password.txt文件中。

同上面自签证书一样的方式加载CA证书SSL。项目地址见同一个GitHub项目。
