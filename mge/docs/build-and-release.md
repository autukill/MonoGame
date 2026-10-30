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

继续验证维护版实际后端时使用 `mge/tests/Dx12BackendProbe`：独立NativeAOT宿主引用
公开固定Framework包，在专属输出中使用已验证的Tier 1诊断DLL；源码校验确认原生输入
与该DLL来源提交相同。三次窗口／设备生命周期、六次交换链尺寸变化、SpriteBatch／纹理
切换、mip与图形交错、后台缓冲像素，以及共用的动态缓冲和5000draw常量环回归均自动执行。
Run-Probe.cmd保留原生stderr、实际加载DLL身份、每阶段完成记录与退出码，适用于Yoga复测。
此项目没有引擎或游戏反向引用，完整覆盖范围和构建入口见其README。
共用常量环结果改用JSON源生成，以供NativeAOT探针复用，原有回归行为和字段保持相同。

完整后端探针还在本机复现了独立的读取后继续绘制问题：旧候选在第0帧离屏纹理／mip
读取成功，后续后台缓冲仍为黑色。同步Texture.GetData／GetBackBufferData会关闭并重启
command list；原代码恢复了根签名、堆和脏状态，却未重新绑定缓存的RTV／DSV。
修复仅在这两条读取后重启路径恢复原输出目标，保留原资源状态和切换逻辑。
同一NativeAOT探针保留读取后继续绘制的检查，以核对修复而不绕过失败路径；
首轮失败位于 `mge/out/backend-probe-20261028/launcher validation-中文`。

2026-10-28 完整后端探针本机验证完成：同一NativeAOT EXE（SHA256 5CCD35E3…881FBB）
使用旧DLL时在第0帧后台缓冲黑色失败，只替换为18907ad63的修复DLL后五阶段通过。
实际加载DLL SHA256 357051A2…917542、无CoreCLR，GTX970实际Tier 3；三次窗口／设备
生命周期、六次交换链缩放、2533815次像素检查、动态缓冲六帧和5000draw常量环六帧通过，
正常退出0。Windows PowerShell 5.1入口、中文／空格路径通过，构建／探针进程剩余0。
首两轮NativeAOT链接环境失败保留：缺少link.exe，及开发环境PATH超出cmd限制，
修正脚本后串行发布成功。核心EXE未重复构建以验证读取修复；原生候选重新构建并通过
172导出／六内置Effect、真实／强制Tier 1生命周期及设备移除probe。
独立交付 `mge/out/backend-probe-20261028/release-04/Dx12BackendProbe-win-x64-NativeAOT.zip`
约2.5MiB，不含游戏、存档或PDB；Yoga完整后端复验仍待新日志，不扩大既有根布局真机结论。
详情见 [后端探针本机记录](../validation/20261028/backend-probe-local.json)。

2026-10-28 Yoga 19:04完整后端日志仍失败，但已通过Tier 1有界根签名创建和DeviceResources.ready。
第一帧之前，在下一次CreateCommandAllocator处返回DEVICE_REMOVED，实际移除原因
INVALID_CALL／0x887A0001；不能把分配器报错行当成最早错误位置。原始目录保留为
`mge/out/backend-probe-20261028/yoga-190403`。当时LoadContent前中止，实际加载模块字段
尚为空，新探针将模块核对提前到Game构造后、Run之前。

诊断DLL增加可选的CPU调试层（仅已有系统组件时启用，不安装），记录InfoQueue警告／
错误ID，并在视图创建、命令执行／重用之后检查实际设备状态；记录SRV／DSV格式及资源flags。
这些钩子由原诊断编译开关隔离，普通构建不包含日志、校验层或额外状态查询。
后端探针以三个子进程分别跑None／Depth16／Depth24Stencil8的同一套测试，崩溃不会
阻止后续组；每个子进程保留原始退出码及独立日志，顶层汇总API校验错误。
本机独立SDK实验未复现typed深度资源创建采样视图错误，故此次未凭猜测改动深度资源格式。

启用CPU校验后，07c5ac446的完整后端探针在三组均完成像素检查但各有243条API错误，
因此矩阵汇总判为失败而非通过。错误ID1422指向mip临时纹理错误继承ALLOW_RENDER_TARGET，
未初始化的高mip首次UAV使用不合法；ID527指向复制回源纹理后最后一次PIXEL_SHADER_RESOURCE
转换只更新了CPU记录而没有提交barrier。修复去除临时纹理RT标志并立即提交最后屏障。
保留原始矩阵于 `mge/out/backend-startup-isolation-20261028/launcher validation-中文`。
诊断构建的native生命周期与后端矩阵都检查InfoQueue的ERROR／CORRUPTION，不以像素正确
替代API合法性。此本机复现独立于Yoga在LoadContent之前的早期错误，后者仍需新分组日志。

