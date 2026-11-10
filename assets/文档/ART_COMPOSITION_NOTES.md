# 场景静帧 · 构图与程序对齐说明

本文件说明 **程序热区 / 矢量 UI** 与静帧美术如何对齐，便于在 **不改玩法** 的前提下迭代设计图（风格保持：治愈系手绘 + 轻度像素）。

## 已同步到本目录的资源

| 文件 | 引擎路径 | 用途 |
|------|-----------|------|
| `scene-map-land.jpg` | `island-bakery/package/res/Image/` | 横屏地图 |
| `scene-map-port.jpg` | 同上 | 竖屏地图 |
| `scene-fish-land.jpg` | 同上 | 横屏钓鱼 |
| `scene-fish-port.jpg` | 同上 | 竖屏钓鱼 |
| `scene-coconut-land.jpg` | 同上 | 横屏椰林 |
| `scene-coconut-port.jpg` | 同上 | 竖屏椰林 |
| `scene-shop-land.jpg` | 同上：`assets/scene-shop-land.jpg` 与 `island-bakery/package/res/Image/scene-shop-land.jpg` 内容一致 | 横屏烤鱼店 |
| `scene-shop-port.jpg` | 同上 | 竖屏烤鱼店 |
| `scene-build-land.jpg` | 同上 | 横屏建店 |
| `scene-night.jpg` | 同上 | 夜间等 |

根目录 `assets/` 下另有风格稿 PNG（如 `横屏场景图.png`），与上表 **并行保留**，改构图时可对照但不强制覆盖引擎 `res/Image`。

## 安全区（程序固定）

- 顶部约 **64** 设计单位、底部约 **72**（导航栏）在 `renderer.js`/`input.js` 中间距一致。静帧 **勿** 在底部 72 以内画必点按钮（除非与程序热区已坐标对齐）。
- 钓鱼：`input.js` 横屏选点/饵在 **y≈376~420**，抛竿 **(520,405)** 等区域；竖屏在下部 `actY`。画中「船/人」勿挡该区域。
- 烤鱼店：厨房大块热区 + 底部选鱼条；**加火 = 厨房区 QTE 点击**，若画独立「加火」按钮须落在厨房热区内（与 `input.js` 的 `shop` 分支矩形一致）。

## 设计改稿优先级（相对 v1.2 Rubrics）

1. 去掉或与程序合一的 **假按钮**（避免点不到）。  
2. 钓鱼画面鱼种 **仅画当前钓点可出现种类**（浅滩默认小海鱼 + 少量三文鱼机会），勿画金枪鱼/金色传说除非钓点已解锁。  
3. 烤鱼店：**顾客**由静帧承担时，程序在 `artOn` 下不再叠完整矢量顾客卡（见 `renderer.js` 逻辑）。静帧需能读懂「点餐气泡」或留白给程序仅用气泡层。

## AI 生图改构图时的提示词要点（风格不变）

- 固定画风句：*healing hand-drawn illustration, light pixel texture, warm yellow cream sandy palette, same characters and brush feel as reference*。  
- 附带 **本目录同名 JPG 作参考**，要求 **layout-only change**：挪按钮、挪海面鱼种、留白给顾客/成品区，**不改变**色相与笔触及角色画风。

---

## 静帧迭代记录 · 2026-11-06（图生图 GPT-Image-2.5-Sunburst · 风格锁定）

**已覆盖文件**（`assets/` 与 `island-bakery/package/res/Image/` 已校验字节一致）：

| 文件 | 本轮修复内容 |
|------|----------------|
| `scene-fish-land.jpg` | 去掉金币条 / 图鉴 / 红色抛竿等假按钮；浅滩仅小海鱼群 + 1 条三文鱼，去掉金枪鱼与金色传说 |
| `scene-fish-port.jpg` | 去掉金币条 / 红色假按钮；深水区仅鱼影与气泡，中水层 1 条三文鱼，浅滩小鱼群保留 |
| `scene-shop-land.jpg` | 去掉顶部进度条 / 齿轮 / 篮子 / 火焰假按钮；柜台留空木盘作成品区 |
| `scene-shop-port.jpg` | 去掉星星条 / 齿轮 / 红叉勺钮 / 篮子假钮；底部净木地板给程序选鱼条，烤架旁留空盘 |

