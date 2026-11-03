# 《我的未婚妻》weihunqi 项目文档索引

> 每次 Agent 入场都从这里开始。这里的每个文档都有明确用途，不要在 story.js/CHANGELOG.md 里全文 grep。

---

## 📚 核心文档

| 文件 | 内容 | 什么时候用 |
|---|---|---|
| `story-map.md` | 全部 300+ 节点表（自动生成 · 每节点带行号+前驱后继） | **改剧本前必看** —— 想改 `s_stone`？直接 grep 拿到 `js/story.js:LINE` |
| `story-index.json` | 上表的 JSON 版（机读） | 写脚本批量分析节点时读它 |
| `CHANGELOG.md` | v22 ~ v72 完整版本演进 · 78 条 | 想知道某个字段/机制是啥时候加的、为啥这么设计 |
| `RULES.md` | 21 条编号铁律 + 18 无编号历史铁律 | 每次改代码前扫一眼，别踩已经踩过的坑 |

## 🛠️ 生产力脚本（scripts/tools/）

```bash
# 【最常用】改 story.js 后重建节点索引
node scripts/tools/build-story-index.js
#  → 更新 docs/story-map.md + docs/story-index.json
#  → 扫出孤儿节点、断链、可达性

# 从 CHANGELOG 抽出铁律（写完新 changelog 后跑）
node scripts/tools/extract-rules.js
#  → 更新 docs/RULES.md

# 一次性归档：把 story.js 顶部旧 changelog 剥离到 CHANGELOG.md
node scripts/tools/split-changelog.js
#  （已跑过，无需再跑；如果 story.js 又塞回长 changelog 可再跑）
```

## 🚦 剧本静态审计（scripts/）

```bash
bash scripts/validate-story.sh          # 一键跑全部审计
node scripts/audit_char.js              # char/speaker 一致性
node scripts/audit_cdn_media.js         # CDN 200/404 + 本地文件存在性
node scripts/audit_story_logic.js       # 图健康度（悬空/死节点/不可达）
node scripts/audit_skillcard_prev.js    # skillcard 前置节点必须有 media
node scripts/audit_story.js             # 综合审计
```

---

## 📝 改剧本 · 标准工作流

1. **改前**：`node scripts/tools/build-story-index.js` → 查 `docs/story-map.md` 找到目标节点行号
2. **改中**：直接跳到 `js/story.js:LINE` 修改；改完看下前驱/后继是否也需要连带修
3. **改后**：
   - `node scripts/tools/build-story-index.js` 重跑索引，检查孤儿数没上升
   - `bash scripts/validate-story.sh` 跑门禁
   - **在 `docs/CHANGELOG.md` 顶部**加一节 `## vXX.YY · 日期`，写清"根因/修复/新铁律"
   - 如新增铁律：`node scripts/tools/extract-rules.js` 更新 RULES.md
4. **story.js 里的 `changelog: []`** 只保留最新 3 条一句话摘要，历史都在 CHANGELOG.md
