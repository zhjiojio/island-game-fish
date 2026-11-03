# Character Node Video

用于角色驱动剧游节点，把 approved Anchor 转成经过身份连续性审核的节点视频。

## 输入

- 每个出镜角色的 immutable Master、approved Anchor 绝对路径和 Anchor 版本。
- 身份约束、允许变化、节点动作、对白、服装、道具、背景与时长。
- 角色表演区、字幕安全区、选择区以及首帧、视频、审核证据的绝对输出路径。

## 阶段

1. 用 `tools/process_image/inspect_reference.py` 检查 Master；低清 Master 只可经 `deterministic_upscale.py` 生成 `identityAnchor: false` 工作副本。
2. 验证 approved Anchor 版本与文件，不覆盖 Master。
3. 用 `tools/make_images/` 参考 approved Anchor 生成节点首帧；动作落点、关键道具或选择衔接需要时生成尾帧。
4. 在真实 UI 构图中检查脸型、五官比例、年龄、发型、辨识特征、服装、手、道具和安全区。
5. 审核通过后，用 `tools/make_videos/` 从节点首帧生成视频，异步 job file 写入 `.cache/media-jobs/`。
6. 用 `tools/process_video/probe.py`、`extract_review_frames.py` 和 `inspect_identity_continuity.py` 生成全时段证据。
7. Media Director 对照 approved Anchor 做最终身份与内容判断；连续性工具只提示漂移。

## 审核门

节点首帧必须通过身份、构图和 UI 安全区审核；审核通过后才生成视频。视频完成后必须审全时段采样，像素差异不能自动批准身份。

## 输出

- 节点首帧和可选尾帧。
- 身份审核后的节点 MP4。
- 全时段采样帧、`inspect_identity_continuity` 辅助报告和技术探测结果。
- Anchor 版本与审核结论供调用方登记。

## 恢复

Anchor 版本或节点关键帧变化时只使依赖它的节点视频失效。相同 Anchor、镜头要求和关键帧可复用；异步中断复用 job file；单节点失败不回滚兄弟节点。
