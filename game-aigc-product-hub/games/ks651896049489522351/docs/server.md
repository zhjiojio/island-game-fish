# 服务端方案

## 1. 是否启用服务端

- 结论：启用。
- 理由：现有项目已经包含 Node.js 权威联机服务、MySQL 持久化、匹配、机器人和资产结算；本次新增 DouZero 出牌推理能力。
- 本期边界：Node.js 继续是唯一权威游戏服务；DouZero 是同仓库、无状态、可缺席的 Python/ONNX Sidecar，只为机器人 `playing` 阶段的合法候选评分。客户端协议、叫抢、加倍、规则判定和结算不变。

## 2. 服务端职责

| 能力 | 是否需要 | 说明 | 客户端降级策略 |
|---|---|---|---|
| WebSocket 联机与房间状态 | 是 | 继续由 Node.js 权威维护 | 无变化，客户端只连接 Node.js |
| 登录、匹配、钱包与结算 | 是 | 沿用现有 Node.js + MySQL 实现 | 沿用现有错误反馈，不由 DouZero 参与 |
| 合法动作生成与最终校验 | 是 | Node.js 生成候选并在动作生效前再次校验 | 模型不可绕过规则；客户端无感 |
| DouZero 推理 | 是 | Python/ONNX Sidecar 仅在候选中返回一个 `candidate_id` | 超时、异常、未就绪、非法响应时 Node.js 自动使用现有规则 AI |
| 叫地主、抢地主、加倍 AI | 是 | 继续使用现有规则策略 | 不调用 DouZero |
| 模型训练与首次下载 | 否训练、是下载 | 首次启动从固定 HuggingFace commit 下载 WP ONNX，逐文件 SHA-256 校验后缓存；正式环境可改为审核制品 | 下载或校验失败时 Node.js 正常运行 |
| 新数据库表 | 否 | 出牌历史仅存房间内存；沿用现有比赛事件审计 | 不影响客户端 |

## 3. 技术框架

- runtime：Node.js `>=18`（部署镜像使用 Node 20）+ Python `>=3.11,<3.13`。
- framework：现有 Node.js `ws` 游戏服务 + FastAPI/Uvicorn 推理 Sidecar + ONNX Runtime CPU。
- package_manager：Node.js 使用 npm；Python 使用 pip/`pyproject.toml`。
- storage：现有业务持久层保持 MySQL-only，数据库为部署环境提供的外部正式实例；Sidecar 无数据库、无状态、无用户数据落盘。
- auth：客户端沿用现有小游戏登录态；Sidecar 仅通过隔离的 Compose 内部网络供 Node.js 访问，不对客户端或公网开放。

## 4. 代码结构

```text
server/
├── index.js
├── game-ai/
│   ├── strategy.js
│   ├── observation.js
│   ├── legal-actions.js
│   ├── decision-router.js
│   └── douzero/
│       ├── codec.js
│       ├── context-builder.js
│       ├── client.js
│       └── circuit-breaker.js
├── bots/
│   └── bot-scheduler.js
├── persistence/
└── test/

douzero-service/
├── app.py
├── capacity.py
├── inference.py
├── features.py
├── model-manifest.json
├── pyproject.toml
├── Dockerfile
└── NOTICE

compose.yml
```

Node.js 与 Sidecar 是两个进程/容器，但属于同一个仓库和同一个 Compose 发布单元。Node.js 不通过语言嵌入加载 Python，避免 Python/ONNX 崩溃或初始化拖慢游戏主进程。

## 5. API 契约

| 接口 | 方法 | 请求 | 响应 | 错误码 | 鉴权 |
|---|---|---|---|---|---|
| `/healthz` | GET | 无 | `{"status":"ok"}` | `500` 进程异常 | Compose 内网 |
| `/readyz` | GET | 无 | 模型就绪状态与安全的模型版本信息 | `503` 模型缺失、哈希不符或加载失败 | Compose 内网 |
| `/v1/decide-play` | POST | `schema_version`、`decision_id`、相对位置、当前机器人手牌、公开历史/剩余张数、Node 合法候选 | 原样 `decision_id`、`candidate_id`、模型版本、推理耗时 | `400/422` 请求非法；`503` 未就绪/繁忙；`500` 推理失败 | Compose 内网 |

