# 游戏侧 · fillplace 新玩法 + dressup 抽象重构方案

状态：待评审 | 关联：`laotie-zhaocha-ac/docs/fillplace-cms-plan.md`（后台侧）
范围：① 新增 fillplace 玩法；② 把 dressup 的通用部分抽成可复用基类

## 0. 先说结论：哪些该抽，哪些不该抽

你提的"把换装玩法拆成配置项方便复用"方向是对的，但**"配置项"和"基类"是两种不同的复用手段，用错会反噬**。判断标准只有一条：

> **变化的是「结构」还是「数值」？**
> 结构变化 → 抽基类（代码继承）；数值/开关变化 → 做配置项。

具体到 dressup，我把它拆成三层：

| 层 | 内容 | 处置方式 | 理由 |
|---|---|---|---|
| **A. 通用骨架** | 候选区渲染、拖拽三件套、落点判定、吸附动画、进度统计 | **抽成基类 `DragMatchMode`** | fillplace 和 dressup 的行为是同一套，只是参数不同。代码级复用，不是配置能表达的 |
| **B. 可配置差异** | 候选区位置/布局、拖拽体尺寸策略、判定方式、是否严格匹配、是否多页 | **做成配置项** | 同一套骨架的不同"形态"，用数据描述最合适 |
| **C. 玩法专属** | 角色切换/气泡对话/过渡动画（dressup）；线稿底图渲染/槽位绘制（fillplace） | **留在各自子类里，不抽** | 硬抽成配置会把基类变成一个包含大量 `if (mode === 'dressup')` 的怪物 |

**最容易犯的错是把 C 也塞进配置项。** 比如"是否显示对话气泡"——只有 dressup 有这个需求，把它做成配置项会让 fillplace 也背上一个用不到的字段，配置文件的语义被稀释。**专属逻辑就该留在专属子类里。**

---

## 第一部分 · dressup 抽象重构

### 1.1 现状盘点

dressup.js 共 686 行，按职责可以切成：

| 功能块 | 行数区间 | 归属层 |
|---|---|---|
| 构造函数：洗牌 outfits、建索引、初始化状态 | 4~46 | A（骨架，洗牌是通用需求）+ C（气泡/引导初始化） |
| 拖拽三件套 `startDrag`/`moveDrag`/`endDrag` | 57~122 | A |
| `switchChar` / `_scheduleAutoAdvance` / `_autoAdvanceToNextChar` / `_startCharTransition` | 124~178 | **C**（多角色切换，fillplace 没有） |
| `_showCharDialog` | 180~186 | **C** |
| `onTick` / `_onTimeout` / `onRevive` | 188~236 | A（错误次数用尽的失败链路，fillplace 同构） |
| `getStatusInfo` / `getLoseTitle` / `getLoseSubtitle` / `getReviveToast` / `showToolbarButtons` | 238~283 | A |
| `onHint`（滚动定位 + 手势引导） | 285~316 | A（骨架，定位目标是通用的） |
| `initState` / `onCorrectCallback` / `onWrongCallback` | 318~368 | A（回调骨架）+ C（具体音效名） |
| `_isOnCharacter` | 370~377 | A（应泛化为"落点判定"，见 1.3） |
| `_drawCharImage` | 379~393 | **C**（角色立绘，fillplace 换成底图） |
| `draw()` 主循环 | 395~686 | 混合：骨架部分（候选区 strip、拖拽体、引导动画）+ 专属部分（立绘、气泡、切换按钮） |

其中 `_isOnCharacter` 是"落点判定"的最简形态——单个大矩形，fillplace 需要的是"多目标最近邻"，所以这一处必须泛化：

```370:377:js/play/modes/dressup.js
  DressupMode.prototype._isOnCharacter = function (x, y) {
    if (!this._fit) return false;
    return x >= this._fit.x &&
           x <= this._fit.x + this._fit.w &&
           y >= this._fit.y &&
           y <= this._fit.y + this._fit.h;
  };
```

