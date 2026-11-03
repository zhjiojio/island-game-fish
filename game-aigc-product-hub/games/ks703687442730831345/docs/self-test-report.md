# 自测与预览报告

- appid: ks703687442730831345
- game_name: buffet-match3（自助餐消消乐）
- package 路径: C:\Users\31677\work\minigame\game-aigc-product-hub\games\ks703687442730831345\package
- 二维码路径: package/tmp/preview-1789615735394.png
- 真机预览截图: package/tmp/preview-device-20260917.png、package/tmp/preview-reset-20260917.png
- 测试时间: 2026-09-17

## H5 自测结果

跳过。用户选择直接进入真机预览，未执行 H5 浏览器本地验证。

## 服务端自测结果

- 是否启用服务端: 否
- 启动命令: 不适用
- 健康检查: 不适用
- 关键接口: 不适用
- 客户端联调: 不适用

## CDN 上传结果

- 是否执行: 否（跳过）
- 上传文件数: 不适用
- 节省包体积: 不适用
- 报告: 不适用

## 分包结果

- 是否执行: 是（此前已配置完成）
- 分包数量: 1 个（assets-all）
- 主包体积优化后: 0.13 MB
- 分包体积: 13.70 MB
- 总包体积: 13.83 MB

分包配置（game.json）：

```json
{
  "deviceOrientation": "portrait",
  "showStatusBar": false,
  "subpackages": [
    { "name": "assets-all", "root": "subpackages/assets-all/" }
  ],
  "parallelPreloadSubpackages": [
    { "name": "assets-all" }
  ]
}
```

分包内容覆盖：
- 餐品素材 15 种（food/ 目录）
- 首页 UI 素材（home-v2/ 目录，含体力、设置、每日挑战等）
- 游戏界面素材（figma/ 目录，含餐架、餐盘、道具、计时器等）
- 特效动画（effects/clear/ 与 effects/transition/，消除与转场序列帧）
- 场景背景（scenes/home-background.jpg）
- 音频（audio/background-music.mp3 2.4MB、audio/clear.mp3）
- 加载页素材（ui/loading.png）

## 真机预览结果

通过。

- 使用快手 App 账号「反派的自我修养」扫码真机预览。
- 预览二维码于 2026-09-17 生成，多次扫码验证。
- 最新真机预览截图保存于 package/tmp/preview-device-20260917.png（13:08）和 preview-reset-20260917.png（13:07）。
- 游戏已打包为 buffet-match3.zip（13.73 MB），所在文件夹已打开。

验收检查项：

- [x] 游戏可正常启动
- [x] 竖屏展示正常
- [x] 分包资源加载正常
- [x] 背景音乐与音效播放正常
- [x] 拖拽三消核心玩法可操作
- [x] 体力系统消耗与恢复正常
- [x] 道具功能（刷新、打包、变换）可用
- [x] 引导关展示正常
- [x] 通关/失败结算流程正常

## 打包交付

- 打包文件: buffet-match3.zip（13.73 MB）
- 打包路径: C:\Users\31677\work\minigame\game-aigc-product-hub\games\ks703687442730831345\buffet-match3.zip
- 打包时间: 2026-09-17 12:54

## 已知边界

- 广告位 ID（2300061896_01）在 H5 环境走平台降级逻辑，真实广告展示以快手真机为准。
- 登录、加桌面、平台震动等能力在 H5 环境不可完全验证，真机已确认。
- 拖拽体验以真机触控为准。

## 结论

自助餐消消乐（ks703687442730831345）自测与预览阶段通过。游戏核心玩法、分包加载、音效、体力与道具系统在真机验证正常，可进入 publish（提审上架）阶段。
