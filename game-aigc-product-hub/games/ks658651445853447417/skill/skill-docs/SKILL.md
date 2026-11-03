---
name: laotie-zhaocha-game
description: 快手 AIGC 小游戏「老铁眼真尖」项目专属 skill（原名老铁找茬王，2026-08-11 改名）。当用户说「改老铁眼真尖」「眼真尖 build」「找茬王 build」「找茬王扫码」「laotie-zhaocha 开发」「找茬关卡」「找茬 package」「找茬预览二维码」「找茬版本号」「找茬 v0.0.xx」「找茬隐藏关卡」「找茬上传」「找茬发布」「找茬全量审计」「全部看 全部干」「天津之后隐藏」「改名老铁眼真尖」「辣辣没隐藏」「酷二狗还在」「语音包隐藏」「spot时长不对」「找茬时长公式」「滑动误触」「加桌重复」「解锁进度」「解锁全部 x/5」「桌面包同步」「外部包同步」「零引用素材」「切图版UI」「vp-selected/locked/unlocked」「toggle-on/off 切图」「桌面包做的好的部分」「废弃素材草泥马」「暂放素材待后续替换」「素材接入不完整」「照抄桌面源码」「rsync覆盖」「线上逻辑丢了」「52%卡死」「打不开」「loading卡住」「CRITICAL_ASSETS」「hidden主题漏出来」「帅哥靓男显示」「主题没隐藏」「v99回补」「小主包」「分包加载」「CDN 分包」「BGM 转 CDN」「ignore 排除」「主包过大」「setting.ignore」「project.config.json ignore」「不要删除素材」「BGM 上传 CDN」「主包 29MB」「v1.0.50」「git merge 冲突」「SyntaxError」「node -c 语法检查」「CDN URL 重写」「加一关」「新增关卡」「新加第X关」「加个关卡」「热更关卡」「不发版加关」「动态下发新关卡」「改第X关时长」「levels-config.json」「level-loader.js」「远程JSON」「关卡JSON」「动态下发」「热更」，或需要在 `games/ks658651445853447417/` 目录下改代码时触发。沉淀核心铁律：AppID 权威来源、活代码路径、死亡三问、`.bak` 目录禁忌、跨 AppID 隔离 hook、ksmg-preview 预览/上传命令、版本号维护三件套、运行时关卡隐藏 filter 模式、语音包 hidden+filter 三层同步、用户校准 JSON 三方同步、全 18 关逐关审计方法论、CDN 迁移全量 URL 验证、同 themeId 多批关卡冲突检测、时长公式必须覆盖全主题不能只改一个、桌面包/外部包同步铁律（零引用素材≠废弃、照抄桌面源码不保守暂放、切图优先+fallback 手撸）、rsync覆盖diff审计铁律、CRITICAL_ASSETS禁止塞关卡图铁律、**小主包+CDN 分包加载铁律**（禁止删素材瘦身、用 `project.config.json setting.ignore` 排除 CDN 副本、BGM>500KB 走 CDN、CRITICAL_ASSETS≤3 张<500KB、主包>20MB 是 52% 加重因素但 SyntaxError 才是真凶、52%排查必须先 node -c 语法检查再查包体、ignore 是数组不是对象禁止塞注释键）、**52%卡死排查铁律**（先 node -c 语法检查→再查包体→CRITICAL_ASSETS→CDN可达性、git merge 冲突残留是 SyntaxError 常见来源）。姐妹项目「老铁斗地主」在 `../ks651896049489522351/`，一次会话里禁止同时改两个 AppID。历史目录名 `ks712131693858878897` 已于 2026-08-05 重命名为真实 AppID `ks658651445853447417`，如遇旧引用请自动替换。
---

# 老铁眼真尖 · 项目专属 Skill（原名老铁找茬王）

<!-- AIGC-MINIGAME-SKILL-DEPENDENCY -->
> ⚠️ **SKILL DEPENDENCY · 强制前置**
>
> 本 skill 属于 AIGC 小游戏（快手小游戏）生产流程的一部分，**必须先加载 `agw-work-mode`**。
>
> - 若本对话尚未加载 `agw-work-mode` 的 `<skill_content>`，先调用 `use_skill("agw-work-mode")`
> - 若本次任务涉及 build / upload / commit 等敏感动作，**必须先走 `aigc-minigame-orchestrator` subagent**
> - 详见云端权威版本：`git@git.corp.kuaishou.com:kwai-game/game-aigc/game-aigc-product-hub.git` `product-optimization/` 目录
<!-- /AIGC-MINIGAME-SKILL-DEPENDENCY -->


## 🚨 强校验体系（2026-08-19 沉淀 · 必读）

从 v1.0.97 起，本项目引入了 **3 层强校验**，跟随代码仓库分发在 `games/ks658651445853447417/skill/`。
每次 `git pull` 后**必须**先跑：

```bash
cd $(git rev-parse --show-toplevel)/games/ks658651445853447417
bash skill/hooks/install.sh
```

| 层级 | 时机 | 位置 | 内容 |
|---|---|---|---|
| **Level 1** | 每次 `git commit` | `.git/hooks/pre-commit`（软链自 `skill/hooks/pre-commit.sh`）| 秒级、免 CDN、拒挂再往下走 |
| **Level 2** | 手动 / CI | `skill/scripts/laotie-check.sh` | 12 项全查含 CDN HEAD |
| **Level 2.5** | 上线前 | `skill/scripts/ksmg-preview-guarded.sh` | 12 项全绿 → 才调 ksmg upload → 打印 git commit 命令 |

**12 项校验清单**：中文 tag、敏感词、标题≤8字、hint⇔odds 长度、idx 唯一性、版本号三件套、AppID 一致性、editor dist 无 real-scenes、editor PROP_META 覆盖、CDN 场景图 HTTP 200、git 状态、levels.js PROPS 覆盖。

**违规兜底**：AI 每次改 levels.js / editor-legacy.js 后**必须**跑 `bash skill/scripts/laotie-check.sh --skip-cdn`，返回非 0 → 立即修复不许提交。

详见 `games/ks658651445853447417/skill/SKILL.md` 与 `README.md`。

## 🧭 全类型关卡生成强制路由

凡是生成、重写、扩展或批量规划关卡，必须先完整阅读：

`games/ks658651445853447417/docs/全类型关卡批量生成规则.md`

必须先按“显式 mode → 现有配置结构 → 需求关键词 → 默认规则”唯一识别关卡类型：

- `hidden`：单图找时代、场景或常识异常。
- `spot`：同构双图找指定差异。
- `hunt`：复杂单图寻找指定物品。
- `story`：跨关连续剧情搜证。

`boss`、`bossStage`、`diff`、`layout` 只是修饰，不能误识别成新玩法。非故事型关卡必须按统一 Markdown 模板输出；不得把答案扎堆在同一箱子、桌面、抽屉或四角，不得让点击区相交或重叠。**一条线索只能对应一个唯一答案物体、一条 `odds` 和一个点击区；禁止同一线索重复物体、重复 `prop`、拆分答案或多热区。** 所有新主题继续复用同一份 `levels-config.json` 和现有 mode 引擎；相同 mode 不得复制新引擎代码。

故事型弹窗文案执行40字硬上限：`intro.body`（开场）、`epilogue`（通关揭示）和 `nextHook`（下一关钩子）分别最多40个可见字符，标点和数字计入。`intro.body` 与 `epilogue` 必须是单段，禁止 `\n` 或手动换行；`nextHook` 必须独立下发，不得拼进 `epilogue`。

识别为 `mode:'story'` 后，还必须完整阅读：

`games/ks658651445853447417/docs/故事型关卡剧本生成规则.md`

故事型必须先锁定故事圣经、章节推进和逐关信息增量，再按 `docs/《1808房间》第一章1-5关剧本.md` 的固定 Markdown 层级输出。单章与整部剧本都不得改变标题顺序、字段名称和列表格式；禁止先随机生图再倒推剧情，禁止开场直接公布答案名。

---

## 一、项目坐标（唯一权威）

| 项 | 值 |
|---|---|
| 游戏名 | 老铁眼真尖（2026-08-11 由「老铁找茬王」改名） |
| 真实 AppID | `ks658651445853447417`（**权威**：`package/project.config.json` 的 `appid` 字段） |
| 本地目录 | `/Users/fat/Desktop/aiminigame/game-aigc-product-hub/games/ks658651445853447417/` |
| 目录名 | ✅ 已与真实 AppID 一致（2026-08-05 由旧名 `ks712131693858878897` → `ks693835817972937121`；2026-08-11 再迁至 `ks658651445853447417`） |
| Git 仓库 | `git@git.corp.kuaishou.com:kwai-game/game-aigc/game-aigc-product-hub.git` |
| 主分支 | `dev` |
| 引擎 | 纯 canvas + ks 原生 API（**非 Cocos**） |
| 入口 | `package/game.js` → `package/js/main.js` |
| 预览 title | `<title>老铁眼真尖 · H5 预览</title>`（2026-08-11 改名） |

> 📌 **旧目录名兼容**：如果在历史 recap / thread / 文档里看到 `ks712131693858878897`，请**自动换算为 `ks658651445853447417`**（同一个项目，只是改了名）。

## 二、目录结构

```
ks658651445853447417/
├── package/               ← ksmg-preview 打包目标（活代码，仅改这里）
│   ├── game.js           入口壳
│   ├── index.html        H5 预览入口（含 <title> "老铁找茬王"）
│   ├── game.json         快手小游戏配置
│   ├── project.config.json  ← appid 权威来源
│   ├── js/
│   │   ├── main.js       游戏主循环 & 广告封装
│   │   ├── welcome.js    首页
│   │   ├── game.js       核心找茬逻辑
│   │   ├── levels.js     关卡数据
│   │   ├── feedback.js   音效 + 语音 + 震动
│   │   ├── m3-init.js
│   │   └── kwai-*.js
│   ├── api/kwai-ad.js    真广告封装（onClose isEnded 判定）
│   ├── assets/           图片 / 音频
│   └── tmp/              ksmg-preview 生成的二维码
├── docs/                  策划 & 关卡文档
├── real-scenes/           真实照片素材（未上线）
├── outputs/               AI 生图产物
├── workflow-run.yml
├── gen-voice-line.sh      语音一键生成脚本
└── README.md
```

## 三、🔴 铁律（改代码前必须遵守）

### 死亡三问（每次动手前）
1. `head -5 package/game.js` —— 看真入口是谁（斗地主还是找茬）
2. `head -1 package/index.html | grep title` —— 看 title 是不是当前要改的游戏
3. 改完立刻加 `console.log('[MARKER] v0.0.XX')` 死证据，扫码后 vConsole 一眼确认改动进包
4. ⭐ `for f in package/js/*.js; do node -c "$f" 2>&1; done` —— **JS 语法检查**（v1.0.51 血训：merge 冲突残留 = SyntaxError = 卡 52%）

### 禁忌
- ❌ **不要改 `package.bak/` / `package.*.bak/`** —— 不会被打包
- ❌ **不要在一次会话里同时改两个 AppID** —— hook `miniplay-appid-isolation.js` 会 block
- ❌ **不要用 grep 命中的第一个路径直接改** —— 先 `grep -v .bak` 排除备份

### 迁移历史踩坑（2026-08-03）
这个 AppID 曾被「老铁斗地主」重构项目错误占用 —— 找茬活代码被搬到 `package.bak/`，`package/` 变成斗地主壳。导致 v56/57/58/59 十几轮改动**一个字节都没进包**，用户扫码看到"没变化"被误诊为手机缓存问题。
- 处置：斗地主已迁到 `ks651896049489522351/package/`；找茬 `package.bak/` 已恢复为 `package/`；装了 hook `miniplay-appid-isolation.js` 从机制上防止再犯。

### 目录改名（2026-08-05）
原目录名 `ks712131693858878897` 是历史随手名，与真实 AppID 无关，导致每次沟通都要额外解释。已通过 `git mv games/ks712131693858878897 games/ks658651445853447417` 重命名为真实 AppID，消除歧义。同时更新了 README 和 `gen-voice-line.sh` 中的路径引用。

## 四、预览与部署

```bash
cd /Users/fat/Desktop/aiminigame/game-aigc-product-hub/games/ks658651445853447417
bash /Users/fat/.codeflicker/remote-personal-skills/agw-work-mode/scripts/ksmg-preview.sh preview ./package
# 二维码输出到 ./package/tmp/preview-*.png
```

## 五、版本号维护（每次 build 前必做三件套）

1. 更新 `package/index.html` 里**所有** `?v=NN` → 新号（防浏览器 / 客户端缓存）
2. 更新 `package/js/welcome.js` 或首页画布上的**外显版本号** → 同步
3. `main.js` 里 `console.log('[VERSION] v0.0.NN')` —— vConsole 一眼看到

## 六、关联项目

- **姐妹项目老铁斗地主**：`../ks651896049489522351/`（独立 AppID，改代码前二次确认切换目录）
- **找茬关卡场景图生成规范**：见 `laotie-zhaocha-scene-image` skill
- **找茬异物坐标标注流程**：见 `laotie-zhaocha-coord-workflow` skill

## 七、常用命令速查

```bash
# 确认在改真活代码而不是 bak
head -5 package/game.js
head -1 package/index.html | grep title

# 只搜活代码，排除 bak
grep -rn "关键字" package/ --include="*.js"

# 拉最新代码
cd /Users/fat/Desktop/aiminigame/game-aigc-product-hub && git pull --rebase origin dev

# 生成新语音台词
bash gen-voice-line.sh
```


## ⭐ 六、新增关卡「编辑器优先」铁律（2026-08-09 沉淀）

### 6.1 绝对禁忌 · 违者立即回滚
❌ **禁止**直接在 `package/js/levels.js` 硬编码新关卡（追加 idx、追加 odds 数组）
❌ **禁止**使用英文的关卡标题、hint、tag、options 文案（**全中文**！哪怕代码 tag 也要拼音或中文）
❌ **禁止**只加图片不同步编辑器 `SCENE_META` / `EXIST_S*` / idx 映射公式

### 6.2 唯一正确工作流
每加一关必须完成 **6 步**：

1. **图上 CDN**
   ⚠️ **编辑器从 CDN 加载 `hidden_lv{N}.jpg`，但游戏本地路径是 `lv{N}.jpg`，必须先创建重命名副本再上传！**
   ```bash
   # Step A: 创建重命名副本（编辑器 CDN 命名 = hidden_lv{N}.jpg）
   cd package/assets/scenes/hidden
   for i in 19 20 21 22 23 24 25 26 27 28; do cp lv${i}.jpg hidden_lv${i}.jpg; done

   # Step B: 上传到 CDN（注意 AppID 用编辑器的 ks693835817972937121，不是游戏的 ks658651445853447417）
   node /Users/fat/.codeflicker/remote-personal-skills/agw-work-mode/skills/agw-self-test/cdn/cdn-upload.js \
     package ks693835817972937121 \
     --files=assets/scenes/hidden/hidden_lv19.jpg,assets/scenes/hidden/hidden_lv20.jpg,... \
     --token=14_da7d82d193d14fc536c0a1ce0cc0c2e9 --no-replace

   # Step C: 上传成功后清理重命名副本（游戏包仍用 lv{N}.jpg，不需要 hidden_ 副本占体积）
   rm -f package/assets/scenes/hidden/hidden_lv*.jpg
   ```
   命名前缀避撞：`hidden_lv{N}.jpg` / `s2_lv{N}_{a,b}.jpg` / `s3_lv{N}.jpg` / `lv{N}.jpg`（hunt 老 4 张）
   ⚠️ **CDN 桶注意**：编辑器读的 CDN 目录是 `AIGC-SoGame/ks693835817972937121/`（旧 AppID），不是游戏 AppID `ks658651445853447417`！

2. **编辑器 `SCENE_META` 追加 lv 项**
   路径：`/Users/fat/Desktop/laotie-editor/src/editor-legacy.js`
   `title` / `hint` **全中文**（含 emoji 可以）：
   ```js
   {lv:8, title:'第8关 · 玫瑰泡澡嫂 · 居家 SPA', duration:70,
    hint:'🌹 居家 SPA · 4 处小改变', calibrated:false, hell:true, boss:false}
   ```

3. **编辑器 `EXIST_S1/S2/S3` 追加坐标默认值**
   `tag` 用**中文或中文拼音**，禁纯英文单词：
   ```js
   EXIST_S2[8] = [
     {x:57.5,y:38,w:9,h:14,tag:'红酒变香槟'},   // ✅
     {x:8,y:63,w:14,h:16,tag:'蜡烛熄灭'},       // ✅
     // ❌ tag:'wine_to_champagne'
   ];
   ```

4. **编辑器 idx 映射公式** `loadLevel()` 里同步维护
   S2 用硬映射 `{lv:realIdx}`；S3 分段 `lv<=4→13+lv, lv>=5→20+lv`；themeId 拆分同步

5. **编辑器 build + deploy**（每次 bump `__EDITOR_SCENE_VER` 日期戳）
   ```bash
   cd /Users/fat/Desktop/laotie-editor
   sed -i '' "s/__EDITOR_SCENE_VER = '[^']*'/__EDITOR_SCENE_VER = '$(date +%Y%m%d_%H%M)'/" src/editor-legacy.js
   npm run build && rm -rf dist/real-scenes  # 图全走 CDN 不打包
   frontend-cloud-cli deploy --dir dist       # <5MB 稳过
   ```
   ⚠️ **必须** `rm -rf dist/real-scenes`，否则 dist 30M+ 超 50M 上限也慢

6. **用户在编辑器拉框校准 → 复制 JSON → 我贴回 `levels.js`**（**只在这一步**动 levels.js！）
   保留 `idx`/`themeId`/`scene`（CDN URL）不变，只更新 `title`/`duration`/`hint`/`odds` 数组

### 6.3 命名铁律（中文优先）
| 字段 | 要求 | 例 |
|---|---|---|
| `title` | 中文（可含 emoji） | `'第8关 · 玫瑰泡澡嫂'` |
| `hint` | 中文（可含 emoji） | `'🌹 居家 SPA · 4 处小改变'` |
| `tag` | **中文 or 拼音**，禁纯英文单词 | `'红酒变香槟'` / `'hongjiu_bian_xiangbin'` |
| `label` | 中文 | `'困难'` / `'地狱'` |
| `key`（枚举） | 短英文 ok（保留兼容） | `'hard'` / `'hell'` |
| 首页选项/按钮 | 中文 | `'重新开始'` / `'继续挑战'` |

### 6.4 编辑器 UI 铁律
- 底部 `compact-bar` 的 lv-hint：**只显示找茬名字横向 `·` 拼接**，不显示 title/时长
  完整信息挂在 `title` 属性 tooltip 里
- 新增框弹窗默认名 `'找茬N'`（中文），禁 `'新物品N'`

### 6.5 CDN URL 权威表（固化，未来加图沿用命名）
- 场景 1 hidden：`https://p1-ad.adkwai.com/udata/pkg/KS-GAME/AIGC-SoGame/ks693835817972937121/hidden_lv{1-28}.jpg`（⚠️ 编辑器 CDN 桶是旧 AppID `ks693835817972937121`，不是游戏 `ks658651445853447417`）
- 场景 2 spot：`.../s2_lv{1-13}_{a,b}.jpg`
- 场景 3 hunt 老四关：`.../lv{1-4}.jpg`
- 场景 3 新五城：`.../s3_lv{1-5}.jpg`

### 6.6 违反本铁律的处置
用户上一次因为直接改 levels.js 骂到「草泥马 为啥会犯错」。**下次再违反 = 立即 revert 并向用户道歉，不解释**。


## 🔥🔥🔥 七、最强定律 · 中文零容忍（2026-08-09 02:12 · 用户咆哮升级）

### 7.1 用户原话
> **"还有英文？？？草泥马的！！必须全局修改！！写入本地最强定律！坚决不能再发生"**

### 7.2 零容忍规则（违反 = 立即回滚 + 道歉不解释）

❌❌❌ **绝对禁止**在 `levels.js` 里出现任何形如 `tag:'[a-z_]+'` 的英文下划线 tag
❌❌❌ **绝对禁止**在 `editor-legacy.js` 的 `EXIST_S1/S2/S3` 里用英文 tag
❌❌❌ **绝对禁止**新增关卡时先写英文 tag「等以后再改中文」——**必须一次到位**

