# 幕间 Studio Y Web App

这是 AGW 剧游 Y 内置的独立 vinext/React 网站工程，呈现 AI 剧游创作工作台与能力共建台的高保真交互原型。

## 环境

- Node.js `>=22.13.0`
- npm（使用仓库内 `package-lock.json`）

## 本地开发

```bash
npm ci
npm run dev -- --hostname 127.0.0.1 --port 3100
```

## 验证与构建

```bash
npm test
npm run lint
npm run build
```

## 工程边界

- 页面与交互：`app/`
- 媒体与分享图：`public/`
- Cloudflare Worker：`worker/`
- 公开部署绑定：`.openai/hosting.json`
- 渲染与交互契约测试：`tests/`

当前版本使用可信演示数据，不连接真实生成服务、生产数据库或小游戏发布接口。
