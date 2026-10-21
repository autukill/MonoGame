# Fix / Change / 上游状态台账

本线初始基线 dded52074d8358504f93d9da8c3ddd9241d2fd46。状态仅适用于明确核查的提交。

| 记录 | 性质 | 旧基线 7b3e80bb | 当前基线 dded5207 |
|---|---|---|---|
| HIST-WEBGL-001：直接 Host.dispose 留下 Game 循环 | 历史发现 | 有运行证据，Draw 35→80，Dispose=0 | 上游增加 ready/stop 契约及 RequestStop；以最新接口重新验证，旧 RequestExit 补丁不迁入 |
| HIST-WEBGL-CHANGE-001：同页新 runtime | 历史实验 | URL 模块隔离实验曾通过功能测试，完整内存回收未验证 | 上游明确不支持；用户决定不纳入本轮维护，不增加 iframe/重建功能 |

历史原始 JSON 位于 ../validation/20261021/historical-20261020-*.json。它们证明的源码与工具链只属于历史实验，不作为当前版本已通过的证据。
当前基线完整回归及必要 Fix 在验证后追加，每个实际修复独立提交；不得把上游不支持的功能写成官方回归失败。
