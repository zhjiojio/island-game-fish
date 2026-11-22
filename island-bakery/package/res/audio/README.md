# 音频资源（用户素材）

来源：`assets/声音/`（文件名即场景）。

## 分区 BGM（循环 + 首尾淡化）

| 包内路径 | 原文件 | 场景 |
|----------|--------|------|
| `bgm/bgm_map.mp3` | 地图.mp3 | 地图 |
| `bgm/bgm_coco.mp3` | 椰子林.mp3 | 椰林 |
| `bgm/bgm_shop.mp3` | 烤鱼店.mp3 | 烤鱼店 / 建店 |
| `bgm/bgm_fish.mp3` | 钓鱼区.mp3 | 钓鱼区主曲 |
| `bgm/bgm_fish_wave.mp3` | 钓鱼区-海浪.mp3 | 钓鱼区海浪叠轨（与主曲等响度） |

接入时已做约 1.8s 首尾淡入淡出，便于 `loop` 衔接；钓鱼双轨预处理响度对齐后同音量播放。

## 交互 SFX

| 包内路径 | 原文件 | 用途 |
|----------|--------|------|
| `ui/click.wav` | 按钮点击音效.wav | 按钮等 |
| `coco/tap.wav` | 椰子点击音效.flac | 椰相关点击 |
| `fish/cast_reel.mp3` | 钓鱼-抛竿&收杆音效.mp3 | 抛竿/咬钩/收杆 |
| `fish/reel_loop.wav` | 钓鱼-拉鱼线时的循环音效.flac | 提竿～收杆循环 |
| `shop/grill_fire.mp3` | 烤鱼-火焰燃烧音效.mp3 | 烤制～收获循环 |
| `shop/deliver.mp3` | 烤鱼区-顾客取餐成功音效.mp3 | 交付 |
| `common/coin.mp3` | 结算-金币到账.mp3 | 金币/结算弹窗 |
| `common/success.wav` | 胜利音效.wav | 成功反馈 |