关键约束：

- Node.js 是候选唯一来源；Sidecar 不枚举规则动作。
- `candidate_id` 必须属于本次请求，且响应 `decision_id` 必须完全一致。
- 相同牌面组合只发送一个候选，Node.js 保留候选到精确实体 `cardIds` 的映射。
- 请求不包含其他玩家手牌、账号、昵称、头像、钱包或连接信息。
- 单次行动不重试模型。

## 6. 客户端调用约定

- API client 文件：模型调用仅位于 `server/game-ai/douzero/client.js`；小游戏 `package/` 不新增 DouZero client。
- 超时：默认 `800 ms`，配置范围限制为 `50..1500 ms`；同时受本回合绝对截止时间约束。
- 重试：不重试，立即回退规则 AI。
- 降级：`off`、模型未启用、未命中整局灰度、超时、连接失败、`5xx`、非法 JSON、串包或未知候选均返回同一观察快照计算出的规则动作。
- 禁止事项：不得把模型地址、权重、服务端密钥或数据库凭据写入 `package/`；不得让客户端直接访问 Sidecar。

## 7. 本地启动

- install：`cd server && npm install`；本地执行 `bash server/scripts/start-dev.sh` 时自动调用 `douzero-service/scripts/start.sh`，优先 Docker/Podman、无容器运行时则自动创建 Python venv 启动。模型缓存命中且 SHA-256 正确时绝不联网；缓存缺失时优先内网制品模板 `DOUZERO_MODEL_DOWNLOAD_URL_TEMPLATE`，仅当 `DOUZERO_ALLOW_HUGGINGFACE_DOWNLOAD=true` 才访问固定 HuggingFace commit。设置 `DOUZERO_AUTO_DOWNLOAD=false` 时完全不下载。
- start：推荐在项目根目录执行 `bash scripts/start-compose.sh`。Compose 只启动 Node.js 和可选 Sidecar，数据库必须以 `DDZ_MYSQL_HOST`（IP 或域名）、`DDZ_MYSQL_USER`、`DDZ_MYSQL_PASSWORD`、`DDZ_MYSQL_DATABASE` 指向已完成迁移的正式 MySQL 实例；不会启动 MySQL 镜像、建库或建表。正式 Compose 默认关闭 HuggingFace 下载，应预置模型卷或配置内网制品模板。Sidecar 构建/启动失败不会撤销核心服务。直接执行 `docker compose -f compose.yml up -d --build` 只启动 Node.js；显式添加 `--profile douzero` 才包含 Sidecar。Node 应用进程只校验 schema 是否就绪。
- port：Node.js WebSocket 默认宿主机 `8080`；Sidecar 容器内 `2021`，默认不映射宿主机端口。
- healthcheck：Sidecar 的进程存活检查为 `/healthz`，模型就绪检查为 `/readyz`；Compose 与容器健康状态使用 `/readyz`，避免将“进程仍在、模型不可推理”误判为可用。Node.js 只有在外部 MySQL 连接成功、schema 校验完成并写入就绪标记后才判定 healthy。Node.js 的就绪状态不依赖 Sidecar ready。
- 牌力评估：`DDZ_HAND_STRENGTH_MODE=lite|v1`，默认 `lite`；`v1` 仅用于紧急回滚。精确 V2、牌力 Shadow、状态预算和百分比灰度配置已移除。
- env：`DDZ_DOUZERO_MODE=off|shadow|active`（默认 `active`）、`DDZ_DOUZERO_URL=http://douzero:2021`、`DDZ_DOUZERO_TIMEOUT_MS=800`、`DDZ_DOUZERO_TRAFFIC_PERCENT=0..100`（默认 `100`）、`DDZ_DOUZERO_SHADOW_PERCENT=0..100`、`DDZ_DOUZERO_MAX_CONCURRENT=4`、`DDZ_DOUZERO_SHADOW_MAX_CONCURRENT=2`、`DDZ_DOUZERO_SHADOW_LOG_EVERY=100`、`DDZ_DOUZERO_DECISION_LOG_PERCENT=5`。Sidecar 使用 `DOUZERO_MAX_CONCURRENT=4`、`DOUZERO_AUTO_DOWNLOAD`、`DOUZERO_ALLOW_HUGGINGFACE_DOWNLOAD`（生产默认 false）和可选的 `DOUZERO_MODEL_DOWNLOAD_URL_TEMPLATE` 控制模型来源；Compose 从同一个 `DOUZERO_MAX_CONCURRENT` 配置 Node 主流量和 Sidecar。缓存始终优先且校验 SHA-256。正式审核部署启用 `DOUZERO_REQUIRE_APPROVED_MANIFEST_SHA256=true` 并注入 `DOUZERO_APPROVED_MANIFEST_SHA256`。`douzero` 是 Compose 服务名，由 Compose 内置 DNS 自动解析，不是需申请的内网域名；Node 单独运行时使用 `http://127.0.0.1:2021`。

