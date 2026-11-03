# 斗地主客户端接口文档

> 文档状态：当前实现
> 更新时间：2026-09-09
> 适用范围：快手小游戏客户端、H5 调试客户端、Node.js 斗地主服务
> 实现基准：`server/index.js`、`server/http-server.js`、`server/payment/http-api.js`

## 1. 接入总览

### 1.1 通道划分

| 通道 | 用途 | 鉴权 |
|---|---|---|
| WebSocket | 登录、钱包、匹配、房间、叫抢、加倍、出牌、提示、语音和权益 | 建连后发送 `auth` 帧 |
| HTTP | 健康检查、充值、平台币余额、平台币兑换、支付回调 | 客户端支付 API 使用 Bearer Token；健康检查和平台回调例外 |
| DouZero Sidecar HTTP | 仅供 Node.js 服务端做机器人或提示决策 | Compose 内网，不对客户端开放 |

WebSocket 和 HTTP 共用一个 Node.js 监听端口，默认是 `8080`。客户端地址由运行环境配置提供；本文不固化域名。生产环境应使用 `wss://` 和 `https://`。

支付业务的当前正式通道是 HTTP。服务端仍保留 9 类 WebSocket 支付消息用于迁移期兼容，但新客户端不应接入这些消息，详见 `docs/iap-client-call-flow-and-api.md`。

### 1.2 权威边界

- 服务端权威维护身份、房间、手牌、规则、计时、铁豆钱包和结算。
- 客户端不得提交或覆盖 `accountId`、`openId`、`guestId`；这些字段即使出现在 WebSocket 消息中也会被服务端删除。
- 客户端只持有自己的 `hand`；其他玩家只通过 `handCounts` 获取剩余张数。
- 服务器时间均为 Unix 毫秒时间戳。倒计时应使用 `actionDeadlineAt - (Date.now() + serverOffset)`。
- 数字型铁豆字段当前为 JavaScript 安全整数；支付文档中的钻石、金额字段按十进制字符串处理。

### 1.3 房间和对局阶段

```text
waiting → ready → bidding → doubling → playing → settlement
                         └──────────────────────────────→ 下一局 ready
```

| 阶段 | 说明 | 可用主要命令 |
|---|---|---|
| `waiting` | 等待三名玩家 | `leaveRoom` |
| `ready` | 等待所有玩家准备 | `setReady`、`leaveRoom` |
| `bidding` | 叫地主、抢地主 | `bid`、`leaveRoom` |
| `doubling` | 地主选择不加倍、加倍或超级加倍 | `double`、`leaveRoom` |
| `playing` | 正式出牌 | `playCards`、`pass`、`hint`、`syncHand`、`voiceMsg`、`leaveRoom` |
| `settlement` | 本局结算，准备下一局 | `setReady`、`leaveRoom` |

### 1.4 场次枚举

| `roomType` | 名称 | 匹配/准备门槛 | 底分 | 最大倍率 | 抽水 | 游客 |
|---|---:|---:|---:|---:|---:|---|
| `junior` | 初级场 | 5,000 铁豆 | 100 | 64 | 3% | 允许 |
| `mid` | 中级场 | 40,000 铁豆 | 800 | 128 | 4% | 禁止 |
| `master` | 大师场 | 320,000 铁豆 | 6,400 | 256 | 5% | 禁止 |

兼容别名：`classic` 会归一化为 `junior`，`senior` 会归一化为 `master`。场次参数最终以服务端 `state.tierConfig` 为准。

## 2. WebSocket 通用协议

### 2.1 建连

服务端不限定 WebSocket path。升级请求须满足：

- 服务已通过 readiness；否则握手返回 HTTP `503`。
- WebSocket 帧上限为 64 KiB；业务层消息上限为 4,096 字节。

客户端发送帧：

```json
{
  "type": "quickMatch",
  "nickname": "玩家A",
  "roomType": "junior"
}
```

服务端发送帧：

```json
{
  "type": "matchWaiting",
  "data": {
    "matchRequestId": "...",
    "queueLength": 1,
    "roomType": "junior",
    "roomName": "初级场",
    "status": "queued"
  }
}
```

协议约定：

- 客户端命令字段与 `type` 同级，不使用 `data` 包裹。
- 服务端事件统一为 `{ "type": string, "data": object }`。
- 单连接消息按到达顺序串行执行。
- 除 `auth`、`ping` 外，所有消息都必须在收到 `authOk` 后发送。
- 消息对象最多 16 个顶层字段；字符串超长时可能被截断或拒绝。

### 2.2 心跳

```json
{ "type": "ping" }
```

响应：

```json
{ "type": "pong", "data": {} }
```

当前客户端每 30 秒发送一次 `ping`，10 秒内未收到 `pong` 则触发重连。

