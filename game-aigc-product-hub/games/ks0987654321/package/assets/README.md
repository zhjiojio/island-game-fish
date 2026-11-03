# assets/ 资源目录规范

> 详细规范见 `docs/scaffold.md` §9 素材资源规范。

## 目录说明

```
assets/
  home-asset/  # 首页渲染图（🔒 必须主包，禁止 CDN，禁止分包）
  Image/       # 图片（PNG / JPG / WebP / SVG）
  Audio/       # 音频（MP3 / OGG / M4A）
  Video/       # 视频（MP4，本地调试用，生产必须换 CDN URL）
  Icon/        # 应用图标（icon-128.png / icon-512.png）
```

### `home-asset/` 特殊规则

- **用途**：存放用户第一帧看到的首页渲染图（首屏背景、加载页背景等）
- **必须**：放在主包，随包下载，确保首帧加载速度最优
- **禁止**：上传 CDN（无论文件大小）
- **禁止**：移入分包
- **命名**：`home-[描述].[ext]`，如 `home-bg.png`、`home-loading.png`

## 命名规则（强制）

| 类型 | 格式 | 示例 |
|------|------|------|
| 图片 | `[场景]-[描述]-[状态].[ext]` | `menu-bg-full.png`、`game-btn-play.png` |
| 音效 | `sfx-[描述].mp3` | `sfx-coin-collect.mp3`、`sfx-hit.mp3` |
| 背景音乐 | `bgm-[描述].mp3` | `bgm-main.mp3`、`bgm-boss.mp3` |
| 视频 | `[场景]-[描述].mp4` | `intro-cutscene.mp4` |
| 图标 | `icon-[尺寸].png` | `icon-128.png`、`icon-512.png` |

- 全小写，单词间用 `-` 连接
- 禁止空格、中文、特殊字符
- 文件名 ≤ 60 字符

## 包体积控制（强制）

| 资源 | 规则 |
|------|------|
| 视频 | **全部上传 CDN**，禁止打包 |
| 图片 > 512 KB | 上传 CDN |
| 非首屏图片 | 移入分包 `subpackages/<name>/assets/Image/` |
| bgm > 200 KB | 上传 CDN |
| sfx > 100 KB | 上传 CDN |
