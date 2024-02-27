---
title: 给lua函数添加调用时长限制
date: 2024-02-27 14:27:24
tags:
    - 笔记
id: lua-settime
categories:
	- 笔记
---

## 遇到的问题

战斗验证服务会调用客户端同学写的lua函数，lua写出了死循环导致内存飙升最终OOM

## 解决办法

用lua的debug.sethook方法加调用钩子

```Bash
-- 设置一个时间限制钩子
function set_time_limit(seconds)
    local start = os.clock()
    debug.sethook(function()
        if os.clock() - start >= seconds then
            debug.sethook() -- 移除钩子
            error("Time limit exceeded") -- 终止执行
        end
    end, "", 1e7) -- 第三个参数是钩子的调用频率，这里是每执行大约1000万条指令检查一次
end
```

