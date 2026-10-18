# MGE-DX12-002：DX12窗口不加载Vulkan

适用发行版：3.8.6；该官方基线未包含本修复。
提交：`git log --all --oneline --grep=MGE-DX12-002`，最终报告记录完整SHA。

复现：只创建DX12空窗口，检查已加载模块，原标志额外引入Vulkan加载器和驱动。
原因：MG_DIRECTX12与MG_VULKAN共用SDL_WINDOW_VULKAN条件。
修改：仅MG_VULKAN设置该标志，DX12仍使用现有HWND窗口创建路径。
验证：源码分支回归；独立DX12可见窗口初始化、呈现和退出；对照模块和内存。
OpenGL与Vulkan分支源码逻辑保留，不更改其配置或运行库。

上游状态仅针对已核查基线，不推断其他官方版本；迁入其他版本前重新确认问题与实现。
