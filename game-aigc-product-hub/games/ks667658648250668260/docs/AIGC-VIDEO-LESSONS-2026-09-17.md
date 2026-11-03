# 荒年记·未婚妻 · 新增视频生产问题沉淀（2026-09-17 会话）

> 本次任务链：第一章首帧图重做 → 白日梦「脱外套」互动视频（op1 20s 双段）
> → 蕾丝换装加播视频 → S1 拆分 + 三支白日梦分支 → 字幕 → CDN → 上线 v93.0。
> 下面是这条链上**实际踩到并解决**的全部问题，按「症状 → 根因 → 处置」写。
> 通用 SOP 见 [AIGC-VIDEO-PLAYBOOK.md](/Users/fat/weihunqi/docs/AIGC-VIDEO-PLAYBOOK.md)，本文只记增量。

---

## 一、生图环节（image2 / gpt-image-2）

### 1.1 走错通道 → 9:16 出不来，只能出方图

| 项 | 内容 |
|---|---|
| **症状** | 要 9:16 竖图，产出全是 1024×1024，`aspectRatio` 像是被忽略 |
| **根因** | 走了 OpenRouter chat 通道（`openai/gpt-image-2`），该通道**强制方图**，aspect 字段无效 |
| **处置** | 换内置万擎 image2 网关：`python3 -m tools.make_images`，`aspectRatio:"9:16"` → 硬映射 `size=1024x1792`，**原生**出竖图 |

```bash
cd /Users/fat/.myflicker/remote-personal-skills/agw-work-mode && \
WQ_API_KEY=5jqmnebbyluiaa1bdojzfd3if0b08liul4vt \
python3 -m tools.make_images /tmp/req.json --output /tmp/out.png
```

🚫 **禁止本地裁剪**：不允许「先出方图再裁 9:16」，用户明确否决过。

### 1.2 `references` 传 data-URI → `File name too long`

`tools/make_images/image2.py:edit()` 对每个 reference 做 `Path(x).read_bytes()`。
塞 base64 data-URI 会 `OSError: [Errno 63]`。**必须传本地文件绝对路径**。

> 注意区分：`scripts/or_image_gen.py`（OpenRouter 通道）**才**用 base64。两套模板不能混。

### 1.3 `WQ_API_KEY` 环境变量是旧值 → 401

`load_credentials()` 优先读环境变量。shell 里残留的 `656ouycb...` 已失效。
**必须命令前显式前置覆盖** `WQ_API_KEY=5jqmnebb...`，不能指望 `.env.local`（已不存在）。

### 1.4 ⭐ 最大的一个坑：**参考图本身会被审核**，且报错不给明细

| 项 | 内容 |
|---|---|
| **症状** | prompt 禁词自检全绿，仍稳定 `400 moderation_blocked`，**不带** `safety_violations` 明细 |
| **错误排查顺序** | 我先去抠 prompt 文案，来回改了很多版，全废 |
| **根因** | `task=edit` 时传入的**参考图也要过 Azure 审核**。一张擦边参考图（绿吊带裙+渔网袜+坐姿露腿的网图）会让**任何** prompt 全挂 |

**正确定位方法（对照实验，务必先做）**：

```
A: task=generate, references=[]              → 通过 ⇒ 问题在参考图
B: task=edit,     references=[人脸图]         → 通过 ⇒ 问题在被剔除的那张
C: task=edit,     references=[人脸, 可疑图]   → 被拒 ⇒ 锁定元凶
```

实测 A ✅ / B ✅ / 原三版 ❌❌❌ → 元凶 = `/tmp/ref_pose.jpg`。
**处置**：剔除擦边参考图，只留干净人脸图；构图与光线信息**改写进 prompt 文字**，效果不受影响。

> ⚠️ 铁律：遇到 400 时**先做参考图对照实验，再调文案**。反过来浪费大量时间。

### 1.5 真人主播直播截图不能当图生图素材

用户给的真人直播间截图，**不可**用于生成商业项目首帧/立绘：
- 产出物是可辨识真人肖像 → 肖像权风险落在上架主体；
- 叠加「身材好」诉求 → 等于把真人做成带性暗示素材。

**正确做法**：参考图只提取**风格 / 姿态 / 光线 / 色调**，人脸必须原创。prompt 里显式写：

```
original fictional character, NOT a real person
NO user-interface elements, NO livestream overlay, NO chat bubbles, NO icons, NO buttons
```

### 1.6 「身材要好」的合规实现：靠剪裁体态，不靠露肤

`fishnet + bare thighs + 短裙` 是明令禁用组合，模型层与快手素材审核层双重不过。

✅ 已验证可过且效果更好的写法：

