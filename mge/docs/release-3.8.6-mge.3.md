# 3.8.6-mge.3 BC7 配套维护包公开发布

2026-10-28，用户授权发布、合并和推送自有维护仓库。

- [Framework](https://www.nuget.org/packages/MyGameEngine.MonoGame.Framework.Native/3.8.6-mge.3)
  与 [Windows DX12 Runtime](https://www.nuget.org/packages/MyGameEngine.MonoGame.Runtime.Windows.DX12/3.8.6-mge.3)
  必须配套使用，程序集身份仍为 MonoGame.Framework 3.8.6.0；其他后端不启用 BC7。
- 生产源码提交 `5bf661b0f85ab196e0729e2635512732dc4166ab`，已合入并推送 `mge/3.8.6`。
  BC7 独立功能提交仍为 `3e3bace62`，未来官方版本升级按 `009-bc7-textures.md` 逐项核查。
- 两包重新生产，9 项源码检查、172 原生导出、六份官方内置 Effect 及原生生命周期通过。
  本地包与公开包分别完成 BC7 linear/sRGB 上传、采样、压缩回读和完整 Mip 检查；
  非块对齐基础尺寸明确拒绝，不将其误记为支持。混合绘制和 PSO 恢复检查通过。
- 使用既有 NuGet Gallery 登录会话发布，没有读取 API Key，也没有声称运行 GitHub 发布工作流。
  发布后仅用 NuGet.org 和独立空缓存还原，实际载入新原生 DLL；两个签名均通过。
  公开包保留全部候选原始条目且逐字节相同，只新增 `.signature.p7s`。
- Framework DLL SHA256：`ef69f358292229b63556b4f3fe54c91090ddf1005844fb875b604de35ce05d81`。
  Runtime DLL SHA256：`79d004ca317188411a000b5deed0f4b9ef3eead5ecbf11ea7d8b6d56da66d27a`。
  正式包是新提交重新生产的二进制，不沿用旧本地候选的 DLL 哈希。

签名归档与候选归档分别记录在
[结构化发布记录](../validation/public-release-3.8.6-mge.3.json)。
本记录只确认 MonoGame 包的公开发布及消费，不代替后续引擎 NativeAOT 接入验证。
