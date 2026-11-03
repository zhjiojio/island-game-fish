# 荒年记·未婚妻 · 「梦回现代」互动白日梦线 · 剧本 / 提示词 / 分镜设计

> **需求来源**：在现有「穿越后」主线基础上，做一条**可反复穿越回穿越前（现代线）**的互动白日梦支线。
> 核心互动手感：**"好热 → 脱外套（小手拖一下）→ 还能接着换衣服 / 帮她按按腰"** 这种一步接一步的贴身互动链。
> **定位**：IAA 变现主战场 + 留存钩子，不是主线剧情，主线进度零影响。

---

## 〇、先说清楚：这条线在故事里怎么成立

现有结构（EP01）：

```
op1（白日梦·加班夜的她）→ f_op1_outfit → s_op1_lace → s1（梦醒）
→ f_dream_more（没看够，再看一个？）→ 三支分支 → s1b（车祸）→ s2（窑洞醒来·正式穿越）
```

**现在的问题**：白日梦只在穿越前出现一次，穿越后就再也回不去了，可复用性为 0。

**本次设计的解法 —— 「回响」机制**：

> 傲天穿越后，每当**极度疲惫 / 受挫 / 立功**时，会短暂"梦回"穿越前那间温暖的公寓。
> 梦里那个女人，**和沈婉儿是同一张脸**（现有设定已埋：`dreammj` 用的就是婉儿同脸现代造型）。
> 玩家在梦里做的每一次互动，都会以"熟悉感"的形式反哺主线 —— 醒来后对婉儿多一分心疼。

这样做到三件事：
1. **叙事上成立**：梦是潜意识，重复出现天然合理，不需要硬编穿越机制；
2. **结构上可复用**：做成独立枢纽 `hub_dream`，任意章节挂入口即可，不动主线；
3. **伏笔回收**：最终章可揭示"梦里那个人一直是婉儿"，情绪闭环。

**入口挂载点建议**：

| 入口节点 | 触发文案 | 场景 |
|---|---|---|
| `f_dream_more`（现有） | 没看够，再看一个？ | 车祸前，原生入口 |
| `s6b` 之后（技能激活） | 你累得靠在土墙上，眼皮一沉…… | 立功后犒赏 |
| 每章章末 | 夜深了，闭上眼…… | 章节奖励位 |
| BE 前置 | 恍惚间，你好像又回到了那个下午…… | 失败缓冲，降低流失 |

---

## 一、互动动词库（这条线的"玩法"本体）

现在运行时只实现了 `type: "drag"`（`package/js/drag-unlock.js`）。
这条线需要扩到 **4 个动词**，才撑得起"一步接一步"的手感。

| 动词 | `type` | 手感 | 用在哪 | 运行时状态 |
|---|---|---|---|---|
| 拖 | `drag` | 手指从 A 划到 B | 脱外套、拉窗帘、递东西 | ✅ 已实现 |
| 点 | `tap` | 在热区点一下 | 小手点一下、按开关、接过杯子 | 🔧 需扩展（最简） |
| 长按 | `hold` | 按住 N 秒，环形进度 | **帮她按腰 / 按肩**、握住她的手 | 🔧 需扩展 |
| 连点 | `tapN` | 连点 N 下 | 揉肩、扇风、拍灰 | 🔧 需扩展（tap 计数版） |

### 扩展方案（最小改动，不重写组件）

`drag-unlock.js` 已有完整的「armed → 交互 → unlocked → resume」状态机 + 埋点四件套，
只需在 `arm()` 里按 `interaction.type` 分派手势判定，**其余全部复用**：

```jsonc
// tap：点一次热区
"interaction": {
  "type": "tap",
  "pauseAt": 6.2,
  "target": { "x": 0.52, "y": 0.44, "r": 0.12 },
  "hint": "轻轻点一下她的手"
}

// hold：按住 1.6 秒，画环形进度
"interaction": {
  "type": "hold",
  "pauseAt": 4.8,
  "target": { "x": 0.46, "y": 0.62, "r": 0.14 },
  "holdMs": 1600,
  "hint": "按住，帮她揉揉腰"
}

// tapN：连点 5 下
"interaction": {
  "type": "tapN",
  "pauseAt": 3.5,
  "target": { "x": 0.50, "y": 0.40, "r": 0.16 },
  "count": 5,
  "hint": "连点，给她扇扇风"
}
```

