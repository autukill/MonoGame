# 3.8.6-mge.2 公开发布与引擎接入

2026-10-18，北京时间。用户明确授权推送自有维护仓库、公开发布新版并接入 MyGameEngine main。

- 公开包：https://www.nuget.org/packages/MyGameEngine.MonoGame.Runtime.Windows.DX12/3.8.6-mge.2
- 生产源码：`a8be8f5d2bfb27c92709d2b7f03959257f0a10f7`，已推送 `autukill/MonoGame` 的 `mge/3.8.6`。本提交仅增加发布记录，不重标冻结 DLL 来源。
- 新增 MGE-DX12-007 / 008：避免首次上传 Discard 无用更名、复用既有 64 KiB placement 容量。官方托管 Framework 仍为 3.8.6；保留 172 导出、六套内置 Effect、其他后端与媒体质量。
- DLL SHA256：`9C3F4BD2963929A57B25BA5F2779D0926A52726626F4982339D1D33CDE3E9D59`。
- 上传候选 nupkg SHA256：`b0c82b52079610f8b0e28d092df2ba959e4c3e9016aae84798a9fe727cc59149`。
- 公开签名 nupkg SHA256：`3f7fdd37674923b991657f0f106966c527001eedc3284e8b72d6254329f10509`。
- NuGet 锁内容哈希：`RndGOr3ZVu07CprBwvoae7yn5OlkU9QDagMoO5ryoGdocYPYOtS5OWyaeIVUxuoLJcQQ36lgGsKqlKeJ+I8LAg==`。不要将 `.nupkg.sha512` 的已签名归档哈希用于 lock contentHash；一次误用被 locked restore 拒绝，已从实际 `.nupkg.metadata` 与 project.assets.json 修正，未改缓存或包。

网页核对元数据后 Submit 成功。服务端处理初期 404 被保留；之后 flatcontainer 返回 200。独立空缓存仅使用 nuget.org，还原、Repository 签名及 Release 消费者构建通过。公开包内所有候选原有条目的字节完全相同，只增加 `.signature.p7s`；因此沿用候选 DLL 的原生、GPU 和真实 NativeAOT Game 功能/内存证据，不把它说成签名包又跑了一轮完整测试。下载时搜索索引仍显示尚未完成，但指定版本的公开还原已成功。

引擎 main 提交 `f200c671` 更新统一版本及 Hosting、Audio、SpriteBenchmark 的十二份 JIT/NativeAOT × Portable/win-x64 锁。十二图 public locked restore 和六个 Release JIT 构建全部通过。OpenGL、Vulkan、Android、非 x64 官方回退的锁未改，未重测这些产品的 GUI。

两轮真实 NativeAOT Game 三次切关工作集 305.43～309.34 → 257.91～257.95 MiB，GC 提交堆约 98 MiB；无 QA 正式单场 30 秒 232.65 → 234.05 MiB，未宣称首场也有约 50 MiB 收益。KTX2、音频与音质不变，无强制 GC 或工作集裁剪。详细限制及原始身份见引擎 `docs/performance/dx12-upload-cache-20261018.md`。

签名/哈希与接入小型报告见 [public-release-mge2-verification.json](../validation/20261018/public-release-mge2-verification.json)。后续引擎从最新 main 发布不同后端用于额外内存比较，另记各自产物，不改写此包的发布身份。
