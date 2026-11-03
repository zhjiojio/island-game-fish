# 镜像构建与 ACK 部署指南

> 项目：老铁斗地主  
> 更新时间：2026-09-02  
> 适用范围：本地开发构建、镜像发布、阿里云 ACK 部署

---

## 1. 镜像架构概览

项目包含**两个完全独立**的镜像，语言栈不同，职责分离：

| 镜像名 | 语言 | Dockerfile | 对外端口 | 用途 |
|---|---|---|---:|---|
| `ddz-server:latest` | Node.js 20 | `server/Dockerfile` | 8080 | 游戏 WebSocket 服务 |
| `ddz-douzero:latest` | Python 3.11 | `douzero-service/Dockerfile` | 2021（仅内部） | DouZero AI 出牌 Sidecar |

---

## 2. 各镜像构建说明

### 2.1 ddz-server（Node 服务）

```dockerfile
FROM node:20-alpine
RUN apk add --no-cache tini
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY . ./
RUN chown -R node:node /app && chmod +x start.sh
USER node
EXPOSE 8080
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["./start.sh"]
```

**关键点：**
- 基于 `node:20-alpine`，以非 root 用户 `node` 运行；
- 依赖由 `package-lock.json` 锁定并在构建阶段通过 `npm ci --omit=dev` 安装；
- `.dockerignore` 排除 `.env`、日志与本地数据库文件，敏感配置只能由 ACK Secret 注入；
- 使用 `tini` 作为 PID 1，确保 `SIGTERM` 信号正确传递给 Node 进程。

### 2.2 ddz-douzero（Python Sidecar）

```dockerfile
FROM python:3.11.9-slim-bookworm
WORKDIR /app
COPY pyproject.toml app.py capacity.py features.py inference.py model_fetcher.py ./
RUN pip install --no-cache-dir .   # 安装依赖
COPY model-manifest.json ./
RUN mkdir -p /app/models           # 模型目录（运行时挂载）
EXPOSE 2021
ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "2021", "--workers", "1"]
```

**关键点：**
- 基于 `python:3.11.9-slim-bookworm`；
- `pip install` 在构建时执行；
- `/app/models` 目录在镜像内为空，**模型文件通过 Volume 挂载**（见第 4 节）；
- 内置 `/readyz` 健康检查接口，启动后 15s 开始探活。

---

## 3. 本地 Docker Compose 启动

`server/docker-compose.yml` 将两个服务编排在同一 Compose 项目中：

```bash
# 仅启动 Node 服务（不启用 DouZero）
docker compose up -d

# 同时启动 DouZero（需显式指定 profile）
docker compose --profile douzero up -d
```

### 服务间通信原理

```
┌──────────── Docker 虚拟 bridge 网络 ─────────────┐
│                                                    │
│  game-server          douzero                      │
│  IP: 172.18.0.2       IP: 172.18.0.3               │
│  hostname: game-server hostname: douzero ← DNS 自动解析
│                                                    │
│  Node → http://douzero:2021 → DNS解析 → 172.18.0.3 │
└────────────────────────────────────────────────────┘
         ↑ 外部无法直接访问 2021（仅 expose 非 ports）
```

- Docker Compose 启动时自动创建 **bridge 虚拟网络**；
- 每个 `service` 名称（如 `douzero`）自动注册为该网络内的 **DNS 主机名**；
- Node 服务通过环境变量 `DDZ_DOUZERO_URL=http://douzero:2021` 访问 DouZero；
- `expose: ["2021"]` 只在容器网络内可达，**不穿透到宿主机**；宿主机无法直接访问 2021 端口。

---

## 4. 模型文件 Volume 挂载

### 为什么不打入镜像

| 原因 | 说明 |
|---|---|
| **体积过大** | 模型文件约 300 MB～1 GB，打入镜像后每次 `docker pull` 都要全量传输 |
| **镜像应无状态** | 镜像只装"程序代码"，数据/模型属于运行时数据，职责分离 |
| **模型独立更新** | 换模型版本无需重新构建镜像，只替换 Volume 里的文件即可 |
| **多实例可共享** | 同一份模型文件可被多个容器复用，不用每个实例复制一份 |

