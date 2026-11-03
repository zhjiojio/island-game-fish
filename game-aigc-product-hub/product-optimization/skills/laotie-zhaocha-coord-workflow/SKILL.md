---
name: laotie-zhaocha-coord-workflow
description: 老铁眼真尖（原名老铁找茬王）「场景异物坐标标注 + editor 后台」标准工作流。当用户说「给某关加异物坐标」「标坐标」「找茬 editor」「laotie-editor」「异物坐标不准」「重新标坐标」「后台配置坐标」「老铁来找茬」「老铁眼真尖 editor」「editor 图片加载不出来」「editor 白屏」「editor 部署」「editor 打不开」「editor 关卡图 404」「hidden_lv 404」「关卡缩略图错」「第X关图和第Y关一样」「双 AppID CDN 混用」「ks693835817972937121」「sceneImgUrl」「SCENE1_IMG_MAP」「main.js renderScroll」「editor 双渲染路径」时触发。沉淀了「AIGC 出图 → editor 拉框 → JSON 生成 → 粘贴 levels.js」的完整闭环，坐标使用 % 相对整张图（不是相对舞台），配合 `state._fit` 做 contain fit 自动换算。v0.3.1 血泪教训：editor 里首页 main.js renderScroll 和 legacy renderLevelGrid 是两处独立的拼图 URL 渲染点，改映射表必须两处都改；scene1 混用 ks658651445853447417（主 AppID）和 ks693835817972937121（分包 AppID）两个 CDN，必须用完整 URL 表而不是数字映射。
---

# 老铁找茬王 · 坐标标注方法论

<!-- AIGC-MINIGAME-SKILL-DEPENDENCY -->
> ⚠️ **SKILL DEPENDENCY · 强制前置**
>
> 本 skill 属于 AIGC 小游戏（快手小游戏）生产流程的一部分，**必须先加载 `agw-work-mode`**。
>
> - 若本对话尚未加载 `agw-work-mode` 的 `<skill_content>`，先调用 `use_skill("agw-work-mode")`
> - 若本次任务涉及 build / upload / commit 等敏感动作，**必须先走 `aigc-minigame-orchestrator` subagent**
> - 详见云端权威版本：`git@git.corp.kuaishou.com:kwai-game/game-aigc/game-aigc-product-hub.git` `product-optimization/` 目录
<!-- /AIGC-MINIGAME-SKILL-DEPENDENCY -->


> 【为什么这个方法能奏效】舞台是**绝对尺寸 359×519** 的容器，图片以 **contain** 模式画到舞台里。异物坐标写成"相对完整图片的百分比"，就跟舞台大小、图片实际分辨率都无关了 —— 只要图片本身不变，坐标永远对。

---

## ⛔ 铁律 -2（v1.0.98 事故 · editor 部署后强制自测）

**任何 `editor` 相关的部署/修改，Agent 必须做完这一整套才能告诉用户"已完成"**：

### Step 1 · 跑门禁脚本（1 秒）
```bash
bash /Users/fat/.codeflicker/skills/laotie-zhaocha-coord-workflow/check-editor-deploy.sh
```
5 项自动检查：
1. `dist/` ≤ 5MB（否则 = 误把图打进 bundle，走 CDN 后不该有本地图）
2. bundle 里已内联 `@codeflicker/appwrite`（不是裸 import → 否则白屏）
3. 线上首页 HTTP 200
4. 线上 JS 指纹 == 本地 dist JS 文件名（否则 = deploy 没生效）
5. editor 关卡数 vs game `levels.js` 场景 3 关卡数一致

**退出码 1 = 存在 FAIL，禁止告诉用户"已部署"！先修完再说。**

### ⚠️ deploy 必须 `--dir dist`（v0.3.0 血泪教训）

```bash
# ✅ 正确：只上传 dist
cd /Users/fat/Desktop/laotie-editor && npm run deploy
# 或手跑：
npx frontend-cloud-cli deploy --dir dist

# ❌ 错误：漏 --dir dist 会把项目根目录整个上传
#    → 浏览器加载 index.html（根目录的开发版）
#    → <script src="/src/main.js">
#    → 裸 import '@codeflicker/appwrite'
#    → 浏览器 module resolve 失败 → 登录按钮 handler 没绑上 → 点击无反应
npx frontend-cloud-cli deploy   # ← 千万别这么跑
```

**自检**：deploy 后 `curl -s <URL> | grep -oE 'script[^>]*src[^>]*'` 必须看到 `/assets/index-XXX.js`，如果是 `/src/main.js` 说明上传错目录了。

