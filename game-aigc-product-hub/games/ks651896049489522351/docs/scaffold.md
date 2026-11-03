🎮 脚手架已就绪：dou-di-zhu
📁 代码生成目录（唯一允许写入）：/Users/yuhuichao/work/minigame/game-aigc-product-hub/games/ks651896049489522351/package/js/

【约束】
- 所有业务逻辑只能写在 js/（含子文件夹），禁止修改根目录适配文件
- 快手环境：开发者工具加载 package/
- H5 调试：package/index.html 直接打开

【文件同步规则】
- 每新增 js/xxx.js → index.html 追加 <script src="js/xxx.js?v=1"></script>
- 所有 require 只写在 js/main.js 里，game.js 等业务文件内禁止使用 require
- js/main.js 除【占位绘制】（draw() 函数体）外禁止修改任何内容
- js/main.js 顶部 require 列表与 js/ 实际文件保持一致，子文件夹用相对路径
- main.js 保持最后加载；api/ 内文件已预置，禁止修改

【斗地主联机游戏 - 平台能力需求】
- Canvas 画布渲染 → `api/kwai-render.js`（通过 window.canvas 使用）
- WebSocket 联机通信 → `api/kwai-network.js`（KwaiNetwork.connectSocket）
- 用户登录 → `api/kwai-login.js`（KwaiLogin.init）
- 广告变现 → `api/kwai-ad.js`（激励视频 / 插屏 / Banner）
- 分享 → `api/kwai-share.js`（KwaiShare.share）
- 本地存储 → `api/kwai-storage.js`（KwaiStorage，保存设置）
- UI 提示 → `api/kwai-ui.js`（KwaiUI，Toast/Modal）
- 系统信息 → `api/kwai-base.js`（KwaiBase）
- 振动反馈 → `api/kwai-device.js`（出牌/赢牌时振动）

【斗地主游戏模块规划（js/ 目录）】
```
js/
  config.js      # 游戏常量（牌面、花色、牌型定义）
  layout.js      # 响应式布局计算（牌位置、尺寸）
  deck.js        # 牌组逻辑（洗牌、发牌、排序）
  player.js      # 玩家状态管理
  rule.js        # 斗地主出牌规则判断（牌型校验、比较）
  ai.js          # AI 出牌逻辑（单机模式）
  game.js        # 游戏主逻辑（叫地主、出牌回合、胜负判定）
  network.js     # WebSocket 联机客户端（房间、匹配、消息同步）
  render.js      # Canvas 绘制（桌面、手牌、出牌区域、UI 按钮）
  input.js       # 触摸/鼠标事件处理（选牌、出牌、叫地主按钮）
  main.js        # 装配 + 主循环（已预置，仅修改 require 和 draw）
```

【联机架构】
- 需要 Node.js 服务端（位于 dou-di-zhu/server/），使用 ws 库
- 客户端通过 WebSocket 连接服务端
- 消息协议：JSON 格式，包含 type/roomId/playerId/data 等字段
- 房间系统：创建房间、加入房间、匹配模式
- 游戏状态由服务端统一管理，客户端只负责渲染和输入

【游戏规则概述】
- 3 人游戏，1 个地主 vs 2 个农民
- 54 张牌（含大小王）
- 叫地主阶段：轮流叫分（1/2/3 分或不叫）
- 出牌规则：单张、对子、三条、三带一、三带二、顺子、连对、飞机、炸弹、火箭等
- 任意一方出完所有牌即结束

【当前实现补充】
- WebSocket 服务端位于 `server/`，默认监听 `localhost:8080`。
- H5 本地预览可通过静态服务加载 `package/index.html`，客户端默认连接 `ws://localhost:8080`。
- 当前联机状态、行动倒计时、超时托管、铁豆钱包和对局结算均由服务端权威维护。
- 详细系统规则、铁豆经济体系和验收清单见 `docs/game-systems.md`。