### 首次启动流程

```
首次启动：
  容器启动 → /app/models 为空 → 自动下载模型 → 写入 Volume → 启动服务

后续启动：
  容器启动 → /app/models 有缓存 → 直接加载 → 秒速启动
```

Compose 配置：

```yaml
volumes:
  - douzero-models:/app/models  # 挂载到容器内 /app/models

volumes:
  douzero-models:               # Docker 管理的具名 Volume，容器删了数据还在
```

---

## 5. 部署到阿里云 ACK

### 5.1 Step 1：构建并推送镜像到 ACR

以下命令已在 macOS + Podman 环境验证。ACK 节点通常为 `linux/amd64`，Apple Silicon 本机构建时必须显式指定目标平台。

```bash
cd /path/to/ks651896049489522351

export IMAGE_TAG=20260920
export ACR_REGISTRY=ai-minigame-acr-registry.cn-wulanchabu.cr.aliyuncs.com
export ACR_IMAGE="$ACR_REGISTRY/ai-minigame/ai-minigame-ltddz:$IMAGE_TAG"

# 使用 ACR 企业版实例地址登录；用户名与密码从 ACR 控制台访问凭证获取。
podman login --username='<阿里云账号全名>' "$ACR_REGISTRY"

# 构建服务端镜像。server/Dockerfile 不含环境配置与密钥。
podman build --platform linux/amd64 \
  -t "ai-minigame-ltddz:$IMAGE_TAG" \
  -f server/Dockerfile \
  server

# 标记并推送。
podman tag "ai-minigame-ltddz:$IMAGE_TAG" "$ACR_IMAGE"
podman push "$ACR_IMAGE"
```

本项目已验证的镜像地址格式为：

```text
ai-minigame-acr-registry.cn-wulanchabu.cr.aliyuncs.com/ai-minigame/ai-minigame-ltddz:<镜像版本号>
```

不要使用地域公共地址 `registry.cn-wulanchabu.aliyuncs.com`，也不要将控制台实例 ID 拼入镜像路径；两者会导致认证或仓库权限失败。推送后可在 ACR 控制台确认 Tag；部署 YAML 中也应使用同一完整地址。

DouZero Sidecar 如需独立构建与发布，可沿用相同的 `podman build --platform linux/amd64`、`tag` 和 `push` 流程，仅替换 Dockerfile、镜像名与目标仓库。

### 5.2 Step 2：Kubernetes 部署 YAML

在 Kubernetes 中，**两个容器部署在同一 Pod**（Sidecar 模式），共享网络命名空间，互相通过 `localhost` 通信（比 Docker Compose 的 DNS 更近）：