### 1.2 抽取 `DragMatchMode` 基类

新增 `js/play/modes/drag-match-mode.js`，放在 `base-mode.js` 之后、各玩法之前加载：

```
base-mode.js
  └─ drag-match-mode.js   ← 新增：拖拽配对骨架
       ├─ dressup.js      ← 改：继承 DragMatchMode，只保留 C 层
       └─ fillplace.js    ← 新：继承 DragMatchMode
```

**基类提供的通用能力**（对应 A 层）：

```js
function DragMatchMode(level, theme) {
  BaseMode.call(this, level, theme);
  this._items       = [];      // 候选区条目（dressup=outfits，fillplace=slots）
  this._itemById    = {};
  this._matched     = {};      // 已匹配集合
  this._matchedCount = 0;
  this._totalCount  = 0;
  this._dragging    = null;
  this._scrollX     = 0;
  this._cfg         = this.getDragMatchConfig();   // ← 配置项入口，见 1.3
}
BaseMode.extend(DragMatchMode);
```

**通用方法**（从 dressup 平移过来，逻辑不变）：

- `startDrag(itemId, x, y)` / `moveDrag(x, y)` / `endDrag(x, y)`
- `_findDropTarget(x, y)` ← 从 `_isOnCharacter` 泛化而来，见 1.3
- `_drawTray()` ← 候选区横向滚动条，从 `draw()` 里抽出
- `_drawDraggingItem()` ← 拖拽体渲染，从 `draw()` 里抽出
- `_drawHintAnimation()` ← 手势引导动画，从 `draw()` 里抽出
- `_scrollToItem(itemId)` ← 从 `onHint` 里抽出（滚动定位逻辑）
- `getStatusInfo()` / `getLoseTitle()` / `getLoseSubtitle()` / `onRevive()`
- `initState()` ← 错误次数/时间限制初始化

**基类不提供的**（留给子类）：

- 底图怎么画（dressup 画角色立绘，fillplace 画线稿）
- 匹配成功后的表现（dressup 是换成立绘 `result`，fillplace 是把子图贴到槽位）
- 任何与"角色"或"槽位"强绑定的概念

### 1.3 配置项设计（B 层）

**这是本次重构的核心产出。** 基类通过一个方法获取配置，子类覆盖它：

```js
/**
 * 拖拽配对玩法的可配置差异项。
 * 子类覆盖此方法返回自己的配置；不覆盖则用默认值（等价于 dressup 现有行为）。
 * @returns {DragMatchConfig}
 */
DragMatchMode.prototype.getDragMatchConfig = function () {
  return {
    // ── 候选区 ──────────────────────────────────────────
    tray: {
      position: 'bottom',    // 'bottom' | 'top' | 'left' | 'right'  候选区位置
      layout: 'h-scroll',    // 'h-scroll'（横向滚动）| 'grid'（网格铺开）
      cardSize: 70,          // 卡片短边尺寸（逻辑像素）
      gap: 6,
      sidePad: 12,
      maxRows: 1,            // layout='grid' 时生效
    },

    // ── 拖拽体 ──────────────────────────────────────────
    dragGhost: {
      sizing: 'scale',       // 'scale'（缩略图的 N 倍）| 'actual'（目标实际尺寸）
      scale: 4,              // sizing='scale' 时生效
      baseSize: 60,
      offsetY: 0,            // 拖拽体相对手指的 Y 偏移（避免手指遮挡）
    },

    // ── 落点判定 ────────────────────────────────────────
    drop: {
      strategy: 'single',    // 'single'（落在唯一大矩形内）| 'nearest'（最近邻域）
      snapRadius: 0.6,       // strategy='nearest' 时生效：目标短边 × 该系数
      snapRadiusMin: 60,     // 兜底最小半径（逻辑像素）
      requireIdMatch: true,  // true=必须 id 匹配；false=任意位置都能放
      minHitSize: 0,         // 小于该尺寸的目标强制外扩判定框（仅判定，不改渲染）
    },

    // ── 吸附动画 ────────────────────────────────────────
    snap: {
      enabled: true,
      durationMs: 180,
      easing: 'easeOut',     // 暂只支持 'easeOut' | 'linear'
      pulseScale: 1.08,      // 吸附时的缩放脉冲峰值（1.0 = 无脉冲）
    },

    // ── 其他 ────────────────────────────────────────────
    shuffle: true,           // 候选区是否打乱顺序
    autoAdvanceMs: 600,      // 匹配后自动切换下一目标的等待时长（0 = 不自动切换）
  };
};
```

