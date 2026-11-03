# 斗地主游戏系统说明

> 适用 APPID：`ks699465320497476962`  
> 游戏名：`dou-di-zhu`  
> 本文档沉淀当前已落地的联机房间、行动倒计时、本地调试与铁豆货币体系，作为后续代码维护和验收依据。

## 1. 文档目的

本项目已从基础斗地主联机 Demo 演进为带有服务端权威回合控制和一期商业化货币体系的快手小游戏。本文用于统一说明：

- 联机房间与服务端权威状态如何工作；
- 本地浏览器调试需要启动哪些服务；
- 叫地主 / 出牌的行动倒计时和超时托管规则；
- “铁豆”如何替代旧大厅豆子和房间临时积分；
- 对局如何结算到铁豆余额；
- 当前未实现内容与后续规划。

## 1.1 v2.1 MVP 经济系统更新摘要

本次已按《老铁斗地主 · 豆子数值系统 v2》完成 P0 经济系统升级，代码实现以服务端配置和回包为准：

- 奖励入口：新用户 `10000` 铁豆、每日登录 `1000`、分享 `2000`、加桌 `5000`（生命周期一次）、破产补助 `3000`（余额低于 `5000` 且每日一次）。
- 广告奖励：每日最多 `20` 次，日封顶 `10000` 铁豆；第 `1-5` 次每次 `1000`，第 `6-10` 次每次 `500`，第 `11-20` 次每次 `250`。
- 房间分档：初级场 / 中级场 / 大师场三档；`classic` 兼容映射到 `junior`，`senior` 兼容映射到 `master`。
- 场次参数：初级场底注 `100`、门槛 `5000`、逃跑罚款 `1000`、封顶 `64`、抽水 `3%`；中级场底注 `800`、门槛 `40000`、入场费 `80`、逃跑罚款 `8000`、封顶 `128`、抽水 `4%`；大师场底注 `6400`、门槛 `320000`、入场费 `640`、逃跑罚款 `64000`、封顶 `256`、抽水 `5%`。
- 结算规则：赢家收益扣抽水，输家不额外承担；结算结果新增 `grossDeltas`、`taxDeltas`、`taxTotal`、`bankruptRewards` 等字段。
- 客户端：大厅/匹配读取服务端 `economy.roomTiers`，结算页支持破产补助按钮。

## 2. 当前系统总览

当前核心系统包括：

| 系统 | 说明 | 主要文件 |
|---|---|---|
| 联机房间 | 创建房间、加入房间、随机匹配、断线重连、经典场/初级房/中级房/高级房分档 | `server/index.js`, `package/js/network.js`, `package/js/game.js`, `package/js/matchmaking.js` |
| 回合控制 | 服务端维护叫地主、出牌、过牌、结算状态 | `server/index.js` |
| 行动倒计时 | 叫地主 15s，出牌 30s，超时自动托管 | `server/index.js`, `package/js/render.js` |
| H5 本地调试 | 静态服务加载 `package/index.html`，WebSocket 连 `localhost:8080` | `package/js/config.js`, `server/index.js` |
| 铁豆货币 | 服务端权威钱包，MySQL 持久化余额、流水、分档开局门票扣除，替代旧大厅豆子和房间积分 | `server/index.js`, `server/persistence/wallet-store.js`, `package/js/scene-home.js`, `package/js/render.js` |
| 对局审计 | MySQL 持久化对局主记录和关键事件，用于复盘、申诉和后续风控 | `server/persistence/match-store.js` |
| 协议安全 | WebSocket 消息大小限制、协议白名单、字段校验、连接级/协议级限流、违规断连 | `server/index.js` |
| Canvas UI | 大厅、房间、牌桌、结算、倒计时横幅 | `package/js/render.js`, `package/js/scene-home.js` |

## 3. 联机房间与服务端权威状态

### 3.1 房间模型

服务端以 `roomId` 维护房间：

```js
rooms: Map<roomId, Room>
```

每个房间包含：

- `players`：玩家对象集合；
- `seats`：3 个座位；
- `phase`：房间阶段；
- `currentPlayerId`：当前出牌玩家；
- `bidState`：叫地主阶段状态；
- `lastPlay`：上一手牌；
- `hands`：服务端权威手牌；
- `handCounts`：每个玩家剩余牌数；
- `round`：局数、底注、倍数、过牌数等；
- `result`：结算结果。

### 3.2 阶段流转

当前阶段流转：

```text
waiting → ready → bidding → playing → settlement → ready
```

说明：

| 阶段 | 含义 |
|---|---|
| `waiting` | 等待三名玩家加入 |
| `ready` | 三人已满，等待准备 |
| `bidding` | 叫地主阶段 |
| `playing` | 出牌阶段 |
| `settlement` | 本局结算，等待下一局准备 |

### 3.3 服务端权威原则

当前项目采用服务端权威状态：

- 服务端发牌；
- 服务端判断当前行动人；
- 服务端校验叫分、出牌、过牌；
- 服务端维护倍数；
- 服务端结算铁豆；
- 客户端只负责展示 UI、收集输入、发送操作。

客户端不应自行决定胜负、扣豆、加豆或推进回合。

## 4. 协议校验与限流防护

### 4.1 防护目标

服务端已在 WebSocket 消息入口增加轻量安全防护，目标是降低以下风险：

- 恶意客户端发送超大消息导致内存压力；
- 非 JSON 或畸形协议导致异常分支；
- 未知协议绕过正常客户端流程；
- 高频刷 `createRoom`、`quickMatch`、`claimShareReward`、`playCards` 等操作；
- 反复非法消息占用服务端 CPU 和日志资源。

### 4.2 消息大小与协议白名单

当前服务端限制：

```js
SECURITY = {
  maxMessageBytes: 4096,
  maxViolationsPerConnection: 5,
  connectionWindowMs: 10000,
  maxMessagesPerWindow: 80,
  maxObjectKeys: 16,
  maxCardIdsPerPlay: 20,
}
```

处理规则：