**埋点沿用现有事件名**，只加 `interaction_type` 维度，不要另起一套：
`drag_unlock_arm / try / ok / fail` + `{ interaction_type: "hold" }`。

### 🔴 三条互动设计铁律（本次专门定的）

1. **`pauseAt` 必须踩在"动作起手帧"**
   视频里她**已经做出等待姿势**（手已抓住领口 / 腰已侧过来 / 手已伸出来），
   玩家一操作立刻续播完成动作。踩错帧 = "我还没拖她就脱了"，手感全毁。

2. **玩家的手绝不入画**
   双人同框在 Kling 里是**手指畸形高发区**。所有"我帮她做某事"的互动，
   视频里**只拍她的反应**，玩家的手用 UI 层的 `hand.png` 手势图表现。
   → 既规避畸形，又天然合规（没有肢体接触画面）。

3. **一个视频只挂一个互动**
   10s 里塞两个互动 = 玩家还没反应过来就过了。要两步就拆两个节点。

---

## 二、剧本结构：`hub_dream` 梦回枢纽

```
                      ┌─────────────────────────────┐
  任意入口 ──────────▶│  hub_dream  「又梦见那间屋」  │ (choice 枢纽)
                      └──────────┬──────────────────┘
                                 │
      ┌──────────┬───────────────┼───────────────┬──────────────┐
      ▼          ▼               ▼               ▼              ▼
  ①好热·脱外套  ②换一身给你看   ③腰酸·帮她按   ④她要出门·送伞   ⑤不看了，回现实
  (drag)        (tap→换装)      (hold)          (drag)          → 回主线
      │             │               │               │
      ▼             ▼               ▼               ▼
  d1_hot ──▶ d1_hot_b     d2_outfit ──▶ 3选1换装   d3_waist ──▶ d3_waist_b   d4_umbrella
      │             │               │               │
      └─────────────┴───────────────┴───────────────┘
                                 │
                                 ▼
                      ┌─────────────────────────────┐
                      │ hub_dream（回枢纽，可循环）  │
                      └──────────┬──────────────────┘
                                 │  循环 N 次后
                                 ▼
                      ┌─────────────────────────────┐
                      │ d_wake「梦醒·她的脸变成婉儿」│ ← 伏笔回收帧
                      └──────────┬──────────────────┘
                                 ▼
                              回主线
```

**变现卡点**（沿用 `f_op1_outfit` 的写法）：
- 枢纽里 ①②③④ 四个"想看"选项 → `"ad": true, "adUnitId": "2300058116_01"`
- ⑤"不看了" → **不带广告**
- 换装 3 选 1 的二级选项 → 也带广告（这是已验证的高点击位）

---

## 三、逐段剧本（含台词 · 分镜 · 互动点）

> 角色代号：`dreammj`（梦中女主播 = 婉儿同脸现代造型）、`aotian`（傲天）
> 全部视频规格：9:16 / 10s / Kling 3.0-pro / `generateAudio: true` / 720p 生成 → 1080p 档压缩
> 角色锚点（**每条 prompt 逐字复用，禁止改写**）见第五节。

---

### ① 好热·脱外套（`d1_hot` → `d1_hot_b`）

**这是用户点名要的那条，也是整条线的手感基准。**

| 项 | 内容 |
|---|---|
| 段数 | 2 段（`d1_hot` 起手 + `d1_hot_b` 完成） |
| 互动 | `drag`，挂在 `d1_hot` 末尾 `pauseAt: 8.6` |
| 变现 | 入口选项带广告 |

#### 分镜 · `d1_hot`（0–10s，中近景锁定，眼平）

| 时间 | 画面 | 声音 |
|---|---|---|
| 0.0–1.6 | 她从景深处走两步到中近景停下，长发轻晃，目光找到镜头 | 环境音：室内暖风 |
| 1.6–4.6 | 抬手在脸颊边轻扇两下，微侧头，带点不好意思的笑 | 「屋里是不是有点热呀……」 |
| 4.6–7.4 | 另一只手轻扯驼色大衣前襟两下，眼神带点撒娇的请求 | 「哥哥，帮我一下好不好？」 |
| 7.4–10.0 | **双手抬到肩前、抓住大衣领口，保持不动，看着镜头等** | （无台词，轻轻呼气） |