**各配置项在两个玩法下的取值：**

| 配置 | dressup | fillplace |
|---|---|---|
| `tray.position` | `'bottom'` | `'bottom'` |
| `tray.layout` | `'h-scroll'` | `'h-scroll'`（子图多时可切 `'grid'`） |
| `dragGhost.sizing` | `'scale'`（4×） | **`'actual'`** ← 关键差异 |
| `drop.strategy` | `'single'` | **`'nearest'`** ← 关键差异 |
| `drop.snapRadius` | 不生效 | `0.6` |
| `drop.requireIdMatch` | `true` | 待定（见 §3 待确认） |
| `snap.enabled` | dressup 现无吸附动画 | **`true`** |
| `shuffle` | `true` | `true` |
| `autoAdvanceMs` | `600` | `0`（fillplace 不自动切换） |

> **为什么 `dragGhost.sizing` 必须是可配置的**：dressup 的衣服卡片没有"大小"概念（衣服跟着角色走），用小缩略图拖拽更方便看清；fillplace 的核心乐趣恰恰是"这块形状对得上这个位置吗"，必须用**真实尺寸**拖拽让玩家做视觉对齐（见关联文档 §7.1）。同一套骨架，两个相反的取值——这正是配置项存在的意义。

### 1.4 重构后的 dressup.js

改动集中在：

1. **构造函数**：只保留 C 层初始化（`_characters`/`_bubble`/`_transition`），A 层交给基类
   ```js
   function DressupMode(level, theme) {
     DragMatchMode.call(this, level, theme);   // ← 改为继承基类
     this._characters = level.characters || [];
     this._currentChar = 0;
     this._bubble = null;
     this._transition = null;
     this._matchedChars = {};   // ← 角色维度的匹配状态（基类只有 item 维度）
     // ...
   }
   DragMatchMode.extend(DressupMode);   // ← 新增 extend（与 BaseMode.extend 同款）
   ```

2. **覆盖 `getDragMatchConfig()`** 返回 dressup 的取值（即上表的左列）

3. **覆盖 `_drawTargetArea()`** 画角色立绘（原 `_drawCharImage`）

4. **覆盖 `_onItemMatched(item)`** 处理匹配成功：换成立绘 `result` + 触发自动切换 + 播对白

5. **删除**已上移到基类的方法（`startDrag`/`moveDrag`/`onHint` 的滚动部分等）

**风险控制**：dressup 是**线上正在跑的玩法**，重构必须保证行为零变化。建议：

- 重构前后各跑一遍完整关卡，逐项对比（候选区滚动、拖拽手感、气泡时机、切换动画、失败弹窗文案、复活数值）
- 先落地基类 + dressup 改造，**fillplace 等 dressup 验证通过后再开工**，避免两个变量同时引入

---

## 第二部分 · fillplace 玩法实现

### 2.1 文件与注册

**新增** `js/play/modes/fillplace.js`：

```js
function FillPlaceMode(level, theme) {
  DragMatchMode.call(this, level, theme);
  this._fit = null;    // 底图在舞台里的显示矩形
}
DragMatchMode.extend(FillPlaceMode);
```

