# 部署配置说明

配置按三层存放，镜像内不含任何环境配置，同一镜像可在测试环境验证后原样发布到正式环境。

| 层 | 内容 | 位置 | 进 Git |
|---|---|---|---|
| 变量清单 | 所有变量、默认值与含义 | `server/.env.example` | 是 |
| 环境非敏感值 | host、port、库名、开关、连接池 | `deploy/env/staging.env`、`deploy/env/prod.env` | 是 |
| 敏感凭证 | 密钥、口令、access token | 平台密钥系统 | **否** |

## 目录

```
deploy/
├── env/
│   ├── staging.env              测试环境（快手内部集群 / KNode）非敏感配置
│   └── prod.env                 正式环境（阿里云 ACK）非敏感配置
└── aliyun/
    ├── configmap.yaml           由 prod.env 生成的 ConfigMap
    ├── secret.example.yaml      Secret 模板（禁止填真实值提交）
    └── deployment.yaml          Deployment 片段，envFrom 注入两者
```

## 敏感变量清单

以下变量禁止出现在仓库、`deploy/env/*.env` 和镜像中：

- `DDZ_AUTH_SECRET`
- `DDZ_MYSQL_PASSWORD`
- `DDZ_KWAI_APP_SECRET`
- `DDZ_KWAI_PAY_SIGN_KEY`、`DDZ_KWAI_PAY_NOTIFY_KEY`

测试与正式的凭证必须完全隔离，禁止复用同一套密钥或数据库账号。

## 测试环境（快手内部集群）

非敏感项按 `deploy/env/staging.env` 填入 KNode 服务的环境变量；敏感项使用 KNode 密钥项注入。

本地用 Compose 复现测试环境：

```bash
set -a && . deploy/env/staging.env && set +a
export DDZ_AUTH_SECRET=... DDZ_MYSQL_PASSWORD=...   # 仅当前 shell，不落盘
./scripts/start-compose.sh
```

## 正式环境（阿里云 ACK）

```bash
kubectl -n ddz create configmap ddz-prod-config \
  --from-env-file=deploy/env/prod.env \
  --dry-run=client -o yaml | kubectl apply -f -

kubectl -n ddz create secret generic ddz-prod-secret \
  --from-literal=DDZ_AUTH_SECRET='...' \
  --from-literal=DDZ_MYSQL_PASSWORD='...' \
  --from-literal=DDZ_KWAI_APP_SECRET='...'

kubectl -n ddz apply -f deploy/aliyun/deployment.yaml
```

`prod.env` 改动后需重新生成 ConfigMap 并重启 Deployment 才会生效。

## 新建 MySQL 数据库

新建空库时，使用 [20260920_full_schema.sql](../server/scripts/migrations/20260920_full_schema.sql) 一次性创建斗地主核心、机器人匹配、IAP 与平台币兑换所需的全部表和默认关闭的商品配置。该脚本要求 MySQL 8.0.16+，不包含任何密钥。

```bash
mysql -h <host> -P <port> -u <ddl_user> -p \
  < server/scripts/migrations/20260920_full_schema.sql
```

脚本默认创建数据库 `ddz`；如需其他库名，请先替换脚本中的 `CREATE DATABASE` 与 `USE` 语句后再执行。首次部署还需要以应用环境变量运行一次 `npm run db:init:mysql`，初始化三个机器人资金池账户。ACK 中使用 [db-init-job.yaml](aliyun/db-init-job.yaml) 执行，先替换镜像占位符后运行：

```bash
sed -e 's|__REGISTRY__|ai-minigame-acr-registry.cn-wulanchabu.cr.aliyuncs.com/ai-minigame|g' \
    -e 's|__TAG__|20260920|g' \
    deploy/aliyun/db-init-job.yaml | kubectl apply -f -
kubectl -n ddz logs -f job/ddz-db-init
```

Job 成功日志应包含 `机器人资金池已就绪`。该 Job 可幂等重跑。生产环境请设置 `DDZ_MYSQL_CREATE_DATABASE=false`，避免应用账号尝试建库。

## 约束

1. 快手账号 ID 使用代码内置、不可变的身份盐派生；修改该常量等同全量账号迁移。
2. 正式库 `DDZ_MYSQL_CREATE_DATABASE=false`，schema 迁移由 DBA 或独立发布任务执行。
3. `DDZ_MOCK_DIAMOND_BALANCE` 仅本地调试可用，禁止在任何部署环境设置。
4. 服务端不自动加载 `.env`，部署环境只认进程环境变量。
5. `DDZ_KWAI_APP_SECRET` 必须通过 Secret 注入；不得在源码、镜像或 Git 跟踪的配置中设置兜底值。