### 2.3 通用错误事件

```json
{
  "type": "error",
  "data": {
    "code": "INSUFFICIENT_MATCH_BEANS",
    "message": "初级场至少需要 5000 铁豆才能匹配",
    "commandType": "quickMatch",
    "requiredBeans": 5000,
    "currentBeans": 1200
  }
}
```

只有部分错误带稳定 `code`。客户端必须优先按 `code` 分支，缺少 `code` 时将 `message` 作为用户提示，不应解析中文文案执行业务逻辑。支付兼容消息的错误还会带 `correlationId`。

## 3. 登录、钱包与用户能力

### 3.1 认证 `auth`

客户端三种认证意图：

```json
{ "type": "auth", "intent": "kwai_login", "code": "ks.login 返回的 code", "deviceId": "d_xxx", "capabilities": ["voice_config_v2", "voice_trade_v1"] }
```

```json
{ "type": "auth", "intent": "resume", "sessionToken": "<token>", "deviceId": "d_xxx", "capabilities": ["voice_config_v2", "voice_trade_v1"] }
```

```json
{ "type": "auth", "intent": "guest", "deviceId": "d_xxx", "sessionToken": "<可选游客 token>", "capabilities": ["voice_config_v2", "voice_trade_v1"] }
```

| 字段 | 类型 | 必填 | 约束 |
|---|---|---:|---|
| `intent` | string | 建议 | `kwai_login`、`resume`、`guest`；旧客户端缺失时服务端推断 |
| `code` | string | 条件 | `kwai_login` 必填，最长 256 |
| `sessionToken` | string | 条件 | `resume` 必填，最长 512 |
| `deviceId` | string | 条件 | 新游客必填，安全字符，最长 64 |
| `capabilities` | string[] | 否 | 最多 16 项；当前支持 `voice_config_v2`、`voice_trade_v1` |

成功事件 `authOk`：

```json
{
  "type": "authOk",
  "data": {
    "accountId": "ks_xxx",
    "loginType": "kwai",
    "sessionToken": "<token>",
    "authMode": "strict",
    "guestAllowed": false,
    "enabledCapabilities": ["voice_config_v2", "voice_trade_v1"],
    "expiresIn": 604800000,
    "resumeRoomId": "123456",
    "resumeRoomType": "junior",
    "shortcutRewardBeans": 5000
  }
}
```

`sessionToken` 只在首次认证或续签时保证存在。若 `resumeRoomId` 非空，客户端应重新发送 `join` 恢复正在进行的牌局。

失败事件：

```json
{ "type": "authFail", "data": { "code": "INVALID_SESSION_TOKEN", "message": "登录态已失效，请重新登录" } }
```

认证失败后服务端使用 WebSocket close code `1008` 关闭连接。常见认证错误：`GUEST_LOGIN_FORBIDDEN`、`INVALID_SESSION_TOKEN`、`INVALID_KWAI_CODE`、`MISSING_CREDENTIAL`、`KWAI_LOGIN_NOT_CONFIGURED`、`NEW_ACCOUNT_THROTTLED`、`ACCOUNT_BANNED`、`IDENTITY_PERSIST_FAILED`。

### 3.2 钱包 `getWallet`

请求：

```json
{ "type": "getWallet", "nickname": "玩家A" }
```

响应事件 `wallet`：

```json
{
  "type": "wallet",
  "data": {
    "wallet": {
      "accountId": "ks_xxx",
      "beans": 21000,
      "frozenBeans": 0,
      "availableBeans": 21000,
      "totalEarned": 21000,
      "totalSpent": 0,
      "totalWon": 0,
      "totalLost": 0,
      "version": 2
    },
    "accountType": "kwai",
    "guestAllowedRoomTypes": ["junior"],
    "economy": { "version": "v2.1-mvp", "currencyName": "铁豆", "roomTiers": {} },
    "walletSource": "server",
    "economyVersion": "v2.1-mvp",
    "serverNow": 1788940000000,
    "rewardType": "daily_login",
    "claimed": true,
    "amount": 1000
  }
}
```

首次查询会创建钱包，并幂等尝试发放每日登录奖励。`availableBeans = beans - frozenBeans`，客户端参与匹配和消费时优先展示并参考可用余额，但最终判定始终由服务端完成。

### 3.3 奖励和个人统计