**`js/core/config.js` — GAMEPLAY_MODES 追加**：

```js
fillplace: { id: 'fillplace', name: '拖拽填充', setupSec: 8, module: 'FillPlaceMode' }
```

**`index.html` — 脚本加载顺序**（在 `base-mode.js` 之后、`dressup.js` 之前插入基类）：

```html
<script src="js/play/modes/base-mode.js?v=17"></script>
<script src="js/play/modes/drag-match-mode.js?v=1"></script>   <!-- 新增 -->
<script src="js/play/modes/hidden.js?v=16"></script>
...
<script src="js/play/modes/dressup.js?v=18"></script>
<script src="js/play/modes/fillplace.js?v=1"></script>          <!-- 新增 -->
```

> `play.js` **零改动**——它已通过 `ModeRegistry.create(level.mode, ...)` 泛型创建实例。

### 2.2 配置

```js
FillPlaceMode.prototype.getDragMatchConfig = function () {
  return {
    tray:      { position: 'bottom', layout: 'h-scroll', cardSize: 70, gap: 6, sidePad: 12 },
    dragGhost: { sizing: 'actual', offsetY: -20 },   // 真实尺寸 + 上移避免手指遮挡
    drop:      { strategy: 'nearest', snapRadius: 0.6, snapRadiusMin: 60,
                 requireIdMatch: true, minHitSize: 0.06 },
    snap:      { enabled: true, durationMs: 180, easing: 'easeOut', pulseScale: 1.08 },
    shuffle:   true,
    autoAdvanceMs: 0,
  };
};
```

### 2.3 数据源

fillplace 的 `slots[]` 同时是"目标位置表"和"候选区数据源"，在构造函数里拆成两份：

```js
function FillPlaceMode(level, theme) {
  DragMatchMode.call(this, level, theme);
  this._slots = level.slots || [];
  this._baseImage = level.baseImage;
  // 候选区条目 = slots 的浅拷贝（洗牌后顺序与位置表解耦）
  this._items = this._slots.map(function (s) {
    return { id: s.id, thumbnail: s.asset, name: s.id };
  });
  this._totalCount = this._slots.length;
}
```

> 基类只认 `_items`（候选区）和 `getDropTargets()`（落点目标），两者在 fillplace 里指向同一批数据的不同侧面。**这个解耦很重要**：洗牌只影响 `_items` 的顺序，不会打乱 `_slots` 的位置表。

### 2.4 渲染

**覆盖 `_drawTargetArea()`**：

```js
FillPlaceMode.prototype._drawTargetArea = function () {
  var stage = CONFIG.getLayoutRegions('fillplace').stage;
  // 底图撑满宽度、纵向居中（与 hidden/hunt/story 一致）
  this._fit = this._calcFitWidth(this._baseImage, stage.x, stage.y, stage.w, stage.h);
  if (this._fit) this._drawImageDividers(this._fit.y, this._fit.y + this._fit.h);
};
```

**覆盖 `_drawPlacedItems()`**（基类留的钩子，在底图之后、拖拽体之前调用）：

```js
FillPlaceMode.prototype._drawPlacedItems = function () {
  if (!this._fit) return;
  var fit = this._fit;
  // 按 zIndex 升序绘制已放置的子图
  var placed = this._slots.filter(function (s) { return /* 已匹配 */ }, this);
  placed.sort(function (a, b) { return (a.zIndex || 0) - (b.zIndex || 0); });
  for (var i = 0; i < placed.length; i++) {
    var s = placed[i];
    Renderer.drawImage(s.asset,
      fit.x + (s.x / 100) * fit.w, fit.y + (s.y / 100) * fit.h,
      (s.w / 100) * fit.w,        (s.h / 100) * fit.h);
  }
};
```

**层级**（基类统一管理）：

