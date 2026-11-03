# 老铁眼真尖 · CDN 资源清单（非关卡内图片）

> 来源：对 `package/js/level-loader.js`、`package/js/feedback.js`、`package/js/voice-packs.js` 代码中 CDN 引用的全量枚举。
> 范围：**仅非关卡内图片**的 CDN 资源（关卡场景图 `scene / sceneA / sceneB` 由远程 JSON 下发，不在本清单）。
> 可用性：全部 URL 于 2026-09-03 实际 HEAD 请求验证（结果见同目录 `verify-result.txt`）。
> 机器可读清单：`voice-urls.txt`（156 条语音 URL）、`all-urls.txt`（全部 164 条）、`gen-all-urls.sh`（生成脚本）。

## 总览

| 类别 | 数量 | 可用 | 说明 |
|---|---|---|---|
| 远程关卡配置 JSON | 1 | ✅ 200 | 唯一配置来源 |
| BGM | 3 | ✅ 200 | 大厅/欢迎页轮播 |
| 语音包音频 | 156 | 148 可用 / 8 个 404 | 6 包 × 26 文件；longaotian 缺 8 个 |
| 主题封面图（配置下发） | 4 | ✅ 200 | 首页主题卡片用，非关卡内图片 |
| **合计** | **164** | **156** | |

CDN 根前缀：
- 配置：`https://p1-ad.adkwai.com/udata/pkg/KS-GAME/AIGC-SoGame/ks658651445853447417/`
- BGM / 语音 / 封面（udata 类）：`https://p5-ad.adkwai.com/udata/pkg/KS-GAME/AIGC-SoGame/ks658651445853447417/`

---

## 1. 远程关卡配置 JSON（1 个）

```
https://p1-ad.adkwai.com/udata/pkg/KS-GAME/AIGC-SoGame/ks658651445853447417/levels-config-v3.json
```

- `package/js/level-loader.js` 启动即拉取（cache-buster `?_t=<ts>` + no-cache 头，不落盘，3s 超时）。
- 内容：`themes[]` / `levels[]` / `props` / `laotieLines` / `hiddenIdxRanges` / `version`。

## 2. BGM（3 个，`feedback.js` bgm_list）

```
https://p5-ad.adkwai.com/udata/pkg/KS-GAME/AIGC-SoGame/ks658651445853447417/bgm_1_chiptune.mp3
https://p5-ad.adkwai.com/udata/pkg/KS-GAME/AIGC-SoGame/ks658651445853447417/bgm_2_northeast.mp3
https://p5-ad.adkwai.com/udata/pkg/KS-GAME/AIGC-SoGame/ks658651445853447417/bgm_3_disco.mp3
```

- 单曲 `loop=true` 轮播；只在 welcome / 首页播，进关必停；人声播放时音量 duck 至 0。

## 3. 语音包音频（6 包 × 26 文件 = 156 个）

**命名规则**（`feedback.js _rewriteAudioCDN`）：

```
通用：     {P5前缀}voice_<packId>_<file>.mp3
liuhaoguaizai：{P5前缀}voice_liuhaoguaizai_v3_<file>.mp3?v=v4   （v3 音色 + cache-buster）
```

**每包 26 个文件**（`voice-packs.js buildClips`）：

| 组 | 文件 |
|---|---|
| 单条（11） | `timeup`、`greet`、`scene1_intro`、`scene2_intro`、`scene_hunt_intro`、`pass`、`pass2`、`pass3`、`pass4`、`pass5`、`pass6` |
| 随机候选 ×3（15） | `timeup_{a,b,c}`、`greet_{a,b,c}`、`wrong_{a,b,c}`、`final_hit_{a,b,c}`、`almost_out_{a,b,c}` |

> 注：`remaining_1/2/3_{a,b,c}.mp3` **不在 CDN**，位于 `subpackages/voice-extra/` 分包（6 包 × 9 = 54 个本地文件）。

**逐包验证结果**：

