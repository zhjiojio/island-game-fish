# 斗地主机器人补位与统一自动决策系统技术设计

> 文档状态：评审稿  
> 适用 APPID：`ks699465320497476962`  
> 适用游戏：老铁斗地主  
> 设计版本：`v1.0`  
> 更新时间：2026-08-10  
> 关联模块：快速匹配、联机房间、自动出牌、离线托管、铁豆钱包、对局审计  
> 当前阶段：仅设计，不包含业务代码实现

## 1. 背景与目标

### 1.1 背景

当前快速匹配按场次维护内存队列，凑满 3 名真人后创建房间并下发 `matchFound`。客户端本地维护 60 秒匹配倒计时，超时后主动取消。服务端已具备：

- 服务端权威发牌、叫地主、出牌、过牌与结算；
- 真人单回合超时自动行动；
- 真人退出或断线后的离线托管；
- `findAutoPlayCardIds`、`findLeadCardIds`、`findBeatCardIds` 等基础自动出牌策略；
- `actionLock` 与 `autoActionSeq`，用于防止同一回合重复行动和过期定时器执行；
- MySQL 钱包、流水、幂等写入与对局审计。

低并发时，三人匹配难以稳定凑齐，导致用户等待超时和流失。本设计引入服务端机器人补位，同时将现有“提示、超时自动出牌、离线托管、机器人决策”抽象为统一自动决策能力。

### 1.2 核心目标

1. **缩短有效等待**：单真人等待约 30 秒仍未成团时补 2 个机器人；双真人等待更久仍未成团时补 1 个机器人。
2. **真人优先**：三名真人一旦凑齐立即成团，机器人仅作为低流量兜底。
3. **无感拟真**：客户端不下发机器人标识，不出现“机器人”“托管中”“托管出牌”等暴露性表现。
4. **公平决策**：机器人不能读取其他玩家隐藏手牌，不修改发牌，不预设单局输赢。
5. **体验友好**：1 真人 + 2 机器人模式下，真人总体目标胜率约 70%，即对立机器人阵营目标胜率约 30%；通过决策水平校准实现，不操纵牌面。
6. **经济安全**：机器人不创建普通账号或普通钱包；系统资金流可审计、可对账、幂等且守恒。
7. **统一能力**：机器人、离线托管和真人超时共用同一套观察、合法动作与决策引擎，调度和公开语义保持隔离。
8. **稳定可控**：机器人异常不能卡住房间；支持灰度、熔断、分场次关闭和快速回滚。

### 1.3 非目标

本期不包含：

- 大师场机器人补位；
- 基于机器学习或大模型的在线出牌；
- 修改发牌结果以控制胜率；
- 跨服务分布式匹配集群；
- 客户端展示机器人标签；
- 机器人社交聊天、表情或语音；
- 对历史对局进行机器人补录。

## 2. 已确认产品决策

| 决策项 | 结论 | 状态 |
|---|---|---|
| 单真人补位 | 等待中心值 30 秒后补 2 个机器人 | 已确认 |
| 双真人补位 | 使用更长阈值，中心值 90 秒后补 1 个机器人 | 已确认 |
| 阈值拟真 | 单真人 28～36 秒、双真人 80～105 秒，按请求固定随机抖动 | 设计建议 |
| 客户端机器人标识 | 不下发，玩家无感知 | 已确认 |
| 机器人拟真能力 | 人格、牌力、思考延迟、次优动作、准备节奏全部实现 | 已确认 |
| 目标胜率 | 1H+2B 模式中真人总体 68%～72%，对立机器人阵营约 30% | 已确认 |
| 2H+1B 胜率 | 使用中性策略，不做定向胜率控制 | 设计约束 |
| 开放场次 | 初级场、中级场；大师场关闭 | 已确认 |
| 退出惩罚 | 机器人局免额外退出罚款 | 已确认 |
| 逃局处理 | 已开始牌局必须托管完成当前局并正常结算 | 安全约束 |
| 春天/反春 | 保留；降低失误率，关键残局零失误 | 已确认 |
| 日额度 | 单账号每日最多 20 场机器人局、正向收益累计最多 30000 铁豆 | 已确认 |
| 数据库 | 允许新增表，生产走 DBA 流程 | 已确认 |
| 实施范围 | 全量设计，一次完成核心能力，按灰度阶段开放 | 已确认 |

> 说明：本文统一使用 `1H+2B` 表示 1 名真人 + 2 个机器人，`2H+1B` 表示 2 名真人 + 1 个机器人。

## 3. 现状与关键约束

### 3.1 当前匹配模型

当前服务端：

```text
quickMatch
  → 按 roomType 进入 matchQueues
  → queue.length >= 3
  → 取前三名真人
  → 创建房间
  → 向三人下发 matchFound
  → 客户端发送 join
```

主要问题：

- 队列以 `ws` 判重，同账号多连接可能重复排队；
- 客户端 60 秒自行取消，与双真人 90 秒补位冲突；
- 匹配完成后没有账号预约票据，房间号可能被非匹配用户抢占；
- 匹配中断线后缺少会话恢复；
- 补位过程中存在异步查询，可能与取消、入队、断线发生竞态。

### 3.2 当前自动行动模型

现有自动能力包含：

- 真人单回合超时；
- 真人退出/断线后托管；
- 自动主动出牌和最小压牌；
- 农民队友保护；
- 炸弹/王炸保守策略；
- `actionLock`、`autoActionSeq` 与行动定时器。

当前自动逻辑直接接收完整 `room`，并通过 `isAuto` 布尔值混合表达“超时、托管、机器人”等不同语义。机器人接入前需要拆分为观察、决策、调度、执行四层。

### 3.3 当前经济模型

- 真人钱包由服务端权威维护；
- 钱包写入通过 `wallet_ledger.idempotency_key` 防重；
- 结算按输家实际可扣余额计算总赔付，再分配给赢家；
- 赢家收益按场次抽水；
- 正式 MySQL 不自动建表，所有 schema 变更必须走 DBA 流程。

机器人不能直接复用普通钱包，否则会产生幽灵账号、新手豆污染和审计混乱。

## 4. 总体架构

```text
客户端
  ├─ Matchmaking UI
  ├─ WebSocket Client
  └─ Game UI
          │
          ▼
WebSocket 协议网关
  ├─ auth / session
  ├─ schema 校验与限流
  └─ connection messageChain
          │
          ▼
匹配编排层 Matchmaking Orchestrator
  ├─ 按场次队列
  ├─ 账号唯一匹配会话
  ├─ 30s / 90s 补位调度
  ├─ 房间预约与 joinTicket
  ├─ 重连恢复
  └─ 场次级串行锁
          │
          ▼
房间与回合控制 Room Engine
  ├─ waiting / ready / bidding / playing / settlement
  ├─ actionLock
  ├─ autoActionSeq
  ├─ 回合硬超时
  └─ 房间生命周期回收
          │
          ▼
统一自动决策层 Game AI
  ├─ Observation：仅可见信息
  ├─ Legal Actions：合法动作候选
  ├─ Strategy：叫分 / 主动出牌 / 跟牌
  ├─ Persona：性格和水平
  └─ Controller Profile：bot / managed / timeout / hint
          │
          ▼
统一动作执行层
  ├─ applyBid
  ├─ applyPlayCards
  ├─ applyPass
  └─ 复用服务端牌型校验与 actionLock
          │
          ▼
经济与审计层
  ├─ Wallet Store
  ├─ Bot Treasury
  ├─ Bot Risk Stats
  ├─ Match Store
  └─ Match Participants / Events
```