### Step 2 · browser_agent 真实截图（必须！）
即使门禁全绿，也**必须**走一次 `browser_agent` 做用户视角截图，任务描述示例：
```
打开 https://laotie-editor.frontend-cloud.corp.kuaishou.com/#scene3-lvN
等 5 秒后报告：
1) 是否显示编辑器 UI（含关卡卡片列表）
2) 目标关卡卡片背景图是否加载成功（不是 ❌ 灰底占位）
3) 关卡卡片 title 是否与 game levels.js 一致（顺序 + 名称）
4) console 有无红色 error（尤其 @codeflicker/appwrite 裸 import 错误）
5) 截图返回
```
判定规则：
- 报告"未登录 / 空白"：告诉用户"需在浏览器已登录快手内网 SSO"，不算部署失败
- 报告"❌ 图片加载失败" / "关卡数不对" / "title 不一致"：立即修 → 重跑门禁 → 再截图
- console 有红色 error：**部署视为失败**，立即修再 deploy

### 血泪教训（v1.0.98 事故）

| 我犯的错 | 后果 | 修法 |
|---|---|---|
| 部署完只告诉用户 URL，没自测 | 用户开了本地 file:// 白屏，来质问我 | 强制走 Step 2 browser_agent 截图 |
| 相信 `✅ deploy` 日志 = 用户能看到 | 实际用户 SSO 未登录 / CDN URL 错 / bundle 缺失 一律看不到 | 门禁脚本 + browser_agent 双重验证 |
| dist/ 里塞 65 张图导致超限 | 部署 68MB > 50MB 上限失败但我没注意 | 门禁脚本第 ① 项自动拦截 |
| editor 里 CDN URL 硬编码指向老图 | 用户看到旧图不知道是哪儿的坑 | 换图后必须 grep editor-legacy.js 里所有 `s3_lvN.jpg` 找过时 URL |

**核心原则**：**「用户视角未验证」=「未部署完成」**。`✅ deploy` 只代表文件推上去了，不代表用户能打开。

---

## ⛔ 铁律 -1（v0.0.68 元反思，最优先）

**任何声称"已同步 XXX"之前，必须先跑门禁脚本**：

```bash
bash /Users/fat/.codeflicker/skills/laotie-zhaocha-coord-workflow/check-editor-sync.sh
```

- 退出码 0 = levels.js ⇄ EXIST_S2 ⇄ PROP_META 三方对齐，才允许 deploy / 发扫码
- 退出码 1 = 有缺失，脚本会**逐条列出你漏了什么**，先补齐再往下

**为什么这条排在铁律 0 前面**：v0.0.68 事故证明"记忆型反思"完全无效 —— 我口头说"已补齐 7 条 PROP_META"，实际根本没写进文件。脚本 3 秒抓出真相。**代码不撒谎，反思会。**

详见「九、v0.0.68 强制门禁」章节。

---

---

## 🔴 铁律 0（v0.0.48 血泪教训，最优先，破坏此律 = 反复横跳）

**Agent 只负责「粗定位 + 物品清单」，绝对不做像素级精调。用户在 editor 里拖框才是唯一坐标真值来源。**

### 具体分工

| 步骤 | Agent 做 | 用户做 |
|---|---|---|
| 1. 出图 | ✅ 调 AIGC prompt，生成 A/B 两张图 | 验收 |
| 2. 传素材 | ✅ 上传到 `real-scenes/sceneN/lvM/{a,b}.jpg` + `package/assets/scenes/spot/lvM_{a,b}.jpg` | — |
| 3. levels.js 骨架 | ✅ 写 tag 名称 + **粗定位象限**（TL/TR/BL/BR/M）就够了 | — |
| 4. 部署 editor | ✅ `laotie-editor` 独立域名，13MB 秒部署 | — |
| 5. **精确拉框** | ❌ **禁止 Agent 用 vision 精调 x/y/w/h！！！** | ✅ 用户在 editor 拖 7 个框 |
| 6. 粘贴 JSON | ✅ 收到用户复制的 JSON，直接替换 levels.js odds | 贴 JSON |
| 7. 构建 + 部署 | ✅ 构建游戏包 + 部署 | 扫码验收 |

### 为什么 Agent 不能精调坐标（3 个原因）

