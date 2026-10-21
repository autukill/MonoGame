# 本机环境（2026-10-21，北京时间）

本文件是本机实际路径记录；换机可通过 build.ps1 参数指定 ToolchainRoot、DotNetRoot、NodeExecutable。不要把本机路径视为上游要求。

| 项目 | 本机路径 / 版本 |
|---|---|
| 操作系统 | Windows 11 专业工作站版，10.0.26300，64 位 |
| PowerShell / Git / Edge | 7.6.7 / 2.49.0.windows.1 / 155.0.4283.62 |
| Git 维护仓库 / DX12 工作树 | `D:\Projects\Zhao\MyGameEngine-MonoGame`，`mge/3.8.6` |
| WebGL 工作树 | `D:\Projects\Games\MyGameEnginePlaygrounds\monogame-webgl2-maintenance`，`mge/webgl2` |
| 构建与大日志 | `D:\Projects\Games\MyGameEnginePlaygrounds\monogame-webgl2-maintenance-evidence` |
| 历史探针 | `D:\Projects\Games\MyGameEnginePlaygrounds\monogame-webgl2-probe`，仅用于历史证据 |
| .NET 主机 | `C:\Program Files\dotnet\dotnet.exe` |
| SDK | `C:\Program Files\dotnet\sdk\11.0.100-rc.2.26504.105` |
| wasm-tools | 本机 SDK 安装；运行时/工具 pack `11.0.0-rc.2.26504.105`，位于 `C:\Program Files\dotnet\packs` |
| Node | `D:\Development\nodejs\node.exe`，26.8.2；使用本机安装 |
| 工具根目录 | `D:\Apps\Development\Emscripten-6.0.2-dotnet11-rc2` |
| CMake | 工具根目录下 `cmake\bin\cmake.exe`，4.3.1-msvc1，包含完整 bin/share/doc 支持文件 |
| Ninja | 工具根目录下 `ninja\ninja.exe`，1.13.2 |
| Python | 工具根目录下 `python\python.exe`，3.13.3，64 位 |
| Emscripten | 工具根目录下 `upstream\emscripten\emcc.bat`，实际 6.0.3，微软包标识 Emscripten.6.0.2 |
| LLVM / Binaryen | 工具根目录下 `upstream\bin` / `upstream` |
| 只读种子缓存 | 工具根目录下 `seed-cache\emscripten\cache`；构建可写缓存位于本次输出目录 |
| Git | `C:\Program Files\Git\cmd\git.exe` |
| 浏览器 | `C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe`，运行结果记录实际版本 |

CMake/Ninja 来源为 Visual Studio 18 Community 自带发行目录的副本，原安装保留；Python/Emscripten 来自微软对应 RC2 workload 包。没有搬迁 SDK、workload 或 Node，也没有修改系统 PATH。
原 CMake/Ninja 来源目录为 `D:\Apps\Development\Microsoft Visual Studio\18\Community\Common7\IDE\CommonExtensions\Microsoft\CMake\CMake` 和同级 `Ninja`。迁移时完整复制 CMake 的 bin/share/doc/Microsoft 目录，Ninja 复制发行目录；Python 已在工具根目录，核对后原位复用。
本轮明确通过本机 dotnet 安装 wasm-tools；不依赖历史探针的 `.tools/dotnet`。安装日志记录系统有挂起重启提示，但安装成功；构建验证结果另记，不自动重启电脑。

工具根目录的 deployment.json 记录来源和路径，Activate.ps1 仅影响当前终端。维护构建脚本直接传工具路径，SDK 的 Node 环境项由复现项目替换为本机 Node，不修改 SDK/NuGet 文件。
每次构建的 provenance.json 记录源码、子模块、工具路径/SHA256、Node/SDK 版本和 Wasm/JS 产物哈希。
wasm-tools 安装列表确认 `11.0.100-rc.2.26504.105/11.0.100-rc.2`，对应 pack `11.0.0-rc.2.26504.105`；机器 workload-set 为 `11.0.100-rc.2.26509.2`。这些版本标签含义不同，不应混写为同一个版本。

CMake 4.3.1 的 Emscripten shared-library 警告保留在日志中，本线使用静态 archives。不能据此声称验证过共享库支持。
