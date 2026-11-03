# UI 布局规范 + Icon 接入指南

> **职责边界**：本文档只管 ① UI 布局网格 ② icon。
> **车 / 豆人不在范围内** —— `pd-game.js` 的 `drawCar()` / `drawBean()` 已实现，不重复造。

---

## 一、竖向布局网格（750×1624）

```
┌─ hud     0    – 130    8.0%   齿轮 · 关卡胶囊 · [系统胶囊=平台绘制]
├─ art     151  – 800   40.0%   图案豆阵（drawBean 铺格）
├─ lane    800  – 928    7.9%   行走通道（flights 走路区，禁止放 UI）
├─ slot    928  – 1073   8.9%   6 车位（drawCar 装载态）
├─ speed   1073 – 1206   8.2%   加速卡【独占一行】
├─ queue   1206 – 1490  17.5%   候选双排（drawCar 队列态）
└─ tray    1490 – 1624   8.3%   升级 · 消除 · 刷新
                                玩法区合计 = 130–1073 = 56.8%
```

### 关键坐标

```js
// 车位行
SLOT = { x0: 36, w: 104, h: 130, gap: 12, y: 934 }   // ×5 + 解锁位 w=98
// 候选区（row1 可拖 / row2 半透明预览）
QCAR = { w: 96, h: 126, gap: 40, row1: 1283, row2: 1414 }
// 托盘按钮（label 底 = 1526+52+22+14 = 1614 < 1624 ✅）
BTN  = { r: 52, cx: [188, 375, 562], cy: 1526 }
// 加速卡
SPD  = { x: 36, y: 1104, w: 176, h: 72 }
```

### 与现状的 diff（`pd-core.js` PD.L）

| 项 | 现状 | 应改为 | 原因 |
|---|---|---|---|
| `stageY/stageH` | 400 / 560 | 151 / 649 | 玩法区 34.5% → 56.8% |
| — | 无 lane 区 | 800–928 | 走路通道被车位挤占 |
| `slotY` | 990 | 934 | 车位压在裙摆蕾丝上 |
| `slotH/slotW` | 110 / 108 | 130 / 104 | 车必须纵向 h>w |
| `qCarW/qCarH` | 104 / 94 | 96 / 126 | **宽>高读不成车** |
| `qRow1/qRow2` | 1136 / 1234 | 1283 / 1414 | 溢出面板上沿 |
| `trayY` | 1350 | 1490 | 底部 158px 死区 |
| `btnY/btnR` | 1420 / 46 | 1526 / 52 | 与加速卡重叠 38px |

### 三条布局铁律

1. **lane 区禁止放任何 UI** —— 豆子从 art 走到 slot 必须经过它，放东西就会视觉穿插
2. **speed 独占一行** —— 现在 `spdRect()` 与 `btnRect(0)` 实测重叠 x38px / y30px
3. **tray 坐到屏幕最下沿** —— 且 `qPanel` / `tray` 两层紫色不要叠画

---

## 二、Icon 系统

### 网格规范（"不丑"的唯一保证）

```
画板      96 × 96
安全边距  8      → 活动区 80×80
视觉盒    72 × 72   所有字形光学对齐到这个盒
描边线宽  10       round cap + round join
实心最细  18       保证 32px 下不消失
```

### 四条铁律（对应旧版四个丑点）

| # | 铁律 | 旧版错在哪 |
|---|---|---|
| 1 | 箭头必须与弧/杆**连接**，方向 = 该点**切线** | refresh 箭头断开 90°、方向错，读成破 "Ω" |
| 2 | 容器形状统一：托盘=圆，解锁位=圆角方，其余无容器 | 三个圆里混一个圆角方 |
| 3 | 三角形做**形心**光学居中（tip=+2w/3, base=−w/3） | play 用外接盒居中，视觉偏左 |
| 4 | 齿轮的齿必须在环**外侧**（R_tooth > R_ring + sw/2） | 齿与环同半径 → 糊成唱片 ◉ |

### 13 个图标清单

