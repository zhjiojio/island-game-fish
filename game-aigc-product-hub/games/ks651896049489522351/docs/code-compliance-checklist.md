# 代码合规清单

参照 `docs/game-privacy.md` §2，对本次 DouZero 服务端接入及其必要配套改动检查如下。

| 检查项 | 结论 | 位置或说明 |
|---|---|---|
| 隐私政策位置已预留 | 通过 | `package/js/compliance.js` 中保留 `PRIVACY_POLICY_URL` 与统一打开入口；正式发布前注入审核后的地址 |
| 实名认证接口已预留 | 通过 | `M3.Compliance.requestRealNameAuth()` |
| 防沉迷接口已预留 | 通过 | `M3.Compliance.getAntiAddictionInfo()` |
| 客服入口已预留 | 通过 | `M3.Compliance.openCustomerServicePage()` |
| 无新增虚假宣传或诱导性表述 | 通过 | 本次未新增广告、奖励或营销文案 |
| 无新增用户可见第三方 IP 内容 | 通过 | DouZero 仅为服务端内部技术引擎，不向客户端展示品牌、角色或素材 |
| 模型请求遵循数据最小化 | 通过 | 仅含机器人自身手牌与公开局面，不含账号、昵称、头像、钱包或对手真实手牌 |
| 日志不泄露牌局隐私 | 通过 | 决策日志仅含不可逆房间引用、座位、受控的请求/实际引擎、动作、耗时和有限失败原因 |

## 发布门禁

- `PRIVACY_POLICY_URL` 仍是空占位，正式发布前必须注入审核后的隐私政策地址并接入可达 UI。
- 当前模型 manifest 为 `pending`，未包含权重。模型来源、许可证、再分发权、权重 SHA-256 和外部 `DOUZERO_APPROVED_MANIFEST_SHA256` 未审核并注入前，必须保持 `DDZ_DOUZERO_MODE=off`，不得发布 active 流量。
- 既有棋牌玩法、虚拟资产、语音和房间能力仍需按产品合规流程独立审核；本次技术接入不改变这些存量结论。