2026-10-28 三模式诊断包本机复验：保持07c5ac446的探针EXE不变，仅将DLL替换为
f8db1f6bc，三组均完成五阶段、累计7601445次像素检查，API ERROR／CORRUPTION均为0；
每组保留6条ID820优化清屏值不同的性能警告。CPU调试层确已启用，实际深度格式分别为
无DSV、D16_UNORM、D24_UNORM_S8_UINT，三个独立子进程正常退出0。
另在隔离副本故意令manifest校验失败，确认三组均继续运行并分别保留退出1，不污染交付包。
NativeAOT／DLL实际加载身份、中文与空格路径及Windows PowerShell 5.1入口通过，
自有构建／探针进程剩余0。交付为
`mge/out/backend-startup-isolation-20261028/probe-02-mipfix/Dx12BackendProbe-win-x64-depth-matrix.zip`；
Yoga后端初始化仍未宣称通过，需新包分组日志定位。详情见
[三模式验证记录](../validation/20261028/backend-depth-matrix-local.json)。

2026-10-28 18:36 Yoga独立探针真机结果已返回：Intel HD Graphics 5300，驱动
20.19.15.4642，Windows NT 10.0.22000，实际ResourceBindingTier=1。
探针EXE哈希与交付一致。原无界根布局CreateRootSignature=E_INVALIDARG，
GetDeviceRemovedReason=S_OK；只将四张表限制为16槽后，根签名创建、实际PSO／纹理／
采样器绘制及全部256像素回读通过，最终移除原因S_OK，退出0，未超时，stderr为空。
根签名版本支持查询为1.1，两例实际序列化均使用1.0；A/B改变的是描述符范围长度。
这确认了该设备原根布局的兼容性问题及有界布局的基础绘制修复，未扩展为维护版
MonoGame完整集成、窗口／交换链、复杂负载或性能认证。摘要与原始文件哈希见
[真机证据](../validation/20261028/root-signature-yoga.json)，原始文件保存在
`mge/out/standalone-root-signature-probe-20261028/yoga-183609`。

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

## 2026-10-30 Yoga 后端复验

三模式包 EXE／实际加载DLL哈希与交付一致，三组均在首帧前退出0xC0000409，
不是超时。16槽根签名创建成功。Depth16和Depth24Stencil8在typed深度资源上创建
不同格式的SRV后，立即GetDeviceRemovedReason=0x887A0001；无深度组则继续到
CreateGraphicsPipelineState=E_FAIL，此时GetDeviceRemovedReason=S_OK。
系统没有调试层（0x887A002D），因此报告中的validationErrors=0不能代表API合法。
[脱敏证据及原始日志哈希](../validation/20261030/backend-depth-matrix-yoga.json)。

