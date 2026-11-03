---
name: laotie-add-level
description: 老铁眼真尖「新增一关」全自动 skill（出图 → 上 CDN → 写 Appwrite → 给拖框链接）。触发词：「加一关 老铁眼真尖」「新增找茬关卡」「laotie 加关卡」「add laotie level」「加一关 scene1」「找茬 加关」「eye 加关」「新场景加关卡」。执行完毕后自动引导下一步用「laotie-publish-level」skill 完成推 CDN 上线。
---

# 老铁眼真尖 · 新增关卡 skill（Step 1/2）

**上一步**：无  
**下一步**：`laotie-publish-level`（用户拖完框粘 JSON 回来后触发）

---

## 📍 环境上下文（AI 执行前必读）

| 项 | 值 |
|---|---|
| 仓库 | `git@git.corp.kuaishou.com:kwai-game/game-aigc/game-aigc-product-hub.git` |
| 分支 | `dev`（push 必须用 `git push origin HEAD:dev`，pre-receive hook 只放 dev/master） |
| 本地路径（Fat 机器） | `/Users/fat/work/minigame/game-aigc-product-hub` |
| 游戏目录 | `games/ks658651445853447417/` |
| Editor 目录 | `tools/laotie-editor/` |
| Editor 线上 | https://laotie-editor.frontend-cloud.corp.kuaishou.com |
| 游戏 AppID | `ks658651445853447417`（新关一律走这个主桶） |
| CDN 图桶 | `https://p4-ad.adkwai.com/udata/pkg/KS-GAME/AIGC-SoGame/ks658651445853447417/` |
| CDN 配置 | `https://p5-ad.adkwai.com/udata/pkg/KS-GAME/AIGC-SoGame/ks658651445853447417/levels-config.json` |
| Appwrite | project=`laotieeditor`, db=`editor_db`, table=`level_overrides` |

**如果本地没有仓库**，先 clone：
```bash
git clone git@git.corp.kuaishou.com:kwai-game/game-aigc/game-aigc-product-hub.git ~/hub-laotie
cd ~/hub-laotie && git checkout dev && git pull
```

**如果本地没有这个 skill**（同事第一次用），装一次：
```bash
bash ~/hub-laotie/product-optimization/install.sh
# 会把 hub/product-optimization/skills/*/ 同步到 ~/.codeflicker/skills/
```

---

## ⚠️ 铁律 0 · 多人协作部署门禁（一步不许跳）

editor 是多人共用的线上后台，**A 部署没 push → B 拉旧代码部署 → A 的改动被覆盖**。所以：

### 动手前必须 sync
```bash
cd <repo>/tools/laotie-editor && npm run sync
```
会自动：`pull --rebase origin dev` + 报告最近 8 次谁改了啥 + 列出本次同步的 editor 文件 + `package.json` 变了自动 `npm i`。

**如果报 dirty**：先 `git stash` 或 `git commit`，**不要硬来**。

### 部署必须走门禁
```bash
npm run deploy      # ✅ 唯一允许的部署方式
npm run deploy:raw  # ❌ 裸部署无门禁，只在门禁脚本本身坏了时应急用
```

8 道门禁（任一失败即中断，**不许 `--force` 绕过**）：

| # | 门禁 | 拦什么 |
|---|---|---|
| 1 | 在 git 仓库里 | 防跑错目录 |
| 2 | 工作区必须干净 | 防未提交改动部署后别人拉不到 |
| 3 | `git fetch origin dev` | 拿远端最新 |
| 4 | 本地 vs 远端比对 | 落后自动 ff / 分叉自动 rebase / 冲突中断 |
| 5 | **先 push 再部署** | 防「部署了但代码在我本地」⭐ |
| 6 | `npm run build` | 语法错不许上线 |
| 7 | deploy frontend-cloud | — |
| 8 | 打 `editor-deploy-<日期>-<人名>` tag | 留痕 |

### 部署后必须做两件事
1. **贴通知到 Kim 群**（脚本结尾给现成文案）：`editor 已更新到 <commit>，请 git pull origin dev`
2. **提醒用户硬刷新** `Cmd+Shift+R`，否则看到的是浏览器缓存旧版

### 查谁最近部署过
```bash
git tag -l 'editor-deploy-*' --sort=-creatordate | head -10
```

---

## 触发场景

用户在 MyFlicker 说：
- 「加一关 老铁眼真尖 老中医诊室 6 件物」
- 「laotie 新增 scene1 lv40 XX 主题」
- 「找茬 加个关卡 XX 场景」

## 用户只需提供 3 个信息

1. **场景编号** scene（1=找茬 hidden / 2=眼最尖 spot / 3=hunt / 5=story）
2. **主题描述** theme（如「80年代老中医诊室」、「知青下乡蹲点」）
3. **穿越物清单** N 件（如「胶囊咖啡机、额温枪、筋膜枪、充电宝、挂脖风扇、运动摄像头」）

其他默认值：Lv 号自动取当前场景最大 lv+1；时长 55s；难度=困难。

---

## 执行步骤（AI 自动全干）

