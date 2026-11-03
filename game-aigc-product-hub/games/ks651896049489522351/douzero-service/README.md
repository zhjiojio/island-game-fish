# DouZero Sidecar

该服务只对 Node.js 提供候选评分，不维护房间状态，也不生成合法动作。

## 启动行为

- 已缓存且通过 SHA-256 校验的三份 WP ONNX 会直接复用，**不会联网**。
- 缓存缺失时，优先使用 `DOUZERO_MODEL_DOWNLOAD_URL_TEMPLATE` 指向的内网制品或镜像；未配置该变量且 `DOUZERO_ALLOW_HUGGINGFACE_DOWNLOAD=true` 时，才从固定 HuggingFace commit 下载。
- `DOUZERO_ALLOW_HUGGINGFACE_DOWNLOAD=false` 且缓存/内网制品不可用时，Sidecar 保持运行但 `GET /readyz` 返回 `503`；Node.js 自动降级到规则 AI，游戏服务不受阻断。
- 下载失败、模型缺失、外部审批摘要不匹配（正式审核模式）或 SHA-256 不匹配时，进程仍启动，`GET /healthz` 返回 `200`，`GET /readyz` 返回 `503`；Compose 和容器健康状态以 `/readyz` 为准，避免将不可推理的进程误判为模型可用。
- Node.js 不依赖本服务 ready；不可用时自动降级到现有规则 AI。
- 并发达到 `DOUZERO_MAX_CONCURRENT` 后立即返回 `503 busy`，不在 Sidecar 内排队。
- 默认并发为 `4`。在 2 vCPU、ONNX intra/inter-op 均为 1 的压测中，并发 4 是 64 候选负载的吞吐峰值；继续提高并发会降低吞吐并放大尾延迟。Compose 使用同一个 `DOUZERO_MAX_CONCURRENT` 值配置 Node 主流量和 Sidecar，避免上游过量放行。

## 模型准备

默认公开下载源固定为 `palemoky/douzero-baselines` 的 commit `57b3914046c2a0877016b8b8830fd07cf5b0ba08`（WP ONNX）。模型文件会逐份 SHA-256 校验，下载到临时文件后原子替换。

生产建议由发布流程预置模型缓存，或配置内网制品地址模板，并关闭公网下载：

```bash
DOUZERO_ALLOW_HUGGINGFACE_DOWNLOAD=false
DOUZERO_MODEL_DOWNLOAD_URL_TEMPLATE='https://artifact.example.internal/douzero/{revision}/{filename}'
```

模板可使用 `{filename}`、`{repository}`、`{revision}`、`{subdirectory}`。设置 `DOUZERO_AUTO_DOWNLOAD=false` 则完全不尝试下载，只使用已有缓存。Compose 使用持久化命名卷缓存模型；本地启动脚本使用项目下 `.runtime/douzero/models/`。权重不会进入 Git 或镜像。正式审核环境将 `DOUZERO_REQUIRE_APPROVED_MANIFEST_SHA256=true`，并由审核系统注入完整 manifest 的 `DOUZERO_APPROVED_MANIFEST_SHA256`。

## 本地启动

```bash
# 容器运行时可用时，优先 Docker / Podman；不可用时自动创建 Python venv 启动。
bash scripts/start.sh
```

本地脚本默认允许首次从 HuggingFace 下载。要验证离线降级，或避免公网依赖：

```bash
DOUZERO_ALLOW_HUGGINGFACE_DOWNLOAD=false bash scripts/start.sh
```

日志：容器运行时执行 `docker logs -f ddz-douzero-local` 或 `podman logs -f ddz-douzero-local`；Python 回退模式查看 `.runtime/logs/douzero.log`。

Node.js 单独运行并主动启用模型时，设置：

```bash
DDZ_DOUZERO_MODE=active \
DDZ_DOUZERO_TRAFFIC_PERCENT=100 \
DDZ_DOUZERO_URL=http://127.0.0.1:2021 \
npm --prefix ../server run start:dev
```

完整部署推荐在项目根目录运行 `bash scripts/start-compose.sh`。Compose 中的 `douzero` 是服务名，由 Compose 内置 DNS 自动解析，不是需要申请的内网域名。

## 依赖与制品审计

`pyproject.toml` 固定 Python 包版本，模型文件由 `model-manifest.json` 固定 SHA-256。发布环境还应保存镜像 digest、依赖下载源、SBOM 和第三方许可证扫描结果；本仓库不在构建时下载模型。