> ⏸ **`pauseAt: 8.6`** —— 卡在"手已就位、等你动"这一帧。
> 提示语：**「牵她的手，帮她把外套脱下来」**
> `start {0.32, 0.66}`（她手的位置）→ `target {0.80, 0.50}`（肩后方向）

#### 分镜 · `d1_hot_b`（首帧接力 `d1_hot` 末帧）

| 时间 | 画面 | 声音 |
|---|---|---|
| 0.0–3.0 | 大衣顺着肩背滑落，沿手臂褪下，露出米白细罗纹短袖内搭 + 米白束腰中长裙 | 布料摩擦声 |
| 3.0–6.4 | 把大衣叠在小臂上，抬脸对镜头，**闭唇微笑**（不要大笑） | 「哇，谢谢你哥哥！」 |
| 6.4–10.0 | 微侧头，一只手把鬓边碎发别到耳后，慢慢眨一次眼，含情脉脉 | 「我还有件更好看的，要看么？」 |

> 末句直接把玩家推向 ② 换装 —— **每段结尾都要给下一个互动递梯子**，这是这条线能串起来的关键。

---

### ② 换一身给你看（`d2_outfit` 枢纽 + 3 支换装）

| 项 | 内容 |
|---|---|
| 结构 | `d2_outfit`（choice）→ `d2_a/b/c`（三支换装视频）→ 回 `hub_dream` |
| 互动 | 每支换装视频末尾挂 **`tap`**（小手点一下 → 她转个圈展示） |
| 变现 | 三个选项各带广告 |

#### `d2_outfit` 选项文案

| 选项 | icon | 去向 | 广告 |
|---|---|---|---|
| 想看那件米白蕾丝的 | `say` | `d2_a` | ✅ |
| 换件针织的吧 | `give` | `d2_b` | ✅ |
| 穿那条长裙 | `hide` | `d2_c` | ✅ |
| 不用了，就这样挺好 | `fight` | `hub_dream` | — |

#### 分镜 · `d2_a` 米白蕾丝（其余两支同构，只换服装描述与台词）

| 时间 | 画面 | 声音 |
|---|---|---|
| 0.0–2.0 | 她从稍远处走向镜头，米白缎面蕾丝边连衣裙轻摆，停在中近景 | 脚步与布料声 |
| 2.0–5.6 | 双手在腰前轻轻交叠，微侧头，看着镜头，羞涩又得意 | 「换好了哥哥，好看么？」 |
| 5.6–7.2 | **微微抬起一只手伸向镜头，停住等** ← ⏸ `pauseAt: 6.8` `tap` | （无） |
| 7.2–10.0 | （tap 后续播）她被"牵住"般轻轻转半圈，裙摆张开，回眸一笑 | 「嘿嘿……那我天天穿给你看。」 |

> 提示语：**「点一下她的手」** `target {0.52, 0.44, r 0.12}`

三支服装（全部走**剪裁体态**路线，不靠露肤 —— 见沉淀文档 §1.6）：

| 支 | 服装英文（直接入 prompt） | 中文台词 |
|---|---|---|
| `d2_a` | `modest ivory satin dress with delicate lace trim at the round neckline and cuffs, fully lined and opaque, fitted bodice with a thin waist sash, knee-length A-line skirt, long sleeves` | 换好了哥哥，好看么？ |
| `d2_b` | `fitted oatmeal ribbed knit midi dress with a gently cinched waist belt and three-quarter sleeves, knee-length hem` | 这件是不是更显气色呀？ |
| `d2_c` | `soft dusty-blue long-sleeve shirt dress tucked into a high-waisted pleated midi skirt, the high waistline defining an elegant figure` | 这条裙子……我一直没舍得穿。 |

---

### ③ 腰酸·帮她按按（`d3_waist` → `d3_waist_b`）

**这是用户点名的第二个互动，也是这条线里"亲密度"最高的一段 —— 合规处理最关键。**

#### 🔴 合规设计（务必照做）

- **玩家的手绝不入画**，全程只拍她；"按"这个动作由 UI 手势图 + 她的反应共同表达
- 姿势：**坐在沙发上、侧身、上半身直立**，手撑腰 —— 不是趴、不是跪、不是躺
- 服装：**长袖针织 + 及膝裙，全覆盖**
- 反应：**舒服地吁一口气 / 肩膀放松 / 闭眼浅笑** —— 不要任何喘息、呻吟、咬唇
- 台词走"累了一天"的生活感，不走暧昧
- 负面词必须写 `no sensual expression, no moaning, no lying down, no kneeling, no bare skin`