| 文件 | 用途 | 实装位置 |
|---|---|---|
| `ic-speed` | 加速×2 | speed 行 |
| `ic-upgrade` | 升级 | tray 左 |
| `ic-clear` | 消除 | tray 中 |
| `ic-refresh` | 刷新 | tray 右 |
| `ic-play` | 广告标记 | 各广告位角标 |
| `ic-video` | 视频广告 | 车位解锁 / 复活 CTA |
| `ic-home` | 主页 | 失败页 / 过关页 |
| `ic-share` | 分享 | 失败页 / 过关页 |
| `ic-close` | 关闭 | 弹窗右上 |
| `ic-gear` | 设置 | HUD 左 |
| `ic-star` | 星级 | 过关页 |
| `ic-plus` | ＋角标 | 道具补充（**不是** ▶） |
| `ic-lock` | 锁定 | 未解锁项 |

自检：`figma/icons/00-contact-sheet.svg` 每个图标出 96 深底 / 96 浅底 / 48 / 32 / 实装 r=52 五档。
**32px 档读不出来的图标不合格。**

### 角标语义（重要修正）

```
红底白 ＋   → 道具类（升级 / 消除 / 刷新）   "可补充"
红底白 ▶   → 纯广告位（速度 / 解锁 / 复活）  "看视频"
```
现状全部用绿色 `▶`，语义混淆且与绿色 CTA 抢注意力。

---

## 三、接入代码（替换 emoji）

`pd-game.js` 现在用 emoji 画图标：`'⏩ 加速'` `'🖌'` `'🔄'` `'🏠'` `'↗'` `'✕'`。
**emoji 在 canvas 里字体不确定，会渲染成空框**（rsvg 已实测复现）。

把 `tools/gen_icons.py` 的路径逻辑搬成 ES5 canvas 函数：

