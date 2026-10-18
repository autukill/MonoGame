# 3.8.6-mge.1 发布记录

本版仅维护 Windows x64 DX12 原生运行库；官方托管 MonoGame.Framework.Native 保持 3.8.6。包 ID 为 MyGameEngine.MonoGame.Runtime.Windows.DX12，发布所有者为 ProjectHotspur。

## 固定源码与产物

- 维护分支：mge/3.8.6，官方基线 c610a529667336f63da323c6057274258727664b。
- 此包生产源码提交：9bef89ca658bdb1cc4d4c14cac1383207ba997d9；后续只有构建守卫、说明及验证归档更新，不重新标记已冻结 DLL 的来源。
- 上传 nupkg SHA256：4C4B845B1478F376BC52A9492045E330FB4FDC105270D51ADC03BEB63B713F32。
- mgruntime.dll SHA256：24E2EC39D7C8F0AC4AB9F8EE48024D3E5A34A310C3964272F05BCED11B8E4BC0。
- 六项修复及提交见 [fixes.md](fixes.md)，构建与手工网页发布步骤见 [build-and-release.md](build-and-release.md)。
- 没有创建自有 GitHub 远程，没有向上游提交 Issue/PR，没有改动官方 NuGet 缓存。

## 发布与公开源验证

2026-10-18 北京时间，通过已登录的 NuGet 网页核对元数据并点击 Submit，站点确认成功上传。公开地址：
https://www.nuget.org/packages/MyGameEngine.MonoGame.Runtime.Windows.DX12/3.8.6-mge.1

服务端验证和索引已完成，公开端点返回 200，页面显示安装命令和 README。独立新缓存从 https://api.nuget.org/v3/index.json 还原成功，不使用本地 feed 或回退缓存。

- 公开签名 nupkg SHA256：B8EE8592EFC15D00223B4F21E65DFFE1760E1DC2BFD4D9287F758EE790D1A6B5。
- dotnet nuget verify --all 成功，签名类型 Repository，签名者 NuGet.org Repository by Microsoft。
- 仓库签名改变了 nupkg 整体 SHA256；内部 mgruntime.dll、provenance 和 NuGet contentHash 与候选包一致，因此无须改写已锁定的内容哈希。
- 全新最小消费源码目录的无 RID Release、显式 win-x64 Release、NativeAOT + Full Trim 发布均成功；只构建/发布，没有运行消费者或 Game。
- 无 RID 的 DLL 位于 runtimes/win-x64/native/，Blank.deps.json 中有对应 runtimeTargets；显式 RID/AOT 的 DLL 位于输出根目录。这是标准 NuGet 部署差异，不做手工覆盖。
- 三个配置的 DLL 均为 24E2EC39…，并自动带齐 5 个许可证/第三方声明/provenance 文件。
- 引擎公共 Hosting/Audio 的 JIT × Portable/win-x64 四图 locked restore + Release 构建成功；NativeAOT × Portable/win-x64 四图 locked restore 成功。Windows CLI restore 验证显式传入 -p:RuntimeIdentifier=win-x64；restore -r 会设置复数 RuntimeIdentifiers，与本仓库按单数属性命名锁文件的方式不同。

小型报告见 [public-release-verification.json](../validation/20261018/public-release-verification.json)。完整本地日志保存在 mge/out/public-nuget/，不提交包缓存、截图或大日志。首次服务端尚未就绪的 NU1101 保留为过程记录，不计通过；后续成功验证使用了新的 packages-final 空缓存。

## 功能与内存证据的使用边界

发布前原生 ABI、172 个导出及 ordinal、六份 Effect 字节码、分页容量/复用、混合 mip/PSO、5000 次跨帧绘制、应用启动与内容检查均已完成，见 [validation-20261018.md](validation-20261018.md)。官方原版、同源未修复和维护版各三次空窗口 AOT 采样亦已归档，不再重复。

新闻展示时钟问题由 MyGameEngine 1c218fd4 修复；真实 Opus、字幕退出及修复后 AOT 有界启动已记录。随后修复后的同一正式 AOT 进程完成三场战斗并恢复新闻菜单；用户要求停止重复 Game 测试，进程已退出，FullTenBattleRouteCompleted=false。该轮没有满足十局，不改写为通过。

后续参考 MyGameEngine 的 docs/performance/aot-ten-route-20261018.md、aot-resident-ledger-20261018.md 和 basis-ldr-init-20261018.md 等已有实测，保留各自 EXE/DLL/场景和是否候选包的身份边界，不把其他 DLL 的结果当成本包新做的十局验证。本次公开源接入只进行还原、构建和产物哈希核对，不再运行 Game。
## 引擎接入提交

MyGameEngine main 提交 `29bc737e290f06029d0653bcb260c1b172d2adb3` 已锁定公开包版本、接入公共 Hosting/Audio 和直接 DX12 基准入口，删除旧 DLL 覆盖 targets 与仓库携带 DLL，保留历史 provenance。OpenGL/Vulkan/Android 和非 x64 选择未改。

正式 Game 的 Shipping NativeAOT 项目图另外通过 nuget.org 独立缓存 locked restore；实际 project.assets.json 仅有 MyGameEngine.MonoGame.Runtime.Windows.DX12/3.8.6-mge.1，无官方 DX12 runtime。此步骤只还原依赖，没有编译或运行 Game。引擎接入与公开源验证文档位于 MyGameEngine/docs/operations/monogame-maintained-runtime.md。