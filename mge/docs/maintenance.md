# 维护、版本与同步

## 基线与边界

上游为 https://github.com/MonoGame/MonoGame。首个维护分支 mge/3.8.6
固定为官方包所记录的 c610a529667336f63da323c6057274258727664b，子模块见 ../upstream.json。
本轮不创建远程自维护仓库，也不向上游提交内容。upstream 仅用于读取。
保留完整 Git 提交历史和上游许可证；只初始化本次 DX12 构建需要的子模块。

## 按官方发行版维护

每个有实际引擎需求的官方正式发行版建立 mge/<version>，从该发行版来源提交开始。
不以 develop 最新 HEAD 替代发行版基线，不为没有需求的所有旧版建立分支。
升级或补维护旧版时，逐项核查 fixes.md：已由官方解决的记录官方提交及验证证据；
仍存在且适用的通过 cherry-pick -x 或最小适配迁入，保留来源提交并重新跑回归。
补丁冲突按该发行版实现处理，不能只根据 patch 应用成功判断问题存在或已修复。
版本矩阵区分待核查、适用、已移植、官方已修复、不适用。
发布后不重写维护分支的已发布提交；修复通过新提交和新 mge.N 发布。

## 历史证据（北京时间）

- 最早公开写入：2025-02-17 22:24:44，5a4cbb84c5a6e726f0eb114255c6592d26624e20，
  First commit of DirectX 12 for Windows and Xbox platforms.
- 合入 develop：2025-06-12 14:13:05，PR #8646 的 merged_at；
  合入提交 87bc4749186d59fc0ea5bd356e22c7252622041c。
- 初版 CommandContext.cpp:43 已按 MAX_BACK_BUFFER_COUNT=3 分配
  512 x D3D12_DEFAULT_RESOURCE_PLACEMENT_ALIGNMENT = 每份32 MiB，共96 MiB。
  初版绘制路径已有独立 MGG_Buffer；不能归因于后来环形缓冲改造。
- 这是固定闲置预分配，不是每帧持续增长的内存泄漏；资源字节数不等于工作集下降值。
- MyGameEngine 的 upstream-audit-20261017.md 于2026-10-17核查的 develop HEAD 为
  76086c97bb780dfdb371945c5abe862cd245f7a0；不是未经复核的当前最新 HEAD。

证据链接：
[初始提交](https://github.com/MonoGame/MonoGame/commit/5a4cbb84c5a6e726f0eb114255c6592d26624e20)、
[PR #8646](https://github.com/MonoGame/MonoGame/pull/8646)、
[合入提交](https://github.com/MonoGame/MonoGame/commit/87bc4749186d59fc0ea5bd356e22c7252622041c)。

## 交付约定

包 MyGameEngine.MonoGame.Runtime.Windows.DX12，首版3.8.6-mge.1。
仅Windows x64 DX12；Framework官方3.8.6。每次交付记录源码提交、子模块、工具链、
构建参数、DLL SHA256和回归结果。不修改官方NuGet缓存，不在消费者构建时编译原生源码。


## WebGL2 实验线状态

本机官方进展、独立工作树和 Monster 接入时机见 [WebGL2 状态记录](webgl2-status.md)。该记录与 DX12 发行线基线及发布包分开维护。
