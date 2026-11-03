# 服务端方案

## 1. 是否启用服务端

- 结论：启用。
- 理由：游戏运行时需要获取地图、关卡、卡牌、成长、羁绊、资源和灰度配置。
- 本期边界：生产环境复用既有动态配置后台；仓库内只约定客户端契约和无依赖本地 Mock。首版不提供排行榜、多人、账号绑定、远程用户资产、支付、AIGC 代理或数据库。
- 输入说明：本项目没有 `docs/idea-search.json` 或 `docs/idea-search.md`，因此不继承其他参考仓库的后端结构。

## 2. 服务端职责

| 能力 | 是否需要 | 说明 | 客户端降级策略 |
|---|---|---|---|
| 运行时清单 | 是 | 下发配置版本、世界地图、卡牌目录、成长、羁绊、关卡引用和资源清单 | 使用上一个校验成功的本地缓存；无缓存时使用中性内置配置 |
| 基础关卡配置 | 是 | 下发兼容 `schemaVersion: 5`、`fixed-path-v1` 的关卡 JSON | 同上 |
| 灰度与版本 | 是 | 按渠道和客户端版本选择配置版本，支持 ETag | 忽略灰度，使用缓存版本 |
| 用户存档 | 否 | 首版使用客户端本地存储，不做跨端同步 | `KwaiStorage` 本地存储 |
| 账号/登录态 | 否 | 配置读取不依赖用户身份 | 游客态可完整运行 |
| 数据库 | 否 | 配置数据由既有后台维护，本地 Mock 使用只读 JSON fixture | 无数据库初始化 |
| 排行榜/PVP/社交 | 否 | 不属于本模板范围 | 不提供入口 |
| AIGC 代理 | 否 | 本阶段不调用媒体模型 | 不提供接口 |
| 支付/IAP | 否 | 本模板不包含 IAP | 不提供接口 |

## 3. 技术框架

- runtime：`node>=22`
- framework：`node-http`（仅本地 Mock，使用 Node.js 内置模块，无运行时第三方依赖）
- package_manager：`npm`
- storage：本地 Mock 使用版本化 JSON fixture；生产配置由既有配置平台托管
- auth：本地 Mock 无鉴权；生产配置为只读公开游戏配置，若平台网关要求签名，签名只存在于服务端网关，禁止下发客户端密钥

## 4. 代码结构

```text
server/
├── package.json
├── README.md
├── fixtures/
│   ├── runtime-manifest.json
│   └── levels/
│       └── neutral-level-1.json
└── src/
    ├── app.js
    ├── routes/
    │   ├── health.js
    │   └── config.js
    ├── services/
    │   └── config-service.js
    ├── repositories/
    │   └── fixture-repository.js
    └── config/
        └── env.js
```

服务端目录只为本地联调和契约验证服务，不作为生产配置平台实现。

## 5. API 契约

统一响应头：

- `Content-Type: application/json; charset=utf-8`
- `Cache-Control` 和 `ETag` 由配置版本决定
- 支持请求头 `If-None-Match`，未变化时返回 `304`
- 生产环境必须使用 HTTPS，并将域名加入快手后台 request 合法域名

| 接口 | 方法 | 请求 | 响应 | 错误码 | 鉴权 |
|---|---|---|---|---|---|
| `/health` | GET | 无 | `{ "ok": true, "service": "config-mock", "version": "1" }` | `500` 服务异常 | 无 |
| `/v1/games/{appid}/runtime-manifest` | GET | Query：`channel?`、`clientVersion?`；Header：`If-None-Match?` | 运行时清单、配置版本、地图节点、卡牌目录、成长、羁绊、关卡引用和资源清单 | `400` 参数错误；`404` 游戏不存在；`304` 未变化；`500` 服务异常 | 本地无；生产按既有平台网关 |
| `/v1/games/{appid}/levels/{levelId}` | GET | Path：`appid`、`levelId`；Header：`If-None-Match?` | 原格式关卡 JSON，必须兼容 `schemaVersion: 5` 与 `fixed-path-v1` | `400` ID 非法；`404` 关卡不存在；`304` 未变化；`422` 配置无效；`500` 服务异常 | 本地无；生产按既有平台网关 |

