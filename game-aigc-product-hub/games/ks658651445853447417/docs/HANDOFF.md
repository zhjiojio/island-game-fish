# 老铁眼真尖 · 代码交接清单（HANDOFF）

> AppID：`ks658651445853447417`（原名「老铁找茬王」，2026-08-11 改名「老铁眼真尖」）
> 本文档所列**全部内容均已推送 Git**，clone 后即与维护者本机完全一致。
> 维护者：lihui26 / chengziyu
> 当前线上权威版本：**v1.0.115 / MARKER v178**（本次交接提交**不含发版**）

---

## 0. 一条命令拿到全部

```bash
git clone git@git.corp.kuaishou.com:kwai-game/game-aigc/game-aigc-product-hub.git
cd game-aigc-product-hub
git checkout dev            # ★ 唯一开发分支，不要用 master
git log --oneline -1
```

| 项 | 值 |
|---|---|
| 仓库 | `git@git.corp.kuaishou.com:kwai-game/game-aigc/game-aigc-product-hub.git` |
| 分支 | `dev` |
| 游戏主 AppID | `ks658651445853447417` |
| 分包 / 旧 CDN 桶 AppID | `ks693835817972937121`（仅 URL 引用，git 内无代码） |
| 编辑器线上地址 | https://laotie-editor.frontend-cloud.corp.kuaishou.com |
| 热更关卡 JSON | https://p5-ad.adkwai.com/udata/pkg/KS-GAME/AIGC-SoGame/ks658651445853447417/levels-config.json |

> ⚠️ **仓库副本陷阱**：本机可能存在多个 `game-aigc-product-hub` 副本（如 `~/Desktop/aiminigame/` 下的旧克隆，可能落后 20+ 提交）。**唯一权威 = 与 `origin/dev` 同步的那个工作区**。动手前务必 `git log --oneline -1` + `git status -sb` 确认，不要在落后副本里提交。

---

## 1. 三条代码路径的归属（最重要）

| 路径 | 是什么 | 改动后如何上线 | 是否需要 bump 三件套 |
|---|---|---|---|
| `games/ks658651445853447417/package/` | **游戏本体**（打进小游戏包） | `ksmg upload` → 开发者后台提审（1-3 天） | ✅ 必须 |
| `games/ks658651445853447417/skill/` | 随仓库分发的**技能文档 + 门禁脚本** | 只需 `git push`，不打包不上传 | ❌ 不需要 |
| `tools/laotie-editor/` | **坐标标注编辑器**（内网 Web） | `npm run deploy` → frontend-cloud，**不走 ksmg** | ❌ 不需要 |

**只改数据（关卡坐标/时长/标题）还有第 4 条路径：热更**
→ 走 `scripts/publish-levels.sh` 推 `levels-config.json` 到 CDN，**3 分钟生效、用户无需更新版本**。

---

## 2. 游戏本体 — `games/ks658651445853447417/`

### 2.1 活代码（改这里才生效；`package/` 即 ksmg 入包根目录）

```
games/ks658651445853447417/package/
├── index.html                      ← 三件套之一：?v=NNN 缓存戳
├── game.json                       ← 分包声明
├── project.config.json             ← setting.ignore 规则（控制主包体积）
├── kwai-game-config.json
├── js/
│   ├── main.js                     ← 入口；三件套之二/之三：BUILD_VER + MARKER
│   ├── game.js            (~198KB) ← 玩法主引擎（hidden / spot / hunt）
│   ├── levels.js          (~132KB) ← ★最常改：全关卡配置（坐标/主题/时长）
│   ├── level-loader.js             ← 远程 levels-config.json 热更加载器
│   ├── welcome.js         (~51KB)  ← 首页 / 关卡选择 / 解锁进度
│   ├── feedback.js        (~32KB)
│   ├── subpackage-loader.js        ← 分包加载 + CDN 路径重写 rewritePath()
│   ├── difficulty.js               ← 难度与时长公式
│   ├── voice-packs.js              ← 主播语音包索引
│   ├── telemetry.js                ← 埋点
│   ├── m3-init.js
│   ├── kwai-event-bus.js
│   └── kwai-ad-config.js
├── api/                            ← 快手小游戏 API 适配层（27 个 kwai-*.js）
├── ks-adapter.js (~70KB) / kwaiadapter.js / wxhelper.js / events.js / game.js
├── assets/
└── subpackages/
    ├── scenes-spot/          scenes-hunt/
    ├── scenes-hidden-core/   scenes-hidden-extra/
    ├── ui-gameplay/          bgm-extra/          voice-extra/
```