**约定未改**：`scene-map-*`、`scene-coconut-*`、`scene-build-land`、`scene-night` 保持不动。

**热区**：layout-only，未改 `input.js` 假定；若实机叠图有偏移再按像素微调。

**压缩包**：`island-bakery/island-bakery.zip`（约 16.2MB）含 `res/Image` 与 `res/Image/ui/` 四套皮肤。

**引擎接入（2026-11-07）**：`renderer.js` 在钓鱼/烤鱼店优先加载 `ui-skin-*.png` 全帧底图（`uiSkinChrome`）；`drawHUD`/`drawNav` 跳过奶油底与木牌矢量，`input.js` 热区不变；失败时回退 `scene-*.jpg`。

---

## 治愈系 UI 皮肤 · 2026-11-07（designai 图生图，实体化程序矢量 UI）

**背景**：`renderer.js` 的 `drawHUD`（顶部 0~64 奶油色横条+文字）与 `drawNav`（底部导航带+`地图/背包` 按钮）在 `artOn` 下仍以矢量绘制，形成「白盒感」。本轮用 designai 以 `scene-shop-*.jpg` 静帧为参考生成 **含实体化 UI 的成品皮肤 PNG**，落地到新目录 `island-bakery/package/res/Image/ui/`（**不覆盖**干净静帧 `res/Image/scene-*.jpg`）。

**皮肤中实体化的 UI ↔ 程序对应关系**：

| 皮肤元素 | 对应程序绘制 | 热区 |
|----------|--------------|------|
| 顶部风化木板状态栏（内凹刻槽留白） | `drawHUD` 奶油色横条；数值文字仍由程序动态叠加 | 无（纯显示） |
| 左下「地图」「背包」系带木牌 | `drawNav` 的 `this.button(20/170, navY+8, 130, 48, ...)` | `input.js` L155-156 不变 |
| 顾客头顶空白羊皮纸气泡 | 订单气泡层（程序可叠订单内容） | 顾客区热区不变 |
| 椰壳毛边+木托摆盘 | 椰汁交互区视觉 | `input.js` shop 分支不变 |

**已落地文件**（1600 长边 PNG，共 4 张全量完成）：

| 文件 | 热区对齐实测（设计单位） |
|------|--------------------------|
| `ui/ui-skin-shop-land.png` | 「地图」牌 (33-174, 474-528) vs 热区 (20,476)-(150,524) ✓；「背包」牌 (192-330) vs (170,524) ✓，偏差 ≤30 可接受 |
| `ui/ui-skin-shop-port.png` | 「地图」牌 (21-153, 894-948) vs (20,896)-(150,944) ✓；「背包」牌 (174-303) vs (170,944) ✓ 几乎精确 |
| `ui/ui-skin-fish-land.png` | 第3版（双参考图迭代）：「地图」牌 (18-174, 477-528) vs (20,476)-(150,524) ✓；「背包」牌 (186-336) vs (170,524) ✓ 轻微右扩可接受；钓点/鱼饵/抛竿控件保持程序矢量绘制 |
| `ui/ui-skin-fish-port.png` | 「地图」牌 (21-153, 894-945) vs (20,896)-(150,944) ✓；「背包」牌 (174-300) vs (170,944) ✓ 几乎精确 |

钓鱼皮肤的钓点/鱼饵/抛竿控件**保持程序矢量绘制**（有动态选中态，不画进皮肤）。

**对接方案（热区一律不动）**：
1. **整图 backdrop**：`backdropKey()` 对 shop/fishing 返回 ui-skin-*；`drawHUD`/`drawNav` 跳过奶油底与按钮底、只叠动态文字。木牌横向偏差 ≤30 单位时可选微调 `input.js` 的 `170` 起点。
2. **纹理贴片（推荐渐进）**：用 `KwaiMedia.Image.load`（`renderer.js` L98-154 已有同款加载）把皮肤裁出的顶栏/木牌纹理画在原矢量矩形上，`input.js` 完全不动。

---