| 客户端命令 | 请求字段 | 主要响应 |
|---|---|---|
| `claimShareReward` | 无业务必填字段 | `wallet`，并附 `rewardType=share_reward`；另发 `notice` |
| `getAdRewardStatus` | 无 | `adRewardStatus`：`claimCount`、`remaining`、`nextRewardAmount`、`dailyCapAmount`、`totalAmount` |
| `claimAdReward` | `adTransId`，建议使用广告平台交易 ID | `wallet`，并附 `rewardType=ad_reward` |
| `getNewcomerGiftStatus` | 无 | `newcomerGiftStatus`：`claimed`、`amount`、`claimCount` |
| `claimNewcomerGift` | 无 | `wallet`，并附 `rewardType=newcomer_gift` |
| `claimShortcutReward` | 无 | `wallet`，并附 `rewardType=shortcut_reward` |
| `claimBankruptReward` | 无 | `wallet`，并附 `rewardType=bankrupt_relief` |
| `getProfileStats` | 无 | `profileStats` |

`profileStats` 字段包括：`springCount`、`bombCount`、`maxMultiplier`、`totalGames`、`totalWins`、`winRate`、`maxStreak`、`totalBeansEarned`。奖励结果以 `wallet.claimed` 和 `wallet.amount` 为准，重复领取也会返回当前钱包快照。

## 4. 匹配与房间

### 4.1 快速匹配 `quickMatch`

```json
{ "type": "quickMatch", "nickname": "玩家A", "avatarUrl": "https://...", "roomType": "junior" }
```

响应可能为：

```json
{
  "type": "matchWaiting",
  "data": {
    "matchRequestId": "match_xxx",
    "queueLength": 1,
    "roomType": "junior",
    "roomName": "初级场",
    "status": "queued"
  }
}
```

```json
{
  "type": "matchFound",
  "data": {
    "roomId": "123456",
    "roomType": "junior",
    "roomName": "初级场",
    "entryFeeBeans": 0,
    "matchRequestId": "match_xxx",
    "joinTicket": "<一次性凭证>",
    "joinExpiresAt": 1788940060000
  }
}
```

收到 `matchFound` 后必须在有效期内发送 `join`，并原样携带 `matchRequestId` 和 `joinTicket`。快速匹配可能由真人和机器人共同组房，客户端协议不区分。

### 4.2 恢复和取消匹配

恢复请求：

```json
{ "type": "resumeMatch", "matchRequestId": "match_xxx" }
```

服务端返回 `matchWaiting`、重新签发的 `matchFound`，或：

```json
{ "type": "matchExpired", "data": { "matchRequestId": "match_xxx" } }
```

取消请求：

```json
{ "type": "cancelMatch", "matchRequestId": "match_xxx" }
```

取消成功当前无专用响应。客户端可立即结束本地匹配态；重复取消按无操作处理。

### 4.3 创建房间 `createRoom`

```json
{ "type": "createRoom", "nickname": "玩家A", "roomType": "junior" }
```

响应：

```json
{ "type": "roomCreated", "data": { "roomId": "123456", "roomType": "junior", "roomName": "初级场", "entryFeeBeans": 0 } }
```

`createRoom` 只创建房间，不自动入座；客户端随后仍需调用 `join`。

### 4.4 加入或恢复房间 `join`

手动房请求：

```json
{ "type": "join", "roomId": "123456", "nickname": "玩家A", "avatarUrl": "https://...", "roomType": "junior" }
```

匹配房请求额外携带：

```json
{ "type": "join", "roomId": "123456", "nickname": "玩家A", "roomType": "junior", "matchRequestId": "match_xxx", "joinTicket": "<一次性凭证>" }
```

成功响应：

```json
{
  "type": "joined",
  "data": {
    "playerId": "p_xxx",
    "seat": 0,
    "roomId": "123456",
    "roomType": "junior",
    "roomName": "初级场",
    "entryFeeBeans": 0,
    "wallet": {},
    "recoveredFromManaged": false
  }
}
```

随后服务端会发送 `state`；已发牌的恢复场景还会单独发送 `hand`。同账号在 `bidding`、`doubling`、`playing` 阶段存在断线或托管座位时，调用 `join` 会恢复原 `playerId`。

### 4.5 离开房间 `leaveRoom`

```json
{ "type": "leaveRoom" }
```

响应：

```json
{ "type": "leftRoom", "data": { "managed": true } }
```

- 等待、准备或结算阶段：立即移除座位，通常返回空对象。
- 叫抢、加倍或出牌阶段：本局座位转托管，账号立即解除占用，返回 `managed=true`。

### 4.6 房间常见错误

| 错误码 | 场景 |
|---|---|
| `GUEST_ROOM_FORBIDDEN` | 游客进入中级场或大师场 |
| `INSUFFICIENT_MATCH_BEANS` | 匹配余额不足 |
| `INSUFFICIENT_ENTRY_FEE` | 开局时余额不足 |
| `ALREADY_IN_ROOM` | 当前连接或账号已占用其他房间 |
| `MATCH_RESERVATION_REQUIRED` | 匹配房缺少有效预约 |
| `INVALID_JOIN_TICKET` | 入场凭证错误、过期或已使用 |

