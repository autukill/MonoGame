# 修复清单与版本矩阵

仅为 MyGameEngine 实际使用的官方发行版维护。其他版本在有需求时逐项核查。
每项文档随源码提交；最终验证报告记录对应提交。

| ID | 修复 | 3.8.6 状态 |
|---|---|---|
| [MGE-DX12-001](001-unused-constant-buffers.md) | 闲置常量缓冲 | 已迁入；原生生命周期与GPU回归通过 |
| [MGE-DX12-002](002-dx12-window-flags.md) | DX12 Vulkan窗口标志 | 已迁入；原生生命周期与GPU回归通过 |
| [MGE-DX12-003](003-mip-com-lifetime.md) | mip临时COM blob | 已迁入；原生生命周期与GPU回归通过 |
| [MGE-DX12-004](004-lazy-mip-pipeline.md) | mip管线延迟创建 | 已迁入；原生生命周期与GPU回归通过 |
| [MGE-DX12-005](005-paged-cpu-descriptors.md) | CPU SRV描述符分页 | 已迁入；原生生命周期与GPU回归通过 |
| [MGE-DX12-006](006-restore-mip-graphics-pso.md) | mip后恢复图形PSO | 已迁入；原生生命周期与GPU回归通过 |

MGE-DX12-007：[首次上传 Discard](007-virgin-upload-discard.md)，原版负对照与修复回归通过。

未包含实验性LazyQuery。对“官方未修复”的判断只针对已核查的基线或注明日期的审计，
不推断其他官方发行版或未来develop状态。

## 首版源码提交

- MGE-DX12-001: `6b9507039b0dd17d98ebb38bc826f8abfa2d5f46`
- MGE-DX12-002: `264a6d3e5d26f4bb4c0c035591329ad07970c2a8`
- MGE-DX12-003: `c9aef10b56078e0b45793e8414f59a8b380ae5c4`
- MGE-DX12-004: `e61763a80da1bda9fae51c0bac4b0b991a78b5da`
- MGE-DX12-005: `dba0937bb6b944915b5e6764320fc022f806075b`
- MGE-DX12-006: `ad392d7a4843216953baece2b19ba114e6fd5e0b`

- MGE-DX12-008: [上传缓冲使用既有对齐容量](008-upload-placement-capacity.md)，原生/GPU/真实 AOT 资源复核通过；无探针性能对照由引擎仓库记录。

## 微信平台维护与交付

记录日期：2026-10-24。微信是平台接入与兼容维护，不把新增平台能力统称为官方缺陷。
当前单包为 `MyGameEngine.MonoGame.Runtime.WeChat.WebGL2 3.8.6-mge.1`；
与上文 DX12 的“官方 Framework 不变”策略不同，微信单包内包含目标匹配的 Framework。

参考来源：官方 3.8.6 `c610a529667336f63da323c6057274258727664b`，选择性回移
`mge/webgl2@7bc100e013d82846e089492bb91e40d4c080eabc`。
微信冻结源码 `64cb55b90a0f4524378b3d241adc76ed0b3d87b8`，
标签 `wechat-webgl2-3.8.6-mge.1`。详见[来源、逐项跟进及接入指南](wechat-backend.md)。

| 项目 | 类别 | 已交付内容与源码依据 | 验证／跟进状态 |
|---|---|---|---|
| MGE-WX-001 | 平台接入 | 单包 Framework、SDL／WebGL2、NativeAOT-LLVM 导出；`052b2512`、`1f68c21f`、`66dec8c7`、`7d018511`、`c6cf8be9`、`991521c0` | 独立 MonoGame 消费者还原、AOT、导出及 GPU／SpriteBatch 通过；没有引擎或游戏依赖 |
| MGE-WX-002 | JS 兼容 | ES2019 校验、按 token 转换生成的 BigInt 字面量；`991521c0`、`d31394d5` | 回归和完整游戏导出通过；未知 LLVM 胶水布局报错，不静默套用 |
| MGE-WX-003 | 引用与身份检查 | 公共 API 对照、导出输入哈希；`7acac042`；检查实际解析的 Framework 路径而非仅同名 DLL 数量；`64cb55b9` | 4,161 项公共／受保护签名零增减；错误平台引用负对照按预期拒绝 |
| MGE-WX-004 | 文件系统兼容 | 本地目录索引、包路径映射、持久化事务，覆盖 Android 目录 stat 差异；`66dec8c7` 中的文件适配及测试 | 文件系统回归通过；完整消费者存档校验重载、远程缓存复用通过，远程分组由游戏接入层实现 |
| MGE-WX-005 | 输入与生命周期 | 触摸、方向／安全区、时钟重置、停止清理及扩展服务边界；`052b2512`、`66dec8c7`、`eaae4cae` | 独立触摸按下／释放、停止／重载与消费者闭环通过；合成测试不替代系统生命周期真机验收 |
| MGE-WX-006 | WebGL 兼容与开销控制 | 清屏写掩码／裁剪状态缓存及失效、微信 GL 对象／查询适配；`66dec8c7` | 状态缓存回归及独立 GPU 读回通过；未据此宣称 iOS 性能问题均解决，无 Gamma 回退 |
| MGE-WX-007 | 音频接入 | 2D SoundEffect 的 PCM WebAudio、Song 的本地／缓存文件播放；`052b2512`、`66dec8c7` | 独立开始／自然结束、完整消费者真实音效／音乐／VO 路径及清理通过；不含 3D／XACT／动态流能力 |

上述短提交对应本仓库 Git 历史，不代表整个浏览器分支已合并。
[`sources.json`](../wechat/sources.json) 锁定回移来源与文件清单；后续浏览器提交未自动跟入。
维护状态必须随每次选择性同步更新，未验证的增量保留为待核查。

发布验证见[冻结版本报告](../wechat/RELEASE-3.8.6-mge.1.md)与
[公网回执](../wechat/public-release-3.8.6-mge.1.json)：53 项后端回归、独立消费者、
从 nuget.org 空缓存还原的 Monster 完整开发者工具闭环分开记录。
2026-10-24 用户另行确认本版 iOS 真机验收，身份和范围补记于[微信指南](wechat-backend.md)；
不改写发布时的 `NOT_TESTED` 历史回执，不据此增加 Android 新包验收或 iOS 帧率／高性能模式实测结论。
