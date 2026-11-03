# 斗地主服务端

Node.js 是唯一权威游戏服务，负责 WebSocket、房间、规则、匹配、MySQL 持久化和结算。`douzero-service/` 是可选的 Python/ONNX 出牌评分 Sidecar；它不可用时，机器人自动使用现有规则 AI。

## 推荐启动方式

在项目根目录准备部署环境变量后执行：

```bash
bash scripts/start-compose.sh
```

脚本自动选择 Docker Compose 或 Podman Compose，以部署环境提供的正式 MySQL IP/域名启动 Node.js，最后尝试启动 DouZero。Compose 不包含 MySQL 镜像、不会创建数据库或执行 schema 初始化。Sidecar 构建、启动或模型加载失败不会停止已经启动的 Node.js。只启动核心 Node.js（不构建 Sidecar）也可直接执行：

```bash
docker compose -f compose.yml up -d --build
```

显式包含 Sidecar 时使用 `docker compose --profile douzero -f compose.yml up -d --build`；日常更推荐上面的启动脚本，以确保 Sidecar 失败不撤销核心服务。

Compose 中 `http://douzero:2021` 使用的是 Compose 服务名和内置 DNS，不需要申请内网域名。Sidecar 不映射宿主机端口，客户端始终只连接 Node.js 的 `8080` 端口。

## 环境变量

参考 `server/.env.example`，部署时至少注入：

- `DDZ_AUTH_SECRET`
- `DDZ_MYSQL_HOST`
- `DDZ_MYSQL_USER`
- `DDZ_MYSQL_PASSWORD`
- `DDZ_MYSQL_DATABASE`

机器人匹配票据使用 `DDZ_AUTH_SECRET` 签名，因此该密钥必须至少 16 字符。

DouZero 默认全量生效：

```bash
DDZ_DOUZERO_MODE=active
DDZ_DOUZERO_TRAFFIC_PERCENT=100
DDZ_DOUZERO_SHADOW_PERCENT=0
```

可选模式为 `off`、`shadow` 和 `active`。`active` 默认全量启用；模型启动失败、未就绪、超时、异常或非法响应时自动回退规则 AI。`shadow` 只观测模型选择，规则 AI 仍生效。详细参数和模型审核门禁见 `../docs/server.md` 与 `../douzero-service/README.md`。

## 单独开发

```bash
npm install
# 使用已由 DBA 完成迁移的外部 MySQL：DDZ_MYSQL_HOST / USER / PASSWORD / DATABASE
npm run start:dev
```

Node 单独运行且要访问本机 Sidecar 时设置：

```bash
DDZ_DOUZERO_URL=http://127.0.0.1:2021
```

本地一站式启动使用项目根目录的命令：

```bash
bash server/scripts/start-dev.sh
```

它会先尝试启动 `douzero-service/scripts/start.sh`：Docker/Podman 可用时使用容器，均不可用时回退到项目 `.runtime/douzero/venv` 内的 Python 进程；随后启动 Node.js 与 H5 预览。DouZero 未能启动、下载失败或未就绪均不会阻断 Node.js，机器人自动回退规则 AI。需要停止全部本地进程时运行 `bash server/scripts/stop-dev.sh`。

需要并行启动隔离实例时，可通过 `DDZ_RUNTIME_DIR` 指定另一份 PID、日志和模型缓存目录，并同时指定不同的 `WS_PORT`、`H5_PORT`、`DOUZERO_PORT`。

本地 Node 默认访问 `http://127.0.0.1:2021` 的 Sidecar。如需明确关闭模型请求，再设置 `DDZ_DOUZERO_MODE=off`。生产环境应预置已审核模型，或设置内网制品模板并 `DOUZERO_ALLOW_HUGGINGFACE_DOWNLOAD=false`，不要依赖 HuggingFace 可用性。

## 健康检查与验证

- Node.js：TCP `8080`。
- Sidecar 存活：`GET http://127.0.0.1:2021/healthz`（仅在单独映射或本机启动 Sidecar 时）。
- Sidecar 就绪：`GET http://127.0.0.1:2021/readyz`；模型缺失或未审核时预期返回 `503`。

```bash
npm test
node --test test/douzero-integration.test.js test/game-ai.test.js
```

模型生效和自动降级动作始终输出一条 `[机器人决策]`；正常规则动作与正常 Shadow 落地动作默认按整局稳定采样 5%，可通过 `DDZ_DOUZERO_DECISION_LOG_PERCENT` 调整。日志使用受控枚举的 `requested_engine=rule|douzero|douzero_shadow` 与 `selected_engine=rule|douzero`，因此能区分 Shadow、模型生效和降级；不记录手牌或模型请求体。Shadow 结果默认每 100 个样本输出一条 `[DouZero影子]` 聚合日志，可通过 `DDZ_DOUZERO_SHADOW_LOG_EVERY` 调整。
