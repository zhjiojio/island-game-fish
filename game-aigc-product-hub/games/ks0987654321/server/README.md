# 本地动态配置 Mock

本目录只用于客户端模板联调，不是生产配置后台。

```bash
npm --prefix server run dev
```

默认监听 `127.0.0.1:3100`：

- `GET /health`
- `GET /v1/games/ks0987654321/runtime-manifest`
- `GET /v1/games/ks0987654321/levels/neutral-level-1`

可选环境变量：`PORT`、`CONFIG_FIXTURE_DIR`、`ALLOWED_ORIGIN`。不得在环境文件或仓库中写入生产密钥。正式发布必须改为现有配置平台的 HTTPS 地址。
