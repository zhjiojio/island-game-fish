---
name: laotie-zhaocha-scene-image
description: 老铁找茬王小游戏「场景关卡图」生成规范与铁律。当用户说「给老铁找茬王加一关」「生成新场景图」「zhaocha 新关卡」「找茬王新场景」「新增找茬关卡图」「找茬王画布尺寸」「找不同新关卡」「spot 新关卡」时触发。规定图片宽高比、异物烘焙 Prompt 模板、坐标标注流程、编辑器对齐规则；含场景 1（hidden 单图）与场景 2（spot 双图找不同）两条 pipeline；含**找茬差异设计方法论 v2.0**（T1-T7 分类学、严禁列表、5 条 AI 执行铁律、打分体系 v2.0、一票否决机制）。
---

# 老铁找茬王 · 场景关卡图铁律

<!-- AIGC-MINIGAME-SKILL-DEPENDENCY -->
> ⚠️ **SKILL DEPENDENCY · 强制前置**
>
> 本 skill 属于 AIGC 小游戏（快手小游戏）生产流程的一部分，**必须先加载 `agw-work-mode`**。
>
> - 若本对话尚未加载 `agw-work-mode` 的 `<skill_content>`，先调用 `use_skill("agw-work-mode")`
> - 若本次任务涉及 build / upload / commit 等敏感动作，**必须先走 `aigc-minigame-orchestrator` subagent**
> - 详见云端权威版本：`git@git.corp.kuaishou.com:kwai-game/game-aigc/game-aigc-product-hub.git` `product-optimization/` 目录
<!-- /AIGC-MINIGAME-SKILL-DEPENDENCY -->

## 🚨🚨🚨 生图铁律（2026-08-20 血泪教训 · P0 政治红线）🚨🚨🚨

**AIGC 小游戏所有生图/生视频动作，必须走 `agw-work-mode/tools/make_images/`，严禁使用 `designai-generate-image` 等其他生图 skill（已删除）。**

Prompt 中**必须显式包含反面禁词**：
```
NO Mao portrait, NO Chairman Mao, NO leader photograph, NO political figures,
NO military uniform, NO Red Army, NO Chinese national flag, NO party emblem,
NO political slogans, NO propaganda poster, NO brand logo, NO trademark.
```

出图后**强制目视审查**：主图、墙面、海报、画像逐一检查通过才能上传 CDN。任何一处出现领袖像/军装/国旗/政治标语 → 立刻废弃重生。

违反案例：2026-08-20 第 39 关赤脚医生诊室墙面出现毛泽东画像 → 走了错误 skill 且 prompt 缺失反面禁词。
<!-- /AIGC-MINIGAME-SKILL-DEPENDENCY -->


## ⚠️ 一句话铁律（凡是新关都先看这里）

- **场景 1（hidden 单图）** → 竖版 9:13 (≈0.69)，图内烘焙穿越物
- **场景 2（spot 双图找不同）** → 横版 3:2 (1536×1024)，A 图=原图 / B 图=对比版本
- **场景 2 差异铁律 v2.0** —— 见下面【找茬差异设计方法论】章节，凡是新关先读一遍再动手，禁止绕过。

---

## 🔴 新关卡 HARD 红线（违反一条作废重来）

### 红线 1 · 禁止使用已用 prop
每次新增关卡**必须先跑查重**，再选 prop，不许凭记忆估：
```bash
python3 -c "
import re
with open('package/js/levels.js') as f: c = f.read()
used = set(re.findall(r\"prop:'([^']+)'\", c))
print('已用 prop 共', len(used), '个：')
for p in sorted(used): print(' ', p)
"
```
选出的 prop 必须**不在上述列表里**，否则玩家会反映"这个上一关就找过了，没新意"。

### 红线 2 · 禁止出现具体品牌名
prop key 和 prompt 中一律用**品类通称**，不许出现任何商业品牌：

| ❌ 禁止 | ✅ 替代 |
|--------|--------|
| Switch、任天堂 Switch | 游戏掌机、掌上游戏机 |
| GoPro | 运动摄像头、小方块运动相机 |
| AirPods、耳机品牌 | 无线蓝牙耳机、入耳式无线耳机 |
| 瑞幸、星巴克等咖啡品牌 | 纸咖啡杯、外带咖啡杯 |
| 戴森、小米、华为等 | 对应品类通称（离子直发夹、智能音箱…） |
| Ring 门铃、米家系列 | 视频门铃、智能感应门铃 |
| 特斯拉（作为关卡 prop） | 纯电轿车（`tesla` 已有例外，但不新增品牌） |

### 红线 3 · 禁止出现地图 / 导航界面
prompt 和 prop 中不得出现：地图 App 截图、导航界面、地图 icon、电子地图、高德/百度/谷歌地图界面。

### 红线 4 · 禁止涉政内容
不得出现：政治领导人画像、特定政党旗帜符号（历史场景墙上挂画除外且必须极小）、政治敏感口号、政府敏感机构标识。

### 红线 5 · 穿越物「黄金三角」选品标准（必须同时满足）

每个 prop 必须同时满足以下三条，缺一不可：

| 条件 | 说明 | 测试方法 |
|------|------|---------|
| **① 剪影可辨** | 只看轮廓/形状，不看颜色，普通人就能叫出名字 | 心里描述：「那个圆盘在地上跑的…」→ 扫地机器人 ✅ |
| **② 全民认知** | 不需要是科技宅，刷抖音/买过超市/医院排过队的普通人都见过 | 「NFC硅胶手环」❌ 普通大妈不认识；「额温枪」✅ COVID后全民见过 |
| **③ 场景反差强** | 放在80年代场景里，第一眼就觉得「这东西不对劲」 | 扫地机器人在麻将馆 ✅；UV消毒盒在粮仓 ❌（看不出来） |

