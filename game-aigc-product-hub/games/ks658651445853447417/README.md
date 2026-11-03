# 老铁找茬王 · README

> ✅ **AppID 铁律**：目录名 = 真实 AppID = `package/project.config.json` 的 `appid` 字段。
> 三者已在 2026-08-05 统一，之后请**永远保持三者一致**。

## 项目基本信息

| 项 | 值 |
|---|---|
| 游戏名 | 老铁找茬王 |
| 真实 AppID | `ks658651445853447417`（来源：`package/project.config.json`） |
| 本地目录 | `~/work/minigame/game-aigc-product-hub/games/ks658651445853447417/` |
| Git 分支 | `dev`（历史特性分支 `game/laotie-zhaocha-ks658651445853447417` 已合流） |
| 引擎 | 纯 canvas + ks 原生 API（非 Cocos） |
| 入口 | `package/game.js` → `package/js/main.js` |
| 预览 title | `<title>老铁找茬王 · H5 预览</title>` |

> 📌 **目录改名历史**（2026-08-05）：原目录名 `ks712131693858878897` 是早期建目录时随手起的历史名字，与 AppID 无关。已在 2026-08-05 通过 `git mv` 重命名为真实 AppID `ks658651445853447417`，消除歧义。若在旧文档/会话里看到 `ks712131693858878897`，请**自动替换**为 `ks658651445853447417`。

## 目录结构

```
ks658651445853447417/
├── package/               ← ksmg-preview 打包目标（活代码，仅改这里）
│   ├── game.js           入口壳
│   ├── index.html        H5 预览入口（含 <title> "老铁找茬王"）
│   ├── game.json         快手小游戏配置
│   ├── project.config.json  appid=ks658651445853447417
│   ├── js/
│   │   ├── main.js       游戏主循环 & 广告封装
│   │   ├── welcome.js    首页
│   │   ├── game.js       核心找茬逻辑
│   │   ├── levels.js     关卡数据
│   │   ├── feedback.js   音效 + 语音 + 震动
│   │   ├── m3-init.js
│   │   ├── kwai-*.js
│   │   └── ...
│   ├── api/
│   │   └── kwai-ad.js    真广告封装（onClose isEnded 判定）
│   ├── assets/           图片 / 音频
│   └── tmp/              ksmg-preview 生成的二维码
├── docs/                  策划 & 关卡文档
├── real-scenes/           真实照片素材（未上线）
├── outputs/               AI 生图产物
├── workflow-run.yml
├── gen-voice-line.sh      语音一键生成脚本
└── README.md              (本文件)
```

## ⚠️ 迁移历史（2026-08-03）

**问题**：这个 AppID 曾被"老铁斗地主"重构项目错误占用 —— 找茬活代码被搬到 `package.bak/`，`package/` 变成了斗地主壳，导致：

- 十几轮所有找茬代码修改（v56/57/58/59）都被写到 `.bak` 或不存在路径 → **一个字节都没进包**
- `ksmg-preview` 打包 `package/` = 打包了斗地主
- 用户扫码看到"没变化"，被误诊为手机缓存问题

**处置**（2026-08-03）：
1. 斗地主 `package/` → 迁到 `ks651896049489522351/package/`（斗地主独立 AppID）
2. 找茬 `package.bak/` → 恢复为 `package/`（活代码归位）
3. 装 hook `miniplay-appid-isolation.js` 从机制上防止跨 AppID 混改

## 🔴 铁律（下次改代码前必须遵守）

**死亡三问**：

1. `head -5 package/game.js` **看真入口是谁**（斗地主还是找茬）
2. `head -1 package/index.html | grep title` **看 title 是不是当前要改的游戏**
3. 改完立刻 `console.log('[MARKER] v0.0.XX')` 加个死证据，扫码后 vConsole 一眼确认改动进包了

**禁忌**：
- ❌ 不要改 `package.bak/` / `package.*.bak/` —— 不会被打包
- ❌ 不要在一次会话里同时改两个 AppID —— hook 会 block
- ❌ 不要用"grep 命中的第一个路径"直接改 —— 先 `grep -v .bak` 排除备份

## 预览与部署

```bash
cd /Users/fat/work/minigame/game-aigc-product-hub/games/ks658651445853447417
bash /Users/fat/.codeflicker/remote-personal-skills/agw-work-mode/scripts/ksmg-preview.sh preview ./package
# 二维码输出到 ./package/tmp/preview-*.png
```

## 关联 AppID

- 姐妹项目：**老铁斗地主** → `../ks651896049489522351/`

## 版本号维护

**每次 build 前必须**：
1. 更新 `package/index.html` 里所有 `?v=NN` → 新号
2. 更新 `package/js/welcome.js` 或首页画布上的"外显版本号" → 同步
3. `console.log('[VERSION] v0.0.NN')` 在 main.js 里 —— vConsole 一眼看到
