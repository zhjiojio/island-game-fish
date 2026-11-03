# 🔄 weihunqi ↔ hub 双向同步铁律

> AppID: `ks667658648250668260` · 云端: `game-aigc-product-hub/games/ks667658648250668260/` @ `dev`
> 参考: 老铁眼真尖 `games/ks658651445853447417/` 的 build 流程

## 铁律（三条一条不能违）

### 铁律 1：**每次开发前必拉云端**

```bash
cd /Users/fat/weihunqi
bash scripts/hub-pull.sh
```

- 会先 `git fetch + pull origin/dev` 到 hub 本地仓
- 再 `rsync hub/games/ks667658648250668260/ → weihunqi/` 覆盖本地
- 本地有未 commit 改动会阻断（避免误覆盖）
- ⚠️ 违规后果：**云端他人改动被本地旧代码覆盖**

### 铁律 2：**每次 build 完必推云端**

```bash
cd /Users/fat/weihunqi
bash scripts/hub-push.sh "本次 changelog 一句话"
```

- 自动做 4 项自检：JS 语法 / 冲突标记 / stash 数 / hub 拉最新
- `rsync weihunqi/ → hub/games/ks667658648250668260/`（排除大素材）
- hub 侧 `git add + commit + push origin HEAD:dev`
- 自动落盘 `build-qrcodes/vXX.YY-report.md`
- ⚠️ 违规后果：**本地版本孤岛，团队看不到最新**

### 铁律 3：**版本号权威源 = `content/meta.json .version`**

- 只有 hub-push 前 bump 了这个版本号，报告文件名和 commit 才是对的
- 未婚妻**无三件套**（无 `STORY_VERSION` / 无 `?v=`），只此一处
- ⚠️ 违规后果：报告覆盖旧文件、commit 信息错乱

## 排除清单（本地素材不入仓）

```
assets/          (1.2G, 视频/图片原料)
assets_gen/      (23M, AIGC 中间产物)
tmp/  materials-src/  dist.zip  node_modules/  .venv/
scripts/deprecated/  *.log  .DS_Store
```

大素材走 CDN；hub 只放代码 + `dist/` + `content/` + `docs/` + `avatars/`

## 首次同步已完成 (v76.14)

- ✅ hub commit: `81d8540..5c1fac2`（399 files, +85668）
- ✅ 报告落盘: `build-qrcodes/v76.14-report.md`
- ✅ 云端 URL: https://git.corp.kuaishou.com/kwai-game/game-aigc/game-aigc-product-hub/-/tree/dev/games/ks667658648250668260

## 常见错误

| 症状 | 根因 | 修复 |
|-----|------|-----|
| hub-pull 阻断 | 本地未提交改动 | `git stash` 或 `git commit` |
| hub-push 阻断"JS 语法错" | node -c 检出问题 | 修 JS 后重跑 |
| hub-push 阻断"冲突标记" | 有 `<<<<<<<` 残留 | `grep -rln '^<<<<<<< ' js/` 定位并修 |
| push 后云端没变化 | rsync 排除了改的文件 | 检查 `RSYNC_EXCLUDES` 是否误排 |

## AI Agent 触发词（自动跑本流程）

当用户说以下任一关键词，Agent 必须先跑 `hub-pull.sh` 或 `hub-push.sh`：

- 开发前：**"开始开发"** / **"拉最新"** / **"同步云端"** / **"pull hub"** → 跑 `hub-pull.sh`
- build 后：**"build 完了"** / **"推云端"** / **"上传"** / **"push hub"** / **"更新版本"** → 跑 `hub-push.sh`

⚠️ Agent 若跳过本流程直接改代码或直接 ksmg upload，视为**违反铁律**，用户有权要求回滚。
