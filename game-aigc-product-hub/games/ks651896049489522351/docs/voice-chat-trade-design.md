# 斗地主房间内聊天互动与语音包交易技术设计

> 文档状态：已评审，落地中
> 适用 APPID：`ks699465320497476962`
> 适用游戏：老铁斗地主
> 设计版本：`v1.5`
> 更新时间：2026-08-13
> 关联模块：局内聊天面板、语音广播、铁豆钱包、用户权益、大厅商城
> 当前阶段：最终评审通过，按实施顺序落地
>
> `v1.1` 复核调整：Catalog 作为唯一商品与展示元数据源；购买重复请求改为幂等成功；购买上下文改由服务端重建；新增钱包锁定与精确扣款原语；权益协议改为对象数组并补同步重试；语音允许所有有效房间阶段；音频收口为 `KwaiMedia.Audio.playVoice()`。
>
> `v1.2` 复核调整（**含一处 P0**）：语音类限流拒绝不得计入连接违规计数，否则正常刷屏会导致断线踢出局并触发退出惩罚扣费；限流额度与 3 秒冷却对齐（10s / 6 次）；补充协议字段校验与 `sku` 长度约束；补充新表纳入 MySQL schema 校验清单的要求。
>
> `v1.3` 复核调整（稳定性与可运维）：修正「不调 `touchRoom`」在现有 `broadcastAll` 下无法成立的矛盾；新增功能开关（kill switch）；新增迁移执行方式与上线顺序约束；新增出站背压与可观测性；新增退款/撤销的前向兼容声明（幂等键不可回收问题）。
>
> `v1.4` 复核调整（兼容性与协议时序）：新增客户端能力协商与新旧客户端分阶段发布方案；修正 Catalog `item.type` / 权益 `kind` 映射；权益快照增加连接级 `seq` 防止异步旧快照覆盖新状态；购买协议增加仅用于关联响应的 `requestId`；新增 Catalog/语音配置启动时 fail-fast 校验；修正真实支付接入时「上层协议无需变化」的过度承诺。
>
> `v1.5` 最终门禁调整：修正第 6.4 节「先发布兼容客户端」与原阶段 1「先切服务端 v2 配置」的发布顺序矛盾；新增阶段 0 客户端 v1/v2 兼容与 capability 上报，服务端配置重构必须在阶段 0 覆盖率达标后发布；明确旧客户端 v1 DTO 不下发专属包，避免展示不可购买的幽灵入口。

## 1. 背景与目标

### 1.1 背景

当前局内已有一个聊天面板雏形（`package/js/scene-voice.js`），右侧两个竖排 tab 分别是「互动语音」与「专属语音包」，服务端通过 `voiceConfig` 下发面板数据，客户端通过 `voiceMsg` 上报所选语音，服务端 `broadcastAll` 广播给房间内全部玩家。

服务端已具备：

- 认证网关与账号可信边界（`server/auth.js`，`accountId` 只能来自 auth 握手结果）；
- 铁豆钱包与资金账本（`wallets`、`wallet_ledger`），含唯一幂等键、`balance_before/after`、MySQL 行锁；
- 连接级与账号级限流双桶；
- 房间生命周期、断线宽限、离线托管、断线重连自动回房。

但现有语音能力仅是 UI 与广播的最小闭环，存在三类问题：

1. **专属语音包没有任何付费与权益概念**。配置中的 `packs` 与 `interactive` 被拍平进同一张 `VOICE_LOOKUP`，导致任何客户端上报 `vp_*` 都会被服务端当作合法语音广播出去，且广播出去的文案是语音包名称而非台词。
2. **存在无风控的自由文本通道**。`voiceMsg` 允许仅上报 `text`（上限 40 字）并原样广播，没有敏感词过滤，也没有消息留档。
3. **限流与状态校验不足**。`voiceMsg` 未纳入账号级限流（断线重连即可绕过连接级配额），且托管中的玩家在连接仍存活时可以继续发送语音。

同时，语音包是本项目**第一个「用铁豆换取权益」的消费场景**。现有铁豆流水类型全部属于「系统发放」（`new_user_grant`、`daily_login`、`share_reward`、`ad_reward`、`shortcut_reward`、`bankrupt_relief`）、「对局零和」（`game_win`、`game_lose`）与「玩法内置消耗」（`room_entry_fee`、`exit_penalty`、`room_freeze`），仓库内不存在任何商城、商品或权益抽象。

### 1.2 核心目标

1. **完成聊天互动闭环**：玩家在局内选择互动语音后，房间内其他玩家可见文案气泡、可听语音。
2. **建立付费权益边界**：专属语音包必须用铁豆购买后方可使用，未购买的发送请求由服务端拒绝。
3. **沉淀薄交易核心**：抽出「商品目录 + 扣款 + 权益发放」的通用能力，语音包作为第一个 SKU 接入，后续头像框、牌背、道具零成本扩展。
4. **资金绝对正确**：不出现部分扣款、重复扣款、扣款成功但未发货、余额不足却发货。
5. **修复现存缺陷**：关闭自由文本通道、修复任意 `vp_*` 可广播、补齐限流与座位状态校验。
6. **面向扩展**：当前一个语音包只含一条语音，但结构、协议与权益模型必须支持无改动扩展为多条。

### 1.3 非目标

本期不包含：

- 真实货币充值与快手支付接入；
- 订单状态机（`created → paid → delivered`）、退款与撤单流程；
- 购物车与批量下单；
- 商品配置入库与运营后台；
- 权益过期回收（`expires_at` 建表预留，逻辑不启用）；
- 自定义文本聊天与敏感词过滤体系；
- 语音包试听；
- 定时对账任务；
- 机器人发送语音。

## 2. 已确认产品决策

| 决策项 | 结论 | 状态 |
|---|---|---|
| 是否引入完整交易系统 | 不引入订单状态机，仅做薄交易核心 | 已确认 |
| 简化依据 | 铁豆为内部虚拟资产，扣款与发货可在同一 DB 事务内完成，无异步支付窗口 | 已确认 |
| 权益命名空间 | 统一使用带业务前缀的 `sku`，如 `voice_pack:monkey` | 已确认 |
| 权益过期 | `expires_at` 建表预留，恒为 `0`，本期不启用过期逻辑 | 已确认 |
| 游客购买 | 不开放，游客仅可使用免费互动语音 | 已确认 |
| 语音包内容量 | 当前一个语音包含一条语音，但结构须面向多条扩展 | 已确认 |
| 音频资源 | 本期沿用现有测试链接，上线前替换为自有 CDN | 已确认 |
| 自由文本聊天 | 本期关闭，`voiceMsg` 仅接受 `voiceId` | 设计约束 |
| 未购买音频 URL | 正常下发，权益边界由服务端发送校验保证 | 设计约束 |
| 免费领取（0 铁豆） | 走统一购买链路，但不写钱包流水 | 设计约束 |
| 客户端气泡 | 由服务端广播回声驱动，不做本地乐观展示 | 设计约束 |

## 3. 现状与关键约束

### 3.1 现有语音链路

```text
join / 重连恢复
  → sendTo(ws, 'voiceConfig', VOICE_CONFIG)

客户端点击语音
  → 本地立即 showVoiceBubble（乐观展示）
  → send('voiceMsg', { voiceId, text })

服务端 voiceMsg
  → VOICE_LOOKUP.get(voiceId)
  → 命中则取配置文案与 URL，未命中则用客户端上报的 text
  → broadcastAll(room, 'voiceMsg', {...})

客户端收到 voiceMsg
  → 若 fromId === myId 则忽略
  → 否则 showVoiceBubble + playVoiceUrl
```

### 3.2 必须遵守的既有约束

#### 3.2.1 `applyWalletDelta` 不因余额不足失败

这是本设计最重要的约束。现有实现在余额不足时**扣到下限即停止，并且不抛出异常**：

```js
const minBalance = options.allowFrozenCoverage ? 0 : frozenBefore;
const next = amount < 0 ? Math.max(minBalance, before + amount) : Math.max(0, before + amount);
const actual = next - before;
```

若照「调用扣款成功即发货」的直觉实现，会出现「用户仅有 30 铁豆，实际被扣 30，却获得标价 100 铁豆的语音包」。

因此购买流程必须满足两点：

1. 在同一事务内**先锁钱包行、先判余额**，不足直接返回失败，不调用 `applyWalletDelta`；
2. 调用后**校验 `ret.actual === -priceBeans`**，不等则抛错回滚，作为兜底防线。

#### 3.2.2 余额判定必须使用 `availableBeans`

钱包存在冻结机制，`availableBeans = max(0, beans - frozenBeans)`，且 `applyWalletDelta` 的扣款下限就是 `frozenBeans`。虽然当前各档位 `freezeEnabled` 均为 `false`，但冻结路径在 `chargeEntryFeesForStart` 与 `applyExitPenalty` 中是活跃的。使用 `beans` 判定会导致「显示够但扣不动」的不一致。

