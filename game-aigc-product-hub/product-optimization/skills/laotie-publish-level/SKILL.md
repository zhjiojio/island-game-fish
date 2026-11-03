---
name: laotie-publish-level
description: 老铁眼真尖「发布关卡上线」skill（接用户从 editor 复制的 JSON → 合并 Appwrite → 生成 levels-config.json → 上游戏 CDN）。触发词：「发布关卡」「laotie 上线关卡」「发布 Lv」「publish laotie level」「关卡上线」「找茬 上线」「粘 JSON 上线关卡」。此 skill 是「laotie-add-level」的下游 Step 2。
---

# 老铁眼真尖 · 发布关卡 skill（Step 2/2）

**上一步**：`laotie-add-level`（用户在 editor 里拖完框，复制了 JSON）  
**下一步**：无 —— 玩家扫码即可看到新关

---

## 📍 环境上下文（AI 执行前必读）

| 项 | 值 |
|---|---|
| 仓库 | `git@git.corp.kuaishou.com:kwai-game/game-aigc/game-aigc-product-hub.git` |
| 分支 | `dev`（push 用 `git push origin HEAD:dev`） |
| 本地路径（Fat 机器） | `/Users/fat/work/minigame/game-aigc-product-hub` |
| Editor 目录 | `tools/laotie-editor/` |
| 游戏 AppID | `ks658651445853447417` |
| CDN 配置目标 | `https://p5-ad.adkwai.com/udata/pkg/KS-GAME/AIGC-SoGame/ks658651445853447417/levels-config.json` |
| Appwrite | project=`laotieeditor`, db=`editor_db`, table=`level_overrides` |
| 导出逻辑参考 | `tools/laotie-editor/src/level-overrides.js` 里 `exportForGameCDN()` |

**装 skill**（同事第一次用）：
```bash
git clone git@git.corp.kuaishou.com:kwai-game/game-aigc/game-aigc-product-hub.git ~/hub-laotie
bash ~/hub-laotie/product-optimization/install.sh
```

---

## ⚠️ 铁律 0 · 多人协作部署门禁（一步不许跳）

**本 skill 只在改了 editor 代码时才涉及部署**，但只要碰了 `tools/laotie-editor/` 就必须走：

```bash
cd <repo>/tools/laotie-editor
npm run sync      # 动手前：pull --rebase + 报告别人改了啥 + 装依赖
# ... 改代码 ...
npm run deploy    # ✅ 唯一允许的部署方式，走 8 道门禁
                  # ❌ 不许用 npm run deploy:raw（裸部署无门禁）
                  # ❌ 不许 --force 绕过门禁 2（工作区干净检查）
```

8 道门禁：git仓库 → 工作区干净 → fetch → 本地vs远端(自动rebase) → **先push再部署** → build → deploy → 打 `editor-deploy-<日期>-<人名>` tag。

部署后必须：① Kim 群贴通知（脚本给现成文案）② 提醒用户 `Cmd+Shift+R` 硬刷新。

**纯上线关卡（不改 editor 代码）不涉及部署**，只需推 CDN + 写 Appwrite，但 Step 2 拉 Appwrite 前依然建议先 `git pull origin dev` 确保本地 `level-overrides.js` 逻辑是最新的。

---

## 触发场景

用户在 MyFlicker 粘一段 JSON 说：
- 「发布关卡 Lv40」
- 「laotie 上线 <JSON>」
- 「上线这个关卡 <JSON>」

## 用户提供的 JSON 格式（editor 「📋 复制本关 JSON」按钮产出）

```json
{
  "sceneId": 1,
  "lv": 40,
  "title": "第40关 · 老中医诊室",
  "duration": 55,
  "hint": "6 件穿越物藏在老中医诊室里",
  "sceneUrl": "https://p4-ad.adkwai.com/udata/.../hidden_lv40.jpg",
  "odds": [
    { "prop": "capsule_machine", "x": 42.0, "y": 55.0, "w": 14.0, "h": 11.0 },
    { "prop": "infrared_gun",    "x": 68.0, "y": 38.0, "w": 10.0, "h":  8.0 },
    ...
  ]
}
```

---

## 执行步骤（AI 自动全干）

### Step 1 · 校验 JSON 完整性

```
必需字段：sceneId, lv, title, duration, hint, sceneUrl, odds
odds 长度 >= 3（找茬关至少 3 个茬）
每个 odd: prop/x/y/w/h 都是数字 (x/y/w/h 在 [0,100] 范围)
```

任一项缺失 → 停止 + 告诉用户具体缺哪个字段，让 ta 回 editor 补全。

### Step 2 · 合并到 Appwrite level_overrides

拉当前最新 row → 把新关卡合并进 `SCENE_META_EXTRA` / `EXIST_EXTRA` / `SCENE1_IMG_URL_EXTRA`：

