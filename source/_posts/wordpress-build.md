---
title: 搭建WordPress个人站点
date: 2016-10-01 12:49:39
tags: 
	- 笔记
---

{% asset_img wordpress.png My Website %}
## LAMPP+WordPress搭建
### 官网：https://wordpress.org/
### 中文网：https://cn.wordpress.org/

下载tar包，解压到lampp/htdocs文件夹下文件夹，修改成自己喜欢的名。  
访问站点。如：http://47.95.10.167/站点文件夹名  
设置数据库（数据库需要先建库），设置admin等信息。（配置文件存储在站点文件夹/wp-config.php文件）  
使用域名访问指定博客  
重定向。在xampp目录下修改文件重定向，我的机器在/opt/lampp/htdocs/目录下。修改index.php如下：  
```
<?php
	if (!empty($_SERVER['HTTPS']) && ('on' == $_SERVER['HTTPS'])) {
		$uri = 'https://';
	} else {
		$uri = 'http://';
	}
	$uri .= $_SERVER['HTTP_HOST'];
	header('Location: '.$uri.'/blog/');
	exit;
?>
```
