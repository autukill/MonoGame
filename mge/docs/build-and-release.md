# 可复现构建、回归与发布

需要 Windows x64、Git、Visual Studio 2026 C++ 桌面工具及 Windows SDK/CMake、
**64 位 Python 3** 和 .NET 11 SDK。Python 的 ctypes 会载入 x64 DLL，不能使用 32 位 Python。
构建脚本通过 vswhere 查找 Visual Studio，不要求本机示例中的安装路径。

在维护分支的仓库根目录还原固定子模块；具体提交见 mge/upstream.json：

```powershell
git submodule update --init external/stb native/monogame/external/sdl2
git -C native/monogame/external/sdl2 submodule update --init sdl
git submodule status --recursive
```

官方 MonoGame.Runtime.Windows.DX12 3.8.6 用于提取并核对六份原始 Effect 字节码，
DLL SHA256 固定为 1179B04B0AA1F983DD50E37F03D797040E35E9A3A13A50B34D7A776CF0DE8AB0。
构建脚本不会下载官方包、初始化子模块或修改官方 DLL/缓存。
默认从 USERPROFILE/.nuget/packages/monogame.runtime.windows.dx12/3.8.6/
runtimes/win-x64/native/mgruntime.dll 读取；此默认值不跟随 NUGET_PACKAGES。
若该文件不存在，可在独立依赖目录准备官方包：

```powershell
$taskPrerequisites = Join-Path $env:TEMP ('mge-dx12-prerequisites-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $taskPrerequisites | Out-Null
$taskOfficialPackage = Join-Path $taskPrerequisites 'official-3.8.6.nupkg'
Invoke-WebRequest 'https://api.nuget.org/v3-flatcontainer/monogame.runtime.windows.dx12/3.8.6/monogame.runtime.windows.dx12.3.8.6.nupkg' -OutFile $taskOfficialPackage
$taskOfficialRoot = Join-Path $taskPrerequisites 'official-3.8.6'
[IO.Compression.ZipFile]::ExtractToDirectory($taskOfficialPackage, $taskOfficialRoot)
$taskOfficialRuntime = Join-Path $taskOfficialRoot 'runtimes/win-x64/native/mgruntime.dll'
(Get-FileHash -LiteralPath $taskOfficialRuntime -Algorithm SHA256).Hash
./mge/build.ps1 -OfficialRuntime $taskOfficialRuntime -OutputRoot ./mge/out/release-1
```

这个过程只准备官方对照 DLL，不需要先还原依赖自维护包的 Blank/GraphicsProbe。
OutputRoot 必须是尚不存在的目录；源码、维护文档和回归须先提交，满足干净源码检查。
若默认位置已有匹配的官方 DLL，则直接使用以下命令：

```powershell
./mge/build.ps1 -OutputRoot ./mge/out/release-1
./mge/pack.ps1 -BuildRoot ./mge/out/release-1 -OutputRoot ./mge/local-feed
```

构建直接使用维护源码，生成头文件只进入输出目录，未调用旧补丁脚本。
源码必须已提交且干净；构建脚本执行源码检查、172导出/六Effect核对及独立原生生命周期。
详细结果见输出目录abi-effects.json、lifecycle.log及payload/provenance.json。
独立GraphicsProbe可用本地源还原后串行构建，运行时传入预期原生DLL哈希。
原生probe包含三次设备生命周期、mip像素/首次重复耗时、query满容量和分页描述符GPU验证。

### DX12 设备移除诊断（独立交付）

`./mge/build.ps1 -StartupDiagnostics -OutputRoot ./mge/out/startup-diagnostics-1`
显式打开默认 OFF 的 `MGE_DX12_STARTUP_DIAGNOSTICS` 编译开关。
此 DLL 在原有失败路径抛出异常前向 stderr 刷新失败 HRESULT、调用表达式、源码行、
初始化阶段，以及对当前实际设备调用 `GetDeviceRemovedReason` 的结果。
已创建设备且未移除时保留 S_OK；设备尚未创建或已清除时明确输出 UNAVAILABLE，
不得把外层 DXGI_ERROR_DEVICE_REMOVED 或无设备时的占位值当成查询结果。
现有交换链设备重置回调之前也记录原因。桌面其他后端和 Xbox 不接入这些钩子。

诊断注册暂持有当前设备的 COM 引用，Reset/销毁时按身份释放；查询复制引用以避免
与清理并发使用悬空指针。阶段属于调用线程，其他工作线程失败会标明本线程阶段未知。
诊断开关本身不增加新 ABI 导出；普通构建不包含这些诊断日志。
诊断版本对原来未检查的分配器调用额外检查 HRESULT，以保留最早失败证据。
根签名序列化／创建在普通和诊断构建均检查 HRESULT，并用 COM 智能指针清理临时 blob。