#### 分镜 · `d3_waist`

| 时间 | 画面 | 声音 |
|---|---|---|
| 0.0–2.4 | 她在沙发上侧坐，长舒一口气，一手扶在腰侧轻轻捶了两下 | 「今天站太久了……」 |
| 2.4–5.2 | 抬眼看镜头，眉毛轻轻一抬，带点拜托的语气 | 「哥哥，帮我揉揉腰好不好呀？」 |
| 5.2–10.0 | **上身稍稍侧转过来，把手从腰上移开、腾出位置，保持这个姿势等** | （轻轻呼吸） |

> ⏸ **`pauseAt: 6.6`** · **`hold`** · `holdMs: 1600`
> 提示语：**「按住，帮她揉揉腰」** `target {0.46, 0.62, r 0.14}`，环形进度条绕热区画

#### 分镜 · `d3_waist_b`（首帧接力）

| 时间 | 画面 | 声音 |
|---|---|---|
| 0.0–3.2 | 肩膀明显松下来，微微闭眼，头轻轻后仰一点，舒服地吁气 | 「嗯……对，就是那儿……」 |
| 3.2–6.5 | 睁眼侧头看镜头，闭唇浅笑，眼神柔软 | 「你手劲儿正好，比按摩椅强多了。」 |
| 6.5–10.0 | 坐直，理了理裙子，回头看镜头，笑得很放松 | 「等我哪天有钱了，请你吃大餐。」 |

---

### ④ 她要出门·送伞（`d4_umbrella`）

轻量单段，用来给这条线**换换节奏**（不能全是脱/按，会腻也会踩线）。

| 时间 | 画面 | 声音 | 互动 |
|---|---|---|---|
| 0.0–2.2 | 她在玄关穿好外套，回头看窗外，窗外在下雨 | 「诶，下雨了……」 | |
| 2.2–5.0 | 有点发愁地看镜头 | 「我伞放公司了，怎么办呀。」 | |
| 5.0–6.4 | **伸手向镜头，掌心朝上，等着接** | （无） | ⏸ `pauseAt: 6.0` · `drag` 把伞拖进她手里 |
| 6.4–10.0 | 接过伞，抱在怀里，眼睛弯起来 | 「你怎么什么都想得到呀……那我走啦。」 | |

> 提示语：**「把伞递给她」** `start {0.22, 0.78}` →`target {0.58, 0.46, r 0.10}`

---

### ⑤ 梦醒·伏笔回收（`d_wake`）

**循环 N 次（建议 3 次）后强制走这里**，给整条支线一个情绪落点，避免无脑循环。

| 时间 | 画面 | 声音 |
|---|---|---|
| 0.0–3.0 | 同一间公寓，暖光忽然转冷，她背对镜头站着 | 「你要走了吗？」 |
| 3.0–6.0 | 她慢慢回头 —— 妆容、发型、灯光**渐变为 1980 年代农村造型**（发髻木簪、米白棉布褂），**脸完全不变** | 「傲天……」 |
| 6.0–10.0 | 画面白光过曝一闪，切到窑洞昏黄油灯，婉儿正俯身看着你 | 婉儿：「你又说梦话了。」 |

> 这是整条线的**价值锚**：玩家会突然意识到"梦里那个人一直就是她"。
> 技术上：段内做**同脸换装换光**，这正是 image2 + Kling 最擅长的（脸不动、其余全变）。
> 首帧用 `d_wake_a_last.png` 接力，prompt 里写 `KEEP THE EXACT SAME FACE, change only hairstyle, clothing and lighting`。

---

## 四、image2 首帧图 Prompt（可直接落盘执行）

### 通用头尾（每条都要带）

