---
name: agw-video-adaptation-y
description: Use when opening, running, testing, deploying, or continuing the standalone 幕间 Studio AI drama creation prototype and its independent web workbench. 触发词：剧游 Y、幕间 Studio Y、独立剧游工作台、AI 剧游创作平台。
---

# AGW 剧游 Y

Y 是一个完整独立的幕间 Studio Web 工作台，覆盖项目总览、剧本、人物、视频、游戏组装、构建发布和能力共建台。当前交付是高保真交互原型；演示数据位于前端源码中，不承诺真实 AI 生成、多人协作或平台发布。

## 启动

```bash
node "<SKILL_DIR>/scripts/start-workbench.mjs"
```

默认地址为 `http://127.0.0.1:3100/`。可用 `--port <PORT>` 指定独立端口，用 `--no-open` 禁止自动打开浏览器。启动器会在首次运行时安装 `webapp/` 自己的依赖。

## 独立性边界

- 网站源码、媒体、依赖、构建配置、测试和启动器全部位于本目录。
- 不读取兄弟技能的源码、运行时、环境变量、项目数据或依赖目录。
- 不以符号链接、Git 子模块或运行时下载引用临时源工程。
- 本地开发、生产构建和公开部署都以 `webapp/` 为唯一工程根目录。

## 主要命令

```bash
cd "<SKILL_DIR>/webapp"
npm ci
npm test
npm run lint
npm run build
```

修改网页时保留桌面端三栏制作台、七个工作区及现有代表交互。公开部署由 `webapp/.openai/hosting.json` 和网站工程自己的构建配置负责。

## 验证

先运行隔离契约：

```bash
node --test "<SKILL_DIR>/tests/y-isolation.test.mjs"
```

再在 `webapp/` 运行 `npm test`。任务完成时返回：修改范围、隔离检查、应用测试、构建结果、本地地址和部署状态。
