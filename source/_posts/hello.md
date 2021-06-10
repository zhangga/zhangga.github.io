---
title: WordPress迁移Hexo
date: 2021-06-10 23:50:05
tags: 
	- 笔记
---

搬[新家](http://kwaibook.com)了！

在用了三年多WordPress后还是决定尝试下使用一些轻量的框架来搭建站点，比如Hexo。
放弃WordPress主要出于以下几个方面的考虑吧：
1. 成本：需要单独的服务器部署。
2. 效率：功能大而全，便利性方面还是很好的，但是敏捷性方面就稍显欠缺了，而Hexo支持MD语法，大大激活创作效率。
3. 性能：网页加载图片的速度较慢。
4. 美观：简洁才是王道
5. 杀鸡用牛刀：在个人站点方面，静态的Hexo完全够了。

站点搭建完了，现在的方案是，本地编写MD文件，提交Github，Travis自动发布。
皮肤：[next](http://theme-next.iissnan.com/getting-started.html)
后续需要的插件陆续添加吧。
主要参考的文章：
* [Travis CI](https://segmentfault.com/a/1190000021987832)
* [Hexo部署](https://kchen.cc/2016/11/12/hexo-instructions/)

