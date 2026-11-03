# 📦 打包与加载策略说明书

> **一句话**：主包只装"必须开局能跑的骨架"，图片全走分包 sp2 懒加载，视频/音频全走 CDN 边下边播。

---

## 一、当前策略总览

```
┌─────────────────────────────────────────────────────────────┐
│                    快手小游戏包体结构                        │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  🎯 主包（Main Package · game.js 启动时必须加载）           │
│     大小：~11MB / 上限 20MB                                 │
│     包含：                                                  │
│       ├── game.js/game.json/index.html/kwaiadapter.js       │
│       ├── js/*.js                     核心代码 500KB        │
│       ├── assets/audio/*.mp3          UI 音效 + BE 结局音    │
│       ├── assets/sfx/*.mp3            系统音效               │
│       ├── assets/lastframe/*.jpg      视频兜底最后一帧       │
│       ├── assets/avatars/*.png        角色头像              │
│       ├── assets/poster/*.jpg         封面/加载页            │
│       ├── assets/ui/*.png             UI 元素                │
│       ├── assets/icons/*.svg          图标                   │
│       └── assets/videos/S1.mp4  ⚠️    首屏视频（被 ignore） │
│                                                             │
│  📦 分包 sp2（懒加载 · loadSubpackage）                     │
│     路径：assets/frames/                                    │
│     大小：~4MB                                              │
│     包含：所有 jpg 剧情帧（e1s1.jpg ~ e9s3.jpg 等 ~30 张）  │
│     触发：ensureSubpkg('sp1') 在主包 init 时预调用          │
│                                                             │
│  🌐 CDN（P4/P5 · 运行时按需下载）                            │
│     承载：                                                  │
│       ├── 所有剧情视频（15~36 MB/个 · S6+ 全走 CDN）        │
│       ├── 音频剧情旁白（163 个已上 CDN · 兄弟会话已迁移）    │
│       ├── E5S3.jpg 等历史大图                               │
│       └── 兜底：分包/包内加载失败时的备胎                    │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 二、策略在代码里的位置

| 关注点 | 代码位置 |
|---|---|
| **分包定义** | `game.json` · `subpackages` 字段（现在只有 `sp2 = assets/frames/`）|
| **主包 ignore** | `project.config.json` · `setting.ignore` 数组（50+ 条，把大文件/frames/开发产物排掉）|
| **分包懒加载** | `package/js/main.js` L227~271 · `ensureSubpkg(name, cb)`（wx.loadSubpackage 包装 + 状态机 + 等待队列）|
| **主包 init 预拉分包** | `package/js/main.js` L503 · `try { ensureSubpkg('sp1'); } catch(e){}`  ⚠️ **这里写的是 sp1 但 game.json 里只有 sp2 —— 死代码，等实际用 sp1 再改** |
| **CDN 前缀** | `package/js/main.js` L842-843 · `CDN_PREFIX_P4` / `CDN_PREFIX_P5` |
| **CDN 视频下载队列** | `package/js/main.js` L135~180 · `wx.downloadFile` 并发 2 个（`DL_MAX_CONCURRENT=2`），太多会拖垮首屏 |
| **CDN 视频秒切策略** | `package/js/main.js` L344~347 · **不阻塞等下载完** → 直接给 native video CDN URL 边下边播 → 后台继续 downloadFile 做缓存 |
| **视频失败降级** | `package/js/main.js` L797~808 · 本地/分包视频 fail → 3s 后自动 next 跳过（防黑屏卡死）|
| **图片 CDN 映射** | `package/js/main.js` L858~874 · `BUNDLED_IMAGES` 表：CDN 完整 URL → 分包内 `assets/frames/xxx.jpg`（命中就用分包，不命中走 CDN）|
| **未匹配图片兜底** | `package/js/main.js` 短文件名（无 /）→ 自动前缀 P4 CDN URL |

---

## 三、加载时机（从游戏启动到玩到 EP09）

```
时间轴 →

t=0    │ 用户扫码 → 快小游戏容器加载主包（~11MB · 一次性拉完）
       │
t=1s   │ game.js 执行 → main-v43.js 初始化
       │   ├── 立即 UI 就绪（title/start button）
       │   └── 后台调 ensureSubpkg('sp1') · 试图预拉图片分包
       │
t=3s   │ 用户点"开始"
       │   ├── 加载 s1（起始节点）
       │   ├── mediaImg = s1.jpg（如果在 sp2 分包里 · 已 loadSubpackage 好则秒开）
       │   └── mediaVideo = s1.mp4（CDN 边下边播 · wx.createVideo 直接吃 URL）
       │
t=8s   │ s1 播完 → 下一节点
       │   ├── videoCache 命中过的直接秒切
       │   └── 未命中：CDN URL 交 native video，同时后台 wx.downloadFile 落盘
       │
t=3min │ 玩到 EP05
       │   ├── mediaVideo = e5s2.mp4 → CDN 拉（首播缓冲 1~3s）
       │   ├── mediaImg = e5s2.jpg → sp2 命中 → 秒开
       │   └── narrator mp3 → CDN 边下边播（NARR_LOCAL_FORCE 白名单里的走本地 assets/audio/）