#### 3.2.3 消息处理存在房间 guard 硬边界

`index.js` 的消息分发在中段有一道硬边界：

```js
if (!playerId) { sendTo(ws, 'error', { message: '请先加入房间' }); return; }
const room = rooms.get(currentRoomId);
if (!room) { ... }
const me = room.players[playerId];
if (!me) { ... }
```

大厅已存在语音包商城入口（`scene-home.js` 的 `icon-voice-pack`，当前为占位提示），因此**购买协议必须放在这道 guard 之前**，与 `getWallet`、`claimAdReward` 同层；`voiceMsg` 保持在 guard 之后。

#### 3.2.4 MySQL-only 数据库约束

持久层只支持 MySQL / InnoDB。新增表必须落地到 `migrateMysql`、`REQUIRED_MYSQL_TABLES` 和 `server/scripts/migrations/` 下的独立迁移 SQL；禁止新增 SQLite 建表路径、`DDZ_DB_DIALECT=sqlite`、`DDZ_DB_PATH`、`ON CONFLICT`、`PRAGMA` 或双方言分支。

#### 3.2.5 `idempotentWrite` 的事务跳出行为

`idempotentWrite` 在撞上唯一键冲突后会跳出原事务、另开新事务读取既有流水。若将其包在外层事务内，真发生冲突时**外层事务会一并回滚**。由于购买流程已先查权益，该路径概率极低，且回滚是安全结果（不会产生半成品），但不得在外层做「撞键后继续补写」的假设。

#### 3.2.6 单进程状态假设

房间、匹配队列、连接状态均为进程内状态，匹配编排已明确注释「第一阶段为单 WebSocket 进程内的账户级唯一队列；多进程部署必须使用 sticky shard 或集中式协调」。因此任何权益缓存只能作为加速手段，不得作为唯一真相。

#### 3.2.7 客户端已有成熟双端音频模块

`package/api/kwai-media.js` 暴露的 `KwaiMedia.Audio` 已具备：

- 快手 / Web 双端适配；
- `sfxEnabled` 音效开关判断（`playSfx` 首行即判断并直接返回）；
- `fadeBgm(to, duration)` 平滑音量渐变；
- 音效池与 LRU 淘汰。

而 `scene-game.js` 中的 `playVoiceUrl` 自行手写了 `createInnerAudioContext`，仅有 `ks` / `wx` 分支，**H5 环境完全无声**，而 H5 是 `agw-self-test` 的主要验证环境。

需要特别注意 `fadeBgm` 会将渐变中的音量写回 `_audioSettings.bgmVolume`：

```js
_bgm.volume = v;
_audioSettings.bgmVolume = v;
```

因此语音播放期间压低 BGM 后，必须恢复到**降音前缓存的原值**，不可硬编码为 `1.0`，否则会覆盖用户在设置中调整的音量。

#### 3.2.8 限流拒绝会计入违规并可能断线（关键约束）

现有命令级限流命中后走 `recordViolation`，而 `violationCount` 累计到 `SECURITY.maxViolationsPerConnection`（当前为 `5`）就会 `ws.close(1008)`：

```js
function checkRateLimit (type) {
  if (hitWindowRateLimit(connectionRateBucket, 'all', {...})) {
    return recordViolation('消息过于频繁，请稍后再试', true);
  }
  const limit = COMMAND_RATE_LIMITS[type];
  if (limit && hitWindowRateLimit(commandRateBucket, type, limit)) {
    return recordViolation(`${type} 操作过于频繁，请稍后再试`);
  }
  return false;
}
```

这对现有命令是合理的（`bid` / `playCards` 超频基本只能是脚本），但**语音刷屏是正常玩家行为**。若直接把 `voiceMsg` 限额收紧到 10s / 3 次而不改拒绝方式，玩家连点几下语音就会累积 5 次违规并**被踢出对局**，而对局中断线会触发托管与退出惩罚，等价于「多发语音倒扣铁豆」。这是本设计必须避开的最大体验事故点。

#### 3.2.9 消息字段数与体积上限

`validateMessage` 限制 `maxObjectKeys = 16`、`maxMessageBytes = 4096`，且未知协议类型直接拒绝。由于 `ALLOWED_MESSAGE_TYPES` 是由 `COMMAND_RATE_LIMITS` 的 key 推导的，`buySku` / `getEntitlements` 必须同步加入 `COMMAND_RATE_LIMITS`，否则请求会在校验层就被当作未知类型丢弃并计入违规。

#### 3.2.10 `broadcastAll` 内部强制 `touchRoom`

```js
function broadcastAll (room, type, data) {
  touchRoom(room);
  const msg = JSON.stringify({ type, data });
  for (const p of allPlayers(room)) {
    if (p.ws && p.ws.readyState === 1) p.ws.send(msg);
  }
}
```

`touchRoom` 是 `broadcastAll` 的无条件首行，因此「广播语音但不延长房间存活期」在不改造 `broadcastAll` 的前提下**无法实现**。

同时需看回收条件：`sweepRooms` 在「仍有任何在线连接」时直接 `continue` 不回收，`lastActivityAt` 只在全员连接断开后才真正起作用。而语音广播只会发给 `readyState === 1` 的连接，意味着能发语音就一定存在在线连接，房间本就不会被回收。**因此该限制本身是多余的**，不应为此改造公共广播函数。

#### 3.2.11 广播无背压保护

`broadcastAll` / `sendTo` 只判断 `readyState`，**不检查 `ws.bufferedAmount`**。弱网客户端消费不及时时，消息会在服务端内核缓冲区堆积。现有广播（出牌、状态）是低频且由回合驱动的，而语音是玩家可主动触发的高频广播，是第一个会放大该缺口的能力。

#### 3.2.12 无迁移执行器，DDL 靠 DBA 手工应用

`server/scripts/migrations/` 下仅有 `20260810_bot_matchmaking_p0.sql`，`package.json` 中只有 `db:init:mysql`，**没有自动迁移命令**；`assertMysqlSchemaReady` 失败时的提示也是「Ask DBA to apply ...」。这意味着表结构变更与代码发布是两个独立动作，存在时序风险。

#### 3.2.13 已有 env 开关先例

`BOT_MATCH.enabled` 采用 `String(process.env.DDZ_BOT_MATCH_ENABLED || 'false') === 'true'` 的开关模式，默认关闭。新能力应沿用同一范式，而非硬编码开启。

## 4. 设计原则

| 原则 | 落地方式 |
|---|---|
| 交易与内容解耦 | `trade/` 只认 SKU 与价格，不知道「语音包」为何物；`voice-config.js` 只管内容，不接触资金 |
| 单事务原子 | 扣款与发货在同一 `transaction` 内，因此不需要订单状态机 |
| 服务端唯一真相 | 客户端只上报 `voiceId` / `sku`，文案、音频、价格、权益全部服务端反查 |
| 权益边界靠发送校验 | 不依赖隐藏音频 URL |
| 失败不发货 | 余额前置校验 + 扣款等值校验双重保障 |
| 复用既有能力 | 资金走 `wallet_ledger`，音频走 `KwaiMedia.Audio` |
| 结构面向扩展 | `voices[]` 数组、`grant` 声明式发放、幂等键工厂、`payment` 抽象 |

### 4.1 关于「未购买是否下发音频 URL」的决策说明

曾考虑「未购买语音包不下发 `voiceUrl`，购买后重新下发完整配置」，最终**否决**，理由如下：

1. 该保护本质是弱保护。聊天语音是广播内容，房间内其他玩家发送该语音包时，服务端**必须**把 `voiceUrl` 广播给全房间，否则听不到。未购买用户依然能在被动接收时获得 URL。
2. 代价显著。购买后需重发整份配置，客户端要处理配置版本与状态切换；且无法提前预加载音频，首次播放存在延迟。
3. 权益的产品定义是「能否主动发送」，服务端在 `voiceMsg` 拦截即构成完整闭环。
4. 抓包获取一段吐槽音频的收益极低，不值得为此增加架构复杂度。

**结论**：`voiceConfig` 一次性下发全部音频 URL 且**不含任何用户态**，可作为模块级共享常量直接下发；持有状态单独通过 `entitlements` 数组传递。

这一决策同时消除了一个高危错误面：若在共享常量 `VOICE_CONFIG` 上挂载 `owned` 字段，A 用户的持有状态会泄漏给 B 用户。配置无用户态后，该风险从根本上不存在。

## 5. 面向扩展的设计

不做订单状态机，但通过以下扩展位保证平滑演进。

### 5.1 `grant` 声明式发放

商品不写死「发放语音包」，而是声明发放什么权益：

```text
sku:   'voice_pack:monkey'
type:  'voice_pack'
grant: { kind: 'entitlement', sku: 'voice_pack:monkey', durationMs: 0 }
```

新增头像框、牌背皮肤只需增加配置，`purchase.js` 无需改动。若未来出现「购买后直接加铁豆」类商品，只需在 `grant.kind` 上增加分支。

### 5.2 `payment` 抽象