**⛔ 绝对禁止选用（太冷门/辨识度低）**：

| 类型 | 反例 |
|------|------|
| 冷门数码配件 | NFC硅胶手环、流媒体棒（FireStick）、UV消毒盒、电动摇摇杯、低温慢煮棒 |
| 专业器材 | 数位板（Wacom）、感应皂液机、姿势矫正仪 |
| 需要解释才认识的 | 太阳能充电背包（黑色方格=太阳能板？大妈不知道）、AI空气检测仪 |
| 形状与老物件太像的 | 充电宝（看起来像肥皂/砖头）、电动摇摇杯（像普通杯子） |

**✅ 优选清单（视觉强×全民知×反差大）**（已确认未用过的）：

| prop | 实物 | 为什么好 |
|------|------|---------|
| `robot_vacuum` | 扫地机器人 | 圆盘在地板上跑，剪影秒认 |
| `infrared_gun` | 额温枪 | 手枪形状测温，COVID后全民见过 |
| `neck_fan` | 挂脖风扇（U形） | U形套脖子，形状极诡异，一眼就错 |
| `power_bank` | 充电宝（带数字显示） | 砖头+数字+多个USB口，全民必备 |
| `fidget_spinner` | 指尖陀螺 | 三叶形状，2017年全国都在玩 |
| `capsule_coffee` | 胶囊咖啡机 | 独特的弹仓式造型，精品咖啡代名词 |
| `over_ear_headphones` | 头戴式大耳机（降噪款） | 大耳罩扣在耳朵上，80年代没这东西 |
| `foldable_ebike` | 折叠电动自行车 | 折叠架+大电池，一眼就觉得不对劲 |
| `instant_pot_digital` | 电子压力锅（带数显） | 圆锅盖上有液晶屏，老厨房里极违和 |
| `ring_spinner_top` | 陀螺（现代LED款） | 发光陀螺，孩子手里拿着 |
| `smart_pos` | 手持扫码收银机 | 收银台上的POS机+触摸屏 |
| `folded_ebike_helmet` | 电动车头盔（带后视摄像头） | 头盔后面有摄像头，极现代感 |

### 红线 6 · 穿越物「藏法分级」—— 每关必须有至少3个高难度藏法

**核心原则：同一个物品，藏的位置/方式不同，难度天差地别。**

| 难度 | 藏法 | 描述 | 示例 |
|------|------|------|------|
| 🟢 送分 | **前景摆放** | 物品直接放在场景中央/前景，大且清晰 | 老桌上放着充电宝，占画面10% |
| 🟡 中等 | **混入堆物** | 物品藏在同类杂物中，需扫视才发现 | 充电宝混在砖头/肥皂堆里 |
| 🔴 困难 | **远景/小物** | 物品在图片远端，占画面3%以下 | 远处窗台上一个小小的充电宝 |
| 🔴 困难 | **局部露出** | 只露出物品的一部分（角、边、一截线） | 充电宝的USB口线从布缝中露出一截 |
| 🔴 困难 | **窗外/门缝** | 物品在窗户玻璃外/门缝里若隐若现 | 窗玻璃反光中隐约可见手机支架 |
| 🔴 困难 | **墙贴/投影** | 墙上贴的海报/宣传画里出现现代物 | 墙上的革命海报旁边夹着一张二维码贴纸 |
| 🔴 困难 | **人物遮挡** | 被人物手/衣物/背影半挡住 | 工人背影口袋里露出无线耳机盒一角 |

**每关6个 prop 的难度分配铁律：**
- 最多 **1个** 🟢送分（前景大物）
- 至少 **3个** 🔴困难藏法（远景/局部/遮挡/窗外/墙贴）
- 剩余 **2个** 🟡中等

**写 Prompt 时必须明确标注每个物品的难度和藏法**，例如：
```
[🔴远景] 窗外胡同里隐约可见一辆停着的平衡车，占画面3%，形状模糊
[🔴局部] 只露出无线耳机盒的充电端口边角，从麻袋缝隙中伸出
[🟡混堆] 额温枪混在注射器架子里，颜色相近但形状不同
[🟢送分] 医生桌上放着一个胶囊咖啡机，清晰可见
```

### 红线 7 · 选完 prop 先给用户确认，不许直接生成
新关卡流程：
1. 跑查重脚本 → 筛选未用 prop 候选
2. 告知用户"场景主题 + 6 个 prop 方案"，等待确认
3. 用户 OK → 再生成图 / 写关卡配置

---

---

# 🧠 找茬差异设计方法论 v2.1（v0.0.55 · 用户实战反馈沉淀）

## 🎯 v0.0.55 · 用户实测三大金句（必背）

### 💎 金句 1 · "LED 红→绿"是最佳差异范式
> 用户 v0.0.55 原话："这一关就很好 尤其是那个 **led 变色** 非常好！！！请你记住这种小细节"

**为什么好**（拆给未来的自己看）：
- **面积小**：3.9% × 5.7% ≈ 40×40 px on 1536×1024 = 甜蜜点
- **颜色跳变**：红 vs 绿是补色对，一眼就能看出
- **语义清晰**：LED 灯就是有颜色的，"变色" 是最自然的差异
- **人眼强抓取**：饱和高纯色小点 = 视网膜中心凹优先命中
- **AI 画得稳**：不涉及形状/数量/纹样，只改一个颜色参数

