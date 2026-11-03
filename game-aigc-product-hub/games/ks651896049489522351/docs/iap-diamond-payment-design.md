# IAP 与平台币兑换服务端实现说明

> 状态：当前唯一架构
> 更新日期：2026-09-07

## 1. 资金模型与边界

- 快手 `chargeBalance`（充值币）与 `freeBalance`（赠送币）是付费币的唯一权威账本；产品 UI 可继续称其为「钻石」。服务端不维护付费币余额或付费币流水。
- 铁豆仍由本项目 `wallets` / `wallet_ledger` 管理。只有平台确认扣币成功后，才能幂等发放铁豆。
- 充值与兑换相互独立：充值只增加快手平台币；兑换由用户再次主动发起。
- 所有金额与资产均使用非负十进制字符串或数据库 `BIGINT`，业务计算使用 `BigInt`/精确 SQL，禁止经 JavaScript `Number` 计算。

## 2. 身份与隐私

- `accountId` 是内部稳定账号，同时作为稳定 `zone_id` 的身份部分；同一账号跨 Android/iOS 必须得到同一个值。
- 服务端维护 `accountId → 明文 open_id` 的受保护绑定，因为余额查询和扣币接口必须提交 `open_id`。绑定只能由可信快手登录流程建立或更新。
- `open_id` 不得出现在客户端 DTO、WebSocket 消息、业务日志、错误文本、指标标签、审计详情或原始外呼日志中；日志仅记录内部订单号、`accountId` 或不可逆摘要。
- 平台 access token、签名密钥及签名参数不得下发客户端或写日志。生产密钥仅由 Secret 注入。

## 3. 充值链路

1. 客户端通过鉴权 HTTP API 请求创建 IAP 订单，服务端按当前商品快照生成 `iap_orders` 和 `ks.requestGamePayment` 参数；业务幂等 ID 使用 `Idempotency-Key` 请求头传递。
2. 客户端原样调用 `ks.requestGamePayment`。其 `success`/`fail` 仅是客户端观察结果，不能改变资产事实。
3. 快手支付回调完成验签、APPID、订单号及账号绑定校验后，只把 `iap_orders.status` 推进为 `PAYMENT_CONFIRMED`，记录平台订单标识和确认时间。
4. 回调和客户端结果均不得写入任何本地付费币余额，不得生成本地付费币流水，也不得发放铁豆。
5. 客户端随后通过 HTTP 查单确认订单并查询平台余额；回调重复到达时按订单和平台订单唯一约束幂等返回。

客户端支付业务统一使用 `/api/v1/iap/*` 与 `/api/v1/platform-coins/*` HTTP API，并通过 `Authorization: Bearer <sessionToken>` 认证。WebSocket 只承载游戏实时状态；旧支付消息仅保留迁移期兼容，不作为新客户端接入协议。

## 4. 平台余额查询

服务端封装快手接口：

```http
GET /api/kpay/minigame/balance
```

请求由服务端使用绑定的明文 `open_id`、稳定 `zone_id`、`os`、用户 IP、时间戳等字段签名。仅接受平台 `code === 1`，并严格校验响应中的 `chargeBalance`、`freeBalance` 均为非负十进制整数。

对客户端只返回严格 DTO：

```json
{
  "accountId": "internal-account-id",
  "chargeBalance": "60",
  "freeBalance": "10",
  "balance": "70",
  "observedAt": 1788790000000,
  "stale": false
}
```

`balance` 必须精确等于两类余额之和。查询失败不得伪造零余额；可返回最近展示缓存并明确 `stale: true`，但缓存绝不参与扣款判断。

## 5. 平台币兑换铁豆

### 5.1 商品与订单

- `platform_exchange_products` 保存兑换 SKU、平台商品信息、消耗平台币、发放铁豆、启停和排序；订单必须保存不可变商品快照。
- `platform_exchange_orders` 保存 `exchange_order_id`、`account_id`、客户端幂等 ID、请求指纹、`biz_no`、SKU 快照、OS、稳定 `zone_id`、扣款结果、铁豆结果和时间戳。
- `(account_id, client_request_id)` 唯一；相同幂等 ID 但请求指纹不同返回 `IDEMPOTENCY_KEY_REUSED`。
- `biz_no` 由账号和客户端幂等 ID 稳定派生。一次业务意图的所有即时重试、客户端查单恢复和后台补偿必须使用同一个 `biz_no`，绝不因超时生成新值。

### 5.2 状态机

```text
CREATED
  → DEBITING
  → DEBIT_UNKNOWN ──重试同 biz_no──> DEBITING
  → DEBIT_REJECTED
  → DEBIT_SUCCEEDED → FULFILLING → FULFILLED
  └─ 超过 48 小时仍无法确认 ───────> REVIEW
```