`purchase.js` 内部将「付款」抽为独立步骤，本期仅实现 `beans`：

```text
payment: 'beans'   // 未来可扩展 'kwai_pay' / 'diamond'
```

接入真实支付时，Catalog、权益表与发放模型可以复用，但**购买协议必须演进**：真实支付存在「创建订单 → 待支付 → 平台回调 → 发放」的异步窗口，不能继续沿用本期同步 `buySku → purchaseResult` 的完成语义。届时应新增 `createOrder` / `orderStatus`（或在协议中引入 `pending` 状态）并引入订单表；客户端持有态仍只认 `entitlements`，因此权益消费协议可以保持不变。

### 5.3 `purchaseContext` 透传

购买请求携带上下文（来源场景、房间号、活动 ID），落入 `wallet_ledger.meta_json` 与权益表 `meta_json`：

```text
{ source: 'room_chat_panel', roomId: '123456', activityId: '' }
```

后续做渠道转化分析与活动归因无需改表。

### 5.4 幂等键工厂

```text
buildPurchaseIdempotencyKey(accountId, sku, item)
  → 'purchase:{sku}:{accountId}'          // 本期：永久型商品，一人一次
```

未来支持月卡或周期内可重复购买时，可扩展为附加 `periodId` 或 `clientRequestId` 后缀，购买主逻辑不动。

### 5.5 语音包多条语音扩展

当前一个语音包只含一条语音，但**结构不退化**：仍采用 `packs[].voices[]`，当前数组长度为 1。

若按「一包一条」写成扁平结构（pack 直接挂 `text` / `voiceUrl`），未来扩为多条时协议、客户端渲染、权益校验三处都要改。保留数组后，扩展只是数组变长。

配套三条约定：

1. **发送单位始终是 `voiceId`**，不是 `packId`。即使一包一条，客户端也发送 `voiceId`，服务端反查其所属 `sku` 校验权益。多条时协议不变。
2. **`defaultVoiceId`**：pack 上标注包内默认语音。当前 UI 为「点击包行直接发送」，客户端发送 `defaultVoiceId`；未来多条时点击包行改为展开列表，`defaultVoiceId` 退化为兜底，协议不受影响。
3. **权益粒度为 `sku`（即整包）**，包内所有语音共享一份权益。多条时无需改动权益模型。

## 6. 系统架构

### 6.1 模块划分

```text
server/
  trade/
    catalog.js              # SKU 目录：定义、校验、幂等键工厂、资格判定
    purchase.js             # 购买编排：事务 + 幂等 + 余额 + 发货
  persistence/
    entitlement-store.js    # 通用权益表读写
    wallet-store.js         # 【改】新增 lockWalletForUpdate / debitWalletExact 原语
  game-ai/
    voice-config.js         # 【重构】语音内容：packId + sku + defaultVoiceId + voices[]
  index.js                  # 【改】buySku / voiceMsg / voiceConfig / entitlements
  scripts/migrations/
    20260813_trade_entitlements.sql
  test/
    trade-purchase.test.js  # 【新增】
    voice-chat.test.js      # 【新增】

package/
  api/kwai-media.js         # 【改】新增专用 playVoice / stopVoice 音频能力
  js/
    scene-voice.js          # 【改】两 tab、购买态、确认弹窗、冷却置灰
    scene-game.js           # 【改】通过 KwaiMedia.Audio.playVoice 播放
    scene-home.js           # 【改】大厅入口打开语音包商城
    main.js                 # 【改】协议路由、气泡改服务端回声驱动
```

### 6.2 依赖关系

```text
index.js
  ├─ trade/purchase.js ──┬─ trade/catalog.js
  │                      ├─ persistence/entitlement-store.js
  │                      └─ persistence/wallet-store.js
  ├─ game-ai/voice-config.js  （packId 关联 catalog 中的 sku）
  └─ persistence/entitlement-store.js  （voiceMsg 权益校验）
```

`trade/` 不反向依赖 `voice-config.js`，语音包仅通过 `sku` 字符串与交易层关联。

### 6.3 配置启动校验（fail-fast）

Catalog 与语音配置是两份通过 `sku` 关联的代码配置，虽然价格只有 Catalog 一处真相，但**结构引用仍可能漂移**。服务启动时必须完成一次全量校验，任一失败则拒绝启动（而不是等玩家首次点击才报错）：

- Catalog 中 `sku` 全局唯一，长度 ≤ 64，符合 `[a-zA-Z0-9_:-]+`；
- `priceBeans` 是大于等于 0 的安全整数；`type` / `payment` / `grant.kind` 属于受支持枚举；
- `packs[].packId`、所有 `voiceId` 全局唯一；`defaultVoiceId` 必须存在于本包 `voices[]`；
- 每个 pack 的 `sku` 必须在 Catalog 中存在，且 `item.type === 'voice_pack'`、`grant.kind === 'entitlement'`、`grant.sku === pack.sku`；
- 每个音频 URL 仅允许 `https:`；测试地址也必须使用 HTTPS。正式环境还需通过平台域名白名单与资源归属审核，禁止 `javascript:`、`data:` 与明文 HTTP；
- `contentEnabled=true` 的语音必须具备非空 `text` 与 `voiceUrl`。

对停用商品不要求反向存在 pack：Catalog 中可以保留历史 SKU 供账本与权益审计使用，而内容已彻底下线。但内容配置指向不存在的 SKU 必须失败。

### 6.4 客户端能力协商与滚动升级

当前旧客户端将 `packs[]` 直接当作扁平语音项，读取 `{ voiceId, text, price }`；新结构则是 `{ packId, sku, name, voices[] }`。如果服务端直接切换，新客户端发布传播期间的旧客户端会拿到无法渲染、无法发送的结构。因此必须进行能力协商：

```text
auth { ..., capabilities: ['voice_config_v2', 'voice_trade_v1'] }
authOk { ..., enabledCapabilities: ['voice_config_v2', 'voice_trade_v1'] }
voiceConfig { schemaVersion: 2, interactive[], packs[] }
```

- `capabilities` 仅表示客户端能力，**不参与身份和权限判断**，服务端对未知值忽略；协议层限制数组最多 16 项、每项最多 32 字符且仅允许 `[a-zA-Z0-9_-]`；
- 未声明 `voice_config_v2` 的旧客户端：过渡期继续收到仅含免费 `interactive[]` 的 v1 扁平 `voiceConfig`，`packs[]` 固定为空；服务端仍关闭自由文本。不得向旧客户端下发不可购买、点击后必然被拒绝的专属包幽灵入口；
- 声明 `voice_config_v2` 的客户端：收到 `schemaVersion=2` 的完整结构；
- 未声明 `voice_trade_v1`：服务端不下发交易字段/入口，即使伪造 `buySku` 也仍按服务端身份和开关校验，能力声明不是安全边界；
- 旧协议适配只保留一个明确版本窗口；观测旧版本占比降至可接受阈值后删除 v1 DTO，避免永久维护双协议。

推荐发布顺序：**先发布可同时消费 v1/v2 的客户端 → 再发布支持能力协商的服务端 → 灰度开启交易 → 最后下线 v1 DTO**。不得先切服务端配置结构。

## 7. 数据模型

### 7.1 新表 `user_entitlements`

| 字段 | 说明 |
|---|---|
| `account_id` | 与 `wallets.account_id` 对齐 |
| `sku` | 如 `voice_pack:monkey`，必须带业务前缀，全局唯一；列宽 `VARCHAR(64)`，与协议层校验上限一致 |
| `kind` | 业务权益类型，如 `voice_pack`、`avatar_frame`；不是固定的 `entitlement` |
| `source` | `purchase` / `free_claim` / `grant` / `activity` |
| `price_beans` | 获得时价格，`0` 表示免费领取 |
| `granted_at` | 权益生效时间 |
| `expires_at` | 恒为 `0`。**本期建表预留，逻辑不启用，查询不加过期过滤** |
| `meta_json` | 购买上下文 |
| `created_at` | 建档时间 |
| `updated_at` | 更新时间 |

主键：

```sql
PRIMARY KEY(account_id, sku)
```

设计说明：

- `sku` 已带命名空间前缀并全局唯一，**主键不加入 `kind`**。加入 `kind` 会让「同一 sku 出现两种 kind」这种本不该存在的状态变为合法，反而是隐患。
- `kind` 记录 Catalog 的业务类型，本期为 `voice_pack`；通用发放动作的 `grant.kind = 'entitlement'` 不直接写入此字段。
- `account_id` 外键指向 `wallets.account_id`；所有购买/免费领取路径先保证钱包存在，确保权益与资金主体一致。
- `source` 使权益来源可扩展：后续运营赠送、活动发放、客诉补偿都写入同一张表，业务侧只需查询「是否拥有」，不关心来源。
- 复合主键与固定幂等键构成重复购买的双重防线。
- **新表必须加入 `db.js` 的 `REQUIRED_MYSQL_TABLES`**，否则 `assertMysqlSchemaReady` 不会校验它，迁移遗漏时会在首次购买才暴露为运行时错误；同时需在 `migrateMysql` 和 MySQL migration SQL 中各补一份 DDL。