### 4.1 模块边界

建议新增或拆分：

```text
server/
├── matchmaking/
│   ├── orchestrator.js       # 队列、阈值、成团、串行编排
│   ├── session-store.js      # 匹配会话与账号唯一性
│   ├── reservation.js        # joinTicket 生成、校验、过期
│   └── config.js
├── game-ai/
│   ├── observation.js        # 从 room 构造安全观察对象
│   ├── legal-actions.js      # 合法候选动作
│   ├── strategy.js           # 通用自动决策
│   ├── personas.js           # 人格与技能配置
│   ├── controller.js         # bot/managed/timeout/hint profile
│   └── random.js             # 可注入 RNG
├── bots/
│   ├── bot-factory.js        # 身份、昵称、头像、虚拟展示余额
│   ├── bot-scheduler.js      # 思考延迟、行动、watchdog
│   └── bot-lifecycle.js      # 入座、准备、离场、回收
├── persistence/
│   ├── bot-stats-store.js
│   ├── treasury-store.js
│   ├── match-store.js
│   └── wallet-store.js
└── index.js                  # 协议入口与模块装配，逐步瘦身
```

### 4.2 控制器类型

内部统一字段：

```text
controllerType = human | managed | bot | timeout
```

| 类型 | 含义 | 决策配置 | 公开状态 |
|---|---|---|---|
| `human` | 在线真人 | 用户输入 | 正常在线 |
| `managed` | 退出/断线后的真人托管 | 稳健策略，约 1.2s 延迟 | `autoManaged=true` |
| `bot` | 匹配补位机器人 | 人格化中等水平，长尾延迟 | `connected=true`, `autoManaged=false` |
| `timeout` | 真人单回合超时 | 安全兜底策略 | 显示超时自动行动 |

`isBot` 和机器人人格仅为服务端私有字段，不进入 `PUBLIC_PLAYER_FIELDS`。

## 5. 匹配编排设计

### 5.1 匹配会话模型

```js
MatchSession = {
  matchRequestId,
  accountId,
  ws,
  roomType,
  nickname,
  avatarUrl,
  loginType,
  status,               // queued | assembling | reserved | joining | active | cancelled | expired | failed
  joinedAt,
  soloFillAt,
  duoFillAt,
  reconnectToken,
  reservationId,
  createdAt,
  updatedAt,
}
```

服务端维护：

```text
matchSessionsByAccount: Map<accountId, MatchSession>
matchQueues: Map<roomType, MatchSession[]>
matchmakingChains: Map<roomType, Promise>
```

### 5.2 账号唯一性

- 同一账号同时只能有一个有效匹配会话；
- 同一账号不能同时占据两个房间；
- 新连接发起 `quickMatch` 时，如存在旧匹配会话：
  - 同一会话且可恢复：迁移到新 `ws`；
  - 已在房间：返回已有房间恢复信息；
  - 另一个活跃会话：拒绝或原子取消旧会话后建立新会话；
- 禁止仅按 `ws` 判重。

### 5.3 补位阈值

阈值在创建匹配会话时生成一次，避免队列变化时反复改变：

```text
1H：28～36 秒，中心约 30 秒
2H：80～105 秒，中心约 90 秒
```

逻辑：

```text
queue.length >= 3
  → 真人三人立即成团

queue.length == 2
  → 以最早 joinedAt 和其 duoFillAt 为准
  → 达到双人阈值后补 1 个机器人

queue.length == 1
  → 以该玩家 soloFillAt 为准
  → 达到单人阈值后补 2 个机器人
```

队列人数变化时：

- 1 人已等 25 秒，第 2 人加入：切换到双人阈值，不重置最早玩家等待起点；
- 2 人等待中 1 人取消，剩余玩家已超过单人阈值：立即进入 1H+2B 组装；
- 第 3 个真人在机器人组装提交前入队：真人三人局优先。

### 5.4 场次级串行编排

每个 `roomType` 维护 Promise chain。以下操作必须在同一串行链内完成：

- 入队；
- 取消；
- 断线移除或恢复；
- 真人三人成团；
- 机器人补位资格查询；
- 从队列原子取人；
- 房间预约创建；
- 失败回滚与重新入队。

异步数据库查询完成后，必须重新校验：

- session 仍为 `queued`；
- `ws` 仍有效或处于允许恢复窗口；
- accountId 仍未进入其他房间；
- 队列版本未变化，或在锁内重新计算成团条件。

### 5.5 房间预约与 joinTicket

匹配房不允许仅凭 6 位房间号入座。成团后为每个真人生成一次性票据：

```js
Reservation = {
  reservationId,
  roomId,
  accountId,
  matchRequestId,
  ticketHash,
  expiresAt,
  consumedAt,
}
```

`matchFound` 下发明文 `joinTicket`，服务端仅保存 HMAC/哈希。客户端 `join` 必须携带票据。

票据安全要求：

- 使用密码学安全随机源生成至少 128 bit 熵，不使用 `Math.random()`；
- 明文票据只下发一次，不写日志、不写事件、不持久化；
- 服务端使用独立用途密钥计算 HMAC，不能复用 auth/session 主密钥；
- 校验使用恒定时间比较，降低时序侧信道；
- 票据与 `accountId + roomId + matchRequestId + expiresAt` 绑定；
- 消费和座位占用必须在同一串行编排临界区内完成。

校验：

1. 当前 auth 绑定账号与预约账号一致；
2. 房间、匹配请求与票据匹配；
3. 未过期、未消费；
4. 座位仍为该账号保留；
5. 原子标记为已消费。

预约建议 15 秒有效。好友房/手动房保持原房间号逻辑，匹配房强制票据。

### 5.6 组装与失败恢复

```text
queued
  → assembling
  → reserved
  → joining
  → active
```

- 机器人不应在真人预约成功前启动牌局；
- 1H+2B：真人预约超时则撤销房间，恢复原匹配会话或结束匹配；
- 2H+1B：
  - 两名真人都加入：正常激活；
  - 仅一名加入：另一人预约过期后，可在风控通过时降级为 1H+2B；
  - 无人加入：立即回收；
- 失败重新入队时保留原始 `joinedAt`，避免用户重新等待完整阈值。

### 5.7 匹配重连

新增 `resumeMatch` 协议：

```text
WebSocket 重连 → authOk → resumeMatch { matchRequestId? }
```

服务端按 auth accountId 查找有效会话：

- `queued`：迁移 `ws`，返回 `matchWaiting`；
- `reserved/joining`：重新下发尚未消费的 `matchFound` 票据；
- `active`：返回房间恢复信息，走现有重连；
- `cancelled/expired`：返回无有效匹配；
- 网络断线保留会话 15 秒；用户明确 `cancelMatch` 后不可恢复。