### 2.2 版本号三件套（发版必须同步递增，缺一即线上拿到旧包）

| # | 文件 | 字段 |
|---|---|---|
| 1 | `package/js/main.js` | `M3.BUILD_VER = 'v1.0.xxx'` |
| 2 | `package/js/main.js` | `MARKER vNNN` |
| 3 | `package/index.html` | 所有 `?v=NNN` 缓存戳 |

> 用 `skill/scripts/bump-version.js` 一次性改三处，禁止手改漏改。

### 2.3 双 AppID CDN 混用说明

场景图分布在两个桶，`subpackage-loader.js` 里的 `rewritePath()` 负责路由：

```
主桶   https://p4-ad.adkwai.com/udata/pkg/KS-GAME/AIGC-SoGame/ks658651445853447417/...
分包桶 https://p4-ad.adkwai.com/udata/pkg/KS-GAME/AIGC-SoGame/ks693835817972937121/...
热更JSON https://p5-ad.adkwai.com/udata/pkg/KS-GAME/AIGC-SoGame/ks658651445853447417/levels-config.json
```

- scene1 部分关卡图在**分包桶**（主桶同名文件被占用），scene3 lv1-4 亦走分包桶。
- editor 与游戏两侧都要用**完整 URL 表**，不能只存数字关号做映射，否则会 404 / 串图。

### 2.4 关卡热更脚本（不发版加关）

```
games/ks658651445853447417/scripts/
├── gen-levels-config.js       ← 生成热更 levels-config.json
├── upload-levels-json.js      ← 上传 JSON 到 CDN
├── publish-levels.sh          ← 一键发布关卡
└── legal-check.js             ← 合规检查
games/ks658651445853447417/build-artifacts/levels-config.json   ← 热更产物
```

### 2.5 团队门禁 + 随仓 skill

```
games/ks658651445853447417/skill/
├── SKILL.md                        ← ★主铁律（与维护者本机一致）
├── skill-docs/SKILL.md             ← 同上副本
├── README.md
├── agents/laotie-build-guard.md    ← 上线守门 subagent
├── hooks/install.sh  hooks/pre-commit.sh
└── scripts/
    ├── install-team-guard.sh       ← ★新人执行这个装门禁
    ├── laotie-check.sh             ← 上线前自检
    ├── bump-version.js             ← 三件套版本 bump
    ├── ingest-level.js             ← 吃 editor 导出的坐标 JSON
    ├── ksmg-wrapper.sh / ksmg-preview-guarded.sh / ksmg-preview-safe.sh
    └── pull-first-guard.sh / pre-push-template.sh
```

### 2.6 文档与原图

```
games/ks658651445853447417/README.md
games/ks658651445853447417/docs/HANDOFF.md                      ← 本文件
games/ks658651445853447417/docs/scene1-expansion-lv19-lv28.md
games/ks658651445853447417/docs/telemetry-registration.md
games/ks658651445853447417/docs/theme5-story-levels.md
games/ks658651445853447417/real-scenes/{scene2,scene3,scene3-v2}/
games/ks658651445853447417/{gen-hunt-intro.sh,gen-voice-line.sh,start-preview.sh}
```

---

## 3. 坐标标注编辑器 — `tools/laotie-editor/`

> 与游戏同仓，不是独立 repo。线上：https://laotie-editor.frontend-cloud.corp.kuaishou.com
> 部署走 **frontend-cloud**，与 ksmg 无关，不需要提审。