### 7.2 钱包流水

复用现有 `wallet_ledger`，新增流水类型：

```text
type:            'sku_purchase'
amount:          -priceBeans
idempotency_key: 'purchase:{sku}:{accountId}'
meta_json:       { sku, type, payment: 'beans', source, roomId }
```

**不新建订单表。**

幂等键长度核对：`wallet_ledger.idempotency_key` 为 `VARCHAR(255) NOT NULL UNIQUE`。按 `purchase:` （9）+ `sku`（≤ 64）+ `:`（1）+ `accountId`（≤ 128，对齐 `wallets.account_id`）计算，最大长度约 202，**在 255 上限内**。但因余量不大，幂等键工厂不得再拼接时间戳、房间号等变长后缀。

关于 `priceBeans === 0`（免费领取）：**跳过 `applyWalletDelta`，不写钱包流水**，仅写权益表并标记 `source = 'free_claim'`。理由：

- `amount = 0` 会产生一条金额为 0 的流水，污染资金账本语义；
- 会白占一个幂等键；
- 会触发一次无意义的 `UPDATE wallets`（`version + 1`）；
- 审计从 `user_entitlements` 即可完整追溯。

### 7.3 语音配置重构

当前配置存在四个必须修复的问题：

1. `packs` 项无 `packId`；
2. `text` 字段存放的是**语音包名称**而非广播台词；
3. `price` 为字符串，且含 `'限时限免'` 等无法参与金额计算的值；
4. `VOICE_LOOKUP` 将 `interactive` 与 `packs` 拍平进同一张表，导致任意 `vp_*` 均可被广播。

新结构（内容配置，不直接维护价格）：

```text
interactive: [
  { voiceId, text, voiceUrl, contentEnabled }
]

packs: [
  {
    packId:         'monkey',
    sku:            'voice_pack:monkey',
    name:           '小猴画卷卷语音包',     // 包名，用于面板展示
    icon,
    promoLabel:     '',                    // 可选非交易性内容标签
    contentEnabled: true,                  // 内容使用开关；与停止售卖语义分离
    defaultVoiceId: 'vp_monkey_1',
    voices: [
      { voiceId: 'vp_monkey_1', text: '这把我赢定了', voiceUrl: VOICE_TEST, contentEnabled: true }
    ]
  }
]
```

**商品价格、售卖状态与交易性展示文案只允许在 `trade/catalog.js` 中维护一份。** `voice-config.js` 通过 `sku` 关联商品，但不复制 `priceBeans`；内容侧标签不能表达「免费」「折扣」等价格语义。这样避免运营调价后出现「客户端显示 100、服务端实际扣 200」或「已收费但仍显示免费」的双源不一致。对客户端下发 `voiceConfig` 前，由服务端把 Catalog 中可公开的 `priceBeans`、`promoLabel`、`saleEnabled` 投影到 pack DTO；客户端仍可使用这些字段展示，但来源是 Catalog。

**停止售卖与停止使用必须分离**：Catalog 的 `saleEnabled=false` 仅禁止新购买，已经拥有权益的用户仍可发送；`voice-config.js` 的 `contentEnabled=false` 才会从配置与 `VOICE_BY_ID` 中移除该内容，使所有人停止使用。不得使用单一 `enabled = content && catalog` 同时控制购买和使用，否则运营下架会形成事实上的权益回收。

关键约定：

- `voices[].text` 是**要广播的台词**；`pack.name` 是**包名**。一包一条时两者内容可能相近，但语义必须分离。
- 原「限时限免」统一由 Catalog 配置 `priceBeans: 0` + `promoLabel: '限时免费领取'`，再投影为客户端展示。**文案不得写作「限时限免」**：因为本期不启用 `expires_at`，领取后为永久拥有，「限时限免」会被用户理解为到期回收。
- 内容开关统一命名为 `contentEnabled`（`interactive[]` 与 `voices[]` 一致），不再使用歧义的 `enabled`，以免与 Catalog 的 `saleEnabled` 混淆。

索引：

| 索引 | 映射 |
|---|---|
| `VOICE_BY_ID` | `voiceId → { text, voiceUrl, packId, sku, free }` |
| `PACK_BY_ID` | `packId → pack` |

`free` 用于区分免费互动语音与付费包内语音，是 `voiceMsg` 权益校验的判据。其取值完全由**来源集合**决定，不受价格影响：

- 来自 `interactive[]` → `free = true`，`sku` 为空，永不查权益；
- 来自 `packs[].voices[]` → `free = false`，必须携带 `sku` 并查权益。

**即使某个包当前 `priceBeans = 0`（免费领取），其包内语音仍然是 `free = false`**：免费领取也必须先产生权益行才能使用。否则调价为 0 会让全池玩家绕过领取直接发送，调回正价后又悉数失效。

音频资源本期沿用现有测试链接（`VOICE_TEST`）。上线前必须替换为自有 CDN，并确认快手小游戏域名白名单与 H5 跨域配置。

## 8. 服务端流程

### 8.1 购买 `buySku`

**位置**：房间 guard 之前，与 `getWallet`、`claimAdReward` 同层（大厅必须可购买）。

```text
1. requireAuth
2. 账号级限流 60s / 5 次
3. catalog.require(sku)
     不存在             → SKU_NOT_FOUND
     saleEnabled=false  → SKU_DISABLED
   价格只读取 Catalog，绝不读取客户端或 voice-config 中的金额
4. 资格判定：isGuestAccount(boundLoginType) → GUEST_PURCHASE_FORBIDDEN
5. 服务端重建 purchaseContext：
     source       → 仅接受白名单枚举，非法值归一为 'unknown'
     roomId       → 从当前连接的 currentRoomId 推导，不信任客户端
     activityId   → 仅从已校验的服务端活动配置推导
6. transaction:
     wallet = lockWalletForUpdate(accountId)        # 不存在则创建；MySQL 下 FOR UPDATE
     已有权益 → 返回幂等成功（owned=true, charged=false），不扣款
     if priceBeans > 0:
       availableBeans < priceBeans → INSUFFICIENT_BEANS（不扣款）
       ret = debitWalletExact(accountId, priceBeans, 'sku_purchase', {
               idempotencyKey: buildPurchaseIdempotencyKey(...),
               meta: purchaseContext,
               walletLocked: true,
             })
       # debitWalletExact 内部再次保护 availableBeans 与 actual 等值
     insert entitlement(kind = item.type, source = priceBeans > 0 ? 'purchase' : 'free_claim', expires_at = 0)
     # item.type 来自 Catalog，本期恒为 'voice_pack'（对齐 5.1 与 7.1）
7. 事务提交后下发：wallet 快照 → entitlements 快照 → purchaseResult 最终确认
   （purchaseResult 必须排在两份快照之后，作为客户端结束 loading 的信号；不重发 voiceConfig）
   所有业务终态（成功、幂等命中、余额不足、游客禁止、SKU 不存在/停售）均使用
   purchaseResult 并原样回传 requestId；不得只发通用 error，否则客户端 pending 只能等超时
```

两条硬约束参见 3.2.1 与 3.2.2。为避免业务层重复实现或漏掉检查，在 `wallet-store.js` 新增并导出两个明确的公共原语：

- `lockWalletForUpdate(accountId)`：在当前 ambient transaction 内**先用双方言 `INSERT IGNORE` / `INSERT OR IGNORE` 幂等建档，再 `SELECT ... FOR UPDATE` 读取**；不能采用「先 SELECT、不存在再普通 INSERT」，因为 MySQL 对不存在行的并发锁定语义易受隔离级别/间隙锁影响，两请求可能同时判断不存在并撞主键。购买流程必须先锁钱包再查权益，从而让同账号并发购买串行化。免费领取也必须调用它，以满足 `user_entitlements.account_id → wallets.account_id` 外键。
- `debitWalletExact(accountId, amount, type, options)`：要求正数 `amount`，以 `availableBeans` 前置判断，并在调用 `applyWalletDelta` 后强制校验 `ret.actual === -amount`，否则抛错回滚。`options` 支持：
  - `idempotencyKey`：幂等键，由 `buildPurchaseIdempotencyKey` 生成；
  - `meta`：写入 `meta_json` 的购买上下文；
  - `walletLocked`：声明调用方已通过 `lockWalletForUpdate` 持锁，内部跳过重复加锁（避免外层事务内重复加锁和语义漂移）。

`purchase.js` 不直接调用当前未导出的 `ensureWalletForUpdate`，也不自行拼装余额更新 SQL。

#### 8.1.1 `idempotentWrite` 的 ambient transaction 陷阱