## 6. 客户端匹配体验

### 6.1 服务端权威超时

客户端不再在 60 秒后主动决定取消。服务端负责：

- 真人优先成团；
- 补位阈值；
- 最终匹配过期；
- 机器人补位；
- 匹配恢复。

客户端保留 180 秒网络异常兜底，但连接正常时不得自行取消。

### 6.2 不暴露阈值

不显示“剩余 30 秒”或固定倒计时，避免用户识别机器人阈值。展示已等待时间或无数字动画：

| 等待阶段 | 建议文案 |
|---|---|
| 0～10 秒 | 正在寻找实力相近的玩家… |
| 10～25 秒 | 正在扩大匹配范围… |
| 25 秒以后 | 即将匹配成功，请稍候… |

不出现“机器人”“智能对手”“托管”等字样。

### 6.3 渐进入场

机器人在房间内错开 0.9～3.5 秒逐个入座，避免两个机器人同帧出现。要求：

- 同房昵称、头像不重复；
- 两个机器人人格、思考速度尽量不同；
- 入场通知与真人一致；
- `connected=true`、`autoManaged=false`；
- 不下发 `isBot`。

### 6.4 准备与连局

- 首局机器人入座后 1～3 秒模拟准备；
- 结算后机器人先 `ready=false`，2～5 秒后模拟准备；
- 真人有时间查看结算、领取破产补助或退出；
- 同一机器人房最多连续 3 局，之后返回匹配大厅；
- 机器人展示余额跨局连续变化，不能每局重置；
- 机器人余额低于场次准备门槛时模拟离开并补新对手。

## 7. 统一自动决策引擎

### 7.1 安全观察对象

机器人和自动策略不得接收完整 `room`。统一构造只读观察：

```js
Observation = {
  phase,
  self: {
    playerId,
    seat,
    role,
    hand,
    handCount,
  },
  publicState: {
    seats,
    dealer,
    currentPlayerId,
    bidState,
    lastPlay,
    handCounts,
    landlordCardsVisible,
    multiplier,
    roundNo,
  },
}
```

禁止包含：

- 其他玩家具体手牌；
- 叫地主完成前的地主底牌；
- 随机数生成器未来状态；
- 资金、身份、IP 等非牌局信息。

### 7.2 统一接口

```js
decideAction(observation, controllerProfile) => {
  type: 'bid' | 'playCards' | 'pass',
  score: 0 | 1 | 2 | 3,
  cardIds: [],
  meta: {
    confidence,
    reason,
    mistakeApplied,
    strategyVersion,
  },
}
```

所有返回动作仍必须进入现有：

- `applyBid`；
- `applyPlayCards`；
- `applyPass`。

禁止策略层直接修改 `room.hands`、`room.currentPlayerId` 或倍数。

### 7.3 能力复用

现有自动能力迁移为纯策略函数：

- 手牌排序与牌型分析；
- 主动出牌候选；
- 同牌型最小压牌；
- 炸弹/王炸兜底；
- 农民队友保护；
- 地主低牌拦截。

不同控制器只改变 profile：

| Profile | 主要目标 |
|---|---|
| `bot_solo_fill` | 中等偏弱、拟真、让真人体验良好 |
| `bot_duo_fill` | 中性、公平，不定向输给任一真人 |
| `managed` | 稳健完成牌局，尽量不伤害用户资产 |
| `timeout` | 最安全合法动作，快速兜底 |
| `hint` | 推荐较优动作，但不自动执行 |

### 7.4 人格模型

```js
Persona = {
  id,
  bidAggression,
  riskPreference,
  cooperatePreference,
  powerPlayPreference,
  thinkSpeed,
  skillLevel,
  baseMistakeRate,
}
```

建议至少三类：

| 人格 | 叫地主 | 用炸弹 | 配合 | 思考速度 |
|---|---|---|---|---|
| 激进型 | 较高 | 较积极 | 中 | 较快 |
| 稳健型 | 中 | 关键时使用 | 高 | 中 |
| 保守型 | 较低 | 谨慎 | 高 | 较慢 |

### 7.5 牌力评估与叫地主

牌力评估只使用机器人自己的 17 张手牌，考虑：

- 大小王；
- 2、A 等高牌；
- 炸弹；
- 三张、对子密度；
- 顺子/连对/飞机潜力；
- 孤张数量；
- 人格叫地主倾向。

机器人叫分应依据牌力和当前最高叫分，不使用固定 20% 随机。允许少量人格化竞争行为，但不能在明显弱牌时频繁叫 3 分。

### 7.6 次优动作与失误率

保留春天/反春规则，通过降低失误率和关键局面零失误控制异常春天率。

| 局面 | 失误率上限 |
|---|---:|
| 普通出牌 | 4%～6% |
| 叫地主 | 3%～5% |
| 任一玩家剩 ≤5 张 | 1%～2% |
| 对手剩 ≤2 张 | 0% |
| 自己可一手走完 | 0% |
| 农民队友可明显走完 | 0% |
| 炸弹/王炸关键决策 | ≤2% |

失误必须从合法次优动作中选择，例如保留大牌、出较差组合或合理放过一手；禁止非法出牌、拆王炸式明显送牌或关键残局故意失败。

### 7.7 思考延迟

采用长尾分布而非固定延迟：

| 动作 | 常见耗时 |
|---|---:|
| 不叫/不出 | 500～1400ms |
| 简单跟牌 | 700～1800ms |
| 主动出牌 | 1200～3000ms |
| 关键残局 | 1800～4500ms |
| 少量犹豫 | 最长约 6000ms |

- 大部分动作使用 0.7～1.3 倍抖动；
- 约 8% 行动使用 2～3 倍长尾思考；
- 客户端 `actionTimeoutMs` 仍展示真人完整时间，机器人实际提前行动；
- 每个人格拥有不同速度系数。

### 7.8 胜率定义与校准

“机器人 30% 胜率”只对 `1H+2B` 做宏观定义：

```text
真人总体胜率目标：68%～72%
真人对立阵营胜率目标：约 30%
```

必须分别监控：

- 真人当地主胜率；
- 真人当农民胜率；
- 真人总体胜率；
- 春天/反春发生率；
- 不同人格组合胜率。

`2H+1B` 中两名真人可能位于不同阵营，不做定向胜率控制，机器人采用中性策略。

胜率通过以下方式离线校准：

- `skillLevel`；
- 合法次优动作概率；
- 叫地主阈值；
- 风险偏好；
- 农民配合倾向。

禁止通过改牌、看底牌、看对手手牌或单局强制输赢实现。

## 8. 机器人调度与动作执行

### 8.1 调度分流

`startActionTimer(room)` 根据当前行动者的 `controllerType` 分流：

```text
human
  → 正常 15s/30s 行动窗口
  → 超时后 timeout profile 自动行动

managed
  → 约 1.2s 后使用 managed profile

bot
  → human-like delay 后使用 bot profile
  → 对客户端表现为正常真人行动
```

