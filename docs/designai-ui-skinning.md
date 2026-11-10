# 用 designai 做「治愈系」UI 皮肤（内网执行说明）

## 现状说明（为什么还是「原型图」）

当前大量界面来自 **`island-bakery/package/gameplay/render/renderer.js`** 里用几何图形 + 文字画的矢量 UI（弹窗、按钮、椰子、进度条等），**不是**静帧 JPG 里缺图层那么简单。静帧迭代去掉了假按钮，但**程序绘制的 HUD/弹窗**仍会叠在上面，看起来像「白盒」。

要完全「像设计稿一样」，通常有两条路：

1. **换图**：把弹窗/按钮/椰子画成 PNG 九宫格或散图，在渲染里贴图（改动量中等～大）。  
2. **继续矢量**：在 `renderer.js` 里把 `rect`/`button` 换成手绘风描边、木纹底、圆角 parchment（改动量中等，**不依赖**内网生图）。

本文档只覆盖 **designai 图生图**：先生成**成品 PNG 皮肤**，再按需接到引擎里。

---

## 本机 Cursor / 外网 Agent 直接调 designai 的结果

命令已成功调用编排脚本，但接口返回：

> 无法获取有效的当前登录用户名，请确认 **MyFlicker 登录状态**后重试（`AUTH_FAILED`）。

即：**必须在你已登录 MyFlicker / 内网 SSO 的机器上**执行下面命令。

---

## 内网一键命令（图生图 · 以横屏烤鱼店静帧为参考）

在 **`kwaigame` 仓库根目录**执行（路径按你本机调整）：

```bash
cd /Users/zmj/Downloads/kwaigame

uv run ~/.cursor/skills/designai-generate-image/scripts/generate_with_fallback.py \
  --mode i2i \
  --images "./island-bakery/package/res/Image/scene-shop-land.jpg" \
  --ratio 16:9 \
  --gpt-model GPT-Image-2.5-Sunburst \
  --prompt '参考图为孤岛烤鱼店横屏场景，治愈系手绘水彩+轻度像素、暖黄奶油沙色调，与参考完全一致的画风与角色。任务：在保留参考背景与构图的前提下，将画面中所有「扁平矢量感」的 UI 叠层改成可读的实体化界面：顶部状态条改为浅色风化木板条+细木纹与内凹刻线；底部「地图/背包」改为系带木牌或磨圆木片按钮；烤鱼店区域的操作提示、订单气泡改为手写感宣纸/羊皮纸条+淡墨描边；椰子相关交互区用带毛边的椰壳与木托摆盘呈现，禁止保留纯色大灰块按钮。不要新增与原玩法无关的新按钮或数值。中文标注保持清晰可读。'
```

成功时 stdout 末行会给 **图片 URL**；`task_file=` 同目录 `.image_generation_tasks/*.json` 可恢复/降级。

### 其他场景（按需改 `--images` 与 `--ratio`）

| 目标 | 参考图 | ratio |
|------|--------|--------|
| 竖屏烤鱼店 | `scene-shop-port.jpg` | `9:16` |
| 横屏钓鱼 | `scene-fish-land.jpg` | `16:9` |
| 竖屏钓鱼 | `scene-fish-port.jpg` | `9:16` |

弹窗（如「鱼跑了」「钓到了」「背包」）若要对**整屏截图**做图生图，把 `--images` 换成你导出的 PNG/JPG 即可。

---

## 与你的附件图的关系

聊天里保存的截图路径示例：`~/.cursor/projects/.../assets/image-*.png`。

内网可改为：

```bash
--images "/你放截图的路径/shop-dialog.png"
```

提示词里写明：**只美化弹窗与进度条区域，勿改场景透视**。

---

## 落地进工程

1. 将下载的 PNG 放入 `island-bakery/package/res/Image/ui/`（可新建目录）。  
2. 在 `renderer.js` 用 `KwaiMedia.Image.load` 加载纹理绘制，或把矢量 `button()` 改成「底图 + 热区不变」。  
3. 热区仍在 `input.js`，**图变热区可以不动**（你之前 layout-only 策略仍适用）。

---

## 当前资产清单（2026-11-07 第二轮后，均在 `res/Image/ui/`，`assets/ui/` 已同步）

**场景全帧皮肤**：`ui-skin-fish-land/port.png`、`ui-skin-shop-land/port.png`（替换版：顶栏=艺术字「孤岛烤鱼店」+5 个浅米黄槽位，图标依次太阳/金币/小鱼/椰子/星星，槽内空白供 `drawHUD` 叠字）；`ui-skin-coconut-land/port.png`（新增：+右下编织椰子筐与空白计数牌，对齐 `basketX=0.84W`）；`ui-skin-map-land/port.png`（新增：「钓鱼区」「椰林区」「烤鱼店」迷你木牌标签挂对应路牌下，带锁路牌不加字）。
**弹窗卡（4:3，无烘焙文字，程序叠字）**：`dialog-fish-result.png`（空标题横幅+圆形凹槽+两条文字条+宽按钮槽）、`dialog-coconut-summary.png`（椰子插画+两按钮槽）、`dialog-offline.png`（月星插画+三条文字条+两按钮槽，无时间数字）、`dialog-go-fishing.png`（空鱼篓+两按钮槽，新流程用）。
**按钮贴图（21:9）**：`btn-wood.png`（通用木牌按钮，中央留白，`button()` 拉伸贴图）。

**生成三要素（复用模板）**：
- 参考图：`res/Image/ui/ui-skin-*.png`（迭代现有皮肤）或 `res/Image/scene-*.jpg`（新做场景）
- 约束句：只重绘顶栏 / layout-only / 热区不动 / 顶 64 底 72 安全区 / 浅滩鱼种规则（仅小海鱼+少量三文鱼，无金枪鱼/金色传说）/ 槽内与按钮内不写文字数字
- 落盘：`package/res/Image/ui/`（皮肤 1600 长边、弹窗 1200）+ 同步 `assets/ui/`

---

## 失败码备忘

| 现象 | 处理 |
|------|------|
| `AUTH_FAILED` | 打开 MyFlicker / 完成 SSO，再重试 |
| `SUNBURST_RETRY_EXHAUSTED` | 按 skill 的 retry-workflow 选降级或稍后重试 |