1. **Vision 模型的天然误差**：Claude vision 读图坐标 ±5% 是家常便饭。用户手拉框 ±0.5% 是标配。差 10 倍，Agent 永远做不到用户的精度。
2. **完美主义陷阱**：Agent 每看一次图都觉得"还能再调 2%"，于是 replace 8 次都没停手。每次 replace 消耗 1000 tokens 上下文，8 次 = 8k tokens 白烧，用户已经烦到骂人了。
3. **AIGC 的元素替换是决策不是 bug**：AI 出图可能把 `phone` 换成 `hat`（v0.0.48 lv2 真实案例）。这是**用户决定要不要保留、要不要重生成**的事，Agent 擅自改 tag = 越权。**正确做法**：在 levels.js 注释里标 `⚠️ AIGC 可能替换了 phone→hat，请用户确认`，然后停手等用户。

### 粗定位的正确写法（象限 + tag，不写数字）

```js
odds:[
  // ⭐ 骨架：只写 tag + 象限提示，具体坐标由用户在 editor 拖框
  { tag:'flamingo', hint:'左中·躺椅上' },
  { tag:'drone',    hint:'天空右上' },
  { tag:'plane',    hint:'中右·太阳附近' },
  { tag:'duck',     hint:'右沙滩' },
  { tag:'coke',     hint:'左下沙滩' },
  { tag:'earbud',   hint:'中下沙滩' },
  { tag:'hat',      hint:'左下沙滩 · ⚠️ AI 用它替换了 phone，请确认' }
]
```

如果 game.js 强制要求 x/y/w/h 才不崩，就写 8 个占位值让 editor 有默认框可微调，**注释明确写"占位待校准"**，绝不假装是精调结果：

```js
odds:[
  // 占位待用户在 editor 校准，具体位置由用户拖框决定
  { tag:'flamingo', x:10, y:45, w:15, h:15 },
  ...
]
```

### 🚫 明确禁止的行为

- ❌ 连续调用 `replace_in_file` 3 次以上只为微调 x/y/w/h 数字
- ❌ 在没有用户 editor JSON 反馈的情况下声称"7 个异物已精确定位到位"
- ❌ 反复用 `read_file` 读同一张图想看得"更清楚"（图就那样，看多少次都一样）
- ❌ 擅自把 AIGC 替换后的元素改 tag（如 phone→hat）而不问用户

---

## 一、坐标系约定

- 坐标存储在 `levels.js → LEVELS[i].odds[].{x,y,w,h,tag}`（**hidden 模式用 box[4]，spot 模式用 x/y/w/h**）
- **百分比是相对于「整张原图」的**，不是相对于舞台
- 渲染时 game.js 会先算 `state._fit = {x,y,w,h}`（图片以 contain 铺进舞台后的实际矩形），命中判定用：
  ```
  screenX = _fit.x + (x/100) * _fit.w
  screenY = _fit.y + (y/100) * _fit.h
  ```

## 二、标准工作流（7 步 · v0.0.48g 沉淀）

### Step 1: 出图（Agent 做）

按 `laotie-zhaocha-scene-image` skill 的 Prompt 模板生成 A/B 两张图（spot 模式）或单张（hidden 模式），上传到 CDN 后落到本地：
- 游戏包：`package/assets/scenes/spot/lvN_{a,b}.jpg`
- editor 副本：`real-scenes/sceneN/lvM/{a,b}.jpg`

### Step 2: 传素材（Agent 做）

**用 write_to_file / curl 落地。同步两处路径不能漏**。

### Step 3: levels.js 骨架（Agent 做，粗定位）

在 `package/js/levels.js` 加一条 LEVELS 项，`odds` 只写 tag + 占位坐标，**注释里明确标"占位待用户校准"**。**绝不假装数字是精调结果**。

### Step 4: 部署 editor（Agent 做）

```bash
cd /Users/fat/Desktop/laotie-editor
npx frontend-cloud-cli deploy
```

产出链接：`https://laotie-editor.frontend-cloud.corp.kuaishou.com/#sceneN-lvM`

⚠️ 不要部署到 `aiminigame-onepage`（639MB 素材站会超 50MB 上限）。

### Step 5: 用户拉框（用户做）

用户打开链接 → 拖 N 个框 → 点「复制 odds JSON」→ 粘给 Agent。**Agent 在此阶段只等待，不做任何坐标调整。**

### Step 6: 粘贴 JSON（Agent 做）

收到用户粘的 JSON，一次 `replace_in_file` 替换 `LEVELS[i].odds` 数组。**不做任何"AI 认为可以微调一下"的动作**。

### Step 7: 构建 + 部署 + 用户验收

按 `kuaishou-minigame-aigc` 或本地 preview 流程走。

---

## 三、editor 独立域名（v0.0.48f 沉淀）

**为什么 editor 单独部署**：

