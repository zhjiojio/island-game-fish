# v4 全部结局素材

已制作 14 条结局成片：4 个正式、4 个反转、4 个荒诞、2 个隐藏；共 30 个制作分段，28 张独立首帧，总时长约 251.4 秒。

## 使用

- `video/`：14 条正式交付 MP4，按原 `ending ID` 命名，1080×1920 竖屏，H.264 视频、AAC 原生音轨。
- `manifest.json`、`ending-inventory.tsv`：结局 ID、标题、类别、原文、分段顺序、时长与 SHA-256。
- `characters/`：沿用的 8 位人物参考图，含别名共 9 张；许邵泽使用用户指定的执行者 A 原图。
- `keyframes/production/`、`segments/`：首帧与当前采用的原生音画分段。
- `requests/production/`：生成请求、分段规划和尾部裁剪记录。
- `review/`：抽帧、独立语音转写、审核及交付校验。带 `previous` 的历史版本仅为审核存档，交付以 `video/` 为准。

原结局节点没有 videos/shots，本次依照每个结局的 description 与 closing 制作画面；分段文本拼接逐字保留原文。所有视频由 Kling 原生音画同步生成，合并保留原生音轨。遗憾结局一段裁掉了模型额外生成的尾部人声，原始文件与时间范围已存档。

审核采用画面抽帧、独立语音转写及音视频技术校验；姓名同音字等转写差异记录在各分段 review 中。
源 v4 JSON 与原有 55 条剧情视频保持不变，剧情视频仍位于相邻 `story-v4/video/`。本目录只补充结局素材，未修改游戏运行逻辑。

## 生产记录

生产目录：/Users/kwaibear/work/minigame/game-aigc-product-hub/games/ks867658648250668260/materials/story-v4-endings
脚本：/Users/kwaibear/work/minigame/game-aigc-product-hub/games/ks867658648250668260/outputs/ending_ops.py
任务恢复文件：/Users/kwaibear/work/minigame/game-aigc-product-hub/games/ks867658648250668260/.cache/media-jobs/story-v4-endings/production/，具体采用 task.json 中的 jobFile。

核验报告：`review/delivery-verification.json`、`review/native-audio-volume-verification.json`、`review/source-text-coverage.json`、`review/original-videos-unchanged.json`。