```yaml
# ddz-deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: ddz-game
spec:
  replicas: 1
  selector:
    matchLabels:
      app: ddz-game
  template:
    metadata:
      labels:
        app: ddz-game
    spec:
      containers:
        # ---- 容器 1: Node 服务 ----
        - name: game-server
          image: registry.cn-hangzhou.aliyuncs.com/<命名空间>/ddz-server:v1.0.0
          ports:
            - containerPort: 8080
          env:
            - name: DDZ_DOUZERO_URL
              value: "http://localhost:2021"   # 同 Pod 内用 localhost
            - name: DDZ_DOUZERO_MAX_CONCURRENT
              value: "4"                       # 与 Sidecar 保持一致
            - name: DDZ_AUTH_SECRET
              valueFrom:
                secretKeyRef:
                  name: ddz-secret
                  key: auth-secret
            - name: DDZ_MYSQL_HOST
              valueFrom:
                secretKeyRef:
                  name: ddz-secret
                  key: mysql-host
            # ... 其余环境变量参考 docker-compose.yml
          readinessProbe:
            httpGet:
              path: /readyz
              port: 8080
            initialDelaySeconds: 10
            periodSeconds: 15

        # ---- 容器 2: DouZero Sidecar ----
        - name: douzero
          image: registry.cn-hangzhou.aliyuncs.com/<命名空间>/ddz-douzero:v1.0.0
          ports:
            - containerPort: 2021
          env:
            - name: DOUZERO_AUTO_DOWNLOAD
              value: "true"
            - name: DOUZERO_ALLOW_HUGGINGFACE_DOWNLOAD
              value: "false"
            - name: DOUZERO_MAX_CONCURRENT
              value: "4"
          volumeMounts:
            - name: douzero-models
              mountPath: /app/models   # 对应 Volume 挂载点
          readinessProbe:
            httpGet:
              path: /readyz
              port: 2021
            initialDelaySeconds: 30    # 模型首次下载需要时间
            periodSeconds: 15
          resources:
            requests:
              cpu: "1"
              memory: "1Gi"
            limits:
              cpu: "2"
              memory: "2Gi"

      volumes:
        - name: douzero-models
          persistentVolumeClaim:
            claimName: douzero-models-pvc  # 见下方 PVC

---
# 对外暴露 Node 的 8080 端口
apiVersion: v1
kind: Service
metadata:
  name: ddz-game-svc
spec:
  selector:
    app: ddz-game
  ports:
    - port: 80
      targetPort: 8080
  type: LoadBalancer   # ACK 自动创建阿里云 SLB

---
# PVC：持久化模型文件（对应 Docker Compose 的 douzero-models Volume）
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: douzero-models-pvc
spec:
  accessModes:
    - ReadWriteOnce
  resources:
    requests:
      storage: 5Gi
  storageClassName: alicloud-disk-efficiency   # 阿里云高效云盘
```

### 5.3 Step 3：创建 Secret

```bash
kubectl create secret generic ddz-secret \
  --from-literal=auth-secret='<DDZ_AUTH_SECRET>' \
  --from-literal=mysql-host='<DDZ_MYSQL_HOST>' \
  --from-literal=mysql-user='<DDZ_MYSQL_USER>' \
  --from-literal=mysql-password='<DDZ_MYSQL_PASSWORD>'
```

### 5.4 Step 4：部署并查看状态

```bash
kubectl apply -f ddz-deployment.yaml

# 查看 Pod 状态
kubectl get pods -l app=ddz-game

# 查看各容器日志
kubectl logs -f <pod名> -c game-server
kubectl logs -f <pod名> -c douzero

# 查看 Service（获取外部 IP）
kubectl get svc ddz-game-svc
```

---

## 6. Docker Compose vs Kubernetes 对比

| 特性 | Docker Compose（本地） | Kubernetes ACK（生产） |
|---|---|---|
| 容器关系 | 同 Compose 项目，独立容器 | 同一 Pod，共享网络命名空间 |
| 服务发现 | DNS 解析服务名（`http://douzero:2021`） | `localhost:2021`（同 Pod） |
| 模型存储 | Docker 具名 Volume | PersistentVolumeClaim（云盘） |
| 对外暴露 | `ports: 8080:8080` | Service + LoadBalancer（SLB） |
| DouZero 启用方式 | `--profile douzero` | 默认与 Node 同 Pod 启动 |
| 健康检查 | Compose `healthcheck` | K8s `readinessProbe` |

---

## 7. 注意事项

1. **首次启动**：DouZero 容器会自动下载模型文件（约数百 MB），`readinessProbe` 的 `initialDelaySeconds` 设为 30s 以上；
2. **模型缓存**：模型写入 PVC 后永久保留，重启 Pod 不会重新下载；
3. **密钥安全**：所有 `DDZ_AUTH_SECRET`、MySQL 密码等不得写入 YAML 明文，统一通过 `Secret` 注入；
4. **单活动实例**：当前 Node 服务为有状态单进程，ACK 中 `replicas` 必须保持为 `1`，不可直接水平扩展（参见 `alibaba-cloud-two-phase-production-deployment.md`）。