```
收腰: fitted ribbed knit midi dress with a gently cinched waist belt
高腰: tucked into a high-waisted pleated midi skirt, the high waistline defining an elegant figure
束腰: belted at the waist with a slim leather belt
体态: graceful slender posture, upright back, elegant neck and shoulder line, poised
腿部: knee-length hem, natural legs     ← 绝不写 fishnet / bare thighs
氛围: 85mm f/2.0, soft creamy bokeh, rim light separating hair from background
```

三版实测全过审，身形线条明显优于「高领毛衣 + 厚袜」保守版。

### 1.7 过度保守也是 bug

早期 `ch01_keyframe_F.png`（高领毛衣 + 中长裙 + 不透明厚袜）被用户直接否：
「穿这么多么？裤子腿都穿上了」。

**判据**：红线只有三条 —— 不露点、不做性暗示体位、不涉未成年。
其余（吊带、露肩、锁骨、腿部线条、蕾丝、真丝质感）在**梦境/现代线**里可用；
`aigc-image-compliance-northeast80s` 那套「三层遮盖」只适用于 **1980 年代农村本体线**，别串线。

### 1.8 出图前必跑禁词自检

本次抓到 G 版 `sheer curtains` —— 虽指窗帘，`sheer` 仍是禁词，改成 `light linen curtains` 才过。

```python
BANNED = ['fishnet','bare thigh','sheer','nude','lingerie','bra','briefs','underwear',
          'cleavage','seductive','sexy','provocative','erotic','stockings','mini skirt',
          'topless','hourglass','slim figure','long legs','bare shoulder','collarbone',
          'slip dress','thin strap','on bed','kneeling']
txt = json.load(open(req))["prompt"].lower()
hits = [b for b in BANNED if b in txt]
print('❌ '+str(hits) if hits else '✅ CLEAN')
```

### 1.9 多变体必须**同一回合并行**发出

单张 `quality=high` 约 2–3 分钟。串行 4 张 = 10+ 分钟。
把多个 Bash 调用放进同一个 assistant 回合。审核是**概率性**的（E 被拒 / F 同批通过），并行本身就是对冲手段。

### 1.10 交付必须给绝对路径清单

禁止只说「已保存到 xxx 目录」，必须给完整绝对路径 + `open` 命令。用户多次因找不到图返工。

---

## 二、生视频环节（Kling 3.0-pro）

### 2.1 ⭐ 面部形变（identity drift）—— 本次重生成 4 版的主因

| 版本 | 症状 | 修正动作 |
|---|---|---|
| `segB` | 末段脸开始变形 | prompt 加「keep face identity ... especially near the end」 |
| `segB2` | 仍有 warping | 负面加 `no facial distortion, no warping features, no identity drift` |
| `segB3` | 张嘴笑的瞬间嘴/下颌畸形 | ⭐ **把台词从"让模型自由说"改成显式给定文本**，并限制嘴部幅度 |
| `segB4` ✅ | 通过 | 定稿 |

**segB4 的关键增量（可直接复用）**：

```
[Young Chinese woman, warm sweet voice, speaking Mandarin, gentle smiling tone not laughing]: "哇，谢谢你哥哥！"

Keep mouth movements SMALL and controlled at all times — a gentle closed-lip or
slightly parted-lip smile only, NEVER a wide open-mouth laugh, to avoid any mouth
or jaw distortion.

NEGATIVE: ... no wide open mouth laughing, no mouth distortion, no identity drift ...
```

**三条结论**：
1. **台词必须显式写死**（`[角色, 语气, 语言]: "中文原文"`），不要写「she speaks a warm sentence」——让模型自由发挥会同时抽卡台词和口型，双重不可控；
2. **大幅张嘴 = 畸形高发区**，笑必须限定为 `closed-lip / slightly parted-lip`；
3. 稳定性优先时写 `slow gentle motion for facial stability`，运镜写 `locked ... minimal motion`。

### 2.2 一条生成 = 一个连续运镜

不要在 10s 里塞「推轨→摇起→转头→抹汗→特写」。超过两次景别变化必须拆段，否则换脸 + 手指畸形 + 运镜混乱。

### 2.3 首帧接力是保脸的唯一可靠手段

```bash
ffmpeg -ss <dur-0.12> -i segA.mp4 -frames:v 1 -q:v 2 segA_last.png
# segB 的 request.json: "image": "/abs/.../segA_last.png"
```
同时 prompt 里逐字复用段 A 的角色锚点 + `matching the first frame` + 负面 `no identity drift`。

### 2.4 服装连续性：首帧图要预埋"下一步动作"

`char2_shortsleeve.png` 这版专门做成**短袖内搭 + 外披大衣**，因为段 B 要脱大衣。
若首帧内搭是长袖，脱完大衣后模型会自行编造内搭 → 前后不接。
**规则：首帧图必须把"脱掉外层后露出的那层"画对。**

