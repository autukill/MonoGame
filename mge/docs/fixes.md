# 修复清单与版本矩阵

仅为 MyGameEngine 实际使用的官方发行版维护。其他版本在有需求时逐项核查。
每项文档随源码提交；最终验证报告记录对应提交。

| ID | 修复 | 3.8.6 状态 |
|---|---|---|
| [MGE-DX12-001](001-unused-constant-buffers.md) | 闲置常量缓冲 | 已迁入；原生生命周期与GPU回归通过 |
| [MGE-DX12-002](002-dx12-window-flags.md) | DX12 Vulkan窗口标志 | 已迁入；原生生命周期与GPU回归通过 |
| [MGE-DX12-003](003-mip-com-lifetime.md) | mip临时COM blob | 已迁入；原生生命周期与GPU回归通过 |
| [MGE-DX12-004](004-lazy-mip-pipeline.md) | mip管线延迟创建 | 已迁入；原生生命周期与GPU回归通过 |
| [MGE-DX12-005](005-paged-cpu-descriptors.md) | CPU SRV描述符分页 | 已迁入；原生生命周期与GPU回归通过 |
| [MGE-DX12-006](006-restore-mip-graphics-pso.md) | mip后恢复图形PSO | 已迁入；原生生命周期与GPU回归通过 |

MGE-DX12-007：[首次上传 Discard](007-virgin-upload-discard.md)，原版负对照与修复回归通过。

未包含实验性LazyQuery。对“官方未修复”的判断只针对已核查的基线或注明日期的审计，
不推断其他官方发行版或未来develop状态。

## 首版源码提交

- MGE-DX12-001: `6b9507039b0dd17d98ebb38bc826f8abfa2d5f46`
- MGE-DX12-002: `264a6d3e5d26f4bb4c0c035591329ad07970c2a8`
- MGE-DX12-003: `c9aef10b56078e0b45793e8414f59a8b380ae5c4`
- MGE-DX12-004: `e61763a80da1bda9fae51c0bac4b0b991a78b5da`
- MGE-DX12-005: `dba0937bb6b944915b5e6764320fc022f806075b`
- MGE-DX12-006: `ad392d7a4843216953baece2b19ba114e6fd5e0b`

- MGE-DX12-008: [上传缓冲使用既有对齐容量](008-upload-placement-capacity.md)，原生/GPU/真实 AOT 资源复核通过；无探针性能对照由引擎仓库记录。