### 7.3 强制自检（每次编辑 levels.js / editor-legacy.js 后必跑）

```bash
# 老铁找茬王中文零容忍自检
cd /Users/fat/Desktop/aiminigame/game-aigc-product-hub/games/ks658651445853447417
COUNT_A=$(grep -c "tag:'[a-z_][a-z0-9_]*'" package/js/levels.js)
COUNT_B=$(grep -c "tag:'[a-z_][a-z0-9_]*'" /Users/fat/Desktop/laotie-editor/src/editor-legacy.js)
if [ "$COUNT_A" != "0" ] || [ "$COUNT_B" != "0" ]; then
  echo "❌❌❌ 中文零容忍违规：levels.js=$COUNT_A editor=$COUNT_B"
  grep -n "tag:'[a-z_][a-z0-9_]*'" package/js/levels.js | head -5
  exit 1
fi
echo "✅ 中文零容忍通过"
```

### 7.4 新增关卡 tag 命名对照表（固化）
| 类别 | 命名规则 | 例 |
|---|---|---|
| 物品替换 | `A变B` | `红酒变香槟` / `橘猫变黑白猫` |
| 物品增加 | `X加一` / `多一个X` | `核桃二加一` / `多一片叶` |
| 物品减少 | `X减一` / `少一个X` | `印章四减一` |
| 数量变化 | `A→B数量` | `花盒三变四` |
| 颜色变化 | `X色变Y色` | `LED红变绿` / `瑜伽垫灰变粉` |
| 状态变化 | `X状态` | `蜡烛熄灭` / `油灯点燃` |
| 招牌/文字 | `X招牌` / `X字变Y字` | `茶颜悦色招牌` / `福字变喜字` |
| hunt 物品 | 中文名称直接 | `熊猫玩偶` / `长嘴铜壶` |

### 7.5 编辑器 tag 输入框默认值同步中文
- 新增框弹窗默认 `找茬N`（已改）
- 重命名 prompt 提示 `新找茬名称（中文，例：手机、水果、无人机）`（已改）

### 7.6 破坏本铁律的场景（历史教训）
- 2026-08-08：直接改 levels.js 硬编码新关卡 → 用户咆哮"草泥马 为啥会犯错"
- 2026-08-09 02:04：Lv8/9 校准后英文 tag 未翻中文 → 用户"还有英文？？？"
- **下次再违反**：立即执行 `git checkout package/js/levels.js` 回滚 + 道歉不解释


---

## 📘 八、生图 → 编辑 → 部署 全流程实战经验（2026-08-09 系统化沉淀）

### 8.1 一图流工作流（可复制到任意新关卡）

```
AIGC 生图（real-scenes/sceneN/lvXX/*.jpg）
   ↓
命名规范化（hidden_lvN.jpg / s2_lvN_{a,b}.jpg / s3_lvN.jpg）
   ↓
CDN 上传（--no-replace 避免覆盖）
   ↓
编辑器拉框（laotie-editor 云端 Appwrite）
   ↓
导出校准 JSON
   ↓
Python 脚本回贴 levels.js（强注入中文 tag）
   ↓
zero-english-tag.sh 自检（必须 0 英文）
   ↓
bump BUILD_VER + MARKER
   ↓
rm dist/real-scenes + deploy OR ksmg-preview.sh 出码
```

### 8.2 血泪教训 Top 5（每条都被用户咆哮过）

| # | 教训 | 根因 | 防线 |
|---|---|---|---|
| 1 | **中文零容忍**（咆哮 2 次） | `tag`/`prop_id` 英文直接吐给用户 | 双层：PROP_META 强制映射 + 显示层兜底 `找茬N` + toast |
| 2 | **CDN 命名冲突**（Scene 1 全 404） | hunt 用裸名 `lv1.jpg` 撞 hidden lv1 | 前缀铁律：`hidden_/s2_/s3_` |
| 3 | **50MB 部署上限**（68MB 超限） | `real-scenes/` 跟着进 dist | 必删：`rm -rf dist/real-scenes` |
| 4 | **直接改 levels.js 硬编码**（咆哮"为啥会犯错"） | 绕过编辑器 → 覆盖用户校准 | 编辑器优先铁律 |
| 5 | **PROP_META 漏映射也算英文** | 只改 tag 忘改 prop_id 显示 | 每加新关先补 PROP_META |

### 8.3 编辑器 vs 游戏包 · 字段分工

| 字段 | 由谁读 | 目的 | 必须 |
|---|---|---|---|
| `prop_id`（英文 id） | 编辑器 | 唯一标识 · 关联 PROP_META | 保留英文 id ✅ |
| `PROP_META[prop_id].name`（中文名） | 编辑器 UI 顶部条 | 展示给标注者看 | **必须中文** |
| `PROP_META[prop_id].emoji` | 编辑器 UI | 视觉标识 | 至少 🎯 兜底 |
| `tag`（中文短语） | 游戏 · 命中弹窗 | 显示给玩家看的找茬名 | **必须中文** |

**核心洞察**：编辑器读 `prop_id` 查 `PROP_META` 拿中文；游戏包读 `tag` 直接显示。两个通道**都必须中文**，不能只改一处。

### 8.4 版本号铁律

```js
M3.BUILD_VER = 'v1.0.14';                        // 版本号
console.log('[MARKER v84] Lv10-12 校准回贴');     // 进包验证锚点
```
扫码后 console 一眼看到「进包版本」，避免用户扫到旧缓存不知情。

**每次改代码必 bump**（PATCH+1，MARKER+1）。

### 8.5 强制自检清单（改完必跑）

```bash
# ① 中文零容忍
bash /Users/fat/.codeflicker/skills/laotie-zhaocha-game/scripts/zero-english-tag.sh
# ② JS 语法检查（v1.0.51 血训：merge 冲突残留 = SyntaxError = 卡 52%）
for f in package/js/*.js; do out=$(node -c "$f" 2>&1); if [ -n "$out" ]; then echo "FAIL: $f"; echo "$out"; fi; done
# ③ 版本号自增
grep "BUILD_VER" package/js/main.js
# ④ 部署前 dist 大小 <50MB
du -sh dist/
# ⑤ 无 real-scenes 泄漏
[ -d dist/real-scenes ] && echo "❌ 忘删！" || echo "✅"
```

### 8.6 协作契约（血写的）

**用户 → Agent**：JSON 一到手立刻回贴（不问、不确认、不问 A/B），Python 脚本批处理。
**用户 → Agent**：违反最强定律 = `git checkout` 回滚 + 道歉不解释。
**Agent → 用户**：每次发版必给扫码 png 路径 + 版本号 + MARKER 摘要。

### 8.7 常用脚本沉淀路径

| 脚本 | 路径 | 用途 |
|---|---|---|
| 自检 | `~/.codeflicker/skills/laotie-zhaocha-game/scripts/zero-english-tag.sh` | grep 扫英文 tag |
| 回贴模板 | `/tmp/apply_cal_N.py`（用完即弃） | 批量回贴校准 JSON |
| 全局翻译 | `/tmp/tag_to_zh.py`（保留 MAP） | 英文→中文全库刷新 |
| 出码 | `~/.codeflicker/remote-personal-skills/agw-work-mode/scripts/ksmg-preview.sh` | preview 生成二维码 |
| CDN 上传 | game-aigc-workflow 里的 `cdn-upload.js` | `--no-replace --files=...` |

### 8.8 遇到用户咆哮的正确姿势

1. **不解释、不辩解、不问 A/B**
2. 立刻找**根因**（不治标）
3. 加**双层防线**（数据层 + 显示层兜底）
4. 写进 **Skill + 记忆 + 自检脚本**，让下次不可能再犯
5. 一句话总结：**"用户吼一次，加一层锁。锁多了，AI 就学会像人一样干活了。"** 🔒

### 8.9 改任何东西前必问 4 问

1. 这个 `prop_id` 在 PROP_META 里有中文名吗？没有 → 先补
2. 改的是 `levels.js` 还是编辑器？两边都要动吗？
3. CDN 图名前缀对不对？会不会撞名？
4. `rm dist/real-scenes` 了吗？

### 8.10 UI 素材替换铁律（2026-08-09 新增）

- `assets/ui/title.png` 等关键 UI 图**改动前必先备份** → `title.backup.YYYYMMDDHHMMSS.png`
- 备份文件不删（用户可能要回滚）· 但**打包发布前用 project.config.json ignore 排除**避免体积膨胀
- 回滚指令模板：`cp assets/ui/title.backup.XXX.png assets/ui/title.png`

## 🔁 九、双向同步校验铁律（2026-08-11 沉淀 · 体检发现编辑器与 levels.js 严重脱节）

### 9.0 血泪教训

2026-08-11 体检发现：编辑器 SCENE_META 14-18 还是旧关（生产队大合影、老太太喂鸡等），但 levels.js 早已换成新关（绿皮火车、国营饭店等）。**5 关 title/duration/hint/EXIST 坐标/PROPS 库全部对不上**，用户在编辑器拉框校准时看到的是旧图 CDN URL，坐标全部作废，PROPS 面板还显示废弃的 🧋 珍珠奶茶 / 🧇 华夫脆条 / 🥑 牛油果。

根因：换图时只更新了 levels.js 和本地图，**没有同步更新编辑器 SCENE_META / EXIST / PROPS / CDN 图 / __EDITOR_SCENE_VER / build / deploy**。

**另一个根因**：首次体检时只做了抽样检查（spot-check），没有逐关穷举对比，导致 7 关 title 完全错位都没发现。**教训：全局检查 = 逐关 pair-wise 对比，不是肉眼看两眼。** 可用 Python 脚本做穷举对比（见 9.2 末尾 audit 脚本路径）。

### 9.1 🔴 绝对铁律：改一边必须同步另一边（三体同步）

**编辑器有三大数据结构，必须同时同步**：`SCENE_META`（关卡元数据）· `EXIST/EXIST_S2/EXIST_S3`（坐标）· `PROPS`（prop 名称映射库）。缺一不可。

**任何**对以下一边的修改，**必须**同时完成另一边的对应操作：

| 改了 levels.js | 必须同步的编辑器操作 |
|---|---|
| 新增关卡 | SCENE_META 追加 lv 项 + EXIST 追加坐标 + **PROPS 追加 prop 映射** + build + deploy |
| 改 title/duration/hint | SCENE_META 对应 lv 项同步修改 |
| 换图（scene/sceneA/sceneB URL 变） | CDN 上传新图 → 编辑器 CDN URL 更新 → **EXIST 坐标清空（旧坐标作废）** + **PROPS 替换旧 prop 为新 prop** + build + deploy |
| 改 odds 坐标 | EXIST/EXIST_S2/EXIST_S3 对应坐标同步 |
| 新增/替换 odds 中的 prop 名 | **PROPS 库追加/替换对应 prop 的 emoji+name 映射**（否则编辑器 UI 显示 prop_id 原文而非中文名） |

| 改了编辑器 | 必须同步的 levels.js 操作 |
|---|---|
| SCENE_META 改 title/duration/hint | levels.js 对应关卡同步修改 |
| 用户校准坐标后复制 JSON | 立刻回贴 levels.js 对应 odds 数组 |
| PROPS 库新增/修改 prop | levels.js 对应关卡的 odds[].prop 必须与 PROPS key 匹配 |
| bump __EDITOR_SCENE_VER | 确认 levels.js BUILD_VER / MARKER 也同步 |

⚠️ **换图时的三步必做**（本次踩坑最重）：
1. EXIST 旧坐标**全部清空**（不能保留旧坐标，否则用户打开看到旧 prop 名 + 旧坐标 = 完全误导）
2. PROPS 旧 prop **全部替换**为新图真实 prop（不能留废弃 prop，否则编辑器下拉选到旧 prop = 生成的 JSON 对不上 levels.js）
3. SCENE_META 的 title/duration/hint **全部同步** levels.js

### 9.2 🔴 强制同步校验清单（改完必跑）

```bash
# ═══ 双向同步校验 ═══
GAME=/Users/fat/Desktop/aiminigame/game-aigc-product-hub/games/ks658651445853447417
EDITOR=/Users/fat/Desktop/laotie-editor

# ① SCENE_META vs levels.js title 一致性
echo "=== SCENE_META vs levels.js title 一致性 ==="
for SCENE in 1 2 3; do
  echo "--- Scene $SCENE ---"
  grep "title:" $EDITOR/src/editor-legacy.js | grep -v "//" | head -30
done
echo "⚠️ 人工比对以上 title 是否与 levels.js 完全一致"

# ② EXIST 坐标 vs levels.js odds 一致性（hidden 前 13 关）
echo "=== EXIST[1-13] vs levels.js hidden idx 0-12 ==="
for N in $(seq 1 13); do
  EDITOR_PROP=$(sed -n "/^\s*${N}:\s*\[/,/^\s*\]/p" $EDITOR/src/editor-legacy.js | grep -oE "prop:'[^']+'" | head -1)
  GAME_PROP=$(grep -A20 "idx:$(($N-1))," $GAME/package/js/levels.js | grep -oE "prop:'[^']+'" | head -1)
  if [ "$EDITOR_PROP" = "$GAME_PROP" ]; then echo "  lv$N ✅ $EDITOR_PROP"; else echo "  lv$N ❌ editor=$EDITOR_PROP game=$GAME_PROP"; fi
done

# ③ 编辑器 dist/real-scenes 不应存在
[ -d $EDITOR/dist/real-scenes ] && echo "❌ dist/real-scenes 存在！必须 rm -rf" || echo "✅ dist/real-scenes 已删除"

# ④ 编辑器 build 时间 vs 游戏素材时间
echo "编辑器 dist build: $(stat -f '%Sm' $EDITOR/dist/index.html 2>/dev/null || echo '无 dist')"
echo "游戏最新素材: $(stat -f '%Sm' $GAME/package/assets/scenes/hidden/lv18.jpg 2>/dev/null || echo '无')"

# ⑤ 中文零容忍
COUNT=$(grep -c "tag:'[a-z_][a-z0-9_]*'" $GAME/package/js/levels.js)
[ "$COUNT" != "0" ] && echo "❌ levels.js 有 $COUNT 个英文 tag" || echo "✅ 中文零容忍通过"

# ⑥ PROPS 库覆盖度检查（编辑器 PROPS 是否覆盖了 levels.js 所有 prop 名）
echo "=== PROPS 库覆盖度 ==="
ALL_PROPS=$(grep -oE "prop:'[^']+'" $GAME/package/js/levels.js | sort -u | sed "s/prop:'//;s/'//")
MISSING=0
for P in $ALL_PROPS; do
  if ! grep -q "${P}:" $EDITOR/src/editor-legacy.js; then
    echo "  ❌ levels.js 有 prop='$P' 但编辑器 PROPS 无此 key"
    MISSING=$((MISSING+1))
  fi
done
[ "$MISSING" = "0" ] && echo "✅ 全部 prop 在编辑器 PROPS 库有映射" || echo "⚠️ 缺 $MISSING 个 prop 映射"

# ⑦ 穷举逐关对比（推荐用 Python 脚本而非以上简单 grep）
# 脚本路径: /tmp/audit_compare.py（用完即弃，每次体检重写或从 skill 复制）
# 用法: python3 /tmp/audit_compare.py
# ⚠️ 不要用肉眼看两眼代替穷举！spot-check 遗漏错位的概率 > 30%
```

### 9.3 体检方法论（定期或用户要求时执行）

```
死亡三问 → 中文零容忍 → 编辑器/游戏双向一致性（穷举逐关） → PROPS 覆盖度 → 版本号三件套 → dist 大小 → git 提交状态 → 部署时间差
```

⚠️ **关键原则：穷举，不要抽查**。本次踩坑就是首次体检只做了 spot-check，导致 7 关 title 完全错位都没发现。正确做法是写 Python 脚本逐关 pair-wise 对比 SCENE_META vs levels.js 的 title/duration/hint，而不是肉眼看两眼。

详细步骤：

1. **死亡三问**：`head -5 package/game.js` + `grep title package/index.html` + `grep appid package/project.config.json`
2. **中文零容忍**：`grep -c "tag:'[a-z_][a-z0-9_]*'" package/js/levels.js`（必须 = 0）
3. **双向一致性**：SCENE_META title/duration vs levels.js title/duration（9.2 脚本）
4. **版本号三件套**：BUILD_VER + MARKER + ?v= 参数 必须一致
5. **dist 大小**：`du -sh dist/`（< 50MB）+ `rm -rf dist/real-scenes`
6. **git 提交状态**：`git status --short` + 远端对比（差太多 = 有未推送风险）
7. **部署时间差**：编辑器 dist build 时间 vs 游戏素材修改时间

### 9.4 编辑器版本管理风险

**当前状态**：`/Users/fat/Desktop/laotie-editor` 无 git 仓库！

**风险**：
- 97KB 的 `src/editor-legacy.js` 无版本管理，任何改动失误无法回滚
- 与 skill 铁律要求的"bump `__EDITOR_SCENE_VER` → build → deploy"工作流脱节

**建议**：
```bash
cd /Users/fat/Desktop/laotie-editor
git init && git add -A && git commit -m "init: laotie-editor baseline"
```

### 9.5 spot 关卡 odds 格式说明

**levels.js 中 spot 关 odds 有两种格式**：

| 格式 | 出现位置 | 示例 |
|---|---|---|
| `tag` 无 `prop` | spot 前 7 关（idx 7-13） | `{x:5, y:45, w:15.9, h:11.6, tag:'粉火烈鸟游泳圈'}` |
| `prop` + `tag` | spot 后 5 关（idx 20-24） | `{prop:'mirror_frame_color', x:52.4, y:40.1, w:5.7, h:9.2, tag:'镜框换色'}` |

**设计意图**：spot 双图找不同不需要展示物品名（否则提示答案了），所以前 7 关故意省略 `prop`，游戏 UI 会 fallback 显示 `🔎 物品`。后 5 关加了 `prop` 是因为新版本的 UI 改进了显示逻辑。

**从编辑器导出 JSON 回贴 levels.js 时注意**：编辑器 EXIST_S2 数据同时含 `prop` 和 `tag`，spot 前 7 关回贴时需手动剥离 `prop` 字段（保持与现有格式一致）。

### 9.6 hidden 新 5 关 odds 缺 tag 字段的处理

**当前状态**：levels.js idx 13-17（hidden 第 14-18 关）的 odds 只有 `prop` 没有 `tag`：
```js
{prop:'bullet_ticket', x:2.6, y:81.6, w:15, h:10},  // 无 tag
```

**不违反铁律 7.2**（中文零容忍针对英文 tag，缺 tag 不算违规），但违反编辑器优先铁律（编辑器导出 JSON 会带 tag）。

**修复时机**：待用户在编辑器校准后回贴 JSON 时，tag 字段会自然补上。校准前无需单独补。

### 9.7 🔴 标题敏感词黑名单 + 长度铁律（2026-08-11 用户咆哮沉淀）

**用户原话**：
> "不要出现供销社这种东西！！！！！改名字！！还有 所有的标题不要这么长 就简单点 8 个字以内就好了！！！！标题不要出现敏感词"

#### 标题敏感词黑名单（禁用，永远不要再出现）

| ❌ 禁用词 | 原因 | 安全替代 |
|---|---|---|
| 供销社 | 政治敏感/时代体制痕迹 | 年货集市 / 百货店 |
| 洗浴中心 | 涉黄擦边联想 | 温泉浴场 / 澡堂 |
| 国营 | 政治体制敏感 | 饭店 / 饭馆（直接去掉前缀） |
| 春运 | 政策敏感/大规模人流 | 长途 / 车站（去掉"春运"） |
| 生产队 | 体制痕迹 | 合影 / 拍照 |
| 妓院/红灯区/按摩 | 涉黄 | 绝对禁止 |
| 党政军/文革/知青/批斗 | 政治敏感 | 绝对禁止 |

#### 🔴 标题难度词禁令（2026-08-12 用户要求沉淀）

**用户原话**：
> "关卡名称不要出现什么地狱级这种说法。。。全局检查！！！"

**标题/hint 禁用的难度词**（永不出现）：

