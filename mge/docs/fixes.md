# 修复清单与版本矩阵

仅为 MyGameEngine 实际使用的官方发行版维护。其他版本在有需求时逐项核查。
每项文档随源码提交；最终验证报告记录对应提交。

| ID | 修复 | 3.8.6 状态 |
|---|---|---|
| [MGE-DX12-001](001-unused-constant-buffers.md) | 闲置常量缓冲 | 已迁入，待最终GPU验证 |
| [MGE-DX12-002](002-dx12-window-flags.md) | DX12 Vulkan窗口标志 | 已迁入，待最终GPU验证 |
| [MGE-DX12-003](003-mip-com-lifetime.md) | mip临时COM blob | 已迁入，待最终GPU验证 |
| [MGE-DX12-004](004-lazy-mip-pipeline.md) | mip管线延迟创建 | 已迁入，待最终GPU验证 |
| MGE-DX12-005 | CPU SRV描述符分页 | 待迁入 |
| MGE-DX12-006 | mip后恢复图形PSO | 待迁入 |

未包含实验性LazyQuery。对“官方未修复”的判断只针对已核查的基线或注明日期的审计，
不推断其他官方发行版或未来develop状态。
