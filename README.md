# zhangga.github.io.source

source 分支才是 blog 真正的编辑源文件。

master 分支是自动发布的产物。

## 新电脑初始化

1. 安装 Git 和 Node.js。
2. clone 仓库并切换到 `source` 分支。
3. 在仓库根目录执行对应系统的初始化脚本。

初始化脚本会自动拉取 Git Submodule、执行 `npm ci`、验证 Hexo 构建，并在成功后启动本地服务：

Windows：

```powershell
.\init.cmd
```

macOS / Linux：

```bash
bash ./init.sh
```

如果只初始化和验证环境、不启动本地服务：

```powershell
.\init.cmd -SkipServer
```

```bash
bash ./init.sh --skip-server
```

不需要全局安装 `hexo-cli`。发布时直接提交到 GitHub，GitHub Actions 会执行发布流程。

## 图床
1. 在线：https://picx.xpoet.cn/#/upload
2. Mac下可使用uPic，Win下可使用PicGo

## 皮肤
1. 现在使用https://github.com/HiNinoJay/hexo-theme-A4，git submodule的方式

## MarkDown
```
推荐使用飞书编写，然后复制到下面的在线markdown，拷贝出md文件
```
1. 在线：https://markdown.lovejade.cn/
2. https://typora.io/ 工具

## 常用命令

1. 新建博文：hexo new post $title
2. 新建草稿：hexo new draft $title
3. 本地推送发布：hexo g && hexo d
4. 目录：source/_posts