- `CREATED`：订单已持久化，尚未取得扣款执行权。
- `DEBITING`：实例持有 30 秒扣款租约；租约未过期时其他实例不得外呼。
- `DEBIT_UNKNOWN`：超时、网络错误、非确定响应等导致结果未知；至少等待 5 秒后才可用同一 `biz_no` 重试。
- `DEBIT_REJECTED`：平台明确拒绝，不能发铁豆。
- `DEBIT_SUCCEEDED`：仅平台 HTTP 成功、响应合法且 `code === 1` 时进入。
- `FULFILLING`：平台扣款已确认，正在幂等发铁豆。
- `FULFILLED`：铁豆流水及钱包均已提交。
- `REVIEW`：从订单创建起 48 小时仍为未知，停止自动扣款，进入人工核验；不得自动当作失败或再次创建新订单。

### 5.3 扣币调用与事务边界

平台扣币使用：

```http
POST /api/kpay/minigame/pay
Content-Type: application/x-www-form-urlencoded
```

- 参数包含明文 `open_id`（仅在内存中组装）、稳定 `zone_id`、`os`、`user_ip`、`amount`、`pay_priority=1`、固定 `biz_no` 与商品快照；`pay_priority=1` 表示赠送币优先。
- 仅 `code === 1` 是确定成功。明确的其他数值 code 为 `DEBIT_REJECTED`；超时、网络异常、HTTP 5xx、无法解析或非确定 code 均为 `DEBIT_UNKNOWN`。
- 外呼快手前先以短事务竞争并提交 `DEBITING` 租约，随后结束事务再发 HTTP 请求；任何平台外呼期间都不得持有数据库事务或行锁。
- 外呼后用短事务按当前状态条件更新结果。并发实例依靠 30 秒租约、状态条件更新和固定 `biz_no` 收敛。

### 5.4 铁豆履约

确认 `DEBIT_SUCCEEDED` 后，在单个本地事务内：

1. 锁定兑换订单并推进至 `FULFILLING`；
2. 锁定或创建铁豆钱包；
3. 以 `platform_exchange_credit:<exchange_order_id>` 作为 `wallet_ledger.idempotency_key`；
4. 若流水不存在，则精确增加订单快照中的铁豆并写 `wallet_ledger`；若已存在，复用流水结果；
5. 将订单推进为 `FULFILLED` 并保存最终铁豆余额。

平台扣款与本地发豆无法组成分布式事务，因此必须依赖固定 `biz_no`、状态恢复和本地流水幂等。禁止通过修改余额或跳过流水人工补豆。

## 6. H5 开发环境

H5 仅用于页面和非支付玩法预览，不提供模拟充值、模拟余额或模拟扣币：

- H5 不暴露支付测试入口，`KwaiPayment.isAvailable()` 固定由真实 `ks.requestGamePayment` 能力决定；
- 游客账号不能创建充值订单、查询平台余额或发起平台币兑换；
- 支付联调与异常恢复验收必须在快手小游戏真机或官方测试环境完成；
- 服务端只有正式平台客户端，不维护第二套内存账本或沙箱幂等状态。

## 7. 运维配置与任务

至少配置并校验：快手 APPID、access token、支付签名密钥、余额/扣币路径（分别为上述 GET/POST）、请求超时、`pay_priority=1`、30 秒租约、5 秒未知退避、48 小时复核窗口和兑换开关。部署在反向代理后时，仅将代理直连 IP 配入 `DDZ_TRUSTED_PROXY_IPS`；服务校验 IP 格式并从 `X-Forwarded-For` 右侧开始剥离受信代理，使用第一个非受信地址，未配置或直连来源不受信时使用 socket IP。

后台恢复任务周期扫描：`CREATED`、租约过期的 `DEBITING`、达到退避时间的 `DEBIT_UNKNOWN`、`DEBIT_SUCCEEDED` 与 `FULFILLING`。扫描只领取有限批次；单单失败不能阻断其他订单。达到 48 小时的未知订单转 `REVIEW` 并告警。

关键指标：余额查询成功率/延迟、平台扣币结果、未知订单年龄、租约接管次数、`REVIEW` 数量、履约延迟、重复流水冲突。告警和日志均不得包含明文 `open_id`、access token、签名或完整请求参数。

## 8. 测试与验收

- 充值回调只产生 `PAYMENT_CONFIRMED`，重复回调幂等，且数据库中不存在本地付费币余额/流水写入。
- 余额接口只接受 `code === 1` 与严格双余额字段；大于 `2^53` 的值全链路不丢精度。
- 平台扣币 POST 为 form 编码，`pay_priority=1`，赠送币优先；明确拒绝不发豆。
- 超时进入 `DEBIT_UNKNOWN`，5 秒内不重试；重试及进程恢复保持同一 `biz_no`。
- 30 秒内只有一个实例执行扣币；外呼期间无数据库事务和行锁。
- 未知持续 48 小时进入 `REVIEW`，之后不自动扣款或发豆。
- `DEBIT_SUCCEEDED` 后并发履约仅生成一条相同幂等键的 `wallet_ledger`，铁豆只增加一次。
- H5 重放相同 `biz_no` 不重复扣款，并正确模拟双余额及赠送币优先。
- 身份绑定可恢复且跨端稳定；客户端 DTO、日志、指标与错误中均扫描不到明文 `open_id`。
