# CDN 阶段报告

- appid: ks708472518646445237
- 检查时间: 2026-08-10 21:29:02 +0800
- CDN 基址: `https://p4-ad.adkwai.com/udata/pkg/KS-GAME/AIGC-SoGame/ks654429322415476022/`
- 当前 package 大小: 2.3 MB

## 结论

项目已完成 CDN 化，不需要重复上传。`package/js/tb-config.js` 统一将素材路径解析到上述 CDN 基址，包内不存在待迁移的 `assets/` 文件。

## 预下载配置

`package/game.json` 已配置 8 个首屏资源：

- `video/opening.mp4`
- `video/shot-02-opening-v3.mp4`
- `keyframes/opening.png`
- `keyframes/shot-02-curtain-realistic-v1.png`
- `image/avatar-pijiu.png`
- `image/avatar-tiaojiu.png`
- `image/avatar-zhuchang.png`
- `image/avatar-lingwu.png`

## 可用性验证

对前 4 个关键预下载资源执行 HTTP 探测，均返回 `200`：

- 开场视频
- 第二段开场视频
- 开场关键帧
- 幕布关键帧

本阶段复用现有 CDN 发布素材，没有删除或重新上传任何文件。
