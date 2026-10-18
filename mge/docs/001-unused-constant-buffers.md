# MGE-DX12-001：删除固定闲置常量缓冲

适用发行版：3.8.6；源码基线见 upstream.json。该基线仍有问题。
提交：`git log --all --oneline --grep=MGE-DX12-001`，最终验证报告亦记录完整SHA。

复现：Windows x64 DX12空窗口初始化时即创建并Map三份32 MiB上传资源。
搜索完整native源码，四组字段只有声明、创建、Map和offset重置，没有绘制读取者。
实际uniform上传经MGG_RingBuffer完成。起源和合入时间见maintenance.md。

改动：删除m_cbOffset/m_cbAlloc/m_cbRes/m_cbContent以及对应资源创建和重置。
保留m_tempTextures显式初始化、按帧和析构清理；活跃ring、fence、上传与绑定不变。

验证：mge/tests/test_001_unused_cb.py检查完整native引用及保留路径；交付前运行
5000次跨帧常量像素回归、纹理/target生命周期回归和同源空窗口内存对照。
减少96 MiB资源分配不保证工作集恰好减少96 MiB；不是持续增长泄漏。
上游状态：已确认3.8.6基线未修复；其他版本必须按维护矩阵重新核查。
