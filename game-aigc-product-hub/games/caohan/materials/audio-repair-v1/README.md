# 全片声音修复 v1（已交付）

69 条修订成片已完成本地审核、上传及 CDN 校验，包含 55 条主剧情视频和 14 条结局。工程交付入口为 `../../downstream/game-config.json`，素材版本 `audio-repair-v1`，配置版本 2.4.1。

当前成片在 `video/<videoId>.mp4`。`story-v4/video` 和 `story-v4-endings/video` 是保留的旧版，不会反映本次声音修复。

## 修改内容

- 分开处理画面说明、角色对白与画外叙述；“镜头切向”等制作指令不再朗读。
- 保留正确的角色原声；新增 28 段系统 TTS 画外音，不克隆真人音色。分离原声后保留环境/配乐底层，再混回正确角色对白。
- 62 条成片的视频画面流与原片完全一致；7 条仅修正局部嘴型或对白镜头。卧室两句女主对白使用经核对的 Kling 原生音轨重做。
- 修复自动文字对齐误切的“沐瑶”“冉冉”、句尾代词和短答“好”。
- 原 v4 剧本、原始成片以及旧 CDN URL 保留。旧工程配置与回执保存在 `../../downstream/internal/history/before-audio-repair-v1/`。

## 文件与验证

- `manifest.json`：本批唯一交付清单，含 69 个视频 ID、实际文件哈希、时长、对白及审核证据。
- `scripts/sound-script-v1.json` / `.md`：本批声音制作表，72 条有声内容；原 v4 的旁白字段不能直接当作配音输入。
- `scripts/audio-timeline.json`：原角色声音保留窗口及新画外音时间。卧室最终片采用原生重做音轨，不使用此表的旧候选混音。
- `review/final-media-verification.json`：69 条解码成功、旧片哈希不变、62 条视频流一致性核验。
- `review/review-decisions.json`：逐条证据索引，以及自动转写争议的处理记录。
- `review/delivery-verification.json`：69 条 CDN 完整哈希及 Range 验证、14 个结局可达、原剧本与 UI/剧情状态不变、凭证扫描结果。
- `audio/`、`stems/`、`requests/`、带 `.silent-picture` / `.dialogue-retake` 后缀的视频及 `review/previous-mix-v0/`：本地生产/审核中间文件，不能作为交付清单使用。

声音审核采用独立转写交叉核实、人声活动检查和原声边界核对；画面采用选帧及接缝检查。自动模型对短句、姓名和纯配乐会产生误识别，原始结果留档，最终判断以修订审核记录为准。以上不等同于逐音素口型测量。尚未在实际快小游戏工程中联调。

系统音色来源：https://platform.minimaxi.com/docs/faq/system-voice-id 。