## UI 皮肤第二轮 · 2026-11-07 晚（10 条截图反馈 → 13 张资产，全部已同步 `assets/ui/`）

**替换（4 张，顶栏重制）**：`ui-skin-fish-land.png`、`ui-skin-fish-port.png`、`ui-skin-shop-land.png`、`ui-skin-shop-port.png`
- 顶栏改为：左端手绘艺术字「孤岛烤鱼店」（米白，不被遮挡）+ 5 个浅米黄纸色内凹槽位（图标依次：太阳/金币/小鱼/椰子/星星徽章），槽内空白，黑字直接可读。
- **槽位横向坐标**：横屏 ≈ 35-45.5% / 46-58.5% / 59-71.5% / 72-85.5% / 86-98.5%；竖屏 ≈ 20.5-33.5% / 35-48% / 49.5-62.5% / 64-77% / 78.5-91.5%。`drawHUD` 各文字起点（第N天/金币/鱼肉/椰子/等级）均落在对应槽内；横屏「等级」尾部可能超槽右缘，代码侧可把 x830 微调至 ≈810。
- 其余内容（场景/木牌/气泡/鱼种规则）与上一版一致。

**新增场景皮肤（4 张）**：`ui-skin-coconut-land.png`、`ui-skin-coconut-port.png`（椰林+顶栏+木牌+右下编织椰子筐与空白计数牌，筐位 ≈76-93% 宽/62-92% 高，计数牌在其上方）；`ui-skin-map-land.png`、`ui-skin-map-port.png`（地图+顶栏+木牌+「钓鱼区」「椰林区」「烤鱼店」迷你木牌标签挂在对应路牌下；带锁路牌不加字保持神秘感；无「待搭建」「离线采集」字样）。

**新增弹窗卡与按钮（5 张，均无烘焙文字，程序叠字）**：
- `dialog-fish-result.png`（4:3）：空标题横幅+圆形凹槽（放鱼图）+两条文字条+底部宽按钮槽 → 对应 `drawFishResult` 400×300 矩形
- `dialog-coconut-summary.png`：椰子插画+两条文字条+两个按钮槽 → `drawCoconutSummary` 480×300
- `dialog-offline.png`：月星插画+三条文字条+两个按钮槽（无任何时间数字）→ `drawOfflineDialog`
- `dialog-go-fishing.png`：空鱼篓插画+两条文字条+两个按钮槽 → 新增「鱼不足去钓鱼」确认流程
- `btn-wood.png`（21:9）：通用木牌按钮贴图，中央留白，`button()` 贴图用（拉伸绘制）

**代码侧待办（renderer/input/selling，热区一律不动）**：
1. `drawHUD` 不再绘制标题文字「孤岛烤鱼店」（皮肤已有艺术字）；全套字体字号统一。
2. `uiSkinCatalog` 增加 coconut/map 四张 + `backdropKey` 对应返回；失败回退 `scene-*.jpg`。
3. `drawMap`：删「地图」「钓鱼区」「椰林区」「待搭建」矢量文字；离线入口改「点亮/置灰 + 点击提示未解锁 + 满 20 分钟自动弹窗」，不写死分钟数。
4. 提示文字清理：钓鱼「1 选点 2 看气泡…」整行删；「选中浅滩…」「等待…再提竿」缩小+统一样式；椰林「点击椰树摇一摇」移上半屏低调艺术化，椰子开始掉即消失。
5. 弹窗贴图化：`drawFishResult`/`drawCoconutSummary`/`drawOfflinePrompt`/`drawOfflineDialog` 用 `dialog-*.png` 替换奶油矩形；离线弹窗删「你已经玩了 20 分钟」。
6. 烤鱼店：删「烤鱼区」「椰子区」标签与矢量椰子块（皮肤已画椰汁吧）；订单气泡文字+餐品小图（可裁 `assets/e1_fish_icons.png`）；鱼不足→`dialog-go-fishing` 确认→跳地图流程新增。
7. 钓鱼选点/鱼饵六宫格改「抽屉式收纳」（已解锁外露+未解锁收纳）：逻辑与热区重排由代码侧定义布局后，再补美术资产。
8. 搭建（build）砍树动画为矢量交互，静帧无法替代：需代码侧贴精灵图（designai 不支持透明通道输出）或保留矢量美化。