## 5. 对局操作

### 5.1 准备 `setReady`

```json
{ "type": "setReady", "ready": true }
```

仅在 `ready` 或 `settlement` 阶段生效。无独立确认事件，结果通过下一条 `state.players[playerId].ready` 返回。三人全部准备后服务端扣除对应门票并开局。

### 5.2 叫地主和抢地主 `bid`

```json
{ "type": "bid", "score": 1 }
```

| `score` | 含义 |
|---:|---|
| `0` | calling 阶段为“不叫”，robbing/final_confirm 阶段为“不抢” |
| `1` | calling 阶段为“叫地主”，后续阶段为“抢地主/继续抢” |

当前协议不是传统 `0/1/2/3` 叫分制。当前行动人由 `state.bidState.currentPlayerId` 确定；服务端通过 `notice.action=bidPlaced` 和 `state` 广播结果。

### 5.3 地主加倍 `double`

```json
{ "type": "double", "multiplier": 2 }
```

`multiplier` 仅允许 `1`（不加倍）、`2`（加倍）、`4`（超级加倍）。只有 `state.doublingPlayerId` 对应的地主可操作。结果通过 `notice.action=doubleApplied` 和 `state` 广播。

### 5.4 出牌 `playCards`

```json
{ "type": "playCards", "cardIds": ["spades-3", "hearts-3"] }
```

- `cardIds` 必须来自客户端最近一次 `hand.cards`。
- 最多接收 20 个 ID；重复、非法字符或超限项会被过滤。
- 过滤后为空将被拒绝。
- 服务端校验拥有关系、牌型、当前行动人以及能否压过上一手。
- 成功后给出牌者发送新的 `hand`，并向房间广播 `notice` 和 `state`。

### 5.5 不出 `pass`

```json
{ "type": "pass" }
```

只有存在其他玩家的有效上一手牌时才能不出；主动首出不能 `pass`。成功结果通过 `notice.action=playerPassed` 和 `state` 广播。

### 5.6 同步手牌 `syncHand`

```json
{ "type": "syncHand" }
```

响应：

```json
{ "type": "hand", "data": { "cards": [{ "id": "spades-3", "suit": "spades", "rank": 3, "label": "3" }] } }
```

仅返回当前玩家自己的权威手牌。

### 5.7 出牌提示 `hint`

```json
{ "type": "hint" }
```

响应：

```json
{ "type": "hintResult", "data": { "source": "douzero", "cardIds": ["spades-3"] } }
```

`source` 为 `douzero`、`rule` 或 `none`。非出牌阶段、未轮到自己或无可用提示时，`cardIds` 为空。提示只是候选，客户端仍须通过 `playCards` 提交，服务端再次校验。

### 5.8 牌对象

```json
{ "id": "hearts-14", "suit": "hearts", "rank": 14, "label": "A" }
```

| 字段 | 说明 |
|---|---|
| `id` | 普通牌为 `{suit}-{rank}`；小王 `joker-16`；大王 `joker-17` |
| `suit` | `spades`、`hearts`、`clubs`、`diamonds`、`joker` |
| `rank` | `3..15` 对应 `3..2`，`16` 小王，`17` 大王 |
| `label` | 展示值：`3..10`、`J`、`Q`、`K`、`A`、`2`、`小王`、`大王` |

## 6. 服务端推送与核心 DTO

### 6.1 事件清单

| 事件 | 触发时机 | 主要数据 |
|---|---|---|
| `authOk` / `authFail` | 认证完成 | 身份、token、恢复房间；或错误码 |
| `wallet` | 钱包查询、奖励、购买、结算 | 钱包快照、经济配置、奖励结果 |
| `matchWaiting` | 已进入或恢复匹配队列 | 匹配请求 ID、队列长度、状态 |
| `matchFound` | 已预留匹配房 | 房号、一次性入场凭证及过期时间 |
| `matchExpired` | 匹配记录不可恢复 | `matchRequestId` |
| `roomCreated` | 手动房创建成功 | 房号与场次 |
| `joined` / `leftRoom` | 入房或离房完成 | 玩家座位、钱包；或托管标记 |
| `state` | 房间权威状态发生变化 | `RoomState` |
| `hand` | 发牌、出牌成功、恢复、主动同步 | 当前玩家的完整手牌 |
| `hintResult` | 提示计算结束 | 来源和牌 ID |
| `notice` | 动画或行为通知 | `action`、`actorId`、`label` 等 |
| `adRewardStatus` | 广告奖励状态查询 | 今日次数和下一档奖励 |
| `newcomerGiftStatus` | 新手礼包状态查询 | 是否领取和金额 |
| `profileStats` | 个人统计查询 | 局数、胜率、炸弹、春天等 |
| `voiceConfig` | 认证、入房或主动查询 | 互动语音和语音包配置 |
| `entitlements` | 认证、入房、购买或主动查询 | 完整权益快照及递增 `seq` |
| `entitlementsUnavailable` | 权益加载失败或过频 | `seq`、`retryAfterMs` |
| `purchaseResult` | 铁豆 SKU 购买结束 | 请求 ID、购买状态、价格、错误码 |
| `voiceMsg` | 房内语音广播 | 发送者、语音 ID、文案、音频 URL |
| `error` | 请求被拒绝 | 错误码、文案和可选上下文 |

