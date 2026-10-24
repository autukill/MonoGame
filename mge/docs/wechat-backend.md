# 微信小游戏 MonoGame 后端

更新：2026-10-24。自维护包
[MyGameEngine.MonoGame.Runtime.WeChat.WebGL2 3.8.6-mge.1](https://www.nuget.org/packages/MyGameEngine.MonoGame.Runtime.WeChat.WebGL2/3.8.6-mge.1)。
普通 MonoGame 项目可以直接接入；不要求引用 MyGameEngine 或 Monster。
这是独立平台包，版本中的 `3.8.6` 对齐官方基线，不表示官方已发布微信平台。

## 参考提交与跟进账本

以下为本次核查的固定来源及采用状态，不代表已追踪到上游最新提交。
[`sources.json`](../wechat/sources.json) 是文件来源和工具版本的机器可读锁定记录。

| 来源／阶段 | 固定提交 | 采用与跟进情况 |
|---|---|---|
| 官方 MonoGame 3.8.6 基线 | `c610a529667336f63da323c6057274258727664b` | 基于该版公共 API、原生公共实现、内置 shader 与许可 |
| 本维护线接入前基线 | `31f04c017b6cc7ccbd8204a4291b5e2ef5348f94` | 记录接入起点，保留已有 DX12 和其他平台输入 |
| 自维护浏览器 WebGL2 参考 | `7bc100e013d82846e089492bb91e40d4c080eabc`（`mge/webgl2`） | **选择性源码回移已完成**；只采用 sources.json 的 managed、native 和 platform guards 文件，非整分支合并 |
| 浏览器参考线已验证上游 | `dded52074d8358504f93d9da8c3ddd9241d2fd46` | 来源链见[2026-10-21 浏览器状态](webgl2-status.md)；其浏览器测试不替代微信测试 |
| 浏览器后台停止修复 | `c7cb31fbf1b96a4374ee083ac1b3d75bd6fbd20d` | 作为后台不依赖可见帧完成停止的行为参考；微信使用自己的 WeChatGame／session，见 `eaae4cae`，不是原样引用 BrowserGame |
| 微信初始实现 | `052b2512812a9b28cd38b11f8f7a98183789e607` | 建立 3.8.6 隔离平台、原生 2D 音频；头文件 ABI 在 `1f68c21f` 隔离，回归与单包输入在 `66dec8c7` 补齐 |
| 微信生命周期／扩展服务 | `eaae4caef85bb2b1d9ee2d656cec3a8aa6e28f7c` | 独立管理 Canvas、音频、文件系统、循环及停止；引擎通过扩展接入 |
| JS 兼容跟进 | `d31394d59c44344d7893668d634429006f95d9f7` | BigInt token 转换已采用；导出后 ES2019 校验，不依赖手机宽松解析 |
| API／导出身份跟进 | `7acac0425f20de5a42d297aa25547860a8f65092` | 公共 API 与导出输入哈希门禁已采用 |
| 发布源码／平台引用门禁 | `64cb55b90a0f4524378b3d241adc76ed0b3d87b8` | 已发布，拒绝传递依赖解析到其他平台的同名 Framework；版本标签固定于此 |
| 发布验证记录 | `4df2fccbc7c8c2307039f95c97714ffcfcf1524a`、`2cc85f797940182285a3a5e04d81b6dcc8e4112e` | 验证与公网回执已记录；这些文档提交没有重新生成或替换包 |
| 浏览器后续增量 | 历史快照记录 `8a9388463e9e9dc63d1a3bad6b3a75964bd3a86b` | **未采用／待微信专项核查**：该快照中的首帧 adaptive canvas 时序变化没有作为新回移提交进入本微信版本；不声称它是当前最新上游 |

截至上述核查，主目录 `D:/Projects/Zhao/MyGameEngine-MonoGame` 的 `mge/3.8.6`
已包含微信源码（核查起点 `2cc85f797`）。`codex/wechat-backend-386` 为保留的隔离开发线，
不能再说“仅在隔离分支”。`git worktree list` 可查询本机目录；消费包无需这些工作区。

后续跟进规则：先固定待审参考提交，按 `sources.json` 的文件范围比较增量，记录采用／不适用／暂缓的理由；
微信特有生命周期、文件、音频与导出改动单独审阅。采用后更新来源、对应测试和消费者验证，
新增账本行并发布新版本。**浏览器修改不会自动传入微信，不能移动旧标签或覆盖已发布包。**
本次只更新文档，未 fetch 新上游、同步源码或重发包。

## 源码复用、包依赖与运行环境

微信参考了 WebGL2 源码，但不依赖 `MonoGame.Runtime.Browser.WebGL2` NuGet、浏览器项目引用或工作区。
选择的实现已存放在本仓库 [`managed`](../wechat/managed)、[`native`](../wechat/native)；
[`CMakeLists.txt`](../wechat/CMakeLists.txt) 将它们与本仓库 `native/monogame/common`、固定 SDL
编译为微信自己的 `mgruntime.a`。这也不是链接浏览器实验包的原生归档。

已发布 nuspec 没有 NuGet 依赖项；应用构建仍需下面列出的 LLVM 编译包和工具链。
运行时仍需微信的 Canvas/WebGL2、WXWebAssembly 及文件／音频 API。
“没有浏览器包依赖”不等于不使用 WebGL2，也不等于没有外部构建输入。

单个 NuGet 提供匹配的 `MonoGame.Framework.dll`、`mgruntime.a`、`libSDL2.a`、
微信 JS 适配、`WeChatGame.cs` 接入辅助源码、buildTransitive 属性／targets 与导出工具。
Framework 包含平台代码，微信目标从 3.8.6 源码单独编译；不能套用 DX12“仅换原生库”的策略。
其程序集身份仍为 `MonoGame.Framework, Version=3.8.6.0, Culture=neutral, PublicKeyToken=null`。

## 三层边界

| 层 | 职责 | 不归该层的策略 |
|---|---|---|
| 本包：通用 MonoGame 微信后端 | Canvas／SDL／WebGL2、窗口／触摸／方向安全区、前后台／停止、文件挂载／持久化基础设施、2D 音频、NativeAOT-LLVM 构建／导出 | 不认识 Monster 场景、第一世界或游戏资源清单 |
| `Engine.Hosting.WeChat.MonoGame`：引擎宿主 | 接入引擎契约、动态字体／Yoga、内容就绪门、呈现与宿主生命周期；复用后端的 Canvas、循环、文件和音频服务 | 不内置具体游戏资源分组及关卡逻辑 |
| `Monster.WeChat`：游戏接入 | 菜单常驻／关卡资源生命周期、远程包分组／部署／缓存校验、存档序列化与提交策略、音频素材选择、AppID | 不复制通用 MonoGame 平台适配 |

FreeType、HarfBuzz、Yoga 等引擎原生输入不在此包中；动态字体由引擎提供，完整消费者仍保留两字体共
5,618,420 字节。游戏存档的合并、关键节点和异步提交策略通过接入层配置，不固化到通用后端。

## 固定版本与平台包替换

平台选择由**应用和共享项目的 MSBuild 引用配置**负责，不由微信运行时自动卸载或替换包。
微信目标移除官方 Native／DesktopGL／其他平台 Framework 包和浏览器 WebGL2 包，只选择本单包；
多目标项目应按目标加条件，桌面／Android 目标继续选择各自平台包。
共享音频等传递引用也必须统一选择微信包，不能仅改最终可执行项目。

本包 targets 会检查冲突 PackageReference 和实际 `ReferencePath`：必须恰有一个 Framework，且来源是本包。
同名同版本 DLL 不代表同一平台；历史消费者曾误选官方 Native，已在冻结源码 `64cb55b9` 加入拒绝门禁。

标准独立接入示例（Windows x64 构建机，与 [`Probe.csproj`](../wechat/Probe/Probe.csproj) 一致）：

```xml
<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <TargetFramework>net10.0</TargetFramework>
    <OutputType>Exe</OutputType>
    <RuntimeIdentifier>browser-wasm</RuntimeIdentifier>
    <MonoGameWeChat>true</MonoGameWeChat>
    <PublishTrimmed>true</PublishTrimmed>
    <SelfContained>true</SelfContained>
    <UseAppHost>false</UseAppHost>
    <ImplicitUsings>enable</ImplicitUsings>
    <ManagePackageVersionsCentrally>false</ManagePackageVersionsCentrally>
  </PropertyGroup>
  <ItemGroup>
    <PackageReference Include="MyGameEngine.MonoGame.Runtime.WeChat.WebGL2" Version="[3.8.6-mge.1]" />
    <PackageReference Include="Microsoft.DotNet.ILCompiler.LLVM" Version="10.0.0-rc.1.26357.1" PrivateAssets="all" />
    <PackageReference Include="runtime.win-x64.Microsoft.DotNet.ILCompiler.LLVM" Version="10.0.0-rc.1.26357.1" PrivateAssets="all" />
  </ItemGroup>
</Project>
```

入口引用 `MonoGame.Runtime.WeChat.WebGL2`，调用
`await WeChatGame.RunAsync(new YourGame());`；`YourGame` 是自己的普通 MonoGame `Game`。
RunAsync 接管实例并在退出后 Dispose；停止使用 RequestStop／StopAsync，经正常 Game.Exit 清理。
不要设置 stock SDK 的 `PublishAot=true`：该 SDK 先拒绝 browser-wasm，实际 AOT 由固定 LLVM 包负责。
本版使用 CPP EH、SIMD，不含解释器或 Gamma 回退。

## 构建与导出

| 输入 | 锁定版本 |
|---|---|
| .NET SDK | `11.0.100-rc.2.26504.105`；应用目标 `net10.0` |
| NativeAOT-LLVM | `10.0.0-rc.1.26357.1`，上述两个编译包 |
| Emscripten | `3.1.56` |
| SDL | `4478ad67d28bb7a586bf352c42c210f36fd03fc0` |
| JS 工具／兼容库 | esbuild `0.25.12`、text-encoding `0.7.0`；导出工具随包提供 |

生产包入口为 [`mge/wechat/build.ps1`](../wechat/build.ps1)，参数 `-OutputRoot` 必须使用新目录，
并提供 `-NativeBuildRoot`。先准备官方锁定子模块及 `mge/wechat/.sources/SDL`；脚本检查来源与干净状态，
串行编译 Framework／原生库／打包并记录进程。路径可通过脚本参数显式指定；不得混用浏览器实验线的
Emscripten 6.x 归档与微信 3.1.56 归档。消费者使用包内预编译原生库，无需本机 MonoGame 源码或 npm install。

消费端 `dotnet publish` 设置 `MonoGameWeChatExportPath` 开启发布后的导出 target；
`MonoGameWeChatConfiguration` 默认指向项目的 `wechat.json`，`MonoGameWeChatNodePath` 默认 `node`。
JSON 显式配置自己的 AppID、orientation、唯一 storageNamespace、files、mounts；
参照 [`Probe/wechat.json`](../wechat/Probe/wechat.json)，不要沿用探针 AppID 或存档命名空间。
可选 `iOSHighPerformance` 写入 game.json；写入配置不等于已证实手机进入该模式。
输出目录必须为新目录，最终 JS 按 ES2019 解析并记录资源、JS、Wasm 哈希与包预算。

串行消费示例（在项目目录执行；SDK／Node 等环境预先配置）：

```powershell
$env:MSBUILDDISABLENODEREUSE = '1'
$env:DOTNET_CLI_USE_MSBUILD_SERVER = '0'
$env:EMCC_CORES = '1'
$env:BINARYEN_CORES = '1'
$env:CMAKE_BUILD_PARALLEL_LEVEL = '1'
dotnet publish ./YourGame.csproj -c Release --disable-build-servers -m:1 -nr:false `
  -p:UseSharedCompilation=false -p:BuildInParallel=false -p:RestoreBuildInParallel=false `
  -p:DisableParallelAot=true -p:DisableParallelEmccCompile=true `
  -p:MonoGameWeChatExportPath="D:/Builds/yourgame-wechat-new"
```

等待该进程结束后再运行其他构建；原生构建限 `--parallel 1`。后端回归入口
`bun test mge/wechat/Tests`，独立标准 MonoGame 样例在 [`Probe`](../wechat/Probe)。
本次文档更新不执行构建或重新发布。

## 音频、日志与能力限制

- `SoundEffect`／`SoundEffectInstance`：2D 静态音效，PCM WAV（8／16 位整数或 32 位浮点）及 raw PCM 构造，交给 wx WebAudio。其他编码由应用先解码；不要求通用后端自带所有解码器。
- `Song`／`MediaPlayer`：本地／缓存 WAV 或 MP3，经 wx InnerAudioContext 播放。
- 本版不支持 3D、XACT、动态音频流、麦克风、视频、原生图形句柄；明确报错，无静音成功占位。没有 FAudio 依赖。
- Monster 维持自身策略：短音效压缩存储、加载时解码为 PCM WebAudio，音乐／VO 使用 MP3 文件音频；较大音频放游戏远程包。解码后的 PCM 内存与压缩文件磁盘大小分别评估。
- 后端保留轻量启动、版本、停止和明确错误日志（`[MonoGame-WeChat]`）；下载／加载阶段由游戏扩展报告具体进度。vConsole、耗时／分配采样由独立诊断构建启用，不把二分剔除、固定敌人夹具或自动战斗编入正式包。
- 默认逻辑 30、绘制 24、微信回调 30 是 **Monster 接入策略**；通用后端不强制所有游戏采用该数值。
- 上下文丢失会终止并要求重载，不保证自动重建。真实音频可听性、系统中断和生命周期需另做手机验收。

## 发布身份与验证范围

| 身份 | 值 |
|---|---|
| 源码 | `64cb55b90a0f4524378b3d241adc76ed0b3d87b8` |
| 标签 | `wechat-webgl2-3.8.6-mge.1`（固定指向上述源码） |
| 上传 nupkg SHA256 | `7d0bedfc36ba34fc4b2dcd3c8876cda98eee63dcef96401365f63188fdc3d86e` |
| 公网签名 nupkg SHA256 | `075ceb3975f24ea43dd0fcb03a4767eaf7c17587b6e8945e3721ef8c94cb61ed` |

公网于 2026-10-24 下载验证，46 个原有 ZIP 条目逐字节相同，仅增加 NuGet 的 `.signature.p7s`。
签名前后外层归档哈希不同是预期结果；依据[公网回执](../wechat/public-release-3.8.6-mge.1.json)
和[发布报告](../wechat/RELEASE-3.8.6-mge.1.md)，不重标包源码为本次文档提交。

| 证据层次 | 已记录结果及范围 |
|---|---|
| 后端／API 回归 | 53 项后端测试；4,161 项公共／受保护签名对照官方 Native 3.8.6 零增减；错误平台 Framework 负对照被拒绝 |
| 独立 MonoGame 样例 | 外部消费者首次还原、LLVM AOT、严格原生链接、GPU 读回／SpriteBatch、触摸按下／释放、音效／Song 开始和自然结束、停止／重载通过；未引用引擎或 Monster |
| 引擎与完整游戏开发者工具 | 53 项引擎策略和 6 项内容就绪门测试；Monster `278c046138e75488f97c350a1a7230540ea3bc61` 从 nuget.org 空缓存还原，菜单切换、正常装配、完整第一世界战斗并返回新闻、真实音频路径、存档校验重载与远程缓存复用通过 |
| 开发者工具性能样本 | 完整游戏采样约 55.65 秒，绘制约 20.934 FPS、逻辑约 30.027 Hz；仅是该工具样本，不是手机性能认证 |
| 本版 iOS 真机 | 2026-10-24 用户确认“iOS 真机已测试 验收”，记为 `USER_REPORTED_ACCEPTED`；未提供新日志、具体设备和逐项结果，不追加帧率、实际 iosHighPerformance 或独立音频探针结论 |
| 本版 Android 真机 | 不因 iOS 确认自动升级状态；此前 Android 完整版的验收属于其原包，本版已记录的构建／开发者工具验证与新包真机验收分别保留 |

iOS 用户确认对应 AppID `wx05ed413f76d35796`、Monster 公网包消费构建 `278c0461`：

- 导出 packageId：`e370c4f3c7871fc242c4faeac1e61b955e5f6f20bab474c79b258c4dcdaa163d`。
- Wasm SHA256：`74435360ecd3e54c1a40a56080809016febd41d8b4a286826ae2bca692e0ab4c`。
- 预览回执 SHA256：`91aa94a7829036ccca42f2d803614c7cb8a53be2f74426eac7809799570cb1f1`。
- 本机补充证据：`D:/Projects/Games/MyGameEnginePlaygrounds/wechat-backend-386-evidence/physical-ios-acceptance-20261024.json`，预览回执位于同根 `preview-ios-public-20261024-200739/preview-info.json`。

原发布报告／JSON 中的 `NOT_TESTED`、未上传描述是发布时点记录，以上补记为后续用户验收；
保留两者时间顺序，不把新确认倒填为当时已经实测。Android AppID 为 `wx9b9dee325bed3767`，
iOS AppID 为 `wx05ed413f76d35796`，仅供本游戏接入识别，通用使用者须替换为自己的 AppID。

早期 [`VALIDATION.md`](../wechat/VALIDATION.md) 是候选阶段记录，不能替代冻结版本和公网回执。
历史研究证据位于上述本机 evidence 根目录，不属于 NuGet 运行负载；复制仓库并不自动获得这些大日志。
本轮不重开 iOS 普通模式性能二分，也不以 Android 帧率作为 iOS 验收门槛；不把平台限制扩写为所有兼容问题均已解决。