机器人调用 `apply*` 时不使用公开的“托管”文案；内部事件仍记录 `controllerType=bot`。

### 8.2 并发与代际校验

- 继续复用 `room.actionLock`，任何自动动作和真人消息最终均通过同一动作执行函数；
- 继续复用 `room.autoActionSeq`，每次重新调度递增版本；
- 定时器执行前校验：房间仍存在、阶段未变、当前行动者未变、seq 未过期；
- 乐观检查失败不能只 `return`，必须确保当前回合仍存在有效定时器或 watchdog。

### 8.3 Watchdog 降级

每次机器人行动同时启动硬兜底：

```text
正常机器人延迟触发
  → executeBotAction
  → 成功后推进回合并清理 watchdog

若机器人策略抛异常或未推进回合
  → watchdog 在真人行动超时 + 1.5s 触发
  → 降级到现有 timeout profile
  → 保证房间不因机器人卡死
```

需要监控 watchdog 触发率，目标接近 0。

## 9. 房间生命周期与退出规则

### 9.1 活跃真人定义

```js
activeHuman = !player.isBot && player.connected && !player.autoManaged
```

不能仅按 `!isBot` 统计，因为退出后托管的真人已不再活跃。

### 9.2 牌局开始前退出

- 不收退出罚款；
- 释放冻结；
- 已收门票按现有幂等机制退款；
- 取消该玩家预约；
- 其余真人可重新入队并保留原等待起点；
- 房间无真人则立即回收。

### 9.3 牌局开始后退出或断线

机器人局免额外退出罚款，但不能允许逃避当前局输赢：

```text
真人主动退出
  → 不收 exit_penalty
  → 转为 managed 托管
  → room.closeAfterSettlement = true（当无活跃真人时）
  → 托管完成当前局
  → 正常结算当前局
  → 结算后立即回收，不开下一局
```

断线保留现有 30 秒重连宽限；宽限内重连可恢复操作，超时后托管完成当前局。

### 9.4 冻结规则

- `1H+2B`：免退出罚款，因此不冻结退出罚款担保金额；
- `2H+1B`：一名真人退出会损害另一名真人体验，但产品决策为机器人局免罚，因此仍不扣退出罚款；当前局必须托管完成，防止逃局；
- 门票规则保持场次配置，不因机器人局隐藏改变抽水或门票；
- 不采用“机器人局隐藏提高抽水”。

### 9.5 回收规则

立即或结算后回收条件：

- 尚未开局且无活跃真人；
- 已开局且无活跃真人：完成当前局后回收；
- 达到 3 局上限；
- 房间总生命周期超过 30 分钟；
- 单局超过 10 分钟进入异常中止；
- 资金池熔断；
- 管理端关闭机器人开关时，不再开新局，存量局完成后回收。

统一 `disposeRoom(room)` 必须清理：

- action timer；
- bot watchdog；
- bot arrival timers；
- bot ready timers；
- reservation timers；
- disconnect timers；
- matching session/room 关联。

## 10. 经济模型与机器人资金池

### 10.1 设计原则

机器人不创建普通 `accounts`、普通 `wallets` 或奖励记录。为保证账务守恒，使用内部机器人资金池：

```text
system::bot_treasury::junior
system::bot_treasury::mid
```

系统账号：

- 不能通过 auth 登录；
- 不能进入匹配；
- 不能领奖励；
- 只能由内部结算接口操作；
- 可在 `wallets` 和 `wallet_ledger` 中持久化，但必须由账号类型或服务端白名单隔离。

机器人玩家 ID 使用 `bot::` 前缀，但机器人实例本身不拥有真实钱包。

### 10.2 资金流

| 结果 | 真实资金流 |
|---|---|
| 机器人输、真人赢 | 机器人资金池扣款，真人钱包加款 |
| 真人输、机器人赢 | 真人钱包扣款，机器人资金池加款 |
| 机器人之间输赢 | 不产生外部资金流，只影响机器人展示余额 |
| 赢家抽水 | 按现有场次税率扣除，记录 `game_tax` |

结算先按现有斗地主规则计算每个参与者的最终 `delta`（含真人、机器人和赢家抽水），再执行：

```text
每个真人钱包变化 = 该真人 finalDelta
机器人资金池变化 = 同局所有机器人 finalDelta 之和
每个机器人展示余额变化 = 该机器人 finalDelta
```

这种聚合方式自然覆盖以下组合：

- 两个机器人位于同一农民阵营；
- 真人和机器人同为农民；
- 机器人为地主；
- 机器人之间一赢一输的内部抵消。

禁止逐个机器人创建资金池流水，否则同一资金池在一局内会产生不必要的多次锁竞争。每局、每场次只写一笔聚合资金池流水。

结算不变量：

```text
所有真人钱包变化
+ 机器人资金池变化
+ 系统抽水归集变化
= 0
```

如果当前抽水没有独立归集钱包，至少必须确保：

```text
真人净变化 + 机器人资金池净变化 + taxTotal = 0
```

### 10.3 虚拟展示余额

机器人对局内展示余额使用长尾分布生成：

- 70%：场次门槛的 1.0～2.5 倍；
- 25%：2.5～5.5 倍；
- 5%：5.5～11.5 倍；
- 取整至百位；
- 同一房间跨局连续增减；
- 低于场次准备门槛时模拟离开。

展示余额只影响 UI 和单机器人可承担的展示赔付，真实对外赔付由资金池承担。

### 10.4 开局前敞口预占

不能只做“查询资金池余额后开局”：多个机器人房可能并发读到相同余额，形成资金池超卖。必须由 `treasury-store` 在开局前原子预占最大赔付敞口。

建议复用 `wallets.frozen_beans` 表达资金池预占：

```text
availableTreasury = treasury.beans - treasury.frozenBeans
requiredExposure = 当前机器人阵营在场次最大倍率下的最大理论赔付
```

预占流程：

1. 事务内锁定场次资金池钱包；
2. 检查 `availableTreasury >= requiredExposure + minReserve`；
3. 增加 `frozen_beans`，写入唯一幂等流水 `bot_exposure_reserve`；
4. 将 `reservedExposure` 和预占幂等键写入房间/对局元数据；
5. 事务提交后才允许进入发牌阶段。

结算流程：

- 在最终结算事务中消费实际赔付并释放剩余预占；
- 真人输给机器人时，真人扣款进入资金池，同时释放本局预占；
- 对局开局前撤销时全额释放预占；
- 异常中止时通过幂等键释放预占；
- GC 发现已过期且无活跃对局的预占时只告警，不得无条件解冻；必须先核对 `game_matches.status`，防止误释放仍在进行的对局敞口。

资金池可用余额低于安全阈值时：

- 不创建新机器人局；
- 已组装但未开局的房间回滚到真人匹配；
- 存量局允许完成；
- 触发告警与自动熔断；
- 客户端只表现为继续匹配，不暴露资金池原因。

### 10.5 原子结算

目标结算事务应一次性完成：

