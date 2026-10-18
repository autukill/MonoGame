# 2026-10-18 DX12 维护版交付验证记录

本记录整理已存在于本地的来源、包内容、原生回归和应用验收证据。记录中的路径相对于维护仓库根目录。原始日志、截图和构建产物位于被 Git 忽略的 `mge/out/`；关键小型 JSON 另归档在 `mge/validation/20261018/`。本文件不替代原始证据；归档交付时须保留对应文件。

本次整理未启动应用、构建或额外测量。当前验收覆盖 Windows x64、NVIDIA GeForce GTX 970、官方 MonoGame.Framework.Native 3.8.6；不推断其他 GPU、操作系统、架构或 MonoGame 版本的结果。

## 产物身份与源码来源

| 项目 | 已核对值 |
|---|---|
| 维护分支 | `mge/3.8.6` |
| 上游发行基线 | `c610a529667336f63da323c6057274258727664b` |
| 最终 DLL 的生产源码提交 | `9bef89ca658bdb1cc4d4c14cac1383207ba997d9` |
| 包 ID | `MyGameEngine.MonoGame.Runtime.Windows.DX12` |
| 包版本 | `3.8.6-mge.1` |
| 最终 DLL SHA256 | `24E2EC39D7C8F0AC4AB9F8EE48024D3E5A34A310C3964272F05BCED11B8E4BC0` |
| 官方对照 DLL SHA256 | `1179B04B0AA1F983DD50E37F03D797040E35E9A3A13A50B34D7A776CF0DE8AB0` |
| 同源未修复对照 DLL SHA256 | `20D3E456CFA5E0ED8E5361C7A95A353B2262D1576A496E7C8B1786C0E7BC462B` |
| 编译配置 | Release x64，静态 MSVC runtime（/MT） |

生产来源证据为 `mge/out/release-final/payload/provenance.json`。其中记录上游及三个子模块的固定提交、Visual Studio 安装路径、MSVC 14.51.36231、CMake 4.3.1-msvc1，以及串行构建参数。子模块固定值与 `mge/upstream.json` 一致。

实际读取本地 `mge/local-feed/MyGameEngine.MonoGame.Runtime.Windows.DX12.3.8.6-mge.1.nupkg`，核对 nuspec 中包 ID、版本、repository commit 和包内 provenance；包内 `runtimes/win-x64/native/mgruntime.dll` 的 SHA256 与上表完整一致。独立计算 `release-final/payload/mgruntime.dll` 和 `game-aot/mgruntime.dll` 的哈希也得到同一值。

后续构建来源 guard 修正在 `182cd974`，用于拒绝未跟踪及被忽略的原生编译输入。它是生产提交之后的交付流程修正，不改写既有 DLL 的生产来源。该 guard 的执行回归结果不在本记录的独立复核范围内。

## 六项修复的静态核对

相对发行基线，原生变更仅涉及所述六项修复及其必要的状态记录；未加入实验性 LazyQuery。

| 修复 | 静态核对结论 |
|---|---|
| MGE-DX12-001 闲置常量缓冲 | 移除三份 32 MiB 上传缓冲及全部对应字段、分配和引用；保留 `m_tempTextures` 和延迟清理 |
| MGE-DX12-002 DX12 窗口标志 | DX12 不再设置 SDL Vulkan 标志；仍通过 HWND 初始化；保留 Vulkan/OpenGL 分支 |
| MGE-DX12-003 mip COM blob | 临时序列化及错误 blob 使用 `ComPtr`，检查序列化及 root signature 创建结果 |
| MGE-DX12-004 lazy mip pipeline | 首次生成 mip 时创建 compute pipeline；普通设备初始化不再提前创建 |
| MGE-DX12-005 CPU 描述符分页 | CPU SRV/UAV 每页 4,096 个，保留 65,536 总容量、稳定句柄及释放后复用；分配成功后才推进计数；shader-visible heap 不变 |
| MGE-DX12-006 mip 后恢复 PSO | 记录 graphics PSO、Reset 时清空、mip dispatch 后恢复；与 PipelineStateManager 的哈希缓存配合 |

固定闲置资源的名义总量为 96 MiB，不能直接当作实测工作集或 private bytes 的下降值。

## 原生 ABI、内置 Effect 与生命周期

证据：

- `mge/out/release-final/abi-effects.json`
- `mge/out/release-final/lifecycle.log`
- `mge/out/release-final/payload/provenance.json`
- 验证实现：`mge/verify-runtime.py`、`mge/tests/native/NativeLifecycleProbe.cpp`、`mge/tests/native/PagedDescriptorProbe.h`