```
头部：
Generate a photorealistic vertical medium close-up key-frame for a Chinese interactive-drama
mobile game. Tasteful, fully-dressed, elegant, suitable for all audiences.
CHARACTER (original fictional character, NOT a real person): <角色锚点·见第五节>

尾部（STRICT + QUALITY + NEGATIVE，一字不改）：
STRICT: NO user-interface elements, NO livestream overlay, NO chat bubbles, NO icons,
NO buttons, NO text, NO watermark, NO phone, NO logo, NO extra people, NO deformed hands,
NO cartoon or anime style, NO 3D render.
QUALITY: 85mm portrait lens, shallow depth of field f/2.0, soft creamy bokeh, delicate skin
texture, warm cinematic color grading, subtle film grain, high detail.
NEGATIVE: no lingerie, no see-through, no bare shoulders, no other people, no props,
no exaggerated expressions, no cluttered background, no visible pores, no dense patterns,
no small accessories, no text, no subtitles, no logo, no watermark, no film grain,
no digital noise, no over-sharpening, no HDR glow, no lens flare, no sweat,
no distorted hands, no morphing face, no facial distortion, no identity drift, no cartoon
```

### 请求 JSON 模板

```jsonc
{
  "task": "edit",
  "prompt": "<上面拼好的完整文本>",
  "references": ["/tmp/ref_face.jpg"],   // ⚠️ 只放干净人脸图，绝不放擦边参考图
  "aspectRatio": "9:16",
  "resolution": "1K",
  "quality": "high",
  "outputFormat": "png"
}
```

```bash
cd /Users/fat/.myflicker/remote-personal-skills/agw-work-mode && \
WQ_API_KEY=5jqmnebbyluiaa1bdojzfd3if0b08liul4vt \
python3 -m tools.make_images /tmp/req_dX.json --output /Users/fat/weihunqi/out/keyframe/dX.png
```

### 各段首帧差异化描述

| 首帧 | 用于 | WARDROBE + COMPOSITION 关键句 |
|---|---|---|
| `d1_hot_kf.png` | `d1_hot` 段A | `ivory ribbed knit short-sleeve top and a cream belted midi skirt, with a soft camel wool coat worn over it, hanging open at the front, sleeves on.` ＋ `standing in the room, one hand lightly raised near her cheek as if fanning herself, warm slightly shy smile` ⚠️**内搭必须是短袖**（脱掉大衣后要露出它） |
| `d2_a_kf.png` | `d2_a` | 见 §3② 表格服装列 ＋ `standing gracefully, one hand lightly smoothing the front of the skirt, shy proud smile as if showing off a new outfit` |
| `d2_b_kf.png` / `d2_c_kf.png` | 同上 | 同构，换服装句 |
| `d3_waist_kf.png` | `d3_waist` | `oatmeal long-sleeve ribbed knit top and a knee-length wool skirt, fully covered` ＋ `sitting sideways on a beige fabric sofa, upright posture, one hand resting on her lower back, tired gentle expression` ⚠️**禁止** lying / kneeling / leaning back |
| `d4_kf.png` | `d4_umbrella` | `camel wool coat buttoned up, a crossbody bag` ＋ `standing at the apartment entryway, looking back toward the camera, rainy window behind her` |
| `d_wake_kf.png` | `d_wake` | `standing with her back to the camera in the same apartment, cool dimmed light` |

### 场景底图（无人，可复用）

已有 `out/keyframe/scene_room.png`（黄昏暖光公寓客厅，无人）。
④ 玄关 / ③ 沙发特写 若需新底图，复用其 SETTING 段，只改家具描述。

---

## 五、角色锚点（🔒 冻结，逐字复用，禁止改写）

```
a beautiful young Chinese woman in her early twenties, East Asian features, oval face with
a defined jawline, large clear double-eyelid eyes with long lashes, straight delicate nose,
soft full lips with gentle pink lipstick, fair luminous skin with a natural glow, refined
light makeup. Long black hair softly curled at the ends, falling over one shoulder with a
few loose strands catching the light. Graceful upright posture, elegant neck and shoulder line.
```

**灯光锚点**（每条都要带，保证跨段色调一致）：

```
LIGHTING: warm amber floor lamp as key light from the left, cool blue evening window light
as rim light, soft warm-cool contrast, gentle bokeh background.
```

> 设计意图重申：这是**沈婉儿的脸配现代造型**。新增梦境视频**一律沿用这套锚点**，不要另起人设，
> 否则 `d_wake` 的伏笔回收会失效。

---

## 六、Kling 视频 Prompt（五段式模板 · 直接抄）

### 模板骨架

