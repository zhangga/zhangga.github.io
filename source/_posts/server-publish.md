---
title: 服务器发布流程
tags:
  - 服务器
id: server-publish
categories:
  - 笔记
date: 2026-06-22 16:01:12
---

```
颜色含义：蓝色=准备阶段，绿色=预发布阶段，橙色=线上/正式服阶段。菱形为冒烟测试判断节点。
```

#1 客户端半强制更新 + 战场服滚动更新 + 营地服滚动更新
最完整的发布场景，涉及客户端更新、GS 热更、战场服与营地服同时滚动更新。
![sp-1.1.46cmngr1z.webp](https://github.com/zhangga/picx-images-hosting/raw/master/sp-1.1.46cmngr1z.webp)
![sp-1.2.46cmnht28.webp](https://github.com/zhangga/picx-images-hosting/raw/master/sp-1.2.46cmnht28.webp)
![sp-1.3.9ddmo1fjca.webp](https://github.com/zhangga/picx-images-hosting/raw/master/sp-1.3.9ddmo1fjca.webp)


#1 客户端半强制更新 + 战场服滚动更新
相比场景一，去掉营地服的部署与回收，其余客户端与战场服流程一致。
![sp-2.1.86ubffr9gu.webp](https://github.com/zhangga/picx-images-hosting/raw/master/sp-2.1.86ubffr9gu.webp)
![sp-2.2.86ubffr9gs.webp](https://github.com/zhangga/picx-images-hosting/raw/master/sp-2.2.86ubffr9gs.webp)
![sp-2.3.4qrznchmen.webp](https://github.com/zhangga/picx-images-hosting/raw/master/sp-2.3.4qrznchmen.webp)

#1 仅战场服滚动更新
无客户端更新，仅 DS 战场服版本滚动升级，引入「空闲 node 重启升级」的推送更新机制。
![sp-3.1.58i1bxk253.webp](https://github.com/zhangga/picx-images-hosting/raw/master/sp-3.1.58i1bxk253.webp)
![sp-3.2.4n8dpmplud.webp](https://github.com/zhangga/picx-images-hosting/raw/master/sp-3.2.4n8dpmplud.webp)

#1 仅营地服滚动更新
无客户端更新，仅营地服版本滚动升级，流程最为精简。
![sp-4.1.8dxjaveh1w.webp](https://github.com/zhangga/picx-images-hosting/raw/master/sp-4.1.8dxjaveh1w.webp)
![sp-4.2.7p49quqy1l.webp](https://github.com/zhangga/picx-images-hosting/raw/master/sp-4.2.7p49quqy1l.webp)
