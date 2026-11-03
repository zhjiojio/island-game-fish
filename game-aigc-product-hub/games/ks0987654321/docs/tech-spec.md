# 技术方案 — configurable-merge-defense（ks0987654321）

> 版本：2026-09-16
> 状态：代码生成完成

## 一、设计目标与边界

- 交付一个题材无关、资源无关、配置驱动的关卡制 PvE 塔防模板。
- 兼容 `schemaVersion: 5`、`template: fixed-path-v1` 的现有关卡 JSON。
- 每局开始前，玩家从动态下发的已解锁卡牌中确定性选择 `deckRules.deckSize` 张（默认五张）；战斗中只能部署所选单位。
- 支持局内升级、局外成长、配置型羁绊、世界地图节点和关卡解锁。
- 首版不包含概率抽卡、PVP、IAP、社交、排行榜、账号绑定或远程用户资产。
- 不生成图片、音频或视频，不调用媒体模型；缺失资源时使用 WebGL 中性几何占位。
- 生产配置后台视为外部既有服务；仓库内实现客户端配置适配器与本地 Node.js Mock。

## 二、素材结构方案

### 主包素材

本轮不新增实际图片、音频、视频或字体文件。

| 文件/目录 | 类型 | 大小估算 | 说明 |
|---|---|---:|---|
| `assets/README.md` | 文档 | < 2 KB | 脚手架已有资源说明 |
| WebGL 配置化形象兜底 | 运行时绘制 | 0 KB | 按默认题材配置绘制地图结构、角色轮廓、装备特征和怪物形象 |

运行期配置可通过 `assetManifest`、资源键或 HTTPS URL 指向题材资源。资源缺失、加载失败或协议不合法时，按 `mapStyle`、`roleAppearances` 和 `enemyAppearances` 程序化绘制完整兜底表现。

### CDN 素材

当前扫描结果：无视频、无图片、无音频，`docs/AssetCdnRecord.json` 不存在并按空记录 `{}` 处理。

| 文件名 | CDN 路径 | 大小估算 | 预下载 | 原因 |
|---|---|---:|---|---|
| 无 | — | 0 KB | 否 | 本轮没有媒体素材 |

## 三、代码结构方案

```text
package/
  js/
    play/
      neutral-config.js       # 独立默认配置包：珊瑚幻想题材、场景、角色、敌人与完整关卡
      config-validator.js     # schema、范围、引用、资源协议和能力白名单校验
      runtime-config.js       # 远程拉取、超时/重试、ETag、缓存和三级回退
      save-data.js            # 本地存档版本、迁移、卡牌成长和地图进度
      deck.js                 # 战前五卡选择、合法性检查和最近卡组
      progression.js          # 局外等级、经验、成长修正
      bonds.js                # 羁绊阈值、白名单效果和确定性叠加
      world-map.js            # 地图节点、前置条件、星级和解锁计算
      board.js                # 格子、路线、障碍、可建造格和坐标换算
      combat.js               # 塔、敌人、投射/命中、技能、经济和波次
      game.js                 # 场景状态机、更新循环、胜负和结算编排
      input.js                # 触摸/鼠标归一化和场景动作派发
      platform-compliance.js  # 隐私政策、用户协议、实名、防沉迷、客服预留调用点
    render/
      renderer.js             # WebGL2/WebGL shader、批量矩形/圆形/进度条绘制
      ui-layout.js            # 安全区、自适应布局和各场景命中区域
      glyphs.js               # WebGL ASCII + 简体中文点阵字形；用于无图片资源时显示配置文案
    scene/
      scene-models.js         # 首页、地图、关卡详情、五卡、战斗、结算、养成视图模型
  api/                        # 脚手架锁定，不修改
  standard/                   # 脚手架锁定，不修改
  assets/                     # 本轮不新增媒体素材

server/
  package.json
  README.md
  fixtures/
    runtime-manifest.json     # 中性测试清单
    levels/neutral-level-1.json
  src/
    app.js                    # Node.js 内置 http 服务
    routes/health.js
    routes/config.js
    services/config-service.js
    repositories/fixture-repository.js
    config/env.js

tests/
  config-validator.test.js
  deck.test.js
  bonds.test.js
  world-map.test.js
  combat.test.js
  server-contract.test.js
```

