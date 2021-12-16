---
title: WordPress迁移Hexo
date: 2021-06-10 23:50:05
tags: 
	- 网站
id: hello
categories:
	- 笔记
---

# 搬[新家](http://kwaibook.com)了！

在用了三年多WordPress后还是决定尝试下使用一些轻量的框架来搭建站点，比如Hexo。
放弃WordPress主要出于以下几个方面的考虑吧：
1. 成本：需要单独的服务器部署。
2. 效率：功能大而全，便利性方面还是很好的，但是敏捷性方面就稍显欠缺了，而Hexo支持MD语法，大大激活创作效率。
3. 性能：网页加载图片的速度较慢。
4. 美观：简洁才是王道
5. 杀鸡用牛刀：在个人站点方面，静态的Hexo完全够了。

<!--more-->

站点搭建完了，现在的方案是，本地编写MD文件，提交Github，Travis自动发布。
皮肤：[next](http://theme-next.iissnan.com/getting-started.html)

皮肤：[butterfly](https://butterfly.js.org/posts/ceeb73f/)

后续需要的插件陆续添加吧。
主要参考的文章：

* [Travis CI](https://segmentfault.com/a/1190000021987832)
* [Hexo部署](https://kchen.cc/2016/11/12/hexo-instructions/)

# 常用笔记
1. 新建博文：hexo new post $title
2. 新建草稿：hexo new draft $title
3. 文章目录：source\_posts
4. 图片目录：source\images
5. https://typora.io/ markdown工具
6. [Markdown语法](https://markdown.com.cn/basic-syntax/links.html)
7. [参考链接](http://blog.smallerpig.com/set-hexo-show-more-button-on-indexpage.html)
9. [参考链接](https://tohugo.com/2021/01/26/%E5%B7%A5%E5%85%B7%E9%85%8D%E7%BD%AE/Hexo%E6%B7%BB%E5%8A%A0%E5%88%86%E7%B1%BB%E5%8F%8A%E6%A0%87%E7%AD%BE%EF%BC%88%E5%9C%A8Next%E4%B8%BB%E9%A2%98%E4%B8%8B%EF%BC%89/)
9. [met皮肤](https://huyongfei.com/posts/2324b80c.html)

# hexo博客插入图片与视频方法
### 图片插入
Hexo有多种图片插入方式，可以将图片存放在本地引用或者将图片放在CDN上引用。
### 本地引用–绝对路径
当Hexo项目中只用到少量图片时，可以将图片统一放在source/images文件夹中，通过markdown语法访问它们。
```
source/images/image.jpg

![(可以写关于图片的描述)](/images/image.jpg)
```
图片既可以在首页内容中访问到，也可以在文章正文中访问到。
### 本地引用–相对路径
图片除了可以放在统一的images文件夹中，还可以放在文章自己的目录中。文章的目录可以通过配置_config.yml来生成。
```
_config.yml

post_asset_folder: true
```
将_config.yml文件中的配置项post_asset_folder设为true后，执行命令$ hexo new post_name，在source/_posts中会生成
文章post_name.md和同名文件夹post_name。将图片资源放在post_name中，文章就可以使用相对路径引用图片资源了。
```
_posts/post_name/image.jpg

![](image.jpg)
```
上述是markdown的引用方式，图片只能在文章中显示，但无法在首页中正常显示。  
如果希望图片在文章和首页中同时显示，可以使用标签插件语法。
```
_posts/post_name/image.jpg

{% asset_img image.jpg This is an image %}
```
### CDN引用
除了在本地存储图片，还可以将图片上传到一些免费的CDN服务中。
比如[Cloudinary](https://cloudinary.com/)（梯子访问）提供的图片CDN服务，在Cloudinary中上传图片后，会生成对应的url地址，将地址直接拿来引用即可。或者上传到[路过图床](https://imgtu.com/)（不用梯子）。
下面是路过图床上传的图片，引用格式从路过图床复制过来即可。
[![hVCDOI.png](https://z3.ax1x.com/2021/08/25/hVCDOI.png)](https://imgtu.com/i/hVCDOI)
### 视频插入
插入视频与图片不同，这里以b站的视频为例
```
<iframe src="（视频网址）" scrolling="no" border="0" frameborder="no" framespacing="0" allowfullscreen="true" width="100%"  height="580" quality="high" > </iframe>
```
这样直接插入的代码手机端不能自适应，效果不完美。
**最好这样**
```
<div style="position: relative; width: 100%; height: 0; padding-bottom: 75%;"><iframe 
src="//player.bilibili.com/player.html?aid=39807850&cid=69927212&page=1" scrolling="no" border="0" 
frameborder="no" framespacing="0" allowfullscreen="true" style="position: absolute; width: 100%; 
height: 100%; left: 0; top: 0;"> </iframe></div>
```