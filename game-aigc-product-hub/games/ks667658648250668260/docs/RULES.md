# 《我的未婚妻》互动剧游铁律清单

> 从 `docs/CHANGELOG.md` 自动抽取（2026/8/10 01:30:07）
> 共 **21** 条编号铁律 + 18 条无编号历史铁律

> ⚠️ 改代码前必读；违反任何一条会导致回归 bug。
> 全项目铁律（图片生成/视频生成/kling API 等技术类）在 `CLAUDE.md`。

---

## 📖 编号铁律（新→需按编号查阅）

| 编号 | 首次定义于 | 铁律内容 |
|---:|---|---|
| 21 | `v71.24` | video 节点无字幕，需要说书人字幕必须 forceCaption:true。 |
| 22 | `v71.24` | 本地大 PNG 首帧图 >1MB 必须 mv 到 /Users/fat/weihunqi-large-assets/frames-v71-24/ 外挂，assets/frames/ 里保留 <1MB 的 jpg，防止 ksmg 打包超限（project.config.json 的 ignore 对 ksmg 不生效）。 |
| 23 | `v72.2` | subtitles.js 是打包产物，改视频/加 BE 视频后必须重跑 python3 scripts/subtitles/build_subtitles_js.py。 |
| 24 | `v72.2` | 章节回跳任何 image/choice 节点必须先塞 lastframe 兜底再走 CDN，禁止裸等 loadImg。 |
| 25 | `v72.3` | 所有 char 字段必须 ∈ charInfo 白名单且与 speaker 前缀一致，validate-story.sh 强制校验，禁止回归。 |
| 26 | `v72.3` | 胶囊 UI 常量（CAPSULE_W）必须共享，禁止两处硬编码。 |
| 27 | `v72.3` | 两组胶囊门槛（tutorial vs sister）绝对独立，禁止合并。 |
| 28 | `v72.4` | CDN 素材 URL 写入 story.js 前必须先 HEAD 验证 200，禁止靠人肉记忆； |
| 29 | `v72.4` | loadImg 必须有扩展名兜底，禁止裸信任 URL 扩展。 |
| 30 | `v72.5` | loadImg 回调 im=null 时必须保留旧 mediaImg，禁止裸赋 null 造成黑屏； |
| 31 | `v72.5` | 切换到图片节点前必须先预取该图，禁止用户点了继续才冷加载。 |
| 32 | `v72.6` | CARDS 表 name/sub 必须与剧情实际视频一致，改文案时 CARDS 同步。 |
| 33 | `v72.6` | CARDS 表里的卡必须在剧本里有 kind:skillcard 或 unlock 触发节点，禁止永远解不了锁的尸位素餐卡。 |
| 34 | `v72.7` | 所有『NPC 提问 → 玩家应答』语义节点必须走 choice 类型，禁止把嫂子问句写在 stay narrator 里让用户干看着。 |
| 35 | `v72.8` | CDN URL 映射本地 jpg 时，本地文件必须在打包白名单内（禁止 assets/frames/*.jpg 一刀切 ignore）； |
| 36 | `v72.8` | ASR clause 里有多个 speaker 的换人处（识别为逗号分句 + 说话人不同）必须走 subtitles.js 强制拆 clause，禁止靠一条 pattern 覆盖多说话人； |
| 37 | `v72.8` | 任何角色（不只 narrator）的 text 台词都算旁白，EP02+ 缺失 mp3 时必须补生成 + 加 NARR_LOCAL_FORCE。 |
| 38 | `v72.10` | 所有 choice 节点必须写 media（image 或 poster），禁止依赖『上一节点 mediaImg 残留』，因为 video→choice 场景下 clearVideo() 会清空 state.mediaImg。 |
| 39 | `v72.11` | 任何 choice 反应节点的 next 跨集时（EP02→EP03）必须有 narrator 过场桥交代时空/事件迁移，禁止一句『硬仗要打』就瞬移到炕上。 |
| 40 | `v72.12` | video 节点若 mp4 无音轨（kling 默认静音）且 char=narrator 时必须 NARR_VIDEO_ALLOW 白名单强制加旁白； |
| 41 | `v72.12` | 任何 image 节点的 node.text 必须与其 narr mp3 TTS 文本字对字一致（否则字幕/旁白对不上就是回归 bug）。 |

---

## 📚 无编号铁律（历史 · 仅供参考）

<details><summary>展开 18 条</summary>

- `v71.23`: mp3 与 mp4 声道排队 = mp3 独占 → mp4 从头带声音重播；
- `v71.22`: 两个门槛独立，禁止合并。
- `v71.21`: 互动剧游每个抉择前必须有 1 张场景图或 3s 视频铺垫；
- `v71.16`: 死因鉴定文案（可见）和 mp3（可听）必须逐字一致；
- `v71.15`: 所有 choice 必须每 opt 走独立 r_ 节点（独立图+旁白+回主线），禁止多 opt 挤同一 next；
- `v71.14`: 所有 stay 过渡节点必须有专属素材图，禁止靠 lastframe 缓存兜底充数；
- `v71.13`: stay 节点 = 保留上一段视频最后一帧作背景 + 必须手动点继续。
- `v71.12`: BE 结局对应的数值维度必须清零到 0，禁止散弹配数值让用户看不出因果；
- `v71.11`: 视频兜底图命名 = url basename 去 .mp4，assets/lastframe/ 目录归档。
- `v71.10`: 解锁类音频 InnerAudioContext 必须挂 state 保活，禁止局部变量创建即丢；
- `v71.8`: 解锁音频必须绑到 popup 触发点，不能挂在纯 UI 解锁点。
- `v71.13`: stay 节点 = 保留上一段视频最后一帧作背景 + 必须手动点继续。
- `v71.7`: 解锁人物级 popup 必须 stayInf=true，节奏由用户点击 / 说书大爷念完决定，禁止 2s 硬切。
- `v71.6`: 全局所有旁白/BE/解锁/引导 TTS 只允许用一个音色 = 说书大爷；
- `v71.5`: 新用户前 3 个节点（s1/s2/f0）UI 只有背景+对话+继续，第一次 choice 触发引导浮层，浮层收起后三数值胶囊数字滚动出现，s3 婉儿一开口成就胶囊解锁 + 大爷念解锁词 + 卡片收进胶囊。
- `v71.4`: stay:true 节点必须给用户「点/等音频完」二选一，禁止无按钮 + 音频截断双 buff 叠加。
- `v71`: 过渡节点必须显式声明 stay:true 才能保留字幕卡。
- `v67`: 只清 age>18s 的陈旧 loading）；

</details>
