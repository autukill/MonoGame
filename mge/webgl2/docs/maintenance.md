# WebGL2 自维护与同步

本线是用户自有 fork 的 `mge/webgl2`，跟踪官方 PR #9559 的作者分支，不代表 MonoGame 官方发布。
官方原始 AI 贡献规则存档于 upstream-agent-policy.md；自维护以根 MGE-CONTRIBUTING.md 和 AGENTS.MD 为准。禁止向官方或作者仓库提交本线的 issue/PR/内容。

完整历史保存在同一 Git 仓库；主仓库不是 shallow clone。作者 remote `webgl-upstream` 与官方 `upstream` 的 push URL 均禁用。自有 fork 使用 `github` remote。
DX12 `mge/3.8.6` 工作树保持原状，本线在独立工作树运行。只有构建必要子模块被初始化，精确 SHA 见 ../upstream.json；子模块允许浅取固定 SHA，主仓库提交历史不截断。原有 blob:none 克隆按需取得源码对象，不等于浅提交历史。

## 同步

在本维护工作树运行 `../sync.ps1`。默认只更新作者分支和官方 PR 引用并检查二者相同，打印与固定基线的差异；不自动合入。`-Merge` 明确合并增量，须工作树干净、作者历史未改写，使用新合并提交保留已推送历史。随后审查变化、更新 upstream.json、逐项复现台账、提交，再使用新输出目录构建验证。最终验证后才推送。不得 force-push 或仅因 cherry-pick 能应用就认定修复适用。

上游合并或正式发布后另建对应 `mge/<version>` 发行版线，重新确认哪些自维护补丁仍需要；不把实验线冒称正式版。

## 变更规则

每个 Fix/Change 独立提交，并记录现象、基线、复现命令、原因、范围、验证及上游状态。只修复 MyGameEngine 需要且属于上游支持范围的行为。
本轮保留 ready/stop 接口，不增加同页 runtime 重建、iframe、重新创建 Game 的“再开一局”功能。再开一局由游戏内部实现。

源码、文档、复现入口先提交，再构建。构建前后拒绝脏源码、未登记子模块和被忽略的原生编译输入。生成 Effect 头文件只进入输出目录，不写入 native/opengl。
原生 Ninja 构建 `--parallel 1`、`EMCC_CORES=1`；托管构建设置 MSBUILDDISABLENODEREUSE=1、DOTNET_CLI_USE_MSBUILD_SERVER=0，并传 --disable-build-servers -m:1 -nr:false -p:UseSharedCompilation=false -p:BuildInParallel=false -p:RestoreBuildInParallel=false。
Wasm SDK 内部编译另传 DisableParallelEmccCompile=true、DisableParallelAot=true；不能仅依赖 MSBuild 单节点控制该任务的内部并行。
只运行已发布产物作后续测试，不反复构建；核对并关闭本任务进程，保留进程身份记录。不要提交大日志、二进制、node_modules、SDK 或 NuGet 缓存。