```
Cinematic vertical video of a young Chinese woman in a warm apartment at dusk, matching the
first frame. Continuous gentle motion, no cuts, keep her face stable and identical throughout.

<T1>s — <动作描述，一句一个动作，按时间顺序>
<T2>s — <动作> [Young Chinese woman, <语气>, speaking Mandarin, gentle tone]: "<中文台词原文>"
<T3>s — <动作> [Young Chinese woman, <语气>, speaking Mandarin, gentle tone]: "<中文台词原文>"

CONSISTENCY: keep face identity, hairstyle, outfit and lighting identical to first frame
throughout. Facial proportions must stay stable — no warping or identity change.
Keep mouth movements SMALL and controlled at all times — a gentle closed-lip or
slightly parted-lip smile only, NEVER a wide open-mouth laugh, to avoid any mouth or jaw distortion.
CAMERA: locked medium close-up, eye level, minimal motion. Vertical 9:16.
LIGHTING: warm amber key light left, cool blue rim light, blurred background.
STYLE: photorealistic cinematic, shallow depth of field, smooth clean skin, slow gentle motion
for facial stability.
NEGATIVE: <见下方通用负面词>
```

### 通用负面词（🔒 一字不改，整段复制）

```
no other people, no props, no wide open mouth laughing, no exaggerated expressions,
no cluttered background, no visible pores, no dense patterns, no small accessories,
no text overlay, no subtitles, no logo, no watermark, no ink wash, no paint splatter,
no watercolor bleed, no paper texture, no canvas texture, no brush strokes, no pencil hatching,
no film grain, no digital noise, no speckles, no over-sharpening, no HDR glow,
no chromatic aberration, no lens flare, no floating particles, no fog or dust, no sweat,
no blood, no distorted hands, no morphing face, no facial distortion, no mouth distortion,
no identity drift, no cuts, no camera shake, no cartoon
```

`d3_waist` 两段**额外追加**：

```
, no sensual expression, no moaning, no lying down, no kneeling, no bare skin,
no hands of another person, no second person in frame
```

### 请求 JSON

```jsonc
{
  "prompt": "<上面拼好>",
  "aspectRatio": "9:16",
  "resolution": "720p",
  "durationSec": 10,
  "generateAudio": true,
  "image": "/Users/fat/weihunqi/out/keyframe/<首帧或上一段末帧>.png"
}
```

```bash
S=/Users/fat/.myflicker/remote-personal-skills/agw-work-mode
cd $S && KWALI_CREDENTIALS_FILE=$HOME/.config/kwali/credentials.json \
  python3 -m tools.make_videos /tmp/req_dX.json --job-file /tmp/job_dX.json \
  --output /Users/fat/weihunqi/out/keyframe/dX.mp4
```

> ⚠️ Kling 并发上限 3，`SUBMIT_SPACING=6.0s`。一次最多投 3 条，后台跑。

### 示例：`d1_hot` 完整 prompt（照抄即可）

```
Cinematic vertical video of a young Chinese woman in a warm apartment at dusk, matching the
first frame. Continuous gentle motion, no cuts, keep her face stable and identical throughout.

0.0-1.6s — She walks two relaxed steps toward the camera and settles into medium close-up,
her long black hair swaying gently, eyes finding the lens with a soft smile.
1.6-4.6s — She lifts one hand and fans lightly near her cheek twice, tilting her head, a faint
shy smile, lips only slightly parted. [Young Chinese woman, warm soft voice, speaking Mandarin,
gentle shy tone]: "屋里是不是有点热呀……"
4.6-7.4s — Her other hand tugs twice at the front lapel of her camel wool coat, and she looks
into the lens with a gentle pleading look, eyebrows slightly raised. [Young Chinese woman, soft
coaxing voice, speaking Mandarin, gentle tone]: "哥哥，帮我一下好不好？"
7.4-10.0s — She brings both hands up to the front edges of the coat at her shoulders and grips
them, then holds completely still in that waiting pose, looking at the camera with an expectant
soft closed-lip smile. She does NOT remove the coat.

CONSISTENCY: keep face identity, hairstyle, the ivory ribbed knit short-sleeve top, the cream
belted midi skirt, the camel wool coat and the warm amber lighting identical to the first frame
throughout. Facial proportions must stay stable — no warping or identity change.
Keep mouth movements SMALL and controlled at all times — a gentle closed-lip or slightly
parted-lip smile only, NEVER a wide open-mouth laugh.
CAMERA: locked medium close-up, eye level, minimal motion. Vertical 9:16.
LIGHTING: warm amber key light left, cool blue rim light, blurred background.
STYLE: photorealistic cinematic, shallow depth of field, smooth clean skin, slow gentle motion
for facial stability.
NEGATIVE: <通用负面词整段>
```

