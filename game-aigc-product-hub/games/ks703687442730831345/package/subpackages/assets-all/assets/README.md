# 正式游戏素材

## 当前 Figma 实现

当前代码读取 `figma/` 的背景、餐架、餐盘和按钮，以及 `food/` 的16种压缩餐品。游戏页设计节点为 Figma `3048:81068`。2026-09-15 已清理未引用的旧 UI、食材及背景文件。

首页动态背景为 `scenes/home-background.gif`；静态兜底为 `figma/home.png`。

`audio/background-music.mp3` 为用户提供的循环背景音乐。它在首次用户操作后启动，避免浏览器自动播放拦截。

## 游戏背景

- `figma/game.png`：正式游戏页背景。

## 棋盘

- `figma/rack.png`：正式加高主棋盘，三列结构，透明背景。
- `figma/tray.png`：补位餐盘。
- `effects/`：消除序列帧、过渡序列帧、刷新光效与打包盒，均由运行时加载。

## 餐品

`food/` 下为当前正式使用的 16 种逻辑元素。每张图尺寸为 214×504，RGBA 透明背景；图中竖向餐盘里的三份同类食物仍然只算一个逻辑元素。

- `portuguese-egg-tart.png`
- `honey-chicken-wings.png`
- `fried-chicken-nugget.png`
- `butter-corn.png`
- `cheese-baked-scallop.png`
- `croissant.png`
- `salmon-sushi.png`
- `strawberry-cake.png`
- `chocolate-donut.png`
- `fried-egg.png`
- `burger.png`
- `garlic-broccoli.png`
- `black-pepper-steak.png`
- `steamed-dumpling.png`
- `garlic-shrimp.png`
- `tomato-pasta.png`

游戏代码应优先引用这里的正式素材，不再引用 `outputs/buffet-ui-kit` 中的旧餐品图或随机生成文件名。