**本轮提示词要点（复用）**：参考图 `res/Image/ui/ui-skin-*.png` 或 `res/Image/scene-*.jpg`；约束句=只重绘顶栏/layout-only/热区不动/顶 64 底 72 安全区/浅滩鱼种规则；落盘 `res/Image/ui/` + 同步 `assets/ui/`。

---

## 地图热区 C4（2026-11-07）· 对齐 `ui-skin-map-*`

验收叠图：`docs/_debug-map-zones-v2.png`（橙=新烤鱼店，黄=旧菜园误触区已废弃）。

**横屏（`MapZones.land`，红框标定 v3）**：钓鱼路牌 `228,100,134×115`；椰林 `385,98,118×115`；烤鱼店 `32,252,140×130`；离线 `675,405,250×48`。叠图 `docs/_debug-map-zones-v3-land.png`。判定：钓鱼 → 椰林 → 烤鱼店（互不重叠）。

**竖屏（`MapZones.port`）**：钓鱼 `26,90,250×215`；椰林 `22,312,248×235`；烤鱼店 `268,312,252×235`（中段左右分块）。

**竖屏**：顶段整带宽 = 钓鱼；中段左半 = 椰林、右半 = 烤鱼店（`shopBuilt` 时）；底段仅菜园展示 + 离线钮，**不再**跳转店铺。

## 钓鱼钓具抽屉 B3（布局定稿，供美术补「更多」木牌装饰）

| 横屏 | 矩形（设计坐标） | 说明 |
|------|------------------|------|
| 浅滩/蚯蚓 | `(14,376,120,38)` / `(14,420,120,38)` | 常显，热区未动 |
| 更多/收起 | `(392,376,100,82)` | 切换 `fishingDrawerOpen` |
| 抽屉面板 | `(8,318,388,58)` | 展开时礁/深/虾米/秘制 `(142,328)` 等 |
| 竖屏更多 | `(W-112,ct+54,104,74)` | 展开时六格回到原三列坐标 |

未解锁项灰底+「锁」；真解锁规则仍由 `collection.selectSpot/Bait` 控制。

## e1 鱼种图集裁切（2×2，`e1_fish_icons.png`）

| speciesId | UV（u0,v0–u1,v1） |
|-----------|-------------------|
| small | 0,0 – 0.5,0.5 |
| salmon | 0.5,0 – 1,0.5 |
| tuna | 0,0.5 – 0.5,1 |
| golden | 0.5,0.5 – 1,1 |

`renderer.paintFishIcon`：订单气泡、鱼种条叠加；加载键 `e1-fish-icons`。

## UI 叠图去白底（alpha key）

木牌/弹窗等**叠在地图上的 PNG** 若导出带 `#FFF` 实底，会出现白矩形。批量处理：

```bash
cd island-bakery
# 默认：从四角泛洪抠连通白底（btn-wood、dialog-*）
python3 scripts/alpha_key_ui_png.py package/res/Image/ui/btn-wood.png package/res/Image/ui/dialog-*.png
# 大图仅去纯白边距时用 --mode white --min-rgb 255（勿对 ui-skin-* 全屏皮肤泛洪）
python3 scripts/alpha_key_ui_png.py --mode white --min-rgb 255 package/res/Image/e1_fish_icons.png
```

处理完同步 `assets/ui/`，浏览器 **强刷**（`Cmd+Shift+R`）。**不要**对 `ui-skin-*.png` 跑 `flood`，会误抠云层/奶白纸面。

## 资产中文目录

见 `assets/资产清单.md`。**钓具（皮肤）**：收起时仅「钓具」钮；展开后抽屉内可选浅滩/蚯蚓，未解锁项只文字提示不画木牌。

## 烤鱼订单气泡

**皮肤模式**：`ui-skin-shop-*` 已画气泡框，程序 **不贴** `order-bubble.png`，仅在 `shop-layout.js` 锚点内叠鱼图标+文字。无皮肤时用矢量/贴图气泡。
