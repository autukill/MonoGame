# 维护版 MonoGame DX12 后端探针

独立 NativeAOT x64 程序，运行维护版 MonoGame Framework 3.8.6-mge.3 和已修正
Tier 1根布局的诊断原生DLL。程序不引用引擎／Monster，不加载游戏内容或音频；
所有纹理和几何均由探针生成，无需安装.NET、管理员权限或图形调试层。

解压到新目录，双击 **Run-Probe.cmd**，等待测试窗口自动打开和关闭。
请不要提前关闭测试窗口。完成后返回整个 **backend-probe-results-时间戳** 文件夹。
当前版本自动以独立进程依次运行三组：`none`（无默认深度缓冲）、`depth16`、
`depth24stencil8`。每组执行相同的完整后端套件，一组原生崩溃仍继续其余组。
顶层report.json汇总三组状态，组内保存各自的report.json、原始stdout／stderr及退出码。

自动依次检查：

1. 三次完整窗口／Game／GraphicsDevice生命周期，每次至少9帧实际Present。
2. 每次窗口在640×360／800×450间改变两次，检查实际交换链尺寸变化与DeviceReset事件。
3. 动态纹理更新、SpriteBatch纹理／采样器切换、离屏绘制及逐像素核对。
4. 图形绘制与原生compute mip生成交错；检查四级mip及三种交换链尺寸时的完整后台缓冲像素。
5. 复用既有GraphicsProbe的动态顶点／索引缓冲Discard／NoOverwrite六帧GPU回归。
6. 复用既有常量环5000次绘制／帧、跨chunk上传与六帧像素回归。
7. 检查NativeAOT身份、实际加载的mgruntime.dll绝对路径及SHA256，防止混用旧DLL。

日志中的 ResourceBindingTier 来自诊断DLL实际设备查询；Tier 1应显示
`DefaultRootSignature.Tier1.Bounded16`。原生错误会在stderr保留调用位置、阶段和
GetDeviceRemovedReason。创建视图和提交命令后增加设备状态检查；已安装系统调试层时
在创建设备前启用CPU API校验并记录消息ID，未安装时记录unavailable并继续，不安装或
更改系统组件。调试层的ERROR／CORRUPTION会使该组判为失败，即使像素检查通过。
此探针实际走MonoGame的资源上传、状态缓存、窗口和交换链，
用于接续已通过的Windows SDK根签名A/B探针；不覆盖完整游戏、长时内存或所有后端功能。

重点文件：result.txt、report.json、probe.log、stdout.txt、stderr.txt、launcher-result.txt。
报告以每阶段完成状态和完整像素检查为准；窗口提前关闭会判为失败。
每个子进程限时120秒，外层启动器限时390秒，只停止其自己启动的探针，保留阶段和退出码。

源码构建（从干净维护库提交；原生候选必须已完成ABI／内置Effect／native生命周期验证）：

```powershell
./mge/tests/Dx12BackendProbe/build.ps1 -OutputRoot ./mge/out/backend-probe-1 `
  -NativeBuildRoot ./mge/out/tier1-bindings-20261028/diagnostic-01
```

脚本串行restore／NativeAOT publish，禁构建服务器、节点复用、共享编译和并行构建。
只在独立输出中替换原生候选，不改NuGet缓存或正式包；验证候选提交至当前HEAD之间
原生编译输入未改变。包内保留原生来源、原公开包来源和实际加载身份。
本项目只用于诊断验证，不构成NuGet发布或完整游戏验收。
