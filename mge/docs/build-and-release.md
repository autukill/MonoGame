# 可复现构建、回归与发布

需要Windows x64、Visual Studio 2026 C++桌面工具/CMake、Python 3和.NET 11 SDK。
先按upstream.json还原SDL和stb子模块；官方MonoGame.Runtime.Windows.DX12 3.8.6
用于提取并核对六份原始Effect字节码，其SHA256固定。不会修改该官方DLL或缓存。

```powershell
./mge/build.ps1 -OutputRoot ./mge/out/release-1
./mge/pack.ps1 -BuildRoot ./mge/out/release-1 -OutputRoot ./mge/local-feed
```

构建直接使用维护源码，生成头文件只进入输出目录，未调用旧补丁脚本。
源码必须已提交且干净；构建脚本执行源码检查、172导出/六Effect核对及独立原生生命周期。
详细结果见输出目录abi-effects.json、lifecycle.log及payload/provenance.json。
独立GraphicsProbe可用本地源还原后串行构建，运行时传入预期原生DLL哈希。
原生probe包含三次设备生命周期、mip像素/首次重复耗时、query满容量和分页描述符GPU验证。

所有托管构建均设置MSBUILDDISABLENODEREUSE=1、DOTNET_CLI_USE_MSBUILD_SERVER=0，
参数为--disable-build-servers -m:1 -nr:false -p:UseSharedCompilation=false
-p:BuildInParallel=false -p:RestoreBuildInParallel=false。
原生构建使用--parallel 1 -- /m:1 /nr:false /p:UseSharedCompilation=false /p:BuildInParallel=false。
先等待上个构建结束，再运行编译产物和测量；只清理本任务已核对PID/启动时间的进程。

发布前完成同源空窗口、绘制回归、引擎本地包接入；上传现有NuGet网页并核对元数据后提交。
发布后等待验证完成，从nuget.org用独立空缓存重新还原并核对内部DLL哈希。
NuGet可能对包追加仓库签名，公开下载nupkg整体哈希须单独记录，内部DLL应保持一致。
不存储API key；已发布版本不可覆盖，后续修订递增mge.N。正式结果另记交付报告。

## 自包含复现入口

- `mge/tests/Blank`：真实可见1280x720、HiDef、60Hz/VSync空窗口，可Release JIT或NativeAOT + Full Trim。
- `mge/tests/GraphicsProbe`：常规运行传入DLL SHA256，验证混合mip绘制；
  `--constant-ring OUTPUT SHA256`额外验证5000次跨帧上传及像素。
- `mge/tests/native`：COM/mip生命周期、首次使用计时、满容量描述符、query回归。
- `mge/measure-empty-window.ps1`：在独立副本中替换受测DLL，记录实际加载模块与哈希，
  对相同EXE测官方原版/同源未修复/维护版；不修改任何基线、NuGet缓存或真实应用输出。

共用初始化与断言工具，不为六项问题复制六套窗口工程。源码检查只作为边界守卫，
不能代替上面的可运行复现和GPU/内存验证。每项文档指向对应的共用复现入口。

包内targets将许可证、第三方声明与provenance复制到消费者输出和发布目录的licenses/monogame-dx12/；原生DLL仍由标准NuGet运行库资产选择。

生产脚本同时拒绝未提交和未跟踪输入，包括被.gitignore隐藏但会进入native编译的文件；Git状态查询失败也会终止。可执行 `./mge/tests/verify-clean-source.ps1` 验证忽略头文件被拒绝。

## 空窗口统计汇总与验证归档

三配置各三轮的 mge/measure-empty-window.ps1 全部完成后，可只处理既有 JSON 汇总统计：

```powershell
python ./mge/summarize-empty-window.py ./mge/out/memory-final ./mge/out/memory-final/summary.json
```

输入目录含 official-1 至 official-3、same-source-unpatched-1 至 same-source-unpatched-3、maintained-1 至 maintained-3，各自含 process.json。汇总检查可见窗口、相同 EXE、实际 native 哈希、NativeAOT 模块身份和完成状态，输出 5/15/30/60 秒 WS、Private、Peak WS、累计 CPU 秒及逻辑核当量的三轮 min/median/max。该脚本只读既有采样并写汇总，不启动应用或构建。

测量脚本采样结束后按已核对身份停止进程；正常 Game.Exit() 测试另行记录。quiet 内存比较与 GPU 回读/绘制功能 probe 分别运行、分别解释。CPU 逻辑核当量不能当作整机 CPU 百分比。

2026-10-18 的小型交付证据保存在 mge/validation/20261018/，结论及覆盖边界见 [validation-20261018.md](validation-20261018.md)。不要提交大日志、截图、二进制或 NuGet 缓存。