- `aiminigame-onepage` 是展示站，含 639MB 视频/剧本素材，deploy 直接超 50MB 上限
- editor 只是 13MB 的纯 HTML + real-scenes 图片，5s 部署完
- 独立域名 `laotie-editor.frontend-cloud.corp.kuaishou.com` 语义清晰

**项目目录**：`/Users/fat/Desktop/laotie-editor/`
- `index.html`（editor 主文件，从 `laotie-editor.html` 改名）
- `real-scenes/scene{N}/lv{M}/{a,b}.jpg`

**首次部署**：
```bash
cd /Users/fat/Desktop/laotie-editor
npx frontend-cloud-cli deploy --project-id laotie-editor --project-name "老铁找茬王 配置后台"
```

**后续更新**（`.static-site-deploy.json` 已注册）：
```bash
cd /Users/fat/Desktop/laotie-editor
npx frontend-cloud-cli deploy
```

---

## 四、AIGC 元素替换的正确处理

**现象**：AI 出图时可能把 prompt 里的 `phone` 换成 `straw hat`（无法百分百控制）。

**Agent 应做**：
1. 用 `read_file` 打开 B 图观察 → 发现替换
2. 在 levels.js 注释里明确标：`{ tag:'hat', hint:'⚠️ AI 用它替换了 phone，请确认是否重生成' }`
3. **停手等用户决策**：告诉用户"图里 phone 变成 hat 了，要不要重生成？还是保留这个 hat？"
4. 用户决定后再动 tag 名（如果保留就 phone→hat；如果重生成就重新出图）

**Agent 禁止做**：
- 擅自把 tag 从 `phone` 改成 `hat` 然后疯狂调 hat 的坐标
- 假装 `phone` 还在图里给一个"合理"的占位坐标

---

## 五、常见坑（血泪教训）

| 坑 | 现象 | 修 |
|---|------|----|
| Agent 精调坐标反复横跳 | 8 次 replace_in_file 都没停，用户骂人 | **铁律 0**：只做粗定位，等用户 editor 拖框 |
| AIGC 替换元素当 bug 处理 | 擅自改 tag 又反复调坐标 | 标注 + 停手 + 问用户 |
| 部署 aiminigame-onepage 传 editor | 639MB 超上限 | 独立 `laotie-editor` 项目 |
| 坐标改为相对舞台 | 换图片尺寸后全飘 | 一律用 % 相对完整图 |
| 舞台 AR 变了 | 图片被拉伸 | 舞台 359×519 **绝对不能改** |
| 图片本身裁切过 | 坐标偏 | 出图后不许再裁；要裁就重标 |
| editor 拖框忘了填 id | 生成 JSON 时崩 | editor 每框强制要 id+tag |

---

## 六、"坐标对得准"的三个不变量

1. **图片文件本身不变**（不裁切、不缩放、不换新出图）
2. **舞台 359×519** 不变
3. **渲染路径 contain fit** 不变

---

## 七、快速命令备忘

```bash
# levels.js
open /Users/fat/work/minigame/game-aigc-product-hub/games/ks712131693858878897/package/js/levels.js

# editor 项目
cd /Users/fat/Desktop/laotie-editor

# 部署 editor
cd /Users/fat/Desktop/laotie-editor && npx frontend-cloud-cli deploy

# editor 直达 URL
open "https://laotie-editor.frontend-cloud.corp.kuaishou.com/#scene2-lv2"

# 本地 preview（skill kuaishou-minigame-aigc）
cd /Users/fat/work/minigame/game-aigc-product-hub/games/ks712131693858878897 && ksmg preview
```

---

## 八、Agent 自查清单（每次动坐标前问自己）

- [ ] 我是不是在做像素级精调？→ 是的话立刻停手
- [ ] 用户是不是已经在 editor 拖框了？→ 没有就先部署 editor 让他去拖
- [ ] 我这次 replace_in_file 是第几次？→ 超过 2 次就停手
- [ ] AIGC 是否替换了元素？→ 是的话先问用户，别自作主张
- [ ] 我改的数字有真值来源吗（用户 JSON）？→ 没有就写"占位待校准"注释
- [ ] **加新关卡时，editor 的 EXIST_S2 / EXIST 和 PROP_META 都同步了吗？** → 少一个都会导致 editor 打开空白（v0.0.48g 血泪）

---

## 九、🚨 v0.0.68 强制门禁（不再靠"我记得改了"）

