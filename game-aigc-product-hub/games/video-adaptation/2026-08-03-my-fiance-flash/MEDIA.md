# MEDIA · 我的温柔未婚妻 · Flash 代表段落

策略：hybrid（图片 + 动图 + 视频 + 音频）
Master 参考图：assets/reference/su-xiaoyu-master.png（不可覆盖）

## 角色身份约束（苏小雨）
- 22 岁邻家女孩 · 长直黑发 · 齐刘海 · 淡金细边眼镜（部分节点有 / 部分无）
- 上装：米白色短袖开襟衬衫 / 白毛衣（有面粉印） / 粉色棉质连体睡衣（CG）
- 下装：牛仔短裤 / 家居长裤
- 表情基调：温柔微笑 · 眼眶泛红 · 低头脸红 · 惊讶张嘴

## approved Anchor · v1
- portrait-normal：温柔微笑正脸半身
- portrait-blush：低头脸红
- portrait-cry：眼含泪水
- portrait-surprise：捂嘴惊讶
- cg-pink-pajama：粉色棉睡衣 · 抱枕挡胸（f6 广告解锁 CG）
- cg-lean：靠肩依偎（HE 结局）

---

## 素材：portrait-master
类型：图片
用途：全节点通用立绘（占位使用参考图，v1 后可替换 AIGC 生成的透明立绘）
文件：assets/reference/su-xiaoyu-master.png
状态：完成
音频策略：无

## 素材：cg-pink-pajama
类型：图片（f6 广告解锁 CG）
用途：f6 广告后展示
文件：assets/image/cg-pink-pajama.jpg
状态：待制作（v1 用 master 占位）
音频策略：BGM 保持

## 素材：cg-lean
类型：图片（HE 结局仪式）
用途：ending he
文件：assets/image/cg-lean.jpg
状态：待制作（v1 用 master 占位）
音频策略：BGM 变奏

## 素材：bgm-warm-loop
类型：音频（BGM）
用途：全流程循环 · 淡入淡出
文件：assets/audio/bgm-warm.mp3
状态：待制作（Minimax music-1.5 生成 90s 温柔钢琴 loop）
时长：60–90s · 循环点无爆音
音频策略：BGM
人声检测：不适用

## 素材：sfx-choice
类型：音频（SFX）
用途：选择点击反馈
文件：assets/audio/sfx-choice.mp3
状态：placeholder（Web Audio 合成 · 短促清脆）
人声检测：不适用

## 素材：sfx-favor-up
类型：音频（SFX）
用途：好感 +N 时轻响
文件：assets/audio/sfx-favor.mp3
状态：placeholder（Web Audio 合成）
人声检测：不适用

## 素材：voice-su-xiaoyu-f1
类型：音频（角色语音）
用途：f1 节点她的台词
文件：assets/audio/voice-f1.mp3
状态：待制作（Minimax voice_clone 或 t2a_v2 预置温柔女声）
台词："你……你终于回来啦。饭快凉了呀。"
人声检测：通过

## 素材：video-f5-cassette
类型：视频（4s WebM/MP4 · 竖屏 720×1280）
用途：f5 关键锚点 · 童年录音带
文件：assets/video/f5-cassette.mp4
首帧：assets/keyframes/f5-start.jpg
尾帧要求：是
尾帧：assets/keyframes/f5-end.jpg
状态：待制作（本轮先跳过 · 用静态图 + 动效 CSS 替代）
音频策略：native-video-audio + BGM duck
采样帧检查：待检查
