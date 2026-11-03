# 斗地主 - 创意检索

## 范围与模式

- **APPID**: `ks651896049489522351`
- **游戏名**: `dou-di-zhu`
- **检索模式**: named / 单一候选补全
- **Provider**: Google web search + GitHub public pages（只读）
- **查询数量**: 8
- **完整性**: 部分完成；本轮未使用 GitHub CLI 深读 README / tree，因此 license、fork family、默认分支树哈希均按 unknown / risk 处理。

## 玩法契约

来自 `docs/idea-collect.md` 与 `docs/scaffold.md`：

- 经典三人斗地主：1 个地主 vs 2 个农民
- 54 张牌，叫地主 → 出牌 → 结算
- 标准牌型：单张、对子、三条、三带一、三带二、顺子、连对、飞机、四带二、炸弹、火箭
- 纯 Canvas 渲染
- WebSocket 多人联机
- 房间创建、加入、随机匹配、断线重连
- 快手能力：登录、分享、广告、本地存储、振动、Toast / Modal

## 候选选择

| 类别 | ID | 标题 | CTR 顺序 | hard filter |
|---|---|---|---:|---|
| 联机卡牌 | `ddz-online-01` | 斗地主 WebSocket 联机小游戏 | 1 | pass |

> 本次是对当前已选定游戏的补全检索，不重新选择创意赢家，也不因仓库证据改变玩法方向。

## 唯一仓库族池

| Family | Repository / Page | 类型 | 证据 | License | 风险 |
|---|---|---|---|---|---|
| R1 | `Wangqingye/Doudizhu-sever` | Direct match | Google 摘要显示“斗地主游戏服务器端-Node.js & Express & WebSocket”，与当前服务端需求高度一致 | unknown | 未深读源码与 license；仓库名疑似 `sever` 拼写，需人工确认 URL |
| R2 | `wanlihang/Dou-dizhu` | Direct match | GitHub 页面摘要显示“欢乐斗地主 / html5斗地主3.0”，语言 JavaScript/HTML/CSS | unknown | 未确认是否包含联机服务；可能更偏单机 / 前端参考 |
| R3 | `llyram/Declare` | Structural reference | GitHub 摘要显示“multiplayer card game using SocketIO, ReactJS, NodeJS and express” | unknown | 非斗地主，仅可参考多人卡牌房间/SocketIO 架构 |
| R4 | `GitHub Topics: multiplayer-browser-game (JavaScript)` | Structural reference pool | Topic 摘要包含 “Online Card-game, based on NodeJS, socket.io, React” 等多人浏览器游戏参考 | unknown | Topic 不是单一仓库；需要后续深读具体候选 |
| R5 | `GitHub Topics: uno (JavaScript)` | Structural reference pool | Topic 摘要包含 “multiplayer websocket socket-io card-game ... uno online-game” | unknown | 非斗地主；仅参考回合制卡牌同步、房间与消息流 |
| R6 | `dobyte/due` | Structural / server framework | 摘要显示 Go 分布式游戏服务器框架，支持 tcp/kcp/ws，并提到 due-doudizhu-server 商业案例 | unknown | 框架级参考，非可直接复用斗地主代码；商业案例非公开 |

## 单创意映射

### `ddz-online-01` — 斗地主 WebSocket 联机小游戏

#### Direct matches

1. **R1 — `Wangqingye/Doudizhu-sever`**
   - 匹配点：斗地主、Node.js、Express、WebSocket、服务端。
   - 可借鉴：房间管理、连接生命周期、消息协议、叫地主/出牌服务端权威状态。
   - 风险：本轮未确认 license；不可直接复制实现，只能作为结构参考后人工核验。

2. **R2 — `wanlihang/Dou-dizhu`**
   - 匹配点：HTML5 斗地主，JavaScript/HTML/CSS 前端实现。
   - 可借鉴：Canvas 或 DOM 版斗地主牌桌 UI、牌面布局、交互节奏。
   - 风险：未确认是否联机；若只有前端静态实现，不应用作 WebSocket 依据。

#### Structural references

1. **R3 — `llyram/Declare`**
   - 匹配点：多人卡牌、SocketIO、React/Node/Express。
   - 可借鉴：多人卡牌房间、实时消息、玩家状态同步。
   - 差异：不是斗地主；规则层不可复用。

2. **R4 — `multiplayer-browser-game` JavaScript Topic**
   - 匹配点：浏览器多人游戏、Node.js、socket.io、canvas-game。
   - 可借鉴：浏览器端实时联机游戏工程组织、前后端事件协议。
   - 差异：需从 topic 里进一步筛掉非卡牌/非回合制项目。

3. **R5 — `uno` JavaScript Topic**
   - 匹配点：UNO 是回合制多人卡牌，存在 websocket/socket.io 在线游戏实现。
   - 可借鉴：回合推进、出牌合法性校验、断线重连、房间状态广播。
   - 差异：牌型规则与斗地主完全不同，不能混用规则。

4. **R6 — `dobyte/due`**
   - 匹配点：服务端框架支持 ws，并有斗地主服务器商业案例线索。
   - 可借鉴：大型房间制棋牌游戏服务端分层、网关/业务服务拆分思路。
   - 差异：Go 框架且商业案例非公开，当前快小游轻量项目不应引入该复杂度。

## 适配策略

1. **服务端权威状态**：继续保持当前项目 `server/index.js` 的服务端统一发牌、叫地主、出牌与结算模式。
2. **客户端轻量化**：客户端仅维护 UI 状态、输入选择和服务器回包渲染，不在客户端决定胜负。
3. **协议稳定化**：保留 `type/roomId/playerId/data` 的 JSON 消息结构，便于快手环境与 H5 环境共用。
4. **Canvas 优先**：快手小游戏侧继续使用 Canvas 渲染，避免 DOM 依赖。
5. **License 安全**：公开仓库仅作为结构与功能参考；正式代码不能复制未授权片段。

## 噪声与未解决项

- Google 搜索返回了 topic、awesome list、gist、论坛和商业案例等噪声，未纳入直接复用列表。
- 本轮 GitHub CLI 检索被用户取消，因此未进行 stars、默认分支 tree、README、license 的深度核验。
- `Wangqingye/Doudizhu-sever` 需要后续人工确认仓库 URL、license 和代码可读性。
- 当前项目已有本地桌面参考路径 `/Users/haochengjiang/Desktop/doudizhu`，但该路径不在当前机器，不能作为可审计来源。

## 交接状态

- **winner_id**: `ddz-online-01`
- **推荐继续方向**: 保持当前斗地主 WebSocket 联机小游戏方向，不重新选题。
- **下一阶段**: 当前项目实际已完成 codegen/self-test，工作流不回退；本报告仅补全 `idea-search` 证据链。