| packId | OK | 404 | 备注 |
|---|---|---|---|
| xiaomei | 26 | 0 | 默认免费包 |
| xiaoshuai | 26 | 0 | 免费包 |
| kuergou | 26 | 0 | hidden（UI 不展示） |
| lala | 26 | 0 | hidden（UI 不展示） |
| longaotian | 18 | 8 | CDN 缺 `timeup / greet / pass / pass2~pass6`；代码将 `pass*` 运行时映射到 `final_hit_{a,b,c}` 播放 |
| liuhaoguaizai | 26 | 0 | v3 前缀，URL 带 `?v=v4` |

### 3.1 xiaomei（26 个，全部 200）

```
https://p5-ad.adkwai.com/udata/pkg/KS-GAME/AIGC-SoGame/ks658651445853447417/voice_xiaomei_timeup.mp3
https://p5-ad.adkwai.com/udata/pkg/KS-GAME/AIGC-SoGame/ks658651445853447417/voice_xiaomei_greet.mp3
https://p5-ad.adkwai.com/udata/pkg/KS-GAME/AIGC-SoGame/ks658651445853447417/voice_xiaomei_scene1_intro.mp3
https://p5-ad.adkwai.com/udata/pkg/KS-GAME/AIGC-SoGame/ks658651445853447417/voice_xiaomei_scene2_intro.mp3
https://p5-ad.adkwai.com/udata/pkg/KS-GAME/AIGC-SoGame/ks658651445853447417/voice_xiaomei_scene_hunt_intro.mp3
https://p5-ad.adkwai.com/udata/pkg/KS-GAME/AIGC-SoGame/ks658651445853447417/voice_xiaomei_pass.mp3
https://p5-ad.adkwai.com/udata/pkg/KS-GAME/AIGC-SoGame/ks658651445853447417/voice_xiaomei_pass2.mp3
https://p5-ad.adkwai.com/udata/pkg/KS-GAME/AIGC-SoGame/ks658651445853447417/voice_xiaomei_pass3.mp3
https://p5-ad.adkwai.com/udata/pkg/KS-GAME/AIGC-SoGame/ks658651445853447417/voice_xiaomei_pass4.mp3
https://p5-ad.adkwai.com/udata/pkg/KS-GAME/AIGC-SoGame/ks658651445853447417/voice_xiaomei_pass5.mp3
https://p5-ad.adkwai.com/udata/pkg/KS-GAME/AIGC-SoGame/ks658651445853447417/voice_xiaomei_pass6.mp3
https://p5-ad.adkwai.com/udata/pkg/KS-GAME/AIGC-SoGame/ks658651445853447417/voice_xiaomei_timeup_a.mp3
https://p5-ad.adkwai.com/udata/pkg/KS-GAME/AIGC-SoGame/ks658651445853447417/voice_xiaomei_timeup_b.mp3
https://p5-ad.adkwai.com/udata/pkg/KS-GAME/AIGC-SoGame/ks658651445853447417/voice_xiaomei_timeup_c.mp3
https://p5-ad.adkwai.com/udata/pkg/KS-GAME/AIGC-SoGame/ks658651445853447417/voice_xiaomei_greet_a.mp3
https://p5-ad.adkwai.com/udata/pkg/KS-GAME/AIGC-SoGame/ks658651445853447417/voice_xiaomei_greet_b.mp3
https://p5-ad.adkwai.com/udata/pkg/KS-GAME/AIGC-SoGame/ks658651445853447417/voice_xiaomei_greet_c.mp3
https://p5-ad.adkwai.com/udata/pkg/KS-GAME/AIGC-SoGame/ks658651445853447417/voice_xiaomei_wrong_a.mp3
https://p5-ad.adkwai.com/udata/pkg/KS-GAME/AIGC-SoGame/ks658651445853447417/voice_xiaomei_wrong_b.mp3
https://p5-ad.adkwai.com/udata/pkg/KS-GAME/AIGC-SoGame/ks658651445853447417/voice_xiaomei_wrong_c.mp3
https://p5-ad.adkwai.com/udata/pkg/KS-GAME/AIGC-SoGame/ks658651445853447417/voice_xiaomei_final_hit_a.mp3
https://p5-ad.adkwai.com/udata/pkg/KS-GAME/AIGC-SoGame/ks658651445853447417/voice_xiaomei_final_hit_b.mp3
https://p5-ad.adkwai.com/udata/pkg/KS-GAME/AIGC-SoGame/ks658651445853447417/voice_xiaomei_final_hit_c.mp3
https://p5-ad.adkwai.com/udata/pkg/KS-GAME/AIGC-SoGame/ks658651445853447417/voice_xiaomei_almost_out_a.mp3
https://p5-ad.adkwai.com/udata/pkg/KS-GAME/AIGC-SoGame/ks658651445853447417/voice_xiaomei_almost_out_b.mp3
https://p5-ad.adkwai.com/udata/pkg/KS-GAME/AIGC-SoGame/ks658651445853447417/voice_xiaomei_almost_out_c.mp3
```