现有 `applyWalletDelta → idempotentWrite` 的唯一冲突恢复逻辑假设：其内部 `transaction()` 发生异常后已经完整回滚，再开启一个新事务查询既有流水。但数据库层支持 ambient transaction 复用：当购买流程已经处于外层事务中时，`idempotentWrite` 内部的 `transaction()` 只是复用外层连接；唯一冲突被它自己 `catch` 后，**外层事务并未在此刻完成回滚**。此时再调用 `transaction()` 仍可能复用同一个已失败事务，MySQL 下无法保证正确恢复。

因此购买链路必须满足以下约束：

1. `lockWalletForUpdate` 先将同一 `accountId` 的购买串行化；
2. 持锁后先查 entitlement，再查同一幂等键的 ledger；任一命中都走幂等返回，正常路径不依赖唯一键异常恢复；
3. `debitWalletExact(..., { walletLocked: true })` 的实现**不得盲目复用现有 `applyWalletDelta` 的外层 `idempotentWrite` 包装**。推荐把「已持锁的精确余额更新 + ledger INSERT」提取为内部原语，由购买外层事务直接调用；唯一冲突一律抛到最外层让整个购买事务回滚，然后在事务外重读 entitlement/ledger 构造幂等结果；
4. 如果选择改造通用 `idempotentWrite`，必须显式识别自己是否拥有事务，只有 owner 才能 catch 后开新事务恢复；不得在 ambient transaction 内吞唯一冲突。

这是实现原子性的关键：**扣款与权益 INSERT 必须由同一个最外层事务决定提交或回滚**，内部工具函数不得私自吞异常并切换事务。

重复购买不是异常：永久权益商品对同一账号天然幂等。若事务内发现权益已存在，应返回 `purchaseResult { ok: true, owned: true, charged: false }`，客户端按成功刷新持有态；不返回 `ALREADY_OWNED` 错误，避免网络超时重试被展示为失败。

重复购买回包中的 `priceBeans` 必须取**已有权益行的 `price_beans`（获得时价格）**，不能取 Catalog 当前价格。否则用户 100 铁豆购入后商品调价到 200，再次点击会收到「已拥有、价格 200」，污染历史购买语义。首次购买才使用 Catalog 当前价；若将来需要同时展示现价，新增独立字段 `currentPriceBeans`，不要复用 `priceBeans`。

游客拦截复用现有 `isGuestAccount`，与 `guestRoomTypeRejection` 使用同一套判据。禁止游客购买的原因：游客 `accountId = HMAC(密钥, deviceId)`，更换设备或清除缓存即变更，付费权益会随之丢失，是典型客诉来源；同时这也是引导快手登录的转化钩子。

### 8.2 发送语音 `voiceMsg`

**位置**：房间 guard 之后（必须在房间内）。

```text
1. 仅接受 voiceId；忽略并丢弃 text（关闭自由文本通道）
2. 账号级限流 10s / 6 次 → VOICE_RATE_LIMITED（软拒绝，不计违规，见 10.2.1）
   （放在权益查库之前，避免非法/未购买请求放大 DB 压力）
3. 座位状态校验：
     me.connected && !me.autoManaged && !me.detachedFromSession
     否则 → VOICE_FORBIDDEN_STATE
4. VOICE_BY_ID.get(voiceId)
     未命中（不存在或 contentEnabled=false）→ VOICE_NOT_FOUND
5. 冷却预检：同一玩家距离上次成功发送不足 3000ms
     → VOICE_COOLDOWN（回包带 cooldownMs；此时不查权益 DB）
6. free === true  → 放行
   free === false → 查权益(accountId, sku)（缓存未命中查库）
                    无权益 → VOICE_NOT_OWNED
7. broadcastAll(room, 'voiceMsg', {
     playerId, name, voiceId, packId, text, voiceUrl, sentAt
   })
8. 广播成功后记录冷却时间；失败请求不启动 3 秒冷却
9. 直接复用 broadcastAll（其内部会 touchRoom，无需也不应规避，见 3.2.10）
```

**第 3 步修补的是现存漏洞**：主动离场路径会将闭包内 `playerId` 置空，因此离场后无法发送；但托管路径（断线宽限超时 → `markManagedPlayer`）不会置空 `playerId` 与 `currentRoomId`，若连接仍然存活，托管中的玩家可以继续发送语音。

语音允许在所有仍然有效的房间阶段发送（`waiting` / `ready` / `bidding` / `playing` / `settlement`）。这是「房间内互动」能力，等待开局和结算后的交流同样有价值；房间存在、玩家仍占有效座位且非托管即满足条件，不额外限制阶段。若产品后续明确只允许对局中发送，再通过配置收紧，不在 MVP 中提前施加限制。

**权益缓存**：每条认证连接在闭包内维护自己的 `Set<sku>`，避免同账号多连接共享 Map 时「其中一条断开就清掉另一条缓存」的生命周期问题。认证后一次性载入完整 SKU 集合，购买成功后更新当前连接；正向命中可直接使用，未命中必须回查数据库，以兼容另一连接或另一进程完成的购买。对数据库确认的「无权益」结果可设置短 TTL（如 5 秒）负缓存，防止未购买用户重复请求造成 DB 放大。本期不支持权益撤销和过期，因此正向缓存不存在撤销后误放行问题；未来启用过期/撤销时必须增加 TTL 或失效通知。

### 8.3 配置与权益下发

| 时机 | 下发内容 |
|---|---|
| `authOk` 之后 | `voiceConfig` + `entitlements`（大厅商城需要；独立消息异步下发） |
| 重复 `auth` 返回 `authOk` | 同样补发 `voiceConfig` + `entitlements`，保证协议语义一致 |
| `join` / 重连恢复 | 可补发 `voiceConfig` + `entitlements`；客户端按完整快照覆盖，重复安全 |
| 购买成功后 | `wallet` → `entitlements` → `purchaseResult`（顺序固定，见 8.1 第 7 步） |

`authOk` 不等待权益查询，避免权益表短暂抖动阻断登录。若权益加载失败，服务端下发 `entitlementsUnavailable { retryAfterMs }`；客户端保留上一次快照但禁用购买和付费语音发送入口，并通过受限流保护的 `getEntitlements` 主动重试，不得把失败降级为空数组（否则会把“加载失败”误展示为“未购买”）。冷启动没有旧快照时按「未知」状态展示加载失败，不按「未购买」展示。

#### 8.3.1 异步快照防倒灌

由于 `authOk` 后的权益查询是异步的，存在如下时序：

```text
A. auth 后启动权益查询（读取到旧快照）
B. 玩家立即 buySku，事务提交并下发新快照
C. A 查询较晚完成，再下发旧快照 → 客户端把“已拥有”覆盖回“未拥有”
```

WebSocket 只保证**已经调用 `send` 的帧顺序**，不保证两个异步任务的完成顺序。因此每条连接需维护 `entitlementsGeneration`：

1. 每次启动权益同步时先递增 generation，并将该值绑定到本次查询；
2. 购买开始/完成时再次递增，使此前仍在飞行中的查询失效；
3. 查询完成后仅当绑定值仍等于当前 generation 才允许发送；否则静默丢弃旧结果；
4. 下行 `entitlements` 同时携带单调递增的 `seq`，客户端只接受 `seq >= lastEntitlementsSeq` 的快照，作为第二道保险；
5. `seq` 仅在当前连接内单调，无需跨进程持久化；重连后客户端在收到新 `authOk` 时重置比较基线。

购买后的 `wallet → entitlements → purchaseResult` 三帧必须在同一个同步函数中连续入队，期间不得穿插旧的权益加载结果。

`voiceConfig` 无用户态，可直接下发模块级共享常量；持有状态仅通过 `entitlements` 传递。

## 9. 协议定义

### 9.1 上行

```text
buySku          { sku, source?, requestId? }
getEntitlements {}
voiceMsg        { voiceId }              # text 字段废弃
```

`validateMessage` 需相应调整：

- `voiceMsg` 不再接受 `text`：应**删除字段**而非仅忽略，避免占用 `maxObjectKeys` 配额；且判空条件改为「`voiceId` 为空即无效」（原条件是「`voiceId` 与 `text` 均空」）；
- 新增 `sku` 校验：长度上限 64（与 `user_entitlements.sku` 列宽对齐），字符集限为 `[a-zA-Z0-9_:-]`（须包含命名空间分隔符 `:`），为空则拒绝；
- 新增 `source` 校验：长度上限 32，非白名单枚举归一为 `unknown`；
- 可选 `requestId` 仅用于关联本连接上的请求与响应，长度上限 64、字符集限 `[a-zA-Z0-9_-]`；**不参与扣款幂等键**，因为客户端可任意改变或重复该值，资金幂等仍由 `accountId + sku` 保证；
- `buySku` / `getEntitlements` 必须同步加入 `COMMAND_RATE_LIMITS`（见 3.2.9）。

### 9.2 下行

```text
voiceConfig     { schemaVersion, interactive[], packs[] }
# pack 上由 Catalog 投影的字段：priceBeans、promoLabel、saleEnabled；均无用户态
entitlements    { seq, items: [{ sku, source, grantedAt, expiresAt }] }
entitlementsUnavailable { seq, retryAfterMs }
purchaseResult  { requestId?, ok, sku, owned, charged, priceBeans, code?, message? }  # 最终确认，不重复携带快照
voiceMsg        { playerId, name, voiceId, packId, text, voiceUrl, sentAt }
error           { code, message, cooldownMs? }
```