ABI 报告将官方 `1179B04B…` 与最终 `24E2EC39…` 对照，记录 **172 个原生导出**的名称、ordinal 和 forwarder 一致。该检查不单独证明所有函数签名及行为；公开 ABI 保持还依赖源码审查和运行回归。

六份内置 Effect 已逐字节比较，报告保存每份字节数和 SHA256：

| Effect | 字节数 |
|---|---:|
| AlphaTestEffect | 24,614 |
| BasicEffect | 106,388 |
| DualTextureEffect | 19,645 |
| EnvironmentMapEffect | 33,104 |
| SkinnedEffect | 66,134 |
| SpriteEffect | 5,679 |

原生生命周期日志记录三次设备创建/释放，每次包含首次 Draw 外 mip、六次 Draw 内重复 mip、各级 mip 像素回读；CPU SRV 分页验证覆盖满容量、4,095/4,096 等页边界、65,535 末端、耗尽后重试、句柄稳定和释放后复用，并以 GPU 像素验证实际采样。query 覆盖 1,024 容量、空遮挡结果及回收。日志以生命周期通过结束。

日志里的内存样本属于这项功能测试，不能代替统一条件下的空窗口内存比较。

## 最终 DLL 的引擎图形回归

证据目录为 `mge/out/engine-graphics-final/`。ring 与 targets 的 `*.process.json` 都记录实际加载 DLL 的完整 SHA256 为最终 `24E2EC39…`，并记录 `Completed=true`、`Exited=true`。这两份 process 文件未保存 ExitCode，因此通过结论同时依赖 stdout 和 report 中的成功断言。

- `ring/report.json` 与 `ring.stdout.log`：6 帧、每帧 5,000 次不同绘制、跨 chunk 常量上传及像素回读通过；报告的像素容差为 1。
- `targets/report.json` 与 `targets.stdout.log`：RGBA 上传在源数据修改后精确回读；4,194,304 字节源数据对应创建分配 128 字节、更新分配 0 字节；PNG/WebP 暂存复用后精确 GPU 回读。
- targets 覆盖借用渲染目标、私有 composite fallback、resize、reuse、内存记账与 disposal。报告保存五个阶段，从 1280×720 到 960×540、1024×768，再回到 1280×720，包含 OwnsWorld 切换。

历史 `engine-graphics/`、`engine-graphics-v2/` 的运行记录加载旧 `7BE0FE5A…`，不作为最终 DLL 的验收结果。`standalone-ring/report.json` 单独不包含运行时哈希，也不能单独绑定最终 DLL。

独立 `mge/tests/GraphicsProbe` 的 `graphics-final-build.log` 证明构建成功、0 警告、0 错误；本次未找到它的最终运行 stdout/process 持久化文件，因此本记录不将该构建日志当作混合 mip/graphics 场景运行通过证据。

## 六类应用、七个场景

每个场景在 `mge/out/application-checks/` 下均有 `<name>.process.json`、stdout、stderr 和 PNG。七份 process 记录全部为 `Completed=true`、`Exited=true`、`ExitCode=0`，实际加载 DLL 哈希全部为最终 `24E2EC39…`。

| 应用类型 | 证据名前缀 | 场景 | 运行秒数 |
|---|---|---|---:|
| Monster.Game | game | battle，捕获第 3 秒画面 | 5.19 |
| Monster.Lab | lab-enemies | 默认敌人页 | 4.20 |
| Monster.Lab | lab-maps | maps 页 | 4.06 |
| Monster.Editor | monster-editor | monster-campaign.json，w5-city1 | 2.28 |
| Engine.Tools.Editor | editor | verify-editor | 5.35 |
| Engine.Tools.ParticleEditor | particle-editor | no-reference 场景 | 2.09 |
| Engine.Tools.UiEditor | ui-editor | battle-boss-header.ui.json，verify-open，open-count=4 | 1.64 |

Game stdout 记录 MonoGameNative DX12、X64、Framework 3.8.6.0、GTX 970，以及场景加载和截图输出。PNG 的存在证明捕获产物已落盘；本记录不声称对每张图做了官方/维护版逐像素截图比较。

这些是短时启动、特定场景和捕获验收，不涵盖长时间游玩、完整编辑交互、所有地图/资源、休眠恢复或多 GPU 环境。

## 三种空窗口对照的正常退出