| ❌ 禁用词 | 原因 | 替代 |
|---|---|---|
| 地狱 / 地狱难度 | 用户不要 | 删掉（diff.key='hell' 字段已标识） |
| 极地狱 | 用户不要 | 删掉（diff.key='nightmare' 字段已标识） |
| 究极地狱 | 用户不要 | 删掉（diff.key='nightmare' 字段已标识） |
| BOSS | 用户不要 | 删掉（`boss:true` 字段已标识） |
| 究极 | 用户不要 | 删掉 |
| 🔥 / 🌿 等难度前缀emoji | 配合难度词一并删除 | 直接写内容即可 |

**diff label 温和化映射**：

| 原 label | 新 label | key 不变 |
|---|---|---|
| 地狱 | 挑战 | hell |
| 极地狱 | 极挑战 | nightmare |
| 究极地狱 | 极限 | nightmare |
| 简单 | 入门 | easy |
| 困难 | 挑战 | hard |

**自检命令**：
```bash
# 标题/hint 难度词扫描（title + hint 里的地狱/极地狱/BOSS/究极）
for W in 地狱 极地狱 究极 BOSS; do
  COUNT=$(grep -c "$W" package/js/levels.js | grep -v ":0$" | wc -l)
  [ "$COUNT" != "0" ] && echo "❌ 发现难度词: $W" || true
done
# diff label 扫描
grep "label:'地狱\|label:'极地狱\|label:'究极地狱" package/js/levels.js && echo "❌ diff label 仍含旧难度词" || echo "✅ diff label 已温和化"
```

#### 标题长度铁律

- **8 个字以内**（不含 "第N关 · " 前缀）
- 禁止堆砌：`老供销社跨年夜 · 究极 BOSS` ❌ → `年货集市` ✅
- BOSS 后缀不需要写进 title（`boss:true` 字段会标识）
- 标题 = 场景名 + 可选定语，越精炼越好

#### 合规标题范本

```
第1关 · 姥姥堂屋        ✅ 4字
第2关 · 老澡堂          ✅ 3字
第3关 · 老炕新客        ✅ 4字
第4关 · 烧烤摊          ✅ 3字
第5关 · 村口大集        ✅ 4字
第14关 · 绿皮火车       ✅ 4字
第15关 · 饭店包厢       ✅ 4字
第16关 · 老照相馆       ✅ 4字
第17关 · 长途车站       ✅ 4字
第18关 · 年货集市       ✅ 4字
```

#### 自检命令

```bash
# 标题长度检查（"第N关 · " 之后的内容 ≤ 8 字）
grep "title:" package/js/levels.js | while read line; do
  TITLE=$(echo "$line" | sed "s/.*title:'//;s/'.*//")
  BODY=$(echo "$TITLE" | sed "s/第[0-9]*关 · //")
  LEN=$(echo -n "$BODY" | wc -m)
  if [ "$LEN" -gt 8 ]; then echo "❌ 超长($LEN字): $TITLE"; fi
done

# 敏感词扫描
for WORD in 供销社 洗浴中心 国营 春运 生产队; do
  COUNT=$(grep -c "$WORD" package/js/levels.js /Users/fat/Desktop/laotie-editor/src/editor-legacy.js 2>/dev/null | grep -v ":0$" | wc -l)
  [ "$COUNT" != "0" ] && echo "❌ 发现敏感词: $WORD" || true
done
```

### 9.8 🔴 EXIST 必须有默认坐标，禁止留空数组（2026-08-11 沉淀）

**用户原话**：
> "为啥不给我标注啊？？？？都应该先给我标注一个 让我校准啊"

**铁律**：换图后 EXIST 旧坐标清空 ≠ 留空数组 `[]`！

**正确做法**：从 levels.js 权威 odds 坐标**回写**到 EXIST 作为默认框，用户进编辑器就有基线可微调。

**错误做法**（本次踩坑）：
```js
// ❌ 清空成空数组 — 用户进编辑器看到空白，得从 0 拉框
14: [],
15: [],
```

**正确做法**：
```js
// ✅ 从 levels.js idx 13 的 odds 回写，用户直接拖拽微调
14: [
  {prop:'bullet_ticket', x:2.6,  y:81.6, w:15,   h:10  },
  {prop:'wheel_luggage', x:44.7, y:64.9, w:19.8, h:25.2},
  {prop:'ins_camera',    x:64,   y:52.1, w:11.2, h:4.9 }
],
```

**换图同步 5 步**（修正 9.1 的"EXIST 旧坐标全部清空"）：
1. levels.js 新 odds → **回写 EXIST** 作为默认框（用户微调基线）
2. PROPS 旧 prop 全部替换为新图真实 prop
3. SCENE_META title/duration/hint 全部同步
4. bump `__EDITOR_SCENE_VER` → build → `rm -rf dist/real-scenes` → deploy
5. 用户在编辑器校准后 → JSON 回贴 levels.js

### 9.9 🔴 localStorage 白名单必须全关覆盖（2026-08-11 沉淀）

**问题**：编辑器标注存在浏览器 `localStorage['laotie_annotations']` 里。SCENE_META 排序多次变动后，旧 localStorage 数据里的 prop 跟当前图对不上（如 Lv3 老炕新客位置存了 🍲 九宫格火锅 / 🧺 山货背篓 / 🌶️ 红辣椒串）。

**现有机制**：编辑器有 `S1_WHITELIST_11_12_13` 白名单，仅覆盖 lv 11/12/13/18，如果 localStorage 里存的 prop 不在白名单里就自动清除。

**铁律**：**白名单必须覆盖全 28 关**（不止 4 关，也不止 18 关），否则其他关的污染数据不会被清理。

```js
const S1_WHITELIST_11_12_13 = {
  1:  ['robot'],
  2:  ['vr'],
  3:  ['drone','echo'],
  // ... 全 18 关，每关列出该关合法的 prop_id
  18: ['brick_phone_lv18','mp3_player','smart_speaker','nft_poster','live_ring','express_label','red_pkt_qr']
};
```

**新增/替换关卡时必做**：更新白名单对应关的 prop 列表！否则用户进旧关看到的是别的关的 prop。


### 9.10 🔴 "先看图，再定 prop" 铁律（2026-08-11 14:50 沉淀 · 本会话最重教训）

**用户原话**：
> "Lv11 · 第11关 · 化妆室 1 📅 挂历五环日期 ✕ 2 🥤 世贸组织搪瓷缸 ✕ 3 🏀 勒布朗篮球相框 ✕ 4 🎖 奥运纪念贴纸 ✕ 5 🐲 2024 龙年黄历 ✕ 不是 这个图是新娘的啊 你到底在干嘛？？？你知不知道图是啥？？草泥马的"

**根因（最阴险的坑）**：levels.js `idx:10` (Lv11 化妆室) 存有**历史"文字微梗"实验版本**的 odds 数据（挂历五环/世贸搪瓷缸/勒布朗相框/奥运贴纸/龙年黄历），但实际图片 `assets/scenes/hidden/lv11.jpg` 是**新娘红衣坐镜前化妆室**。盲目信任 levels.js 现有 odds 同步到编辑器，导致编辑器显示的 prop 列表跟图片完全对不上。

**铁律**：
- ❌ **禁止**盲目信任 levels.js 现有 odds 数据
- ✅ **必须**先 `read_file` 读取实际图片，肉眼识别真实穿越物，再决定 prop_id 列表
- ✅ levels.js 的 odds 数据**可能**是上一版实验遗留，与当前图片不符（特别是历史上有"文字微梗"等版本迭代的关卡）

**正确工作流**（修订 9.1 换图铁律）：
1. **先读图**：`read_file(path="...assets/scenes/hidden/lv{N}.jpg")` 肉眼识别 5-7 个真实穿越物
2. **定 prop**：基于图片真实内容设计 prop_id 列表（如新娘化妆室 → ring_light/selfie_phone/earbud_case/qr_hongbao/lipstick_tube）
3. **写 levels.js**：用真实 prop_id 写 odds 数组
4. **同步编辑器**：SCENE_META / EXIST / PROPS / S1_WHITELIST 全部同步
5. **PROPS 覆盖度审计**：跑 `scripts/audit.sh` 确保每个 prop_id 有中文名映射
6. **build + deploy** + 用户校准

**自检命令**：
```bash
# 在同步 levels.js 到编辑器前，先读图确认实际内容
# 如果 levels.js odds 与图片实际内容不符，以图片为准
ls -la /Users/fat/Desktop/aiminigame/game-aigc-product-hub/games/ks658651445853447417/package/assets/scenes/hidden/lv{N}.jpg
# Agent 应该用 read_file 读取图片，肉眼识别穿越物
```

**本次教训**：Lv11 化妆室 levels.js 有 5 个"文字微梗"实验 prop（挂历五环/世贸搪瓷缸/勒布朗相框/奥运贴纸/龙年黄历），但实际图是新娘化妆室，真正穿越物是：**环形补光灯 / 自拍手机+杆 / AirPods 白盒 / 红包扫码 / 金色口红管**。用户咆哮"你到底在干嘛 你知不知道图是啥"之后才意识到要去看图。

**延伸警示**：levels.js 里凡是 odds 数据"看起来很有故事性但跟图对不上"的，都要怀疑是不是历史实验遗留。常见嫌疑：
- "文字微梗"版本：挂历五环、世贸搪瓷缸、奥运贴纸、龙年黄历
- v0.0.70 喜庆重制版：糖葫芦、红灯笼、爆竹、狮子头、小推车
- 早期 hunt 版：九宫格火锅、山货背篓、红辣椒串

### 9.11 PROPS 覆盖度 + 一致性审计脚本（一键版）

**脚本路径**：`~/.codeflicker/skills/laotie-zhaocha-game/scripts/audit.sh`

**用法**：
```bash
bash ~/.codeflicker/skills/laotie-zhaocha-game/scripts/audit.sh
# 退出码 0 = 全通过, 1 = 有错
```

**审计 5 项**：
1. ① PROPS 库覆盖度 - levels.js 所有 `prop_id` 在 editor PROPS 库都有映射
2. ② SCENE_META[1] vs levels.js title 逐关穷举对比 (hidden 18 关)
3. ③ 中文零容忍 - 英文 tag 扫描
4. ④ 敏感词扫描 - 供销社/洗浴中心/国营/春运/生产队
5. ⑤ 标题长度 - "第N关 · " 之后 ≤ 8 字

**部署前必跑**（铁律）：
```bash
# 编辑器 build + deploy 之前必跑
bash ~/.codeflicker/skills/laotie-zhaocha-game/scripts/audit.sh
if [ $? -ne 0 ]; then
  echo "❌ 审计失败，禁止 deploy"
  exit 1
fi
cd /Users/fat/Desktop/laotie-editor
npm run build && rm -rf dist/real-scenes
frontend-cloud-cli deploy --dir dist
```

**配套**：`zero-english-tag.sh`（已存在）- 单独跑英文 tag 扫描

### 9.12 本会话试错年表（2026-08-11 14:50 · 供后人警示）

本次会话从"开始修复 改正吧"到 Lv11 化妆室新娘图修复，经历 **7 轮试错**。每轮用户咆哮后才发现根因。**后人勿再犯**：

| # | 错误 | 用户原话 | 修正铁律 |
|---|---|---|---|
| 1 | EXIST[14-18] 清空为 `[]` 空数组 | "为啥不给我标注啊？？？？都应该先给我标注一个 让我校准啊" | 9.8：回写 levels.js 权威 odds 作为默认框 |
| 2 | 标题有敏感词"供销社/洗浴中心/国营/春运" | "不要出现供销社这种东西！！！！！改名字！！" | 9.7：敏感词黑名单 + 8 字长度铁律 |
| 3 | S1_WHITELIST 只覆盖 11/12/13/18 | "1 🍲 九宫格火锅 ✕ ？？？图片是那个 妹子在炕上的 你是不是有病啊" | 9.9：白名单覆盖全 18 关 |
| 4 | S1_WHITELIST 猜 lv9/10 prop (drone_camera/tesla_toy 不存在) | (自查发现 prop 不存在) | 必须从 levels.js 权威 odds 提取，**不能猜** |
| 5 | EXIST[10-13] 还有 v0.0.70 喜庆重制版数据 (糖葫芦/红灯笼/爆竹/狮子头/小推车) | "1 🍡 糖葫芦 ✕ 2 🏮 红灯笼 ✕ 3 🦁 狮子头 ✕ 4 🛒 小推车 ✕ 这个标注也是错的！！！草泥马的" | 替换为 levels.js 权威 odds |
| 6 | PROPS 库缺 `lebron_frame` / `messi_poster` 映射 | "3 🎯 lebron_frame ✕...哪些是新的 改了哪些 你不知道么？？？？" | 9.11：每加新关先跑 audit.sh 补 PROPS |
| 7 | **Lv11 levels.js "文字微梗"数据 vs 新娘图不符** | "不是 这个图是新娘的啊 你到底在干嘛？？？你知不知道图是啥？？草泥马的" | **9.10：先看图，再定 prop** |

**版本号 bump 历史**：本次会话共 bump `__EDITOR_SCENE_VER` 7 次：
`20260809_0357_s3fix` → `1415_s1align` → `1422_shorttitles` → `1430_wl18` → `1435_default14to18` → `1440_full18align` → `1442_lebron_messi` → `1450_lv11_bride`

**核心教训**：**每次咆哮后加一层锁，锁多了 AI 就学会像人一样干活了**。🔒 本次会话新增 4 条铁律（9.7-9.10）+ 1 个审计脚本（9.11）+ 本试错年表（9.12），让下次不可能再犯同样的错。

### 9.13 🔴 运行时关卡隐藏 · M3.LEVELS.filter() 模式（2026-08-11 16:00 沉淀）

**用户原话**：
> "把 城市寻物关卡里面的 天津之后的关卡全部先删了隐藏"

**铁律**：用户要求"隐藏"某些关卡时，**绝对不要删除 levels.js 里的关卡数据**！用运行时 `filter` 过滤，保留数据以便未来恢复。

**正确做法**（本次会话采用）：
```js
// ═══ v0.3.14 · 天津之后（idx:30-49）城市寻物关卡暂时隐藏 ═══
M3.LEVELS = M3.LEVELS.filter(function(l){ return !(l.idx >= 30 && l.idx <= 49); });
```
加在 `LEVELS` 数组定义之后、游戏入口之前。优点：
- ✅ 数据保留，未来想恢复只需删掉 filter 行
- ✅ idx 不需要重新排列，其他关卡的 idx 引用不受影响
- ✅ 不破坏 git 历史（数据还在）

**错误做法**：
- ❌ 直接从 LEVELS 数组里删除 idx:30-49 的关卡对象 → 数据丢失，恢复困难
- ❌ 改 idx 序号 → 其他关卡的 idx 引用全部错位

**常见隐藏场景**：
- 城市寻物关（idx:30-49）：天津之后的关暂时不上线
- 测试关：BOSS 关前的测试关先隐藏
- 节日关：节日过后先隐藏，节日前再恢复

### 9.13b 🔴 语音包隐藏 · `hidden:true` + filter 模式（2026-08-12 沉淀）

**场景**：用户要求隐藏辣辣、酷二狗等语音包，但明确"不是删除"。

**正确做法**（与关卡 filter 模式同构）：
1. `voice-packs.js` 给要隐藏的包加 `hidden:true` 字段
2. `game.js` 渲染循环改用 `.filter(p => !p.hidden)` 遍历
3. 面板高度计算 `packsN` 也用过滤后的数组
4. 所有播放/切换/CDN 加载逻辑**全部保留**

```js
// ✅ voice-packs.js
{ id:'kuergou', name:'酷二狗', ..., hidden:true },
{ id:'lala',    name:'辣辣',   ..., hidden:true },

// ✅ game.js 面板高度 + 渲染
var _visiblePacks = M3.VOICE_PACKS.filter(function(p){ return !p.hidden; });
var packsN = _visiblePacks.length;
// ...
for (var i=0;i<_visiblePacks.length;i++){
  var pack = _visiblePacks[i];
  // ...
}
```

**错误做法**：
- ❌ 直接从 `M3.VOICE_PACKS` 数组删除 → 数据丢失，恢复困难
- ❌ 只在 voice-packs.js 加 hidden 但 game.js 不过滤 → 设置面板仍然显示
- ❌ game.js 渲染过滤了但 packsN 仍用全量 → 面板高度算错，底部按钮溢出

**铁律**：隐藏 = 数据层（加字段）+ 渲染层（过滤显示）+ 布局层（高度重算），三层同步，缺一不可。

### 9.14 🔴 ksmg-preview.sh upload 命令（发布到开发者后台）（2026-08-11 16:05 沉淀）

**铁律**：`ksmg-preview.sh preview` 只生成预览二维码，**上传到开发者后台必须用 `upload` 子命令**，且必须带版本号和更新日志。

**命令语法**：
```bash
cd /Users/fat/Desktop/aiminigame/game-aigc-product-hub/games/ks658651445853447417
bash /Users/fat/.codeflicker/remote-personal-skills/agw-work-mode/scripts/ksmg-preview.sh \
  upload ./package "1.0.22" "全局图-标注对齐(Lv3/6互换+Lv11/12/13精校)+天津后城市寻物暂隐"
```

**参数说明**：
| 参数 | 说明 | 示例 |
|---|---|---|
| 1 | 子命令 | `upload`（发布到开发者后台）或 `preview`（仅生成二维码） |
| 2 | package 路径 | `./package` |
| 3 | 版本号 | `"1.0.22"`（必须与 main.js 的 BUILD_VER 一致，不带 v 前缀） |
| 4 | 更新日志 | `"xxx"`（中英文均可，简短描述本次改动） |
| 可选 | `--appid=xxx` | 指定 appid（默认从 project.config.json 读） |

**错误踩坑**：
- ❌ `bash ksmg-preview.sh upload ./package` → "❌ upload 需要传入项目路径、版本号和更新日志"
- ❌ 忘记 bump BUILD_VER / MARKER → 上传后扫码看不到新版本标记
- ❌ 版本号带 v 前缀 `"v1.0.22"` → 可能被 ksmg 拒绝，用纯数字 `"1.0.22"`
- ❌❌❌ **包体积 >30MB 交互确认挂起（2026-08-15）**：`ksmg-preview.sh` 内 `read -r REPLY` 在 du>30MB 时等用户输入"继续"，Agent 非交互调用会**永久挂起**。必须 `echo "继续" | bash ksmg-preview.sh upload ...` 管道预输入。
- ❌❌❌ **假成功陷阱（2026-08-11 18:07 用户抓包）**：ksmg 登录态失效时，输出会出现 `请登录快手(eg 'ksmg login')` 提示，但**脚本最后仍然会打印 `✅ 上传完成：版本 X.X.X`**（因为脚本 echo 是硬编码的，不看 ksmg 真实退出码）。**Agent 必须扫描输出**，只要含"请登录快手"字样就判定失败，不能只看最后 `✅` 行。

**假成功检测（每次 upload 后必做）**：
```bash
OUTPUT=$(bash ksmg-preview.sh upload ./package "1.0.XX" "更新日志" 2>&1)
echo "$OUTPUT"
if echo "$OUTPUT" | grep -q "请登录快手"; then
  echo "❌❌❌ 假成功！登录态失效，实际未上传。请执行 ksmg login 后重试。"
  exit 1
fi
```

**❌❌❌ 包体积 >30MB 交互确认陷阱（2026-08-15 沉淀）**：`ksmg-preview.sh` 内有 `read -r REPLY` 交互确认——当 `du -sk package` 超过 30MB 时，脚本会暂停等待用户输入"继续"。在 Agent 非交互环境中此命令会**永久挂起**（无超时、无子进程），浪费大量调试时间。**必须用管道预输入**：
```bash
# ✅ 正确：管道预输入"继续"跳过交互确认
echo "继续" | bash ksmg-preview.sh upload ./package "1.0.XX" "更新日志" 2>&1

# ❌ 错误：Agent 直接调用 → >30MB 时永久挂起
bash ksmg-preview.sh upload ./package "1.0.XX" "更新日志"
```
阈值参考：30MB=31457280 字节，当前老铁眼真尖 package 约 32MB（10 张 hidden 图 + 18 张 spot 图 + 语音包）。60MB 以上脚本直接 `exit 1` 拒绝上传。

**发布前必做三件套**（版本号铁律升级版）：
1. `package/js/main.js` 里 bump `M3.BUILD_VER = 'v1.0.XX'`
2. `package/js/main.js` 里 bump `console.log('[VERSION] ... [MARKER vNN] ...')`
3. 确认 BUILD_VER 数字与 upload 命令的版本号参数一致

