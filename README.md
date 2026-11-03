# island-game-fish

快手小游戏与互动游戏项目合集。主项目为「孤岛烤鱼店」，同时收录打地鼠和游戏生产工具集。

## 目录

| 目录 | 内容 | 运行方式 |
| --- | --- | --- |
| `island-bakery/package/` | 孤岛烤鱼店，当前可玩版本 | 浏览器本地预览，或导入快手小游戏开发工具 |
| `island-bakery/island-fish-shop-day1/` | 孤岛烤鱼店首日版本 | 仅用于历史对照 |
| `whack-a-mole/package/` | 打地鼠游戏 | 浏览器本地预览，或导入快手小游戏开发工具 |
| `game-aigc-product-hub/` | 多个游戏、素材与视频改编工具 | 每个子项目独立运行，先看对应目录的 README |

游戏运行所需的图片、音频、字体和脚本已随源码提交。依赖目录、压缩包、缓存和构建产物不提交，由开发者在本地安装或重新生成。

## 快速预览

需要现代浏览器和 Python 3。以下命令不需要安装 npm 依赖。

### 孤岛烤鱼店

在仓库根目录执行：

```bash
python3 -m http.server 8000 --directory island-bakery/package
```

浏览器打开 <http://localhost:8000>。游戏按横屏 16:9 设计。

### 打地鼠

```bash
python3 -m http.server 8001 --directory whack-a-mole/package
```

浏览器打开 <http://localhost:8001>。

停止预览时，在终端按 `Ctrl+C`。

## 快手开发工具

1. 打开快手小游戏开发工具。
2. 分别导入 `island-bakery/package/` 或 `whack-a-mole/package/`。
3. 使用自己的测试 AppID；仓库中的 `kwai_game_test_appid` 是占位值。
4. 真机、广告和平台能力需要在快手环境验证，普通浏览器只用于游戏逻辑与画面预览。

## 子项目依赖

`game-aigc-product-hub/` 内含多个独立工程，不要在仓库根目录统一安装依赖。进入某个含 `package.json` 的目录后：

- 有 `package-lock.json`：执行 `npm ci`，再按该项目 README 启动。
- 没有锁文件：执行 `npm install`，再按该项目 README 启动。
- Node.js 版本以各工程的 `engines` 配置为准；未声明时建议使用当前 Node.js LTS。

例如：

```bash
cd game-aigc-product-hub/games/ks713539070148088972
npm ci
```

## 协作约定

- 修改游戏时同步更新对应项目文档。
- 不提交 `node_modules/`、`dist/`、ZIP 包、日志、本地环境变量和私钥。
- 不删除 `res/`、`assets/` 等运行资源；它们不是需要忽略的构建产物。
- 提交前至少执行语法检查；有构建脚本的项目还应执行构建验证。
