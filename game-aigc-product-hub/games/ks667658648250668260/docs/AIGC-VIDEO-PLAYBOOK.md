# 未婚妻 · AIGC 视频生产手册

> 从 op1.v2（20s 双段白日梦）这一条完整实战中沉淀。
> 覆盖：提示词踩坑 → 压缩标准 → ASR 字幕机制 → 新增视频 SOP。
> 最后更新：2026-09-09

---

## 一、提示词：这次踩的四个坑

### 坑 1 · 只学叙事结构，漏了镜头语言

第一版我拆 VOW 的 PV，只总结出「钩子→舞台→契约→入口→角色轮播」的叙事分段，
写出来的提示词是一段平铺的场景描述。结果被打回。

**真正的差距在镜头。** VOW 拍女性角色有明确的四条语法：

| 手法 | 具体做法 |
|---|---|
| 机位永远低于视线 | 全程仰角，人物有压迫感和被仰视感 |
| 自下而上摇 | 从赤足/小腿起幅，沿腿→裙摆→腰侧→锁骨摇到脸 |
| 四级推进 | 全景 → 中景 → 特写 → 大特写，逐级压缩 |
| 特写只拍「湿」和「细」 | 汗珠、黏在颈侧的发丝、唇上水光、睫毛 |

**结论**：提示词必须写成**逐镜头脚本**（第一镜怎么走、第二镜接什么），
不能写成一段静态的场景形容词堆砌。

### 坑 2 · 自我阉割，把农村规矩套到现代梦境

我给自己立了个「三层遮盖原则」，把梦境女主写成
「米白色真丝长袖衬衫和深色西裤，衣着整洁保守」。

**根因**：那是给 1980 年代农村场景（沈婉儿本体）写的规矩，
被我无意识套到了现代办公室白日梦上——用农妇的标准拍都市梦。

**修正后的真实红线只有三条**：
- 不露点、不露三点区域
- 不做性行为暗示体位
- 不涉未成年

除此之外：**吊带、露肩、锁骨、腿部线条、湿发、蕾丝、真丝质感，全部可用。**

反例佐证：VOW 最有张力的一段是攀岩戏，衣服比泳池戏穿得**更多**。
张力来自镜头语言，不来自裸露度。

### 坑 3 · 一个 10s 提示词里塞五个镜头动作

VOW 的 54s PV 里**没有任何一个 10s 连续长镜头**，是 5 段独立素材拼的，
每段只做一个连续运镜。

我第一版想在单条 10s 里塞完「推轨→摇起→转头→抹汗→唇特写→嘘手势」，
这会直接导致 Kling 出现**换脸、手指畸形、运镜混乱**。

**规则**：一条生成 = 一个连续运镜。超过两次景别变化就必须拆段。

### 坑 4 · 大特写用了错误的光和词，人脸直接老十岁

段 B 第一版翻车得最惨：颈纹、法令纹、张嘴惊恐，比段 A 老十岁。

**三处自伤，全在我自己的提示词里**：

| 问题词 | 后果 |
|---|---|
| `细密汗珠反光`、`皮肤绒毛质感` | 大特写下把毛孔和细纹全部放大 |
| `台灯暖光侧打` | 硬侧光在特写里专打法令纹和颈纹阴影 |
| （缺年龄锚点） | Kling 默认往三十多岁走 |

**为什么段 A 没事**：段 A 是中景 + 柔光，这些词的伤害被距离稀释了。

**修正配方（大特写专用）**：

```
✅ 必加：
  二十三岁，清纯少女感，饱满苹果肌，眼神清澈，
  皮肤白皙细腻通透，光滑无瑕
  大面积柔光箱正面打光，光线均匀柔和地包裹面部，消除面部阴影
  台灯只作为背景暖色氛围光
  瓷白通透的柔焦质感，高级美颜光效
  全程表情放松柔和，嘴唇自然微张浅笑

❌ 必删（特写场景）：
  汗珠 / 绒毛 / 皮肤纹理 / 侧光 / 硬光 / 逆光

🚫 负面词必须点名：
  不要法令纹，不要颈纹，不要抬头纹，不要眼袋，不要皱纹，
  不要显老，不要中年人，不要憔悴，不要油光，不要毛孔粗大，
  不要硬光，不要阴影过重，不要惊恐表情，不要张大嘴，不要瞪眼
```

