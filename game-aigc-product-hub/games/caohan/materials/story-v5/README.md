# v5 原生音画重制

用户已认可五条样片，并授权继续其余 64 条。全量为 55 条主剧情与 14 条结局，共 69 条。

当前已合成 **69/69 条**。剩余批次 70 个生产片段中，70 个已生成，70 个通过逐段审核。生成不等于通过，实时证据以 [全量交付清单](review/full-delivery.json)、[阶段状态](review/phase-summary.json) 和审核记录为准。

新版声音标准：无解说、无内心 OS、无镜头或动作念白；仅人物真实对白、合理非语言反应与场景声，由 Kling 同次原生生成。旧视频仅提供视觉参考。

[五条已认可样片](pilot-review.md) · [全量分镜](scripts/story-v5-review.md) · [v5 剧本 JSON](../../output/逃婚后我花千万雇了工地糙汉.v5.json)

两处原待定事实采用保守改编：旧姓通过不露字的纸条与反应表达，不新增具体姓氏；只展示已保存通话条目，不编造未知录音内容。原图选项/广告文案保持原状，35 处广告首句一致性仍须在工程交付前对齐。

旧 v4 素材、原始剧本与当前 downstream 配置保留。当前工作为 v5 素材生产，尚未切换 CDN 交付。断点恢复使用 tools/run_full.py 与 .cache/media-jobs 里的既有任务；不要重新运行 prepare_full.py 覆盖已审核请求。

## 正式成片

[只含69条成片的目录](delivery/video) · [成片清单](delivery/media-manifest.json) · [最终核验](review/final-verification.json)

全量解码、音轨、文件哈希与剧本图结构核验通过。video/ 根目录保留生产分段与退回版本，仅 delivery/video/ 用于正式素材交付。新版 CDN 和工程配置尚未切换。