### 运行时清单最小结构

```json
{
  "schemaVersion": 1,
  "revision": 1,
  "gameId": "ks0987654321",
  "deckRules": { "deckSize": 5, "allowDuplicates": false },
  "cards": [],
  "progression": {},
  "bonds": [],
  "worldMap": { "nodes": [] },
  "levels": {},
  "assetManifest": []
}
```

清单与关卡响应只允许 JSON 数据，不允许脚本、表达式、HTML、动态函数或可执行 URL。

## 6. 数据库与初始化约束

- 是否涉及 DB / MySQL：否。
- 数据库文档：不生成 `docs/db-schema.md`。
- 初始化脚本：不生成 `server/scripts/init-mysql.*`。
- 检查范围：本地 Mock 启动时校验 fixture 存在、JSON 可解析、版本字段有效、关卡引用完整。

如果后续启用远程用户存档、排行榜或用户资产，必须重新进入服务端方案阶段，补充数据库文档、幂等初始化脚本、鉴权和迁移策略。

## 7. 客户端调用约定

- API client 文件：`package/js/play/runtime-config.js`
- 平台请求：统一调用脚手架的 `KwaiNetwork`，禁止直接调用裸 `ks.request`。
- base URL：从构建环境或启动配置注入；不得写死生产域名。
- 超时：首请求 5 秒，关卡请求 5 秒。
- 重试：仅网络错误和 `5xx` 重试一次，退避 500 毫秒；`4xx` 不重试。
- 缓存：以 `appid + configRevision + resourceId` 为键，只有完整校验成功后才原子替换。
- 降级顺序：远程有效配置 → 上次有效缓存 → 内置中性兜底配置。
- 禁止事项：不得把服务端密钥、网关签名密钥、Cookie 或生产 token 写入 `package/`、文档或日志。
- 数据校验：限制响应大小、数组长度、地图尺寸、数值范围、资源协议和 ID 格式；引用必须闭合。
- 执行安全：禁止 `eval`、`Function`、远程脚本和配置表达式求值。

## 8. 本地启动

- install：`npm --prefix server install`
- start：`npm --prefix server run dev`
- port：环境变量 `PORT`，默认 `3100`
- healthcheck：`http://127.0.0.1:3100/health`
- init_mysql：不适用
- env：`PORT`、`CONFIG_FIXTURE_DIR`、`ALLOWED_ORIGIN`；不得提交密钥

Node.js 内置模块实现无需第三方生产依赖，`npm install` 仅用于统一脚本入口。

## 9. 联调与自测

- 本地 Mock：启动后先检查 `/health`，再读取运行时清单和至少一个关卡配置。
- 真实服务：由现有动态配置后台提供正式 HTTPS base URL、域名白名单、响应样例和灰度规则后联调。
- 数据库初始化检查：不适用。
- 关键接口检查：`200`、`304`、`404`、超时、无效 JSON、错误 schema、引用缺失、缓存回退和中性兜底。
- 兼容检查：使用用户提供的原格式 JSON 验证基础关卡解析，但测试断言不得依赖其题材名称。

## 10. 发布与回滚边界

- deploy_target：`existing-config-platform-handoff`
- formal_base_url：待现有配置平台提供，不写入仓库。
- rollback：配置平台回退到上一 revision；客户端同时保留上一次有效缓存。
- 若仍为本地 Mock，是否阻断正式发布：是。
- 客户端模板开发、H5 本地预览和配置契约测试不受正式地址缺失影响。

## 11. 合规与安全

- 用户数据最小化：配置读取不需要 openId、手机号、设备标识或定位；局外进度首版仅本地保存。
- 日志脱敏：不记录 token、完整请求头、用户标识或配置平台内部地址；错误日志仅记录请求 ID、状态码和配置 revision。
- 密钥管理：生产密钥由既有平台网关管理，不进入客户端、Git、文档或聊天。
- 内容审核：配置平台负责资源和文案审核；客户端仍执行 schema、协议和能力白名单校验。
- 传输安全：生产仅 HTTPS；资源 URL 仅允许配置的 HTTPS 域名。
- 隐私入口：客户端保留隐私政策、用户协议、实名认证、防沉迷和客服调用点。