**未来所有关卡** — 都要有 **1-2 处这样的"小面积高纯色跳变"**（占比 3-6%，颜色对比强）。清单：
- LED 灯 / 指示灯 · 红↔绿↔蓝
- 蜡烛 · 燃↔灭（火焰↔烟）
- 屏幕 · 开↔黑
- 霓虹字 · 红↔粉↔青
- 玫瑰单朵 · 红↔白↔黄
- 手环/戒指宝石 · 绿↔红
- 圣诞球 · 金↔银↔红

### 💎 金句 2 · "地狱难度 = 画面元素丰饱满，不是差异数量"
> 用户 v0.0.55 原话："如果是地狱级难度的 那么不仅仅是数量多 要求 **画面的元素要足够丰饱满、元素要多** 你才能来扰乱视线"

**根本机制**：
```
稀疏场景 (Lv12 瑜伽 · 白墙+3盆花+瑜伽垫)
    ↓
玩家 3 秒扫完 → 6 处差异一眼命中 → 无挑战

丰满场景 (预期 · 古董市场/书店/夜市/工具房)
    ↓
玩家眼睛在 100+ 视觉锚点里跳 → 大脑必须逐点比对 → 60 秒都不够
```

**丰满场景的量化标准**（每关必查）：
| 指标 | 稀疏（错） | 丰满（对） |
|------|-----------|-----------|
| 独立视觉物件数 | ≤ 15 | ≥ 40 |
| 背景纹理层次 | 单色墙 | 多层（墙+架+装饰+挂件+光影） |
| 前景/中景/远景 | 只 1 层 | 3 层完整堆叠 |
| 色彩多样度 | 单色调 | 6+ 主色 |
| 遮挡关系 | 全平铺 | 有物件之间的遮挡 |

**丰满场景的题材推荐清单**（AI 也能画出来的）：
- 🎯 **古董地摊**（各种小物件堆一起，日历/铜锁/瓷器/相框/怀表）
- 🎯 **书店/图书馆**（书脊密集 + 装饰摆件）
- 🎯 **夜市小吃摊**（食物+餐具+调料罐+灯串）
- 🎯 **杂货铺/五金店**（工具+零件+挂钩+纸箱）
- 🎯 **化妆台**（瓶瓶罐罐 + 首饰 + 相框 + 花）
- 🎯 **儿童玩具房**（玩偶+积木+车+涂鸦墙）
- 🎯 **中式茶室**（茶具+古书+盆栽+挂画+ 佛珠）

**丰满场景的 prompt 关键词**：
```
"visually dense, richly decorated, cluttered with 40+ objects, 
layered composition with foreground/midground/background elements, 
multiple textures and materials (wood, metal, ceramic, fabric, glass), 
warm variety of colors, small trinkets and detail objects scattered, 
cinematic depth-of-field but everything visible"
```

### 💎 金句 3 · "差异做不出来就删掉，别硬撑"
> 用户 v0.0.55 原话："这个你的那个泛光灯颜色有很抽象" —— 指 Lv10 lv4_b.jpg `umbrella` 米色→银色画得像色块乱码

**教训**：金属/反光/透明材质在 AI edit 里最容易画歪。**禁选清单**：
- ❌ 反光伞 · 金属材质换色（银↔米易糊）
- ❌ 玻璃杯液体倒/正
- ❌ 镜面反射内容
- ❌ 车漆金属漆颜色微调
- ❌ 半透明纱幔

**替代选择**（AI 稳定）：
- ✅ 布艺/纸艺物件（枕头/画/纸盒）
- ✅ 陶瓷/木器颜色跳变
- ✅ 亚光塑料/涂料
- ✅ 植物/水果（切换品种）

## 一、我之前踩过的三大根本错误（复盘 · 不许再犯）

### ❌ 错误 1：设计师视角 vs 玩家视角搞反了
我一直在**桌面上设计**"多巧妙、多有梗"：脸颊 6mm 痣、眉毛弧度差 6°、腰带单结→蝴蝶结、青花缠枝→山水、樱花发簪。设计层面很聪明，但玩家 60 秒扫图找不到 = 全废。
- 设计师追求**微妙**（弧度差 6°、饱和度差一档）
- 玩家需要**明确**（能命名的差异："红变白"、"多一片"、"换了个东西"）

### ❌ 错误 2：把"设计巧妙"和"AI 能做出来"混为一谈
`gemini-2.5-flash-image` / `gpt-image-2` 的 edit **不是 pixel-level edit**，是"参考 A 图整体重绘一张 B 图"。你写"只改 X"，它会整块重画，结果 A/B 之间有 100+ blob 漂移，你设想的精细差异**大概率画不出来或画歪**。

**血泪证据**：v0.0.49 一次生成后自评发现 Top-3 blob 面积占 65.1%（几乎整张图被重绘），触发一票否决。

### ❌ 错误 3：给 AI 用命令式指令（REPLACE X with Y），触发大范围重绘
命令式提示（"Edit this photo. REPLACE the bottle with a can"）会让模型大范围重画。**必须**改成描述式："这是同一场景的版本 B，与版本 A 相比：SPOT 1 位置版本 A 是 X，版本 B 是 Y..."

---

## 二、找茬游戏的底层机制

### 玩家的动作
```
看 A 图 → 建立视觉记忆 → 看 B 图 → 眼动扫描 3-5 次/秒 →
同位置 A/B 比对 → 发现"这里不一样" → 能命名（"红变白" / "多一个"）→ 点击
```

### 好差异的三条硬指标

| 硬指标 | 定义 | 反面示范（我踩过的坑）|
|--------|------|----------|
| **可对比性** | A/B 同位置、同尺寸、同背景，只有局部属性不同 | ❌ 脸颊多颗痣（A 图没痣，没对比锚点） |
| **可命名性** | 玩家心里能用一句 10 字以内说出差异 | ❌ 眉毛弧度差 6°、饱和度差一档 |
| **AI 可绘制性** | AI 图像编辑能可靠画出该差异 | ❌ 精确数量微变（2→3）、图案纹样换 |