### 6.2 `RoomState`

```json
{
  "roomType": "junior",
  "roomName": "初级场",
  "tierConfig": {
    "type": "junior",
    "name": "初级场",
    "entryFeeBeans": 0,
    "freezeBeans": 1000,
    "freezeEnabled": false,
    "minBeansToMatch": 5000,
    "minBeansToStart": 5000,
    "minBeansToReady": 5000,
    "baseBet": 100,
    "maxMultiplier": 64,
    "taxRate": 0.03
  },
  "phase": "playing",
  "players": {
    "p_xxx": {
      "id": "p_xxx",
      "name": "玩家A",
      "avatarUrl": "https://...",
      "seat": 0,
      "ready": false,
      "role": "landlord",
      "beans": 20000,
      "frozenBeans": 0,
      "availableBeans": 20000,
      "roundDelta": 0,
      "totalDelta": 0,
      "connected": true,
      "autoManaged": false
    }
  },
  "seats": ["p_xxx", "p_yyy", "p_zzz"],
  "dealer": "p_xxx",
  "landlordCardsVisible": [],
  "currentPlayerId": "p_xxx",
  "doublingPlayerId": null,
  "bidState": null,
  "lastPlay": null,
  "handCounts": { "p_xxx": 20, "p_yyy": 17, "p_zzz": 17 },
  "round": {
    "number": 1,
    "starterSeat": 0,
    "passCount": 0,
    "multiplier": 2,
    "baseScore": 100,
    "bidMultiplier": 1,
    "doubleMultiplier": 2,
    "playCounts": {}
  },
  "result": null,
  "message": "玩家A 成为地主",
  "economy": {},
  "actionDeadlineAt": 1788940030000,
  "actionTimeoutMs": 30000,
  "actionActorId": "p_xxx",
  "serverNow": 1788940000000
}
```

重要约束：

- `players` 是公开字段白名单，不含 `accountId` 和连接对象。
- `dealer` 是地主玩家 ID。
- `landlordCardsVisible` 在地主确定后公开。
- `currentPlayerId` 只用于出牌阶段；叫抢行动人看 `bidState.currentPlayerId`；加倍行动人看 `doublingPlayerId`；统一值可读 `actionActorId`。
- `lastPlay` 为当前牌墩需要压制的上一手；两家连续 `pass` 后会清空。
- `actionDeadlineAt=0` 表示当前没有行动倒计时。

### 6.3 `bidState`

```json
{
  "currentPlayerId": "p_xxx",
  "starterId": "p_xxx",
  "highestScore": 0,
  "highestPlayerId": null,
  "firstCallerId": null,
  "robberId": null,
  "bidMultiplier": 1,
  "phase": "calling",
  "turns": 0,
  "passed": []
}
```

`phase` 可为 `calling`、`robbing`、`final_confirm`。

### 6.4 `result`

结算时 `state.result` 包含：

| 字段 | 说明 |
|---|---|
| `winnerTeam` | `landlord` 或 `farmers` |
| `winnerIds` | 获胜玩家 ID 数组 |
| `baseBet` / `multiplier` / `unit` | 底分、最终倍率和结算单元 |
| `bidMultiplier` / `doubleMultiplier` | 抢地主倍率和地主加倍倍率 |
| `requestedDeltas` | 理论输赢 |
| `grossDeltas` | 抽水前实际输赢 |
| `taxDeltas` / `taxRate` / `taxTotal` | 抽水明细 |
| `deltas` | 游戏输赢变化；真人房赢家还需合并 `taxDeltas` 得到净变化 |
| `balances` | 结算后余额 |
| `bankruptRewards` | 可领取破产补助的玩家映射 |
| `spring` | 是否春天或反春 |
| `currencyName` | 当前为“铁豆” |

### 6.5 `notice.action`

