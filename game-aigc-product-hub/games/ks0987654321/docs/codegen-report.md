# 代码生成报告

## 交付范围

- 配置驱动的固定路线塔防模板。
- 每局开始前由玩家从运行时下发的角色/塔防卡牌列表中自行选择；中性 fixture 提供六张示例卡，更多角色自动分页展示。
- 局内部署、升级、资源、波次、普通攻击、减速和范围攻击。
- 局外卡牌等级接口、本地进度、羁绊计算、世界地图与关卡解锁。
- 远程运行时清单和关卡加载、校验、缓存与中性兜底。
- 无远程配置、缓存无效、角色数量不足或关卡引用不完整时，启用包含 6 个角色和完整关卡的可玩兜底配置。
- 默认兜底同时包含珊瑚幻想题材、场景配色、6 个角色设定、敌人色板和地图表现；远程配置可逐字段替换，渲染与玩法代码不写死题材。
- 美术资源缺失时，地图地块/道路/出生点/终点/障碍和角色/怪物多层形象均由配置化程序绘制，不再只显示单色矩形。
- 首页、世界地图和关卡详情均显示可配置文案；地图选择与详情页展示关卡真实地图缩略图，卡牌页展示每个角色的配置化形象与名称。
- 默认界面语言已切换为简体中文，并内嵌纯 WebGL 中文点阵兜底；无需系统字体或图片资源。
- WebGL 中性几何渲染、触摸/鼠标输入和自适应安全区。
- Node.js 无依赖本地配置 Mock 与接口契约 fixture。
- 一个中性演示关卡；正式关卡数量由 `worldMap.nodes` 动态决定。
- 启动后直接进入完整关卡列表；后台下发多少个有效节点就展示多少个，没有客户端固定上限。列表支持触摸/鼠标滚动、卡片吸附、视口绘制和指定关卡选择。
- 关卡详情页提供配置化中文“返回”按钮，返回列表时保留原滚动位置。
- 已补齐局外角色升级页：显示材料余额、角色等级、部署购买花费和配置化升级材料花费，点击角色卡执行升级。
- 选卡页与战斗卡栏均显示每个角色的部署购买花费；点击已部署角色后显示局内等级、升级花费和确认升级按钮，不再直接扣费。
- 内置兜底提供 8 个可选关卡，用于在无后台配置时验证多关卡浏览流程。

## 核心文件

- `package/js/play/neutral-config.js`
- `package/js/play/config-validator.js`
- `package/js/play/runtime-config.js`
- `package/js/play/save-data.js`
- `package/js/play/deck.js`
- `package/js/play/progression.js`
- `package/js/play/bonds.js`
- `package/js/play/world-map.js`
- `package/js/play/board.js`
- `package/js/play/combat.js`
- `package/js/play/game.js`
- `package/js/play/input.js`
- `package/js/render/renderer.js`
- `package/js/render/ui-layout.js`
- `server/`
- `tests/`

## 配置兼容

- 基础关卡：`schemaVersion: 5`、`template: fixed-path-v1`。
- 用户提供的 `珊瑚防线.json` 已通过同一校验器。
- 题材名称、单位名称、场景资源和附件路径未写入客户端业务代码。
- 战前卡组、成长、羁绊和世界地图通过独立运行时清单关联基础单位 ID。

## CDN 与包体

- 上传文件：0。
- 原因：没有视频、图片或音频；不存在超限素材。
- `docs/AssetCdnRecord.json`：`{}`。
- `package/`：约 404 KB，低于 6 MB。
- 分包：未启用；当前体积无需分包，脚手架能力保留。

## 验证结果

- JavaScript 语法检查：通过。
- 自动化测试：11/11 通过。
- 服务端健康检查和清单/关卡契约：通过。
- 附件关卡 JSON 校验：通过。
- Git 空白错误检查：通过。
- H5 浏览器烟测：首页标题/角色群像、地图场景/描述、关卡目标、五卡角色形象/名称均通过。
- favicon 自动请求返回 404，不参与游戏运行。

## 代码合规清单

- ✅ 隐私政策位置与 `PRIVACY_POLICY_URL` 已预留。
- ✅ `kwaigame.requestRealNameAuth()` 调用点已预留。
- ✅ `kwaigame.getAntiAddictionInfo()` 调用点已预留。
- ✅ `kwaigame.openCustomerServicePage()` 调用点已预留。
- ✅ 无“点击领取 / 恭喜中奖 / 限时免费 / 红包提现”等诱导文案。
- ✅ 无第三方 IP、角色姓名或真人姓名硬编码。
- ✅ 角色总数由 `manifest.cards` 数组决定，界面与逻辑不再假定固定六个角色。
- ✅ 业务模块无 Canvas 2D、DOM UI、远程脚本执行或子模块 `require`。
- ✅ 无客户端密钥、生产 token、数据库密码或正式服务地址。

## 发布前阻断项

- 正式动态配置后台 base URL 尚未提供。
- 隐私政策正式 URL 尚未提供。
- 当前只适合本地预览、模板联调和后续 self-test，不应直接发布。