- 单条 WebSocket 上行消息超过 `4096` 字节：立即记录违规并断开连接；
- 非法 JSON：记录违规并返回错误；
- 消息不是对象：记录违规；
- 字段数量超过 `16`：记录违规；
- `type` 不在白名单内：记录违规；
- 单连接累计违规达到 `5` 次：以 `policy_violation` 断开。

当前允许的客户端上行协议：

```text
ping, getWallet, claimShareReward, claimAdReward, claimShortcutReward,
quickMatch, cancelMatch, createRoom, join, leaveRoom, setReady, bid, playCards, pass, syncHand
```

### 4.3 字段清洗与 schema 校验

服务端会在进入业务逻辑前做字段清洗：

- `nickname` / `playerName`：最多 `12` 字符；
- `avatarUrl`：最多 `256` 字符；
- `accountId` / `openId` / `guestId`：**直接删除**，身份只来自 auth 握手（见 6.5）；
- `auth.deviceId`：最多 `64` 字符，仅保留字母、数字、下划线、短横线、冒号和点；
- `roomId`：必须是 `6` 位数字；
- `setReady.ready`：必须是布尔值；
- `bid.score`：必须是 `0-3` 的整数；
- `playCards.cardIds`：必须是非空数组，去重、限制为最多 `20` 张，仅允许安全字符。

不满足 schema 的消息不会进入业务分支。

### 4.4 连接级和协议级限流

当前服务端采用内存滑窗限流，先保护单进程本地服务稳定性：

- 单连接总消息：`10s` 内最多 `80` 条；
- `ping`：`10s` 内最多 `30` 次；
- `getWallet`：`10s` 内最多 `12` 次；
- `claimShareReward`：`60s` 内最多 `3` 次；
- `claimAdReward`：`60s` 内最多 `6` 次；
- `claimShortcutReward`：`60s` 内最多 `3` 次；
- `quickMatch`：`10s` 内最多 `6` 次；
- `cancelMatch`：`10s` 内最多 `10` 次；
- `createRoom`：`60s` 内最多 `5` 次；
- `join`：`10s` 内最多 `10` 次；
- `leaveRoom`：`10s` 内最多 `10` 次；
- `setReady`：`10s` 内最多 `12` 次；
- `bid`：`10s` 内最多 `8` 次；
- `playCards`：`10s` 内最多 `12` 次；
- `pass`：`10s` 内最多 `12` 次；
- `syncHand`：`10s` 内最多 `6` 次。

超过协议级限流会返回错误并累计违规；超过连接总消息限流会直接断开连接。

### 4.5 当前边界

当前防护是单进程内存级，适合本地调试和一期内测。正式商业化还需要继续补充：

- IP / 设备 / 账号维度的跨连接限流；
- Redis 等集中式限流；
- 真实登录态和服务端 session；
- 黑名单 / 灰名单；
- 风控事件上报和告警；
- 协议版本号和客户端版本准入。

## 5. 本地调试与服务端口

### 4.1 一键启动 / 重启 / 停止

本项目本地调试同时需要两个服务：

- WebSocket 联机服务：`localhost:8080`
- H5 静态预览服务：`http://127.0.0.1:8766/index.html`

后续启动、重启、停止服务统一使用脚本，不再手动敲单个服务命令。

#### 启动或重启

`start-dev.sh` 会先调用停止脚本清理旧进程，再启动 WebSocket 与 H5 服务，因此可直接用于重启场景。脚本默认使用 MySQL，并开启机器人匹配与语音包交易：

```bash
cd games/ks699465320497476962
./scripts/start-dev.sh
```

首次使用默认模式前需要初始化 MySQL 全部核心表（包含机器人匹配相关表）：

```bash
cd games/ks699465320497476962/server
DDZ_MYSQL_USER=root DDZ_MYSQL_DATABASE=ddz npm run db:init:mysql
```

数据库模式不可切换：本项目只支持 MySQL。`./scripts/start-dev.sh` 会在检测到 `DDZ_DB_DIALECT=sqlite` 时直接失败。

机器人匹配与语音包交易默认开启，可通过环境变量临时关闭：

```bash
DDZ_BOT_MATCH_ENABLED=false ./scripts/start-dev.sh
DDZ_VOICE_TRADE_ENABLED=false ./scripts/start-dev.sh
```

> H5 预览使用游客身份。游客禁止购买是服务端安全边界，因此 H5 中可以验证商品入口已开放，但点击购买会提示使用快手登录；真实扣款和权益发放需在快手登录环境验证。

#### 停止

```bash
cd games/ks699465320497476962
./scripts/stop-dev.sh
```

#### 端口覆盖

默认端口：

- `WS_PORT=8080`
- `H5_PORT=8766`
- `H5_HOST=127.0.0.1`

如需临时修改：

```bash
cd games/ks699465320497476962
WS_PORT=8081 H5_PORT=8767 ./scripts/start-dev.sh
```

#### 运行时文件

脚本运行时文件位于：

```text
.runtime/
```

包含：

- `.runtime/server.pid`：WebSocket 服务 PID
- `.runtime/h5.pid`：H5 服务 PID
- `.runtime/logs/server.log`：WebSocket 服务日志
- `.runtime/logs/h5.log`：H5 静态服务日志

### 4.2 客户端 WebSocket 地址

客户端配置位于：

```text
package/js/config.js
```

当前配置：

```js
SERVER_URL: 'ws://localhost:8080'
```

### 4.3 H5 本地预览地址

浏览器打开：

```text
http://127.0.0.1:8766/index.html
```

> 注意：H5 静态服务只负责加载页面，联机匹配和对局依赖 `localhost:8080` 的 WebSocket 服务。

## 5. 行动倒计时与超时托管

### 5.1 倒计时配置

当前服务端配置：

| 阶段 | 时长 | 超时行为 |
|---|---:|---|
| 叫地主 | 15s | 自动不叫 |
| 出牌 | 30s | 自动不出或自动出牌 |
| 托管行动 | 1.2s | 短延迟后自动处理 |

服务端下发字段：

- `actionDeadlineAt`：当前行动截止时间戳；
- `actionTimeoutMs`：当前行动总时长；普通玩家叫地主为 `15s`、出牌为 `30s`，托管玩家轮到行动时为 `1.2s`；
- `serverNow`：服务端当前时间，用于客户端校准倒计时。