客户端应把 `notice` 视作动画/提示事件，不作为权威状态。常见 `action`：`rewardClaimed`、`playerManaged`、`playerUnmanaged`、`playerReconnected`、`actionTimeout`、`entryFeeInsufficient`、`entryFeeCharged`、`dealStarted`、`bidPlaced`、`landlordForced`、`landlordAssigned`、`doubleApplied`、`cardsPlayed`、`lowCards`、`playerPassed`、`trickCleared`、`multiplierChanged`、`roundSettled`。

## 7. 语音、权益与铁豆商品

### 7.1 查询语音配置 `getVoiceConfig`

```json
{ "type": "getVoiceConfig" }
```

返回 `voiceConfig`。支持 `voice_config_v2` 时包含 `schemaVersion`、`interactive` 和 `packs`；每个 pack 包含 `packId`、`sku`、`name`、`icon`、`priceBeans`、`saleEnabled`、`audioBaseUrl` 和 `voices`。未声明能力的旧客户端只收到兼容互动语音列表。

### 7.2 查询权益 `getEntitlements`

```json
{ "type": "getEntitlements" }
```

响应：

```json
{
  "type": "entitlements",
  "data": {
    "seq": 3,
    "items": [
      { "sku": "voice_pack:tiezi", "source": "purchase", "grantedAt": 1788940000000, "expiresAt": 0 }
    ]
  }
}
```

这是完整快照，客户端只应用更大的 `seq`。失败时收到 `entitlementsUnavailable`，按 `retryAfterMs` 延迟重试。

### 7.3 铁豆购买 SKU `buySku`

```json
{ "type": "buySku", "sku": "voice_pack:tiezi", "source": "home_voice_store", "requestId": "client_xxx" }
```

- `source` 允许 `room_chat_panel` 或 `home_voice_store`，其他值归一为 `unknown`。
- 客户端须声明 `voice_trade_v1`。
- 当前 SKU 包括 `voice_pack:default`、`voice_pack:tiezi`、`voice_pack:tianmei`。
- 购买按 `accountId + sku` 幂等；重复购买不会重复扣豆。

响应：

```json
{ "type": "purchaseResult", "data": { "requestId": "client_xxx", "ok": true, "sku": "voice_pack:tiezi", "owned": true, "charged": true, "priceBeans": 100 } }
```

成功时此前还会依次推送最新 `wallet` 和 `entitlements`。失败响应增加 `code`、`message`，常见值为 `CLIENT_UPGRADE_REQUIRED`、`SKU_DISABLED`、`PURCHASE_FAILED`、`ACCOUNT_RATE_LIMITED`。

### 7.4 房内语音 `voiceMsg`

```json
{ "type": "voiceMsg", "voiceId": "it_1" }
```

服务端只接收 `voiceId`，忽略客户端自报的文案和 URL；校验语音存在、权益、连接状态和 3 秒冷却后向全房广播：

```json
{
  "type": "voiceMsg",
  "data": {
    "playerId": "p_xxx",
    "name": "玩家A",
    "voiceId": "it_1",
    "packId": "",
    "text": "搞快点搞快点！",
    "voiceUrl": "https://...",
    "audioKey": "gaokuaidian",
    "sentAt": 1788940000000
  }
}
```

常见错误：`VOICE_FORBIDDEN_STATE`、`VOICE_RATE_LIMITED`、`VOICE_NOT_FOUND`、`VOICE_COOLDOWN`、`VOICE_NOT_OWNED`。

## 8. HTTP API

### 8.1 健康检查

| 方法 | 路径 | 成功 | 未就绪/失败 | 鉴权 |
|---|---|---|---|---|
| GET | `/healthz` | `200 text/plain: ok` | 仅进程异常时失败 | 无 |
| GET | `/readyz` | `200 text/plain: ready` | `503 text/plain: not ready...` | 无 |

`healthz` 只表示进程存活；接流量和建立 WebSocket 前应以 `readyz` 为准。

### 8.2 客户端支付 API

所有支付客户端请求携带：

```http
Authorization: Bearer <authOk.sessionToken>
```

创建订单还需携带：

```http
Content-Type: application/json
Idempotency-Key: <UUID>
```

| 方法 | 路径 | 用途 | 成功状态 |
|---|---|---|---|
| GET | `/api/v1/iap/products?os=android|ios` | 查询充值商品 | `200` |
| POST | `/api/v1/iap/orders` | 创建充值订单 | 首次 `201`，幂等重放 `200` |
| POST | `/api/v1/iap/orders/{orderId}/client-result` | 上报客户端支付观察结果 | `200` |
| GET | `/api/v1/iap/orders/{orderId}` | 查询充值订单 | `200` |
| GET | `/api/v1/iap/orders?status=pending` | 查询当前账号待恢复订单 | `200` |
| GET | `/api/v1/platform-coins/balance?os=android|ios` | 查询平台托管币余额 | `200` |
| GET | `/api/v1/platform-coins/exchange-products` | 查询兑换商品 | `200` |
| POST | `/api/v1/platform-coins/exchange-orders` | 创建钻石兑铁豆订单 | 完成 `200`，处理中 `202` |
| GET | `/api/v1/platform-coins/exchange-orders/{exchangeOrderId}` | 查询兑换订单 | 完成 `200`，处理中 `202` |