### 模块原则

- 所有客户端业务文件使用 ES5、IIFE，并挂载到 `window.M3`；文件内部不得 `require`。
- `js/main.js` 只增加 require 列表、初始化调用以及替换 `draw()` 占位体；保留 resize、时间源和主循环结构。
- H5 的 `index.html` 按相同顺序追加脚本标签，`main.js` 保持最后。
- 玩法逻辑与渲染完全解耦，渲染只读取只读视图模型。
- 所有画面通过 WebGL 绘制，不使用 Canvas 2D，不用业务 DOM/CSS。
- 远程配置只解析 JSON，禁止 `eval`、`Function`、远程脚本或表达式求值。

## 四、运行时状态机

```text
BOOT
  → HOME
  → WORLD_MAP
  → LEVEL_DETAIL
  → DECK_SELECT
  → BATTLE
  → RESULT
  → WORLD_MAP

HOME ↔ COLLECTION ↔ PROGRESSION
HOME ↔ BONDS
HOME ↔ SETTINGS / COMPLIANCE
```

- `BOOT`：初始化日志、存储、远程配置与缓存回退；完成后直接进入 `WORLD_MAP`。
- `WORLD_MAP`：遍历并展示 `worldMap.nodes` 的全部关卡，采用纵向吸附滚动与视口绘制；选择节点时同步切换其 `levelId`，不再固定使用首个节点。
- `DECK_SELECT`：从合法候选中选择配置指定数量，默认五张；不随机补齐。
- `BATTLE`：按固定时间步更新波次、移动、攻击、技能、经济与基地生命。
- `RESULT`：确定性计算星级、经验、材料和地图解锁，并持久化。

## 五、数据与配置方案

### 基础关卡配置

原样接收附件格式的顶层字段：

`name / revision / status / delivery / schemaVersion / template / map / units / economy / waves / audio / waveExecution / requiredCapabilities / assetManifest`

模板不要求在基础关卡 JSON 中加入新字段。

### 运行时清单

独立清单包含：

- `deckRules`：卡组数量、重复规则、必选标签、禁用卡。
- `cards`：数量可变的角色/塔防卡牌目录，包含卡牌 ID、对应单位 ID、标签、解锁规则和资源键；数组长度决定角色总数。
- `progression`：等级、经验、材料和成长规则。
- `progression.baseUpgradeCost / upgradeCostGrowth`：局外升级的基础材料花费与逐级增长倍率。
- `bonds`：标签阈值、效果白名单、叠加顺序和上限。
- `worldMap`：节点坐标、前置关系、奖励和关卡引用。
- `levels`：关卡 ID 到基础 JSON 接口的映射。
- `assetManifest`：资源键、类型、URL、版本和可选哈希。
- `presentation`：题材标识、显示名、场景资源键、全局配色、地图样式、角色形象模板和怪物形象模板；渲染器只消费这些通用字段，不包含题材判断。
- `presentation.copy`：首页、地图、选卡、战斗和结算的界面文案；卡牌 `uiName`、地图节点 `displayName/description`、关卡 `uiName/description/objective` 分别随对应实体配置下发。

### 校验与回退

1. 远程清单和关卡均先解析到临时对象。
2. 校验 schema、数组长度、地图尺寸、数值范围、ID 格式、引用闭合、HTTPS 资源域名和能力白名单。
3. 全部通过后原子替换运行时配置并写入版本化缓存。
4. 失败时回退到上一次完整且可玩的有效缓存；仍失败则使用内置珊瑚幻想默认配置。内置配置包含完整题材表现、6 个默认角色、5 张卡组规则、地图、敌人、经济和三波战斗数据，可独立完成一局。
5. 清单只有在可用角色数不少于 `deckSize`、每个角色的单位数据存在、地图节点引用的关卡全部存在且关卡校验通过时才可启用；否则视为相关配置缺失并触发整套兜底，禁止进入空白或无法开局的半配置状态。
6. 配置更新后重新验证最近卡组；失效卡牌被移除，玩家必须重新补足五张。
7. 后台玩法配置有效但缺少题材表现字段时，保留其玩法数据，并按字段补齐默认地图结构样式、角色体型与装备、怪物体型与特征、场景纹理参数；不会因为缺少美术字段出现空白卡片或单色方块。

