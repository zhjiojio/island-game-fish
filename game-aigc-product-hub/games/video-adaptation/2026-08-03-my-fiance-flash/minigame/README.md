# 我的温柔未婚妻 · 快手小游戏原生工程

## 工程信息
- **AppID**: `ks712131693858878897`
- **工程根**: `/Users/fat/work/minigame/game-aigc-product-hub/games/video-adaptation/2026-08-03-my-fiance-flash/minigame/`
- **技术栈**: 快手小游戏原生 canvas + ks.* API（无 DOM，无 H5 移植）
- **屏幕**: 竖屏 9:16，自适应 `ks.getSystemInfoSync()` 窗口尺寸

## 目录结构
```
minigame/
├── game.json                # 快手小游戏配置（竖屏 / 无状态栏）
├── project.config.json      # 开发者工具工程配置（appid 已填）
├── game.js                  # 入口 → require src/*.js → boot()
├── src/
│   ├── script-data.js       # F1-F30 全 30 帧剧本（从 game/script.js 搬运）
│   ├── audio.js             # ks.createInnerAudioContext 播台词
│   ├── video.js             # ks.createVideo 播 F1 f1-final.mp4
│   ├── scene.js             # canvas 分层：bg / 立绘 / 对话气泡 / 3 选项 / HUD / 反应 / 广告 / 结局
│   └── game.js              # 状态机 renderNode / choose / proceed / ending
└── assets/
    ├── audio/               # voice-f1..f30 + voice-he/ge/ne/be（34 个 mp3）
    ├── portrait/su-anime-v1.png
    ├── video/f1-final.mp4   # F1 真人视频（带音）
    └── reference/su-xiaoyu-master.png  # 结局大图
```

## 功能清单
- ✅ 顶部 HUD：好感度进度条（0-200）、当前帧号 F?/30、锚点计数 ★?/5、静音按钮
- ✅ 场景 30 色分层背景（f1-f30 每帧不同渐变色）
- ✅ 立绘绘制（su-anime-v1.png 居中，环境备注在气泡下方）
- ✅ F1 帧 `ks.createVideo` 播 f1-final.mp4（覆盖立绘位置）
- ✅ 台词 `ks.createInnerAudioContext` 播 voice-f1..f30.mp3
- ✅ 底部 3 选项按钮：♥ A / ★ B / ○ C；锚点选项金色边框、广告选项蓝色边框
- ✅ 反应过场：半透明蒙层 + 反应文字 + "继续 ▶"
- ✅ 广告卡点（F6/F12/F18/F23/F28）：5s 倒计时模态 + 跳过；观看解锁 CG 并 +5 好感
- ✅ 四结局判定：HE(≥170 且锚点=5) / GE(≥130) / NE(≥80) / BE(<80 或 taboo≥3)
- ✅ 结局面板：结局大图（BE 灰暗化 / NE 半淡化 / HE-GE 保真）+ 数据 + 重新开始
- ✅ 触摸 `ks.onTouchStart` 统一分发（node / reaction / ad / ending 四阶段）

## 结局判定逻辑（保留原版）
```
HE  favor ≥ 170  && anchors = 5     海边落日婚纱 · 双人回眸
GE  favor ≥ 130                     出租屋合影 · 领结婚证
NE  favor ≥ 80                      街角错身 · 她拎菜路过
BE  favor < 80  || taboo ≥ 3        她连夜搬走 · 空荡老宅
```

## 冒烟测试
```bash
cd /Users/fat/work/minigame/game-aigc-product-hub/games/video-adaptation/2026-08-03-my-fiance-flash/minigame
node -e '
  global.GameGlobal = global;
  global.ks = {
    createCanvas: function(){ return { width:750,height:1334, getContext:function(){return new Proxy({},{get:function(){return function(){return {addColorStop:function(){},width:0}};}})} }; },
    createImage: function(){ return { addEventListener:function(){}, onload:null }; },
    getSystemInfoSync: function(){ return { windowWidth:750, windowHeight:1334, pixelRatio:2 }; },
    onTouchStart: function(){}, onTouchMove: function(){}, onTouchEnd: function(){},
    createInnerAudioContext: function(){ return { src:"", play:function(){}, stop:function(){}, destroy:function(){}, onEnded:function(){}, onError:function(){} }; },
    createVideo: function(){ return { stop:function(){}, destroy:function(){}, onEnded:function(){}, onError:function(){} }; }
  };
  global.requestAnimationFrame = function(){};
  require("./game.js");
  console.log("SMOKE PASSED ✓");
'
```
**结果**：SMOKE PASSED ✓

## 如何扫码预览（人工操作 · 一次完成）

由于本机的 `ks-cli` 是快手内部 SSO 工具，不是小游戏 CLI，需要用桌面 IDE 出扫码：

1. **打开开发者工具**：
   ```
   open -a "快手小游戏开发者工具"
   ```
   （若未装可从 https://mp.kuaishou.com/docs/develop/developerTools 下载）

2. **导入项目**：
   - 在 IDE 首页点「导入项目」/「打开项目」
   - 工程路径填：`/Users/fat/work/minigame/game-aigc-product-hub/games/video-adaptation/2026-08-03-my-fiance-flash/minigame`
   - AppID 会自动读取 `project.config.json` 里的 `ks712131693858878897`
   - 项目名任意（默认 `my-fiance-flash`）

3. **点顶部「预览」按钮** → 弹出二维码

4. **用快手 App 扫码**（快手 App → 右上角 + → 扫一扫）即可在真机运行

## 首次预览验收清单
- [ ] 打开进入 F1，屏幕上方看到"好感 50 / ★ 0/5 / F1/30"
- [ ] F1 视频 f1-final.mp4 覆盖立绘区自动播放并出声
- [ ] 底部 3 选项，点击 A/B/C 出现反应过场
- [ ] 点"继续 ▶"进入 F2，立绘变回 su-anime-v1.png，台词自动播
- [ ] 走到 F6 出现📺广告卡点，倒计时 5s 后自动继续
- [ ] 走到 F30 点"继续 ▶ 见证结局"出现 HE/GE/NE/BE 中的一种
- [ ] 结局页点"重新开始"回到 F1

## 交付路径
```
/Users/fat/work/minigame/game-aigc-product-hub/games/video-adaptation/2026-08-03-my-fiance-flash/minigame
```
