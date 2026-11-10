# 设计文档附录 E · 场景稿与本地 assets 对应表

设计文档：`孤岛烤鱼店 · 游戏设计文档.md`（附录 E，外链为 `myflicker.corp.kuaishou.com/.../proxy/<hash>.png`）。

你已将外链图归档到 **`assets/` 根目录**（中文命名）；下表按 **URL 中的文件指纹（hash）** 与本地文件对应（与你的说明一致）。若需复核，可对远端文件与本机 PNG 做 **SHA256** 比对。

| 文档用途 | URL 中的 hash（节选） | 本地文件（`assets/`） |
|----------|----------------------|------------------------|
| 横屏-地图分区版 | `b58ede7d2454836cc06b748ee0df8e568861bc0b1a58862bca84ee6f73cced4d` | `横屏场景图.png` |
| 横屏-钓鱼区 | `f5f598fbed0b56dbd5f02b073f113efcd3e998b67b38fd5d0df8dea8fd1d21b7` | `横屏垂钓图.png` |
| 横屏-烤鱼店 | `d4488c418d2ea477410b67524a7f967935b7afe497eb231d69db1c92e8afddfa` | `横屏烤鱼图.png` |
| 横屏-椰林区 | `d6f31d72e4a566b2bef5050222c1d82bf4d4777eebc1a0345fce645beb9a6a70` | `横屏摇晃椰树图.png` |
| 竖屏-地图分区版 | `e45c075ea5ee1e9d8bc9f4009550ae9999d404b9cdcd33e4b6580da885553a8e` | `竖屏场景图.png` |
| 竖屏-钓鱼区 | `e3bd04449f8e911a86c3af7a6efe6f44f6499cf27f0d1c3db58ea0f72297576d` | `竖屏钓鱼图.png` |
| 竖屏-椰林区 | `5668b930a9285372bb0ec52b24492c3501f6ae26c4ae05e3dbb66f5e4a642ed4` | `竖屏摇晃椰树图.png` |
| 竖屏-烤鱼店 | `e34bf758df1e49e0745d8311cfe4e61f36d87fd9157891bb99a50c82db4fbb87` | `竖屏烤鱼图.png` |

## 与引擎静帧 `scene-*.jpg` 的关系

- **`scene-*.jpg`**：`island-bakery/package/res/Image/`，运行时由 `renderer.js` 加载（与 `assets/` 下同名 JPG 为同一份拷贝）。  
- **上表 PNG**：设计稿 / 分镜级截图，用于对齐玩法与构图迭代，**不等于**包内 `scene-*.jpg` 时仍以引擎目录为准。

## character-demos 批量素材（不重复归档）

以下文件从 `~/Downloads/character-demos` 拷入 **`assets/` 根目录**；已与现有中文场景稿 **SHA256 比对，无相同内容**（为角色 / 道具 / 图标 demo，非附录 E 八张截图）：

`c1_rabbit_tpose.png`、`c2_customers.png`、`c3_special_npcs.png`、`e1_fish_icons.png`、`e2_rods_baits.png`、`e3_coconuts.png`、`e4_grilled_fish.png`、`e5_farm.png`、`e6_equipment_ui.png`、`e7_weather.png`、`g2_5b_crops.png`、`g2_6b_grills.png` 及各同名 `.txt`。
