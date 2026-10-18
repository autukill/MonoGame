# MGE-DX12-003：释放mip临时COM对象

适用发行版3.8.6；官方基线尚未包含此修复。
提交：`git log --all --oneline --grep=MGE-DX12-003`；最终报告记录完整SHA。

复现：序列化compute根签名返回的两个原始ID3DBlob指针未释放。
改用ComPtr，序列化和CreateRootSignature使用现有ThrowIfFailed，覆盖失败路径。
native lifecycle执行三次设备创建销毁，验证mip精确像素；不改根签名或shader。

上游状态仅针对已核查基线；其他发行版须重新核查。