```bash
cd /Users/fat/work/minigame/game-aigc-product-hub/tools/laotie-editor

# 拉当前 row
CURRENT=$(npx appwrite-cf tables-db list-rows --database-id editor_db --table-id level_overrides \
  --limit 1 --order-attributes '$updatedAt' --order-types DESC \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['rows'][0]['overrideJson'])")

# 用 Python 合并
MERGED=$(python3 <<'PY'
import json, sys, os
cur = json.loads(os.environ['CURRENT'] or '{"SCENE_META_EXTRA":{},"EXIST_EXTRA":{"S1":{},"S2":{},"S3":{},"S5":{}},"SCENE1_IMG_URL_EXTRA":{},"SCENE_LABELS_EXTRA":{}}')
new = json.loads(os.environ['NEW_LEVEL'])
sid, lv = str(new['sceneId']), new['lv']

# SCENE_META_EXTRA
sm = cur.setdefault('SCENE_META_EXTRA', {}).setdefault(sid, [])
sm[:] = [x for x in sm if x['lv'] != lv]  # 去重
sm.append({'lv': lv, 'title': new['title'], 'duration': new['duration'],
           'hint': new['hint'], 'calibrated': True, 'hell': True})

# EXIST_EXTRA
key = 'S' + sid
cur.setdefault('EXIST_EXTRA', {}).setdefault(key, {})[str(lv)] = [
  {'prop_id': o['prop'], 'x': o['x'], 'y': o['y'], 'w': o['w'], 'h': o['h']}
  for o in new['odds']
]

# 图 URL（scene1）
if sid == '1':
  cur.setdefault('SCENE1_IMG_URL_EXTRA', {})[str(lv)] = new['sceneUrl']

cur['version'] = f"publish-lv{lv}-{__import__('time').strftime('%Y%m%d%H%M')}"
print(json.dumps(cur, ensure_ascii=False))
PY
)

# 写回
DATA=$(python3 -c "import json,os; print(json.dumps({'overrideJson': os.environ['MERGED'], 'updatedBy': 'laotie-publish-level-skill'}))")
npx appwrite-cf tables-db update-row \
  --database-id editor_db \
  --table-id level_overrides \
  --row-id "$ROW_ID" \
  --data "$DATA"
```

### Step 3 · 拉 CDN baseline + patch + 生成 levels-config.json

```bash
# 拉 baseline
BASELINE=$(curl -s "https://p5-ad.adkwai.com/udata/pkg/KS-GAME/AIGC-SoGame/ks658651445853447417/levels-config.json?_t=$(date +%s)")

# 用 Node 或 Python 跑 exportForGameCDN 等价逻辑（见 tools/laotie-editor/src/level-overrides.js）
# 输出 out.json
```

或者：告诉用户「打开 editor 点『🚀 生成游戏侧 levels-config.json』然后再粘回来」（如果 AI 端不方便跑 exportForGameCDN）。

### Step 4 · 上传游戏侧 levels-config.json

```bash
kcdn upload \
  -b KS-GAME/AIGC-SoGame/ks658651445853447417 \
  --overwrite \
  levels-config.json

# 校验
curl -s "https://p5-ad.adkwai.com/udata/pkg/KS-GAME/AIGC-SoGame/ks658651445853447417/levels-config.json?_t=$(date +%s)" \
  | python3 -c "import sys,json; d=json.load(sys.stdin); \
    lv=next((l for l in d['levels'] if l['idx']==LV_IDX), None); \
    print('✅ Lv found on CDN:', lv is not None); \
    print('odds count:', len(lv['odds']) if lv else 0)"
```

### Step 5 · 回复用户

```
✅ 关卡 Lv{N} · {TITLE} 已上线

- Appwrite 已合并 (updatedBy: publish-level-skill)
- levels-config.json v={VERSION} 已推 CDN
- {ODDS_COUNT} 个异物已入库
- 玩家扫码/冷启即可看到，无需发版

扫码验证：
  快手 App 扫码 → 进游戏 → 场景{SCENE} → 找到 Lv{N} → 点异物应正确判定

如果发现异物位置不对，回 editor 微调后再走一次「发布关卡」即可。
```

---

## 铁律

- **必须校验 odds 落点**：`x + w <= 100 && y + h <= 100`，否则拖框超出边界
- **必须去重**：合并时如果同 lv 已存在，先删旧的再 append
- **必须走 update-row 而不是 create-row**：level_overrides 表用最新一行的策略，别每次都建新 row（会漂移）
- **上线后必须 curl 拉 CDN 校验**：确认新 lv 真的在 levels-config.json 里
- **kcdn 上传要加 --overwrite**：levels-config.json 是覆盖发布，不加会 409

## 关联 skills

- **上一步 skill**：`skills/laotie-add-level` ⭐（用户拖框前的准备）
- 项目铁律：`skills/laotie-zhaocha-game`
- CDN 上传工作流：`skills/laotie-zhaocha-coord-workflow`
- Editor 数据结构 & Layer 3：见 `tools/laotie-editor/README.md`
