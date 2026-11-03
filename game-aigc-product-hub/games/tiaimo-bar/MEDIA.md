# MEDIA.md — 提艾默酒吧

策略：hybrid（真人源素材处理为游戏可用资产，无需 AI 重新生成）

## 角色身份 Anchor（approved）

参考：input/raw-assets/source-bundle/ 三张 Kim*.png = 完整 UI mockup（身份明确）
- 主角代表：啤酒妹（兔耳）—— 参考图 012729 中 "兔兔在营业"，identityAnchor: true
- 四候选人真人视频均 1080×1920 竖屏，身份明确，直接裁剪转码复用。

## 素材清单（状态：完成）

### 视频（assets/video，720×1280 H.264 faststart）
- opening-scene.mp4 ← 主场景.mp4 ｜ 用途：opening/intro ｜ 音频：native-video-audio + BGM
- pijiu-perform.mp4 ← 啤酒妹---02机车 ｜ 啤酒妹亮相/PK ｜ native + BGM duck
- tiaojiu-perform.mp4 ← 调酒师v0 ｜ 调酒师亮相/PK ｜ native + BGM duck
- zhuchang-perform.mp4 ← 驻唱---02豪车副驾 ｜ 驻唱亮相/PK ｜ native + BGM duck
- lingwu-perform.mp4 ← 瑜伽 ｜ 领舞亮相/PK ｜ native + BGM duck

### 关键帧海报（assets/keyframes，PNG fallback）
- opening-scene.png / pijiu-poster.png / tiaojiu-poster.png / zhuchang-poster.png / lingwu-poster.png / bar-booth.png

### 头像（assets/image，排名榜用）
- avatar-pijiu/tiaojiu/zhuchang/lingwu.png（120×120）

## 采样帧检查
源素材为真人成片，身份/服装/动作连续性由源保证；转码仅裁剪缩放，无重绘。

## 音频
各视频保留原生音轨（native-video-audio）；游戏内 BGM 用 CSS/JS 控制音量 duck；人声检测：不适用（复用真人原声）。
礼物音效为轻量拟音，来源：程序生成/占位，可后续替换。