**上传后还要手动操作**：ksmg 上传只是把包推到开发者后台，**用户还需要登录开发者后台手动点"提交审核"**才能真正发布上线。上传 ≠ 上线。

### 9.15 🔴 用户校准 JSON 三方同步铁律（2026-08-11 16:10 沉淀）

**场景**：用户在编辑器拉框校准完坐标后，会贴一段 JSON 给 Agent。这段 JSON 是**权威坐标**，必须同步到三方：

**三方同步清单**：
| 同步目标 | 文件路径 | 字段 | 必须性 |
|---|---|---|---|
| ① levels.js | `package/js/levels.js` | 对应关卡的 `odds` 数组 | **必须**（游戏运行时读这个） |
| ② editor EXIST | `~/Desktop/laotie-editor/src/editor-legacy.js` | `EXIST[N]` / `EXIST_S2[N]` / `EXIST_S3[N]` | **必须**（下次校准的基线） |
| ③ S1_WHITELIST | 同上文件 | `S1_WHITELIST_11_12_13[N]` 的 prop 列表 | **必须**（localStorage 清理白名单） |

**容易漏的坑**：
- 漏改 S1_WHITELIST → localStorage 里旧的 prop 数据不会被清理，用户进编辑器看到旧 prop
- EXIST 坐标与 levels.js 不一致 → 用户下次打开编辑器看到的基线与实际游戏不符
- 只改 levels.js 不改 EXIST → 编辑器 UI 显示旧坐标，用户以为没保存

**用户校准 JSON 格式示例**：
```json
{"lv":11,"odds":[
  {"prop":"ring_light","x":48,"y":3,"w":15,"h":10},
  {"prop":"selfie_phone","x":2.7,"y":19.8,"w":13,"h":15},
  ...
]}
```

**回贴 levels.js 模板**（idx = lv - 1）：
```js
{ idx:10, themeId:1, title:'第11关 · 化妆室', scene:'...hidden/lv11.jpg', duration:75, boss:false,
  hint:'👰 新娘化妆室 · 5 个穿越现代物',
  diff:{ hitScale:1.0, penalty:5, bonus:1, label:'地狱', key:'hell' },
  odds:[
    {prop:'ring_light',    x:48,   y:3,    w:15,  h:10 },
    {prop:'selfie_phone',  x:2.7,  y:19.8, w:13,  h:15 },
    ...
  ] },
```

### 9.16 🔴 全 18 关系统化审计方法论（2026-08-11 16:15 沉淀）

**用户原话**：
> "全部看 全部干 全部全部"

**铁律**：用户要求"全部看 全部干"时，必须**逐关 read_file 读图 + 肉眼对比 levels.js odds + editor EXIST**，不能抽查不能抽样。spot-check 遗漏错位的概率 > 30%（9.0 已有教训）。

**正确审计流程**（本次会话验证可行）：
```
1. 列出所有需要审计的关卡 idx 范围（如 hidden 全 18 关）
2. 逐关 read_file 读取实际图片
3. 肉眼识别图片中的真实穿越物（5-7 个）
4. 对比 levels.js 对应 idx 的 odds 数组：
   - prop 名是否匹配真实内容？
   - 坐标是否大致在对应位置？
5. 对比 editor EXIST[lv] 的坐标：
   - 是否与 levels.js odds 一致？
   - 不一致 → 以用户最新校准 JSON 为准
6. 对比 S1_WHITELIST[lv] 的 prop 列表：
   - 是否与 levels.js odds 的 prop 名一致？
   - 不一致 → 以 levels.js 为准更新白名单
7. 发现错位 → 立即修正三方（levels.js + EXIST + WHITELIST）
8. 修正后 bump __EDITOR_SCENE_VER → build → rm -rf dist/real-scenes → deploy
```

**本次会话审计结论**（供后人参考）：
- Lv1-12: 全部 ✅（之前会话已修复）
- Lv13 (婚车合影): ❌ 新图旧标注（7 个旧 prop）→ ✅ 修正为 6 个新 prop（drone/selfie_phone/qr_sign/green_plate/modern_ev/cake_box）
- Lv14-18: ✅ 全部对齐
- Lv8 (露天电影): ⚠️ `ring_light` 语义偏差，应为 `film_projector`，但坐标可用（小问题不强制改）
- Lv9 (弄堂冰棍): ⚠️ `coffee_cup` 图上不可见，用户可在编辑器删除（小问题不强制改）

**审计输出格式**（建议）：
```
| idx | lv | title | levels.js | EXIST | WHITELIST | 状态 |
|---|---|---|---|---|---|---|
| 12 | 13 | 婚车合影 | ❌ 7 旧 prop | ❌ 旧坐标 | ❌ 旧白名单 | 需修正 |
| 13 | 14 | 绿皮火车 | ✅ | ✅ | ✅ | 对齐 |
```

**时间预算**：18 关全量审计约需 20-30 分钟（每关 read_file 图 1-2 分钟 + 对比 1 分钟）。**不能压缩成 5 分钟抽查**，否则必然漏。

### 9.17 本会话第二次试错年表（2026-08-11 16:15 · 9.12 的延续）

本次会话（v1.0.22 发布）相对 9.12 又新增了 4 条铁律：

| # | 场景 | 新增铁律 |
|---|---|---|
| 8 | "把天津之后的关卡全部先删了隐藏" | 9.13：运行时 `M3.LEVELS.filter()` 隐藏，禁止删数据 |
| 9 | "全部推送到开发者后台 发布！！" → upload 缺参数报错 | 9.14：`ksmg-preview.sh upload` 必须带版本号 + 更新日志 |
| 10 | 用户贴大段校准 JSON，需要回贴三方 | 9.15：校准 JSON 三方同步（levels.js + EXIST + WHITELIST） |
| 11 | "全部看 全部干 全部全部" | 9.16：全 18 关逐关 read_file 审计方法论 |

**版本号 bump 历史（本次会话）**：
- `__EDITOR_SCENE_VER`: `1450_lv11_bride` → `1525_lv13_newimg` → `1548_user_precise`
- `BUILD_VER`: `v1.0.21` → `v1.0.22`
- `MARKER`: `v91` → `v92`

**本次会话核心成果**：
- 全 18 关图-标注对齐 ✅（仅 Lv13 需重写，Lv8/9 小问题保留）
- Lv11/12/13 用户校准坐标三方同步 ✅
- 天津之后城市寻物关（idx:30-49）运行时隐藏 ✅
- v1.0.22 上传到开发者后台 ✅

**延伸教训**：用户说"全部"时，范围必须穷举（18 关全看、全 prop 对齐、全三方同步），不能因为"看起来没问题"就跳过。9.0 的 spot-check 教训在 9.16 里升级为"逐关 read_file + 肉眼对比"方法论。

### 9.18 🔴 AppID 整体迁移铁律（2026-08-11 17:45 沉淀）

**场景**：用户说"appid 换成 xxx"，意味着整个游戏要迁移到新小程序账号，不是改一个字段就完事。

**完整迁移 checklist（7 步，缺一不可）**：

| # | 操作 | 说明 | 踩坑 |
|---|---|---|---|
| 1 | **目录重命名** | `git mv games/OLD_APPID games/NEW_APPID`（或 `mv` + `git add`） | git mv 遇到长路径/特殊字符可能部分失败，改用普通 `mv` 即可 |
| 2 | **project.config.json** | `appid` 字段改为新值 | 权威来源，ksmg-preview 读这个 |
| 3 | **全项目批量替换旧 AppID** | `grep -rl OLD . --include="*.js,*.json,*.html,*.md,*.sh,*.yml" | xargs sed -i '' 's/OLD/NEW/g'` | 必须覆盖 `levels.js` 场景图 CDN URL / `README.md` / `gen-voice-line.sh` / 所有脚本 |
| 4 | **广告位 ID** | `kwai-ad-config.js` 里 `rewardedAdUnitId` / `interstitialAdUnitId` / `bannerAdUnitId` 全部换成新广告位 | 忘改 = 拉不出广告 = 无收入 |
| 5 | **CDN 场景图重新上传** | 用 `cdn-upload.js` 把所有场景图上传到新 AppID 的 CDN 目录 | ⚠️ **只传本地有的文件不够！** 有些图当年直接从 AI 工具上传到旧 CDN，本地根本不存在（如 `s3_lv*.jpg` 城市寻物图）。**必须额外做**：① 从 `levels.js` 提取所有 `scene` URL → ② 逐个 `curl -sI` 验证新 CDN 是否 200 → ③ 404 的图从旧 CDN 下载到本地 → ④ 再上传到新 CDN |
| 6 | **Skill 脚本 & SKILL.md** | `audit.sh` / `zero-english-tag.sh` / `SKILL.md` 里的硬编码路径全部替换 | 忘改 = audit.sh 找不到 levels.js 报 FileNotFoundError |
| 7 | **版本号 bump + upload** | `BUILD_VER +1` / `MARKER +1` / `index.html ?v=+1` → `ksmg-preview.sh upload` | 新 AppID = 新开发者后台，旧 appid 的 upload 无效 |

**CDN 上传命令**（全量模式）：
```bash
cd /Users/fat/Desktop/aiminigame/game-aigc-product-hub/games/NEW_APPID
FILES=$(find package/assets/scenes -name "*.jpg" -type f | sed 's|^package/||' | tr '\n' ',' | sed 's/,$//')
node /Users/fat/.codeflicker/remote-personal-skills/agw-work-mode/skills/agw-self-test/cdn/cdn-upload.js \
  package NEW_APPID --files="$FILES" \
  --token=14_da7d82d193d14fc536c0a1ce0cc0c2e9 --no-replace
```

**⚠️ 前置依赖**：cdn-upload.js 需要 `@kcdn/multi-upload` npm 包：
```bash
cd /Users/fat/.codeflicker/remote-personal-skills/agw-work-mode/skills/agw-self-test/cdn
npm install @kcdn/multi-upload --registry https://npm.corp.kuaishou.com
```

**迁移后必须跑 audit**：确保新路径下 levels.js / editor PROPS / CDN URL 全部一致。

**迁移后用户手动操作**：
1. 登录**新 AppID 的**开发者后台（不是旧的！）
2. 找到新版本 → 提交审核
3. 新广告位 ID 要确认是新 AppID 名下的位（否则拉不出广告）

### 9.19 本会话第三次试错年表（2026-08-11 17:45 · 9.17 的延续）

本次会话（AppID 迁移）新增 1 条铁律：

| # | 场景 | 新增铁律 |
|---|---|---|
| 12 | "appid 换成这个 ks658651445853447417，广告位 id 换成 2300058115_01" | 9.18：AppID 整体迁移 7 步 checklist |

**版本号 bump 历史（本次会话）**：
- `BUILD_VER`: `v1.0.22` → `v1.0.23`
- `MARKER`: `v92` → `v93`
- 目录名: `ks693835817972937121` → `ks658651445853447417`

**本次会话核心成果**：
- AppID 迁移 7 步全完成 ✅（目录重命名 / config / 全局替换 / 广告位 / CDN 51 图上传 / Skill 脚本路径 / 版本号 upload）
- 废弃素材清理 ✅（welcome_bg.jpg + 2 个 title.backup）
- v1.0.23 上传到新 AppID 开发者后台 ✅

### 9.20 🔴 CDN 迁移后必须全量 URL 验证（2026-08-11 18:30 沉淀）

**场景**：AppID 迁移后，点进「寻找隐藏物」关卡，显示"场景加载中"空白——因为 `s3_lv1-5.jpg` 在新 CDN 上 404。

**根因**：本地 `package/assets/scenes/` 里根本没有 `s3_lv*.jpg`。这些图当年由 AI 生图工具直接上传到旧 CDN，**从未落本地**。迁移时 `find package/assets/scenes -name "*.jpg"` 只能找到本地文件，**漏掉了仅 CDN 存在的图**。

**迁移后必做验证脚本**：
```bash
# 1. 从 levels.js 提取所有 scene URL
grep -oE 'https://[^"]+\.jpg' package/js/levels.js | sort -u > /tmp/all_scene_urls.txt

# 2. 替换旧 AppID 为新 AppID 后逐个验证
sed 's/OLD_APPID/NEW_APPID/g' /tmp/all_scene_urls.txt | while read url; do
  status=$(curl -sI "$url" | head -1)
  echo "$status $url"
done | grep -v "200"  # 只显示非 200 的

# 3. 404 的图从旧 CDN 拉回，上传到新 CDN
for f in s3_lv1 s3_lv2 s3_lv3 s3_lv4 s3_lv5; do
  curl -so /tmp/${f}.jpg "https://p5-ad.adkwai.com/udata/pkg/KS-GAME/AIGC-SoGame/OLD_APPID/${f}.jpg"
done
# 再上传到新 CDN（见 9.18 步骤 5 的命令）
```

**铁律**：CDN 迁移 ≠ 只上传本地文件。**必须以 `levels.js` 的 `scene` URL 列表为权威来源**，逐个验证新 CDN 是否可达。

### 9.21 🔴 同 themeId 多批关卡导致进错关卡（2026-08-11 18:25 沉淀）

**场景**：用户点「寻找隐藏物」进去看到的是「老北京胡同市集」（第一关），而不是预期的「成都 · 鹤鸣茶社」。

**根因**：`LEVELS` 数组里 `themeId:4` 同时挂了两批 hunt 关卡：
- idx:14-17（老 4 关：老北京/上海/广州/深圳）— v0.2.x 实验遗留，早废弃但数据没删
- idx:25-29（现役 5 关：成都/重庆/西安/长沙/天津）

`getThemeLevels(4)` 按 idx 升序返回，第一个就是 idx:14「老北京」。

**修复**：用 9.13 的运行时 filter 隐藏模式：
```js
// v1.0.24 · 老 4 关暂隐
M3.LEVELS = M3.LEVELS.filter(function(l){ return !(l.idx >= 14 && l.idx <= 17); });
```

**铁律**：给主题加新关卡前，**必须检查该 `themeId` 下是否已有废弃旧关**。如果有，必须同时 filter 隐藏旧关，否则新关永远不会排到第一位。

### 9.22 🔴 全局改名铁律（2026-08-11 18:35 沉淀）

**场景**：用户说"我们已经改名了！老铁找茬王改为老铁眼真尖"。

**全局改名 checklist**：
1. `grep -rl "旧名" package/ --include="*.js,*.html,*.json,*.md" | xargs sed -i '' 's/旧名/新名/g'`
2. 检查子游戏名是否与全局名冲突（如「老铁眼**最**尖」是主题 2 子游戏名，不能跟全局名「老铁眼**真**尖」一起替换）
3. 检查隐私政策/用户协议弹窗正文里的《游戏名》是否同步更新
4. 删除首页《用户协议》只保留《隐私政策》时，需改 `welcome.js` 底部小字绘制逻辑（删 `mid2` + `mid3` 变量 + `mid3W` 热区 + 下划线）
5. bump 版本号 + upload

**本次改名结果**：7 个文件 15 处替换，0 残留 ✅

### 9.23 🔴 新增主题/模式后四件套 checklist（2026-08-11 21:35 沉淀 · buglist 批量修复教训）

**场景**：新增主题（如 id=4 spot/hunt）或新增游戏模式后，修了 A 忘了 B，导致一系列 bug。

**根因共性**：代码里有多处**硬编码的列表/文案/路由**，每次新增主题/模式后没有同步更新。

**四件套（新增主题后必查）**：

| # | 检查项 | 文件 | 易漏点 |
|---|---|---|---|
| 1 | **清除按钮 storage keys 列表** | `game.js` 清除按钮 `keys` 数组 | 缺 `theme_{新id}_unlocked` / `laotie_last_level_{新id}` / 每日解锁 key |
| 2 | **内存主题解锁状态 reset** | `game.js` 清除按钮 `M3.THEMES.forEach` | 只 reset `unlockBy==='share'`，漏了 `'rewardedAd'` 等新类型 |
| 3 | **广告调用路由** | 所有调用广告的函数 | 必须走 `M3.KwaiAd.showRewarded(cb)`，**禁止硬编码 `adUnitId`** |
| 4 | **模式文案同步** | `_buildHintText` / 结算页 / toast | `穿越物` 只适用于 hidden；spot 用 `不同`；hunt 用 `隐藏物` |

**详细说明**：

**① 清除按钮 keys**：`game.js` 清除按钮的 `keys` 数组是**硬编码的**，不读 M3.THEMES 动态生成。每次新增主题必须手动加：
```js
// ✅ 正确：包含所有主题相关 key
var keys = [
  'laotie_last_level_1','laotie_last_level_2','laotie_last_level_3','laotie_last_level_4',
  'laotie_hint_free_date',
  'theme_1_unlocked','theme_2_unlocked','theme_3_unlocked','theme_4_unlocked',
  'laotie_theme_unlocks_v1',  // 每日 rewardedAd 解锁记录
  'laotie_voice_unlocks_v1',  // 每日语音包解锁记录
  'laotie_skip_welcome','laotie_stats_v1','laotie_playtime_ms','laotie_user'
];
```
```js
// ❌ 错误：漏了 theme_4 / laotie_theme_unlocks_v1
var keys = ['laotie_last_level_1','laotie_last_level_2','laotie_last_level_3',
  'theme_1_unlocked','theme_2_unlocked','theme_3_unlocked', ...];
```

**② 内存 reset**：清除按钮同步重置内存中主题的 `unlocked` 状态，必须覆盖**所有**非默认解锁类型：
```js
// ✅ 正确：share + rewardedAd 都 reset
M3.THEMES.forEach(function(t){
  if (t.unlockBy === 'share' || t.unlockBy === 'rewardedAd') t.unlocked = false;
});
```
```js
// ❌ 错误：只 reset share
if (t.unlockBy === 'share') t.unlocked = false;
```

**③ 广告调用铁律**：**任何**广告相关功能必须走统一封装 `M3.KwaiAd.showRewarded(cb)`，该函数内部从 `kwai-ad-config.js` 读取真实广告位 ID。**绝对禁止**：
- ❌ `ks.createRewardedVideoAd({ adUnitId: 'xxx' })` 直接调用
- ❌ 硬编码 `adUnitId: 'ks_rewarded_unlock_all'` 等假 ID
- ✅ `M3.KwaiAd.showRewarded(function(ok){ if(ok){ /* 发奖 */ } })`

**④ 模式文案对照表**：

| mode | 通用称呼 | 提示语模板 | 结算语 |
|---|---|---|---|
| `hidden` | 穿越物 | `🔎 提示：图里藏了个《穿越物》` | `还剩 N 个穿越物没找到` |
| `spot` | 不同 | `🔎 提示：右图的左上区域` | `还剩 N 个不同没找到` |
| `hunt` | 隐藏物 | `🔎 提示：图里藏了个《隐藏物》` | `还剩 N 个隐藏物没找到` |

**自检命令**（新增主题后必跑）：
```bash
GAME=/Users/fat/Desktop/aiminigame/game-aigc-product-hub/games/ks658651445853447417

# ① 清除按钮 keys 覆盖全主题
THEME_COUNT=$(grep -c "id:" $GAME/package/js/levels.js | head -1)  # 粗估
echo "检查清除按钮 keys 是否覆盖全主题："
grep "theme_.*_unlocked" $GAME/package/js/game.js | grep "keys ="

# ② 内存 reset 覆盖全 unlockBy 类型
echo "检查内存 reset 覆盖的 unlockBy 类型："
grep "unlockBy" $GAME/package/js/game.js | grep "unlocked = false"

# ③ 无硬编码 adUnitId
echo "检查硬编码 adUnitId："
grep -n "adUnitId" $GAME/package/js/game.js | grep -v "kwai-ad-config"

# ④ 模式文案按 mode 分流
echo "检查模式文案是否按 mode 分流："
grep -n "穿越物" $GAME/package/js/game.js | grep -v "mode===" | grep -v "//"
```

### 9.24 🔴 overlay 面板点击穿透铁律（2026-08-11 21:35 沉淀，v1.0.55 修正）

**场景**：设置面板 / 解锁浮层 等 overlay 面板打开时，点击面板外区域不应该穿透到底层按钮（如底部 icon 栏的"解锁全部"），否则会出现两个浮层叠显。

**根因**：overlay 只在面板矩形区域加了 tapArea（priority 900），**面板外没有全屏 absorber**，点击穿透到底层 priority 0 的按钮。