---

## 七、节点 JSON 骨架（可直接并入 `content/episodes/EP01.json`）

```jsonc
"hub_dream": {
  "ep": "EP01", "epTitle": "半碗糊糊·技能觉醒", "scene": "city", "type": "choice",
  "title": "你又梦见了那间屋子……",
  "media": { "kind": "image", "file": "images/lastframes/d1_hot.jpg", "label": "梦回·暖灯公寓" },
  "options": [
    { "text": "她说屋里好热",   "icon": "say",   "next": "d1_hot",      "ad": true, "adUnitId": "2300058116_01", "id": "hub_dream_opt_0" },
    { "text": "让她换身衣服",   "icon": "give",  "next": "d2_outfit",   "ad": true, "adUnitId": "2300058116_01", "id": "hub_dream_opt_1" },
    { "text": "她说腰有点酸",   "icon": "hide",  "next": "d3_waist",    "ad": true, "adUnitId": "2300058116_01", "id": "hub_dream_opt_2" },
    { "text": "外面下雨了",     "icon": "say",   "next": "d4_umbrella", "ad": true, "adUnitId": "2300058116_01", "id": "hub_dream_opt_3" },
    { "text": "该醒了，还得干活", "icon": "fight", "next": "s1b",         "id": "hub_dream_opt_4" }
  ]
},

"d1_hot": {
  "ep": "EP01", "epTitle": "半碗糊糊·技能觉醒", "scene": "city",
  "media": {
    "kind": "video",
    "file": "https://p5-ad.adkwai.com/udata/pkg/KS-GAME/AIGC-SoGame/ks667658648250668260/d1_hot.v1.mp4",
    "duration": 10, "label": "梦回·好热（拖拽脱外套·起手）",
    "poster": "images/lastframes/d1_hot.jpg",
    "interaction": {
      "type": "drag", "pauseAt": 8.6,
      "start":  { "x": 0.32, "y": 0.66 },
      "target": { "x": 0.80, "y": 0.50, "r": 0.09 },
      "hint": "牵她的手，帮她把外套脱下来"
    }
  },
  "char": "dreammj", "speaker": "梦中女主播",
  "text": "屋里是不是有点热呀……哥哥，帮我一下好不好？",
  "next": "d1_hot_b"
},

"d1_hot_b": {
  "ep": "EP01", "epTitle": "半碗糊糊·技能觉醒", "scene": "city",
  "media": {
    "kind": "video",
    "file": "https://p5-ad.adkwai.com/udata/pkg/KS-GAME/AIGC-SoGame/ks667658648250668260/d1_hot_b.v1.mp4",
    "duration": 10, "label": "梦回·外套已脱",
    "poster": "images/lastframes/d1_hot_b.jpg"
  },
  "char": "dreammj", "speaker": "梦中女主播",
  "text": "哇，谢谢你哥哥！我还有件更好看的，要看么？",
  "next": "d2_outfit"
},

"d3_waist": {
  "ep": "EP01", "epTitle": "半碗糊糊·技能觉醒", "scene": "city",
  "media": {
    "kind": "video",
    "file": "https://p5-ad.adkwai.com/udata/pkg/KS-GAME/AIGC-SoGame/ks667658648250668260/d3_waist.v1.mp4",
    "duration": 10, "label": "梦回·腰酸（长按揉腰·起手）",
    "poster": "images/lastframes/d3_waist.jpg",
    "interaction": {
      "type": "hold", "pauseAt": 6.6, "holdMs": 1600,
      "target": { "x": 0.46, "y": 0.62, "r": 0.14 },
      "hint": "按住，帮她揉揉腰"
    }
  },
  "char": "dreammj", "speaker": "梦中女主播",
  "text": "今天站太久了……哥哥，帮我揉揉腰好不好呀？",
  "next": "d3_waist_b"
}
```

> 其余节点（`d2_outfit` / `d2_a~c` / `d4_umbrella` / `d_wake`）同构，按上面剧本填即可。

