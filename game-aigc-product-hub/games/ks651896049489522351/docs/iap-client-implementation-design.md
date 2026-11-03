# IAP 客户端实现说明

> 状态：当前唯一协议与交互
> 更新日期：2026-09-07
> 上游：`docs/iap-diamond-payment-design.md`

## 1. 客户端资金认知

- UI 可使用「钻石」名称，但其余额只来自快手 `chargeBalance + freeBalance`；客户端和游戏服务端都没有独立钻石钱包。
- `chargeBalance`、`freeBalance`、`balance` 以及铁豆字段均以非负十进制字符串传输和保存，禁止用 `Number`、`parseInt` 或浮点运算处理。
- 余额缓存只用于展示。是否可兑换、实际扣款顺序和余额不足均由快手扣币结果决定；客户端不得根据缓存余额判定交易成功。
- 充值与兑换是两个操作：充值不自动换铁豆，兑换必须由用户确认。

## 2. 客户端协议

支付业务使用鉴权 HTTP API，`Authorization: Bearer <sessionToken>` 由 `M3.IapHttp` 统一添加；创建充值和兑换时通过 `Idempotency-Key` 传递业务幂等 UUID。客户端只使用以下接口：

| HTTP 请求 | 用途 |
|---|---|
| `GET /api/v1/iap/products?os={os}` | 充值商品 |
| `POST /api/v1/iap/orders` | 创建 `ks.requestGamePayment` 订单 |
| `POST /api/v1/iap/orders/{orderId}/client-result` | 上报客户端观察结果 |
| `GET /api/v1/iap/orders/{orderId}` | 查询充值订单是否 `PAYMENT_CONFIRMED` |
| `GET /api/v1/iap/orders?status=pending` | 恢复未确认充值订单 |
| `GET /api/v1/platform-coins/balance?os={os}` | 查询快手双余额 |
| `GET /api/v1/platform-coins/exchange-products` | 查询兑换档位 |
| `POST /api/v1/platform-coins/exchange-orders` | 创建或继续兑换 |
| `GET /api/v1/platform-coins/exchange-orders/{exchangeOrderId}` | 查询并恢复兑换 |

创建充值和兑换使用客户端 UUID 作为 `Idempotency-Key`。同一业务意图超时重试必须复用原幂等 ID，不能换 ID 规避未知结果。WebSocket 支付消息只保留旧客户端兼容，新客户端不得依赖其完成支付业务。

协议 DTO 不得出现 `open_id`、access token、签名密钥或平台请求原文。客户端也不得从 `accountId` 推导或持久化 `open_id`。

## 3. 严格余额 DTO

`platformCoinBalance` 只接受完整结构：

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

Store 应执行以下校验后再应用：

1. `accountId` 等于当前登录账号，且请求捕获的账号 epoch 未失效；
2. 三个余额字段均匹配 `^(0|[1-9]\d*)$`；
3. 使用十进制字符串加法验证 `balance === chargeBalance + freeBalance`；
4. `observedAt` 是有效时间戳，不能让较旧观测覆盖较新观测；
5. `stale` 必须是布尔值。

查询失败时保留最近一次显示值并标记陈旧，不回退为零。商城打开、登录完成、重连恢复、充值订单确认及兑换终态后均主动刷新。

## 4. 充值流程

```text
选择商品 → POST /api/v1/iap/orders → ks.requestGamePayment
       → POST /api/v1/iap/orders/{orderId}/client-result（尽力而为）
       → GET /api/v1/iap/orders/{orderId} 轮询
       → PAYMENT_CONFIRMED → GET /api/v1/platform-coins/balance
```

- `paymentParams` 必须原样交给 `ks.requestGamePayment`，客户端不计算金额、签名或 `zone_id`。
- `ks.requestGamePayment.success` 只表示平台调用成功；此时文案是「支付结果确认中」，不得本地增加钻石。
- `fail`、取消、断网也不是订单失败，仍保留恢复记录并查单。
- 只有服务端订单为 `PAYMENT_CONFIRMED` 才结束充值确认并刷新 `/api/v1/platform-coins/balance`；余额刷新失败不撤销订单事实。
- 本地恢复记录只保存订单号、SKU、幂等 ID、OS、阶段和时间，不保存签名、支付参数或身份明文。

## 5. 兑换流程与状态

用户选择兑换商品接口返回的档位并二次确认后：

1. 生成客户端 UUID 幂等 ID；
2. 使用该 ID 作为 `Idempotency-Key` 调用 `POST /api/v1/platform-coins/exchange-orders`；
3. 保存 `exchangeOrderId`，后续仅调用 `GET /api/v1/platform-coins/exchange-orders/{exchangeOrderId}` 恢复；
4. 未得到确定终态时绝不创建替代订单；
5. `FULFILLED` 后应用服务端铁豆快照，并分别刷新平台币余额和完整铁豆钱包。

服务端状态的 UI 处理：

| 状态 | 客户端行为与文案 |
|---|---|
| `CREATED` / `DEBITING` | 「正在处理兑换」，短轮询；禁止重复提交同档意图 |
| `DEBIT_UNKNOWN` | 「扣款结果确认中」，至少 5 秒后再查询；禁止提示失败或新建订单 |
| `DEBIT_REJECTED` | 明确失败，刷新平台余额，不增加铁豆 |
| `DEBIT_SUCCEEDED` / `FULFILLING` | 「扣款成功，铁豆发放中」，继续查单 |
| `FULFILLED` | 展示到账铁豆，刷新两个钱包并结束任务 |
| `REVIEW` | 「订单复核中」，停止高频轮询，保留订单号与恢复记录，提供客服入口 |

客户端不得自行调用平台扣币接口，也不得推断赠送币/充值币的实际扣减量。平台由服务端按赠送币优先处理。

