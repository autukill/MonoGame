# 2026-10-21 验证与交付记录（北京时间）

WebGL 官方 PR #9559 和作者 webgl2 引用均为 dded52074d8358504f93d9da8c3ddd9241d2fd46，完整祖先历史 13,855 个提交，非 shallow 主仓库。维护仓库位于 D:\Projects\Zhao\MyGameEngine-MonoGame，独立工作树、工具和机器路径见 environment-20261021.md。

## 原版对照与修复

- 未修复上游源码加复现设施：`f37ba49d9820f31ab075017c61c02e4ed2d1b390`。
- 唯一运行时修复 MGE-WEBGL-001：`c7cb31fbf1b96a4374ee083ac1b3d75bd6fbd20d`。
- 原版 **9/11**，维护版 **11/11**。失败负对照仅为隐藏标签页中的变量/固定时间步 stop，5 秒超时后 Promise 未完成、Game 未 Dispose；修复后两项均正常退出，Exiting/Dispose 各一次，随后更新与绘制计数稳定。
- 其余通过项：首帧/GPU 四色读回、真实前后台恢复、Game.Exit、stop 幂等、首帧回调内 stop（固定/变量步）、托管首帧前 stop、runtime 创建/内容加载中 stop、上下文丢失终止。

不通过伪造 visibilitychange 或覆盖 document.hidden 测试。Playwright 强制焦点模拟的隔离依赖调整单独记录在 prepare-playwright.mjs；移除其后台节流绕过参数。

旧 7b3e80bb 的 dispose 和同页 runtime 实验原始 JSON 保留，但旧 RequestExit/URL 模块隔离补丁没有迁入。当前采用上游 ready/stop 契约，不增加同页重建功能。

## 来源与构建边界

本机 C:\Program Files\dotnet 中的 .NET 11 RC2 与新安装 wasm-tools 已实际用于构建；Node 为 D:\Development\nodejs\node.exe 26.8.2。CMake/Ninja/Python 运行于用户指定的 Emscripten 根目录，没有使用历史私有 SDK。

258 个原生编译步骤来自已提交的 1a96767b4，之后只在确认原生输入无变化的条件下复用三个 archive。baseline/maintained provenance 分别记录整体源码与原生源码来源；两个版本的 mgruntime.a、SDL2、FAudio SHA256 完全相同，Framework 源码树亦相同。只有 BrowserGame 的退出逻辑发生产品源码变化。

首次探针命名空间被仓库分析规则拒绝，修正后提交 5afa8bbd4；此失败日志保留，不当作上游问题。Wasm 内部 Emcc 编译并行设置随后补齐于 f37ba49d9。未重编未变化的原生库，不把后续复用说成又完整执行了 258 步。

已实际验证忽略的 native/opengl/*.ogl.mgfxo.h 临时输入被干净源码守卫拒绝，并在 finally 中删除；恢复后检查通过。构建和浏览器测试均已结束，进程清理记录见 JSON。

## 证据位置

仓库内 ../validation/20261021/ 包含：原版/维护版运行结果、各自 provenance、环境与 archive/Framework 对比摘要、引用跟踪和进程清理记录。保留历史复现的独立 JSON，避免混淆新旧来源。

本机大日志与产物位于 `D:\Projects\Games\MyGameEnginePlaygrounds\monogame-webgl2-maintenance-evidence`：baseline-build.log、baseline-managed-build.log、baseline-fixed-step-build.log、maintained-build.log，以及 baseline/results-fixed-step、maintained/results 下的 JSON/绘制截图。没有把二进制、截图、SDK、node_modules 或 NuGet 缓存提交进 Git。

只推送用户自有 autukill/MonoGame 的 mge/webgl2 分支；不向官方/作者提交 issue 或 PR，不公开 NuGet，不更改 MyGameEngine 产品接入。DX12 mge/3.8.6 保持 edda53be5bc5200a756256e203726589dad760d2。没有微信真机、AOT、性能、runtime 完整内存回收或上下文恢复结论。
