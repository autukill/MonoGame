# MGE-DX12-008：复用上传分配的真实容量

D3D12MA 对 UPLOAD 缓冲使用 64 KiB placement alignment；原生 free list 却只记录申请宽度，例如 137,520 字节。相同 196,608 字节物理分配内的空余部分无法承接稍大的下一次请求，逐步增加的绘制批次留下大量闲置旧尺寸。

仅将 UPLOAD 资源宽度与 actualSize 向上对齐到既有 placement alignment；dataSize 仍为原逻辑长度。非 UPLOAD、常量环、跨帧 pending/discarded/free 流程与容量上限不变。不裁剪媒体、不减少 GPU 可用容量、不触发 GC。包含加法溢出保护。

回归要求对齐前后 D3D12MA Allocation::GetSize 不变、逻辑长度不变，同一页容量内可复用，超过页边界必须新建；GPU 验证首次与后续 Discard、顶点/索引、NoOverwrite、偏移及跨帧像素。原版负对照、Release 实测结果另行补充。仍为 3.8.6-mge.2 本地候选，未公开发行。