客户端根据这些字段展示倒计时。

### 5.2 叫地主超时

规则：

```text
当前玩家叫地主超时 → 自动不叫
```

如果三名玩家都不叫，不再重新发牌：

```text
无人叫地主 → 强制指定地主 → 进入出牌阶段
```

强制指定规则：

- 有上局赢家：从本局起叫玩家开始逆时针查找第一个上局赢家，指定为地主；
- 无上局赢家（首局）：指定本局起叫玩家为地主；
- 强制地主底分按 `1` 处理。

### 5.3 出牌超时

出牌阶段分两种情况。

#### 可以不出时

如果上一手牌存在，且上一手不是自己出的：

```text
超时/托管 → 优先尝试同牌型最小可压组合；找不到可压牌时自动不出
```

说明：自动策略会保守处理炸弹/火箭，仅在对手剩牌较少、当前是炸弹跟牌，或自己手牌很少等关键局面才作为兜底使用；常规跟牌会覆盖单张、对子、三张、三带、顺子、连对、飞机、四带二等主要牌型。

农民队友保护：如果当前玩家和上一手玩家都是农民，且地主未进入剩 `1~2` 张的低牌风险，自动策略默认不压队友；如果自己可以一手出完，或地主已低牌，则允许主动拦截。

#### 必须主动出牌时

如果是新一轮，或者上一手是自己出的：

```text
超时/托管 → 优先一手出完；否则按顺子/连对/飞机/三带/三张/对子/四带二/单张的顺序自动出牌，尽量减少剩余手数
```

自动出牌默认不主动拆炸弹/火箭；只有当炸弹/火箭可直接出完、对手低牌需要拦截、当前跟的是炸弹，或没有其他可行动作时才会使用。农民主动出牌时，如果地主只剩 `1~2` 张，会优先选择较大的单张，避免低单张喂牌。

### 5.4 托管边界

托管分两类：

- 超时托管：单次行动超时后自动处理当前动作；
- 退出/断线托管：对局中主动退出立即扣除 `50` 铁豆并进入托管；断线保留 `60s` 重连宽限，超时未回则扣除 `50` 铁豆并进入托管。

托管玩家不会立即判负，游戏继续：

- 叫地主阶段轮到托管玩家：自动不叫；
- 出牌阶段可不出时：优先尝试合理压牌，不能压再自动不出；
- 出牌阶段必须主动出牌时：按减少手数的策略自动出牌。

托管玩家轮到后续行动时不再等待完整倒计时，服务端会将该次行动窗口缩短为 `1.2s`，保留短暂演出/提示时间后自动叫地主、压牌、不出或主动出牌。

服务端会在玩家对象上记录托管元信息：

- `autoManagedReason`：进入托管原因，如 `active_leave`、`disconnect_timeout`；
- `autoManagedAt`：进入托管时间戳；
- `autoManagedTurns`：托管后已自动行动次数。

玩家重新进入同一房间且账号/昵称匹配时，会恢复原座位和手牌，清除托管状态，并广播 `playerUnmanaged` / `playerReconnected` 通知；客户端会以 toast 和桌面动画展示“退出托管”或“重连”。

### 5.5 客户端提示

客户端已增加：

- 中央行动横幅；
- 当前行动玩家面板倒计时圆标；
- 操作区提示文案；
- `提示` 按钮会优先推荐一手出完、长牌型或最小可压组合，支持顺子、连对、飞机、三带、四带二等主要牌型，并在关键局面提示炸弹/火箭兜底；
- 当农民队友刚出牌且非关键拦截局面时，`提示` 会清空选择并提示“队友出牌，建议不出”；
- 倒计时颜色变化：
  - `> 10s`：金色；
  - `<= 10s`：橙色；
  - `<= 5s`：红色闪烁。

## 6. 铁豆货币体系

### 6.1 替代关系

铁豆统一替代旧体系：

| 旧体系 | 问题 | 新体系 |
|---|---|---|
| 大厅本地豆子 `ddz_beans` | 仅本地存储，不能防篡改，不参与对局 | 服务端权威 `wallet.beans` |
| 房间临时积分 `players.score` | 只在房间内存，服务重启丢失 | 玩家铁豆余额 `players.beans` |

### 6.2 一期配置

当前一期配置：

```js
ECONOMY = {
  currencyName: '铁豆',
  newUserBeans: 1000,
  dailyLoginBeans: 200,
  shareRewardBeans: 300,
  adRewardBeans: 50,
  adRewardMaxPerDay: 5,
  shortcutRewardBeans: 500,
  minBeansToEnterRoom: 1,
  minBeansToReady: 100,
  exitPenaltyBeans: 50,
  disconnectGraceMs: 60000,
  baseBet: 10,
  maxMultiplier: 8,
}
```

说明：

| 配置 | 数值 | 说明 |
|---|---:|---|
| 货币名 | 铁豆 | 统一软货币 |
| 新用户初始 | 1000 | 首次创建钱包发放 |
| 每日登录 | 200 | 已预留服务端发放逻辑 |
| 分享奖励 | 300 | 每日首次分享由服务端发放 |
| 广告补豆 | 50 | 每日最多 `5` 次，需客户端广告完成后请求服务端发放 |
| 加桌奖励 | 500 | 每日首次添加到桌面后由服务端发放 |
| 经典场匹配门槛 | 1 | 快速开始进入经典场，保留原有轻量门槛 |
| 初级房门票 | 150 | 点击初级房卡片进入，开局前扣除一次 |
| 中级房门票 | 400 | 点击中级房卡片进入，开局前扣除一次 |
| 高级房门票 | 9000 | 点击高级房卡片进入，开局前扣除一次 |
| 冻结值 | 初级 800 / 中级 200 / 高级 4000 | 本期仅配置预留，不实际冻结 |
| 准备/开局门槛 | 按场次配置 | 经典 100、初级 300、中级 800、高级 12000 |
| 退出惩罚 | 50 | 对局中主动退出或断线超时托管扣除 |
| 底注 | 按场次配置 | 经典 10、初级 10、中级 30、高级 200 |
| 最大倍数 | 8 | 防止单局爆仓 |