---

## 三、T1-T7 合法差异类型（**只允许这 7 种**）

| 类型 | 定义 | AI 可控度 | 难度可控范围 | 例子 |
|------|------|-----------|-----------|------|
| **T1 · 颜色变换** | 同物件、同位置、同大小，只有颜色不同 | 🟢 高 | ⭐~⭐⭐⭐⭐⭐ | 6 片红玫瑰其中 1 片变白、水由清→绿 |
| **T2 · 数量增减（大件）** | 同类同风格物件数量变化，物件 ≥ 5% 帧宽 | 🟡 中 | ⭐⭐⭐~⭐⭐⭐⭐⭐ | 天际线 3 栋→4 栋楼、绿植 3 片→4 片叶 |
| **T3 · 大件替换（同类）** | 一个物件被替换成同类别、同尺寸的另一物件 | 🟢 高 | ⭐~⭐⭐⭐ | 清水瓶→红可乐罐、黄柠檬→青柠檬 |
| **T4 · 物件消失/新增** | 5-15cm 物件在 B 图完全消失或新出现 | 🟢 高 | ⭐⭐~⭐⭐⭐ | 桌上花瓶消失、墙上多一幅装饰画 |
| **T5 · 方向翻转** | 同物件朝向/翻转变化 | 🟡 中 | ⭐⭐⭐⭐ | 挂钟指针反、鱼头朝左→朝右、书正→反 |
| **T6 · 位置交换** | 两个物件互换位置 | 🟡 中 | ⭐⭐⭐⭐⭐ | 桌上苹果和橘子对换 |
| **T7 · 大图案替换** | 大件物件表面的图案完全换成另一个（非精细纹样） | 🟡 中 | ⭐⭐⭐⭐ | 挂画风景→人物、抱枕格子→条纹（抱枕 >15cm）|

## 四、严禁列表（一票否决 · 每犯一次自评 -20）

| ❌ 类型 | 为什么禁 |
|--------|---------|
| 面部微特征（痣/眉/唇/眼形/发型微改） | 玩家不知盯哪、AI 画不稳、破坏"同人"信任 |
| 精确数量微变（2→3、5→6、6→7） | AI 画不准数字，容易多画或少画 |
| 精细形态变化（单结→蝴蝶结、圆→心、直→弯） | AI 会整体重画物件 |
| 精细纹样换（缠枝莲→山水、梅花→兰草） | 玩家不认识、AI 画不准 |
| 弧度/角度/饱和度微变（眉毛 6°、色差一档） | 玩家眯眼看不出 |
| 光线/阴影方向变 | AI 无法可控 |
| 星星/花瓣/树叶**总数**微变（不属于 T2 定义） | AI 数不清 |
| 眉毛/唇色/发丝挑染等面部细节 | 破坏"同人"感 |
| 换整个大类物件（水果→电器、家具→玩具）| 破坏场景内在逻辑 |

## 五、AI 执行层面的 5 条铁律

### 🔒 铁律 1：B_PROMPT 必须用「版本对比描述」而非「编辑指令」
```
❌ 旧: "Edit this photo. REPLACE the bottle with a can."
✅ 新: "This is version-B of the same scene. Version-A shows a clear glass bottle. 
       Version-B, at the SAME position and SAME height, shows a red soda can. 
       All other pixels IDENTICAL to version-A."
```

### 🔒 铁律 2：每处差异必须**同时描述 A 和 B 版本**
```
✅ "SPOT 1: Version-A has 6 red rose petals floating on water. 
    Version-B has 6 petals in the SAME positions and SAME sizes, 
    EXCEPT the leftmost one is now WHITE."
```

### 🔒 铁律 3：每处差异必须给**精确坐标提示 + 大小**
```
✅ "at approximately x=1350 y=180 (right-upper), about 8cm on screen"
```

### 🔒 铁律 4：差异之间必须**间距 ≥ 10% 帧宽**（避免挤在一起）

### 🔒 铁律 5：B_PROMPT 末尾必须重申「其他 100% 保持」
```
CRITICAL: The person, her exact face features, her exact pose, her clothing 
color/cut/folds, all lighting, all shadows, all steam wisps, all background 
props NOT in the 7-diff list must remain IDENTICAL to version A. Do not 
redraw any element outside the 7 listed diff positions.
```

## 六、差异分布公式（7 处必须按金字塔）

```
2 处 ⭐   送分题     — T1/T3, 中央, 5-8cm, 高对比色
2 处 ⭐⭐⭐ 中等题    — T2/T4, 中景, 3-6cm
2 处 ⭐⭐⭐⭐ 难题    — T1/T5, 边角, 3-5cm
1 处 ⭐⭐⭐⭐⭐ 大师题 — T6/T5, 边角, 5cm, 需仔细对比
```

**空间分布强制要求**：
- 左三分之一：≥ 2 处
- 中三分之一：≥ 2 处
- 右三分之一：≥ 2 处

## 七、题材差异分布模板（v0.0.50 · 用户认可）

**场景 2 每关 7 处必须均匀铺开这三个域**（不许全塞人身上，也不许全塞背景）：

| 域 | 数量 | 例子 |
|----|------|------|
| **人物身上（服饰/首饰/配件层面，非面部）** | 2-3 处 | 项链吊坠形状换、腰带扣颜色换、袖口有无绣边 |
| **随身道具 / 场景近景物件** | 2-3 处 | 桌上瓶→罐、托盘水果换、水面漂浮物颜色变 |
| **中远景背景** | 2-3 处 | 窗外多/少一栋楼、墙上多/少一幅画、绿植叶片增加 |