**正确模式**（四层 tapArea 优先级）：
```
priority N-50: 全屏 absorber → onTap: function(){} (吞掉所有面板外点击，防止穿透底层)
priority N:   面板矩形 → onTap: function(){} (吞掉点击，不关面板)
priority N+100: 关闭按钮 → onTap: 关闭面板
priority N+100: 面板内按钮 → onTap: 执行功能
```

> ⚠️ **关键**：全屏 absorber 的 priority 必须比面板矩形低 1~50，但比底层按钮（priority 0）高。这样面板外的点击被 absorber 吞掉，面板内的点击被面板矩形拦截。

**代码模板**（以设置浮层为例）：
```js
// ⭐ 全屏 absorber（v1.0.55 加的，防止点击穿透到底部 icon 栏）
state.tapAreas.push({ x:0, y:0, w:W, h:H, priority:850, onTap:function(){} });
// 面板矩形拦截层
state.tapAreas.push({ x:px(cx-4), y:py(frameTop-4), w:ps(cw+8), h:ps(ch+banOH+8), priority:900, onTap:function(){} });
// 关闭按钮
state.tapAreas.push({ x:px(closeX-4), y:py(closeY-4), w:ps(cs+8), h:ps(cs+8), priority:1100,
  onTap:function(){ state.settingsOverlay = false; } });
// 面板内开关/按钮 priority:1000
```

**各浮层的 priority 体系**（v1.0.55 实际值）：
| 浮层 | absorber | 面板矩形 | 关闭按钮 | 内部按钮 |
|------|----------|---------|---------|---------|
| drawSettingsOverlay | 850 | 900 | 1100 | 1000 |
| drawProfilePanel | 150 | 200 | 210 | — |
| drawUnlockOverlay | 17 | 18 | 20 | 20 |
| drawShareUnlockOverlay | 17 | 18 | 20 | — |
| drawDailyAdUnlockOverlay | 2850 | 2900 | 3001 | 3000 |
| drawAdLoadingOverlay | — | 99999 | — | — |

**错误模式 A**（v1.0.54 之前的实际 bug）：
```js
// ❌ 只有面板矩形拦截层，没有全屏 absorber → 点击面板外穿透到底层按钮
state.tapAreas.push({ x:px(cx-4), y:py(frameTop-4), w:ps(cw+8), h:ps(ch+banOH+8), priority:900, onTap:function(){} });
```

**错误模式 B**（原始 §9.24 文档错误）：
```js
// ❌ 全屏层 onTap 关闭面板 → 面板内点空白也会关
state.tapAreas.push({ x:0, y:0, w:W, h:H, priority:900,
  onTap: function(){ state.settingsOverlay = false; }
});
```

### 9.23b 🔴 编辑器四体同步铁律（2026-08-14 v1.0.58 沉淀 · gen-subpages.js 漏更导致 S3 编辑器入口丢失）

**场景**：用户在编辑器找不到 S3·Lv1 北京胡同的入口，因为 `gen-subpages.js` 只生成了 S1(18关)+S2(7关) 的子页面，S3 的 9 关全漏了。

**根因**：S3 的 9 关是 v0.0.70+ 才追加进 `SCENE_META[3]` 的，但追加时只更新了 `SCENE_META` + `EXIST_S3`，**忘记同步更新 `gen-subpages.js` 的 LEVELS 数组**。

**铁律**：编辑器同步是**四体同步**，不是三体同步！新增 S* 场景时必须同时更新：

| # | 文件 | 同步内容 |
|---|---|---|
| 1 | `editor-legacy.js` 的 `SCENE_META[N]` | 关卡元数据（title/duration/hint） |
| 2 | `editor-legacy.js` 的 `EXIST_S{N}` | 坐标默认值 |
| 3 | `editor-legacy.js` 的 `PROPS` | prop 映射 |
| 4 | **`gen-subpages.js` 的 `LEVELS` 数组** | 子页面生成入口（`{s:3, lv:1, title:'S3·第1关 · 北京胡同'}`） |

**gen-subpages.js 注意事项**：
1. **输出目录必须是 `public/`**，不是项目根目录（vite build 会 `emptyOutDir: true` 清空 dist，只有 public/ 下的文件才会被 emit 到 dist）
2. **ESM 兼容**：`package.json` 有 `type: module`，`gen-subpages.js` 必须用 `import` 而非 `require()`：
   ```js
   const fs = await import('fs').then(m => m.default);
   const path = await import('path').then(m => m.default);
   const { fileURLToPath } = await import('url');
   const projectRoot = path.dirname(fileURLToPath(import.meta.url));
   const root = path.join(projectRoot, 'public');
   ```
3. **build 后验证**：`ls dist/s3/` 确认子页面已生成，再 deploy

**自检命令**：
```bash
EDITOR=/Users/fat/Desktop/laotie-editor
# SCENE_META 场景数 vs gen-subpages.js LEVELS 场景数
S_META=$(grep -c "lv:" $EDITOR/src/editor-legacy.js | head -1)
S_GEN=$(grep -c "{ s:" $EDITOR/gen-subpages.js 2>/dev/null || echo "0")
echo "SCENE_META entries: $S_META | gen-subpages entries: $S_GEN"
# dist/ 子页检查
for S in 1 2 3; do
  [ -d "$EDITOR/dist/s$S" ] && echo "dist/s$S ✅" || echo "dist/s$S ❌ 缺失！"
done
```

### 9.24b 🔴 资源错配时禁止删关铁律（2026-08-14 v1.0.56 沉淀）

**场景**：第三场景「寻找隐藏物」第一关显示了第一场景的奶奶堂屋图，用户大怒。

**根因分析**：CDN 上 `lv1.jpg`（北京胡同的 scene URL）和 `hidden_lv1.jpg`（80年代姥姥堂屋）**文件完全一致（同为 205704 字节）**——是 CDN 上传时图源搞错了，而非 levels.js 关卡数据配置错误。

**❌ 错误修复**（v1.0.55 的蠢操作）：直接 `filter` 删掉 idx:14-17 四关（北京/上海/广州/深圳），导致寻物场景只剩 5 关。

**✅ 正确修复**：
1. **保留关卡数据**（关卡结构、坐标、提示语都是正确的）
2. **定位真正的资源问题**：`curl -sI URL` + 下载对比文件大小确认 CDN 资源是否正确
3. **重新上传正确图到 CDN**，或改 scene URL 指向已验证正确的资源

**铁律**：
- 🔴 **图物错配 → 先查 CDN 资源是否正确，再查 URL 映射，绝不删关**
- 🔴 **CDN 命名用场景前缀**：`s3_lv1.jpg`（场景3·第1关）比 `lv1.jpg`（全局命名空间易碰撞）更安全
- 🔴 **删关前必须问用户**：任何 `M3.LEVELS.filter` 删除操作都是破坏性操作，不可自作主张

### 9.25 🔴 Canvas fillText 长字符串截断铁律（2026-08-11 21:35 沉淀）

**场景**：用户昵称 / 标题 / 提示语 等动态文本直接 `ctx.fillText(text, ...)` 绘制，未截断 → 超长文本溢出容器。

**铁律**：任何来自外部数据（用户昵称 / 服务器返回 / 登录信息）的动态文本，**必须先截断再绘制**。

**代码模板**：
```js
// ✅ 正确：先截断
var rawNick = u.nickName || '铁子';
var nick = rawNick.length > 8 ? rawNick.slice(0, 8) + '…' : rawNick;
ctx.fillText(nick, px(textX), py(textY));

// ❌ 错误：直接绘制原始文本
ctx.fillText(u.nickName || '铁子', px(textX), py(textY));
```

**截断阈值参考**：
| 场景 | 最大字符数 | 原因 |
|---|---|---|
| 顶部小卡昵称 | 8 | 卡片宽 VW*0.6，13px 字号 |
| profile 面板昵称 | 12 | 面板更宽，18px 字号 |
| 按钮文字 | 6 | 按钮窄 |
| toast / 提示语 | 20 | 不限但视觉上别溢出 |

### 9.26 本会话第四次试错年表（2026-08-11 21:35 · 9.19/9.22 的延续）

本次会话（buglist 批量修复 v1.0.27）新增 4 条铁律：

| # | Bug 号 | 场景 | 新增铁律 |
|---|---|---|---|
| 13 | B3130735 | 解锁全部广告加载失败 | 9.23③ 广告调用铁律：必须走 M3.KwaiAd.showRewarded |
| 14 | B3130737/B3130742 | 清除任务无法清除关卡 3/4 | 9.23①② 清除按钮 keys + reset 覆盖全主题 |
| 15 | B3126344/B3126347 | 提示文案/区域语序别扭 | 9.23④ 模式文案对照表 |
| 16 | B3122677 | 设置面板点空白误关 | 9.24 overlay 面板三层拦截模式 |
| 17 | B3124250 | 昵称太长溢出 | 9.25 Canvas fillText 截断铁律 |

**版本号 bump 历史（本次会话）**：
- `BUILD_VER`: `v1.0.26` → `v1.0.27`
- `MARKER`: `v96` → `v97`

**本次会话核心成果**：
- 8 个 bug 修复 ✅（广告位/清除按钮/提示文案/昵称截断/设置面板/CDN 图/模式文案/区域语序）
- s2_lv10-12 从旧 CDN 回填并上传新 CDN ✅
- v1.0.27 上传开发者后台 ✅

**反思**：这批 bug 的共性是 **"新增主题/模式后散落代码没同步"**——清除按钮的 keys 是硬编码列表、广告调用绕过统一封装、文案按 mode 分流不彻底、面板拦截层缺位。根因不是某个 bug 修不修的问题，而是**缺少"新增主题后必查四件套"** 的系统化 checklist。9.23 就是这个 checklist。

---

## ⏱️ 十、时长系统设计铁律（2026-08-11 v1.0.28 沉淀 · 时长公式 + 仁慈机制）

### 10.0 血泪背景

v1.0.27 之前，30+ 关卡的 `duration` 全靠手拍脑袋：教学关 60s（太慢）、普通关 70s、Boss 关 90-130s（过场太长），spot 12 关全是 60/70/80 平铺（无梯度），hidden Boss 比 hidden 普通关还简单（时长更长但 odds 更多 → s/odd 反而更低）。用户体感：前期拖、中期平、后期崩。

**根因**：duration 是「孤岛硬编码字段」，没有任何公式或梯度参考，每次新增关卡随手抄一个 60/70/80，长期累积失去一致性。

**修复方案**：引入 `difficulty.js` 引擎，把 duration 从「手写常量」升级为「公式 + 难度表 + 仁慈机制」三件套。

### 10.1 🔴 时长公式（唯一权威）

```
duration = setupTime(mode) + oddsCount × perOddSec(diffKey) + bossBuf
```

| 项 | 含义 | 取值 |
|---|---|---|
| `setupTime(mode)` | 玩家看图 / 对齐双图 / 数异物的准备时间 | hidden=6s · spot=10s · hunt=8s |
| `oddsCount` | 本关要找的异物数量 | levels.js 里 `odds.length` |
| `perOddSec(diffKey)` | 每个异物给多少秒（按难度档查表） | 见 10.2 九档表 |
| `bossBuf` | Boss 关额外缓冲 | +8s |

**spot 比 hidden 多 4s setup**：因为双图找不同需要左右对齐视线，比单图找异物多一道眼动成本。

**Boss 关 +8s 而不是 ×1.5**：Boss 关已经靠 odds 数量加压了（通常 odds=6-8），duration 再乘 1.5 会爆炸。+8s 是「留呼吸时间让玩家感受 Boss 氛围」的线性缓冲。

### 10.2 🔴 九档难度表（s/odd · 唯一权威）

| diffKey | perOdd (s) | label（显示用） | 适用场景 |
|---|---|---|---|
| `tutorial` | 25 | 教学 | 第 1-2 关，手把手教 |
| `easy` | 20 | 简单 | 主题前 3-5 关 |
| `easy+` | 17 | 简单+ | 主题前中段过渡 |
| `normal` | 15 | 进阶 | 主题中段主力 |
| `normal+` | 13 | 进阶+ | 主题中后段过渡 |
| `hard` | 11 | 困难 | 主题后段 / Boss 前 |
| `hell` | 9 | 地狱 | Boss 关 |
| `nightmare` | 7 | 极地狱 | 隐藏关 / 特别关 |
| `ultra` | 6 | 究极地狱 | 终极挑战关 |

**梯度设计原理**：
- tutorial → easy 跳 -5s（告诉玩家「教学结束」）
- easy → hell 每 1-2 档 -2~-3s（平滑加压）
- hell → ultra 跳 -3s（最后冲刺陡降）
- **不要线性递减**，要「前缓后陡」的加速曲线

### 10.3 🔴 仁慈机制（mercy · 留住弃坑玩家）

**触发条件**：同一关连续失败 ≥ 2 次（`laotie_fail_streak_v1` 计数器）

**效果**：第 3 次挑战本关时，`state.time` 自动 +10s + toast 提示「🎁 老铁别急！送你 10 秒，稳住～」

**重置时机**：通关本关 → `resetFailStreak(idx)` 立即清零

**存储键**：`laotie_fail_streak_v1`（JSON：`{idx: streak, ...}`），**必须**加入 `clearStorage` 的 keys 数组（9.23① 已沉淀），否则清除任务无法重置仁慈状态。

**为什么是 +10s 而不是 +15s 或 +5s**：
- +5s 玩家无感（一次误判就耗光）
- +15s 太宽容（玩家会故意失败刷时长）
- +10s 够玩家多找 1 个异物 + 容错 1 次误判，体感「游戏在帮我」而不是「游戏被我钻空子」

### 10.4 引擎 API（`package/js/difficulty.js` · 122 行）

**加载顺序铁律**：`difficulty.js` 必须在 `levels.js` 之前加载（`index.html` 里 script 顺序），否则 `levels.js` 里如果调用 `M3.suggestDuration` 会 undefined。

```js
// 读
M3.DIFF                  // 九档表 {tutorial:{perOdd:25,label:'教学'}, ...}
M3.SETUP_SEC             // {hidden:6, spot:10, hunt:8}
M3.BOSS_BUF              // 8
M3.MERCY                 // {threshold:2, extra:10, key:'laotie_fail_streak_v1'}

// 算
M3.suggestDuration({mode:'hidden', oddsCount:5, diffKey:'easy', boss:false})  // → 6 + 5×20 + 0 = 106
M3.audit({mode:'hidden', oddsCount:5, duration:106, boss:false})               // → {diffKey:'easy', perOdd:20, label:'简单'}

// 仁慈
M3.getFailStreak(idx)       // → 0/1/2/...
M3.bumpFailStreak(idx)      // streak++，写 localStorage
M3.resetFailStreak(idx)    // streak=0，写 localStorage
M3.applyMercy(idx, baseTime)  // → {duration: baseTime+10, granted:true/false, streak}
```

### 10.5 🔴 集成钩子（game.js 必改 3 处）

| 位置 | 钩子 | 代码 |
|---|---|---|
| `pickLevel` 开头 | `applyMercy` | `var _mercy = M3.applyMercy(idx, _baseTime); state.time = _mercy.duration; state._mercyGranted = _mercy.granted;` |
| `pickLevel` 末尾（intro 后） | mercy toast | `if (state._mercyGranted) setTimeout(()=>toast('🎁 老铁别急！送你 10 秒，稳住～', {duration:2400}), 400);` |
| `_isFinalHit` 通关分支 | `resetFailStreak` | `M3.resetFailStreak(state.levelIdx);` |
| `state.time<=0` 失败分支 ×2 | `bumpFailStreak` | `M3.bumpFailStreak(state.levelIdx);` |

**toast 延迟 400ms 原因**：pickLevel 里有 intro 动画 + 语音播报，立即 toast 会被覆盖。400ms 让 intro 先渲染完。

### 10.6 批量更新 duration 模式（regex node 脚本 · 用完即弃）

**场景**：一次性给 30+ 关重新套公式，手动 `replace_in_file` 30 次容易出错。

**模板**（`/tmp/_apply_duration.js` · 用完即删）：
```js
const fs = require('fs');
const path = '/Users/fat/Desktop/aiminigame/game-aigc-product-hub/games/ks658651445853447417/package/js/levels.js';
let s = fs.readFileSync(path, 'utf8');
const targets = [
  { themeId:1, idx:0,  duration:31  },  // 教学关 1
  { themeId:1, idx:1,  duration:35  },  // 教学关 2
  // ... 30 项
];
let ok = 0, fail = 0;
for (const t of targets) {
  const re = new RegExp(`(idx:\\s*${t.idx},\\s*themeId:\\s*${t.themeId})([\\s\\S]*?duration:\\s*)(\\d+)`);
  if (re.test(s)) { s = s.replace(re, `$1$2${t.duration}`); ok++; }
  else { fail++; console.log('FAIL: idx='+t.idx+' themeId='+t.themeId); }
}
fs.writeFileSync(path, s);
console.log(`ok=${ok} fail=${fail}`);
```

**铁律**：
- ⚠️ 跑完**立刻 `rm /tmp/_apply_duration.js`**，不留在仓库里（避免误用旧映射覆盖新 duration）
- ⚠️ 跑完**立刻 `node -c package/js/levels.js`** 验证语法
- ⚠️ `grep -c "duration:" package/js/levels.js` 对比预期更新数

### 10.7 何时用公式 vs 何时手调

| 场景 | 用公式 | 手调 |
|---|---|---|
| 新增关卡 | ✅ 先用 `M3.suggestDuration` 算出基线 | 玩家反馈太难/太易再微调 ±5s |
| 全量重构（如本次 v1.0.28） | ✅ 30 关一次套公式 | 不手调 |
| 单关体感问题 | ❌ 不用公式 | ✅ 直接改 `duration: NN` |
| 新增主题/模式 | ✅ 先在 `SETUP_SEC` 加 mode | 再跑全量重算 |

**手调时不要改公式**：公式是「锚」，手调是「锚周围的微调」。如果某关玩家反馈太慢，先 `M3.audit` 看当前 perOdd 落在哪个档，再决定是降 diffKey 还是 -5s 手调。

### 10.8 重构成果（参考基线）

| 主题 | 重构前总时长 | 重构后总时长 | 变化 | 版本 |
|---|---|---|---|---|
| hidden (18 关) | 1245s | 892s | -28% | v1.0.28 |
| spot (12 关) | 750s | 699s | -7% | v1.0.29 |
| hunt (28 关) | 未动（已有良好梯度 20→11.3 s/odd） | — | — | — |

**⚠️ v1.0.28 的教训**：v1.0.28 时长重构只改了 hidden 主题，**spot 12 关被遗漏**！所有 spot 关卡的 duration 仍然是手拍脑袋值，与公式不一致。直到 v1.0.29 才补上 spot 公式化。**铁律：时长重构必须覆盖所有主题（hidden + spot + hunt），不能只改一个就发布。**

**hunt 为什么没动**：hunt 主题的 duration 本来就是按梯度设计的（20→11.3 s/odd），套公式反而会打破现有平衡。**重要原则：公式是用来修孤岛，不是用来均质化已有良好设计的内容**。

### 10.9 时长系统自检（改完必跑）

```bash
cd /Users/fat/Desktop/aiminigame/game-aigc-product-hub/games/ks658651445853447417

# ① difficulty.js 加载顺序
grep -n "difficulty.js\|levels.js" package/index.html | head -5
# 应看到 difficulty.js 在 levels.js 之前

# ② difficulty.js 语法
node -c package/js/difficulty.js && echo "✅ difficulty.js 语法 OK"

# ③ mercy 钩子 3 处
grep -c "M3.applyMercy\|M3.bumpFailStreak\|M3.resetFailStreak" package/js/game.js
# 应 ≥ 4（applyMercy×1 + bump×2 + reset×1）

# ④ fail_streak 加入 clearStorage keys
grep -c "laotie_fail_streak_v1" package/js/game.js
# 应 ≥ 2（keys 数组里 + 可能的 reset 调用）

# ⑤ 用公式审计全关
node -e "
const M3 = require('./package/js/difficulty.js');
const levels = require('./package/js/levels.js').LEVELS || [];
levels.forEach(lv => {
  const a = M3.audit({mode: lv.mode||'hidden', oddsCount: lv.odds.length, duration: lv.duration, boss: lv.boss});
  console.log('idx='+lv.idx+' theme='+lv.themeId+' dur='+lv.duration+' → '+a.label+' ('+a.perOdd+'s/odd)');
});
" 2>&1 | head -35
```