### 6.3 钱包模型

服务端维护钱包：

```js
wallet = {
  accountId,
  beans,
  totalEarned,
  totalSpent,
  totalWon,
  totalLost,
  dailyLoginDate,
  createdAt,
  updatedAt,
}
```

当前钱包与对局审计持久层强制使用 **MySQL / InnoDB**，不再支持 SQLite、本地 `.db` 文件或双方言切换。所有环境（本地、测试、预发、正式）都必须连接 MySQL-compatible 数据库；SQL 必须使用 MySQL 语法，例如 upsert 只能使用 `ON DUPLICATE KEY UPDATE`，禁止新增 `ON CONFLICT`、`PRAGMA`、`INSERT OR IGNORE`、`node:sqlite`、`better-sqlite3`、`DDZ_DB_PATH` 或 SQLite 专用迁移逻辑。

本地 MySQL 第一次测试需要先初始化数据库和表：

```bash
cd games/ks699465320497476962/server
DDZ_MYSQL_HOST=127.0.0.1 DDZ_MYSQL_PORT=3306 DDZ_MYSQL_USER=root DDZ_MYSQL_PASSWORD= DDZ_MYSQL_DATABASE=ddz npm run db:init:mysql
```

初始化完成后启动服务：

```bash
cd games/ks699465320497476962
DDZ_MYSQL_HOST=127.0.0.1 DDZ_MYSQL_PORT=3306 DDZ_MYSQL_USER=root DDZ_MYSQL_PASSWORD= DDZ_MYSQL_DATABASE=ddz DDZ_MYSQL_CONNECTION_LIMIT=10 ./scripts/start-dev.sh
```

正式环境应由 DBA 或发布流程先执行建表/迁移 SQL，然后应用启动只做 schema 校验。缺表或缺列时必须启动失败，不允许自动降级到本地文件库。启动示例：

```bash
cd games/ks699465320497476962/server
DDZ_MYSQL_HOST=<正式DB地址> DDZ_MYSQL_PORT=3306 DDZ_MYSQL_USER=<正式专用账号> DDZ_MYSQL_PASSWORD=<通过环境变量或密钥系统注入> DDZ_MYSQL_DATABASE=<正式库名> DDZ_MYSQL_CONNECTION_LIMIT=20 DDZ_MYSQL_CONNECT_TIMEOUT_MS=5000 DDZ_MYSQL_SSL=true npm start
```

环境变量说明：

| 变量 | 默认值 | 说明 |
|---|---|---|
| `DDZ_MYSQL_HOST` | `127.0.0.1` | MySQL 主机 |
| `DDZ_MYSQL_PORT` | `3306` | MySQL 端口 |
| `DDZ_MYSQL_USER` | `root` | MySQL 用户名 |
| `DDZ_MYSQL_PASSWORD` | 空 | MySQL 密码，正式环境必须通过安全方式注入 |
| `DDZ_MYSQL_DATABASE` | `ddz` | MySQL 数据库名 |
| `DDZ_MYSQL_CONNECTION_LIMIT` | `10` | 单服务进程连接池大小 |
| `DDZ_MYSQL_QUEUE_LIMIT` | `0` | 连接池排队上限，`0` 表示不限制 |
| `DDZ_MYSQL_CONNECT_TIMEOUT_MS` | `5000` | MySQL 连接超时时间 |
| `DDZ_MYSQL_SSL` | 空 | 设置为 `true` 时启用 SSL 连接 |

禁止再使用的历史配置：

| 配置 / 语法 | 约束 |
|---|---|
| `DDZ_DB_DIALECT` | 不再作为运行时切换开关；设置为 `sqlite` 必须被启动脚本拒绝 |
| `DDZ_DB_PATH` | 禁止使用，本项目不再创建或读取本地 `.db` / `.sqlite` 文件 |
| `ON CONFLICT` / `INSERT OR IGNORE` / `PRAGMA` | SQLite-only 语法，禁止进入服务端运行时代码 |
| SQLite migration / SQLite 测试 | 已废弃；新增 schema 必须以 MySQL DDL 和 MySQL 集成测试验证 |

正式环境建议不要使用 root 账号，应创建最小权限应用账号：

```sql
CREATE USER 'ddz_app'@'%' IDENTIFIED BY '<强密码>';
GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, INDEX, ALTER
ON ddz.* TO 'ddz_app'@'%';
FLUSH PRIVILEGES;
```

如果正式环境由 DBA 统一建表，可以去掉应用账号的 `CREATE` / `ALTER` 权限，只保留运行期需要的 `SELECT` / `INSERT` / `UPDATE` / `DELETE`。

#### 6.3.2 MySQL 建库建表 SQL

本地测试可直接执行脚本初始化；正式环境建议由 DBA 或发布流程手动执行以下 SQL。应用启动时不会自动建表，只会检查核心表是否存在。