### 3.2 xiaoshuai（26 个，全部 200）

同 3.1 命名，前缀 `voice_xiaoshuai_`，文件集合一致：

```
https://p5-ad.adkwai.com/udata/pkg/KS-GAME/AIGC-SoGame/ks658651445853447417/voice_xiaoshuai_{timeup|greet|scene1_intro|scene2_intro|scene_hunt_intro|pass|pass2|pass3|pass4|pass5|pass6}.mp3
https://p5-ad.adkwai.com/udata/pkg/KS-GAME/AIGC-SoGame/ks658651445853447417/voice_xiaoshuai_{timeup|greet|wrong|final_hit|almost_out}_{a|b|c}.mp3
```

（完整逐条 URL 见 `voice-urls.txt`，以下各包同。）

### 3.3 kuergou（26 个，全部 200）

```
https://p5-ad.adkwai.com/udata/pkg/KS-GAME/AIGC-SoGame/ks658651445853447417/voice_kuergou_{…同上文件集合}.mp3
```

### 3.4 lala（26 个，全部 200）

```
https://p5-ad.adkwai.com/udata/pkg/KS-GAME/AIGC-SoGame/ks658651445853447417/voice_lala_{…同上文件集合}.mp3
```

### 3.5 longaotian（26 个 URL，18 个 200 / 8 个 404）

```
# ✅ 可用（18 个）
https://p5-ad.adkwai.com/udata/pkg/KS-GAME/AIGC-SoGame/ks658651445853447417/voice_longaotian_scene1_intro.mp3
https://p5-ad.adkwai.com/udata/pkg/KS-GAME/AIGC-SoGame/ks658651445853447417/voice_longaotian_scene2_intro.mp3
https://p5-ad.adkwai.com/udata/pkg/KS-GAME/AIGC-SoGame/ks658651445853447417/voice_longaotian_scene_hunt_intro.mp3
https://p5-ad.adkwai.com/udata/pkg/KS-GAME/AIGC-SoGame/ks658651445853447417/voice_longaotian_timeup_{a|b|c}.mp3
https://p5-ad.adkwai.com/udata/pkg/KS-GAME/AIGC-SoGame/ks658651445853447417/voice_longaotian_greet_{a|b|c}.mp3
https://p5-ad.adkwai.com/udata/pkg/KS-GAME/AIGC-SoGame/ks658651445853447417/voice_longaotian_wrong_{a|b|c}.mp3
https://p5-ad.adkwai.com/udata/pkg/KS-GAME/AIGC-SoGame/ks658651445853447417/voice_longaotian_final_hit_{a|b|c}.mp3
https://p5-ad.adkwai.com/udata/pkg/KS-GAME/AIGC-SoGame/ks658651445853447417/voice_longaotian_almost_out_{a|b|c}.mp3

# ❌ 404（8 个，CDN 缺文件；现状代码把 pass* 映射到 final_hit_{a,b,c} 播放）
https://p5-ad.adkwai.com/udata/pkg/KS-GAME/AIGC-SoGame/ks658651445853447417/voice_longaotian_timeup.mp3
https://p5-ad.adkwai.com/udata/pkg/KS-GAME/AIGC-SoGame/ks658651445853447417/voice_longaotian_greet.mp3
https://p5-ad.adkwai.com/udata/pkg/KS-GAME/AIGC-SoGame/ks658651445853447417/voice_longaotian_pass.mp3
https://p5-ad.adkwai.com/udata/pkg/KS-GAME/AIGC-SoGame/ks658651445853447417/voice_longaotian_pass2.mp3
https://p5-ad.adkwai.com/udata/pkg/KS-GAME/AIGC-SoGame/ks658651445853447417/voice_longaotian_pass3.mp3
https://p5-ad.adkwai.com/udata/pkg/KS-GAME/AIGC-SoGame/ks658651445853447417/voice_longaotian_pass4.mp3
https://p5-ad.adkwai.com/udata/pkg/KS-GAME/AIGC-SoGame/ks658651445853447417/voice_longaotian_pass5.mp3
https://p5-ad.adkwai.com/udata/pkg/KS-GAME/AIGC-SoGame/ks658651445853447417/voice_longaotian_pass6.mp3
```