### 反思为什么"记忆"总失效
过去 3 次都是同一个坑：
1. v0.0.56 加 S2·Lv8 古玩地摊 → 忘写 EXIST_S2[13] → editor 0 个默认框
2. v0.0.67 用户校准 S2·lv4-7 → 只回写 levels.js，忘同步 EXIST_S2
3. v0.0.68 我口头声称"补齐 PROP_META 7 条"，**实际根本没写进文件**，只是记忆的错觉

根因：**自然语言反思 = 只在对话里道歉，代码文件不 care**。反思一定要产出**可执行的机器检查**才算数。

### 门禁脚本 `check-editor-sync.sh`（本 skill 目录下）

**用法**：`bash /Users/fat/.codeflicker/skills/laotie-zhaocha-coord-workflow/check-editor-sync.sh`

**它做什么**：
1. 从 `levels.js` 抓所有 spot 模式的 `tag:'xxx'`
2. 从 editor `index.html` 抓 `EXIST/EXIST_S2` 里的 `prop:'xxx'`
3. 从 editor `index.html` 抓 `PROP_META` 的 key
4. 三方 diff：**任一不对齐 → 退出码 1 + 明确列出缺失项**

### 🔴 铁律：以下动作**必须**先跑脚本

| 动作 | 前置检查 |
|---|---|
| 加新关卡到 levels.js | 先跑，确认无缺失才 commit |
| 更新 EXIST_S2 里坐标 | 先跑，确认 tag 对得上 |
| 声明"我已同步 XXX" | **跑脚本** > 你的记忆 |
| 部署 editor 前 | 跑脚本 → ✅ 才 deploy |
| 用户扫码前 | 跑脚本 → ✅ 才发码 |

### 具体接入
```bash
# 每次改完 levels.js 或 editor：
bash /Users/fat/.codeflicker/skills/laotie-zhaocha-coord-workflow/check-editor-sync.sh
# 输出：
#   ❌ levels.js 有 tag 但 editor EXIST/EXIST_S2 缺失 → 立即补 EXIST_S2
#   ⚠️ EXIST 出现的 prop 缺少 PROP_META → 立即补 PROP_META
#   ✅ 三方完全对齐 → 才允许 deploy
```

### 何时**不要**跳过脚本
- 用户催你部署 → **跑完再部署**，30 秒的事
- 你以为"这次改动很小" → 越小越容易漏一处
- 你 100% 确信"我记得改了" → **99% 你没改**（v0.0.68 就是证据）

---

## 💀 铁律 -2（v0.0.99 血泪教训 · editor 关卡数据反复丢失）

**editor 是"零后端"纯前端应用，所有关卡配置只写 `localStorage['laotie_annotations']`。 用户浏览器一擦，数据就化为乌有。**

### 症状（用户原话）
> "编辑配置后台很多关卡信息都丢了 为啥？？？？"

### 根因清单（六大杀手，按发生频率排序）

| # | 杀手 | 触发方式 | 影响面 |
|---|---|---|---|
| 1 | **换设备 / 换浏览器 / 换 Chrome Profile** | 用户在另一台电脑 / 手机 / Chrome vs Safari 打开 editor | 100% 丢失（跨端不同步） |
| 2 | **清浏览器缓存 / 隐私模式 / "清除网站数据"** | Chrome 设置 → 清除浏览数据 → 勾"Cookies 及其他站点数据" | 一键归零 |
| 3 | **`__resetAll()` 控制台命令** | 上次为了修"火烈鸟/无人机"错误，专门加的一键清空 | 用户误敲一次全没 |
| 4 | **DATA_VERSION 自动升级** | 代码里 bump 版本号会自动清 localStorage | 每次改 editor 数据结构 = 全站清空 |
| 5 | **切 tab 未点💾保存**（v0.2.3 强制） | 用户以为拖框就自动保存，切走 → 内存里的 PLAN 丢弃 | 单关丢失 |
| 6 | **localStorage 配额爆掉** | 单域名 5-10MB，图片 dataURL 存进去几关就爆 | 静默 QuotaExceededError |

### 为什么会这样（架构缺陷）

```
[editor 现状]                     [健康架构应该]
laotie-annotations                 laotie-annotations
    ↓ localStorage                     ↓
只在这一台机器的                    云端 KV/Appwrite
这一个浏览器的                     ↓ 
这一个域名下                       所有设备都能读写
                                   ↓
                                   自动多端同步
```

**localStorage 的本质**：域名维度的本地缓存，**不是数据库**。任何"跨设备/跨浏览器/跨时间"的需求都会翻车。

### 🛡️ 三重防线（Agent 每次接到 editor 相关任务必须提醒用户）