```
1. 底图（线稿）              ← _drawTargetArea()
2. 已放置的子图（按 zIndex）  ← _drawPlacedItems()
3. 拖拽中的子图（永远最上）    ← 基类 _drawDraggingItem()
4. 提示遮罩 / HUD            ← 基类 + play.js
```

> **"盘子是空的"不需要额外素材**：底图本身就是空盘子，已放置的子图逐个叠上去，画面逐渐填满，天然形成进度反馈。

### 2.5 坐标换算（关键陷阱）

`fit` 是"底图在舞台里的实际显示矩形"，**不等于**舞台矩形——它的高宽比由底图原图比例决定：

```
fit.w / fit.h = 底图原图宽高比
stage.w / stage.h = 屏幕可用区域比例（两者通常不等）
```

**所有百分比换算必须以 `fit` 为基准。** 用 `stage` 会导致底图有留白时坐标整体偏移，且偏移量随机型变化——这是 spot 模式踩过的坑（其 `draw()` 里有大段注释说明）。fillplace 复用 `_calcFitWidth` 就是为了绕开这个。

### 2.6 tint 说明

**本玩法默认不需要 tint**。子图切图本身就是正确颜色，直接 `Renderer.drawImage(asset, x, y, w, h)` 即可。

需要 tint 的场景只有可选增强：

| 效果 | 用法 |
|---|---|
| 已放置元素高亮闪烁 | `drawImage(asset, x, y, w, h, alpha, [1.2, 1.2, 1.2])` |
| 提示时槽位轮廓 | 用 `ShapeBatch` 纯色矩形描边，不需要 tint |

> ⚠️ **tint 是乘法**（`color.rgb *= v_tint`，见 `render/shaders.js`）。`[1,1,1]` 是原样、`[1.2,1.2,1.2]` 是提亮。**不要用 tint 把彩色图染成另一个颜色**——彩色图乘非红通道会直接变黑。

### 2.7 提示功能

复用 `BaseMode._drawHintMask`（整图盖暗色遮罩、目标处挖空）。注意它挖的是**圆形**、半径按 `max(halfW, halfH, 18) * 1.25` 算——对细长元素（一根竖着的树干）会挖得过大或过小。建议 fillplace 覆盖一个**矩形挖空**版本，或接受现状（提示只需"大概在哪"）。

### 2.8 边界与容错

| 场景 | 处理 |
|---|---|
| 底图加载失败 | 走 `TextureManager` 占位逻辑 + 重试，不阻塞候选区 |
| 某个 `slot.asset` 404 | 该槽位标记不可用，`_totalCount` 相应减少，避免永远无法通关 |
| 子图尺寸极小（< 屏宽 6%） | 判定框强制外扩到 `minHitSize`（仅判定用，渲染仍用真实尺寸） |
| 候选区元素过多（> 12） | 横向滚动；超 20 建议切 `tray.layout='grid'` + 两行 |
| 元素重叠遮挡 | 按 `zIndex` 绘制；重叠关系由后台配置时确定 |

---

## 第三部分 · 实施计划与验收

### 3.1 分阶段

**阶段一：基类抽取 + dressup 改造**（不动 fillplace）

1. 新建 `drag-match-mode.js`，把 dressup 的 A 层逻辑平移进去
2. `dressup.js` 改为继承基类，只留 C 层
3. **验收：dressup 行为零变化**（逐项对比 3.3 清单）

**阶段二：fillplace 实现**

4. 新建 `fillplace.js`（约 150~200 行，因为骨架已在基类里）
5. 注册 mode + 补 mock 关卡 JSON
6. **验收：mock 数据跑通拖拽/吸附/结算全流程**

**阶段三：联调**

7. 接后台产出的真实 `slots` 数据
8. 真机验证（吸附手感、性能、多机型坐标对齐）

### 3.2 为什么这样排

- **阶段一先做且独立验收**：基类抽取是重构，风险最高（线上玩法），必须单独验证。把 fillplace 一起做会让"是重构改坏了还是新玩法本身有问题"难以区分。
- **阶段二用 mock 数据**：不依赖后台进度，可以并行推进。
- **阶段三才联调**：此时两侧都各自验证过，出问题容易定位。

