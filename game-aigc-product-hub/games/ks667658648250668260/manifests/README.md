# 素材管理规范（assets pipeline）

> 目标：**代码包与素材包物理隔离**，从流程上杜绝"素材误打进包导致上传失败"。

## 三层机制

```
┌────────────────────────────────────────────────────────────┐
│ L1 登记层  manifests/assets.json  ← 单一 source of truth     │
│            每个素材一条：{ type, cdn, size, sha, refs }       │
├────────────────────────────────────────────────────────────┤
│ L2 消费层  js/assets.js  →  Assets.get('S1')                 │
│            代码只写 assetId，运行时查 manifest 拿 URL          │
├────────────────────────────────────────────────────────────┤
│ L3 门禁层  ~/.codeflicker/kwaipilot-hooks/ksmg-preflight.js  │
│            ksmg preview/upload 前自动扫描：                    │
│            · > 200KB 非文本 & 未 ignore  → 拦截 + 明细清单     │
│            · manifest 中 needs_upload → 提醒                  │
└────────────────────────────────────────────────────────────┘
```

## 日常工作流

```bash
# 1) 新增素材后（或从 CDN 拉了新 URL 进代码后），重扫 manifest
node scripts/scan-assets.mjs

# 2) 提交前 / 打包前，模拟一下预飞检查
printf '%s' '{"tool_input":{"command":"ksmg preview /Users/fat/weihunqi"}}' \
  | node ~/.codeflicker/kwaipilot-hooks/ksmg-preflight.js \
  | node -e "let s='';process.stdin.on('data',c=>s+=c);process.stdin.on('end',()=>console.log(JSON.parse(s).hookSpecificOutput.additionalContext))"

# 3) 打包（PreToolUse hook 会自动跑上面的检查，不通过不给打）
ksmg preview /Users/fat/weihunqi
```

## 使用 Assets.get() 引入素材

**❌ 旧写法**（散在代码各处，一改要改一堆地方）：
```js
videoEl.src = 'https://p5-ad.adkwai.com/udata/pkg/KS-GAME/AIGC-SoGame/ks712131693858878897/S1.mp4';
imgEl.src = 'assets/frames/s10c_dusk.jpg';  // 会打进包！
```

**✅ 新写法**：
```js
// 假设已在 index.html / game.js 之前引入 js/assets.js
videoEl.src = Assets.get('S1');            // → CDN URL
imgEl.src = Assets.get('s10c_dusk');       // 找不到时抛 error，早发现
```

## 什么算"needs_upload"

- 代码里出现了 `assets/xxx.mp4`、`avatars/xxx.png` 这样的相对路径
- 且对应 CDN 版本未在代码里出现
- → 需要：① 上传到 CDN；② 把代码里的路径改成 CDN URL；③ 重跑 `scan-assets.mjs`

## 大文件白名单（不常见资产要打进包时）

若某个大文件**真的**要进包（如启动 loading 图），把它加进 `project.config.json` 的 `setting.ignore` **反向白名单**是不行的（ignore 是排除项）。正确做法：

1. 如果 < 200KB：直接放着，hook 不会告警
2. 如果 > 200KB 但必须进包：把它放进不会被扫的路径（如 `dist/`），或调高 preflight 阈值

## 关键文件清单

| 文件 | 作用 |
|---|---|
| `manifests/assets.json` | 素材登记表（77 条，73 已发布 + 4 待上传） |
| `scripts/scan-assets.mjs` | 扫描 & 生成 manifest（幂等，可反复跑） |
| `js/assets.js` | 运行时统一入口 `Assets.get(id)` |
| `project.config.json` `setting.ignore` | ksmg 打包时的排除清单 |
| `~/.codeflicker/kwaipilot-hooks/ksmg-preflight.js` | 打包前自动门禁 |

## 排障指令

- 看当前 manifest 统计：`node -e "console.log(JSON.stringify(require('./manifests/assets.json').stats,null,2))"`
- 看哪些素材需要上传：`node -e "const m=require('./manifests/assets.json');Object.entries(m.assets).filter(([k,v])=>v.status==='needs_upload').forEach(([k,v])=>console.log(k,'→',v.local))"`