#### 防线 1：教用户「工作 → 备份」两步走
```
用户拉完框 → 点💾保存 → 点📦复制全部关卡信息
        ↓
    立即粘到 levels.js 里 commit git
        ↓
    git 才是唯一真值来源
```
**记忆口诀**：**"editor 是画板，levels.js 是相册"**。画完不拍照，画板一擦就没。

#### 防线 2：加"云端同步"能力（v0.1.0 路线图）
- 用 `@codeflicker/appwrite` 存 `laotie_annotations` 到云 KV
- 页头加 "☁️ 同步到云端" 按钮 + "📥 从云端恢复" 按钮
- key 用 `user_id + scene + lv` 复合，避免多人覆盖

#### 防线 3：显眼的"数据保鲜"提示
editor 打开时如果 `localStorage['laotie_annotations']` 存在但超过 3 天没变化，弹一次警告：
> ⚠️ 你的关卡数据只存在本地浏览器，已 X 天未同步到 git。 建议立即 📦 复制粘贴到 levels.js。

### 🚨 用户报"数据丢了" 的排查 SOP

1. **别慌**（数据大概率无法恢复 —— localStorage 一擦不可逆）
2. 问用户三个问题：
   - 上次拉完框后，有没有点 📦「复制全部关卡信息」并粘到 levels.js？
   - 是不是换了设备/浏览器/Chrome Profile？
   - 有没有在控制台敲过 `__resetAll()` ？
3. **能救的场景**：git log 找 levels.js 最新一次含新关卡数据的 commit，直接从代码里恢复
4. **救不了的场景**：只有 localStorage 一份，且用户已清 → **只能重标**
5. **立即接入云端同步**（appwrite-cf），避免下次再丢

### 沟通话术模板
> "editor 是纯前端工具，关卡数据只存在你浏览器的 localStorage 里。 换设备、清缓存、隐私模式、`__resetAll()`、DATA_VERSION 升级 都会导致清空。 唯一可靠的做法是：**拉完框 → 立即 📦 复制粘贴到 `levels.js` 提交 git**。 git 才是唯一真值来源。 短期我可以帮你先加云端同步（appwrite），长期建议直接把 editor 改成写云 KV。"

### 何时该主动重构（不再打补丁）
- 用户第 2 次报"关卡丢了" → 立即接入 appwrite-cf，不要再加"重置按钮"
- 需求方超过 1 人使用 editor → 必须云端，否则永远互相覆盖
- 关卡数 > 20 → localStorage 配额风险陡增，必须云端


---

## 🛠️ 铁律 -2 的止血修复（v0.0.99 已上线）

**不是加云端，先加"本地文件备份 + 强提示"，30 分钟能上线，成本 0。**

### 上线的 4 项改动（laotie-editor.html）

1. **⬇️ 导出备份按钮**
   - 一键下载 `laotie-annotations-YYYYMMDD-HHMMSS-N关.json`
   - 内含 `{__schema, exported_at, ua, href, annotations}` 完整元信息
2. **⬆️ 导入备份按钮**
   - 选 .json 文件 → 弹 prompt 让用户选"合并 / 全量覆盖 / 取消"
   - 自动 reload 页面刷新 UI
3. **保存时自动下载备份**（默认勾选）
   - 每点💾保存自动触发一次 backup 下载
   - 用户可在顶栏取消勾选
4. **顶部红色横幅提醒**
   - 数据 > 0 且从未备份 → 深红警告 + 800ms 后 confirm 弹窗强推
   - 上次备份 ≥ 1 天 → 红色 warning
   - 上次备份 ≥ 2 小时 → 橙色 warning
   - 2 小时内 → 绿色 ✔

### 关键实现片段
```js
// 备份文件结构（可跨端识别）
{ __schema:'laotie-annotations-v1', exported_at, ua, href, annotations:{...} }

// 导入兼容：既支持完整 payload，也支持裸 annotations 对象
const incoming = data.annotations || data;

// 时间戳存 localStorage['laotie_last_backup_ts']，用于横幅计算
```

### 为什么先做本地文件备份，不做云端
- 云端方案要接 appwrite-cf + 建 collection + 处理并发 → 至少 2 小时
- 本地文件 backup 是"用户自己主动的**物理备份**"，一份 .json 扔到 iCloud / 网盘就完全安全
- 上线即生效，用户当场就能拉一份保命

### 后续 v0.1.0 规划（真正的云端）
仍然要接 appwrite-cf，本地文件方案是**过渡兜底**，不是终点。触发条件：
- 用户第 3 次报数据丢失
- 或需要多人协作 editor

---