### 3.3 dressup 回归验收清单

重构后逐项确认：

- [ ] 候选区横向滚动正常，命中空白才滚动、不抢卡片拖拽
- [ ] 拖拽体 4× 放大、跟手位置正确
- [ ] 拖到角色上判定成功、拖到角色外判定失败并播放 `playUiClick`
- [ ] 匹配成功后自动切换到下一个未匹配角色（延迟 `DRESSUP_AUTO_ADVANCE_MS`）
- [ ] 左右箭头切换角色、滑动过渡动画正常
- [ ] 气泡对话展示时机与文案（翻到角色时触发，非匹配时）
- [ ] 手势引导动画（首次进入循环 4 次、匹配成功后立即停止）
- [ ] 看视频提示的滚动定位（`onHint` 定位到正确衣服卡片）
- [ ] 错误次数用尽 → 失败弹窗 `limitType: 'count'`
- [ ] 时间用尽 → 失败弹窗 `limitType: 'time'`
- [ ] 复活数值与文案一致（`getReviveAmount` 单一来源）
- [ ] 状态栏显示"剩 N 次"

### 3.4 fillplace 验收清单

- [ ] 底图撑满宽度、纵向居中，与其他玩法视觉一致
- [ ] 拖拽体为**真实尺寸**（非缩略图）
- [ ] 拖到正确槽位附近（`snapRadius` 内）→ 吸附成功 + 动画
- [ ] 拖到错误位置 → 判定失败 + 红涟漪 + 拖拽体飞回候选区
- [ ] 已放置的子图按 `zIndex` 正确叠放
- [ ] 全部放置完毕 → 走现有通关流程（星级/击败百分比/插屏）
- [ ] 换机型后坐标仍然对齐（验证 `fit` 基准正确）

---

## 第四部分 · 待确认

| # | 问题 | 影响 |
|---|---|---|
| 1 | `drop.requireIdMatch`：必须放对位置（拼图逻辑），还是任意位置都能放（自由贴纸）？ | 决定 `endDrag` 里 `piece.id === slot.id` 比对是否保留 |
| 2 | `tray.layout`：候选区用横向滚动还是网格？子图数量典型值是多少？ | 决定是否需要 `'grid'` 布局实现 |
| 3 | 子元素之间是否有重叠遮挡？ | 有则后台需要 `zIndex` 调整交互，且 `slots` 排序逻辑要正确 |
| 4 | 目标色是否参与玩法（玩家可选色 vs 固定）？ | 若要玩家选色，需要灰度子图 + tint 那套（见 §2.6） |
| 5 | 是否需要提示功能？挖空用圆形还是矩形？ | 决定是否实现矩形挖空版本 |

---

## 速记

- **先分清「结构变化」和「数值变化」**：结构抽基类（`DragMatchMode`），数值做配置项（`getDragMatchConfig()`）。把专属逻辑也塞进配置项，会把基类做成 `if (mode === 'dressup')` 的怪物。
- **两个玩法的关键差异只有两条**：`dragGhost.sizing`（scale vs actual）和 `drop.strategy`（single vs nearest）。其余配置取值相同——这说明骨架抽取的粒度是对的。
- **dressup 是线上玩法，重构必须单独验收、零行为变化**，不能和 fillplace 一起上。
- **坐标换算以 `fit` 为基准，不是 `stage`**——底图有留白时用 `stage` 会随机型偏移，spot 踩过这个坑。
- **fillplace 默认不用 tint**，子图颜色自带；且 tint 是乘法，别想着染彩色图。
- **`slots` 一物两用**：位置表 + 候选区数据源，洗牌只打乱后者。
- **`play.js` 零改动**，两个玩法都走 `ModeRegistry` 泛型创建。