```sql
CREATE DATABASE IF NOT EXISTS ddz
  DEFAULT CHARACTER SET utf8mb4
  DEFAULT COLLATE utf8mb4_unicode_ci;

USE ddz;

-- 账号表：身份归属与风控画像，与 wallets 一对一。
-- 拆表原因：wallets 只管钱，accounts 只管身份；
-- 混表会让每次结算都写一堆无关列，也不利于按身份维度做风控查询。
CREATE TABLE IF NOT EXISTS accounts (
  account_id VARCHAR(128) PRIMARY KEY,
  login_type VARCHAR(32) NOT NULL DEFAULT 'guest',
  -- openId 的 HMAC 摘要，不存明文
  kwai_open_id_hash VARCHAR(128) NOT NULL DEFAULT '',
  device_id VARCHAR(128) NOT NULL DEFAULT '',
  -- 注册来源取证，不被后续登录覆盖
  first_ip VARCHAR(64) NOT NULL DEFAULT '',
  last_ip VARCHAR(64) NOT NULL DEFAULT '',
  login_count BIGINT NOT NULL DEFAULT 0,
  banned TINYINT NOT NULL DEFAULT 0,
  ban_reason VARCHAR(255) NOT NULL DEFAULT '',
  created_at BIGINT NOT NULL,
  last_login_at BIGINT NOT NULL DEFAULT 0,
  INDEX idx_accounts_device (device_id),
  INDEX idx_accounts_openid (kwai_open_id_hash)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS wallets (
  account_id VARCHAR(128) PRIMARY KEY,
  beans BIGINT NOT NULL,
  frozen_beans BIGINT NOT NULL DEFAULT 0,
  total_earned BIGINT NOT NULL DEFAULT 0,
  total_spent BIGINT NOT NULL DEFAULT 0,
  total_won BIGINT NOT NULL DEFAULT 0,
  total_lost BIGINT NOT NULL DEFAULT 0,
  daily_login_date VARCHAR(16) NOT NULL DEFAULT '',
  share_reward_date VARCHAR(16) NOT NULL DEFAULT '',
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL,
  version BIGINT NOT NULL DEFAULT 1,
  CHECK (beans >= 0),
  CHECK (frozen_beans >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS wallet_ledger (
  tx_id VARCHAR(128) PRIMARY KEY,
  account_id VARCHAR(128) NOT NULL,
  type VARCHAR(64) NOT NULL,
  amount BIGINT NOT NULL,
  balance_before BIGINT NOT NULL,
  balance_after BIGINT NOT NULL,
  room_id VARCHAR(64),
  round_no INT,
  match_id VARCHAR(160),
  idempotency_key VARCHAR(255) NOT NULL UNIQUE,
  meta_json TEXT NOT NULL,
  created_at BIGINT NOT NULL,
  INDEX idx_wallet_ledger_account_created (account_id, created_at),
  INDEX idx_wallet_ledger_match (match_id),
  CONSTRAINT fk_wallet_ledger_account
    FOREIGN KEY (account_id) REFERENCES wallets(account_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS reward_claims (
  account_id VARCHAR(128) NOT NULL,
  reward_type VARCHAR(64) NOT NULL,
  claim_date VARCHAR(32) NOT NULL,
  claim_count INT NOT NULL DEFAULT 0,
  total_amount BIGINT NOT NULL DEFAULT 0,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL,
  PRIMARY KEY (account_id, reward_type, claim_date),
  INDEX idx_reward_claims_type_date (reward_type, claim_date),
  CONSTRAINT fk_reward_claims_account
    FOREIGN KEY (account_id) REFERENCES wallets(account_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS game_matches (
  match_id VARCHAR(160) PRIMARY KEY,
  room_id VARCHAR(64) NOT NULL,
  round_no INT NOT NULL,
  status VARCHAR(32) NOT NULL,
  player_ids_json TEXT NOT NULL,
  account_ids_json TEXT NOT NULL,
  dealer_player_id VARCHAR(128),
  winner_team VARCHAR(32),
  winner_ids_json TEXT NOT NULL,
  base_bet BIGINT NOT NULL DEFAULT 0,
  bid_score INT NOT NULL DEFAULT 0,
  multiplier INT NOT NULL DEFAULT 1,
  spring TINYINT NOT NULL DEFAULT 0,
  requested_deltas_json TEXT NOT NULL,
  deltas_json TEXT NOT NULL,
  balances_json TEXT NOT NULL,
  started_at BIGINT NOT NULL,
  settled_at BIGINT,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL,
  UNIQUE KEY uniq_room_round (room_id, round_no),
  INDEX idx_game_matches_room_round (room_id, round_no),
  INDEX idx_game_matches_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS game_match_events (
  event_id VARCHAR(200) PRIMARY KEY,
  match_id VARCHAR(160),
  room_id VARCHAR(64) NOT NULL,
  round_no INT NOT NULL,
  seq INT NOT NULL,
  event_type VARCHAR(64) NOT NULL,
  actor_player_id VARCHAR(128),
  actor_account_id VARCHAR(128),
  payload_json TEXT NOT NULL,
  created_at BIGINT NOT NULL,
  UNIQUE KEY uniq_match_seq (match_id, seq),
  INDEX idx_game_match_events_match_seq (match_id, seq),
  INDEX idx_game_match_events_room_round (room_id, round_no)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

建表后可用以下 SQL 快速确认表已创建：

```sql
SHOW TABLES;
SHOW CREATE TABLE wallets;
SHOW CREATE TABLE wallet_ledger;
```

钱包资金链路依赖 `wallet_ledger.idempotency_key` 唯一约束做重复请求保护；正式部署时不要删除该唯一约束。

#### 6.3.3 生产环境变更流程（DBA）

**应用启动时不会自动建表**，只校验核心表是否存在（缺表则拒绝启动）。
因此正式环境的所有 schema 变更都必须走 DBA 流程：

1. 提交本节的 DDL 给 DBA 执行（本地/测试环境可用 `npm run db:init:mysql` 自动完成）；
2. 执行后用 `SHOW TABLES` 核对，必须包含全部 6 张核心表：
   `accounts`、`wallets`、`wallet_ledger`、`reward_claims`、`game_matches`、`game_match_events`；
3. 再启动应用。缺表时的报错信息会直接指出缺哪张。

新增表时**务必同步** `persistence/db.js` 里的 `REQUIRED_MYSQL_TABLES` 数组。
该数组既用于建表也用于启动校验，漏改会导致新表不被创建或不被检查。

#### 6.3.4 作废历史遗留身份（`guest_h5_*`）

早期客户端在 `localStorage` 里自行生成 `guest_h5_` + 时间戳作为 `accountId`，
旧服务端直接采信。这批数据**不做迁移，整体作废**，原因：

- 任何人改一行 `localStorage` 即可取得这些身份，余额归属本身不可信；
- 新身份为 `HMAC(服务端密钥, deviceId)`，与旧值无任何对应关系。想迁移就必须凭
  「某个 localStorage 值曾出现过」认定所有权，而这正是本次安全改造要消灭的前提。

清理脚本（默认 dry-run，不加 `--confirm` 不改数据）：

```bash
cd server
node scripts/purge-legacy-guests.js            # 预演，只统计
node scripts/purge-legacy-guests.js --confirm  # 真正执行
```

脚本在单事务内按外键依赖顺序删除，避免出现「钱包已删但流水残留」的孤儿数据，
且可重复执行（幂等）。**生产环境请勿直接运行**，改由 DBA 执行等价 SQL：

```sql
-- 注意：LIKE 中的 `_` 是单字符通配符，必须转义
START TRANSACTION;
DELETE FROM game_match_events WHERE actor_account_id LIKE 'guest\_h5\_%';
DELETE FROM game_matches      WHERE account_ids_json LIKE '%guest_h5_%';
DELETE FROM reward_claims     WHERE account_id LIKE 'guest\_h5\_%';
DELETE FROM wallet_ledger     WHERE account_id LIKE 'guest\_h5\_%';
DELETE FROM accounts          WHERE account_id LIKE 'guest\_h5\_%';
DELETE FROM wallets           WHERE account_id LIKE 'guest\_h5\_%';
COMMIT;
```

执行前先 `mysqldump` 备份；执行后核对孤儿数据应为 0：

```sql
SELECT COUNT(*) FROM wallet_ledger l
  LEFT JOIN wallets w ON l.account_id = w.account_id
 WHERE w.account_id IS NULL;