### 10.10 反模式（❌ 不要这样）

| ❌ 反模式 | 为什么错 | ✅ 正确做法 |
|---|---|---|
| 新关 duration 抄邻居关 | 难度梯度无法形成 | 用 `suggestDuration` 算 |
| Boss 关 `duration × 1.5` | odds 已经加压，乘 1.5 爆炸 | `+ BOSS_BUF (8s)` 线性缓冲 |
| spot 和 hidden 用同一 setupTime | spot 双图对齐额外成本 | `SETUP_SEC.spot = 10 > hidden = 6` |
| mercy 给 +20s | 玩家故意失败刷时长 | `MERCY.extra = 10` 够用 |
| mercy 不重置 | 通关后下次还触发 | `_isFinalHit` 里 `resetFailStreak` |
| 把 hunt 也套公式重算 | 已有良好梯度被打乱 | 公式只修孤岛，不均质化好设计 |

### 10.11 版本号

本次 v1.0.28 重构：
- `BUILD_VER`: `v1.0.27` → `v1.0.28`
- `MARKER`: `v97` → `v98`
- `?v=97` → `?v=98` (11 处)
- commit: `f45935d (dev)`

**核心成果**：30 关 duration 从手拍脑袋 → 公式驱动 + 仁慈机制，hidden 主题总时长 -28%，玩家弃坑率预期下降（mercy 留人）。

### 10.12 v1.0.29 补丁（spot 时长公式化 + 语音包隐藏）

**问题**：v1.0.28 重构遗漏了 spot 主题 12 关，所有 spot 关卡的 duration 仍是手拍脑袋值（如第 1 关海边美女地狱 80s，公式应为 73s）。

**修复**：用 Python 脚本批量将 spot 12 关 duration 替换为公式值。

| 版本 | 主题 | 修改前总时长 | 修改后总时长 | 变化 |
|---|---|---|---|---|
| v1.0.29 | spot (12 关) | 750s | 699s | -7% |

**同时修复**：辣辣/酷二狗语音包未隐藏（见 9.13b）。

- `BUILD_VER`: `v1.0.28` → `v1.0.29`
- `MARKER`: `v98` → `v99`
- `?v=98` → `?v=99` (11 处)

### 十一、分享卡片生图与交付铁律（2026-08-11 沉淀）

**触发场景**：用户要求为「老铁眼真尖」生成分享卡片、分享图、分享标题/文案、上传到开发者后台，或要求把生成图片下载到桌面。

#### 11.1 先看游戏，再定视觉
- 生成前先读取实际游戏 UI（优先 `package/assets/ui/title.png`、`card-bg.png`、`btn-share.png`）和代表性关卡图。
- 分享卡片必须延续游戏的核心识别：找茬/放大镜、东北怀旧场景、现代穿越物、明亮高对比；不要凭空换成与游戏无关的通用海报。
- 若用户强调“反差感”，优先用**现代人物/现代物品 × 老土炕、旧屋、农具、老市场等场景**的叙事构图，而不是只做 Q 版装饰。
- 人物必须是成年人，避免低俗、擦边或以身体部位作为唯一卖点；用服装、姿态、场景时代差和旁人反应制造吸引力。

#### 11.2 合规视觉禁用清单
- 用户明确不要的元素必须写入正向 prompt 的 `STRICT NEGATIVE`：五角星、红星、红旗、军政符号、政治标志等。
- 不要使用敏感场景或敏感词作为吸引点；“大腿/辣妹”需求应转译为“成年现代女性、时髦造型、长腿姿态、时代反差”，保持平台可审与游戏调性。
- 生成后必须人工检查图片：禁用元素、人物是否成年、是否出现多余文字/Logo、画面是否真的有新旧时代反差。

#### 11.3 尺寸与文案必须一次对齐
- 开发者后台分享卡片要求 **510×350 PNG，≤10MB**；不要只交付 1536×1024 原图。
- 推荐先按 510×350 的 1.457:1 比例构图，生成后用 ImageMagick/Python/Pillow 精确 resize/crop，并检查 `file`、像素和大小。
- 分享标题不超过 14 字，分享文案不超过 28 字；生成时同时给出可直接粘贴的候选，不要让用户自己数长度。
- 交付前至少确认：宽度 510、高度 350、PNG、文件大小小于 10MB、文字没有被裁切。

#### 11.4 CDN 图片下载与桌面交付
- 生图脚本输出 URL 后必须先保存到本地记录或变量，禁止凭记忆手写 URL。
- 直接 `curl` 下载得到 0B/404 时，不要重复同一命令；优先使用带 SSO 的 `download_cdn_images.py`。
- 如果原 URL 已过期或返回 404，重新生成图片并立即用 SSO 下载新 URL。
- 下载后逐文件检查非 0B、能被图片工具识别，再复制到 `~/Desktop/laotie-share-cards/`；不要只告诉用户 URL。
- 交付报告必须列出所有文件名、尺寸、大小和目录，并注明失败/重生成的图片。

#### 11.5 推荐交付流程
```
读取 title/UI + 代表性关卡图
  ↓
确定主题（游戏玩法 + 强反差叙事）
  ↓
生成 2 个独立候选
  ↓
人工检查禁用元素/成人合规/反差/文字
  ↓
精确裁剪到 510×350 PNG
  ↓
检查尺寸、格式、大小、非 0B
  ↓
复制全部产物到桌面并给标题/文案
```

**本次试错教训**：首次 Q 版卡片不符合用户想要的真人反差感；改为真人现代女性与东北旧场景后，用户又指出画面出现五角星/红星风险，因此以后必须在第一次 prompt 就加入禁用元素清单，并在交付前检查。另有一张 CDN URL 下载为 0B/404，说明生图 URL 不是永久文件；必须用 SSO 下载脚本验证，失效则重新生成。


## 🔧 十二、Canvas 触摸交互铁律（2026-08-12 沉淀 · 滑动误触修复）

### 12.0 血泪背景

**用户复现步骤**：游戏列表页 → 滑动屏幕 → 只要落指到游戏选取卡片就进入游戏

**预期**：滑动不应触发游戏进入
**实际**：落指即进游戏

### 12.1 根因

`main.js` 的 `touchstart` 事件直接调用 `handleTap`——手指一落下去就触发，没有等 `touchend` 判断是否是滑动。

```js
// ❌ 错误：touchstart 直接触发 tap
canvas.addEventListener('touchstart', function(e){
  var p = getXY(e); M3.Game.handleTap(p.x, p.y);  // 落指即触发！
});
```

### 12.2 ❌ 失败方案 v1：touchstart 记录 → touchend 判定（v1.0.29 · 真机失败）

```js
// ❌ v1.0.29 方案：依赖 touchend 判定位移
// 真机问题：ks.onTouchEnd 在快手小游戏容器中可能不存在或不可靠
// 导致：tap 永远不触发（无 touchend 回调）或坐标对不上
var _touchStartXY = null, _TAP_THRESHOLD = 10;
function _shouldTap(endXY){
  if (!_touchStartXY) return true;
  var dx = endXY.x - _touchStartXY.x, dy = endXY.y - _touchStartXY.y;
  return (dx*dx + dy*dy) < _TAP_THRESHOLD*_TAP_THRESHOLD;
}
canvas.addEventListener('touchstart', function(e){
  var p = getXY(e); _touchStartXY = p; e.preventDefault();
});
canvas.addEventListener('touchend', function(e){  // ❌ ks.onTouchEnd 不可靠！
  var t = e.changedTouches && e.changedTouches[0];
  if (t && _shouldTap({x:ex, y:ey})) M3.Game.handleTap(ex, ey);
  _touchStartXY = null;
});
```

**失败原因**：快手小游戏原生容器的 `ks.onTouchEnd` 回调可能缺失或坐标不准，导致滑动后 tap 不触发，用户反馈"首页滑动还是有那个问题"。

### 12.3 ✅ 正确方案 v2：touchstart 延迟触发 + touchmove 超阈值取消（v1.0.30 · 真机验证通过）

**核心原理**：手指落下的同时启动 80ms 定时器，如果 80ms 内手指移动超过 12px，说明是滑动→立刻取消定时器；如果 80ms 内没动→正常触发 tap。**不再依赖 touchend 事件**。

```js
// ✅ v1.0.30 方案：延迟触发 + move 取消
var _tapPending = null, _touchStartXY = null, _SWIPE_PX = 12, _TAP_DELAY = 80;
function _startTap(x, y){
  _touchStartXY = {x:x, y:y};
  if (_tapPending) clearTimeout(_tapPending);
  _tapPending = setTimeout(function(){
    _tapPending = null;
    M3.Game.handleTap(x, y);
  }, _TAP_DELAY);
}
function _cancelIfSwipe(x, y){
  if (!_touchStartXY) return;
  var dx = x - _touchStartXY.x, dy = y - _touchStartXY.y;
  if (dx*dx + dy*dy >= _SWIPE_PX*_SWIPE_PX){
    // 明显移动了 → 这是滑动，取消待执行的 tap
    if (_tapPending){ clearTimeout(_tapPending); _tapPending = null; }
    _touchStartXY = null;
  }
}
// H5 canvas 事件
canvas.addEventListener('touchstart', function(e){
  var p = getXY(e); _startTap(p.x, p.y); e.preventDefault();
}, { passive:false });
canvas.addEventListener('touchmove', function(e){
  var p = getXY(e); _cancelIfSwipe(p.x, p.y); M3.Game.handleMove(p.x, p.y); e.preventDefault();
}, { passive:false });
canvas.addEventListener('touchend', function(e){
  // touchend 时不做额外处理（tap 已由 delay 触发或被 move 取消）
  _touchStartXY = null;
}, { passive:false });
// 桌面端不受影响（无滑动手势）
canvas.addEventListener('mousedown', function(e){
  var p = getXY(e); M3.Game.handleTap(p.x, p.y);
});
canvas.addEventListener('mousemove', function(e){
  if (e.buttons) { var p = getXY(e); M3.Game.handleMove(p.x, p.y); }
});

// 快手小游戏原生触摸
if (typeof ks !== 'undefined' && ks.onTouchStart){
  ks.onTouchStart(function(e){
    var t = e.touches && e.touches[0]; if (!t) return;
    _startTap(t.clientX || t.x, t.clientY || t.y);
  });
  ks.onTouchMove && ks.onTouchMove(function(e){
    var t = e.touches && e.touches[0]; if (!t) return;
    _cancelIfSwipe(t.clientX || t.x, t.clientY || t.y);
    M3.Game.handleMove(t.clientX || t.x, t.clientY || t.y);
  });
  // ⚠️ 不再依赖 ks.onTouchEnd！
}
```

### 12.4 关键参数

| 参数 | 推荐值 | 说明 |
|---|---|---|
| `_SWIPE_PX` | 12px | 移动 ≥12px 判定为滑动，取消 tap |
| `_TAP_DELAY` | 80ms | 延迟触发 tap 的时间（太短→手势还没判完就触发了；太长→用户感觉迟钝） |
| `mousedown` | 直接 tap | 桌面端无滑动手势，不需要延迟 |
| `ks.onTouchEnd` | **不依赖** | 快手真机上可能不存在或不可靠 |

### 12.5 方案对比

| 对比 | v1 (touchend 判定位移) | v2 (延迟 tap + move 取消) |
|---|---|---|
| 触发时机 | 等 touchend 才触发 | touchstart 后 80ms 延迟触发 |
| 滑动判断 | 比较起止点距离 < 10px | touchmove 过程中超 12px 立即取消 |
| 快手兼容 | 依赖 `ks.onTouchEnd`（可能不存在） | 只用 `ks.onTouchStart` + `ks.onTouchMove`（稳定） |
| 体感 | 可能无响应或坐标错误 | 滑动=取消 tap，点击=80ms 后触发（几乎无感） |

### 12.6 适用范围

所有纯 canvas 游戏（无 DOM 按钮）的触摸交互。DOM 按钮自带 click 判定不需要这个。

### 12.7 自检命令

```bash
# 检查 touchstart 是否直接调用 handleTap（❌ 错误模式）
grep -n "touchstart.*handleTap\|onTouchStart.*handleTap" package/js/main.js
# 应返回空（如果非空说明还在用错误模式）

# 检查是否使用延迟触发模式（✅ 正确模式）
grep -n "_startTap\|_cancelIfSwipe\|_tapPending" package/js/main.js
# 应返回有值
```

### 12.8 版本记录

| 版本 | 修改 | 说明 |
|---|---|---|
| v1.0.29 | touchend 方案 | ❌ 真机失败（ks.onTouchEnd 不可靠） |
| v1.0.30 | 延迟 tap + move 取消 | ✅ 真机验证通过 |


## 📦 十三、状态持久化 + 条件性 UI 隐藏模式（2026-08-12 沉淀）

### 13.0 通用模式

**场景**：用户完成某操作（加桌/看广告/分享解锁）后，该操作入口应从 UI 隐藏或变为已完状态，而非每次都展示。

**三件套**（与 9.13b 关卡/语音包 hidden 模式同构）：
1. **数据层**：localStorage/ks.setStorageSync 存标志（`key: 'laotie_xxx_v1'`，value `'1'`）
2. **渲染层**：读标志决定是否显示/隐藏入口
3. **清除层**：标志必须加入 `clearStorage` 的 keys 数组，否则"清除缓存"按钮无法重置

### 13.1 加桌状态持久化（v1.0.31）

**用户原话**：
> "再已添加过桌面快捷方式时—再次添加 → 只提示已添加哈 → 加桌的事件记录到本地 如果用户已经加桌过 就不再展示该入口 直接隐藏该入口"

**实现**：
```js
// 1) 数据层
var _SHORTCUT_KEY = 'laotie_shortcut_added_v1';
function _isShortcutAdded(){
  var raw = ks.getStorageSync(_SHORTCUT_KEY) || localStorage.getItem(_SHORTCUT_KEY);
  return raw === '1';
}
function _markShortcutAdded(){
  ks.setStorageSync && ks.setStorageSync(_SHORTCUT_KEY, '1');
  localStorage.setItem && localStorage.setItem(_SHORTCUT_KEY, '1');
}

// 2) 渲染层（底部栏条件隐藏入口）
if (!_isShortcutAdded()){
  items.push({ imgKey:'btn-desktop.png', label:'添加桌面', tap:addShortcut });
}

// 3) addShortcut 里检测已加桌
function addShortcut(){
  if (_isShortcutAdded()){ toast('已添加过桌面 ✔'); return; }
  // ... 调 API，成功后 _markShortcutAdded()
}

// 4) 清除层
var keys = [ ..., 'laotie_shortcut_added_v1' ];
```

### 13.2 解锁全部广告进度（v1.0.32）

**用户原话**：
> "解锁全部按钮 在该按钮旁边展示一个进度 当用户看过一个广告后 展示进度。x/x，如看了一个就是1/5"

**实现**：
```js
// 1) 数据层
var _UNLOCK_AD_TOTAL = 5;
var _UNLOCK_AD_KEY = 'laotie_unlock_ad_count_v1';
function _getUnlockAdCount(){ return parseInt(storage, 10) || 0; }
function _bumpUnlockAdCount(){ /* count++ → write storage */ return n; }
function _isAllUnlocked(){ return _getUnlockAdCount() >= _UNLOCK_AD_TOTAL; }

// 2) 渲染层（底部栏按钮标签实时进度）
{ label: _isAllUnlocked() ? '已解锁' : '解锁全部 ' + _getUnlockAdCount() + '/' + _UNLOCK_AD_TOTAL }

// 3) 弹窗里也显示进度
text('永久解锁全部场景（已看 ' + _done + '/' + _UNLOCK_AD_TOTAL + '）');

// 4) 广告回调里累加
M3.KwaiAd.showRewarded(function(ok){
  if (!ok){ toast('需看完广告才能解锁哦'); return; }
  var _n = _bumpUnlockAdCount();
  if (_n >= _UNLOCK_AD_TOTAL){ /* 解锁全部主题 */ }
  else { toast('进度 ' + _n + '/' + _UNLOCK_AD_TOTAL + '，再看 ' + (_UNLOCK_AD_TOTAL - _n) + ' 个即可解锁'); }
});

// 5) 清除层
var keys = [ ..., 'laotie_unlock_ad_count_v1' ];
```

### 13.3 铁律

- ✅ **已完成的功能入口应隐藏**（加桌后隐藏、解锁后变"已解锁"），避免重复操作和报错
- ✅ **进度型功能必须在入口旁显示进度**（x/N 格式），用户看了几个广告应该清楚
- ✅ **localStorage key 命名规范**：`laotie_{功能名}_v{版本}`（方便后续迁移/清除）
- ✅ **所有持久化 key 必须加入 clearStorage 的 keys 数组**（否则"清除缓存"无法重置）
- ❌ **禁止"只提示不隐藏"**：用户明确要求"不再展示该入口 直接隐藏"

### 13.4 版本记录

| 版本 | 修改 | 说明 |
|---|---|---|
| v1.0.31 | 加桌状态持久化 + 已加桌隐藏入口 | localStorage flag + 条件渲染 |
| v1.0.32 | 解锁全部进度 x/5 + 弹窗进度 + 累计 5 个才解锁 | localStorage counter + 按钮标签进度 |

### 13.5 🔴 主题级 hidden:true 模式（v1.0.34 · 帅哥靓男隐藏）

**用户原话**：
> "第四个场景 帅哥靓男属于还没开发完成的关卡可以先隐藏 注意 是隐藏哈！！！"

**核心**：与语音包 `hidden:true` 同构，但影响范围更大——主题隐藏需要 **6 处联动**：

| 位置 | 改动 | 漏掉会怎样 |
|---|---|---|
| `levels.js` THEMES 数据 | `{ id:3, ..., hidden:true }` | 数据源没有隐藏标记 |
| `drawThemeSelect()` | `var _visibleThemes = THEMES.filter(!t.hidden)` | 首页卡片仍然渲染 |
| `unlockAllByAd()` | `if (t.hidden) return;` | 全部解锁时 hidden 主题也被设为 unlocked |
| `restoreUnlockedThemes()` | `if (t.unlocked \|\| t.hidden) return;` | 清除缓存后 hidden 主题被 storage 残留恢复为 unlocked |
| 个人主页通关进度 | `filter(!t.comingsoon && !t.hidden)` | 通关进度里出现未开放主题 |
| `drawThemeCardV3()` | 间接（通过 _visibleThemes 控制） | — |

**注释铁律**：hidden 主题必须加注释说明后续上线时去掉 hidden 即可：
```js
// ⭐ hidden:true 暂时隐藏（尚未开发，全部解锁后也不显示进入按钮；后续上线时去掉 hidden 即可）
{ id:3, subject:'帅哥靓男', ..., hidden:true }
```

### 13.6 🔴 清除缓存必须全量扫描（v1.0.34 · 枚举漏 key 教训）

**用户原话**：
> "清除所有关卡和任务无法清除新增关卡3 不符合预期 清除应该清除所有！！"

**根因**：清除按钮用**硬编码 key 枚举列表**，每次新增 localStorage key 都要手动补到列表里，漏了就清不掉。

**正确做法**：localStorage 用前缀扫描（有 `keys()` API）；ks.storage 无 `keys()` API，保留枚举但必须把枚举列表当**维护清单**每次新增 key 时同步更新。

```js
// ✅ localStorage：前缀扫描（不遗漏）
var _prefixes = ['laotie_', 'theme_'];
for (var _ki=0; _ki<localStorage.length; _ki++){
  var _k = localStorage.key(_ki);
  if (_k && _prefixes.some(function(p){ return _k.indexOf(p)===0; })){
    localStorage.removeItem(_k);
  }
}

// ⚠️ ks.storage：无 keys() API，只能枚举（每次新增 key 必须同步）
var keys = [
  'laotie_last_level_1', ..., 'laotie_passed_set_v1',  // ← 新增必须补！
];
keys.forEach(function(k){ ks.removeStorageSync(k); });
```

**铁律**：每次新增 `laotie_*` 或 `theme_*` 前缀的 localStorage key 时，**必须同步**添加到清除按钮的枚举列表里。否则"清除缓存"无法重置该功能。