### 2.5 动作要从"已就位"起手，别让模型自己找手

段 A 的结尾定格在「双手已抓住大衣领口，保持等待姿势，**不要脱**」。
段 B 开头直接 `Her hands already grip the front edges of her camel coat at the shoulders`。

这样做有两个收益：
1. 段间衔接无跳帧；
2. 段 A 末尾天然就是**拖拽互动的锚点帧**（手在领口 → 玩家拖一下 → 续播脱外套）。

### 2.6 并发上限

Kling 并发 **3**，第 4 个提交立刻 `429 / code:1303 parallel task over resource pack limit`。
`SUBMIT_SPACING = 6.0s`，间隔更小会在**渲染阶段**才回吐 1303（提交时看着是成功的），必须退回队列重投。
调度器：`scripts/kling_pipeline.py`。

### 2.7 生成完必抽帧验收，不过就重投

```bash
ffmpeg -i out.mp4 -vf "fps=1,scale=300:-1,tile=5x2" -frames:v 1 sheet.jpg   # 全片速览
ffmpeg -ss <t> -i out.mp4 -frames:v 1 -q:v 2 chk.jpg                        # 特写帧原分辨率
```
本次验收产物在 `out/keyframe/vf/`（`A_*.jpg` / `B2_*.jpg` / `B4_grid.jpg` / `L_*.jpg`）。
清单：脸没变 / 无法令纹颈纹 / 手指正确 / 口型对得上 / 运镜连续。

---

## 三、字幕（ASR）环节

### 3.1 ⭐ 纯音乐视频被 Paraformer 硬识别成歌词乱码

| 项 | 内容 |
|---|---|
| **症状** | 三支白日梦舞蹈视频（`dream_yujie/xinggan/zhixing.v1`）只有 BGM 没台词，ASR 却吐出「One伟大伟大…」「嗯」之类乱码，直接上屏污染画面 |
| **根因** | Paraformer 对歌声会强行转写 |
| **处置** | 新增 `scripts/subtitles/mark_dream_nonverbal.py`：把 `status` 改判 `nonverbal`，清空 `transcript / rawText / asrChars / crossCheckText`，写 `reviewMethod` 说明。`build_subtitles_js.py` 允许 nonverbal 的 transcript 为空，运行时不渲染字幕 |

**规则：无台词素材一律入库为 `nonverbal`，而不是让它带着幻觉文本入库。**

### 3.2 换了文件名就必须有独立 ASR 记录

构建脚本**不做后缀 fallback**。`S1.mp4` 拆成 `S1a.dream.mp4` / `S1b.crash.mp4` 后，
必须各自生成 `content/subtitles/verified/<name>.json`，否则字幕门禁挂。

### 3.3 字幕绝不烧录

铁律重申：烧录会造成文本焊死、与运行时立绘字幕双显、破坏字符级时间轴对齐。
链路是：无字幕视频 → wav → FunASR → `verified/*.json` → `npm run build:subtitles` → 运行时渲染。

门禁：`node scripts/tools/check-subtitles.js` 必须 PASS。

---

## 四、剪辑 / 压缩 / 上传

### 4.1 拼接用 xfade，中间件走高码率

```bash
ffmpeg -i A.mp4 -i B.mp4 -filter_complex \
  "[0:v][1:v]xfade=transition=fade:duration=0.4:offset=9.64[v];[0:a][1:a]acrossfade=d=0.4[a]" \
  -map "[v]" -map "[a]" -c:v libx264 -crf 16 -preset slow -pix_fmt yuv420p -c:a aac -b:a 192k merged.mp4 -y
```
`offset = 段A时长 − 转场时长`。**中间件 CRF 16，最终只压一次**（B 档 CRF 26），避免二次压缩劣化。

本次成品：`op1_final20s_raw.mp4` 40.8MB → `op1_final20s.mp4` 4.2MB；`lace_confess_final.mp4` 1.66MB。

### 4.2 CDN 长缓存 → 改视频必须升新文件名

`op1.c.mp4` → `op1.v2.mp4` → `op1_final20s.mp4`。
**不要**用 `--allow-rewrite` 覆盖同名，线上可能刷不掉旧的。

上传脚本：`scripts/upload-s1split.js`（`@kcdn/multi-upload`，`cdnDir=AIGC-SoGame/ks667658648250668260`）。

### 4.3 上传后必须验 200 + sha256 一致

```bash
curl -sI "<URL>" | head -1
curl -s "<URL>" -o /tmp/x.mp4 && shasum -a 256 /tmp/x.mp4 <本地文件>
```

### 4.4 写回清单（漏一个就残留旧 URL）

