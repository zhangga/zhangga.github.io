# zhangga.github.io.source

source 分支才是 blog 真正的编辑源文件。

master 分支是自动发布的产物。

## init

1. clone 到本地后，安装 hexo：npm install hexo-cli -g
2. 初始化环境，进入 zhangga.github.io 目录：执行 npm install
3. 本地测试：hexo server
4. 发布：直接提交 GitHub 自动发布，走的是 Github Actions，流程在.github/workflows/中。
5. 安装 uPic 图床工具一键上传图片，直接获得 Markdown 语法。

## 常用命令

1. 新建博文：hexo new post $title
2. 新建草稿：hexo new draft $title
3. 目录：source_posts
4. https://typora.io/ 工具
