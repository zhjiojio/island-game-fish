# PROJECT_MANIFEST · 荒年开局·我的未婚妻

**AppID**: `ks667658648250668260`  
**打包根目录**: `package/`（ksmg preview/upload 指向这里）

---

## 目录结构

```
ks667658648250668260/
├── package/                    ← 快手小游戏运行时（打包根）
│   ├── game.js                 ← 小游戏入口（require 链）
│   ├── game.json               ← 引擎配置（分包 sp2=assets/frames/）
│   ├── index.html              ← H5 调试入口（样式已内联）
│   ├── project.config.json     ← 打包配置（ignore 规则在此）
│   ├── kwaiadapter.js          ← wx=ks 平台适配
│   ├── wxhelper.js             ← GetMainCanvas helper
│   ├── events.js               ← EventsManager
│   ├── js/
│   │   ├── main.js             ← ✅ 唯一活引擎（手改这里）
│   │   ├── story.js            ← ⚠️ AUTO-GENERATED，禁止手改
│   │   ├── registry.js         ← ⚠️ AUTO-GENERATED，禁止手改
│   │   ├── achievements.js     ← 成就/技能卡
│   │   ├── subtitles.js        ← 视频字幕
│   │   ├── ks-adapter.js       ← 广告/分享/上报
│   │   ├── telemetry.js        ← 埋点
│   │   └── icons.js            ← SVG 图标
│   └── images/
│       └── fx/dont-touch.png   ← 别碰我贴纸（小玩法交互）
│
├── content/                    ← ⭐ 权威源（v73.0+）
│   ├── episodes/EP0*.json      ← 剧本（改剧情只改这里）
│   ├── assets.registry.json    ← CDN/白名单/charInfo 单一来源
│   ├── rules.json              ← 铁律机器可执行版
│   ├── meta.json               ← version/changelog/start
│   ├── schema/                 ← JSON Schema 校验
│   └── subtitles/              ← 字幕源文件
│
├── docs/                       ← 项目文档
│   ├── CHANGELOG.md            ← 版本历史（每次改 content 必记）
│   ├── RULES.md                ← 铁律人类可读版
│   ├── PACKAGING_STRATEGY.md  ← 打包/CDN/分包完整策略
│   ├── HUB_SYNC_RULES.md      ← hub 双向同步规则
│   ├── README.md               ← scaffold/choice/episode 操作说明
│   ├── story-index.json        ← 节点索引（make index 生成）
│   └── story-map.md            ← 节点地图（make index 生成）
│
├── scripts/
│   ├── tools/                  ← build/validate 工具（Makefile 调用）
│   ├── hooks/                  ← git pre-commit hook
│   ├── subtitles/              ← 字幕 ASR 工具
│   ├── ua/                     ← UA 素材生成配置
│   ├── self-test/              ← 自测脚本
│   ├── scan-assets.mjs         ← 素材清单生成
│   ├── validate-story.sh       ← 全量审计入口
│   ├── hub-pull.sh             ← 拉取云端最新
│   ├── hub-push.sh             ← 推送到云端
│   ├── kling_pipeline.py       ← 视频批量生成调度器
│   └── gen_wanr_video.py       ← 唯一视频生成入口
│
├── manifests/
│   └── assets.json             ← 素材登记表（scan-assets.mjs 生成）
│
├── avatars/                    ← 出图原件（不进包，仅本地存档）
├── CLAUDE.md                   ← Agent 入场必读铁律
├── Makefile                    ← build/validate/index 快捷命令
└── package.json
```

---

## 数据流

```
content/**  ──► scripts/tools/build-*.js ──► package/js/{registry,story}.js ──► package/game.js
   ▲                                                     │
   └─ 唯一可手改                                          ▼
                                               package/js/main.js（唯一活引擎）
```

**禁止手改** `package/js/story.js` 和 `package/js/registry.js`，顶部有 `AUTO-GENERATED` 标记。

---

## 常用命令

```bash
make build          # content/ → package/js/story.js + registry.js
make validate       # 全量审计
make index          # 重建 docs/story-index.json + story-map.md
bash scripts/hub-pull.sh          # 开发前必跑：拉云端最新
bash scripts/hub-push.sh "msg"    # build 完必跑：推云端
```

---

## 打包

```bash
ksmg preview package/ -q -o ~/Desktop/qr
ksmg upload package/
```

**AppID**: `ks667658648250668260`（不许改）