---

## 八、素材生产清单（10 支视频 + 7 张首帧）

| # | 产物 | 类型 | 首帧来源 | 互动 | 优先级 |
|---|---|---|---|---|---|
| 1 | `d1_hot.v1.mp4` | 视频 10s | `d1_hot_kf.png` | drag | 🔴 P0 |
| 2 | `d1_hot_b.v1.mp4` | 视频 10s | ①末帧接力 | — | 🔴 P0 |
| 3 | `d3_waist.v1.mp4` | 视频 10s | `d3_waist_kf.png` | hold | 🔴 P0 |
| 4 | `d3_waist_b.v1.mp4` | 视频 10s | ③末帧接力 | — | 🔴 P0 |
| 5 | `d2_a.v1.mp4` | 视频 10s | `d2_a_kf.png` | tap | 🟡 P1 |
| 6 | `d2_b.v1.mp4` | 视频 10s | `d2_b_kf.png` | tap | 🟡 P1 |
| 7 | `d2_c.v1.mp4` | 视频 10s | `d2_c_kf.png` | tap | 🟡 P1 |
| 8 | `d4_umbrella.v1.mp4` | 视频 10s | `d4_kf.png` | drag | 🟢 P2 |
| 9 | `d_wake_a.v1.mp4` | 视频 10s | `d_wake_kf.png` | — | 🟢 P2 |
| 10 | `d_wake_b.v1.mp4` | 视频 10s | ⑨末帧接力 | — | 🟢 P2 |

**建议排期**：P0 四支先做（`好热→脱外套` + `腰酸→按腰` 两条完整互动链），
真机验一轮手感和留存，再铺 P1/P2。

**Kling 并发 3**，P0 四支分两批：`[1,3]` 并行 → 抽末帧 → `[2,4]` 并行。

---

## 九、落地执行清单

```
生图阶段
□ 7 张首帧 prompt 写好，跑禁词自检脚本
□ references 只放 /tmp/ref_face.jpg（干净人脸），绝不放擦边图
□ 同回合并行发 ≥3 版对冲概率性审核
□ 逐张肉眼验：脸是否是同一张、内搭是否短袖（d1）、坐姿是否直立（d3）

生视频阶段
□ 台词显式写死 [角色,语气,语言]:"中文"
□ 带 mouth movements SMALL 段落
□ 负面词整段复制，d3 额外追加合规负面词
□ 并发 ≤3，SUBMIT_SPACING 6s
□ 每支抽帧验收：tile 速览 + 互动起手帧原分辨率单看
□ ⚠️ 重点验「起手帧」姿势是否真的停住等待（决定 pauseAt 准不准）

后处理
□ ffmpeg 抽末帧作为下一段首帧（-ss dur-0.12）
□ 压缩 B 档：CRF 26 / preset slow / +faststart / aac 96k 单声道
□ FunASR 出字幕 → content/subtitles/verified/<name>.json
□ node scripts/tools/check-subtitles.js  PASS

上线
□ CDN 新文件名（.v1），上传后验 200 + sha256
□ 六处写回：EP01.json / assets.registry.json / subtitles / manifests / story-index+map / lastframes
□ npm run build && grep 旧文件名 == 0
□ 运行时扩 tap/hold/tapN（drag-unlock.js 分派），埋点加 interaction_type 维度
□ ksmg preview package -q -o preview-qr → 真机验互动手感
```

---

## 十、风险提示

| 风险 | 说明 | 对策 |
|---|---|---|
| 内容尺度 | `d3_waist` 是这条线的边界，写歪了就是擦边 | 严格照 §3③ 合规设计；玩家手不入画；产出后**人工逐帧过一遍**再上 |
| 玩法重复 | 全是"脱/换/按"会腻，也会被审核盯上 | ④ 送伞这类生活互动必须保留，建议后续再加"递水杯/擦汗/盖毯子"同类节奏调节段 |
| 循环无出口 | 枢纽无脑循环伤体验 | 循环 3 次强制走 `d_wake`，给情绪落点 |
| 广告过密 | 枢纽 4 个选项全带广告 | 首次进入建议第一支免广告（尝鲜），从第二支起计费 |
| 人设漂移 | 新增视频另起人脸会毁掉 `d_wake` 伏笔 | 角色锚点 §5 冻结，所有新视频逐字复用 |