证据为 `mge/out/normal-exit-{official,same-source-unpatched,maintained}.json`。三份记录都为 `Completed=true`、`ExitCode=0`；实际加载哈希依次是上表官方、同源未修复、最终维护版。

空窗口复现入口 `mge/tests/Blank/Program.cs` 支持 `--seconds`，到期在 Update 中调用 Game.Exit()。现有 JSON 未保存启动参数和具体退出动作，因此正常退出结论依据成功完成和退出码；不把它扩大为长时间稳定性结论。对照目录内复制的 provenance 不能替代 NativeModules 中的实际 DLL 身份。

## 包兼容负例与许可证交付

- `mge/out/negative-conflict.log`：同时引用官方 MonoGame.Runtime.Windows.DX12 时，包 targets 按预期报错，要求移除官方 runtime。
- `mge/out/negative-framework.log`：使用 MonoGame.Framework.Native 3.8.5 时，包 targets 按预期报错，要求 3.8.6。
- 包内 targets 静态检查还包括非 win-x64 RID 和 DLL SHA256；本记录不把未列出的动态负例视作已执行。
- 实际 nupkg 包含 `licenses/LICENSE.txt`、`SDL-LICENSE.txt`、`STB-LICENSE.txt`、`THIRD-PARTY-NOTICES.txt`，以及 provenance、修复文档和 buildTransitive targets。
- `game-aot/licenses/monogame-dx12/` 实际包含这四份许可证/声明及 provenance，确认发布目录的许可证传播。

以上为材料和交付路径核对，不构成完整第三方依赖法律审查。

## Game NativeAOT 发布与质量保留

`mge/out/game-aot-build.log` 第 348 行记录 Generating native code，第 350 行记录发布至 `mge/out/game-aot/`，第 351 行记录 publish isolation 通过。实际 `Monster.exe` 大小为 33,475,584 字节，随附 `mgruntime.dll` 为最终 `24E2EC39…`；该日志中未发现 warning/error。这里证明 NativeAOT 发布产物完成，真实 AOT 运行及十次路径另列待补。

`mge/out/asset-quality-comparison.json` 记录：

| 资源类型 | 比较数量 |
|---|---:|
| KTX2 | 49 |
| Opus | 358 |
| Ogg | 3 |
| TTF | 4 |

报告为 `missing=[]`、`changed=[]`、`allPreserved=true`。可据此记录报告覆盖的资源无缺失或变化，结合内置 Effect 字节一致及精确 GPU 回读说明质量保留证据。该 JSON 没有保存比较双方目录、工具版本和逐文件哈希清单，不能仅凭它追溯全部比较输入，也不能推断所有画面和声音的主观质量。

## 已归档的小型证据

本记录对应的小型 JSON 已复制至 [mge/validation/20261018](../validation/20261018/)：summary.json、module-comparison.json、abi-effects.json、asset-quality-comparison.json、provenance.json，保留原始内容。原始大日志和截图继续留在 mge/out，不纳入该小型归档；文档中的原生生命周期数值来自其既有日志。

## 九轮 quiet NativeAOT 空窗口内存比较

三配置各运行三轮，每轮采集 5、15、30、60 秒，共九个独立进程。采用同一个可见空窗口 NativeAOT EXE，SHA256 为 F9BE96EC6B185D3F82132F09B4D0C0511DD7AC4B55D2E266D67A1A1B405BC075，逐配置只替换受测 native runtime。配置和三份实际 native SHA256 见 [归档 summary.json](../validation/20261018/summary.json)。窗口条件为 1280×720、HiDef、60Hz/VSync；无强制 GC、无诊断 runtime，采样期间不做 GPU 回读。

汇总脚本验证九轮完成/退出、四个有效采样点、非零窗口句柄、实际 native 模块哈希、相同 EXE、未观察到 coreclr.dll/clrjit.dll。采样后的进程由测量脚本按已核对 PID/启动时间停止；这里的 Exited 不是 Game.Exit() 正常退出测试，后者已有前述三个独立 controls。

下表各数均为三轮的 **min / median / max**。内存按 1 MiB=1,048,576 字节；CPU 秒为累计进程 CPU 时间，逻辑核当量为 CPU 秒除以实际采样墙钟秒数，不是整机 CPU 百分比。完整精度保存在归档 JSON。