**用户在 v0.0.50 明确认可的"外面的楼有些不一样 / 植物有一些不一样 / 女人身上有些细节不一样"三合一模式**，就是这个分布。

## 八、打分体系 v2.0（130 分制 · 一票否决机制）

打分器：`/Users/fat/Desktop/aiminigame/scene2_scorecard.py`

### 生存维度（40）· 一票否决区
| # | 项 | 分 |
|---|------|----|
| 1 | 合规安全（无露胸/湿贴/日系/古风/Logo/政治） | 10 |
| 2 | 人物一致性（A/B 同一人） | 10 |
| 3 | 风格一致性（对齐用户锚定） | 10 |
| 4 | 构图完整性（无水印/无穿帮） | 10 |

### 可玩性维度（40）· 像素级自动检测
| # | 项 | 分 |
|---|------|----|
| 5 | 差异存在 7/7 | 10 |
| 6 | 尺寸达标（≥40px 短边） | 10 |
| 7 | 分布均匀（L/M/R 各 ≥1） | 10 |
| 8 | 难度梯度（blob 面积方差） | 10 |

### 融合度维度（15）· prompt 静态判定
| # | 项 | 分 |
|---|------|----|
| 9 | 融合式改造 ≥5 处 | 10 |
| 10 | 场景逻辑 | 5 |

### 艺术质量（5）
| # | 项 | 分 |
|---|------|----|
| 11 | 画质（1536×1024/清晰） | 5 |

### v2.0 新增（30）· 反 AI 大规模重绘
| # | 项 | 分 | 一票否决 |
|---|------|----|----------|
| **12** | **差异集中度**（top-3 blob 面积占比） | 10 | **≥30% 直接判废** |
| **13** | 差异类型合规（属于 T1-T7） | 10 | 出现严禁列表判废 |
| **14** | 命名可读性（每处能一句话说） | 10 | / |

### 判定阈值
- 🟢 合格：≥ 108/130（83%）
- 🟡 及格：91-107（70-82%）
- 🔴 不合格：<91 或触发任一一票否决 → 必须重跑

### 打分器用法
```bash
python3 /Users/fat/Desktop/aiminigame/scene2_scorecard.py \
  path/to/lvN_a.jpg path/to/lvN_b.jpg
```
返回 exit 2 = 一票否决触发。

---

# 二、舞台绝对尺寸（场景 1 · hidden 用）

在 `game.js` 中舞台容器绝对写死：
- 逻辑视口 `VW = 375, VH = 667`
- `HUD_H = 44, TOOLBAR_H = 72, STATUS_H = 32`
- 舞台矩形：`stage.w = 359, stage.h = 519`
- **舞台 AR ≈ 0.6917**（359/519）
- 图片以 `contain` fit，`state._fit` 记录实际渲染矩形，坐标点击换算用它

# 三、场景 1（hidden 单图）生成 pipeline

### 尺寸要求
- 纵横比 = 0.6917（359/519）
- 推荐分辨率 **1024×1536**（标准尺寸，gpt-image-2 推荐），允许 720×1040
- 输出 `.jpg` 质量 80-85，单张 ≤ 500KB

### Prompt 尾巴（合规 + 构图约束）
```
Aspect ratio: 9:13 (portrait, width:height = 359:519, ~0.69).
Composition: fill the entire frame edge to edge, no letterbox, no watermark,
no white border, no text overlay. Center of interest in upper 2/3.
Modern-tech intrusion objects (穿越物) must be visible but not obvious;
place them at diverse depth levels (foreground / mid / background)
so hidden-object hunting has difficulty gradient. Photorealistic scene.
```

### 🚀 场景1新增关卡完整流程（热更版·无需 ksmg build）

```
① 查重       python3 -c "..." 确认 prop 未用过
② 确认方案   告知用户：场景主题 + 6个prop + 难度藏法 → 等用户 OK
③ 生图       ⭐ 必须走 agw-work-mode 的 make_images：
             uv run python -m tools.make_images --model image2 \
               --request request.json  # 位于 <agw-work-mode>/tools/make_images/
             ⚠️ 严禁走 designai-generate-image 等其他生图 skill（政治敏感/合规风险）
             ⚠️ Prompt 必须显式包含铁律禁词（NO Mao / NO 领袖像 / NO 军装 / NO 国旗 / NO 政治标语）
             ⚠️ 出图后必须目视审查墙面/海报/画像，通过后才能上传 CDN (ks693835817972937121)
④ 写关卡     levels.js 末尾新增关卡 {idx:N, themeId:1, ...}
⑤ 热更发布   bash scripts/publish-levels.sh  ← ⭐ 这步代替 ksmg build！
             = gen-levels-config.js + upload CDN
             玩家重启游戏 3 秒内看到新关卡
```

**⭐ 关键：只要不改游戏逻辑代码，新增关卡只需走步骤①-⑤，完全不需要 ksmg build+审核！**

### 热更发布一键命令
```bash
cd /Users/fat/Desktop/aiminigame/game-aigc-product-hub/games/ks658651445853447417
bash scripts/publish-levels.sh
```

### CDN 图片上传（scenes CDN）
```bash
# hidden 单图用 ks693835817972937121 分包 AppID
AGW_DIR="$HOME/.codeflicker/remote-personal-skills/agw-work-mode"
# files 必须传字符串路径数组，不是对象！
node -e "
const Upload = require('@kcdn/multi-upload');
const TOKEN = require('./node_modules/@kcdn/multi-upload/__token.json')['KS-GAME'];
new Upload({ pid:'KS-GAME', token:TOKEN, cdnDir:'AIGC-SoGame/ks693835817972937121',
  files:['/tmp/hidden_lvN.jpg'] }).upload().then(r=>console.log(r));
" # 在 AGW_DIR 下运行
```