1. 锁定所有真人钱包和对应资金池；
2. 检查 `matchId + roundNo` 未结算；
3. 锁定并核对本局资金池预占记录；
4. 计算真人、资金池、抽水的最终变化；
5. 更新真人钱包和资金池，消费实际敞口并释放剩余预占；
6. 写所有 `wallet_ledger`；
7. 更新 `bot_match_stats` 与 `bot_human_pair_stats`；
8. 更新 `game_matches.status=settled`；
9. 提交事务。

幂等键示例：

```text
bot_settlement:<matchId>:<roundNo>:<accountId>
bot_treasury:<matchId>:<roundNo>:<roomType>
bot_stats:<matchId>:<roundNo>:<accountId>
```

任一环节失败整体回滚。不得出现真人已加款但资金池未扣、统计未更新或对局仍为 started 的中间态。

### 10.6 钱包防污染

普通钱包入口必须拒绝 `bot::`，认证层同时必须拒绝所有保留命名空间：

```text
bot::                     机器人实例，仅服务端创建
system::                  系统账号，仅部署/DBA 初始化
```

即使未来 auth 派生规则变化，外部登录也不得获得以上前缀的 accountId。

```text
bot:: 机器人实例账号 → 永远拒绝普通钱包操作
system::bot_treasury::* → 仅允许内部 treasury-store 操作
正常真人 accountId → 现有 wallet-store
```

通过类型化入口和断言双重防护，而不是在零散调用点静默跳过。

## 11. 风控设计

### 11.1 账号日额度

每账号、每天：

- 机器人局最多 20 场；
- 机器人局正向净收益累计最多 30000 铁豆；
- 达到任一上限后，只允许真人匹配；
- 不提示用户命中风控，只表现为继续寻找真人。

额度必须持久化，进程重启不能清零。资格查询只是体验优化，不是安全边界；机器人局从预约转为 `active` 时，必须在数据库事务中原子占用当日场次额度，防止并发会话同时通过预检。结算时再原子累计收益。若占用失败，房间组装必须回滚并恢复真人匹配。

`net_gain` 的口径定义为当天机器人局结算净变化，可正可负；日收益上限判断使用 `positive_gain_total`（仅累计正向收益）而不是允许亏损抵消后继续领取额度，避免通过先故意输再刷赢扩大资金池支出。

额度状态流：

```text
资格预检
  → 原子 reserve（reserved_match_count + 1，同时预占该账号本局最大正向收益）
  → 房间 active（reserved_match_count - 1, match_count + 1，保留 reserved_positive_gain）
  → 结算（累计 net_gain / positive_gain_total / win_count / lose_count，释放本局剩余正向收益预占）

组装失败或预约过期
  → 原子 release match reserve 与 positive gain reserve
```

所有状态转换使用 `matchRequestId` 或 `matchId` 唯一幂等键，重复回调不得重复占用、释放或累计额度。创建机器人局前按该真人角色的最大理论收益预占 `reserved_positive_gain`；只有满足 `positive_gain_total + reserved_positive_gain + requiredGainReserve <= 30000` 才允许激活。该方式偏保守，但能在多连接和多房间并发下保证 30000 为硬上限，而不是“结算后才发现已超限”。实际结算后释放未使用部分。

### 11.2 双真人串通防护

`2H+1B` 存在两名真人配合从资金池获利的风险。采用纵深防御：

1. 双真人补位阈值 80～105 秒，降低触发频次；
2. 同一真人账号对每日最多 3 场 `2H+1B`；
3. 单账号 20 场/30000 净收益硬上限；
4. 记录账号对、设备、IP、胜率和净收益；
5. 命中异常后降级为“只匹配真人”，第一阶段不自动封号；
6. 不通过隐藏提高抽水处理。

### 11.3 游客风险

- 游客继续仅允许初级场；
- 游客同样受机器人日额度；
- 同设备多游客账号、同 IP 新账号数量继续沿用现有风控；
- 机器人收益与新手豆结合监控，防止换设备刷号。

### 11.4 行为风控信号

记录以下信号：

- 同一真人账号对反复触发 `2H+1B`；
- 某账号机器人局胜率、净收益显著异常；
- 频繁在差牌/高风险阶段退出；
- 相同设备或 IP 控制多个账号同桌；
- 真人之间出现长期单向让利；
- 达到日额度或资金池单日预算。

## 12. 数据模型与 DDL 草案

> 本节为评审用目标 DDL。生产执行必须由 DBA 审核；应用账号运行期不需要 `CREATE/ALTER` 权限。

### 12.1 `bot_match_stats`

