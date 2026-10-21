# 官方 WebGL2 可用状态与 Monster 接入时机

核查时间：2026-10-21 20:50:47（Asia/Shanghai，北京时间）。
本机 API 快照：[webgl2-upstream-status-20261021.json](../validation/webgl2-upstream-status-20261021.json)。

**结论：可基于固定维护基线做浏览器接入试验，尚不能按官方稳定平台交付 Monster。**

## 官方最新状态

| 项目 | 实时 API 结果 |
|---|---|
| PR | [MonoGame/MonoGame #9559](https://github.com/MonoGame/MonoGame/pull/9559) |
| 状态 | open、draft=true、merged=false，标签 needs-review，审核列表为空 |
| 合并状态 | mergeable=false、mergeable_state=dirty：当前存在合并冲突，不代表运行时不能启动 |
| 规模 | 122 commits / 95 changed files；这是相对 develop 的总差异 |
| 里程碑 | 3.8.7，仅为计划，不代表已发布 |
| 最新稳定 Release | [v3.8.6](https://github.com/MonoGame/MonoGame/releases/tag/v3.8.6)，2026-10-07 |
| PR head、官方 PR ref、作者 webgl2 | 均为 8a9388463e9e9dc63d1a3bad6b3a75964bd3a86b |
| 最新提交 | defer adaptive canvas resizing until first frame，2026-10-21 13:19:41 北京时间 |
| head CI | check-runs=0、statuses=[]、combined=pending/total_count=0、PR-triggered workflow_runs=[]；不是通过结果 |

公开 PR HTML 缓存仍显示 117 commits 和旧时间线，本记录以实时 API 及两个来源引用一致性为准。
审批、冲突、CI 和分支都需要在下一次核查时重新确认。

## 相对已验证基线的增量

[dded5207 → 8a938846 精确比较](https://github.com/AristurtleDev/MonoGame/compare/dded52074d8358504f93d9da8c3ddd9241d2fd46...8a9388463e9e9dc63d1a3bad6b3a75964bd3a86b)：
只有一个新提交、两个 JS 文件变化。

- browser-window.js：分离 Adaptive 画布尺寸接管与观察；保存初始设备像素尺寸，忽略首个相同尺寸报告，拒绝零尺寸。
- monogame-web-host.js：先配置尺寸管理，在托管首帧报告之后才启动尺寸观察。
- 影响判断：启动首帧、DPR 和自适应画布尺寸的时序修正。未合入、未运行最新提交，不能记录为 Monster 的首帧问题已解决。
- 这一个增量没有修改 Framework、原生库或 BrowserGame.cs。BrowserGame 在两个版本的 Git blob 均为 8b8342a8be4818b44edd60c90daa79072398c967。

文件位于 src/NuGetPackages/MonoGame.Runtime.Browser.WebGL2/Host。

## 本地源码与已验证状态

| 项目 | 本机记录 |
|---|---|
| 维护仓库 | D:\Projects\Zhao\MyGameEngine-MonoGame |
| 主目录维护线 | mge/3.8.6，HEAD edda53be5bc5200a756256e203726589dad760d2，为 DX12 线 |
| WebGL 工作树 | D:\Projects\Games\MyGameEnginePlaygrounds\monogame-webgl2-maintenance |
| WebGL 分支 / HEAD | mge/webgl2 / 7bc100e013d82846e089492bb91e40d4c080eabc |
| 固定已验证上游 | dded52074d8358504f93d9da8c3ddd9241d2fd46 |
| 本地 remote-tracking refs | upstream/pr/9559、webgl-upstream/webgl2 仍为 dded5207；本次未 fetch 或 merge |
| 实验包 | 3.8.7-webgl-mge.1，不是官方正式包 |
| 既有测试摘要 | WebGL 工作树下 mge/webgl2/validation/20261021/summary.json |
| 构建与大日志 | D:\Projects\Games\MyGameEnginePlaygrounds\monogame-webgl2-maintenance-evidence |

既有浏览器探针结果：未修复上游 9/11，维护版 11/11。
覆盖首帧/GPU 四色读回、真实标签页前后台、正常退出、幂等 stop、初始化/后台 stop、上下文丢失终止。
这不是最新 head、Monster 浏览器、Safari、NativeAOT-LLVM 或性能认证。

MGE-WEBGL-001 修复为 c7cb31fbf1b96a4374ee083ac1b3d75bd6fbd20d：
隐藏页 requestAnimationFrame 暂停时，也能完成最后一次退出 tick、Exiting 和 Dispose。
最新上游 BrowserGame.RequestStop 仍只有设置退出标志和 Game.Exit；该机制未改变。
最新版本的运行复核仍待完成，不能把该问题标成官方已修复。

## 工具链与能力边界

既有浏览器探针使用本机 SDK 11.0.100-rc.2.26504.105 / wasm-tools；
根目录 D:\Apps\Development\Emscripten-6.0.2-dotnet11-rc2，微软包标识 Emscripten.6.0.2，实际 emcc 6.0.3。
其余绝对路径见 WebGL 工作树的 mge/webgl2/docs/environment-20261021.md。

主对话的 Monster 微信 NativeAOT-LLVM 结果不能直接替代浏览器验证。
后续沿用 .NET 11 RC2 SDK、net10.0、NativeAOT-LLVM 时，仍须独立验证浏览器启动胶水、裁剪、双向互操作、
SDL/FAudio/FreeType/HarfBuzz 原生链接。不能将这份浏览器探针的 6.x archives 与 LLVM 路线 3.1.56 archives 混用。

- [官方后续能力 #9544](https://github.com/MonoGame/MonoGame/issues/9544) 仍列有手柄震动、鼠标侧键、Mouse Lock 设计和独立 MRT 混合等延后项。
- 单输出 SpriteBatch、多次切换 RenderTarget 与独立 MRT 混合不同。完整战斗效果需逐项审计，不能用一个绘制探针认证。
- 最新源码仍在上下文丢失时终止并要求整页重载；没有自动恢复保证。同页 .NET runtime 重建也不在本地既有验收范围。
- 浏览器下载、缓存、持久化存档、音频手势、窗口/DPR/全屏及 Safari，均需要宿主专项验证。
- 微信文件 API、WXWebAssembly 与微信生命周期胶水不可直接照搬。IndexedDB/IDBFS 等浏览器存档需明确异步持久化时机，内存文件系统写入不等于落盘。

## Monster 何时开始

建议现在可以做轻量准备；正式实现以微信菜单基线收敛为起点，不必以官方合并日为唯一前提。

1. 当前可以确定浏览器独立宿主边界、固定维护包和原生依赖清单。
2. 主对话将“Loading → 新闻 ↔ 军械库／装备、资源常驻、动态字体、本地存档”形成已提交、可复现、验收明确的基线后，
   在新的 MyGameEngine 隔离工作树接入浏览器新闻页；不必等微信全部战斗/音频完成，也不必等 3.8.7 正式发布。
3. 第一阶段验证 NativeAOT-LLVM 启动、Loading/News 与 GPU 像素、中文动态字体、键鼠/触摸、前后台、存档落盘重载、
   退出与整页再次启动，再扩展军械库／装备。保留 Runtime 和场景，复用资源清单、裁剪规则、渲染与字体原生库，单独提供浏览器宿主。
4. 对外发布前再补齐浏览器矩阵、音频手势、冷启动下载/缓存、内存及长时间运行、完整战斗和静态部署验证，并重新评估官方基线与维护 Fix。

本次只记录本地文档和 API 证据；未启动构建、浏览器、微信开发者工具，未修改源码、依赖包、分支或 refs。