### 9.3 错误码

| 错误码 | 含义 |
|---|---|
| `SKU_NOT_FOUND` | SKU 不存在 |
| `SKU_DISABLED` | SKU 已停止售卖；已购用户仍可使用 |
| `INSUFFICIENT_BEANS` | 铁豆不足 |
| `GUEST_PURCHASE_FORBIDDEN` | 游客不可购买，需快手登录 |
| `VOICE_NOT_FOUND` | 语音 ID 不存在 |
| `VOICE_NOT_OWNED` | 未拥有该语音包 |
| `VOICE_COOLDOWN` | 发送冷却中，附带 `cooldownMs` |
| `VOICE_RATE_LIMITED` | 发送频率超限 |
| `VOICE_FORBIDDEN_STATE` | 当前座位状态不允许发送（托管 / 离场 / 断线） |
| `ENTITLEMENTS_UNAVAILABLE` | 权益加载失败，附带 `retryAfterMs`；也作为 `getEntitlements` 失败回包的 code |

上述 `VOICE_*` 错误均为软拒绝，**不计入 `violationCount`、不断连**（见 10.2.1）。

错误码细分而非统一使用通用 `RATE_LIMITED`，便于客户端给出精确提示，且新增拒绝原因不会破坏既有前端逻辑。

## 10. 安全与风控

### 10.1 内容安全

本期**关闭自由文本**：`voiceMsg` 仅接受 `voiceId`，所有广播文案来自服务端配置，因此无需敏感词过滤与消息留档。

若后续开放自定义快捷语，必须同步补齐敏感词过滤与消息留档能力，否则违反隐私合规与内容安全要求。

### 10.2 限流

| 命令 | 连接级 | 账号级 |
|---|---|---|
| `voiceMsg` | 10s / 6 次（由现状 10s / 20 次收紧） | 10s / 6 次（**新增**） |
| `buySku` | 60s / 5 次 | 60s / 5 次 |
| `getEntitlements` | 10s / 2 次 | 10s / 2 次 |

叠加**房间内每人 3000ms 冷却**，回包携带 `cooldownMs` 供客户端置灰按钮。

#### 10.2.1 语音类拒绝不得计入违规（P0）

依据 3.2.8，`voiceMsg` **不能复用现有 `checkRateLimit` 的 `recordViolation` 路径**。语音刷屏是正常玩家行为，而当前实现会在累计 5 次违规后 `ws.close(1008)`，局中断线又会触发托管与退出惩罚扣豆。

因此语音类拒绝必须是**无副作用的软拒绝**：

- 只回 `error { code, message, cooldownMs? }`，不递增 `violationCount`，不断连；
- 适用于 `VOICE_COOLDOWN` / `VOICE_RATE_LIMITED` / `VOICE_NOT_OWNED` / `VOICE_FORBIDDEN_STATE` / `VOICE_NOT_FOUND`；
- `VOICE_NOT_FOUND` 同样不计违规：客户端配置缓存过期、运营下线内容都会自然产生该错误，不应归因于玩家；
- 实现上不走 `COMMAND_RATE_LIMITS` 的通用拒绝分支，而在 `voiceMsg` 分支内自行判定并软回包。

注意连接级总闸 `maxMessagesPerWindow = 80`（10s）仍然生效且命中即 `fatal` 断连，但 10s / 6 次语音远低于该总闸，正常使用不会触发。

#### 10.2.2 参数选择依据

两点说明：

1. 现有账号级限流白名单不含 `voiceMsg`，断线重连即可获得全新连接级配额，必须补入账号级桶。
2. **限额必须与冷却对齐**：3 秒冷却意味着 10 秒内理论上可发 3～4 条，若限流也取 10s / 3 次，则正常节奏使用就会频繁撞限流（两道机制抢占同一额度，且限流的错误提示更突兀）。因此限流取 10s / 6 次，定位是「冷却被绕过时的兵底」，而非日常节奏的硬墙；真正控频率的是 3 秒冷却。
3. 仍取保守值而非完全放开：每条 `voiceMsg` 会 `broadcastAll` 给 3 名玩家，**出站消息放大 3 倍**。三人均按 3 秒节奏持续发送时，稳态出站约 3 帧/秒，在可接受范围内。

限流与冷却参数应集中配置，便于灰度调整：

```text
VOICE_CHAT = {
  cooldownMs:       3000,
  accountWindowMs:  10000,
  accountMax:       6,
  softRejectOnly:   true,   // 拒绝不计入违规、不断连（见 10.2.1）
}
```

#### 10.2.3 出站背压保护

依据 3.2.11，`broadcastAll` 不检查 `ws.bufferedAmount`。语音是首个「玩家可主动触发的高频广播」，因此在 `voiceMsg` 广播时增加背压判断：

- 单个接收方 `bufferedAmount` 超过阈值（建议 256KB）时**跳过该接收方**，不阻塞其余玩家，也不使发送方失败；
- 该保护只加在语音广播路径，不改动 `broadcastAll` 公共实现，避免影响出牌等关键帧的投递语义（关键帧宁可堆积也不能丢）。

这是本能力独有的取舍：**聊天可丢，牌局状态不可丢**。

### 10.3 功能开关与降级

沿用 `BOT_MATCH.enabled` 的开关范式（见 3.2.13），新增两级独立开关，均可在不发版的情况下止损：

```text
VOICE_CHAT_ENABLED = env DDZ_VOICE_CHAT_ENABLED  // 默认 true：语音发送总开关
VOICE_TRADE_ENABLED = env DDZ_VOICE_TRADE_ENABLED // 默认 false：购买入口总开关
```

- 两者**必须独立**：语音广播出问题时不应关掉商城（已购用户仍需可见持有态），交易出问题时也不应关掉免费互动语音；
- `VOICE_TRADE_ENABLED = false` 时，`buySku` 返回 `SKU_DISABLED`，但**已有权益仍然可用**——与 `saleEnabled` 同一语义（见 7.3），绝不回收权益；
- `VOICE_CHAT_ENABLED = false` 时，服务端不下发 `voiceConfig`，客户端隐藏入口而非报错；
- 交易开关默认 `false`：新增资金链路应显式开启，与 `DDZ_AUTH_MODE` 缺省取最严格模式的既有取向一致。

### 10.4 身份与资格

| 主体 | 互动语音 | 语音包购买 | 语音包使用 |
|---|---|---|---|
| 快手登录账号 | 允许 | 允许 | 购买后允许 |
| 游客账号 | 允许 | **禁止** | 无法获得权益 |
| 机器人 / 系统账号 | 本期不发送 | 天然禁止（`isReservedAccountId`） | 不适用 |

由于游客禁止购买，游客账号不会产生权益行，因此本期不需要权益表的游客数据清理任务。若未来开放游客购买或游客活动发放，需同步设计账号升级时的权益迁移策略。

### 10.5 座位状态

即使 `playerId` 仍在闭包中，以下状态一律禁止发送语音：

- `me.connected === false`（断线宽限期内）；
- `me.autoManaged === true`（托管中）；
- `me.detachedFromSession === true`（已主动离场，座位仅用于当前局托管结算）。

### 10.6 可观测性

现有服务端以 `console.log` / `console.warn` 输出结构化前缀日志（`[安全]`、`[GC]`、`[匹配]`），无独立指标端点。本期沿用同一方式，但必须保证以下事件可被检索，否则资金问题无法事后定位：

| 事件 | 级别 | 关键字段 |
|---|---|---|
| 购买成功 | log | `accountId`、`sku`、`priceBeans`、`balanceAfter`、幂等键 |
| 购买幂等命中 | log | `accountId`、`sku`（用于识别客户端重试风暴） |
| 余额不足 | log | `accountId`、`sku`、`availableBeans`（用于定价合理性分析） |
| `debitWalletExact` 等值校验失败 | **error** | 全量上下文；这是资金异常信号，必须能触发告警 |
| 权益加载失败 | warn | `accountId`、错误信息 |
| 语音软拒绝 | 不逐条打印 | 仅按分钟聚合计数，避免刷屏时日志自身成为放大器 |

最后一行是必要约束：若对每次软拒绝都 `console.warn`，刷屏场景下日志写入会成为新的性能瓶颈，与限流的初衷相悖。

## 11. 客户端方案

### 11.1 气泡改为服务端回声驱动

现状为乐观本地展示，且 `main.js` 中对 `fromId === myId` 直接忽略。这导致在未购买、冷却中或校验失败时，**发送者自己看到气泡并播放，房间内其他人毫无反应**，用户误认为已发送成功。

改造：