---

# 四、场景 2（spot 双图找不同）生成 pipeline · v0.0.50

### 双模型串联
```
        ┌─────────────────────────────────────┐
        │  A 图 · 原图                          │
        │  openai/gpt-image-2                 │
        │  text-to-image, 1536×1024 (3:2 横版)  │
        └────────────────┬────────────────────┘
                         ▼
        ┌─────────────────────────────────────┐
        │  B 图 · 版本对比图                    │
        │  google/gemini-2.5-flash-image      │
        │  image-edit (以 A 为参考图)           │
        │  必须用「版本对比描述」，非命令指令      │
        └────────────────┬────────────────────┘
                         ▼
        三处同时落盘：
        1) real-scenes/scene2/lvN/{a,b}.jpg（源图存档）
        2) package/assets/scenes/spot/lvN_{a,b}.jpg（游戏加载）
        3) ~/Desktop/laotie-editor/real-scenes/scene2/lvN/{a,b}.jpg（编辑器标注用）
```

### 参考实现脚本
- **温泉少女 (Lv3) v0.0.50 用户认可版**：`/Users/fat/Desktop/aiminigame/gen_lv3_onsen.py` ← **最新样板，推荐仿写**
- **嫂子系列 (Lv3~Lv7) 旧版**：`/Users/fat/Desktop/aiminigame/gen_saozi_v3_diverse.py` （命令式提示，勿再仿）

### SKIP_A 机制（只重跑 B）
```bash
# 保留现有 A 图，只重跑 B（提示词失败时用）
SKIP_A=1 python3 gen_lv3_onsen.py
```

### 合规尾巴（人物题材通用，附在 A_PROMPT 末尾）
```
Wholesome graceful young Asian woman around 24-32, decent attire fully covering
chest and shoulders, warm friendly smile, no cleavage, no under-boob, no logos,
no brands, no suggestive pose, no bedroom pose. Sharp DSLR photo, 3:2 landscape,
cinematic natural lighting, ultra-detailed.
```

### 温泉/浴场特殊合规（雷区加强版）
凡是「温泉 / 浴池 / 泳池 / 沙滩」题材，A_PROMPT 必须额外声明：
- 穿**浴袍 (spa robe) 全闭合 + 腰带束紧**，覆盖到膝盖以下（不要浴巾裹胸、不要泳装）
- **不在水里**，坐在池边石凳（避免"pool + women"触发 safety）
- 表情写「gentle friendly smile」，绝不写 seductive/sensual/glamour
- 附加：`no cleavage, no bare skin below collarbone, no swimsuit, no bikini, no towel wrap on skin, no wet clothes, tasteful lifestyle magazine aesthetic`
- 参考成功案例：`gen_lv3_onsen.py` v3

### B_PROMPT 严格结构模板（v2.0）

```
This is version-B of the SAME photo you were given — same person, same face, 
same pose, same clothing, same scene, same lighting, same steam, same 
1536x1024 framing. Version-B is IDENTICAL to version-A EXCEPT at exactly 7 
specified spots described below. For every other pixel, keep it visually 
identical to version-A.

── SPOT 1 · [位置] (~x=___, y=___, ⭐难度) ──
Version-A: [A 图长什么样]
Version-B: [B 图长什么样，用 SAME/IDENTICAL 强调不变的属性]

... (7 处)

CRITICAL RULES:
- Every other pixel outside the 7 listed spots must be visually identical to 
  version-A. Do not redraw the face/hair/robe folds/marble/water beyond 
  the 7 spots.
- Each of the 7 spots must be clearly visible at glance (5-15cm on-screen).
- Do NOT add any element not listed. Do NOT change identity. Do NOT introduce 
  Japanese/古风 elements.
```

---

## 五、异物坐标标注流程（editor 工作流）· v0.0.51 更新

### 🚨🚨🚨 铁律 · editor 有独立域名和独立部署目录（用户骂过 3 次）

**editor 项目本地目录**：`/Users/fat/Desktop/laotie-editor/`（独立仓，独立 `.static-site-deploy.json`）
**editor 线上域名**：`https://laotie-editor.frontend-cloud.corp.kuaishou.com/`（专门给 editor 的）
**编辑器读取图片路径**：`/Users/fat/Desktop/laotie-editor/real-scenes/scene2/lvN/{a,b}.jpg`
**部署命令**：`cd /Users/fat/Desktop/laotie-editor && frontend-cloud-cli deploy`

**❌ 严禁把 laotie-editor.html 部署到 `aiminigame-onepage` 域名**！那是官网，不是配置后台。

### 🔎 每次要"部署 editor 修改"前的强制自检
```bash
# 必查：搜全盘 .static-site-deploy.json，别只看当前目录
find ~ -maxdepth 5 -name ".static-site-deploy.json" -not -path "*/node_modules/*" 2>/dev/null | xargs grep -l laotie
# 期望结果只有一个：/Users/fat/Desktop/laotie-editor/.static-site-deploy.json
```

### 🔎 域名映射速查表（决策前 5 秒扫一眼）

| 目录 | 域名 | 用途 | ⚠️ |
|-----|------|------|-----|
| `~/Desktop/laotie-editor/` | `laotie-editor.frontend-cloud.corp.kuaishou.com` | **editor 独立后台 ← 改 editor 只部署这里** | ✅ |
| `~/Desktop/aiminigame/.deploy-editor/` | `aiminigame-onepage.frontend-cloud.corp.kuaishou.com` | 快手 AIGC 小游戏官网首页 | ❌ 不是 editor |
| `~/Desktop/aiminigame/laotie-editor.html` | 本地文件 | 兜底本地开发 | ❌ 不许 open |