| 配置 | 秒 | WS MiB | Private MiB | Peak WS MiB | CPU 累计秒 | 逻辑核当量 |
|---|---:|---|---|---|---|---|
| 官方 | 5 | 207.75 / 209.40 / 209.43 | 268.76 / 268.98 / 269.29 | 207.75 / 209.40 / 209.43 | 4.969 / 5.000 / 5.047 | 0.988 / 0.990 / 1.000 |
| 官方 | 15 | 209.41 / 209.43 / 210.04 | 268.76 / 268.98 / 269.59 | 209.41 / 209.43 / 210.04 | 14.781 / 14.922 / 15.047 | 0.982 / 0.992 / 1.001 |
| 官方 | 30 | 209.58 / 209.59 / 210.29 | 268.94 / 269.13 / 269.74 | 209.58 / 209.59 / 210.29 | 29.719 / 29.906 / 30.109 | 0.989 / 0.996 / 1.000 |
| 官方 | 60 | 209.50 / 209.51 / 210.21 | 268.76 / 268.96 / 269.56 | 209.58 / 209.59 / 210.29 | 59.531 / 59.922 / 60.000 | 0.991 / 0.998 / 0.999 |
| 同源未修复 | 5 | 209.45 / 209.61 / 209.82 | 268.82 / 269.25 / 269.31 | 209.45 / 209.61 / 209.82 | 4.938 / 5.031 / 5.109 | 0.984 / 0.998 / 1.010 |
| 同源未修复 | 15 | 209.45 / 209.62 / 209.84 | 268.82 / 269.26 / 269.31 | 209.45 / 209.62 / 209.84 | 14.969 / 15.031 / 15.062 | 0.996 / 1.000 / 1.002 |
| 同源未修复 | 30 | 209.63 / 209.80 / 209.98 | 269.00 / 269.41 / 269.49 | 209.63 / 209.80 / 209.98 | 30.141 / 30.266 / 30.516 | 1.001 / 1.007 / 1.014 |
| 同源未修复 | 60 | 209.54 / 209.86 / 209.91 | 268.81 / 269.23 / 269.38 | 209.63 / 209.93 / 209.98 | 60.094 / 60.375 / 60.594 | 1.001 / 1.005 / 1.010 |
| 维护版 | 5 | 80.34 / 80.61 / 80.67 | 109.96 / 110.27 / 110.31 | 80.34 / 80.61 / 80.67 | 4.953 / 5.016 / 5.016 | 0.987 / 0.990 / 0.992 |
| 维护版 | 15 | 80.34 / 80.64 / 80.67 | 109.96 / 110.27 / 110.31 | 80.34 / 80.64 / 80.67 | 14.656 / 14.953 / 14.984 | 0.976 / 0.995 / 0.996 |
| 维护版 | 30 | 80.55 / 80.80 / 80.85 | 110.18 / 110.42 / 110.50 | 80.55 / 80.80 / 80.85 | 29.641 / 29.984 / 30.094 | 0.985 / 0.998 / 1.000 |
| 维护版 | 60 | 80.46 / 80.71 / 80.80 | 110.00 / 110.24 / 110.32 | 80.55 / 80.80 / 80.86 | 59.531 / 59.578 / 59.922 | 0.992 / 0.992 / 0.998 |

60 秒同源比较的工作集中位数为 **209.86 → 80.71 MiB，减少 129.15 MiB**；Private 中位数为 **269.23 → 110.24 MiB，减少 158.99 MiB**。它们是六项修复在本机空窗口条件下的合计效果，不能把差值全部归因于 MGE-DX12-001，也不能把闲置资源的名义 96 MiB 当作实际内存下降。

5–60 秒中位数总体稳定，未见这段采样窗口内的持续大幅增长；这只覆盖每轮 60 秒，不是长期泄漏排除。60 秒维护版 CPU 中位 59.578 秒、约 0.992 个逻辑核，同源未修复约 1.005 个逻辑核，官方约 0.998 个逻辑核。三者都接近一个逻辑核；本轮六项修复未解决这个空窗口 CPU 占用问题。

[归档 module-comparison.json](../validation/20261018/module-comparison.json) 中列出的图形模块显示：官方和同源未修复版有 vulkan-1.dll、nvoglv64.dll；维护版没有这两项，保留 d3d12.dll、D3D12Core.dll 和 nvwgf2umx.dll。该观察支持 DX12 不再附带加载这些 Vulkan/OpenGL 驱动模块；不能由模块列表单独分解各修复的内存贡献。

## 首次 mip 成本与功能日志的内存边界