```

#### 6.3.5 幂等写入的并发正确性

钱包所有写入（扣款/冻结/解冻/消费冻结）都经由 `wallet-store.js` 的
`idempotentWrite()` 包装器，**不得**再写「先 SELECT 查幂等键、再 INSERT」的逻辑。

原因：那是 check-then-act 竞态。两个并发事务同时查到「不存在」，双双 INSERT，
后者撞 `wallet_ledger.idempotency_key` 唯一约束抛异常。真实触发场景是
三名玩家同时开局各自触发房间冻结。

正确做法是**把唯一索引当作唯一真相来源**：

1. 乐观预检一次（绝大多数重复请求在此命中，省掉注定失败的写入）；
2. 直接写，捕获唯一冲突；
3. 冲突意味着别人已写成功 —— 在**新事务**里读回那笔流水，按幂等命中返回。

第 3 步必须在事务**外**：冲突已让原事务回滚，在其内部既读不到已提交数据，
连接状态也可能已失效。

若冲突后仍查不到对应流水，说明撞的是别的唯一索引（如 `tx_id`），
此时抛 `idempotent_conflict_unresolved` —— 这类问题不能静默吞掉。

回归测试：`test/idempotency-concurrency.test.js`。
**该用例必须跑在 MySQL 上**：只有 MySQL 连接池才能覆盖真实并发、行锁和唯一键冲突路径。无 MySQL 时用例整体跳过，禁止用本地文件库伪造通过。

### 6.4 流水模型

服务端维护持久化流水：

```text
wallet_ledger
```

每条流水包含：

- `tx_id`：流水 ID；
- `account_id`：用户账号；
- `type`：流水类型；
- `amount`：实际变动金额；
- `balance_before` / `balance_after`：变动前后余额；
- `room_id` / `round_no` / `match_id`：关联对局；
- `idempotency_key`：幂等键，防止重复发奖或重复结算；
- `meta_json`：扩展信息；
- `created_at`：创建时间。

钱包余额更新和流水插入在同一 MySQL / InnoDB 事务内执行，并使用行锁确保余额与流水一致。

### 6.6 房间分档与开局门票

当前已支持四类场次：

| 场次 | 入口 | 匹配队列 | 门票 | 冻结 | 准备/开局门槛 | 底注 |
|---|---|---|---:|---:|---:|---:|
| 经典场 | 快速开始按钮 | `classic` | 0 | 0 | 100 | 10 |
| 初级房 | 初级房卡片 | `junior` | 150 | 800（预留，不生效） | 300 | 10 |
| 中级房 | 中级房卡片 | `mid` | 400 | 200（预留，不生效） | 800 | 30 |
| 高级房 | 高级房卡片 | `senior` | 9000 | 4000（预留，不生效） | 12000 | 200 |

匹配隔离规则：不同 `roomType` 使用不同内存队列，只匹配同一场次玩家。快速开始固定进入 `classic`，不跟随房间卡片选中状态。

门票扣除规则：玩家进入房间时不扣门票；当 3 名玩家都准备且即将开局时，服务端先统一检查未支付门票玩家的余额，全部满足后再写入 `room_entry_fee` 钱包流水并开局。同一个房间实例内同账号只扣一次门票，后续下一局不重复扣。


当前已使用的流水类型：

| 类型 | 说明 |
|---|---|
| `new_user_grant` | 新用户初始发放 |
| `daily_login` | 每日登录奖励，进入大厅同步钱包时触发 |
| `share_reward` | 每日首次分享奖励 |
| `ad_reward` | 激励广告补豆奖励 |
| `shortcut_reward` | 每日首次加桌奖励 |
| `exit_penalty` | 对局中退出/断线超时惩罚 |
| `game_win` | 对局赢得铁豆 |
| `game_lose` | 对局输掉铁豆 |

### 6.5 玩家身份与登录认证

**核心原则：身份完全由服务端决定，客户端不得自报 `accountId`。**

#### 认证模式（`DDZ_AUTH_MODE`）

| 模式 | 适用场景 | 快手登录 | 游客登录 |
| --- | --- | --- | --- |
| `strict` | 正式环境 | 必须 | 拒绝 |
| `mixed` | 预发 / 灰度 | 优先 | 未配置凭证时降级 |
| `dev` | 本地 H5 / 自动化测试 | 可选 | 允许 |

未配置时**默认 `strict`**：漏配环境变量的后果应是「登不进去」，而不是「游客随便进」。
`strict` 模式下若缺少 `DDZ_AUTH_SECRET` 会直接拒绝启动，避免用随机密钥上线导致重启即全员掉线。

#### 握手流程

```text
客户端连接
  └─ 发送 { type: 'auth', sessionToken? , code? , deviceId }
       ├─ sessionToken 有效        → 复用身份（strict 下游客 token 仍拒绝）
       ├─ code + 已配置快手凭证    → code2session 换 openId
       │                              accountId = 'ks_' + HMAC(密钥, 'kwai:'+appId+':'+openId)
       ├─ code + 未配置凭证        → strict 拒绝；dev/mixed 降级游客
       └─ 仅 deviceId              → accountId = 'guest_' + HMAC(密钥, 'guest:'+deviceId)
  ← authOk { accountId, loginType, sessionToken, authMode }
  └─ 认证完成后才允许发送业务消息