- 移除 `scene-voice.js` 中 `sendVoice` 的本地 `showVoiceBubble` 调用；
- 移除 `main.js` 中 `fromId === myId` 的过滤；
- 统一由服务端 `voiceMsg` 广播驱动展示，发送者与其他玩家表现一致；
- 失败时按错误码提示：`VOICE_NOT_OWNED` 引导购买，`VOICE_COOLDOWN` 提示稍后再试。

3 人房 RTT 很低，状态一致性收益大于这点延迟。

### 11.2 聊天面板

**Tab 1 互动语音**

- 不保留硬编码业务兜底；未收到 `voiceConfig` 时显示加载态。客户端离线时本就无法广播，保留可能与服务端漂移的 `voiceId` 只会制造 `VOICE_NOT_FOUND` 假可用状态；
- 收到服务端配置后点击发送，随后进入 3 秒置灰冷却。

**Tab 2 专属语音包**

- **移除本地兜底数据**。现有 `vp_1` 至 `vp_7` 在新结构下会成为服务端拒绝的幽灵 ID，且 `price` 字段语义已变；未收到 `voiceConfig` 时显示加载态。
- 已拥有：显示「已拥有」，点击发送 `defaultVoiceId`；
- 未拥有：显示服务端 `voiceConfig` 中由 Catalog 投影得到的 `priceBeans` 或 `promoLabel`，点击弹出确认「花费 100 铁豆购买该语音包？」；
购买请求发出后：

- 客户端生成 `requestId`，按钮进入 pending 并禁止同一 SKU 重复点击；
- 收到匹配 `requestId` 的 `purchaseResult` 后结束 pending；旧响应或其他 SKU 的响应不得结束当前请求；
- 所有业务失败也必须以 `purchaseResult { ok: false, requestId, code, message }` 返回，通用 `error` 只承载协议非法、未认证等连接级错误；
- 网络超时后允许使用**新的 `requestId`** 重试同一 SKU，服务端资金幂等不依赖 `requestId`，因此仍只扣一次；
- 断线重连时清空所有 pending，并以重新同步的 wallet / entitlements 为准，不等待旧连接响应。
- 购买成功：服务端先下发 `wallet` 和 `entitlements` 完整快照，再以 `purchaseResult` 结束本次交互；客户端刷新铁豆余额并切换为已拥有态；
- 铁豆不足：提示并引导现有获取路径（看广告、分享、破产补助）；
- 游客点击购买：直接提示需快手登录，不发送请求（服务端仍会拦截，构成双保险）；
- 客户端的权益快照必须按 `accountId` 分区；新连接收到 `authOk` 时，若 `accountId` 与当前缓存主体不同，立即清空旧账号的 wallet、entitlements、pending purchase 与 `lastEntitlementsSeq`，进入加载态；**不得在新账号权益加载失败时保留上一账号快照**；
- 权益加载失败仅可保留「同一 accountId、同一登录会话」的上一份快照，并禁用购买和付费语音入口，直至重试成功。

未来扩展为多条语音时，点击包行由「直接发送」改为「展开语音列表」，协议无需变更。

### 11.3 大厅入口

`scene-home.js` 中语音包入口当前为 `flash('语音包功能即将上线~')` 占位，改为打开语音包商城（可复用 Tab 2 渲染）。

### 11.4 音频播放

**弃用手写 `playVoiceUrl`，并在 `KwaiMedia.Audio` 内新增专用 `playVoice(src, options)` / `stopVoice()`。** 不直接复用 `playSfx`：现有音效池上限为 10，网络语音 URL 会占用 LRU 配额并可能挤掉牌型、点击等高频音效；同时 `playSfx` 不暴露 ended 回调，无法可靠恢复 BGM。

`playVoice` 在音频模块内部维护一个专用单实例，统一处理：

| 问题 | 解决方式 |
|---|---|
| H5 无声 | 复用模块内部 `_createSfxAudio()` 的快手 / Web 双端路径 |
| 未尊重音效开关 | 在模块内部检查私有 `_audioSettings.sfxEnabled` |
| 语音与 BGM 混音 | 模块内部读取当前 BGM 实例音量并完成 duck / restore |
| 连续语音竞态 | 每次播放生成序号；旧语音的 ended 回调不得恢复或覆盖新语音状态；整个连续语音会话只捕获一次 BGM 基线 |

BGM 降音由 `playVoice` **内部**完成，场景层不读取 `_audioSettings`。这里必须区分「单次播放序号」与「连续语音会话基线」：

```text
第一条语音开始：
  if voiceSessionOrigin == null:
    voiceSessionOrigin = _bgm ? _bgm.volume : _audioSettings.bgmVolume
  playSeq += 1
  fadeBgm(min(voiceSessionOrigin, 0.3), 300)

新语音打断旧语音：
  playSeq += 1
  保留 voiceSessionOrigin，不从当前已被压低的 _bgm.volume 重新取值
  停止旧语音并播放新语音

当前序号对应的语音结束/失败：
  fadeBgm(voiceSessionOrigin, 500)
  voiceSessionOrigin = null
```

如果每条语音都重新执行 `origin = _bgm.volume`，第二条语音在第一条已降至 `0.3` 后到达时会把 `0.3` 误当成用户原音量，最终永久恢复到 `0.3`。因此序号只能防旧回调覆盖新状态，**不能替代会话级基线**。

其他要求：

- 新语音到达时停止并解绑旧语音，再播放新语音，不叠加；
- 快手端同时处理 `onEnded` / `onError`，Web 端处理 `ended` / `error`，保证失败时也恢复 BGM；
- `destroyAll()` 必须同时销毁专用语音实例并清理回调；
- 设置功能当前虽为占位，但实现仍需保留未来音量配置兼容性。

## 12. 实施顺序

| 阶段 | 内容 | 独立性 |
|---|---|---|
| 0 | 客户端先支持 v1/v2 `voiceConfig` 解析、在 `auth` 上报 capability、移除本地语音兜底与自由文本字段；服务端尚未切换 DTO | **必须最先发布**；覆盖率达标前不得执行阶段 1 |
| 1 | 服务端 `voice-config.js` 重构 + 双索引 + 按 capability 下发 v1/v2 DTO；`voiceMsg` 关闭自由文本、修复任意 `vp_*` 可广播、补齐座位状态校验、限流收紧**并同时改为软拒绝** | 阶段 0 覆盖率达标后可独立上线，修复现存缺陷 |
| 2 | `user_entitlements` MySQL 建表 + 迁移 SQL + 纳入 `REQUIRED_MYSQL_TABLES` + `entitlement-store.js` | 可独立验证 |
| 3 | `wallet-store.js` 新增 `lockWalletForUpdate` / `debitWalletExact`；`trade/catalog.js` + `trade/purchase.js` + 单元测试 | 可独立验证 |
| 4 | `index.js` 接入 `buySku` / `entitlements` / 游客拦截 / 限流冷却 | e2e 验证 |
| 5 | 客户端面板购买态、确认弹窗、回声驱动气泡、大厅入口 | H5 手工验证 |
| 6 | 客户端音频改走 `KwaiMedia.Audio` + BGM 降音与原值恢复 | H5 听声验证 |
| 7 | 补齐单元测试、e2e 与自测报告 | 全量回归 |

阶段 0 是滚动升级硬门禁：先让新客户端具备 v1/v2 双读能力并开始上报 capability；观测覆盖率达到发布阈值后，阶段 1 才允许切换服务端配置结构。阶段 1 随后优先落地，它修复的是当前已存在的两个缺陷（任意 `vp_*` 可被广播、40 字自由文本无风控），不依赖交易能力。但注意：**限流收紧与软拒绝必须同一次发布**，否则先收紧后改拒绝方式会在中间窗口期引入 10.2.1 描述的踢出局事故。

### 12.1 迁移与上线顺序约束

依据 3.2.12，仓库没有自动迁移执行器，`assertMysqlSchemaReady` 失败时只提示「Ask DBA to apply」。因此必须按固定顺序上线：

```text
1. DBA 应用 `scripts/migrations/20260813_trade_entitlements.sql`（先于代码发布）
2. 发布代码，此时 DDZ_VOICE_TRADE_ENABLED 仍为 false
3. 校验 assertMysqlSchemaReady 通过、服务正常启动
4. 打开 DDZ_VOICE_TRADE_ENABLED 灰度放量
```

配套要求：

- **建表 SQL 必须幂等**（`CREATE TABLE IF NOT EXISTS`），允许重复执行；
- 迁移文件必须补齐 MySQL 迁移路径（`migrateMysql`）和独立 migration SQL；禁止新增 SQLite 建表路径或双方言实现；
- 交易开关默认关闭，用于在迁移已完成、代码已发布且 schema 门禁通过后控制灰度流量；`user_entitlements` 已纳入 `REQUIRED_MYSQL_TABLES`，因此**缺表必须启动失败，不允许靠关闭交易开关绕过 schema 门禁**。

开关的价值是把「代码发布」与「流量开启」解耦，并提供运行期止损；它不替代 DBA 迁移，也不降低启动时的结构完整性要求。

## 13. 验收清单

### 13.1 资金正确性

