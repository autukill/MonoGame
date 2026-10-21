# MonoGame WebGL2 维护与复现

来源与固定版本见 upstream.json；规则见 docs/maintenance.md；本机路径见 docs/environment-20261021.md；问题与历史实验见 docs/fixes.md。

首次准备子模块：
```powershell
git submodule update --init --recursive external/stb ThirdParty/StbImageSharp ThirdParty/StbImageWriteSharp native/monogame/external/sdl2 native/monogame/external/faudio
```
本机 SDK 的 global.json 固定 .NET 11 RC2。在仓库根目录执行 `dotnet workload install wasm-tools --skip-manifest-update` 安装对应工作负载。

在本目录安装固定的浏览器测试依赖：`npm ci --no-audit --no-fund`。
准备脚本只在隔离 node_modules 中关闭 Playwright 1.56.1 强制焦点模拟，避免所有标签页被强制报告为可见；这项测试设施变更不是 MonoGame 修复。

先提交干净源码，再从仓库根目录执行（OutputRoot 必须为全新目录）：
```powershell
./mge/webgl2/build.ps1 -OutputRoot D:/Projects/Games/MyGameEnginePlaygrounds/monogame-webgl2-maintenance-evidence/baseline -PackageVersion 3.8.7-webgl-mge.0
node ./mge/webgl2/run.mjs D:/Projects/Games/MyGameEnginePlaygrounds/monogame-webgl2-maintenance-evidence/baseline/publish/wwwroot D:/Projects/Games/MyGameEnginePlaygrounds/monogame-webgl2-maintenance-evidence/baseline/results
```

本地包仅用于复现，以独立版本匹配 Framework 和 runtime；不公开发布，也不覆盖官方 NuGet 缓存。Runtime.csproj 是打包适配层，直接打包本 checkout 的 Host/BrowserGame 与输出目录的三个原生 archive，不依赖源码树内 Artifacts。
修复后用新版本与新目录重新构建，避免 NuGet 复用旧包。`-Stage Managed` 仅用于原生源码未变化时复用同目录的已编译 archive；必须显式给出新 PackageVersion。

测试使用真实有界面 Edge，每个案例新页面，记录 PID，并关闭本任务浏览器和 loopback 服务。测试范围包括首帧/像素、前后台、正常退出、stop 幂等/首帧前/初始化阶段/后台、上下文丢失终止。不测试同页 runtime 重建，也不代表微信小游戏真机验证或 AOT/性能验收。