## 六、核心玩法实现

### 战前五卡

- 候选来自已解锁卡牌与关卡限制的交集。
- 候选总数不写死；选卡页按 6 个展示位分页，页数由候选数量自动计算。
- 点击卡牌加入或移出，达到 `deckSize` 且全部规则通过后才能开始。
- 不使用概率、不随机抽取、不自动随机补齐。
- 推荐阵容只读取配置中的确定性 ID 列表。

### 战斗

- 固定路线由 `map.path` 提供，敌人沿相邻格中心插值移动。
- 可建造格由 `map.tiles` 和障碍状态决定。
- 选择底部五卡之一后点击格子部署；点击已有塔弹出升级/清除选择。
- 塔按 `range`、`interval` 和 `attack` 选择目标并攻击。
- 首版支持 `none`、`slow`、`splash` 三类白名单技能；未知技能降级为普通攻击并记录警告。
- 波次按照 `waveExecution`、group `delay`、`interval` 和 `count` 生成。
- 经济使用 `initialGold`、`regenRate`、`resourceCap`、`buildCost`、`upgradeCost` 和 `killReward`。
- 全部波次及存活敌人清空后胜利；基地生命降为零时失败。

### 成长、羁绊与解锁

- 局内升级以 `levelCap / growth / upgradeCost` 为准，对局结束重置。
- 局外成长从独立 progression 配置计算，不修改原始关卡对象。
- 局内点击已部署角色后先选中角色并展示升级面板，确认后才扣除计算出的费用；选卡页与战斗卡栏展示关卡单位 `buildCost`。
- 世界地图提供局外角色升级入口，角色卡同时展示当前等级、部署购买花费和下一次升级材料花费。
- 羁绊按战前卡组标签计算，仅执行白名单数值效果。
- 地图解锁由前置节点、星级和玩家等级的纯函数判断。

## 七、WebGL 表现方案

- WebGL 批渲染按 `mapStyle` 绘制水域背景纹理、地块边框与装饰、道路内层、障碍细节、出生点和终点。
- 角色与怪物按形象模板组合身体、头部、服装/甲壳和装备/特征层；形象模板由配置决定，不绑定题材判断。
- 数值与界面文案使用内置 WebGL ASCII/中文点阵字形，不依赖系统字体、Canvas 2D 或 DOM。默认界面为简体中文，远端配置可替换文案；资源缺失时仍有完整可读文字。
- 首页使用配置角色形象组成题材群像；世界地图和关卡详情直接按关卡 `map.tiles` 与 `map.presentation` 绘制地图缩略图；选卡页按每张卡的 `appearance` 绘制角色轮廓并显示 `uiName`。
- 资源图片加载后可转换为 WebGL 纹理；失败时保持几何占位。
- 所有布局从 `M3.Layout.safeTop` 开始，支持竖屏优先和横屏自适应。

## 八、服务端与本地 Mock

- 客户端 `runtime-config.js` 集中调用 `KwaiNetwork`，玩法模块不直接发请求。
- base URL 通过启动配置注入，不写死生产地址。
- 超时 5 秒；网络错误与 `5xx` 仅重试一次；`4xx` 不重试。
- 支持 `ETag / If-None-Match / 304`。
- 生成无第三方运行时依赖的 Node.js Mock，提供 `/health`、运行时清单和关卡接口。
- 本地 Mock 仅读取版本化 fixture；不含数据库或密钥。
- 正式 base URL 缺失时可本地开发，但阻断发布。

## 九、快手平台能力接入清单

| 能力 | 模块 | 接入时机 |
|---|---|---|
| 网络 | `api/kwai-network.js` | 启动时拉取清单、进入关卡时拉取关卡 |
| 本地存储 | `api/kwai-storage.js` | 配置缓存、局外进度、最近卡组 |
| 登录 | `api/kwai-login.js` | 保留脚手架初始化；失败时游客态继续 |
| 广告 | `api/kwai-ad.js` | 当前广告位为空，不主动触发 |
| 分享 | `api/kwai-share.js` | 保留能力，不在首版核心流程强制展示 |
| 合规调用点 | 受保护的平台调用 | 设置/合规入口：隐私政策、实名、防沉迷、客服 |

## 十、CDN 方案