支付 HTTP API 仅允许 `loginType=kwai`，游客返回 `403 GUEST_PAYMENT_FORBIDDEN`。响应统一带 `Cache-Control: no-store`。详细请求体、响应体、状态机、幂等与错误码见 `docs/iap-client-call-flow-and-api.md`。

### 8.3 支付回调

| 方法 | 默认路径 | 调用方 | 鉴权 |
|---|---|---|---|
| POST | `/api/v1/payments/kwai/notify` | 快手支付平台 | 平台签名校验，不使用 Bearer Token |

回调路径可由服务端配置覆盖。该接口不是客户端 API。为满足平台重试协议，业务失败也可能返回 HTTP `200` 和正文 `failed`；调用方应按支付平台约定处理。

### 8.4 CORS

支付 API 支持 `OPTIONS` 预检，并允许 `Authorization`、`Content-Type`、`Idempotency-Key`。带 `Origin` 的请求必须命中服务端白名单，否则返回 `403 ORIGIN_FORBIDDEN`。

## 9. 错误、限流与连接关闭

### 9.1 WebSocket 限制

| 范围 | 限制 |
|---|---|
| 全连接 | 10 秒最多 80 条消息 |
| `ping` | 10 秒最多 30 次 |
| `auth` | 60 秒最多 10 次 |
| 对局操作 | `setReady` 12/10 秒、`bid` 8/10 秒、`double` 6/10 秒、`playCards` 12/10 秒、`pass` 12/10 秒、`hint` 12/10 秒 |
| 匹配/房间 | `quickMatch` 6/10 秒、`cancelMatch` 10/10 秒、`resumeMatch` 10/10 秒、`createRoom` 5/60 秒、`join` 10/10 秒 |
| 奖励 | 分享 3/60 秒、新手 3/60 秒、加桌 3/60 秒、破产 3/60 秒、广告 30/60 秒 |
| 语音 | 命令 6/10 秒，另有业务冷却 3 秒 |

账号敏感接口同时执行跨连接的账号维度限流，重连不能刷新配额。普通命令超限返回 `error`；累计 5 次协议违规或全连接洪泛会以 `1008` 关闭。

### 9.2 WebSocket 常见错误码

| 错误码 | 客户端处理建议 |
|---|---|
| `UNAUTHENTICATED` | 清理当前连接，重新完成认证 |
| `RATE_LIMITED` / `ACCOUNT_RATE_LIMITED` | 延迟重试，避免立即循环 |
| `INVALID_CORRELATION_ID` / `INVALID_REQUEST` | 修复请求，不自动重试 |
| `GUEST_ROOM_FORBIDDEN` | 引导快手登录或切到初级场 |
| `INSUFFICIENT_MATCH_BEANS` / `INSUFFICIENT_ENTRY_FEE` | 刷新钱包并引导获取铁豆 |
| `ALREADY_IN_ROOM` | 优先恢复或退出旧房间 |
| `MATCH_RESERVATION_REQUIRED` / `INVALID_JOIN_TICKET` | 结束本地匹配态，重新匹配 |
| `ENTITLEMENTS_UNAVAILABLE` | 按 `retryAfterMs` 重试 |
| `CLIENT_UPGRADE_REQUIRED` | 引导升级 |
| `SKU_DISABLED` | 隐藏或禁用商品 |
| `VOICE_RATE_LIMITED` / `VOICE_COOLDOWN` | 等待后再发 |
| `VOICE_NOT_OWNED` | 引导购买权益 |

规则动作的部分拒绝目前只有中文 `message`，例如“牌型不合法”“需要出同牌型更大的牌，或使用炸弹/火箭”。客户端应统一展示，并等待下一次 `state`/`hand` 保持一致。

### 9.3 HTTP 错误格式

```json
{ "error": { "code": "PAYMENT_UNAVAILABLE", "message": "payment unavailable" } }
```

HTTP 常用状态：`400` 参数错误、`401` 未认证、`403` 来源或游客限制、`404` 资源不存在、`409` 幂等或未决订单冲突、`413` 请求体超过服务端限制、`429` 限流、`503` 未就绪或支付不可用。未知路径返回 `404`。

## 10. 推荐客户端时序

### 10.1 首次进入大厅

```text
建立 WebSocket
→ auth(intent=kwai_login/resume/guest)
→ authOk
→ 缓存 sessionToken 和服务端身份
→ getWallet
→ wallet
→ 按需查询 newcomer、profile、voice、entitlements
```

