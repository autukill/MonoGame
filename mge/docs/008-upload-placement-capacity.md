# MGE-DX12-008：复用上传分配的真实容量

D3D12MA 对 UPLOAD 缓冲使用 64 KiB placement alignment；原生 free list 却只记录申请宽度，例如 137,520 字节。相同 196,608 字节物理分配内的空余部分无法承接稍大的下一次请求，逐步增加的绘制批次留下大量闲置旧尺寸。

仅将 UPLOAD 资源宽度与 actualSize 向上对齐到既有 placement alignment；dataSize 仍为原逻辑长度。非 UPLOAD、常量环、跨帧 pending/discarded/free 流程与容量上限不变。不裁剪媒体、不减少 GPU 可用容量、不触发 GC。包含加法溢出保护。

回归要求对齐前后 D3D12MA Allocation::GetSize 不变、逻辑长度不变，同一页容量内可复用，超过页边界必须新建；GPU 验证首次与后续 Discard、顶点/索引、NoOverwrite、偏移及跨帧像素。原版负对照、Release 实测结果另行补充。仍为 3.8.6-mge.2 本地候选，未公开发行。

## 已完成的候选验证

- Release 原生回归：172 个导出、六套内置 shader 完全一致；三轮设备生命周期、mipmap 在 Draw 内外、查询容量/复用和 65,536 CPU 描述符边界通过。
- 上传缓冲：原逻辑长度、对齐分配字节数、同页复用和跨页新分配通过。
- GPU：顶点/索引、首写 Discard/NoOverwrite、同帧后续 Discard、偏移和增长尺寸连续六帧精确像素通过；每帧 5,000 次常量变化绘制和跨帧环复用通过。
- 独立资源诊断的真实 NativeAOT Game 三次切关：六核路线末期上传分配 35.6875 → 5.5 MiB，资源数 203 → 28，上传堆末期 56 → 8 MiB（优化后短暂峰值 24 MiB）。十二核压力路线末期上传分配 114.625 → 9.9375 MiB、上传堆 120 → 24 MiB；基线短暂峰值 184 MiB。不同强度分开比较，保留随机战斗差异的限制。

这些是资源统计，不是 CPU 驻留页。两组诊断使用同一 AOT EXE、资源快照及媒体字节；不启用强制 GC。无资源探针的最终 Release DLL 和正式无 QA Game 的工作集对照由引擎仓库单独记录，不能用诊断统计替代。