## 6. Store 与账号隔离

平台币 Store 最少保存：

```javascript
{
  accountId: "",
  chargeBalance: "0",
  freeBalance: "0",
  balance: "0",
  observedAt: 0,
  stale: true,
  ready: false,
  accountEpoch: 0
}
```

- logout/switch-account 的同步入口立即递增 `accountEpoch`、停止所有计时器并 detach 当前任务；不能等新账号认证后才隔离。
- 每个异步请求与平台回调捕获 `{ accountId, accountEpoch }`，晚到结果不更新新账号 UI，也不通过新账号连接查询旧订单。
- 按账号持久化充值与兑换恢复记录；切号不删除其他账号记录。
- 单账号使用统一轮询调度器，避免多订单定时器突破限流。`DEBIT_UNKNOWN` 的客户端查询间隔不得短于 5 秒。

## 7. H5 预览边界

H5 仅用于界面与非支付玩法预览，不提供支付沙箱：

- 不模拟 `ks.requestGamePayment`，也不提供充值成功/取消/失败选择器；
- 不生成或透传 H5 支付 token，不允许游客绕过快手身份发起资金请求；
- 普通 H5 点击钻石入口时提示前往快手小游戏，不展示第二套测试 UI；
- 充值、余额和兑换联调统一使用快手小游戏真机或官方测试环境。

## 8. UI 约定

首页只保留一套钻石 UI：顶部既有钻石胶囊展示快手平台总余额并进入充值页，不再绘制独立的 H5 测试余额入口。余额旁应在 `stale: true` 时显示「待刷新」，不得据此禁用或承诺兑换结果。

充值文案：

- 平台 API 返回：支付结果确认中；
- `PAYMENT_CONFIRMED`：充值已确认，刷新余额；
- 30 秒无结果：结果仍在确认，可稍后查看；
- 客户端取消/失败：支付未完成或仍待确认，不宣称订单最终失败。

兑换文案必须区分「扣款结果确认中」「铁豆发放中」「已完成」「复核中」。`DEBIT_UNKNOWN` 与 `REVIEW` 不能显示余额不足、失败或允许一键重新兑换。

## 9. 错误与恢复

- HTTP 断网或超时：保留任务；网络恢复或重新认证后以原幂等键、原订单号继续查询。
- `INSUFFICIENT_PLATFORM_BALANCE` 或平台明确拒绝：刷新余额并提示不足。
- `EXCHANGE_PENDING`：展示服务端返回的既有订单并转入查询，不生成新幂等 ID。
- `IDEMPOTENCY_KEY_REUSED`：停止当前流程并提示异常，不能修改参数继续复用。
- `ORDER_NOT_FOUND`：保留本地记录，提示稍后重试并记录脱敏诊断。
- `PAYMENT_UNAVAILABLE`、限流或网络错误：指数退避，保留未知订单。
- `REVIEW`：停止自动高频恢复；前台进入商城或用户手动刷新时可低频查询。

## 10. 安全要求

- 不在控制台、埋点、错误上报、本地存储打印/保存完整 `paymentParams`、`sign`、access token 或 `open_id`。
- 场景层只能调用平台适配器，不直接访问签名字段或服务端平台接口。
- 所有资产展示使用字符串格式化；比较、加法使用十进制字符串工具。
- 本地缓存不具备授权能力，篡改缓存不能改变订单金额、扣款或铁豆到账。

## 11. 测试与验收

### 协议与 Store

- 严格拒绝缺字段、负数、小数、指数形式、前导零和双余额求和不一致的 DTO。
- 大于 `2^53` 的双余额、总余额和铁豆展示不丢精度。
- 旧观测、旧账号和旧 epoch 响应不能覆盖当前状态。
- `stale` 缓存可展示，但不用于决定兑换是否成功。

### 充值

- 平台 `success` 不改余额；只有 `PAYMENT_CONFIRMED` 后刷新平台余额。
- 取消、失败、断网、切后台和重启后仍可恢复查单。
- 回调迟到时最终正确确认，且无任何本地钻石钱包写入路径。

### 兑换

- 创建超时复用同一 `Idempotency-Key`；获得订单后只查 `/api/v1/platform-coins/exchange-orders/{exchangeOrderId}`。
- `DEBIT_UNKNOWN` 至少 5 秒后查询，不新建订单，不显示失败。
- `DEBIT_SUCCEEDED/FULFILLING` 不重复提交，最终 `FULFILLED` 只应用一次铁豆结果。
- `REVIEW` 保留恢复记录、停止高频轮询并显示复核文案。
- 账号切换期间的晚到平台结果和 HTTP 响应不能串余额或串订单。

### H5 与真机

- H5 模拟双余额、赠送币优先、同 `biz_no` 幂等及未知结果恢复。
- Android/iOS 真机验证最小档充值、取消、回调延迟、切后台、杀进程及跨端余额一致。
- 日志、本地存储、HTTP DTO 和错误上报扫描不到明文 `open_id`、access token 或签名。

## 12. 上线门禁

- [ ] 充值回调只推进 `PAYMENT_CONFIRMED`，不写本地付费币。
- [ ] 三个客户端接口及响应关联字段完成联调。
- [ ] 严格双余额 DTO 和大数测试通过。
- [ ] UNKNOWN、REVIEW、重启、重连和切号恢复通过。
- [ ] H5 同 `biz_no` 模拟幂等与赠送币优先通过。
- [ ] Android/iOS 真机支付及平台余额刷新通过。
- [ ] 客户端包、日志、DTO、本地缓存均无明文 `open_id` 和密钥材料。
- [ ] 兑换完成后平台余额与铁豆钱包均以服务端最新结果收敛。