**核心认知：景别决定打光策略。中景可以用侧光塑造氛围，特写必须换柔光。**

---

## 二、角色一致性：首帧接力

两段之间保持同一张脸，靠的不是把描述写得更长，而是**首帧接力**。

```bash
# 1. 段 A 生成完，抽末帧
ffmpeg -ss <duration-0.12> -i segA.mp4 -frames:v 1 -q:v 2 A_last.jpg

# 2. 段 B 的 request.json 里把末帧作为首帧传入
{ "image": "/abs/path/A_last.jpg", ... }
```

同时段 B 提示词里**逐字复制段 A 的角色锚点段落**，并加：
- 开头写 `承接上一镜，同一位年轻东方女性，同一间深夜办公室，同一盏台灯`
- 负面词加 `不要换脸`

本次实测：脸、发型、眼镜、真丝吊带、台灯位置、窗外冷蓝，全部对上。

### 角色锚点（未婚妻·现代梦境线，直接复用）

```
二十三岁，清纯少女感，鹅蛋脸，饱满苹果肌，大眼双眼皮，眼神清澈，
皮肤白皙细腻通透，光滑无瑕，鼻梁秀挺，唇形饱满有柔润光泽，
黑色长发披肩微卷，戴细金属框眼镜，
米白色真丝吊带睡裙，肩带细，锁骨与肩线裸露
```

> 设计意图：这是**沈婉儿的脸配现代造型**（发髻木簪→长发微卷，米白棉布→米白真丝）。
> 玩家穿越后再见到婉儿本体时会产生「原来是她」的伏笔回收。
> 新增梦境线视频请沿用这套锚点，不要另起人设。

---

## 三、压缩：档位标准

### 本次实测数据（源：Kling 1080×1920，20s，23MB）

| 档 | 分辨率 | CRF | 大小 | 码率 | 画质评估 |
|---|---|---|---|---|---|
| A | 1080×1920 | 23 | 9.04 MB | 3846k | 无损级 |
| **B ⭐** | **1080×1920** | **26** | **5.98 MB** | **2544k** | **肉眼与母版无差** |
| C | 720×1280 | 24 | 3.26 MB | 1388k | 轻微软化，可接受 |
| D | 720×1280 | 27 | 2.32 MB | 986k | 细节丢失明显 |
| E | 720×1280 | 30 | 1.72 MB | 732k | 发糊、面部块状 |

**选型规则**：

- **开场 / 关键剧情 / 人脸大特写 → B 档**（1080p CRF 26）
  第一印象权重最高，低码率的块状感在脸上最扎眼
- **普通过场 / 中远景 → C 档**（720p CRF 24）
- **绝不用 E 档**：线上老素材虽是 ~680kbps 水平，但那是 10s 中景；
  20s 大特写用 E 会明显比老素材更糊

### 标准命令

```bash
ffmpeg -i in.mp4 \
  -c:v libx264 -crf 26 -preset slow \
  -profile:v high -level 4.0 -pix_fmt yuv420p \
  -movflags +faststart \
  -c:a aac -b:a 96k -ac 1 \
  out.mp4 -y
```

要点：
- `-preset slow` —— 同码率下画质更好，生成阶段不差这点时间
- `-movflags +faststart` —— moov 前置，**CDN 流式播放必须**，漏了会先下完才播
- `-ac 1` —— 单声道，AI 生成的对白本来就是单声道，省一半音频码率
- 降分辨率用 `-vf "scale=720:-2"`，`-2` 保证高度是偶数（h264 要求）

### 拼接命令（xfade 交叉溶解）

```bash
ffmpeg -i A.mp4 -i B.mp4 -filter_complex \
  "[0:v][1:v]xfade=transition=fade:duration=0.4:offset=9.64[v];\
   [0:a][1:a]acrossfade=d=0.4[a]" \
  -map "[v]" -map "[a]" \
  -c:v libx264 -crf 16 -preset slow -pix_fmt yuv420p \
  -c:a aac -b:a 192k merged.mp4 -y
```

- `offset` = 段A时长 − 转场时长（本次 10.04 − 0.4 = 9.64）
- **中间件用 CRF 16 高码率**，最终压缩只做一次，避免二次压缩劣化

---

## 四、ASR：字幕走运行时，绝不烧录

