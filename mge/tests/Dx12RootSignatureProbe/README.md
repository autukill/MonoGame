# DX12 根签名独立探针

此项目直接调用 Windows SDK 的 D3D12／DXGI／D3DCompiler，不依赖 MonoGame、
MyGameEngine、Monster、游戏资源、存档或 .NET 运行时。Windows x64，C++ 静态 CRT `/MT`。

解压整个包至新目录，双击 **Run-Probe.cmd**。程序无图形窗口，通常几秒完成，
自动创建 `probe-results-时间戳` 文件夹。请返回整个结果文件夹。
不需要管理员权限、开发工具或安装调试层；不会改动驱动和系统设置。

探针选取 DXGI 高性能优先的第一块硬件适配器，记录名称／PCI标识、驱动版本查询状态、
实际 ResourceBindingTier、根签名版本支持情况（查询至1.1），以及每个关键 API 的 HRESULT。
驱动版本查询失败只记录，不影响其余测试。

两个布局分别创建独立 D3D12 设备，最低功能级均为11_0：

1. `original_unbounded`：重建原六参数布局，VS／PS各一个b0根CBV，
   VS／PS各一个无界SRV表和无界采样器表；根签名版本1.0。
   只验证创建及随后的实际 GetDeviceRemovedReason，失败仍继续下一例。
2. `bounded_16`：除四个范围改为16描述符外，根布局、阶段可见性和flags相同。
   创建成功后使用完整初始化的VS／PS表、空SRV、实际纹理和采样器进行离屏三角形绘制，
   等待GPU fence（最多10秒），回读16×16目标的全部256像素并核对RGBA(64,128,192,255)。
   使用探针内HLSL，不消费或编译游戏着色器。

重点文件为 `result.txt`、`report.json`、`probe.log` 和 `launcher-result.txt`。
stdout／stderr原始流保留，启动脚本45秒保护只结束其自己启动的探针。

- `UNBOUNDED_REJECTED_BOUNDED_DRAW_PASSED`：此设备重现无界布局失败，16槽创建和绘制通过。
- `BOTH_LAYOUTS_CREATED_BOUNDED_DRAW_PASSED`：此设备两种布局都可创建，16槽绘制通过。
- `BOUNDED_CASE_FAILED_OR_INCOMPLETE`：16槽例仍失败；看具体API、HRESULT和移除原因。

退出码0表示16槽创建与像素检查通过，并不要求原布局成功。
退出码1表示16槽例失败，2表示探针初始化失败。原生崩溃保留实际进程退出码。
没有强制移除设备、游戏逻辑、声音、内容加载或窗口／交换链测试；
此结果只用于定位根签名和基本GPU绘制，不能替代完整后端或游戏验收。

源码项目位于 `mge/tests/Dx12RootSignatureProbe`，构建脚本：

```powershell
./mge/tests/Dx12RootSignatureProbe/build.ps1 -OutputRoot ./mge/out/root-signature-probe-1
```

脚本从干净提交构建，串行执行、禁节点复用和构建服务器；构建一次后直接运行EXE验证，
保存进程PID／起始时间与编译日志，只有验证通过才生成交付ZIP。包内 source/ 含独立
CMakeLists.txt 和 Main.cpp，也可用 Visual Studio C++／Windows SDK自行构建。

参考：[Hardware Tiers](https://learn.microsoft.com/en-us/windows/win32/direct3d12/hardware-support)、
[Creating a Root Signature](https://learn.microsoft.com/en-us/windows/win32/direct3d12/creating-a-root-signature)。