### Step 1 · 确认 Lv 号

拉当前 CDN baseline，找该场景最大 lv：

```bash
curl -s https://p5-ad.adkwai.com/udata/pkg/KS-GAME/AIGC-SoGame/ks658651445853447417/levels-config.json \
  | python3 -c "import sys,json; d=json.load(sys.stdin); \
    lvs=[l for l in d['levels'] if l['themeId']==SCENE_ID]; \
    print(max(l['idx'] for l in lvs)+1)"
# SCENE_ID 用用户提供的 scene 编号
```

同时通过 appwrite-cf 拉 `level_overrides` 已注册的 lv，取二者最大值 + 1。

### Step 2 · 出图（合规审查）

调用 `skills/aigc-image-compliance-northeast80s` 检查主题词红线：政治符号 / 品牌 logo / 女性穿着三层遮盖。

生成图片：
```bash
# 用 gpt-image-2 或 kling
prompt="1080x1440 竖版，80年代复古中国{theme}，昏黄暖调，藏有以下现代穿越物且清晰可见但不违和地融入场景：{items}"
# 出图工具走 minigame-store-assets-openrouter skill
```

**关键点**：
- 尺寸 **1080×1440**（scene1 竖版找茬规范）
- 每件穿越物要**清晰可见 + 但不违和**（这样拖框才好标）
- 复古背景 + 现代物是核心冲突

### Step 3 · 压缩 + 上传主桶

```bash
# 压缩到 <400KB
pngquant --quality=60-80 --force --output hidden_lv{N}.jpg hidden_lv{N}_raw.png

# 上传主桶（v2026.08.20 新关一律走主桶 ks658651445853447417）
kcdn upload -b KS-GAME/AIGC-SoGame/ks658651445853447417 hidden_lv{N}.jpg

# 验证
curl -I https://p4-ad.adkwai.com/udata/pkg/KS-GAME/AIGC-SoGame/ks658651445853447417/hidden_lv{N}.jpg
# 必须 HTTP 200
```

### Step 4 · 写 Appwrite level_overrides

```bash
cd /Users/fat/work/minigame/game-aigc-product-hub/tools/laotie-editor

PAYLOAD=$(cat <<'JSON'
{
  "version": "add-lv{N}-{YYYYMMDD}",
  "SCENE_META_EXTRA": {
    "{SCENE}": [
      { "lv": {N}, "title": "第{N}关 · {THEME}", "duration": 55,
        "hint": "{N_ITEMS} 件穿越物藏在{THEME}里", "calibrated": false, "hell": true }
    ]
  },
  "SCENE1_IMG_URL_EXTRA": {
    "{N}": "https://p4-ad.adkwai.com/udata/pkg/KS-GAME/AIGC-SoGame/ks658651445853447417/hidden_lv{N}.jpg"
  },
  "EXIST_EXTRA": { "S1": {}, "S2": {}, "S3": {}, "S5": {} },
  "SCENE_LABELS_EXTRA": {}
}
JSON
)

DATA=$(python3 -c "import json,os,sys; \
  print(json.dumps({'overrideJson': sys.stdin.read(), 'updatedBy': 'laotie-add-level-skill'}))" <<< "$PAYLOAD")

npx appwrite-cf tables-db create-row \
  --database-id editor_db \
  --table-id level_overrides \
  --row-id 'unique()' \
  --data "$DATA"
```

### Step 5 · 输出拖框指令给用户

**这一步是核心**——AI 直接输出以下模板，用户复制粘贴到 MyFlicker 就能触发下一个 skill：

```
✅ 关卡 Lv{N} 已在 editor 里就位

请打开：https://laotie-editor.frontend-cloud.corp.kuaishou.com
  1. SSO 登录
  2. 首页找到 Scene{SCENE} · Lv{N} · 第{N}关 · {THEME}
  3. 点开 → 拖框标出所有 {N_ITEMS} 件穿越物
  4. 点「📋 复制本关 JSON」

拖完框后，把复制的 JSON 粘回来，我会自动帮你上线。触发词直接说：

┌─────────────────────────────────────
│ 发布关卡 Lv{N}
│ <粘贴复制的 JSON>
└─────────────────────────────────────
```

---

## 铁律

- **不要跳步**：Step 3 CDN 上传必须 curl 校验 200 后才写 Appwrite，否则 editor 首页缩略图 404
- **不要用旧桶**：scene1 新关一律主桶 `ks658651445853447417`，别学历史遗留的 `ks693835817972937121`
- **合规必须过**：Step 2 出图前必须过 `aigc-image-compliance-northeast80s` 红线检查
- **Lv 号连续**：Step 1 必须拉 CDN + Appwrite 双源取 max+1，不能凭空写死

## 关联 skills

- 出图规范：`skills/laotie-zhaocha-scene-image`
- 合规红线：`skills/aigc-image-compliance-northeast80s`
- 出图工具：`skills/minigame-store-assets-openrouter`
- 项目铁律：`skills/laotie-zhaocha-game`
- **下一步 skill**：`skills/laotie-publish-level` ⭐