### 3.6 liuhaoguaizai（26 个，全部 200，v3 前缀 + ?v=v4）

```
https://p5-ad.adkwai.com/udata/pkg/KS-GAME/AIGC-SoGame/ks658651445853447417/voice_liuhaoguaizai_v3_{timeup|greet|scene1_intro|scene2_intro|scene_hunt_intro|pass|pass2|pass3|pass4|pass5|pass6}.mp3?v=v4
https://p5-ad.adkwai.com/udata/pkg/KS-GAME/AIGC-SoGame/ks658651445853447417/voice_liuhaoguaizai_v3_{timeup|greet|wrong|final_hit|almost_out}_{a|b|c}.mp3?v=v4
```

## 4. 主题封面图（4 个，远程 JSON `themes[].cover` 下发，非关卡内图片）

```
# 主题 2797「后宫眼真尖」（cover 与 cover_full 同 URL）
https://p2-ad.adkwai.com/bs2/ad-automate-cdn/project/550/anonymous/1787843304753/封面.png

# 主题 2917「重回 80 年代」
https://p5-ad.adkwai.com/udata/pkg/KS-GAME/AIGC-SoGame/ks658651445853447417/cover_scene1.jpg

# 主题 2744「谁是第三者」
https://p2-ad.adkwai.com/bs2/ad-automate-cdn/project/550/anonymous/1787760722303/封面图.png

# 主题 3103「一眼找不到」
https://p2-ad.adkwai.com/bs2/ad-automate-cdn/project/550/anonymous/1788370616160/niulai_grassland_16x9.png
```

> 封面随远程 JSON 动态下发，新增/更换主题时以 `levels-config-v3.json` 的 `themes[].cover / cover_full` 字段为准。

## 5. 明确不在 CDN 的资源（重写时勿误判）

| 资源 | 位置 |
|---|---|
| 关卡场景图 `scene / sceneA / sceneB` | 远程 JSON 逐关下发（本次按要求排除），散布在 `p1-ad` / `p2-ad` 多个路径 |
| 短音效 correct / wrong / tick / timeup / global_{hint,revive,skip} | 主包 `assets/audio/`（本地） |
| 语音 `remaining_1/2/3_{a,b,c}.mp3` | `subpackages/voice-extra/` 分包（54 个本地文件） |
| 通关弹窗 UI（banner-blue / theme5-brief-lv1） | `subpackages/ui-gameplay/` 分包 |
| 全局 UI 切图 / 语音包头像 / 全局背景 | 主包 `assets/ui/`、`assets/voices/`、`assets/global_bg.png` |
| 隐私政策页 | `https://aiminigame-onepage.frontend-cloud.corp.kuaishou.com/privacy.html`（H5 页面，非游戏资源） |

---

*验证时间：2026-09-03 20:12（HEAD 请求，200/206 记为可用）；逐条结果见 `verify-result.txt`。*
