# MGE-DX12-005：CPU SRV描述符分页

适用发行版3.8.6，该官方基线尚未包含修复。
提交：`git log --all --oneline --grep=MGE-DX12-005`；最终报告记录完整SHA。

复现：空窗口初始化时CPU SRV堆预留65536项。改为4096项稳定分页、按需创建，保留65536上限和空闲索引复用。创建成功后才提交索引，失败可重试。PagedDescriptorProbe分配满容量，通过GPU读回验证0/4095/4096/65534/65535跨页句柄，以及耗尽、释放复用。GPU可见堆、query和fence不变。

其他发行版须重新核查上游状态和适用性。

共用复现代码与运行方法：[build-and-release.md](build-and-release.md#自包含复现入口)。