```

**关键节奏点**：
- **前 10 帧预取**（`package/js/main.js` L433）：BFS 从当前节点扫下游 10 个节点，把 mp3+mp4+jpg 全部高优 downloadFile 落盘
- **视频秒切**：CDN URL 立即给 native video → 边下边播 · 首播 CDN 缓冲 1~3s，后续秒切
- **图片分包**：主包 init 立即触发 `ensureSubpkg`，用户玩到那节点时已下好

---

## 四、这套策略合理吗？

### ✅ 合理的地方

| 决策 | 为啥合理 |
|---|---|
| **视频不打主包** | 单个视频 15~36MB · 打进去主包直接爆表。CDN 边下边播 + 3s 兜底 next 是正解 |
| **frames 走分包 sp2** | 图片总量 4MB · 不放主包能腾出空间给核心代码/音效 · 用户进游戏时后台已经拉好 |
| **音效/头像/UI 走主包** | 高频复用、体积小（<200KB/个）、必须 0 延迟响应，CDN 不划算 |
| **BUNDLED_IMAGES 映射** | 让 story.js 只写 CDN URL 一处，运行时自动决定"分包/CDN"路径 —— 内容作者不用关心工程细节 |
| **DL_MAX_CONCURRENT=2** | 并发太多会挤压首播的 s1，2 个刚好留带宽给"当下播放的视频" |
| **CDN 双域** | P4/P5 分流防单点故障 |

### ⚠️ 可以优化的地方

| 问题 | 现状 | 建议 |
|---|---|---|
| **分包命名混乱** | game.json 里叫 `sp2`，但 main-v43.js L503 调 `ensureSubpkg('sp1')` | 改为都叫 `sp1` 或都叫 `frames`，减少认知负担 |
| **主包 avatars 挤占空间** | 22 个角色头像共 1.68MB · 每个角色只在特定 episode 出现 | 可考虑把 EP03+ 角色（fuzhuren/wangpo/villager）移入 sp2 或 CDN |
| **assets/frames/*.png（非 jpg）** | ignore 里排掉了 · 但没生成 jpg 版本时会 fallback CDN，可能慢 | 每次生成 frames 强制转 jpg |
| **BUNDLED_IMAGES 大表** | 43 张图硬编码，story.js 一改 URL 就要同步 | 应该从 assets.registry.json 自动生成 |
| **CDN 域名硬编码** | main-v43.js L842 hardcode | 移到 kconf 或配置文件 |
| **音频冷启动首播延迟** | 163 mp3 都在 CDN · EP01 第一句旁白要下载 | NARR_LOCAL_FORCE 白名单已经把前 20 句留在主包，覆盖启动 3 分钟 |

### 🎯 决策原则（可以贴到 README）

```
┌─────────────────────────────────────────────────────┐
│  策略选择决策树（按体积从小到大）                    │
├─────────────────────────────────────────────────────┤
│                                                     │
│  资源 < 100KB？                                     │
│     → 主包（图标/UI/音效 · 0 延迟）                 │
│                                                     │
│  100KB ~ 500KB 且高频复用？                         │
│     → 主包（头像/常用图 · 提前预热）                │
│                                                     │
│  500KB ~ 5MB · 剧情图/关卡资源？                    │
│     → 分包（sp2 · loadSubpackage 后台预拉）        │
│                                                     │
│  > 5MB · 视频/大图？                                │
│     → CDN（边下边播 + 失败兜底 next）              │
│                                                     │
│  仅出现 1~2 次 · 结局特殊资源？                     │
│     → CDN（避免占主包/分包空间）                    │
│                                                     │
│  必须首屏 0 延迟播放？                              │
│     → 主包 + 预取白名单强制 downloadFile           │
│                                                     │
└─────────────────────────────────────────────────────┘
```

---

## 五、体积健康度检查工具

```bash
# 打包前一定跑一下
node scripts/tools/preview-check.js

# 详细看未匹配的文件
node scripts/tools/preview-check.js -v
```

看几个关键指标：
- **将进包总大小**：目标 < 17MB（warn 阈值）
- **目录占比 Top**：assets/frames/ 应该 0%（都在 sp2）· 如果冒出来说明 ignore 漏了
- **单文件超大**：任何 >4MB 的文件都要审视是否该走 CDN

---

## 六、给未来的自己

**每加一个大资源前，先问这 3 个问题**：

1. **它出现几次？** 出现 ≥ 5 次 → 考虑主包/分包；出现 1~2 次 → CDN
2. **必须秒开吗？** 是 → 主包；可以 loading 1~2 秒 → 分包；可以 loading 3~5 秒 → CDN
3. **总大小影响主包吗？** 加进去会不会超 17MB？超了就必须走 CDN

**踩过的坑（写在这别再犯）**：
- ❌ v40 之前所有视频打主包 → 54MB 超限 → 挪 CDN
- ❌ v42 之前所有 mp3 打主包 → 主包 30MB → 挪 CDN
- ❌ frames png/jpg 混打包 → PNG 5MB/张 → 强制转 jpg + 分包
- ❌ 忘记 ignore assets/videos/*_original.mp4（生成中间产物）→ 意外打进去
- ❌ tmp/、docs/、scripts/、.codeflicker/ 忘 ignore → 主包体积翻倍

---

_v1.0 · 2026-08-10 · 沉淀自 v40~v72.13 打包踩坑史_