客户端不应在 `authOk` 前直接发送业务命令；若本地做消息排队，也必须保证 `auth` 是第一条业务帧。

### 10.2 快速匹配并开局

```text
quickMatch
→ matchWaiting
→ matchFound(roomId, matchRequestId, joinTicket)
→ join
→ joined
→ state
→ 三人 ready
→ hand + state(phase=bidding)
→ bid
→ state(phase=doubling)
→ double
→ state(phase=playing)
```

客户端不得自行倒计时后取消服务端匹配。网络中断后用原 `matchRequestId` 调 `resumeMatch`。

### 10.3 正常出牌与结算

```text
state(actionActorId=自己)
→ 可选 hint → hintResult
→ playCards 或 pass
→ hand（仅出牌者）
→ notice（动画）
→ state（全房权威状态）
→ ...
→ state(phase=settlement, result=...)
→ wallet
```

客户端应以 `state` 为最终真相，不根据 `notice` 本地推演牌局。结算后若继续下一局，发送 `setReady { ready: true }`。

### 10.4 断线恢复

```text
连接断开
→ 指数退避重连
→ auth(intent=resume)
→ authOk(resumeRoomId 非空)
→ join(roomId=resumeRoomId)
→ joined(recoveredFromManaged 可选)
→ state
→ hand
```

进行中牌局断线后有 30 秒宽限；超时则进入托管。托管后的座位仍可恢复，除非玩家此前主动 `leaveRoom`，主动离房会将旧座位标记为不可恢复。

## 11. 联调检查清单与实现位置

### 11.1 联调清单

- [ ] 先检查 `/readyz`，再建立 WebSocket。
- [ ] `authOk` 前不发送除 `ping` 外的业务消息。
- [ ] 不信任客户端生成的 `accountId`、余额、手牌、倍率和结算结果。
- [ ] 收到 `authOk.sessionToken` 后按 `loginType` 隔离存储。
- [ ] 收到 `matchFound` 后原样携带 `matchRequestId`、`joinTicket` 入房。
- [ ] 断线恢复时使用 `authOk.resumeRoomId`，并重新接收 `state` 与 `hand`。
- [ ] UI 倒计时使用 `serverNow` 校正本地时钟。
- [ ] 仅当前行动人展示对应按钮，并允许服务端拒绝竞态请求。
- [ ] 出牌只提交 `cardIds`，不提交牌型或倍率。
- [ ] `notice` 只驱动表现，`state` 才驱动业务状态。
- [ ] 语音只提交 `voiceId`，权益快照按递增 `seq` 应用。
- [ ] 支付使用 HTTP 和 Bearer Token，不再接入 WebSocket 支付兼容消息。
- [ ] 支付数量字段保持十进制字符串，创建订单的 UUID 幂等键持久化并复用。

### 11.2 代码位置

| 能力 | 文件 |
|---|---|
| WebSocket 协议、房间和对局 | `server/index.js` |
| HTTP 入口、健康检查和 CORS | `server/http-server.js` |
| 身份与 session token | `server/auth.js` |
| 支付 HTTP 路由 | `server/payment/http-api.js` |
| 牌对象 | `server/cards.js` |
| 斗地主规则 | `server/rules.js` |
| 客户端 WebSocket 封装 | `package/js/network.js` |
| 客户端认证 | `package/js/auth.js` |
| 客户端匹配 | `package/js/matchmaking.js` |
| 客户端消息订阅 | `package/js/main.js` |
| 支付详细文档 | `docs/iap-client-call-flow-and-api.md` |
| DouZero 内部接口 | `docs/server.md` |

### 11.3 当前兼容 WebSocket 支付消息

以下消息仍在服务端注册，但只用于旧客户端迁移，不属于新接入推荐协议：

| 客户端消息 | 服务端事件 |
|---|---|
| `getIapCatalog` | `iapCatalog` |
| `createIapOrder` | `iapOrderCreated` |
| `reportIapClientResult` | `iapClientResultRecorded` |
| `getIapOrder` | `iapOrder` |
| `getPendingIapOrders` | `pendingIapOrders` |
| `getPlatformCoinBalance` | `platformCoinBalance` |
| `getPlatformCoinExchangeCatalog` | `platformCoinExchangeCatalog` |
| `createPlatformCoinExchange` | `platformCoinExchangeAccepted` |
| `getPlatformCoinExchange` | `platformCoinExchangeResult` |

这些消息都要求 `correlationId`，格式为首字符字母或数字，后续只允许字母、数字、下划线、点、冒号、连字符，总长度不超过 64。新客户端统一使用第 8 节 HTTP API。