Node.js 不声明对 Sidecar 的 `depends_on`；允许先启动 Node.js，再由 Sidecar 异步完成模型加载或完全缺席，在此期间机器人使用规则 AI。

## 8. 联调与自测

- 本地 mock：Node 单独启动、Sidecar 不启动，验证所有机器人完整牌局自动回退规则 AI。
- 真实服务：仅在三份权重的来源、许可证和 SHA-256 已审核并写入 manifest 后启用 `/readyz` 和真实推理。
- 关键接口检查：三个相对位置、牌值映射、完整出牌/pass 历史、剩余牌数守恒、炸弹数、候选稳定映射、超时、`500`、非法 JSON、未知候选、串包、熔断和过期响应。
- 回归：运行现有 Node.js 测试、新增 DouZero 适配测试、Python 语法检查和 Compose 配置校验。

## 9. 发布与回滚边界

- deploy_target：单机 Docker Compose，一个仓库、一个构建/发布单元、两个应用容器；MySQL 始终使用外部正式实例，不纳入 Compose。
- formal_base_url：`http://douzero:2021`，仅 Compose 内部可见；客户端正式地址仍是 Node.js WebSocket 地址。
- fallback：默认 `DDZ_DOUZERO_MODE=active`、`DDZ_DOUZERO_TRAFFIC_PERCENT=100`，模型作为出牌主策略。Sidecar 启动失败、未就绪、超时、异常、熔断、非法响应或未知候选会立即触发规则 AI，Node.js 无需重启。配置设为 `off` 后不再发模型请求。
- 若仍为本地 mock，是否阻断正式发布：不阻断 Node.js/规则 AI 版本发布，但必须保持 `off`；阻断 DouZero `active` 发布。
- 自动下载仅使用固定 HuggingFace commit 与三份固定 SHA-256；权重不进入 Git 或镜像，首次下载目录需可写。下载失败、完整性校验失败或模型契约不匹配均保持 Sidecar 未就绪并回退规则 AI。正式环境须额外启用审核后 manifest SHA-256 门禁。

## 10. 合规与安全

- 用户数据最小化：只发送当前机器人自身手牌与公开牌局状态；不发送账号、真人昵称、头像、设备、钱包和其他玩家真实手牌。
- 日志脱敏：模型生效和降级动作始终记录；普通规则动作与正常 Shadow 落地动作按整局稳定比例采样。每个被采样动作最多一条结构化摘要，只记录不可逆房间引用、座位、受控枚举的请求引擎和实际引擎、动作、延迟和有限降级原因；不得打印原始房间号、玩家 ID、手牌、请求体、特征矩阵或认证信息。
- 密钥管理：本方案不需要 Sidecar API Key；MySQL 凭据继续只从部署环境注入，不写入代码、文档示例或镜像。
- 内容审核：Sidecar 不生成文本、图像或用户可见内容。
- 供应链：不复制 GPL-3.0 参考项目包装代码；实际复用官方 Apache-2.0 DouZero 部分时保留 LICENSE/NOTICE/修改说明。权重单独审核并在启动时按 manifest 校验 SHA-256。
- 故障隔离：模型未加载、超时、异常和容器退出不能改变 Node.js readiness；熔断器限制故障调用，Sidecar 有界并发，避免拖慢 WebSocket 主服务。