```
tools/laotie-editor/
├── index.html                  ← 登录遮罩 UI（#loginOverlay / #loginOverlayBtn / #userChip / #logoutBtn）
├── vite.config.js
├── package.json                ← scripts: dev / build / deploy(=safe-deploy.sh) / sync
├── package-lock.json
├── appwrite-cf.config.json     ← { "projectId": "laotieeditor" }
├── .npmrc / .static-site-deploy.json / .gitignore
├── README.md
├── docs/APPWRITE-SCHEMA.md     ← Appwrite 表结构
├── src/
│   ├── appwrite.js         ★★★ 权限白名单定义
│   ├── main.js             ★★★ SSO 登录 + 权限判定 + 只读写入拦截
│   ├── store.js                ← Appwrite CRUD（loadAll / saveOne / deleteOne / clearAll）
│   ├── editor-legacy.js (~121KB) ← 拉框标注主逻辑 + SCENE_META / EXIST 关卡表
│   ├── level-overrides.js      ← 三层数据合并（本地 JSON + Appwrite 覆盖）
│   └── story-levels.js
├── scripts/
│   ├── safe-deploy.sh          ← 8 道门禁部署（npm run deploy 走它）
│   └── sync.sh
├── gen-subpages.js             ← 生成 s1/s2/s3/s5 拉框子页
├── public/
│   ├── config/levels-overrides.json + .schema.md
│   ├── s1/lv1..lv18/  s2/lv2..lv13/  s3/lv1..lv9/  s5/lv1..lv20/   (index.html)
│   ├── scenes/index.html
│   └── ui/*.png                ← 13 张切图版 UI 素材
├── s1/ s2/ scenes/             ← 兼容旧路径的子页
└── real-scenes/{scene2,scene3}/ ← 拉框用原图
```

### 3.1 权限代码：精确位置

**① 白名单定义 — `src/appwrite.js`（加人只改这一行）**

```js
export const PROJECT_ID = 'laotieeditor';
export const DATABASE_ID = 'editor_db';
export const TABLE_ID = 'annotations';
export const EDITOR_WHITELIST = ['lihui26', 'chengziyu'];   // ★ 加人在这里
export const client = new Client()
  .setEndpoint(location.origin + '/v1')
  .setProject(PROJECT_ID);
```

**② 权限判定 — `src/main.js` `main()`**

```js
const me = await ensureLoggedIn();
if (!me) { loginPrompt(); return; }
const userName = me.name || (me.email ? me.email.split('@')[0] : '');
const canEdit = EDITOR_WHITELIST.includes(userName);
// userChip 显示 "✍️ 可编辑" / "👀 只读（不在白名单）"
if (!canEdit) document.body.classList.add('readonly');
```

**③ 快手 SSO 登录 — `src/main.js` `attachLoginHandler()`**

```js
account.createOAuth2Session({
  provider: OAuthProvider.Kuaishou,
  success: `${location.origin}${location.pathname}`,
  failure: `${location.origin}${location.pathname}`,
});
```

**④ 只读写入拦截 — `src/main.js` `installLocalStorageShim()`**
劫持 `localStorage.setItem/removeItem('laotie_annotations')`；`canEdit === false` 时直接 return 不写云端，提示「只读模式（非白名单）· 未同步」。

**⑤ 登录 UI — `index.html`** 中 `#loginOverlay` / `.login-card` / `#loginOverlayBtn` / `#loginBtn` / `#logoutBtn`。

**⑥ 场景1关卡业务白名单 — `src/editor-legacy.js`**
`S1_WHITELIST_11_12_13`，难度重排后按 `EXIST[新关号]` 权威源重写 odds（这是业务白名单，与登录权限无关）。

### 3.2 本地起编辑器

`node_modules/` 与 `dist/` 已 gitignore，需本地装/构建：

```bash
cd tools/laotie-editor
npm install
npm run dev            # 本地开发
npm run deploy         # 走 safe-deploy.sh 8 道门禁 → frontend-cloud
```

---

## 4. Skill 全集（已随仓分发）

### 4.1 `product-optimization/skills/`

