# MGE-DX12-006：mip后恢复图形PSO

适用发行版3.8.6，该官方基线尚未包含修复。
提交：`git log --all --oneline --grep=MGE-DX12-006`；最终报告记录完整SHA。

复现：Draw内绘制A、生成mip，再用同一graphics PSO绘制A/B出现黑像素。compute覆盖PSO，而图形管理器hash未变跳过重绑。记录借用的graphics PSO，Reset清空，mip结束恢复，保持原PSO所有权。GraphicsProbe验证两纹理、混合mip、相同PSO六帧精确像素，另跑5000次常量跨帧验证。

其他发行版须重新核查上游状态和适用性。

共用复现代码与运行方法：[build-and-release.md](build-and-release.md#自包含复现入口)。
