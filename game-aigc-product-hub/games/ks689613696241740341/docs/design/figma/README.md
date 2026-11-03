# Figma 画板 · 导入说明

## 交付物

| 文件 | 尺寸 | 内容 |
|---|---|---|
| `01-play.svg` | 750×1624 | 玩法主页（含行走通道、装载中的车、双排候选区） |
| `02-modal-revive.svg` | 750×1624 | 复活弹窗（变现层，单 CTA） |
| `03-fail.svg` | 750×1624 | 失败页（留存层，云朵 ribbon + 哭脸角色） |
| `04-design-tokens.svg` | 1500×1420 | Design System 总表（色板/组件/布局/文字规范） |

重新生成：`python3 tools/gen_figma.py`

## 导入 Figma

1. 新建 Figma File
2. 把 4 个 `.svg` **直接拖进画布**（不要走 Place Image，会变位图）
3. 每个 `<g id="...">` 自动变成同名 Group 图层，全矢量、可改色可量尺寸

图层命名已按 `模块 / 元素` 组织：
```
BG / base                     背景沉默灰 + 右上楔形
BG / portrait-reveal          立绘动态显影层（占位，标注了 brightness/blur 参数）
HUD                           齿轮 + 关卡胶囊
HUD / system-capsule          ⚠️ 平台绘制，游戏内勿实现
Art / pixel-pattern           像素画豆阵（26×22）
Lane / walking-beans          排队行走的豆子
Slots / slot-1..5             车位（空位虚线框 / 装载中带开门）
Slots / slot-6 locked (AD)    第 6 车位广告解锁
Speed / row                   速度×2 独占一行
Queue / row-1 (draggable)     可拖第一排
Queue / row-2 (preview, dim)  半透明预览第二排
Tray / buttons                升级 / 消除 / 刷新
Modal / card|title-bar|close-X|CTA-reward
Fail / ribbon-cloud|character-crying|actions
__GUIDES__                    ⚠️ 网格标注层，交付给美术前请隐藏
```

## 使用建议

- **改配色**：直接改 `04-design-tokens` 里的色块，再同步回三个页面
- **交付美术**：先把 `01-play` 的 `__GUIDES__` 组隐藏
- **立绘接入**：把 `BG / portrait-reveal` 占位矩形替换为真实立绘，按标注的 brightness 0.55 / blur 8px 处理

## 已知取舍

1. **图标全部矢量路径，无 emoji** —— emoji 在 Figma / 小游戏 canvas 里都可能渲染成空框，已全部改为 `<path>`
2. **立绘显影层是占位** —— SVG 里用半透明色块 + 文字标注表达，真实效果需要在代码里做交叉淡入（不要用实时 `filter: blur`，小游戏端性能不允许）
3. **像素画用冰淇淋** —— 对齐竞品关卡 2；替换成裙子形状时注意 `palette.base` 不能是 `white`
4. **系统胶囊只是占位** —— 右上 `···|⊗` 由快手容器绘制，游戏内重绘会变双重胶囊