| Skill | 用途 |
|---|---|
| `laotie-zhaocha-game/` | ★主铁律：活代码路径、三件套、52% 卡死排查、分包/CDN、§18 热更加关 SOP |
| `laotie-zhaocha-coord-workflow/` | editor 坐标标注工作流 |
| `laotie-zhaocha-scene-image/` | 场景关卡图生成规范 + 找茬差异设计方法论 |
| `laotie-add-level/` | 加一关 Step 1（出图 → CDN → Appwrite） |
| `laotie-publish-level/` | 加一关 Step 2（合并 → levels-config.json → 上 CDN） |
| `kuaishou-minigame-aigc/` | 快手 AIGC 小游戏通用全流程 |

安装到本机（让自己的 AI 也能用）：

```bash
cp -R product-optimization/skills/laotie-* ~/.codeflicker/skills/
```

### 4.2 四个校验脚本用途

| 脚本 | 位置 | 用途 |
|---|---|---|
| `audit.sh` | `product-optimization/skills/laotie-zhaocha-game/scripts/` | 全关卡逐关审计（配置完整性、素材引用、主题隐藏一致性） |
| `zero-english-tag.sh` | 同上 | 扫描关卡文案里残留的英文占位/调试标记，防止漏出到线上 |
| `check-editor-deploy.sh` | `product-optimization/skills/laotie-zhaocha-coord-workflow/` | 校验 editor 已部署版本与本地一致（防「改完没生效」） |
| `check-editor-sync.sh` | 同上 | 校验 editor 侧关卡表与游戏侧 `levels.js` 是否同步（防串图/关号错位） |

另有游戏侧上线自检脚本：`games/ks658651445853447417/skill/scripts/laotie-check.sh`（发版前必跑）。

### 4.3 游戏仓内随包 skill

`games/ks658651445853447417/skill/`（见 §2.5），内容与 `product-optimization/skills/laotie-zhaocha-game/SKILL.md` 一致，额外带门禁脚本。

---

## 5. 新人上手 3 步

```bash
# 1) 克隆并切分支
git clone git@git.corp.kuaishou.com:kwai-game/game-aigc/game-aigc-product-hub.git
cd game-aigc-product-hub && git checkout dev

# 2) 装团队门禁（必做，一次即可）
bash games/ks658651445853447417/skill/scripts/install-team-guard.sh

# 3) 装 skill 到本机 AI
cp -R product-optimization/skills/laotie-* ~/.codeflicker/skills/
```

编辑器另需：`cd tools/laotie-editor && npm install`

---

## 6. 铁律速查（详见 skill/SKILL.md）

1. **动手前必 `git pull --rebase origin dev`** —— 多人共用版本号，不拉就会撞车（已发生过 v1.0.114 碰撞）。
2. **确认工作区是权威副本** —— 本机可能有落后 20+ 提交的旧克隆，先 `git status -sb` 再动手。
3. **只改 `package/` 下的活代码**；任何 `.bak` / stash-backup / Desktop 副本都不是权威，禁止在那里改。
4. **发版必同步三件套**（`BUILD_VER` + `MARKER` + `index.html ?v=`），用 `bump-version.js`。
5. **上传前必跑** `skill/scripts/laotie-check.sh`，或直接走 `laotie-build-guard` subagent。
6. **只改数据 → 走热更**（`publish-levels.sh`，3 分钟生效）；**改逻辑/UI → 才发版**（审核 1-3 天）。
7. **提审要选最新一条上传记录**，否则会审到旧包。
8. **一次会话禁止同时改两个 AppID**（姐妹项目老铁斗地主在 `games/ks651896049489522351/`）。
9. **禁止删素材瘦身**；主包超限用 `project.config.json` 的 `setting.ignore` 排除 CDN 副本。
10. **52% 卡死排查顺序**：先 `node -c` 语法检查（git merge 冲突残留是常见真凶）→ 再查包体 → CRITICAL_ASSETS → CDN 可达性。
11. **CDN 同名覆盖不生效** → 加 `?v=` 缓存戳或换文件名（CDN 一年缓存）。