### 🚨 铁律：禁止把字幕烧进视频素材

本项目架构是 **ASR 出文本 → 运行时立绘 + 字幕渲染**。

烧录字幕会造成三个后果：
1. 文本被焊死在素材里，改一个字要重新生成整条视频
2. 和运行时立绘字幕**重叠双显**
3. 破坏 `subtitles.js` 的字符级时间轴对齐机制

**（这条是我这次实际犯过的错，专门立此存照。）**

### 字幕生产链路

```
无字幕视频
  → ffmpeg 抽 16k 单声道 wav
  → FunASR paraformer-zh 出字符级时间轴
  → content/subtitles/verified/<name>.json
  → npm run build:subtitles
  → package/js/subtitles.js
  → 运行时按 currentTime 逐字上屏
```

### ASR 命令

```python
from funasr import AutoModel
m = AutoModel(model="paraformer-zh", vad_model="fsmn-vad",
              punc_model="ct-punc", disable_update=True)
r = m.generate(input="audio.wav", return_raw_text=True, sentence_timestamp=True)
# r[0]["timestamp"] -> [[start_ms, end_ms], ...] 与 raw_text 逐字符对应
```

### 字幕 JSON schema（`content/subtitles/verified/<name>.json`）

```json
{
  "schemaVersion": 1,
  "url": "<CDN 完整 URL，必须与脚本里一致>",
  "sha256": "<文件 sha256，防素材偷换>",
  "duration": 19.708,
  "nodes": ["op1"],
  "status": "speech",
  "transcript": "剧本原文用词与标点（展示用）",
  "rawText": "ASR 识别的无标点发音序列",
  "asrChars": [[5.31, 5.49, "傲"], ...],
  "timingEngine": "FunASR-paraformer-zh",
  "crossCheckText": "ASR 原始带标点输出",
  "speakerRuleKey": "op1"
}
```

**关键点**：
- `transcript` 用**剧本原文**（ASR 会把「讨厌啦」听成「讨厌了」、「今晚」听成「今天晚上」）
- `asrChars` 只提供**时间轴**，构建脚本会用编辑距离把 transcript 对齐到 ASR 时间
- **换了视频文件名就必须有独立的 ASR 记录**，构建脚本不做后缀 fallback

### 字幕门禁

```bash
node scripts/tools/check-subtitles.js
# PASS subtitles: 89/89 exact video records; 220 cues; 2344 aligned characters.
```

---

## 五、新增视频 SOP（照着做即可）

### Step 1 · 拆镜头脚本

先决定要几段。**一段 = 一个连续运镜，10s 上限。**

| 情况 | 段数 |
|---|---|
| 单一运镜（如只做推近） | 1 段 |
| 有景别跳跃（中景→特写） | 2 段 |
| 超过 2 次景别变化 | 拆 3 段，或砍需求 |

### Step 2 · 写 request.json

```jsonc
{
  "prompt": "……",       // 结构见下
  "durationSec": 10,
  "aspectRatio": "9:16",
  "generateAudio": true,   // Kling 原生音画同步，禁止后期配音
  "image": "/abs/A_last.jpg"  // 仅接力段需要
}
```

**prompt 五段式结构**（顺序不要变）：

```
1. 场景 + 角色锚点（逐字复用第三节的锚点）
2. 镜头运动（一句一个动作，按时间顺序）
3. 台词（她用<语气>说：<内容>）
4. 摄影（机位/景别/打光/镜头焦段/质感）
5. 负面（按景别选，特写必带抗老化词组）
```

### Step 3 · 生成

```bash
S=/Users/fat/.codeflicker/remote-personal-skills/agw-work-mode
cd $S && KWALI_CREDENTIALS_FILE=$HOME/.config/kwali/credentials.json \
  python3 -m tools.make_videos <req.json> \
  --job-file <job.json> --output <out.mp4>
```

> Kling 是异步任务，前台会超时。用后台 + `terminal_output --wait_seconds 200` 拿结果。

### Step 4 · 验收（**生成完必看，别偷懒**）

```bash
# 抽帧铺图，一眼看完整条
ffmpeg -i out.mp4 -vf "fps=1,scale=300:-1,tile=5x2" -frames:v 1 sheet.jpg

# 特写帧全分辨率单看（查皮肤/手指/牙齿）
ffmpeg -ss <t> -i out.mp4 -frames:v 1 -q:v 2 chk.jpg
```