三次设备生命周期中，首次 Draw 外 mip 为 **1.208–1.248 ms**；同设备的重复 Draw 内 mip 为 **0.075–0.109 ms**。首次调用承担 lazy pipeline 初始化，延迟创建并未消除首次使用成本。下表摘录 release-final/lifecycle.log 中 mip 前、首次后和六次重复后的进程内存：

| 设备轮次 | mip 前 WS / Private MiB | 首次 mip 后 WS / Private MiB | 第六次重复 mip 后 WS / Private MiB |
|---|---|---|---|
| 1 | 61.40 / 94.19 | 62.77 / 95.64 | 70.79 / 103.66 |
| 2 | 77.41 / 111.59 | 77.75 / 112.04 | 77.76 / 112.04 |
| 3 | 83.30 / 119.81 | 83.63 / 120.73 | 83.63 / 120.73 |

功能 probe 同时创建纹理、生成 mip、GPU 等待/回读、验证分页和 query；它的内存和时间不是 quiet 空窗口比较。没有在同一设备反复创建/销毁整套 mip PSO，因此该日志也不能单独证明临时 COM blob 的泄漏斜率；RAII 改动还依赖源码生命周期审查。功能日志与九轮 quiet 统计分别使用，不拼接成同一条内存曲线。

## RIDless 运行与独立 cadence

mge/out/blank-ridless-run-final.json 记录使用 dotnet 执行未设置 RID 的 Blank.dll，参数 --seconds 3，Completed=true、ExitCode=0，实际加载 native runtime 的完整 SHA256 为最终 24E2EC39…（完整值见产物身份表）。这是 RIDless JIT 消费路径的短时成功运行；不是本轮 NativeAOT 内存配置。

mge/out/hosting-cadence-final.log 记录 **59.99 UPS、29.99 FPS、CPU 0.172 秒 / 5.001 秒，即一个逻辑核的 3.44%**，并记录 GPU sleeping cadence/CPU bound 断言通过。该 cadence 是独立的 hosting 调度场景；不能用它改写上面 quiet 空窗口约一个逻辑核的实测结果，也不能宣称两种场景具有相同调度条件。

## 待补验证与边界

截至本次更新，九轮 quiet 内存汇总已完成。以下项目仍待补，不提前下完成结论：

1. **真实 Game NativeAOT 十次路径**：发布已完成，运行验收进行中；需补全部路径的实际运行/加载 DLL、场景结果、退出码及独立证据。当前少数已进行的路径不等于十次完整通过。
2. **NuGet 公开发布后的独立还原**：本记录仅核对本地包；公开还原、空缓存验证、公开 nupkg 身份和内部 DLL 哈希仍待补。仓库签名可能改变整个 nupkg 的哈希，须分别记录包哈希和内部 DLL 哈希。

本记录不宣称上述待补项目已完成，不将本地包核对等同于公开发布验证。
## 新闻结算中断与修复

最终运行库实际接入的 Shipping NativeAOT Game 在同一进程进入4场战斗后，第四次死亡返回新闻时停止自动收起。原始证据 `mge/out/aot-route-final/route.process.json` 明确为 `Completed=false`、`AuthoredBattleCount=4`、`FullTenBattleRouteCompleted=false`，不得将其写成十局通过。

该问题已用不依赖原生图形或音频的 fake 回归确定为游戏展示时钟死锁：`voxAnc31`的实际5.16375秒声音先于6.4秒字幕结束，音频完成提前return冻结了展示年龄。MyGameEngine `1c218fd4e3b8ef01ec9834b9e2c4ea4bd2966153` 修复此逻辑并新增六种小步边界回归；旧逻辑红灯、修复后VO/News/音乐组绿灯。

`mge/out/news-subtitle-fix`保存真实最终Opus自然排空等19项断言、固定voxAnc31的12秒开发Game trace、实际24E2运行库hash和截图。该开发Game的AssetsCompiled完整来自先前Shipping包。trace记录约1.052秒TryPlay成功，声音年龄5.1667完成且请求Completed/outstanding=0，News年龄7.4正常淡出；最后截图字幕消失且菜单恢复。不改声音/字幕时长或音质。

用户中止了界面自动操作，NuGet候选仅已上传并核对元数据，**尚未Submit发布**。修复后Shipping AOT的重新发布、真实十局和NuGet公源空缓存验证仍待补齐。具体游戏故障记录见相邻MyGameEngine仓库 `games/Monster/docs/news-result-short-voice-20261018.md`。