构建继续执行 172 导出／六 Effect 核对及三次设备生命周期，额外运行独立
`dx12-diagnostics.exe`：验证无设备、真实 WARP 设备 S_OK、异常调用位置、
仅移除此私有软件设备后的实际非 S_OK 原因，以及清除后不再查询。
强制 RemoveDevice 只存在于独立测试可执行文件，不在 DLL／玩家中。
provenance 的 diagnosticRuntime=true 使正式 pack.ps1 拒绝打包；不得覆盖公开维护包、
NuGet 缓存或已经验收的游戏目录。应复制已发布游戏至独立诊断目录，仅替换该 DLL，
携带原 EXE 与新 DLL 哈希、源码提交及启动日志脚本；最终原因仍须故障机器复测。

### Tier 1 根签名与描述符表兼容

2026-10-28 用户指定后续验证使用独立探针。优先交付
`mge/tests/Dx12RootSignatureProbe` 的原生独立项目，不再复制Monster作为复测载体。
项目直接链接Windows SDK，分别创建两台设备A/B比较原六参数无界根布局与16槽布局，
记录实际Tier／各调用HRESULT／GetDeviceRemovedReason，并对16槽布局离屏绘制后
回读全部256像素。构建入口为该项目下 build.ps1；包内 Run-Probe.cmd 自动生成结果目录，
无MonoGame、引擎、游戏资源、存档、音频或.NET运行时依赖。用户返回 probe-results-*。
完整流程、结论分类和能力边界见该项目 README.md；旧Monster候选只保留为历史产物。

2026-10-28 Yoga 新诊断在默认根签名创建时返回 E_INVALIDARG (0x80070057)，
实际 GetDeviceRemovedReason=S_OK。最早已定位的问题是 CreateRootSignature 拒绝输入，
不能再把此前未检查失败之后的 DEVICE_REMOVED 当成最早原因。
当次日志尚未采集 ResourceBindingTier；新诊断注册设备时补记实际查询状态和绑定等级。

后端原本只支持16纹理／采样器槽，却对每个图形阶段声明无界范围。修复查询
D3D12_OPTIONS，仅在 ResourceBindingTier=1 时使用16个描述符的有界根表，
并对每张图形表的空洞和尾部填充空SRV／默认采样器，绑定未使用阶段的完整空表。
相邻图形表保留完整16槽，空表在每帧复用；已使用的描述符与空表不共享可变位置。
Tier 2/3保留原根签名及动态长度分配，compute的SRV/UAV布局也保持原有长度。
每帧GPU可见堆容量仍为65536 SRV/UAV及2048采样器，Tier 1下对应最多4096／128张完整表；
已有采样器集合缓存继续复用表。未实现自动扩堆或超过此容量的中途提交。

`dx12-lifecycle --tier1-bindings` 仅在独立测试可执行文件强制低等级路径，
正式／诊断DLL不含该参数或强制开关。构建依次运行真实等级及强制Tier 1三次生命周期；
额外创建有界根签名，GPU回读16槽稀疏表／空洞／尾部／下一张空表，检查compute分配
保持单槽、相邻表不重叠，以及150次空采样器表复用不耗尽堆。
保留 mip、CPU描述符分页、query及设备移除检查；故障设备复验仍单独记录。
限制依据：[Hardware Tiers](https://learn.microsoft.com/en-us/windows/win32/direct3d12/hardware-support)、
[Creating a Root Signature](https://learn.microsoft.com/en-us/windows/win32/direct3d12/creating-a-root-signature)。

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

### BC7 配套维护包（3.8.6-mge.3）

使用 `mge/build-maintained-dx12.ps1 -OutputRoot <新目录> -NuGetConfig <配置文件> -PackagesDirectory <独立缓存>`
从同一干净提交生产 Runtime 和 Framework 两个包。版本由 `mge/upstream.json` 统一，
托管编译使用 `MgeMaintainedFramework=true`，默认官方打包入口不变。
两个包必须配套使用；Framework 程序集身份仍为 MonoGame.Framework 3.8.6.0。
先验证本地包、推送生产源码，再发布 Framework 和 Runtime，最后从公开源空缓存验证。
最终公开包的签名、归档哈希及 DLL 哈希写入独立发布记录，不能沿用本地候选包的发布状态。

用户约定（2026-10-28）：同一功能的所有配套包，包括其他仓库生产的原生依赖，
须先全部生产并验证通过，再连续上传整批包。网页一次只能上传一包时连续依次提交，
不在两包之间等待验证或搜索索引生效。全部提交后再统一等待公开可下载，集中做签名、
字节核对和空缓存还原；尚未就绪的版本间隔复查，不重复上传、不覆盖版本。
可以先检查已就绪包，但不能因此阻塞其余已验证包上传。此顺序不省略任何发布门禁。

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