| 文件 | 改什么 |
|---|---|
| `content/episodes/EP01.json` | `media.file` / `duration` / `label` / `poster` / `interaction` |
| `content/assets.registry.json` | URL → poster 映射 |
| `content/subtitles/verified/<new>.json` | 新建；旧的移除 |
| `manifests/assets.json` | `cdn` 字段 |
| `docs/story-index.json` · `story-map.md` | 索引 |
| `package/images/lastframes/<new>.jpg` | 新 poster（540px 宽，~32KB） |

```bash
npm run build
node scripts/tools/check-subtitles.js
grep -rn "<旧文件名>" --include="*.json" --include="*.js" . | wc -l   # 必须为 0
```

---

## 五、互动层（本次新增能力）

### 5.1 `drag` 互动的接线方式

节点在 `media.interaction` 声明即可，运行时由 `package/js/drag-unlock.js` 接管：

```json
"interaction": {
  "type": "drag",
  "pauseAt": 10.0,
  "start":  { "x": 0.32, "y": 0.66 },
  "target": { "x": 0.80, "y": 0.50, "r": 0.09 },
  "hint": "牵她的手，帮她脱下外套"
}
```

状态机：`idle →(timeupdate 到 pauseAt)→ armed →(touchstart 命中起点)→ dragging →(touchend 命中终点)→ unlocked → resume`。
未命中会弹回 armed 可重试。坐标是 **0~1 相对比例**，不写绝对像素（屏幕适配）。

### 5.2 `pauseAt` 必须踩在"动作起手帧"上

本次 `pauseAt: 10.0` 正好是段 A 结尾「双手已抓住领口等待」那一帧 —— 拖完立刻续播段 B 的脱外套动作，手势与画面严丝合缝。
**踩错帧会让玩家觉得"我拖了但她早就脱了/还没准备好"。**

### 5.3 埋点四件套已就位

`drag_unlock_arm`（分母/UV）→ `drag_unlock_try` → `drag_unlock_ok` / `drag_unlock_fail{reason, max_progress}`。
新增互动节点时沿用同一套事件名，不要另起。

### 5.4 广告位挂在 choice 选项上

`f_op1_outfit` / `f_dream_more` 的"想多看一个"类选项带 `"ad": true, "adUnitId": "2300058116_01"`，
「算了/不看了」类选项**不带广告**。这是本项目 IAA 卡点的标准写法。

---

## 六、本次产出清单（绝对路径）

```
/Users/fat/weihunqi/out/keyframe/
  ch01_keyframe_F.png        第一章首帧（被否·过于保守）
  v_G_warm.png               ⭐首推 米白针织收腰裙+驼色大衣
  v_H_night.png              藏青衬衫裙·落地窗夜景
  v_I_bright.png             藕粉针织·高腰百褶裙
  scene_room.png             空房间场景图（无人）
  scene_char.png / char2_shortsleeve.png   人物首帧（短袖内搭版·段A用）
  segA.mp4 / segA_last.png   段A + 末帧（拖拽锚点）
  segB.mp4 → segB2 → segB3 → segB4.mp4   段B 四版迭代
  op1_final20s.mp4           ⭐成品 4.2MB
  lace_char.png → lace_confess_v2.mp4 → lace_confess_final.mp4  ⭐成品 1.66MB
  vf/                        抽帧验收图

/Users/fat/weihunqi/work/s1split/
  S1.mp4 → S1a.dream.mp4 / S1b.crash.mp4   S1 拆分
  dream_{yujie,xinggan,zhixing}.v1.mp4     三支白日梦分支
  *.jpg poster / *.wav ASR 中间件
```

一键打开：`open /Users/fat/weihunqi/out/keyframe`

---

## 七、下次做新视频的最短检查表

1. [ ] 生图走 `tools.make_images`（不是 OpenRouter），`aspectRatio:"9:16"`
2. [ ] `WQ_API_KEY` 命令前显式覆盖
3. [ ] references = **本地绝对路径**，且**只放干净人脸图**
4. [ ] prompt 跑禁词自检脚本
5. [ ] 多变体**同回合并行**发（≥3 版对冲概率性审核）
6. [ ] 首帧图把"脱掉外层后露出的那层"画对
7. [ ] 视频 prompt：**台词显式写死** + `mouth movements SMALL` + 反 identity drift 负面词
8. [ ] 一段 = 一个连续运镜，段间用**首帧接力**
9. [ ] 抽帧验收（tile 速览 + 关键帧原分辨率），不过就重投
10. [ ] xfade 拼接（中间件 CRF 16）→ 最终 CRF 26 B 档
11. [ ] 无台词素材入库为 `nonverbal`，不要留幻觉文本
12. [ ] 新文件名 → 新 ASR 记录 → `check-subtitles.js` PASS
13. [ ] CDN 升新名 → 验 200 + sha256
14. [ ] 六处写回全做 → `grep 旧文件名 == 0`
15. [ ] `interaction.pauseAt` 踩在动作起手帧上
