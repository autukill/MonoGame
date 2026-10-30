# MonoGame DX12 SM5.1 独立实验探针

解压到新目录，双击 **Run-Probe.cmd**，等待窗口自动打开和关闭，返回完整的
**sm51-probe-results-时间戳** 文件夹。无需安装.NET、SDK或图形调试层。

这是维护版MonoGame实际后端的SM5.1执行实验。使用FXC离线编译的vs_5_1、ps_5_1、
cs_5_1；原生诊断DLL拒绝任何非SM5.1图形shader，mip使用同源HLSL的SM5.1内核。
程序使用固定ABI的自定义MGFX Effect测试夹具，不依赖SpriteEffect或BasicEffect。
六份既有内置Effect保持原字节；没有加载或修改Monster，也没有迁移生产编译器。

自动以三个独立进程测试无深度、D16、D24S8：

- 每组3次完整Game／设备／窗口生命周期，每次9帧实际Present、2次窗口缩放。
- 顶点／像素阶段独立常量缓冲，纹理切换与采样器绑定、动态VB／IB Discard和NoOverwrite。
- 离屏绘制、SM5.1 compute mip四级像素回读、交换链三种尺寸整屏核对。
- 另一次6帧，每帧5000次改变VS／PS常量绘制，逐像素验证跨常量上传chunk。
- 核对实际加载DLL、EXE与shader哈希；可选系统API调试层存在时启用，错误使测试失败。

每个子进程最多120秒，一组崩溃后继续其他组，外层启动器限时390秒。成功以所有阶段
完成、实际像素核对和退出0为准。PSO创建成功本身不算通过。

覆盖边界：这验证SM5.1自定义Effect及mip在MonoGame后端的执行，不代表六份内置
Effect、任意.fx反射、完整游戏或其他显卡已兼容。Yoga是否通过以其返回日志为准。
SM5.1模式仅通过显式诊断构建开关启用，正常运行库默认路径保持原样。

构建按顺序串行执行：

```powershell
./mge/tests/Dx12Sm51Probe/prepare-shaders.ps1 -OutputRoot ./mge/out/sm51/shaders
./mge/build.ps1 -OutputRoot ./mge/out/sm51/native -StartupDiagnostics -Sm51ProbeShaders ./mge/out/sm51/shaders
./mge/tests/Dx12Sm51Probe/build.ps1 -OutputRoot ./mge/out/sm51/probe -NativeBuildRoot ./mge/out/sm51/native -ShaderRoot ./mge/out/sm51/shaders
```

构建要求干净已提交源码；脚本保留禁服务器、单节点、不复用、不共享编译的参数。
编译完成后直接运行产物，不重复构建。此项目不发布NuGet或游戏。