```

认证失败或未认证即发业务消息 → 回 `error` / `authFail` 并以 `close(1008)` 断连。

#### 关键安全约束

1. **`accountId` 由 HMAC 派生**。客户端即使知道他人 `deviceId`，不知服务端密钥也算不出 `accountId`。
2. **`openId` 不落库、不入日志**。它只是 HMAC 的输入，日志中一律用 `maskId` 打码。
3. **`validateMessage` 强制删除**消息体中的 `accountId` / `openId` / `guestId` 字段。
4. **无效 `code` 绝不降级游客**。只有「未配置凭证」才降级，否则发个垃圾 code 就能绕过快手登录。
5. **新账号按 IP 限流**（默认 20 个/小时）。每个新账号发 20000 新手铁豆，不限流等于开放提款机。

#### 游客能力边界

新手铁豆与快手账号一致（20000），但游客**仅可进入初级场**。
游客身份可通过换设备低成本再生，若允许进高倍率场次会成为洗豆通道。
`wallet` 回包会带上 `accountType` 与 `guestAllowedRoomTypes`，供客户端提前置灰入口。

#### 连接层防护

| 措施 | 配置 | 说明 |
| --- | --- | --- |
| 单帧上限 | `maxPayload: 64KB` | 本游戏最大消息就是一手牌，不设限则一条超大帧可打爆内存 |

WebSocket 建连后必须先完成服务端 `auth` 握手；未认证连接不能操作账号、钱包或牌局。

#### `accounts` 表（身份与风控）

与 `wallets` 一对一，但**刻意拆表**：`wallets` 只管钱，`accounts` 只管身份。
混在一张表里会让每次结算都带上一堆无关列，也不利于按身份维度做风控查询。

| 字段 | 用途 |
| --- | --- |
| `login_type` | `kwai` / `guest` |
| `kwai_open_id_hash` | openId 的 HMAC 摘要，**不存明文**，库被拖走也无法还原平台身份 |
| `device_id` | 首次注册设备，识别同设备多号 |
| `first_ip` | 注册来源取证，**不被后续登录覆盖**，否则批量注册的溯源线索会断 |
| `last_ip` / `login_count` / `last_login_at` | 登录行为画像 |
| `banned` / `ban_reason` | 封禁，在 `authenticated` 置位**之前**校验 |

封禁校验与画像落库都做了容错：DB 抖动时按「未封禁」放行并打警告。
因一次查询失败让全量用户登不进去，代价远大于漏放少数封禁号；
真正的资金安全由 `wallets` 表与事务保证。

#### 历史漏洞（已修复，勿回退）

- 旧 `accountIdFromData` 在缺省时用 `connId` 造出 `guest_unknown_xxx`，
  **每建一次连接就诞生一个新账号并白送新手铁豆**，等于无限刷号水龙头。
- 旧实现直接采信客户端自报的 `accountId`，且 `guest_h5_` 前缀可枚举，
  改一行 localStorage 即可接管他人钱包。
- 旧 `kwai-login.js` 拿到 `code` 后直接 `onSuccess('')` 丢弃，快手登录形同虚设。

## 7. 对局结算规则

### 7.1 基础公式

当前对局结算使用：

```text
unit = baseBet × multiplier
```

其中：

- `baseBet = 10`；
- 叫地主分数进入初始 `multiplier`；
- 炸弹 / 火箭会翻倍；
- 春天 / 反春会翻倍；
- 最终倍数不超过 `maxMultiplier = 8`。

### 7.2 地主胜利

```text
地主 +2 × unit
农民 A -1 × unit
农民 B -1 × unit
```

### 7.3 农民胜利

```text
地主 -2 × unit
农民 A +1 × unit
农民 B +1 × unit
```

### 7.4 余额不足保护

铁豆不能为负数。

如果输家余额不足：

```text
实际扣除 = min(应扣除, 当前余额)
```

赢家实际获得：

```text
赢家获得 = 所有输家实际扣除总额
```

这样不会凭空增发铁豆。

### 7.5 结算结果字段

服务端 `result` 中包含：

- `winnerTeam`；
- `winnerIds`；
- `baseBet`；
- `bidScore`；
- `unit`；
- `requestedDeltas`：理论输赢；
- `deltas`：实际铁豆变化；
- `balances`：结算后余额；
- `spring`；
- `multiplier`；
- `currencyName`。

客户端结算页展示 `deltas`，即实际铁豆变化。

## 8. 对局记录与事件审计

### 8.1 对局主记录

每局开始时服务端会生成 `match_id`，并写入 `game_matches`：

- `match_id`；
- `room_id`；
- `round_no`；
- `status`：`started` / `settled`；
- 三名玩家的 `player_id` 和 `account_id`；
- 结算后的地主、赢家、底注、叫分、倍数、春天/反春、理论输赢、实际输赢和结算后余额。

### 8.2 对局事件

服务端会向 `game_match_events` 追加关键事件：

- `join`：加入房间；
- `ready`：准备/取消准备；
- `deal`：发牌和底牌；
- `bid`：叫地主；
- `landlord_assigned`：地主确定；
- `play_cards`：出牌；
- `pass`：过牌；
- `managed`：进入托管；
- `disconnect` / `reconnect` / `unmanaged`：断线、重连、退出托管；
- `leave`：离房；
- `settlement`：结算。

这些数据用于后续用户申诉、Bug 复盘、对局回放和风控分析。

## 9. 客户端展示规则

### 8.1 大厅

大厅顶部展示：

```text
🫘 铁豆 1000
```

展示数据来自：

```js
M3.Game.getWallet().beans
```

不是本地 `localStorage.ddz_beans`。登录或缓存恢复后，客户端会先向服务端发送 `getWallet`，新用户在服务端创建钱包并获得 `1000` 铁豆后再进入大厅；如果真实余额为 `0`，大厅就展示 `0`。

### 8.2 房间页

玩家卡片展示：

```text
1200铁豆
```

### 8.3 对局页

玩家面板展示：

```text
地主 · 1200铁豆
农民 · 980铁豆
```

### 8.4 结算页

结算页展示实际变化：

```text
你 +20铁豆
张三 -10铁豆
李四 -10铁豆
```

## 9. 当前未实现 / 后续规划

### 9.1 未实现内容

一期暂未实现：

- 多场次；
- 台费；
- 真实广告完成凭证服务端校验；
- 胜利翻倍广告；
- 破产救济；
- 排行榜；
- 多实例集中式数据库和跨进程房间恢复。

### 9.2 任务奖励现状

大厅任务 UI 已更新为铁豆文案：

- 分享：`+300铁豆`；
- 加桌：`+500铁豆`；
- 看广告得铁豆：`+50铁豆`，每日最多 `5` 次。

当前已接入服务端权威奖励协议：

```text
getWallet             // 同步钱包，并在每日首次进入大厅时领取 daily_login
claimShareReward      // 每日首次分享奖励
claimAdReward         // 激励广告完成后的补豆奖励
claimShortcutReward   // 每日首次加桌奖励
```

客户端只负责触发平台能力和发送领取请求；铁豆余额、是否领取成功、领取次数限制均以服务端 `wallet` 回包为准，本地任务完成状态在服务端确认后再落地。

### 9.3 推荐后续阶段

建议后续按以下顺序推进：

1. 真实广告完成凭证校验和奖励风控；
2. 破产救济；
3. 胜利翻倍广告；
4. 台费和排行榜；
5. 多实例集中式数据库迁移。

## 10. 验收清单

### 10.1 联机与倒计时

- [ ] 三人加入房间后可以准备并开始叫地主；
- [ ] 叫地主阶段 15s 未操作会自动不叫；
- [ ] 三人都不叫时不重发，按上局赢家/起叫玩家规则强制地主；
- [ ] 出牌阶段 30s 未操作会自动处理；
- [ ] 可不出时超时自动不出；
- [ ] 新一轮必须出牌时超时自动出最小单张；
- [ ] 没有孤张时出最小单张；
- [ ] 对局中主动退出扣 50 铁豆并进入托管，游戏继续；
- [ ] 对局中断线 60 秒未重连扣 50 铁豆并进入托管；
- [ ] 当前行动玩家有明显倒计时提示；
- [ ] 5s 内倒计时红色闪烁。

### 10.2 铁豆体系

- [ ] 新用户首次进入大厅前由服务端创建钱包并发放 1000 铁豆；
- [ ] 真实余额为 0 时大厅展示 0；
- [ ] 铁豆为 0 时禁止创建/加入/随机匹配，并引导分享赚铁豆；
- [ ] 每日首次进入大厅同步钱包时可获得 200 铁豆；
- [ ] 每日首次分享可获得 300 铁豆；
- [ ] 看完激励广告后可获得 50 铁豆，每日最多 5 次；
- [ ] 每日首次加桌可获得 500 铁豆；
- [ ] 大厅展示铁豆余额；
- [ ] 房间页展示玩家铁豆；
- [ ] 对局页展示玩家铁豆；
- [ ] 低于 100 铁豆时不能准备；
- [ ] 地主胜利时地主增加铁豆、农民扣除铁豆；
- [ ] 农民胜利时农民增加铁豆、地主扣除铁豆；
- [ ] 余额不足时最多扣到 0；
- [ ] 赢家获得不超过输家实际扣除总额；
- [ ] 结算页展示实际铁豆变化。

### 10.3 持久化与对局审计

- [ ] 先执行 `npm run db:init:mysql` 可创建 `ddz` 数据库和核心表；
- [ ] 服务启动不会自动建表，缺表时会启动失败并提示先执行初始化脚本；
- [ ] 设置 `DDZ_DB_DIALECT=sqlite` 或依赖 `DDZ_DB_PATH` 不会被接受；
- [ ] 新用户钱包会写入 `wallets`，新用户发放会写入 `wallet_ledger`；
- [ ] 服务重启后同一 `accountId` 的铁豆余额不丢失；
- [ ] 每日登录、分享、广告补豆、加桌奖励重复领取不会超过服务端限制；
- [ ] 对局退出惩罚会写入带 `match_id` 的流水；
- [ ] 对局结算时所有玩家的输赢流水和钱包余额同时落库；
- [ ] 每局开始会写入 `game_matches`；
- [ ] 叫地主、出牌、过牌、托管、断线、重连和结算会写入 `game_match_events`；
- [ ] 运行时代码和测试不得新增 SQLite-only 语法；MySQL schema 变更需先沉淀 SQL/脚本再部署。

### 10.4 协议安全与限流

- [ ] 非 JSON 消息不会导致服务端异常退出，并会返回错误；
- [ ] 超过 `4096` 字节的 WebSocket 消息会被拒绝并断开连接；
- [ ] 未知 `type` 协议不会进入业务逻辑；
- [ ] `join.roomId` 非 6 位数字会被拒绝；
- [ ] `bid.score` 非 `0-3` 整数会被拒绝；
- [ ] `setReady.ready` 非布尔值会被拒绝；
- [ ] `playCards.cardIds` 会去重、限制数量并过滤非法字符；
- [ ] 高频 `createRoom` / `quickMatch` / `claimShareReward` / `claimAdReward` / `claimShortcutReward` 会触发限流；
- [ ] 单连接 `10s` 内超过 `80` 条消息会被断开；
- [ ] 单连接累计违规达到 `5` 次会被断开。

### 10.5 本地调试

- [ ] `node index.js` 启动 WebSocket 服务端，监听 `8080`；
- [ ] H5 静态服务可以打开 `index.html`；
- [ ] 客户端能连接 `ws://localhost:8080`；
- [ ] 本地浏览器多开页面可以完成一局联机流程。