### 13.7 🔴 关卡图片路径：本地优先于 CDN（v1.0.34 · spot 加载中）

**用户原话**：
> "关卡2，10-12关图片显示加载中"

**根因**：spot lv10-12 的 `sceneA`/`sceneB` 用了 CDN URL（`https://p4-ad.adkwai.com/...`），但本地包里有对应文件（`assets/scenes/spot/lv10_a.jpg`）。CDN 在快手小游戏容器内可能限速/超时/被拦截，导致图片加载中。

**铁律**：
- ❌ **禁止**对本地已有的图片走 CDN URL
- ✅ 优先用本地相对路径 `assets/scenes/xxx/lvN.jpg`
- CDN URL 仅用于**本地包没有**的大图（如 hunt 场景图，本地只有 icons/）
- 新增关卡时，如果图片 ≤500KB 就放本地包；>500KB 再走 CDN

**自检命令**：
```bash
# 检查 levels.js 中是否有本地文件存在的 CDN 引用（应该为 0）
cd /Users/fat/Desktop/aiminigame/game-aigc-product-hub/games/ks658651445853447417
for URL in $(grep -oE "https://p[45]-ad\.adkwai\.com[^']*" package/js/levels.js); do
  FILENAME=$(echo "$URL" | sed 's|.*/||')
  # 检查本地是否有同名或对应文件
  FOUND=$(find package/assets/ -name "$FILENAME" -o -name "$(echo $FILENAME | sed 's/s[23]_//')" 2>/dev/null | head -1)
  if [ -n "$FOUND" ]; then
    echo "❌ CDN 有本地副本: $URL → $FOUND"
  fi
done
```

### 13.8 通关弹窗 UX：主题最后一关按钮联动（v1.0.33）

**用户原话**：
> "当前看完一个场景的全部关卡后 现在是弹出了首页 需要修改为展示 toast"

**铁律**：
- 主题最后一关通关时，右按钮从 **"下一关"**（绿色）→ **"回首页"**（金色）
- 同时弹出 toast：**"恭喜你已全部通关！去玩玩别的场景吧 🎉"**
- 非"跳关"路径（`pickLevel` skip 路线）也同步改文案

### 13.9 🔴🔴🔴 桌面包/外部包同步铁律（v1.0.41 · 2026-08-13 沉淀 · 被用户连骂三次）

**用户原话 1**（素材被丢）：
> "桌面包多出的 12 张 UI 图（banner-blue.png / toggle-on.png / vp-locked.png 等）在活代码里零引用，属于历史废弃素材，故舍弃。？？？？这些为啥 0 引用？你要思考 桌面包做的好的部分！！！我们给拿过来用 草泥马的！！"

**用户原话 2**（保守暂放）：
> "🟡 素材已入包，代码里手撸卡片风格与切图不完全兼容，暂放素材待后续替换（保险起见没强行覆盖当前 v0.0.98 已上线的手撸卡片，避免整个语音包区域……为啥你不直接参考桌面的包 替换？？？"

#### 13.9.1 核心铁律：零引用 ≠ 废弃

当桌面包/外部包多出活代码里"零引用"的 UI 素材时，**绝对禁止**直接判定为"废弃素材丢弃"。正确做法：

1. **先去桌面包的 JS 代码里 grep 这些素材文件名**，看桌面代码是怎么用的
   ```bash
   BAK="/Users/fat/Desktop/老铁眼真尖.bak.20260813_192543"
   grep -rn "vp-selected\|toggle-on\|btn-close\|win-bg" "$BAK/js/"
   ```
2. 这些素材**往往是设计师做好的切图版 UI**，活代码还在手撸圆角矩形/emoji，桌面已经是切图版
3. **直接 cp 素材进活代码包** + **把对应的绘制代码也照抄过来替换活代码手撸部分**

#### 13.9.2 核心铁律：照抄桌面源码，不要"保守暂放"

发现切图后**绝对禁止**"暂放素材待后续替换"。必须：

1. 读桌面源码里用这些素材的具体实现（drawImage 参数、三态映射逻辑等）
2. **直接照抄替换活代码的手撸部分**，保留 fallback 机制（切图加载失败时回退到手撸绘制）
3. 一次性全部接入，不要分批"先接 5 张，留 7 张待后续"

#### 13.9.3 标准接入模式（可复用）

```js
// ❌ 错误：保守"暂放"
// "🟡 素材已入包，代码里手撸卡片风格与切图不完全兼容，暂放素材待后续替换"

// ✅ 正确：切图优先 + fallback 手撸
var _cardKey = selected ? 'assets/ui/vp-selected.png'
               : (locked ? 'assets/ui/vp-locked.png' : 'assets/ui/vp-unlocked.png');
var _cardBgImg = state.imgs[_cardKey];
if (!_cardBgImg && !state.imgLoading[_cardKey]) { try { loadImg(_cardKey); } catch(_e){} }
if (_cardBgImg && _cardBgImg.width > 0) {
  try { ctx.drawImage(_cardBgImg, px(cardX), py(cardY), ps(cardW), ps(cardH)); } catch(e){}
} else {
  // fallback：手撸 fillRR + strokeRR（切图没加载到才走这里）
  fillRR(...); strokeRR(...);
}
```

#### 13.9.4 必须接入的素材清单（2026-08-13 已接入 v1.0.39）

| 素材 | 用途 | 桌面源码位置 | 活代码接入位置 |
|---|---|---|---|
| `toggle-on.png` / `toggle-off.png` | 全局音乐 & 背景音乐开关 | `game.js:1423-1431` | `game.js drawSettingsOverlay` |
| `btn-close.png` | 设置面板关闭 X | 同上 | 同上 |
| `icon-lock.png` | 语音包卡片锁态徽章 | `game.js:1601-1607` | 同上 |
| `icon-trash.png` | 清除进度按钮图标 | 同上 | 同上 |
| `win-bg.png` | 通关弹窗背景板 | 同上 | `game.js drawWinModal` |
| `vp-selected.png` / `vp-locked.png` / `vp-unlocked.png` | 语音包卡片三态切图 | `game.js:1543-1545` | `drawSettingsOverlay` 语音包卡片 |
| `banner-blue.png` | 设置面板顶部蓝色标题横幅 | `game.js:1260,1387` | `drawSettingsOverlay` 标题栏（v1.0.41 接入） |
| `icon-music.png` | 全局音乐行左侧图标 | `game.js:1423` | `drawSettingsOverlay` 全局音乐行（v1.0.41 接入） |
| `icon-speaker.png` | 背景音乐行左侧图标 | `game.js:1431` | `drawSettingsOverlay` 背景音乐行（v1.0.41 接入） |

#### 13.9.5 包同步工作流（可复用）

```bash
# 1. 备份桌面包（带时间戳）
DESK="/Users/fat/Desktop/老铁眼真尖"
mv "$DESK" "${DESK}.bak.$(date +%Y%m%d_%H%M%S)"

# 2. 活代码包 → 桌面包（活代码为主体）
OURS="/Users/fat/Desktop/aiminigame/game-aigc-product-hub/games/ks658651445853447417/package"
rsync -a --exclude='.DS_Store' --exclude='tmp/preview-*.png' "$OURS/" "$DESK/"

# 3. 检查桌面包多出的素材（注意：不是丢弃，而是接入）
diff -r "$OURS/assets/ui/" "${DESK}.bak.20260813_192543/assets/ui/" | grep "Only in"

# 4. grep 桌面源码看这些素材怎么用
grep -rn "素材文件名" "${DESK}.bak.20260813_192543/js/"

# 5. 把素材 cp 进来 + 把绘制代码照抄进活代码

# 6. bump 版本三件套 + 上传
```

#### 13.9.5 rsync 覆盖数据字段铁律（v1.0.40 · 2026-08-13 沉淀 · 第三次违反）

**场景**：从桌面包 `.bak` 目录 rsync 覆盖活代码时，**数据字段可能被覆盖丢失**。

**本次踩坑**：`voice-packs.js` 里 `kuergou`/`lala` 的 `hidden:true` 字段在之前的 rsync 操作中被覆盖丢失，且 `game.js` 的 `drawSettingsOverlay` 从未做过 `.filter(!p.hidden)` 过滤，导致辣辣/酷二狗语音包再次漏出。

**用户原话 3**（数据被覆盖）：
> "为啥 辣辣和酷二狗的语音包和 icon 又漏出来了？？？？"

**铁律**：rsync 覆盖后**必须检查数据字段是否丢失**，特别是：
1. `voice-packs.js` 的 `hidden:true` 字段（§9.13b 三层同步）
2. `levels.js` 的 `hidden:true` / `diff` / `boss` 等标记字段
3. 任何 JS 数据文件里的**语义字段**（非代码逻辑字段）

**自检命令**（rsync 后必跑）：
```bash
# 检查 hidden:true 是否丢失
grep -c "hidden:true" package/js/voice-packs.js
# 应 ≥ 2（kuergou + lala），若 = 0 说明被覆盖了

# 检查 game.js 是否有 filter
 grep -c "_visiblePacks\|filter" package/js/game.js
# 应 > 0，若 = 0 说明过滤逻辑缺失
```

#### 13.9.6 违反本铁律的处置

- **第一次违反**（素材被丢）：用户骂"草泥马" → 立刻把素材 cp 进来 + 接入代码 + 重新上传
- **第二次违反**（保守暂放）：用户骂"为啥不直接参考桌面包替换" → 立刻照抄桌面源码替换手撸部分 + 重新上传
- **第三次违反**（备用不接入）：用户骂"这个也用的到啊！！！参考桌面" → 立刻参考桌面源码把 banner-blue/icon-music/icon-speaker 接入 drawSettingsOverlay
- **第四次违反**（rsync 覆盖数据字段）：用户骂"为啥又漏出来了" → 立刻检查 hidden:true + 补 .filter() 过滤 + packsN 重算（§9.13b 三层同步）
- **下次再违反**：立即 revert + 道歉不解释 + 写进本铁律

**核心教训**："零引用≠废弃""照抄不暂放""备用也接入""rsync 后检查数据字段" — 四条缺一不可。


## 🔴 十四、rsync 桌面包覆盖导致线上逻辑丢失（2026-08-14 血案）

### 14.1 事故经过

v1.0.34（线上包，昵称"九九"）→ 中间某次用 rsync 从桌面包覆盖到 repo `package/` → v1.0.29~v1.0.34 迭代的 **hidden 过滤逻辑全部被旧版覆盖丢失** → 后续版本在此基础上继续开发，丢失的逻辑一直没人发现 → 直到用户发现"辣辣和酷二狗的语音包又漏出来了"。

### 14.2 丢失的逻辑清单（v99 diff 审计结果）

| 丢失项 | 原位置（v1.0.34） | 表现 |
|---|---|---|
| 语音包 `hidden:true`（辣辣/酷二狗） | `voice-packs.js` | 设置面板显示隐藏语音包 |
| `_visiblePacks = VOICE_PACKS.filter(!p.hidden)` | `game.js` 两处 | 未过滤直接渲染隐藏包 |
| 帅哥靓男主题 `hidden:true` | `levels.js` THEMES | 首页显示未开发主题 |
| `_visibleThemes = THEMES.filter(!t.hidden)` | `game.js` 首页 | 首页卡片列表含隐藏主题 |
| unlock 全部跳过 `if (t.hidden) return` | `game.js` | 隐藏主题被错误解锁 |
| restore 时跳过 `if (t.unlocked \|\| t.hidden) return` | `game.js` | 隐藏主题被读回解锁状态 |
| 清除前缀通杀 `laotie_*/theme_*` | `game.js` | 逐条枚举漏 key |

### 14.3 🔴 铁律：rsync 后必须做 diff 审计

**每次**从外部包（桌面包/备份包）rsync 到 repo `package/` 后，**必须**：

```bash
# 审计命令（将 OLDPATH 替换为覆盖前的旧包路径）
OLDPATH="/Users/fat/Desktop/老铁眼真尖 (九九)"  # 之前的线上包
NEWPATH="/Users/fat/Desktop/aiminigame/game-aigc-product-hub/games/ks658651445853447417/package"
diff -rq "$OLDPATH/js" "$NEWPATH/js" | grep DIFF
# 对每个 DIFF 文件做逐行 diff，重点搜：
#   hidden / filter / _visible / return  /  解锁 / 清除
```

**不做 diff 审计 = 盲目覆盖 = 铁律迟早再丢。**

### 14.4 hidden 三层同步完整自检（§9.13b 补充）

```bash
GAME=/Users/fat/Desktop/aiminigame/game-aigc-product-hub/games/ks658651445853447417/package
echo "=== hidden 九项自检 ==="
echo "① 语音包 hidden:true:";  grep -c "hidden:true" $GAME/js/voice-packs.js
echo "② _visiblePacks filter:"; grep -c "_visiblePacks" $GAME/js/game.js
echo "③ 帅哥靓男 hidden:true:"; grep -c "hidden:true" $GAME/js/levels.js
echo "④ _visibleThemes filter:"; grep -c "_visibleThemes" $GAME/js/game.js
echo "⑤ unlock跳过hidden:";    grep -c "if (t.hidden) return" $GAME/js/game.js
echo "⑥ restore跳过hidden:";   grep -c "t.unlocked || t.hidden" $GAME/js/game.js
echo "⑦ 清除前缀通杀:";        grep -c "_prefixes.some" $GAME/js/game.js
echo "⑧ 加桌隐藏:";            grep -c "_isShortcutAdded" $GAME/js/game.js
echo "⑨ x/5进度:";             grep -c "_UNLOCK_AD_TOTAL" $GAME/js/game.js
echo "（全 >0 才过关）"
```


## 🔴 十五、welcome.js 卡 52% 修复 · v1.0.49/50 失败 → v1.0.51 真正修复（2026-08-14）

### 15.1 事故表现

真机上游戏启动后 loading 卡在 52%，无法进入首页。用户反馈"打不开"。

### 15.2 根因（四条叠加 · 按优先级排序）

1. ⭐ **`js/game.js` 有 6 处未解决的 git merge 冲突**（`<<<<<<< Updated upstream` / `=======` / `>>>>>>> Stashed changes`），导致 **SyntaxError**，整个 game.js 无法执行 → welcome.js 卡死。**这才是 v1.0.49 和 v1.0.50 都卡 52% 的真凶**，但 v1.0.50 排查时只看了包体大小，从未检查 JS 语法！
2. ⭐ **`js/main.js` 有 2 处触摸事件缺失闭合括号**（`canvas.addEventListener('touchmove')` 和 `ks.onTouchMove` 缺 `}, { passive:false });`），同样 SyntaxError。
3. **CRITICAL_ASSETS 塞了 3 张关卡图**（`lv1/lv2/lv6`，v1.0.16 加的）：关卡图路径深、体积 200KB，真机 CDN 慢时 `onload` 不触发或极慢
4. **`window.loadImg` 从未暴露**：welcome.js:71 有自动重试逻辑，但 `loadImg` 函数从未赋值到 `window` 或 `M3`，该分支**永远走不到**，图失败后无自愈

> ⚠️ **主包过大（29MB）是加重因素但不是 v1.0.49/50 的根因**：即使包体缩小到 5MB，如果 JS 有 SyntaxError，游戏照样打不开。v1.0.50 的所有包瘦身工作方向正确但未能修复 52%，因为真正的 SyntaxError 没被发现。

### 15.3 🔴🔴🔴 v1.0.49 修复（失败！只治标不治本）

| 修复项 | 前 | 后 |
|---|---|---|
| CRITICAL_ASSETS | 10 项（含 lv1/lv2/lv6） | 7 项（仅 UI + 4 封面） |
| 兜底超时 | 8 秒 | 4 秒 |
| `loadImg` 暴露 | 未暴露 | `M3.loadImg = loadImg; window.loadImg = loadImg;` |

**上传后真机测试：仍然卡 52%！** 用户原话：
> "还是卡在 52%！！你到底在干嘛啊 ！为啥下载不完 打不开？？包体多大？？？草泥马的"

**我第一反应错误（血泪教训）**：删 6 个大文件把 29MB → 20MB。用户立刻爆怒：
> "管你妈的！！！！不要删除啊！！然后应该是**先小包体进去 然后开始分包加载别的素材或者是 cdn 加载别的素材** 草泥马的"

### 15.4 ⚠️ v1.0.50 修复（也失败了！包瘦身方向正确但未修真因）

v1.0.50 做了大量包瘦身工作（ignore 排除、BGM 转 CDN、CRITICAL_ASSETS 精简），方向正确，**但 v1.0.50 仍然卡 52%**！因为 JS 文件中的 git merge 冲突和缺失括号仍未修复，SyntaxError 持续存在。

**用户原话**：
> "还是 52% 打不开 请你彻底修复！！草泥马的！！"

**血泪教训**：v1.0.50 排查时只看了包体大小，从未执行 `node -c js/*.js` 检查 JS 语法。**52% 卡死的第一步排查必须是语法检查，不是包体大小！**

### 15.5 ✅ v1.0.51 真正修复：清除 git merge 冲突 + 补缺失括号 + CDN 分包

#### 修复 1（真凶）：清除 game.js 的 6 处 git merge 残留

```bash
# 发现方式
grep -n "^<<<<<<\|^=======$\|^>>>>>>>" package/js/game.js

# 6 处冲突位置（行号范围）:
# 1400-1435, 1443-1666, 1687-1750, 1768-2015, 2278-2404, 3585-3602
```

**处理方式**：用 Python 逐行状态机解析，保留 "Updated upstream" 侧（较新的 v1.0.x 代码），丢弃 "Stashed changes" 侧：

```python
mode = 'normal'  # normal | upstream | stashed
for L in lines:
    t = L.rstrip('\n')
    if t.startswith('<<<<<<< '): mode = 'upstream'; continue
    if t == '=======' and mode == 'upstream': mode = 'stashed'; continue
    if t.startswith('>>>>>>> '): mode = 'normal'; continue
    if mode == 'stashed': continue  # 丢弃 stashed 侧
    out.append(L)
```

⚠️ 正则方式 `re.sub(r'<<<<<<< ...\n(.*?)\n=======\n(.*?)\n>>>>>>> ...\n', r'\1\n', ...)` **不可靠**，因为嵌套 `=======` 会误匹配。必须用逐行状态机。

#### 修复 2：补 main.js 的 2 处触摸事件缺失闭合括号

```js
// canvas.addEventListener('touchmove'...) 缺少 }, { passive:false });
// ks.onTouchMove(...) 缺少 });
```

#### 修复 3：CDN 分包 URL 重写层（game.js loadImg + feedback.js _createAudio）

```js
// game.js — loadImg 开头加 URL 重写
src = _rewriteToCDN(src);

// _rewriteToCDN: assets/scenes/spot/lvN_[ab].jpg → CDN s2_lvN_[ab].jpg
//               assets/scenes/hidden/lvN.jpg → CDN hidden_lvN.jpg
//               assets/scenes/covers/sceneN.jpg → CDN cover_sceneN.jpg

// feedback.js — _createAudio 开头加音频 CDN 重写
src = _rewriteAudioCDN(src);
// _rewriteAudioCDN: assets/audio/voices/<pack>/<file>.mp3 → CDN voice_<pack>_<file>.mp3
```

#### 修复 4：project.config.json ignore 扩容

排除 spot/hidden/covers/voices 的本地副本（163 个文件已上 CDN），主包大幅瘦身。

### 15.6 v1.0.51 结果

- `node -c js/*.js` 全通过（8 个 JS 文件语法无误）
- ksmg upload 成功，无"请登录快手"假成功
- CDN 163 个资源已上传（spot/hidden/covers/voices/bgm_2）
- v1.0.51 上传成功，等待真机验证

### 15.7 铁律（v1.0.51 增订 · 覆盖 v1.0.50 铁律）

#### 52% 卡死排查铁律（最重要 · 新增）

- 🔴🔴🔴 **52% 卡死的第一步排查必须是 `node -c js/*.js` 语法检查**，不是包体大小！
  - JS SyntaxError 会导致整个文件无法执行，welcome.js 卡在 52% 是必然的
  - git merge 冲突残留（`<<<<<<<` / `=======` / `>>>>>>>`）是 SyntaxError 的常见来源
  - 缺失闭合括号也是常见来源（特别是事件监听器）