验收清单：
- [ ] 脸没变（多段时对比段间）
- [ ] 没有法令纹/颈纹/显老
- [ ] 手指数量正确、无畸形
- [ ] 台词口型对得上
- [ ] 运镜是连续的，没有瞬移跳切

**不过就重生成，不要将就。** 段 B 这次就是重生成一版解决的。

### Step 5 · 拼接 + 压缩

见第三节命令。中间件 CRF 16，最终 B 档 CRF 26。

### Step 6 · ASR

```bash
ffmpeg -i merged.mp4 -vn -ac 1 -ar 16000 asr.wav -y
# 跑 FunASR，写 content/subtitles/verified/<name>.json
```

### Step 7 · 上传 CDN

```bash
npx kcdn-upload <file.mp4> \
  --cdn-dir=AIGC-SoGame/ks667658648250668260 \
  --pid=KS-GAME \
  --token=<kcdn_token> \
  --uid=<邮箱前缀> \
  --allow-rewrite=true --allow-hash=false
```

**⚠️ 命名铁律**：CDN 有长缓存。改动已上线的视频**必须升新文件名**
（`op1.c.mp4` → `op1.v2.mp4` → `op1.v3.mp4`），
不要用 `--allow-rewrite` 覆盖同名，否则线上可能刷不掉旧的。

### Step 8 · 验证 + 写回 + 构建

```bash
# 铁律 28：必须验 200 且 sha256 一致
curl -sI "<URL>" | head -1
curl -s "<URL>" -o /tmp/x.mp4 && shasum -a 256 /tmp/x.mp4 <本地文件>
```

写回清单（一个都不能漏，漏了会残留旧 URL）：

| 文件 | 改什么 |
|---|---|
| `content/episodes/EPxx.json` | `media.file` / `duration` / `label` / `poster` |
| `content/assets.registry.json` | URL → poster 映射 |
| `content/subtitles/verified/<new>.json` | 新建；旧的移除 |
| `manifests/assets.json` | `cdn` 字段 |
| `docs/story-index.json` · `story-map.md` | 索引 |
| `package/images/lastframes/<new>.jpg` | 新 poster（540px 宽，~32KB） |

```bash
npm run build                          # registry + story + subtitles
node scripts/tools/check-subtitles.js  # 字幕门禁必须 PASS
grep -rn "<旧文件名>" --include="*.json" --include="*.js" . | wc -l   # 必须为 0
```

### Step 9 · 扫码

```bash
ksmg preview package -q -o preview-qr
```

---

## 六、已知的仓库失修（非本次改动引入）

跑流程时会撞到，先记下来免得下次再查一遍：

| 文件 | 问题 |
|---|---|
| `scripts/tools/validate-schema.js` | 文件不存在 |
| `scripts/tools/validate-rules.js` | 文件不存在 |
| `scripts/tools/assets-check.js` | 文件不存在 |
| `scripts/validate-story.sh` | `require('./js/story.js')` 路径失效（实际在 `package/js/`） |
| `scripts/preview.sh` | 白名单以仓库根为基准，游戏文件在 `package/` 下 → 打包 0 文件 |
| `packing.whitelist.json` | 曾被删除，已从 git 恢复 |

**能用的**：`npm run build`、`check-subtitles.js`、`ksmg preview package`。

---

## 附：op1.v2 成品档案

| 项 | 值 |
|---|---|
| CDN | `https://p5-ad.adkwai.com/udata/pkg/KS-GAME/AIGC-SoGame/ks667658648250668260/op1.v2.mp4` |
| 规格 | 1080×1920 / 19.71s / H.264 High@4.0 / CRF 26 / faststart |
| 大小 | 6,267,277 B (5.98 MB) |
| sha256 | `6cdc08b4c9932abf181de3fa7a1d9bd4715028eb16a5651917cd04918f22ba09` |
| 音频 | AAC 96k 单声道，Kling 原生同步 |
| 字幕 | **无烧录**，走 `subtitles.js` 运行时渲染，29 字符时间轴 5.31–19.225s |
| 生成 | Kling 3.0-pro，两段 × 10s，首帧接力 |
| jobId | 段A `926385537723297809` / 段B(v2) `926388473375244326` |