```sql
CREATE TABLE bot_match_stats (
  account_id VARCHAR(128) NOT NULL,
  stat_date VARCHAR(16) NOT NULL,
  match_count INT NOT NULL DEFAULT 0,
  solo_bot_match_count INT NOT NULL DEFAULT 0,
  duo_bot_match_count INT NOT NULL DEFAULT 0,
  win_count INT NOT NULL DEFAULT 0,
  lose_count INT NOT NULL DEFAULT 0,
  net_gain BIGINT NOT NULL DEFAULT 0,
  positive_gain_total BIGINT NOT NULL DEFAULT 0,
  reserved_positive_gain BIGINT NOT NULL DEFAULT 0,
  reserved_match_count INT NOT NULL DEFAULT 0,
  consecutive_bot_matches INT NOT NULL DEFAULT 0,
  last_match_at BIGINT NOT NULL DEFAULT 0,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL,
  PRIMARY KEY (account_id, stat_date),
  INDEX idx_bot_match_stats_date_gain (stat_date, net_gain),
  INDEX idx_bot_match_stats_updated (updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

`consecutive_bot_matches` 在账号发生一局全真人对局时清零；如果产品只需要限制同一房间最多 3 局，则以 `room.botRoundCount` 为准，不依赖该字段。跨自然日连续状态可由上一日记录读取后延续，不能因零点切日自动失效。

### 12.2 `game_match_participants`

```sql
CREATE TABLE game_match_participants (
  match_id VARCHAR(160) NOT NULL,
  player_id VARCHAR(128) NOT NULL,
  account_id VARCHAR(128) NOT NULL,
  seat INT NOT NULL,
  role VARCHAR(32),
  is_bot TINYINT NOT NULL DEFAULT 0,
  controller_type VARCHAR(32) NOT NULL,
  persona_id VARCHAR(64),
  joined_at BIGINT NOT NULL,
  created_at BIGINT NOT NULL,
  PRIMARY KEY (match_id, player_id),
  INDEX idx_gmp_account_created (account_id, created_at),
  INDEX idx_gmp_match_bot (match_id, is_bot),
  INDEX idx_gmp_account_match (account_id, match_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

机器人 `account_id` 可保存 `bot::<instanceId>`，该表不对 `accounts/wallets` 建外键。

### 12.3 `bot_human_pair_stats`

为高效限制 `2H+1B` 的重复账号对，建议独立聚合表：

```sql
CREATE TABLE bot_human_pair_stats (
  pair_key VARCHAR(300) NOT NULL,
  stat_date VARCHAR(16) NOT NULL,
  account_id_low VARCHAR(128) NOT NULL,
  account_id_high VARCHAR(128) NOT NULL,
  match_count INT NOT NULL DEFAULT 0,
  net_transfer BIGINT NOT NULL DEFAULT 0,
  last_match_at BIGINT NOT NULL DEFAULT 0,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL,
  PRIMARY KEY (pair_key, stat_date),
  INDEX idx_bhps_accounts_date (account_id_low, account_id_high, stat_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

`pair_key` 由排序后的两个 accountId 做服务端 HMAC/哈希生成，避免长度和特殊字符问题。

### 12.4 `bot_quota_reservations`

持久化账号场次和正向收益额度预占，支持并发硬限制、失败释放和进程崩溃恢复：

```sql
CREATE TABLE bot_quota_reservations (
  reservation_id VARCHAR(160) NOT NULL,
  match_request_id VARCHAR(160) NOT NULL,
  match_id VARCHAR(160),
  account_id VARCHAR(128) NOT NULL,
  stat_date VARCHAR(16) NOT NULL,
  reserved_positive_gain BIGINT NOT NULL DEFAULT 0,
  status VARCHAR(32) NOT NULL,
  created_at BIGINT NOT NULL,
  activated_at BIGINT,
  released_at BIGINT,
  settled_at BIGINT,
  updated_at BIGINT NOT NULL,
  PRIMARY KEY (reservation_id),
  UNIQUE KEY uniq_bqr_request_account (match_request_id, account_id),
  INDEX idx_bqr_account_date_status (account_id, stat_date, status),
  INDEX idx_bqr_status_updated (status, updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

状态：`reserved | active | released | settled`。所有状态转换必须条件更新，例如 `WHERE status='reserved'`，确保重复回调幂等。

### 12.5 `bot_treasury_reservations`

持久化每个机器人房的最大赔付敞口预占：

```sql
CREATE TABLE bot_treasury_reservations (
  reservation_id VARCHAR(160) NOT NULL,
  match_request_group_id VARCHAR(160) NOT NULL,
  match_id VARCHAR(160),
  room_id VARCHAR(64) NOT NULL,
  room_type VARCHAR(32) NOT NULL,
  treasury_account_id VARCHAR(128) NOT NULL,
  reserved_exposure BIGINT NOT NULL,
  actual_treasury_delta BIGINT,
  status VARCHAR(32) NOT NULL,
  created_at BIGINT NOT NULL,
  activated_at BIGINT,
  released_at BIGINT,
  settled_at BIGINT,
  updated_at BIGINT NOT NULL,
  PRIMARY KEY (reservation_id),
  UNIQUE KEY uniq_btr_request_group (match_request_group_id),
  INDEX idx_btr_treasury_status (treasury_account_id, status),
  INDEX idx_btr_status_updated (status, updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

该表与 `wallets.frozen_beans`、`wallet_ledger` 在同一事务更新。服务重启后的 reconciliation 只能根据本表状态、`game_matches.status` 和幂等流水联合判断是否释放敞口。

> `bot_quota_reservations` / `bot_treasury_reservations` 是经济安全预占；第 5.5 节的 `joinTicket Reservation` 是短生命周期入座预约。三者职责不同，禁止混用。

### 12.6 `game_matches` 增列

```sql
ALTER TABLE game_matches
  ADD COLUMN has_bots TINYINT NOT NULL DEFAULT 0,
  ADD COLUMN human_count INT NOT NULL DEFAULT 3,
  ADD COLUMN bot_count INT NOT NULL DEFAULT 0,
  ADD COLUMN bot_mode VARCHAR(32),
  ADD COLUMN bot_strategy_version VARCHAR(64),
  ADD INDEX idx_game_matches_bot_started (has_bots, started_at);
```

### 12.7 系统资金池

系统资金池可继续使用 `wallets` 与 `wallet_ledger`，但需要明确受保护的系统账号类型。建议在 `accounts` 增加 `account_type`：

```sql
ALTER TABLE accounts
  ADD COLUMN account_type VARCHAR(32) NOT NULL DEFAULT 'user',
  ADD INDEX idx_accounts_type (account_type);
```

初始化：

```sql
-- 实际初始金额由运营/财务和 DBA 确认，不在仓库硬编码。
INSERT INTO accounts (... account_id, login_type, account_type ...)
VALUES ('system::bot_treasury::junior', 'system', 'system_treasury', ...),
       ('system::bot_treasury::mid', 'system', 'system_treasury', ...);

INSERT INTO wallets (... account_id, beans ...)
VALUES ('system::bot_treasury::junior', <DBA确认金额>, ...),
       ('system::bot_treasury::mid', <DBA确认金额>, ...);
```

### 12.8 Schema readiness

新增表后必须同步：

- MySQL init DDL；
- 独立 MySQL migration SQL；
- `REQUIRED_MYSQL_TABLES`；
- schema readiness 校验；
- 本地 `db:init:mysql`；
- DBA `SHOW TABLES` / `SHOW CREATE TABLE` 核验清单。

## 13. WebSocket 协议变更

### 13.1 客户端上行

| type | 用途 | 新增字段 |
|---|---|---|
| `quickMatch` | 开始匹配 | 可选客户端协议版本；身份仍取 auth |
| `cancelMatch` | 明确取消 | `matchRequestId` |
| `resumeMatch` | 重连恢复匹配 | 可选 `matchRequestId` |
| `join` | 加入匹配房 | `matchRequestId`, `joinTicket` |

`resumeMatch` 需加入协议白名单、schema 校验和限流。

### 13.2 服务端下行

#### `matchWaiting`

```js
{
  matchRequestId,
  roomType,
  roomName,
  queueLength,
  waitedMs,
  serverNow,
}
```

不下发机器人阈值、机器人数量或 `isBot`。

#### `matchFound`

```js
{
  matchRequestId,
  roomId,
  roomType,
  roomName,
  entryFeeBeans,
  joinTicket,
  joinTicketExpiresAt,
}
```

#### `matchExpired`

```js
{
  matchRequestId,
  reasonCode,
  retryable,
}
```

客户端展示统一友好文案，不泄露风控、资金池或机器人开关状态。

### 13.3 错误码

| 错误码 | 含义 | 客户端行为 |
|---|---|---|
| `MATCH_ALREADY_ACTIVE` | 账号已有匹配会话 | 恢复旧会话 |
| `MATCH_NOT_FOUND` | 无可恢复会话 | 回大厅 |
| `MATCH_TICKET_INVALID` | joinTicket 无效 | 重新恢复/匹配 |
| `MATCH_TICKET_EXPIRED` | 预约过期 | 尝试恢复或重新排队 |
| `MATCH_ACCOUNT_CONFLICT` | 账号与预约不一致 | 停止加入并上报 |
| `MATCH_ROOM_UNAVAILABLE` | 房间组装失败 | 保留等待时长重排 |

### 13.4 无感体验与合规边界

产品决策是不在牌桌状态、玩家昵称或协议公开字段中标记单个机器人，避免破坏沉浸感。但“不逐席标记”不等于完全不披露：上线前应由产品/法务确认，在游戏规则、用户协议或帮助页以通用方式说明“为保障匹配效率，长时间未匹配到真人时可能由自动化对手参与”。

约束：

- 客户端不得通过隐藏字段接收 `isBot`，避免被抓包直接识别；
- 服务端内部、数据库和审计事件必须准确记录机器人身份，不得为了无感体验牺牲内部可追溯性；
- 不伪造真实平台账号、真人社交关系、认证标识或可识别个人信息；
- 机器人昵称和头像使用自有或已授权素材，不复制真实用户资料；
- 不在机器人局隐藏提高抽水、修改发牌或伪造充值/奖励行为；
- 如平台政策要求逐局或逐席标识，以平台合规要求优先，配置应支持开启公开标识而无需改动核心架构。

## 14. 故障恢复与熔断

### 14.1 定时器安全

所有定时器必须：

- 保存引用并可集中清理；
- 回调前检查房间/会话是否仍有效；
- 使用 seq/version 防止过期执行；
- 测试环境支持假时钟；
- 非关键后台定时器调用 `unref()`。

### 14.2 硬超时

| 范围 | 建议值 | 处理 |
|---|---:|---|
| join 预约 | 15 秒 | 回滚/降级/重排 |
| 机器人动作 watchdog | 真人超时 + 1.5 秒 | 降级 timeout profile |
| 单局 | 10 分钟 | 记录 `match_aborted`，幂等退款/解冻 |
| 机器人房生命周期 | 30 分钟或 3 局 | 存量局结束后回收 |
| 匹配总兜底 | 180 秒 | 服务端结束匹配 |

### 14.3 异常中止

中止未完成牌局时：

- 不应用牌局输赢；
- 已扣但符合退款条件的门票幂等退还；
- 冻结资金幂等释放；
- `game_matches.status=aborted`；
- 记录 `match_aborted` 事件和原因；
- 清理房间与所有定时器；
- 向在线真人同步最终钱包。

### 14.4 开关与熔断

```text
DDZ_BOT_ENABLED
DDZ_BOT_ROOM_TYPES=junior,mid
DDZ_BOT_SOLO_FILL_ENABLED
DDZ_BOT_DUO_FILL_ENABLED
DDZ_BOT_ROLLOUT_PERCENT
DDZ_BOT_MAX_MATCHES_PER_DAY=20
DDZ_BOT_MAX_NET_GAIN_PER_DAY=30000
DDZ_BOT_PAIR_MAX_PER_DAY=3
DDZ_BOT_TREASURY_MIN_RESERVE
DDZ_BOT_STRATEGY_VERSION
```

熔断条件：

- 资金池低于安全储备；
- watchdog 触发率超过阈值；
- 非法机器人动作不为 0；
- 结算不变量失败；
- 机器人房异常中止率过高；
- 数据库统计写入失败持续超过阈值。

熔断后：停止创建新机器人局，存量局继续完成；不得强杀正在结算的房间。

## 15. 可观测性与审计

### 15.1 匹配指标

- 各场次等待时长 P50/P90/P99；
- 真人三人局、1H+2B、2H+1B 占比；
- `matchFound → join` 成功率；
- 预约超时率；
- 匹配取消率；
- 匹配重连恢复成功率。

### 15.2 机器人指标

- 思考时间分布；
- 人格分布；
- watchdog 触发率；
- 非法动作率，目标为 0；
- 真人地主/农民/总体胜率；
- 春天/反春率；
- 同房连续局数；
- 机器人余额不足离场次数。

### 15.3 经济指标

- 各场次资金池余额；
- 每日资金池净流入/流出；
- 机器人局真人净收益分布；
- 命中 20 场/30000 豆上限的账号数；
- 2H+1B 重复账号对；
- `bot::` 普通钱包误创建数，目标为 0；
- 结算守恒校验失败数，目标为 0。

### 15.4 对局事件

建议新增事件：

```text
match_bot_fill_started
match_reserved
match_reservation_expired
bot_seated
bot_ready
bot_action_decided
bot_action_fallback
bot_left
bot_treasury_settlement
bot_risk_limited
match_aborted
```

事件 payload 不记录其他玩家隐藏手牌，不记录明文 openId、sessionToken 或 joinTicket。

## 16. 测试方案

### 16.1 可测试性基础

- 所有随机行为使用可注入 RNG；
- 所有时间读取和定时器使用可注入 clock；
- 匹配与 AI 模块导出纯函数；
- 生产默认使用 `Math.random`/系统时钟，测试使用固定种子和假时钟。

### 16.2 单元测试

匹配：

- 1H 到阈值补 2B；
- 2H 到更长阈值补 1B；
- 第 3 个真人在补位前到达，真人局优先；
- 2H 变 1H 后立即重算；
- 同账号多连接不重复排队；
- cancel 与 timer 同时发生只产生一个结果；
- joinTicket 一次性、过期、账号绑定正确；
- 重连恢复保留原等待时长。

AI：

- observation 不含其他玩家手牌；
- 返回动作永远合法；
- 关键残局失误率为 0；
- 农民队友保护正确；
- 同种子结果确定；
- 不同人格行为分布存在差异；
- 长尾延迟分布符合配置。

生命周期：

- 无活跃真人时不再开下一局；
- 真人退出后托管完成当前局；
- 退出免罚但不能逃避结算；
- dispose 清理全部定时器；
- watchdog 能从策略异常恢复。

### 16.3 数据库与经济测试

必须在 MySQL 上覆盖真实并发：

- `bot::` 无法创建普通钱包；
- 系统资金池只能走内部接口；
- 机器人结算原子守恒；
- 同一局并发重复结算只生效一次；
- 结算中途抛错整体回滚；
- `bot_match_stats`、`bot_human_pair_stats`、`bot_quota_reservations`、`bot_treasury_reservations` 和资金池预占必须与结算/状态转换保持事务一致；
- 20 场/30000 豆限制跨进程重启仍有效；
- 配对次数限制正确；
- 无孤儿流水。

### 16.4 E2E 场景

1. 1 真人等待 → 1H+2B → 完整一局 → 钱包与资金池守恒；
2. 2 真人等待 → 2H+1B → 完整一局 → 配对统计正确；
3. 第 3 真人在阈值前加入 → 全真人局；
4. 匹配中断线重连 → 恢复队列或预约；
5. 房间预约过期 → 降级/回滚；
6. 机器人行动异常 → watchdog 兜底；
7. 真人拿到差牌后退出 → 无额外罚款，但当前局仍结算；
8. 所有真人离线 → 当前局结算后回收；
9. 资金池不足 → 不开机器人局；
10. 达到日额度 → 只匹配真人。

### 16.5 离线仿真

新增 `scripts/bot-winrate-sim.js`，至少运行：

```text
1H+2B：100000 局
  - 真人地主
  - 真人农民
  - 不同人格组合
  - 不同牌力区间

2H+1B：100000 局
  - 机器人地主
  - 机器人农民
```

验收：

- 1H+2B 真人总体胜率 68%～72%；
- 地主/农民分角色结果无明显失衡；
- 2H+1B 无定向让利；
- 非法动作率为 0；
- 春天率不显著高于全自动公平基线；
- 不读取隐藏牌、不修改发牌。

## 17. 灰度上线与回滚

### 17.0 单进程与多进程边界

当前匹配队列、匹配会话、预约和房间均为单进程内存状态，本期只保证单进程部署正确性。若生产部署多个 WebSocket 进程，必须在开放机器人匹配前满足以下任一条件：

1. 通过负载均衡按账号/session 做稳定粘性路由，并确保同一场次队列只属于一个匹配分片；或
2. 将匹配会话、队列锁、预约和房间路由迁移到 Redis/集中式协调服务。

禁止在多个独立进程中各自维护完整匹配队列，否则会出现同账号重复匹配、日额度预占竞态、预约无法恢复和房间路由丢失。数据库额度与资金池事务只能保护资金安全，不能替代分布式匹配一致性。

### 17.1 上线顺序

0. 完成产品、法务/平台规则评审，确认自动化对手披露方式；
1. 离线仿真与 MySQL 并发测试；
2. 初级场 1H+2B，1% 账号 hash 灰度；
3. 初级场 1H+2B，10% → 50% → 100%；
4. 初级场 2H+1B，小流量；
5. 中级场 1H+2B；
6. 中级场 2H+1B；
7. 大师场保持关闭。

### 17.2 每阶段放量门槛

- 非法动作率为 0；
- 结算守恒失败为 0；
- watchdog 触发率低于约定阈值；
- 异常中止率无明显升高；
- 真人胜率在目标带宽；
- 资金池消耗符合预算；
- 匹配等待 P90、取消率改善；
- 无明显投诉或机器人识别反馈。

### 17.3 回滚

优先通过配置关闭新机器人局：

```text
DDZ_BOT_ENABLED=false
```

回滚原则：

- 不强制中止已开始牌局；
- 存量机器人局完成当前局后回收；
- 资金池和统计表保留用于审计；
- 客户端协议需向后兼容旧服务端：无新字段时退回普通等待展示；
- 数据库新增表/列不在紧急回滚中删除。

## 18. 实施计划

### P0：安全与数据底座

- DBA DDL 与向后兼容 migration；
- 资金池初始化、最低储备与专用访问接口；
- 资金池最大敞口原子预占、结算消费与异常释放；
- 机器人对局原子结算；
- `bot_match_stats`、参与者、配对统计、额度预占和资金池预占明细；
- 账号日额度原子占用；
- `bot::` 普通钱包硬拦截；
- 配置开关与熔断。

### P1：匹配编排

- 匹配会话状态机；
- 账号唯一性；
- 场次级串行链；
- 30s/90s 补位；
- joinTicket 预约；
- 重连恢复；
- 客户端服务端权威等待。

### P2：统一自动决策

- observation 与 legal actions；
- 现有自动策略迁移；
- controller profiles；
- 人格、牌力、次优动作；
- bot scheduler 与 watchdog；
- 托管/超时/提示复用。

### P3：体验与生命周期

- 渐进入场；
- 昵称头像去重；
- 长尾思考；
- 准备节奏；
- 免罚但当前局强制结算；
- 3 局/30 分钟生命周期；
- 客户端分阶段文案。

### P4：测试与灰度

- 单测、MySQL 并发、E2E；
- 100000 局离线仿真；
- 指标与告警；
- 分阶段灰度；
- 复盘与参数校准。

## 19. 验收标准

### 19.1 功能

- 单真人和双真人均可按阈值稳定补位；
- 真人三人局始终优先；
- 匹配取消、断线、重连、预约过期均可恢复；
- 机器人可完成叫地主和完整牌局；
- 托管、超时和机器人使用统一决策能力；
- 真人客户端不收到机器人身份字段。

### 19.2 体验

- 不出现固定 30/90 秒成功规律；
- 不出现“托管中”“托管出牌”等暴露机器人身份的表现；
- 同房机器人昵称、头像和节奏不重复；
- 机器人无明显非法或极端愚蠢动作；
- 退出机器人局无额外罚款，但不能逃避当前局结算；
- 同房最多 3 局，避免长期暴露行为模式。

### 19.3 安全

- `bot::` 普通钱包误创建数为 0；
- 结算守恒失败数为 0；
- 同一局重复结算不重复变更余额；
- 同账号不能重复匹配或占多个座位；
- 匹配房不能被猜房间号抢座；
- 机器人无法读取隐藏手牌；
- 账号日额度和账号对频次限制有效；
- 资金池不足时自动停止新机器人局。

### 19.4 稳定性

- 机器人异常不导致房间卡死；
- 无活跃真人的房间不会开启下一局；
- 房间与定时器无持续泄漏；
- 关闭开关后存量局可安全完成；
- MySQL 并发测试通过。

## 20. 评审重点与后续参数校准

以下参数不应仅凭经验确定，开发后需通过仿真和灰度数据校准：

- 单/双真人补位抖动区间；
- 人格参数与技能水平；
- 普通局面失误率；
- 真人地主/农民分角色胜率；
- 资金池初始金额和最低储备；
- 机器人房单日预算；
- watchdog 告警阈值；
- 同一真人账号对的频次上限；
- 机器人房最大连续局数是否维持 3 局。

开发启动前需要完成以下评审：

1. 服务端架构评审：匹配状态机、统一 AI、生命周期；
2. 数据库评审：新增表、索引、原子结算事务；
3. 经济评审：资金池初始额度、预算和对账口径；
4. 安全评审：joinTicket、账号唯一性、串通风险；
5. 产品/合规评审：匹配等待文案、免罚、连局体验和自动化对手通用披露方式；
6. 测试评审：仿真基线、MySQL 并发和 E2E 覆盖。

---

## 附录 A：核心状态流

### A.1 匹配状态

```text
idle
  → queued
  → assembling
  → reserved
  → joining
  → active

queued/reserved/joining
  → cancelled | expired | failed

network_disconnect
  → grace
  → resumeMatch
  → 原状态
```

### A.2 房间状态

```text
waiting
  → ready
  → bidding
  → playing
  → settlement
  → ready（未达到 3 局且仍有活跃真人）
  → disposed（无活跃真人、达到上限、熔断或异常）
```

### A.3 自动行动状态

```text
turn_started
  → human_waiting | managed_scheduled | bot_scheduled
  → action_committed
  → next_turn

bot_scheduled
  → bot_action_failed
  → watchdog_timeout_profile
  → action_committed
```

## 附录 B：关键不变量

1. 客户端永远不能指定服务端账号身份。
2. 机器人实例永远不能拥有普通用户钱包。
3. 系统资金池只能由内部结算路径操作。
4. 机器人决策永远不能读取其他玩家隐藏手牌。
5. 所有自动动作必须经过同一合法性校验和 `actionLock`。
6. 每个账号同时最多一个匹配会话、一个房间座位。
7. 匹配房只能由持有有效预约票据的账号加入。
8. 退出机器人局可免罚，但已开局输赢必须正常结算。
9. 无活跃真人的房间不得开启下一局。
10. 每局真人钱包、资金池与抽水必须满足守恒。
11. 每局结算必须幂等且原子。
12. 关闭机器人开关不得破坏存量牌局。