```js
// ── Icon：96×96 网格，画在 (cx,cy)，size 为外接尺寸 ──
// 用法：icon(g,'refresh', 375, 1526, 75, '#FFFFFF')
function icon(g, name, cx, cy, size, col) {
  var s = size / 96, i, a;
  g.save();
  g.translate(cx - size / 2, cy - size / 2);
  g.scale(s, s);
  g.fillStyle = col; g.strokeStyle = col;
  g.lineWidth = 10; g.lineCap = 'round'; g.lineJoin = 'round';

  if (name === 'refresh') {
    // 铁律 1：弧 + 切线箭头
    var R = 28, t1 = 300 * Math.PI / 180, t2 = 240 * Math.PI / 180;
    g.beginPath();
    g.arc(48, 48, R, t1, t2 + Math.PI * 2);   // 300°→600°(=240°)
    g.stroke();
    var px = 48 + R * Math.cos(t2), py = 48 + R * Math.sin(t2);
    var tx = -Math.sin(t2), ty = Math.cos(t2);        // 切线
    var nx = Math.cos(t2), ny = Math.sin(t2);         // 法线
    g.beginPath();
    g.moveTo(px + tx * 23, py + ty * 23);
    g.lineTo(px + nx * 17, py + ny * 17);
    g.lineTo(px - nx * 17, py - ny * 17);
    g.closePath(); g.fill();

  } else if (name === 'upgrade') {
    g.beginPath();
    g.moveTo(48, 16); g.lineTo(78, 46); g.lineTo(59, 46);
    g.lineTo(59, 80); g.lineTo(37, 80); g.lineTo(37, 46); g.lineTo(18, 46);
    g.closePath(); g.fill();

  } else if (name === 'clear') {
    g.save(); g.translate(48, 48); g.rotate(34 * Math.PI / 180); g.translate(-48, -48);
    rr(g, 41, 12, 14, 42, 7); g.fill();
    g.beginPath();
    g.moveTo(30, 50); g.lineTo(66, 50); g.lineTo(74, 82); g.lineTo(22, 82);
    g.closePath(); g.fill();
    g.restore();

  } else if (name === 'speed') {
    for (i = 0; i < 2; i++) {
      var dx = i ? 2 : -26;
      g.beginPath();
      g.moveTo(48 + dx, 29); g.lineTo(48 + dx, 67); g.lineTo(48 + dx + 24, 48);
      g.closePath(); g.fill();
    }

  } else if (name === 'play') {
    // 铁律 3：形心居中
    g.beginPath();
    g.moveTo(34, 25); g.lineTo(34, 71); g.lineTo(76, 48);
    g.closePath(); g.fill();

  } else if (name === 'video') {
    rr(g, 14, 30, 46, 36, 8); g.fill();
    g.beginPath();
    g.moveTo(64, 44); g.lineTo(84, 32); g.lineTo(84, 64); g.lineTo(64, 52);
    g.closePath(); g.fill();

  } else if (name === 'home') {
    g.beginPath();
    g.moveTo(48, 14); g.lineTo(86, 50); g.lineTo(76, 50); g.lineTo(76, 82);
    g.lineTo(20, 82); g.lineTo(20, 50); g.lineTo(10, 50);
    g.closePath(); g.fill();

  } else if (name === 'share') {
    g.beginPath();
    g.moveTo(66, 26); g.lineTo(66, 18); g.lineTo(30, 18);
    g.arcTo(20, 18, 20, 28, 10); g.lineTo(20, 74);
    g.arcTo(20, 84, 30, 84, 10); g.lineTo(66, 84);
    g.arcTo(76, 84, 76, 74, 10); g.lineTo(76, 58);
    g.stroke();
    g.beginPath(); g.moveTo(46, 52); g.lineTo(84, 16); g.stroke();
    g.beginPath();
    g.moveTo(62, 12); g.lineTo(90, 10); g.lineTo(88, 38);
    g.closePath(); g.fill();

  } else if (name === 'close') {
    g.lineWidth = 12;
    g.beginPath(); g.moveTo(28, 28); g.lineTo(68, 68);
    g.moveTo(68, 28); g.lineTo(28, 68); g.stroke();

  } else if (name === 'gear') {
    // 铁律 4：齿在环外侧
    for (i = 0; i < 8; i++) {
      a = i * Math.PI / 4;
      var gx = 48 + Math.cos(a) * 36, gy = 48 + Math.sin(a) * 36;
      g.save(); g.translate(gx, gy); g.rotate(a);
      rr(g, -7.5, -9.5, 15, 19, 4); g.fill();
      g.restore();
    }
    g.lineWidth = 11;
    g.beginPath(); g.arc(48, 48, 24, 0, 6.2832); g.stroke();

  } else if (name === 'star') {
    g.beginPath();
    for (i = 0; i < 10; i++) {
      a = -Math.PI / 2 + i * Math.PI / 5;
      var rad = (i % 2) ? 18.4 : 40;
      var sx = 48 + Math.cos(a) * rad, sy = 48 + Math.sin(a) * rad;
      if (i === 0) g.moveTo(sx, sy); else g.lineTo(sx, sy);
    }
    g.closePath(); g.fill();

  } else if (name === 'plus') {
    g.fillRect(38, 20, 20, 56);
    g.fillRect(20, 38, 56, 20);

  } else if (name === 'lock') {
    rr(g, 24, 46, 48, 36, 8); g.fill();
    g.beginPath();
    g.moveTo(34, 46); g.lineTo(34, 34);
    g.arc(48, 34, 14, Math.PI, 0); g.lineTo(62, 46);
    g.stroke();
  }
  g.restore();
}
```

### 替换清单

| `pd-game.js` 位置 | 现状 | 改为 |
|---|---|---|
| `drawBg` HUD 齿轮 | 手绘 8 圆点 | `icon(g,'gear',62,66,80,'#FFFFFF')` |
| 加速卡 | `txt('⏩ 加速')` | `icon(g,'speed',68,cy,34,...)` + `txt('速度x2')` |
| `btnRect(0)` 升级 | `txt('⬆')`（无） | `icon(g,'upgrade',188,1526,75,...)` |
| `btnRect(1)` 消除 | `txt('🖌')` | `icon(g,'clear',375,1526,75,...)` |
| `btnRect(2)` 刷新 | `txt('🔄')` | `icon(g,'refresh',562,1526,75,...)` |
| 车位解锁 | 手绘方+三角 | `icon(g,'video',...)` |
| 死局/过关按钮 | `'🏠' '↗'` | `icon(g,'home'/'share',...)` |
| 弹窗关闭 | `txt('✕')` | `icon(g,'close',...)` |
| 道具角标 | `▶` 绿 | `icon(g,'plus',...)` 红底 |

`rr()` 已存在于 `pd-game.js`，`icon()` 直接复用。