用户明确要求：
- 打开线上后台，不许开本地文件
- **默认坐标必须自动写入 levels.js**（AI 不许把体力活推给人）
- editor 只用于人工微调，不是"必须做的一步"

### 🚨 铁律 · 默认坐标必须自动写入 levels.js

生成 B 图的 prompt 里 **每个 SPOT 都写了精确 x,y 中心坐标**（比如 `~x=760 y=680`）。这些坐标就是"默认位置"，agent **必须**主动做百分比换算并直接写入 levels.js：

```
中心 x_px → x% = (cx - w_box_px/2) / 1536 * 100
中心 y_px → y% = (cy - h_box_px/2) / 1024 * 100
默认框大小: w=12, h=12（12% × 12% ≈ 184×123px，人眼舒适）
```

一句话：**agent 生成完 B 图 → 直接把 prompt 里的坐标算成百分比塞进 levels.js → 部署扫码**。不用让用户拉框。

### 场景 2 · lvN 双图标准闭环
1. 生成脚本会**自动**把 a.jpg / b.jpg 同时复制到四处：
   - `real-scenes/scene2/lvN/` （源存档）
   - `package/assets/scenes/spot/lvN_{a,b}.jpg` （游戏加载）
   - `~/Desktop/laotie-editor/real-scenes/scene2/lvN/` （本地兜底 · 不主推）
   - `~/Desktop/aiminigame/.deploy-editor/real-scenes/scene2/lvN/` （**线上 editor 部署源**）
2. **agent 自动做**：把 prompt SPOT 坐标写成 `odds[]` 塞进 `package/js/levels.js`
3. **agent 自动做**：`cd .deploy-editor && frontend-cloud-cli deploy`（同步图到线上 editor）
4. **agent 自动做**：`ksmg-preview.sh preview` 出扫码
5. 交付用户：
   - 扫码链接 = 直接进游戏，坐标已自动就位
   - 线上 editor 链接 = 可选微调：`https://aiminigame-onepage.frontend-cloud.corp.kuaishou.com/laotie-editor.html?scene=2&lv=N`
   - 用户若想调再拉框导出 JSON，不调就直接玩

### 场景 2 levels.js 关卡骨架（照抄改）
```javascript
{ idx:N, themeId:2, mode:'spot', layout:'h',
  title:'第X关 · <场景名> · 地狱', duration:60,
  sceneA:'assets/scenes/spot/lvN_a.jpg',
  sceneB:'assets/scenes/spot/lvN_b.jpg',
  hint:'🔥 地狱难度：60 秒内找出 7 处不同',
  diff:{ hitScale:1.0, penalty:5, bonus:0, label:'地狱', key:'hell' },
  odds:[
    {x:.., y:.., w:8, h:8, tag:'diff1'},  // editor 校准后回填
    ... 共 7 条
  ] }
```

---

## 六、坐标不准的排查

vConsole 日志格式：
```
[TAP] screen(cx,cy)=... | fit=x=A y=B w=C h=D | lvl=N 标题
[TAP] pct in image: x%=P y%=Q | hitScale=1
#i {tag} box=[x0~x1, y0~y1] ✓ HIT / ✗ miss
```

排查：
1. spot 模式 `state._fit` 指向 B 图（答案图），点击换算按 B
2. 若 y% > 100 = 点在图外
3. box 和 editor 百分比不一致 → levels.js 没更新，或快手 App 缓存了旧 JS
4. **每次扫码前先把快手 App 从后台上滑杀掉**（清 JS 缓存）

## 七、部署与刷新缓存

```bash
cd /Users/fat/work/minigame/game-aigc-product-hub/games/ks712131693858878897
node -c package/js/game.js && node -c package/js/levels.js
bash /Users/fat/.codeflicker/remote-personal-skills/agw-work-mode/scripts/ksmg-preview.sh preview ./package
```

**扫码前必做**：
1. iPhone 底部上滑 → 找到快手 App → 向上滑掉（完全杀进程）
2. 重新打开快手 App
3. 扫最新 QR
4. 看左下角 build_ver 与部署版本对齐才算生效

## 八、v0.0.49 修复：通关前 audio pop 爆音

**症状**：找到最后一个物品，correct.mp3 刚播就被 pass.mp3 stop() 硬切 → 波形陡断 → 扬声器爆出 "咔啦" 声。

**修复**（`js/game.js` FOUND 分支）：
```javascript
var _isFinalHit = (state.foundCount === state.level.odds.length);
if (M3.Feedback){
  if (_isFinalHit) M3.Feedback.vibrate('medium');   // 只震动
  else M3.Feedback.correct();                       // 正常反馈
}
```
让 correct 让位给 pass 独占，pop 消失。**新增关卡不用管这个，全局已生效。**

## 九、现存关卡快照

### 场景 1（hidden 单图）
| Lv | 主题 | 分辨率 | AR | prop 数 |
|----|------|--------|-----|---------|
| 1-13 | 80年代穿越物系列 | 完整图 | ≈0.69 | 1-7 |

### 场景 2（spot 双图 · 找不同）
| Lv | 主题 | 分辨率 | AR | 差异数 | 生成脚本 | 状态 |
|----|------|--------|-----|--------|----------|------|
| 1 | 餐厅少年 | 1024×1536 | 2:3 竖 | 7 | 手工/早期 | 已上线 |
| 2 | 海边美女 | 1024×1536 | 2:3 竖 | 7 | 手工/早期 | 已上线·风格锚 |
| 3 | 温泉少女·现代都市中式 | **1536×1024** | **3:2 横** | **7 (人 3 + 道具 2 + 背景 2)** | `gen_lv3_onsen.py` v3 | **v0.0.50 待坐标标注** |
| 4-7 | 嫂子系列（旧版·勿仿） | 1536×1024 | 3:2 横 | 7 | `gen_saozi_v3_diverse.py` | 旧命令式提示 |

