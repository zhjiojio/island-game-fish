# Reference to Video

用于没有长期角色身份锁定要求、但必须先确定构图再生成视频的单镜头。

## 输入

- 一张或多张参考图绝对路径；原图只读。
- 镜头内容、动作、构图、时长、画幅和音频要求。
- 场景首帧、视频、审核帧目录和 job file 的绝对输出路径。
- 可选尾帧要求与尾帧绝对输出路径。

## 阶段

1. 用 `tools/process_image/inspect_reference.py` 检查参考图；需要确定性预放大时只创建工作副本。
2. 用 `tools/make_images/` 参考编辑生成场景首帧，必要时同时生成尾帧。
3. 把关键帧放入目标 UI 或交付构图中检查。
4. 审核通过后，用 `tools/make_videos/` 的 `image` 输入执行图生视频；需要尾帧时传 `lastImage`，job file 写入 `.cache/media-jobs/`。
5. 用 `tools/process_video/probe.py` 检查 MP4，再用 `tools/process_video/extract_review_frames.py` 抽取 0% / 25% / 50% / 75% / 100%。
6. Media Director 对照参考图、动作落点、道具、背景和安全区完成语义审核。

## 审核门

场景首帧（以及要求的尾帧）必须先通过构图、参考一致性和安全区审核；审核通过后才允许提交付费视频任务。技术探测和抽帧不能自动批准内容。

## 输出

- 已审核场景首帧和可选尾帧。
- MP4 视频。
- `extract_review_frames` 审核帧目录与技术探测结果。
- 返回调用方的当前门状态和单一未解决问题。

## 恢复

关键帧存在且仍匹配当前镜头要求时复用。视频轮询中断时复用同一 job file，不重复提交；视频或抽帧失败只重跑当前镜头，不影响其他素材。
