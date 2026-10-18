# MGE-DX12-007：首次上传避免无用 Discard

真实 NativeAOT Game 的独立 Release 资源探针复现：252,360 字节的上传缓冲申请使 D3D12MA 上传堆由 56 MiB 增至 120 MiB；当时 free list 的 aligned 分配约 49 MiB。普通六核路线后期，上传分配约 35.69 MiB 中约 32.38 MiB 在 free list。缓存中的历史尺寸和初次写入换缓冲值得分别检查，不能把整个 64 MiB 堆块当作有效数据。

原版对全新动态缓冲的第一次 SetData(Discard) 也进行资源更名，把刚创建而尚未写入或绑定的资源放进跨帧缓存。用户绘制缓存随批次最大值逐步增长时，会留下很多历史尺寸。

本项仅复用尚未写入且未记录 IA 绑定的 UPLOAD 资源进行第一次写入。CPU 写入或顶点/索引绑定后即失去此资格；后续 Discard、非 UPLOAD、NoOverwrite、已有跨帧队列、容量和常量环保持原语义。单独标志避免把第 0 帧误当成从未使用。

NativeLifecycleProbe 的独立测试验证首写不换资源、第二次 Discard 必须换资源且旧数据保留，覆盖顶点/索引、首写 Discard/NoOverwrite、非零偏移与交错步幅。该测试只编译进回归 EXE，不进入 mgruntime.dll，不增加导出。另需运行现有 mip/query 生命周期、GPU 跨帧像素和真实 AOT 三次切关。

当前为 3.8.6-mge.2 本地候选，尚未公开发布或接入引擎；实际收益、负对照与回归结果在验证提交补充。KTX2、音频、音质、GC 和其他后端不变。