## 十、待办 · 每关必走的 checklist（v0.0.52 · 自动化 · 双源同步）

**新关卡生成完，agent 必须主动做完这 10 步**（不许跳，不许推给用户）：
- [ ] 用 `scene2_scorecard.py` 跑自评，总分 108+ 且无一票否决才交付
- [ ] 目视 A/B 图，人工过第 1-4 项（合规/一致/风格/构图）
- [ ] 把 prompt 里 7 个 SPOT 的 (cx,cy) 算成百分比 → **写入** `package/js/levels.js` 的 `odds[]`
- [ ] **同步改 editor** `~/Desktop/laotie-editor/index.html` 的**三处**：
  - `[a] 关卡元信息` 数组里 lv:N 那一项的 `title`/`hint`
  - `[b] defaultOdds[N]` 的 7 个 `{prop,x,y,w,h}`（与 levels.js 完全对齐）
  - `[c] propMap` 每个新 prop 的 `{emoji,name}`
- [ ] 同步 a.jpg/b.jpg 到 `~/Desktop/laotie-editor/real-scenes/scene2/lvN/`
- [ ] `cd ~/Desktop/laotie-editor && frontend-cloud-cli deploy`
- [ ] `node -c package/js/levels.js` 检查语法
- [ ] `ksmg-preview.sh preview` 生成扫码
- [ ] 交付时给三样：扫码图 + editor 线上链接（微调用）+ 一句"默认坐标已就位可直接玩"

## 十一、v0.0.53 · agent 五大禁忌（每犯一次强制自罚，扣自评 -30）

### ❌ 禁忌 1：开本地 HTML 而非线上部署页
- 反例：`open ~/Desktop/aiminigame/laotie-editor.html`
- 正解：`open https://laotie-editor.frontend-cloud.corp.kuaishou.com/`

### ❌ 禁忌 2：把能自动化的活推给用户
- 反例：让用户去 editor 拉 7 个框、导出 JSON、粘给我
- 正解：agent 从 prompt 已知坐标 → 自动算百分比 → 直接写 levels.js

### ❌ 禁忌 3：搞错 editor 的独立部署目录/域名
- 反例：往 `~/Desktop/aiminigame/.deploy-editor/` 里丢 laotie-editor.html
- 正解：目录 `~/Desktop/laotie-editor/` + 域名 `laotie-editor.frontend-cloud.corp.kuaishou.com`
- 预防口诀：**"改 editor 前先 `find ~ -maxdepth 5 -name .static-site-deploy.json | xargs grep -l laotie`"**

### ❌ 禁忌 4：只更新游戏 `levels.js` 忘同步 editor 的 `index.html`（v0.0.52 · 用户骂过）
- 反例：改完 `package/js/levels.js` 就完事 → editor 里默认框还是**上一个版本**的旧 prop（比如 lv3 温泉图配了嫂子的 `lip_mole`+`heart_ring`）
- 正解：editor 是**独立静态硬编码**的关卡元信息+默认坐标+propMap 图鉴，`~/Desktop/laotie-editor/index.html` 里有 3 处必须同步改：
  1. **关卡元信息数组** —— `{lv:N, title:'...', duration, hint, calibrated, hell}`
  2. **默认坐标 `defaultOdds[N]`** —— 7 个 `{prop, x, y, w, h}` 与游戏 levels.js 完全对齐
  3. **propMap 图鉴** —— 每个 prop 的 `{emoji, name}` 键值对
- **触发根因**：agent 以为 editor 从共享 JSON 加载 → 实际它是硬编码。**"两处真相"陷阱** — 数据源镜像时只改一处
- 预防口诀：**"改一处 levels 前，先 grep 相同 tag 在 laotie-editor/index.html 是否也有一份"**
- 强制流程：
  ```bash
  # 1. 每次改完 levels.js，立刻 grep editor 是否有旧版镜像
  grep -n "lv3\|温泉\|<新 prop 名>" /Users/fat/Desktop/laotie-editor/index.html
  # 2. 3 处一起同步改：title/hint、defaultOdds[N]、propMap
  # 3. cd ~/Desktop/laotie-editor && frontend-cloud-cli deploy
  ```

### ❌ 禁忌 5：AI 画不出的差异不允许硬留在关卡里（v0.0.53 · 用户骂过）
- 反例：`monstera_leaf` 绿植 3 片 → 4 片，AI edit 大概率画不准 → 玩家 60 秒找不出来 → 玩家骂"根本没这处不同"
- 正解：**当用户反馈某处"找不到"时，必须立刻从关卡里删掉这一处**（不是让用户"再仔细看"）。剩余处数可以是 6/5/4，动态调整 hint 文案里的数字。
- 触发根因：agent 迷信 prompt 里写的 7 处 = 图上真有 7 处；把"prompt 意图"与"AI 实际画出效果"混为一谈
- 预防：**任何差异只要 AI 画不稳（T2 精细数量增减 / T7 精细纹样 / 面部微特征），首选替换成 T1/T3/T4 大件；用户反馈找不到时立刻删除并同步 levels.js + editor + hint 数字**
- 强制修复流程：
  ```
  1. levels.js odds[] 删除该 tag
  2. editor index.html defaultOdds[N] 删除该 prop
  3. levels.js hint 文案"7 处"→ 剩余数
  4. editor 元信息 hint 同步改
  5. calibrated:false → true（用户已 editor 校准过）
  6. 双部署 + 出扫码
  ```