## 🩸 铁律 -3（v0.0.100 究极血泪教训 · "关卡丢了" ≠ 数据丢）

**用户报"关卡丢了" 90% 的真相是：数据没丢，是 editor 的 `SCENE_META` 硬编码只登记了少数关卡，其余全被 UI 藏起来了。levels.js 才是唯一真值源。**

### 症状对照表
| 用户说 | 真相 |
|---|---|
| "第 2 关到第 13 关都不见了！" | levels.js 有 13 关，editor SCENE_META 只写了 6 关 |
| "配置后台的关卡全丢了！" | localStorage 里 keys=["19","s3_1"..] 全都在，UI 因 SCENE_META 缺登记不显示 |
| "为啥场景 2 只剩第 1 关？" | levels.js 场景 2 有 8 关（idx 6-13），editor 只登记 lv1 |

### 排查 SOP（30 秒定位）
```bash
# 1. 查 levels.js 有多少关
grep -c "themeId:1" game-aigc-product-hub/games/ks*/package/js/levels.js  # 场景 1 关数
grep -c "themeId:2" game-aigc-product-hub/games/ks*/package/js/levels.js  # 场景 2 关数
# 2. 查 editor SCENE_META 有多少关
grep -c "^      {lv:" laotie-editor.html  # editor 登记数
# 3. 两个数不等 = 有关卡被 UI 藏起来 = 立即同步
```

### 修复模板
每次 levels.js 新增关卡，**必须同步 3 个地方**：
1. `SCENE_META[1|2|3].levels` → 加 `{lv, title, duration, hint, calibrated, hell?}` 让 UI 列卡片
2. `EXIST` / `EXIST_S2` / `EXIST_S3` → 加坐标数组，让"点关卡"能加载初始框
3. `PROP_META` → 每个新 tag 都要加 `{emoji, name}`，否则显示 `undefined`

### 为什么每次都栽这里
- `SCENE_META` 是 editor 的**唯一目录**，不写就不显示，纯前端 hard-code
- levels.js 是游戏运行时的真值，跟 editor 是**两套数据**（editor→JSON→人肉粘贴→levels.js）
- 单向流水线一旦"人肉粘贴"忘了做，或者 editor 加了新关卡但 SCENE_META 忘了同步，就"消失"

### 🛡️ 门禁脚本（v0.0.100 上线）
`check-editor-sync.sh` 应增加：
```bash
# 校验 levels.js 每一关都在 SCENE_META 里登记
for lv in $(levels.js 里 themeId:1 的 title 数); do
  grep -q "第${lv}关" laotie-editor.html || echo "❌ Lv${lv} 未登记到 SCENE_META"
done
```

### 未来根治方案（v0.1.0）
**editor 不再 hard-code SCENE_META**，改为运行时 `fetch('./levels.js')` 或 `fetch('./levels.json')` 动态解析。 从根本上断绝"levels.js 有 editor 没有"的可能性。

### 沟通话术
> "你的关卡数据一个都没丢！打开顶部橙色面板可以看到"孤儿关卡"（localStorage 有、但 editor UI 未登记的）。 levels.js 里有 N 关但 editor 只显示 M 关，是因为 editor 的 SCENE_META 是硬编码的目录，之前忘了同步。 现在我已经把 levels.js 里的 21 关全部补进 SCENE_META，刷新页面即可看到所有关卡。"

---
## 💀 铁律 -3（v0.3.1 血泪教训 · scene1 双渲染路径 + 双 AppID CDN）

### 症状（用户原话）
> "这么多 404 的图 还有这些关卡顺序也对不上，第5关 · 麻将馆实际展示的图和第三关的是一样的 到底在干嘛呢？"

改完 `editor-legacy.js` 里的 `SCENE1_IMG_MAP` 部署后，**页面依然全 404 + 图错乱**。反复 grep dist bundle → 映射表**已正确**，反复 curl 拉 bundle → 内容**已正确**，但 browser 请求的仍是**旧 URL**。折腾 20+ 轮才找到根因。

### 根因（三个并发 bug）

**Bug 1：单一映射表位置不足**
- editor 前端有**两处**渲染关卡缩略图：
  1. `editor-legacy.js` `renderLevelGrid()` → 走 wizard「选场景 → 选关卡」二级页
  2. `src/main.js` `renderScroll()` → **首页 `#scene1` tab 直接渲染的横滑关卡列表**（这才是用户首屏看到的）
- 只改了 legacy 的映射表，main.js 里那份**独立复制的拼接代码**（`hidden_lv${sceneImgOf(L.lv)}.jpg`）没改，结果首屏 lv12 拼成 `hidden_lv12.jpg` 而不是 `hidden_lv19.jpg`