- 是否需要 CDN：否。
- 原因：当前不存在视频、图片或音频；包体当前约 324 KB，明显低于 6 MB。
- `assets/home-asset/`：本轮无文件。
- `docs/AssetCdnRecord.json`：代码生成阶段创建空对象并保留后续扩展入口。
- 若以后配置资源改为本地打包且出现视频、图片 > 512 KB、BGM > 200 KB 或主包预计 > 6 MB，必须重新执行 CDN 流程。
- 卸载后主包估算：当前约 0.32 MB；加入业务 JS、测试 fixture 和本地 Mock 后预计仍低于 1 MB。

## 十一、分包方案

- 本轮不启用分包：用户未提出分包需求，且预计包体远低于限制。
- 保留脚手架已有的分包加载能力，不创建新的业务分包。

## 十二、验证方案

- 配置校验：有效附件结构、未知技能、非法 URL、断裂单位引用、越界路线、超限数组。
- 五卡选择：不足、超额、重复、禁用、必选标签、配置变更后的失效卡组。
- 羁绊：阈值、多档、叠加顺序、未知效果降级。
- 地图：前置、星级、玩家等级和循环依赖防御。
- 战斗：部署、升级、资源、波次、减速、范围伤害、基地受击、胜利和失败。
- 远程配置：200、304、404、超时、非法 JSON、缓存回退和中性兜底。
- H5 烟测：启动后直接展示完整关卡列表、多关卡滚动与指定关卡选择、地图场景预览与描述、关卡目标、五卡角色形象与名称、战斗、结算和重新进入列表。
- 静态检查：无 Canvas 2D、无业务 DOM、无子文件 require、无远程脚本执行、无附件题材名称硬编码。

## 十三、隐私与合规落实

- 预留 `PRIVACY_POLICY_URL` 和隐私政策入口。
- 预留 `kwaigame.requestRealNameAuth()` 调用点。
- 预留 `kwaigame.getAntiAddictionInfo()` 调用点。
- 预留 `kwaigame.openCustomerServicePage()` 调用点。
- 不包含“点击领取”“恭喜中奖”“限时免费”“红包提现”等诱导文案。
- 不写入第三方 IP、角色姓名、真人姓名或附件题材内容。
- 不提交 token、密钥、数据库密码或生产配置地址。

## 十四、待确认事项

- [x] 用户已确认技术方案，业务代码已生成并通过自动化与 H5 烟测。
- [x] 当前无媒体素材，无需 CDN Token。
- [x] 当前无需分包。
- [x] 服务端职责与本地 Mock 边界已由 `docs/server.md` 确认。
- [ ] 正式配置平台 base URL 在发布前提供；缺失不阻断本地开发。

## 十五、生成结果

- 客户端配置、存档、五卡、成长、羁绊、地图、战斗、输入和 WebGL 渲染模块已完成。
- Node.js 本地配置 Mock、运行时清单和一个中性演示关卡已完成。
- `docs/AssetCdnRecord.json` 已创建为空记录；本轮无媒体文件，因此未执行上传。
- 所有业务和服务端 JavaScript 已通过 `node --check`。
- 自动化测试：10 项通过，0 项失败；覆盖动态角色分页以及无配置、角色不足时的完整可玩兜底。
- 用户提供的 `珊瑚防线.json` 已通过关卡配置校验器；该题材数据未写入业务代码。
- H5 烟测已验证：首页标题与角色群像 → 地图缩略图/节点描述 → 关卡目标详情 → 动态角色形象与名称选卡；中性 fixture 提供 6 个示例角色，运行时可下发更多并自动分页。
- 当前 `package/` 约 404 KB，无视频、图片、音频或超限资源。


### 2026-10-15 CDN 配置接口切换

- 清单：`https://p1-ad.adkwai.com/udata/pkg/KS-GAME/ksgame_wolves/runtime-manifest.json`。
- 关卡：优先使用清单 `levels[id].url` 的 HTTPS 地址，缺失时使用 `https://p1-ad.adkwai.com/udata/pkg/KS-GAME/ksgame_wolves/releases/ksgame-wolves-20261015-002/levels/{levelId}.json`。
- H5 与快手入口均先加载 `js/runtime-endpoints.js`，保留地址注入和旧 base URL 兼容。
- CDN 配置中的图片资源键通过原有资源加载链路解析。
