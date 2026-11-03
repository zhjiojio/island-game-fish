# Digital Human Lip Sync

用于数字人参考图、台词或已有语音生成对口型视频。

本通路调用 Kling Provider 原生 lip-sync 接口，把已审核语音变换为同步口型；它不是后期音轨拼接，也不得用 ffmpeg mux 冒充 lip-sync。

## 输入

- 数字人图绝对路径与必须保持的身份特征。
- 台词文本或已批准语音绝对路径；文本输入时同时提供音色与表演方向。
- 基础视频方向、时长，以及语音、基础视频、lip-sync 视频、审核证据和 job file 的绝对输出路径。

## 阶段

1. 用 `tools/process_image/inspect_reference.py` 检查数字人图并由调用方确认身份与出镜构图。
2. 若只提供文本，使用 `tools/voice_clone/` 的普通 TTS 合成命令生成语音；不得把普通 TTS 声称为克隆音色。
3. 用 `tools/inspect_audio/` 检查语音格式、时长和人声证据。
4. 数字人图审核通过后，用 `tools/make_videos/` 从数字人图生成可供对口型的基础视频，并检查人物身份、嘴部可见性和自然动作。
5. 参考图、语音和基础视频审核通过后，调用 `tools/lip_sync/`，job file 写入 `.cache/media-jobs/`。
6. 用 `tools/process_video/probe.py` 与 `extract_review_frames.py` 检查成品视频、音轨、嘴部运动和全时段身份表现。

## 审核门

数字人图先通过身份审核；语音与基础视频再通过时长、人物和可对口型性审核。全部审核通过后才提交 lip-sync 付费任务。最终同步质量由 Media Director 结合视频和音频判断。

## 输出

- 文本输入时生成并审核的 TTS 语音。
- 已审核基础视频。
- lip-sync MP4、全时段审核帧与探测结果。
- 使用的语音来源和当前审核结论供调用方登记。

## 恢复

已批准语音和基础视频不变时复用。lip-sync 轮询中断复用原 job file；语音或基础视频变化时只使 lip-sync 及其审核证据失效。Provider 特有时序处理留在 Tool 内部。