**Bug 2：AppID CDN 混用**
- game 里 lv1-11,14-16,26,36-38 用主 AppID `ks658651445853447417`
- lv12,13,17-25,27-35（**21 关**）用另一 AppID `ks693835817972937121`
- editor 全部硬拼主 AppID → 21 张 404

**Bug 3：难度重排后关号 ≠ 图片文件号**
- v1.0.67 重排后新关号 lv5 对应旧图片 lv3.jpg，但 `SCENE1_IMG_MAP[5]=6` 手抖写错，导致第5关麻将馆展示成第3关老炕新客的图

### 关键教训

**❗❗ 教训 1：改 URL 拼接逻辑前，先 `grep -rn "hidden_lv" src/` 找出所有拼接点**

editor 里至少三处独立拼 hidden_lv URL：
- `src/editor-legacy.js` renderLevelGrid（wizard 关卡卡片）
- `src/editor-legacy.js` canvas load（编辑器大图）
- `src/main.js` renderScroll（**首页横滑列表** ← 最容易漏！）

任何一处漏改 → deploy 后 browser 表现依然错误，且**极难定位**（dist bundle 里另外几处的代码是对的，会误以为已修好）。

**❗❗ 教训 2：不要维护"关号→图片号"数字映射，直接用完整 URL 表**

原方案：
```js
const SCENE1_IMG_MAP = {5:6, 12:19, ...};  // ❌ 只能拼一个 AppID
function sceneImgOf(lv){ return SCENE1_IMG_MAP[lv] || lv; }
url = `${BASE}/hidden_lv${sceneImgOf(lv)}.jpg`;
```
问题：BASE 硬编码 → 无法混用 AppID → lv12→19 拼错 CDN。

新方案（v0.3.1）：
```js
const S1_CDN_BASE = 'https://.../ks658651445853447417/hidden_';
const S2_CDN_BASE = 'https://.../ks693835817972937121/hidden_';
const SCENE1_IMG_URL = {
  5:  S1_CDN_BASE+'lv3.jpg',
  12: S2_CDN_BASE+'lv19.jpg',   // ⭐ 换 AppID
  ...
};
function sceneImgUrl(lv){ return SCENE1_IMG_URL[lv] || (S1_CDN_BASE+'lv'+lv+'.jpg'); }
// 所有拼接点改为直接返回完整 URL
```

**❗❗ 教训 3：跨模块共享映射，务必 `window.xxx = xxx` 暴露 + fallback**

`main.js` 靠 `await import('./editor-legacy.js')` 加载 legacy，但 legacy 的 `sceneImgUrl` 是局部函数，`main.js` 拿不到 → 必须在 legacy 末尾 `window.sceneImgUrl = sceneImgUrl` 暴露，`main.js` 里用 `const sceneImgUrl = window.sceneImgUrl || (lv => fallback)` 兜底。

**❗❗ 教训 4：诊断 URL bug 必须在 browser Console 直接跑 `document.querySelector('[alt=lvN]').src`**

不要只 grep 源码或 dist bundle！单纯的静态分析会误判「bundle 内容对 = 页面就对」——实际上 bundle 里可能有 A 函数 (对) 和 B 函数 (错) 两份代码，页面调用了 B。**必须运行时验证实际 DOM 里 img 的 src**。

### 诊断话术模板

Agent 遇到「deploy 后 URL 还是错」时，按以下顺序排查：

```
1) [静态] grep -rn "关键 URL 片段" src/     ← 找出所有拼接点，有几处？
2) [静态] 每处拼接点用的映射函数是同一个吗？是共享变量还是各自复制？
3) [静态] dist bundle 里 grep 目标字符串是否出现？（node -e 分析）
4) [运行时] browser Console 跑 document.querySelectorAll('.thumb')[N].src
5) [运行时] 若 src 错，反查该 DOM 由哪个模块 render（main.js? legacy? component?）
6) [运行时] 确认所有渲染路径都用了新映射
```

### 门禁脚本增补建议

`check-editor-sync.sh` 应新增：
```bash
# 检查所有场景图 URL 拼接点是否走统一函数
PATTERNS=$(grep -rn "hidden_lv\${" src/ | wc -l)
FUNC_CALLS=$(grep -rn "sceneImgUrl(" src/ | wc -l)
if [ $PATTERNS -gt 0 ]; then
  echo "❌ 发现 $PATTERNS 处未走 sceneImgUrl 的裸拼接"
  exit 1
fi
```