深度存储统一改用同族typeless资源，保留typed清屏值／DSV／SRV／PSO格式以及typed
MSAA支持检查；原生生命周期增加D16／D24／D24S8的两次DSV清屏和SRV GPU回读。
依据[微软格式转换规格](https://microsoft.github.io/DirectX-Specs/d3d/RelaxedCasting.html)，
旧驱动不能假定支持fully-typed资源间转换。新诊断另记录OPTIONS3和Shader Model能力，
失败时保留原始PSO HRESULT／设备状态，记录状态参数和容器中的着色器版本，并在不提交
命令、不替换绘制结果的前提下创建／释放默认状态与SM5简单着色器的对照PSO。
正常发布DLL不含这些诊断实验；六份内置Effect字节继续保留，不自动转换着色器版本。
Yoga的Shader Model与PSO失败原因仍需新结果确认，不能宣称后端已通过。

2026-10-30 本机候选复验完成：相同NativeAOT EXE仅更新DLL，三组各五阶段通过，
累计7601445次像素检查，CPU调试层启用且API ERROR／CORRUPTION为0，仅保留ID820
优化清屏值警告。深度SRV实际资源／视图为R16_TYPELESS(53)→R16_UNORM(56)、
R24G8_TYPELESS(44)→R24_UNORM_X8_TYPELESS(46)。172导出、六份内置Effect原字节、
真实等级／强制Tier1三生命周期及WARP故障设备检查通过；WARP诊断负例确认简单SM5
着色器PSO创建成功，原缺失字节码失败继续保留。构建和探针进程全部退出。
交付候选位于`mge/out/backend-compatibility-20261030/probe-01/`，仍待Yoga复验；
[本机验证摘要](../validation/20261030/backend-depth-typeless-local.json)。

2026-10-30 17:21 Yoga复验返回：EXE和实际加载DLL均与交付一致。两个深度模式的
SRV／DSV创建及初始帧准备后GetDeviceRemovedReason均为S_OK，确认typeless深度资源
消除了之前的视图创建非法调用；OPTIONS3也确认CastingFullyTypedFormatSupported=0。
三组仍在首个图形PSO失败，但已获得明确能力差异：请求SM6.0的查询成功，返回最高SM5.1；
VS／PS容器记录均为SM6.0 DXIL。保留原着色器、改用默认固定功能状态仍E_FAIL；简单
SM5.0着色器的两种对照PSO创建成功，设备状态始终S_OK。对照PSO只创建／释放，未执行，
因此不能判为完整绘制或后端通过。系统未安装调试层，validationErrors=0不能作为API验收。

结论：当前Yoga设备／驱动的SM5.1能力无法运行现有SM6.0着色器，这是已确认的兼容阻碍。
16槽根签名和深度视图初始化修复已有真机证据，无需围绕同一问题重复生成诊断包。
若继续扩展旧设备DX12支持，需另行设计SM5.1编译器、内置Effect及compute mip内核链路，
并验证布局／反射、像素和完整生命周期；保持现有六份内置Effect原字节的维护范围内，
不自动降低或替换shader。此证据不证明更新驱动一定有效。Yoga可继续采用用户此前已
通过备战和战斗验证的OpenGL版本。当前没有修改Monster或生产新的游戏包。
[真机能力与PSO对照证据](../validation/20261030/backend-shader-model-yoga.json)。
能力查询语义依据[微软SHADER_MODEL文档](https://learn.microsoft.com/en-us/windows/win32/api/d3d12/ns-d3d12-d3d12_feature_data_shader_model)，
SM6／DXIL背景见[微软DirectXTK12说明](https://github.com/microsoft/DirectXTK12/wiki/Shader-Model-6)。

## 2026-10-30 SM5.1 独立执行探针

用户授权先验证独立探针，不改Monster。项目为`mge/tests/Dx12Sm51Probe`，使用维护版
Framework 3.8.6-mge.3的真实Effect加载器／常量更新，以及同库原生DX12后端。
探针自身用固定ABI的MGFX夹具装载FXC离线编译的vs_5_1／ps_5_1，VS／PS各一个16字节
b0缓冲；反射汇编校验参数大小／偏移及t0／s0绑定。另将原mip HLSL离线编译为cs_5_1，
核对SHEX实际5.1版本、shader阶段、无DXIL以及C数组与CS二进制完全一致。

原生开关`MGE_DX12_SM51_PROBE`默认OFF；ON仅允许在诊断构建并指定已准备的header。
该实验DLL替换mip内核并拒绝非SM5.1的图形shader；六份已有内置Effect仍保留原字节，
不将此次结果当作通用.fx编译器或内置Effect迁移完成。正常构建路径默认保持原样。

本机GTX970三种深度模式全部完成：每组3次9帧缩放／mip生命周期，另一次6帧、每帧
5000次独立VS／PS常量更新，并进行动态VB／IB的Discard／NoOverwrite实际索引绘制。
累计7583013次像素核对、90000次常量压力绘制，CPU API校验启用且ERROR／CORRUPTION
均为0；172导出和六份内置Effect原字节通过。原生真实等级与强制Tier1生命周期、
深度／mip GPU回读和WARP故障设备诊断均通过。双击入口在中文／空格路径、Windows
PowerShell5.1下通过，未超时、正常退出0。Yoga仍待此包复验，不能以本机通过替代。

构建全部串行，先完成原生构建再NativeAOT publish，保留禁服务器／不复用／不共享编译
参数，直接运行产物验证。本轮构建与探针进程已结束。源码及构建步骤见
[探针说明](../tests/Dx12Sm51Probe/README.md)，[本机证据](../validation/20261030/sm51-probe-local.json)。
交付位于`mge/out/sm51-probe-20261030/release-01/`，不替换任何NuGet缓存或游戏目录。