- ✅ 每次 git merge / rsync 覆盖 / 大规模代码修改后，**必须跑 `for f in js/*.js; do node -c "$f"; done`**
- ✅ 死亡三问升级版（第 4 问）：**"JS 语法有没有炸？"** → `node -c package/js/game.js && node -c package/js/main.js`
- ⚠️ **主包过大是加重因素但可能不是根因**：v1.0.50 把包从 29MB 瘦到 ~22MB 仍然卡 52%，因为 SyntaxError 才是真凶

#### 小主包 + CDN 分包铁律（保留 v1.0.50 沉淀）

- ❌ **禁止用"删除素材"方式减小主包**（用户明令禁止："不要删除啊！"）。本地 repo 一个文件都不删
- ✅ **用 `project.config.json setting.ignore` 排除 CDN 副本/零引用文件**（本地保留，打包排除）
- ✅ **BGM 等大文件（>500KB）优先走 CDN**，`feedback.js bgm_list` 直接写 CDN URL，短音效（<50KB）保留本地
- ✅ **CDN URL 重写层模式**（v1.0.51 新增）：在 `loadImg` / `_createAudio` 入口加 `_rewriteToCDN(src)` 函数，运行时自动将本地路径改写为 CDN URL，本地文件保留作为 fallback
  - 命名前缀避撞铁律：spot → `s2_`，hidden → `hidden_`，covers → `cover_`，voices → `voice_{pack}_`
- ✅ **CRITICAL_ASSETS 只放真·首屏必需 UI**（≤3 张，<500KB 总量），covers 等次屏素材改背景 lazy load
- ✅ **兜底超时 ≤ 3 秒**（3 张小图 <500KB，CDN 通就秒过，3 秒足够）
- ❌ **禁止在 CRITICAL_ASSETS 里加关卡场景图**（进关时自然加载）
- ✅ **新增 loadImg 后必须暴露**到 `M3.loadImg` / `window.loadImg`，否则 welcome.js 的失败重试形同虚设
- ⚠️ **`ignore` 是数组不是对象**，别往里塞注释键，JSON 会爆 `Expecting ',' delimiter`

#### 52% 卡死诊断决策树（v1.0.51 新增）

```
游戏卡 52% 打不开
    ↓
第一步：node -c js/*.js — 语法检查
    ├── 有 SyntaxError → 修 JS 语法（git merge 冲突? 缺括号?）
    └── 全通过 → 第二步
    ↓
第二步：du -sh package/ — 主包大小
    ├── > 20MB → 瘦身（ignore 排除 + CDN 分包）
    └── < 10MB → 第三步
    ↓
第三步：CRITICAL_ASSETS 检查 — 是否太多/太大
    ├── > 3 张或 > 500KB → 精简 + lazy load 次屏
    └── ≤ 3 张 → 第四步
    ↓
第四步：CDN 网络排查 — curl 验证 CDN URL 是否可达
    ├── 404 → CDN 未上传或路径错误
    └── 200 → 其他问题（需真机抓包）
```

### 15.8 版本号

| 版本 | 修复内容 | 结果 |
|---|---|---|
| v1.0.49 | CRITICAL_ASSETS 精简 + loadImg 暴露 + 兜底 4s | ❌ 仍卡 52% |
| v1.0.50 | 小主包 + CDN 分包 + ignore 排除 + BGM 转 CDN | ❌ 仍卡 52%（SyntaxError 未修） |
| v1.0.51 | 清除 game.js 6 处 git merge 冲突 + main.js 2 处缺括号 + CDN URL 重写层 + ignore 扩容 | ✅ 语法通过，待真机验证 |


## 🔴🔴🔴 十六、v1.0.97 语音包丢失事故 · 云端优先 build 铁律（2026-08-19 血案）

### 16.1 事故经过

**受害**：v1.0.96 (2026-08-18 20:45 上线) 精心制作的「6号乖崽 v3 音色 26 条 mp3 + 新命名绕开 CDN edge cache + lv50 六号专属舞台合影关」，在 v1.0.97 (2026-08-19 15:00) 全部丢失。

**根因链条（多重错配级联）**：

1. **v1.0.96 从未 push 到 origin/dev**
   - GitLab push rule 只允许 `^(dev|master)$`，用户在 `skill/laotie-zhaocha-strict-guard` 分支工作
   - 尝试 `git push origin <feature-branch>` 被 pre-receive hook 拒绝
   - 用户没意识到必须 `git push origin HEAD:dev` 才能上云 → **本地孤本**

2. **git stash 后切分支 → 改动进入 stash@{1}**
   - 08-18 21:23 用户 `git stash` 保存 v79-96 累积工作区
   - 切到 skill 分支，再 `git fetch origin dev` fast-forward → 只到 origin/dev 停留的 v1.0.73

3. **在陈旧基线上打新版本 → 直接吃掉一堆改动**
   - 08-19 15:00 用户以为工作区是「最新」，实际是 v1.0.73 baseline
   - 顺手 bump 到 v1.0.97 → 4 个 URL 改动 + 版本号
   - ksmg upload 成功，但包体缺失 v1.0.79-96 的所有改动（6号乖崽/lv50/CDN 重写/所有 audit 修复）

### 16.2 🔴🔴🔴 **云端优先** build 五大铁律

任何一次 ksmg upload/preview 前必须满足：

**① stash 非空 → 阻断 build**
`git stash list | wc -l` 必须 = 0。存在 stash 说明有未合入的工作，禁止进入 build。

**② 冲突标记非空 → 阻断 build**
`grep -rln '^<<<<<<< \|^>>>>>>> ' package/` 必须为空。有冲突标记说明 stash apply/merge 没完成。

**③ local 必须与 origin/dev 完全一致**
- 落后 → `git pull --rebase origin dev`
- 领先 → `git push origin HEAD:dev`（注意：feature 分支要用 `HEAD:dev` refspec）
- 分叉 → 手动 rebase

**④ 版本号三件套一致**
- `main.js` `BUILD_VER = 'vX.Y.Z'`
- `main.js` `[MARKER vNN]`
- `index.html` 所有 `?v=NN` 统一到最新 NN

**⑤ 上传成功后立即 push+tag**
- `git push origin HEAD:dev`
- `git tag -a laotie-vX.Y.Z -m "..."` + `git push origin laotie-vX.Y.Z`

### 16.3 落地脚本（已沉淀到 games/ks658651445853447417/skill/scripts/）

**每次 build 走 `ksmg-preview-safe.sh`**（禁止裸调 `ksmg upload`）：

```bash
bash skill/scripts/ksmg-preview-safe.sh upload "1.0.98" "changelog"
# 内部按序执行:
# 1. stash 检查 → 阻断
# 2. 冲突标记检查 → 阻断
# 3. 分支必须是 dev/master/main
# 4. package/ 有未 commit → 逼 commit
# 5. git fetch → 落后则阻断（要求 pull）
# 6. git push origin HEAD:dev → 云端固化
# 7. 版本号三件套自检
# 8. laotie-check.sh 12 项校验
# 9. ksmg upload
# 10. git tag -a laotie-vX.Y.Z + push tag
```

**每次改代码前走 `pull-first-guard.sh`**：

```bash
bash skill/scripts/pull-first-guard.sh
# 自动 fetch + 落后则 rebase + 显示 stash 警告 + 打印当前 BUILD_VER
```

### 16.4 GitLab feature 分支 push 陷阱（v1.0.97 事故直接诱因）

**症状**：`git push origin feature/xxx` 报错 `pre-receive hook declined: branch name does not follow the pattern '^(dev|master)$'`

**破解**：不管你在哪个 feature 分支，push 到远端必须重定向到 dev：

```bash
git push origin HEAD:dev
```

**推论**：**永远不要在 feature 分支上「养」几十个 commit 不 push**。养的越久，切分支 + stash 造成的丢包风险指数级增长。

### 16.5 stash 三律

- **律 1**：`git stash` 之前先 `git status`，超过 20 个变化文件的 stash 一定会踩坑（人类记不住存了啥）
- **律 2**：`git stash` 之后必须在 8 小时内 `git stash pop`。超过 8 小时的 stash 视为「僵尸 stash」，容易被切分支+ fast-forward 抛弃
- **律 3**：`git stash list` 有 > 3 条时立即清理。累积 stash 越多，人肉配对越难

### 16.6 快速自检命令（每次坐下改代码时先跑）

```bash
cd games/ks658651445853447417
bash skill/scripts/pull-first-guard.sh          # 拉最新
git stash list | wc -l                          # 应为 0（>0 立即处理）
grep -rln '<<<<<<< ' package/ 2>/dev/null       # 应为空
grep BUILD_VER package/js/main.js | head -1     # 确认起点版本号
git log --oneline origin/dev -3                 # 云端最新 3 个 commit
```

## 🔴🔴🔴 十七、Build 完成后必须输出「10 项强制报告」（2026-08-19 沉淀）

### 17.1 需求背景

**用户明确要求**：每次 build 完，主 Agent 必须**一定一定**输出以下 10 项信息，不允许省略、不允许模糊。这不仅是给发起人看的，也是团队协作的**溯源单据**。

### 17.2 🔴 10 项强制报告清单

| # | 字段 | 数据来源 | 强制 |
|---|------|----------|------|
| 1 | **二维码 / 预览路径** | `ksmg preview -o` 生成的 PNG 路径 或 后台 URL | ✅ |
| 2 | **版本号三件套** | `main.js BUILD_VER` / `[MARKER vNN]` / `index.html ?v=` | ✅ |
| 3 | **更改内容 (changelog)** | 命令行参数 `-c` | ✅ |
| 4 | **Git 推送状态** | `git push origin HEAD:dev` 结果 + tag 状态 | ✅ |
| 5 | **本地 Skill 是否变更** | `git status -s` on skill dir | ✅ |
| 6 | **云端 Skill 是否同步** | 对比 skill 仓 local vs origin/main | ✅ |
| 7 | **主包大小变化** | `du -sk package --exclude=subpackages` 前 vs 后 | ✅ |
| 8 | **总包大小变化** | `du -sk package` 前 vs 后 | ✅ |
| 9 | **AppID / Cmd / 时间** | 上下文变量 | ✅ |
| 10 | **后续动作 checklist** | 扫码验证 / 后台提审 / 报告存档 | ✅ |

### 17.3 落地机制（三层保障）

**Layer A · 脚本自动生成**（不依赖 Agent 记忆力）：
- `ksmg-preview-safe.sh` 在 build 完成后**自动**生成 markdown 报告，落盘到：
  ```
  games/ks658651445853447417/build-qrcodes/v<VER>-report.md
  ```
- 报告文件里 10 项数据全部**精确到 KB**，避免人工估算

**Layer B · Subagent 强制约束**（不依赖 Agent 遵守文档）：
- 用户说「build/上传/扫码/预览」→ 主 Agent **必须**调用 `laotie-build-guard` subagent
- Subagent 的最后一条回复**必须**以 10 项报告开头
- 缺少任何一项，视为 subagent 任务失败

**Layer C · Memory 沉淀**（不依赖 Agent 跨会话记忆）：
- 每次 build 结束后写 memory：`本次 build vX.Y.Z + changelog + tag hash + skill sync 状态`
- 下一次会话开新 subagent 时能读到历史

### 17.4 【铁律】主 Agent 何时必须调 subagent

**关键词触发（大小写不敏感）**：
- 中文：`build`、`上传`、`发布`、`扫码`、`预览`、`打包`、`出码`、`上线`、`构建`、`ksmg`、`新版本`、`版本号`
- 英文：`build`、`upload`、`ksmg`、`preview`、`release`
- 上下文触发：只要提到「老铁眼真尖 / laotie-zhaocha / ks658651445853447417」并有意图动作

**触发后立即**：
```
use_subagent(subagent_name="laotie-build-guard",
             task="用户要 build v1.0.XX，changelog: xxx",
             reason="强制走 10 步 build 流水线 + 输出 10 项报告")
```

### 17.5 报告输出模板（一字不差照抄）

```markdown
## 🎮 老铁眼真尖 · Build 强制报告 · v1.0.XX

📌 1. 二维码 / 预览路径: <path or URL>
📌 2. 版本号: BUILD_VER=v1.0.XX / [MARKER vNN] / index.html ?v=NN (X处一致)
📌 3. 本次 changelog: <content>
📌 4. Git 推送: local↔origin/dev=<status>, Tag laotie-v1.0.XX=<status>
📌 5. 本地 Skill: ✅ 干净 / ⚠️ 有未提交改动
📌 6. 云端 Skill: ✅ 云端=本地 / ⚠️ 不一致
📌 7. 主包大小: 前 X MB → 后 Y MB（差 ±Z KB）
📌 8. 总包大小: 前 X MB → 后 Y MB（差 ±Z KB）
📌 9. AppID/Cmd/时间: ks658651445853447417 / ksmg upload / 2026-08-19 HH:MM:SS
📌 10. 后续动作:
   □ 扫码验证 6号乖崽语音 / lv50 / 北上广深图
   □ 后台提审 https://open.kuaishou.com/platform/minigame/manage/game_info?appId=ks658651445853447417
   □ 报告已存到 build-qrcodes/v1.0.XX-report.md
```

### 17.6 违约后果

- 主 Agent 没调 subagent 直接 `ksmg upload` → **等同 v1.0.97 事故**（可能丢改动、不留报告、无 tag）
- Subagent 输出报告缺项 → 用户无法追溯，团队协作断链
- Skill 修改不 push 云端 → 其他人下次仍会踩坑

**记住 v1.0.97 教训：省一步流程 = 亏一个语音包 + 一整晚复盘。**

---

## 🆕 十八、新增关卡 SOP + 关卡 JSON 动态下发（2026-08-19 v1.0.100 沉淀）

### 18.0 触发词

用户说以下任一话术，AI **必须严格按本章 7 步走**，不得跳步：

- 「加一关」「新增关卡」「新加第 X 关」「加个关卡」
- 「热更关卡」「不发版加关」「动态下发新关卡」
- 「改一下第 X 关的时长/hint/spot」（走热更路线，不 build）
- 「levels-config.json」「level-loader.js」「远程 JSON」

### 18.1 关卡上线两条路线（关键岔路）

| 路线 | 何时用 | 步骤 | 上线时长 | 用户需更新 |
|---|---|---|---|---|
| **A · 热更（推荐）** | 只改数据（title/duration/hint/spots/props/hiddenIdxRanges/新增关卡数据） | 7 步 | ⚡ 3 分钟 | ❌ 不需 |
| **B · 发版** | 逻辑改动/UI改动/新玩法机制/新 API | 走 §17 build 10 步 | 🐌 1-3 天审核 | ✅ 需下新版 |

**默认走 A**，除非涉及代码逻辑。

### 18.2 路线 A · 热更 SOP（7 步）

```bash
# ┌─ Step 1: AIGC 出场景图（美术/AI 生图）──────────
#   scene1 hidden: 单张原图（含异物）
#   scene2 spot:   sceneA / sceneB 双张（找不同）
#   scene4 hunt:   单张原图（含寻物）

# ┌─ Step 2: 图上传 CDN ─────────────────────
#   scene1 → ks693835817972937121 桶（分包 AppID · hidden_lvNN.jpg）
#   scene2/4 → ks658651445853447417 桶（主 AppID · s2_lvNN_a.jpg / s3_lvNN.jpg / s3_hunt_lvNN.jpg）
#   ⚠️ 千万别混桶 —— 见 §「laotie-zhaocha-coord-workflow」skill 双 AppID 铁律

# ┌─ Step 3: laotie-editor 拉框标坐标 ────────
#   打开 https://laotie-editor.frontend-cloud.corp.kuaishou.com
#   → 拉框 → 每个异物写中文 tag（禁止英文 · 见 §7）
#   → 导出 JSON

# ┌─ Step 4: 粘贴到 package/js/levels.js M3.LEVELS 数组 ─
#   坐标是 % 相对整张原图（不是相对舞台）
#   idx 递增（注意 hiddenIdxRanges 是否会隐藏新 idx）

# ┌─ Step 5: 本地自检 ─────────────────────
cd /Users/fat/Desktop/aiminigame/game-aigc-product-hub/games/ks658651445853447417
bash skill/scripts/laotie-check.sh
#   检查项：坐标数量对齐 · duration 公式覆盖 · 中文 tag · SCENE_META vs EXIST 双向同步

# ┌─ Step 6: 生成 + 上传 CDN JSON ═════════════ 【关键·热更核心】
node scripts/gen-levels-config.js
node scripts/upload-levels-json.js 14_da7d82d193d14fc536c0a1ce0cc0c2e9

# ┌─ Step 7: 验证 ────────────────────────
curl -s "https://p1-ad.adkwai.com/udata/pkg/KS-GAME/AIGC-SoGame/ks658651445853447417/levels-config.json?_t=$(date +%s)" | head -c 300
#   检查 version 时间戳是刚生成的
#   手机扫已上线的二维码（不用重传包），vConsole 看 [LevelLoader] remote OK version=<新时间戳>
```

**完成。用户下次开游戏就吃到新关卡。**

### 18.3 路线 B · 发版 SOP（Step 1-5 同上 + build 流程）

Step 1-5 同 18.2，然后：

```bash
# Step 6: bump 三件套（BUILD_VER/MARKER/?v=）见 §5
# Step 7: 「build v1.0.XX changelog: 新增第 X 关 ...」
#   → 必须触发 laotie-build-guard subagent（见 §17）
#   → subagent 会走 10 步 + 输出 10 项报告
# Step 8: 后台提审 → 等审核过
```

### 18.4 六大漏斗（必查 · 血泪沉淀）

| # | 漏斗 | 症状 | 防守 |
|---|---|---|---|
| ① | CDN 图混桶 | editor 首页 404 | scene1→ks693835817972937121，scene2/4→ks658651445853447417 |
| ② | editor 双渲染路径 | 首页对了进关错 | main.js renderScroll + editor-legacy.js renderLevelGrid **两处都改** |
| ③ | 坐标不是相对舞台 | 真机点异物无反应 | 用 laotie-editor 拉框 · % 相对原图 · state._fit 自动 fit |
| ④ | duration 公式漏覆盖 | 新关秒数不对/秒跳过 | `M3.suggestDuration` 或 laotie-check |
| ⑤ | 新 idx 撞 hiddenIdxRanges | 本地有真机没 | 检查 levels.js 尾部 filter + JSON hiddenIdxRanges |
| ⑥ | 热更但 request 白名单没配 | CDN 传了用户看不到 | 后台 request 白名单加 `https://p1-ad.adkwai.com`，等下次审核过 |

### 18.5 三个关键脚本（唯一权威路径）

| 脚本 | 作用 |
|---|---|
| `scripts/gen-levels-config.js` | 从 `package/js/levels.js` 导出 `build-artifacts/levels-config.json`（时间戳版本号 + hiddenIdxRanges） |
| `scripts/upload-levels-json.js <kcdn_token>` | 一句话上传 CDN，kcdn_token=`14_da7d82d193d14fc536c0a1ce0cc0c2e9` |
| `package/js/level-loader.js` | 运行时 3s 超时 · no-cache 双保险 · fallback baseline · 挂 `M3.remoteLevelsReady` |

### 18.6 CDN JSON 权威 URL

```
https://p1-ad.adkwai.com/udata/pkg/KS-GAME/AIGC-SoGame/ks658651445853447417/levels-config.json
```

- `?_t=Date.now()` cache-buster + `Cache-Control: no-cache` 双保险
- 用户无本地缓存，每次启动强制拉最新
- 3s 超时/失败静默 fallback `levels.js` baseline
- **前提**：开发者后台「服务器域名 · request 白名单」必须有 `https://p1-ad.adkwai.com`（且要重新审核后生效）

### 18.7 hiddenIdxRanges 运行时隐藏

以后想暂时下线 X-Y 关，**不用发版**，改 JSON 里：

```json
"hiddenIdxRanges": [[30, 49], [80, 82]]
```

上传 CDN → 用户下次开游戏这些关就消失了。`level-loader.js` 应用时会自动 `M3.LEVELS.filter()` 隐藏。

### 18.8 违约代价

- 只改 levels.js 不跑 gen+upload → 关卡"看着上了实际用户没吃到"
- 白名单没配就 build → 一次审核浪费，动态下发能力假死
- 走热更但同时改了代码逻辑 → 用户新代码没生效，等于没上（必须走路线 B）

**默认铁律：只改关卡数据 = 热更，改代码 = build。混着改 = 一定走 B。**
