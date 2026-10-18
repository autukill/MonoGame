# MGE-DX12-004：首次使用创建mip管线

适用发行版3.8.6，已核查该基线未含修复。
提交：`git log --all --oneline --grep=MGE-DX12-004`；最终报告记录完整SHA。

复现：空窗口不生成mipmap，仍在CommandContext构造时创建compute PSO。
移除构造时创建，在GenerateMipmap中检查m_generatePipelinePSO并按需初始化。
保留原渲染线程；NativeLifecycleProbe记录首次/重复调用耗时和使用后内存，
覆盖Draw内外、逐级精确像素和设备重建，不能只报告空窗口下降。

其他官方版本须重新核查上游状态和适用性。
