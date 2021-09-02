---
title: 使用Flutter进行APP开发流程
date: 2018-11-22 19:34:22
tags:
  - 笔记
id: flutter-dev
categories:
  - 笔记
---

[![hBsVC6.md.png](https://z3.ax1x.com/2021/09/01/hBsVC6.md.png)](https://imgtu.com/i/hBsVC6)

# 资源加载：

### 1.本地

```
static const String DEFAULT_USER_ICON = 'static/images/logo.png';
Image.asset(AppICons.DEFAULT_USER_ICON, width: AppICons.USER_ICON_WIDTH, height: AppICons.USER_ICON_HEIGHT),
```

### 2.iconfont。 https://www.iconfont.cn/

在iconfont网站上传资源。下载到本地，放入项目资源文件夹下。

pubspec.yaml中配置。

```
fonts:
  - family: myIconFont
    fonts:
      - asset: static/font/iconfont.ttf
```

### 3.UI编辑器。 https://norbert515.github.io/widget_maker/website/

https://github.com/Norbert515/flutter_ide

项目中使用：

```
static const String FONT_FAMILY = 'myIconFont';
static const IconData LOGIN_USER = const IconData(0xe652, fontFamily: AppICons.FONT_FAMILY);
iconData: AppICons.LOGIN_USER,
```

# 原型开发：

https://www.xiaopiu.com/

在上面设计开发，然后导出到本地，可以查看里面的资源文件。
