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
