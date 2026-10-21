# MGE-WEBGL-001：隐藏页面的 stop 不依赖下一帧

适用并已复现的上游基线：dded52074d8358504f93d9da8c3ddd9241d2fd46（官方 PR #9559 / 作者 webgl2）。其他版本必须重新核查。修复提交通过 `git log --all --grep=MGE-WEBGL-001` 定位，最终验证摘要记录完整 SHA。

## 复现与原因

构建本线的未修复提交 f37ba49d9，运行 README 中的浏览器复现入口。使用真实标签页切换，确认 document.hidden=true 后调用公开 host.stop()，保持隐藏等待 5 秒。
上游 RequestStop 只调用 Game.Exit() 设置退出标志。Game 的 Exiting、UnloadContent 与 RunAsync 完成仍需一次 Game.Tick；隐藏页的 Emscripten requestAnimationFrame 已暂停，故 stop Promise 未完成、isDisposed=false、Game.Dispose=0。变量时间步和固定时间步均失败，另外九项通过。

## 修改边界

仅修改 BrowserGame.cs：将已有带异常处理的帧逻辑抽成 TickGame；RequestStop 设置退出标志后驱动最后一次 tick，保持 Game 原有退出、卸载与 Dispose 路径。
增加 tick 重入守卫；如果 stop 在首帧 JS 回调内提出，当前 tick 返回 Game 后再处理退出，不递归进入正在执行的 tick。不新增浏览器帧循环、计时器或公共接口，不重建 Game/runtime，不改变其他后端。

## 回归

共用 Probe/run.mjs 覆盖变量/固定时间步的隐藏停止和首帧回调停止、stop 幂等、首帧前和 runtime/content 初始化中 stop、GPU 像素、前后台恢复、正常 Game.Exit 和上下文丢失终止。
隐藏停止必须在 5 秒内完成，且 Exiting=1、Dispose=1；完成后 Update/Draw 不再增长。记录与原版使用相同测试入口和工具链。
本提交先保存复现、原因、补丁和回归入口；维护版实测结果在后续验证摘要中记录，不把编译成功当作运行通过。