- [x] 余额不足：不扣款、不发货、返回 `INSUFFICIENT_BEANS`
- [x] 余额恰好等于价格：可购买成功
- [x] 重复点击购买：仅扣款一次，第二次返回幂等成功（`owned=true, charged=false`）
- [x] 并发发送两次同一 `buySku`：复合主键与幂等键保证仅成功一次，两次请求最终都得到一致的已拥有状态
- [x] `priceBeans = 0`：不产生钱包流水，权益正常发放且 `source = 'free_claim'`
- [x] `wallet_ledger` 存在 `sku_purchase` 记录，`meta_json` 含 `sku` 与来源上下文
- [x] 非法 `source` / `roomId` 无法污染购买审计上下文，服务端只记录白名单或自行推导的值
- [ ] Catalog 设置 `saleEnabled=false` 后禁止新购买，但已购用户仍可发送；设置 `contentEnabled=false` 后所有用户均不可发送
- [ ] Catalog 调价后，客户端展示价格与实际扣款价格保持一致，无第二份金额配置
- [ ] 模拟 `applyWalletDelta` 部分扣款：`debitWalletExact` 等值校验触发抛错，事务回滚，权益未发放
- [ ] 购买外层事务内 ledger 唯一键冲突：整个事务先回滚，再在事务外读取既有权益；不存在「已扣款但未发权益」或在失败事务中继续查询
- [x] 两个并发请求同时为无钱包账号购买：钱包仅创建一次、仅扣款一次、仅发放一份权益
- [x] 重复购买时 `purchaseResult.priceBeans` 返回权益行的获得时价格，不随 Catalog 后续调价漂移

### 13.2 权益正确性

- [ ] 未购买时发送包内语音：被拒，返回 `VOICE_NOT_OWNED`
- [ ] 购买后发送包内语音：成功，房间内三端可见文案、可听语音
- [x] `voiceConfig` 不含任何用户态字段，A 用户持有状态不会泄漏给 B
- [x] 游客购买：返回 `GUEST_PURCHASE_FORBIDDEN` 并引导登录
- [x] 权益缓存未命中时正确回查数据库
- [x] auth 权益查询与购买并发乱序时，旧快照被 generation/seq 丢弃，不会把已拥有覆盖回未拥有
- [x] 同一设备切换账号时，旧账号 wallet / entitlements / pending / seq 全部清空；新账号加载失败也不展示旧账号权益

### 13.3 聊天与状态

- [ ] 互动语音免费可发，房间内三端可见可听
- [ ] 3 秒冷却生效，回包携带 `cooldownMs`，客户端按钮置灰
- [ ] **连续快速点击语音超过 5 次：仅得到软拒绝提示，连接不断开、不进入托管、不产生退出惩罚扣费**
- [x] 账号级限流生效，断线重连无法绕过
- [x] 托管中玩家无法发送语音
- [ ] `waiting` / `ready` / `bidding` / `playing` / `settlement` 中的有效在线座位均可发送
- [ ] 主动离场后无法发送语音
- [ ] 断线重连后 `voiceConfig` 与 `entitlements` 重新下发，功能可用
- [x] 非法 `voiceId` 被拒绝，返回 `VOICE_NOT_FOUND`
- [x] 上报 `text` 字段被忽略，不会广播任意文本
- [x] `buySku` / `getEntitlements` 已在 `ALLOWED_MESSAGE_TYPES` 中，不会被当作未知协议类型拒绝
- [x] 每一种合法购买业务失败都返回匹配 `requestId` 的 `purchaseResult`，按钮立即结束 pending；终帧超时会释放 pending 并重新同步权益
- [x] 超时重试使用新 `requestId` 时仍只扣一次；晚到的旧响应不会结束新请求

### 13.4 客户端体验

- [ ] H5 与快手小游戏双端均可听到语音
- [ ] 语音播放期间 BGM 降音，播完恢复到**用户设定值**而非 `1.0`
- [x] 关闭音效开关时不播放语音
- [x] 不出现「自己有气泡、其他人没有」的假成功
- [x] 语音包 tab 在未收到配置时不展示入口和幽灵 ID
- [x] 第一条语音 duck 后立刻被第二条打断：第二条结束时 BGM 恢复到最初用户音量，而非停留在 0.3
- [x] 旧客户端未声明 capability 时收到 v1 DTO 可正常使用免费互动语音；新客户端收到 `schemaVersion=2` DTO
- [x] 服务端切换期间客户端能同时解析 v1/v2，不因滚动升级出现白屏或不可发送

### 13.5 扩展性回归

- [ ] 在配置中为某个 pack 的 `voices[]` 增加第二条语音后，**服务端与协议无需任何改动**即可正常发送该语音
- [ ] 新增一个已受支持的权益型 SKU 时，仅需增加 Catalog 与对应内容配置，`purchase.js` 无需改动；新增新的商品类型时需先扩展 Catalog 类型白名单及其发放/展示边界
- [x] MySQL 方言下漏建 `user_entitlements` 时，`assertMysqlSchemaReady` 在启动阶段即报错，而非首次购买才失败
- [x] Catalog/语音配置存在重复 ID、悬空 SKU、错误 `defaultVoiceId`、非法 URL 或负价格时，服务启动立即失败
- [x] `DDZ_VOICE_TRADE_ENABLED=false` 时购买入口不可用，但已购用户仍可正常发送语音
- [x] `DDZ_VOICE_CHAT_ENABLED=false` 时语音入口隐藏，牌局其余功能不受影响

### 13.6 稳定性

- [ ] 三人以最快合法节奏持续发送语音 5 分钟：服务端内存与 CPU 平稳，无连接被动断开
- [ ] 模拟单个客户端不消费消息（`bufferedAmount` 堆积）：该玩家被跳过，其余玩家语音与**出牌广播均正常**
- [ ] 语音软拒绝高频发生时，日志按聚合输出，不逐条刷屏

## 14. 演进条件

出现以下任一情况时，再引入 `orders` 表，且改动仅影响 `purchase.js` 内部，上层协议与权益模型保持不变：

1. 接入真实货币支付；
2. 扣款与发货无法在同一数据库事务内完成；
3. 需要退款、撤单或人工补发流程；
4. 商品可重复购买，且每笔购买具有独立生命周期；
5. `wallet_ledger` 与 `user_entitlements` 无法满足购买历史展示需求。

在当前语音包场景下，`wallet_ledger` 与 `user_entitlements` 的组合已经足够。

### 14.1 已知的演进代价：幂等键不可回收

本期幂等键为 `purchase:{sku}:{accountId}`，是「一人一 SKU 一次」的**终身唯一键**。这带来一个必须提前记录的后果：

> **一旦发生退款/撤销，该账号将永久无法再次购买同一 SKU**——因为幂等键已被占用，重新购买会命中 `onHit` 分支而被判为「已购买」，不会真实扣款。

这不是当前设计的缺陷（本期不支持退款，是明确的范围约定），但必须写明未来的迁移路径，避免届时误改幂等键规则导致重复扣款：

| 演进需求 | 正确做法 | 错误做法 |
|---|---|---|
| 支持退款后重新购买 | 幂等键追加轮次：`purchase:{sku}:{accountId}:{purchaseSeq}`，`purchaseSeq` 由权益表或订单表维护 | 直接删除旧流水行以「释放」幂等键——会破坏账本不可变性与审计链 |
| 支持人工补发 | 走 `source = 'grant'` 的独立发放路径，不复用购买幂等键 | 用运营账号代购 |
| 支持权益撤销 | 权益表标记状态而非删除行，并同步为正向缓存增加 TTL 或失效通知 | 直接 `DELETE` 权益行——已缓存的连接仍会放行 |

关联约束：5.4 的幂等键工厂已预留 `periodId` / `clientRequestId` 扩展位，正是为此准备的；但**扩展键格式时必须保证旧键继续有效**，不得改写历史键的生成规则，否则已购用户会被判为未购买并再次扣款。

## 15. 遗留事项

| 事项 | 状态 | 说明 |
|---|---|---|
| 正式音频 CDN 地址 | 待提供 | 本期沿用测试链接，上线前必须替换为自有 CDN，并确认快手小游戏域名白名单与 H5 跨域 |
| 语音包主播头像 | 待提供 | 现为统一占位图 |
| 语音包定价策略 | 待确认 | 当前设计支持逐包定价；免费领取包是否设置数量上限待定 |
| 语音包试听 | 本期不做 | 若需支持，需单独配置 `previewUrl` |
| 自定义文本聊天 | 本期关闭 | 若开放，必须补齐敏感词过滤与消息留档 |
| 权益过期回收 | 本期不做 | `expires_at` 已建表预留 |
| 机器人发送语音 | 本期不做 | 若开放，仅允许互动语音，且需独立限流防止机器人互刷 |
| 多进程部署 | 未来 | 权益未命中回查数据库并使用短 TTL 负缓存；启用过期/撤销后需增加正向缓存 TTL 或集中失效通知 |
