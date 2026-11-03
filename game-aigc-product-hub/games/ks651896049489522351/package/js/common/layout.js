(function () {
  var M3 = window.M3 = window.M3 || {};

  // ---- 响应式布局计算（手机横屏优先） ----
  M3.Layout = M3.Layout || {};

  M3.Layout.calc = function () {
    var L = M3.Layout;
    var W = L.w, H = L.h;

    // 屏幕方向判断
    L.isLandscape = W > H;

    // 短边（用于限制纵向元素尺寸）
    var short = Math.min(W, H);

    // ---- 卡牌尺寸（上限受短边约束） ----
    // 手牌宽高比按设计稿 69*100（≈1.449）。
    L.cardW = Math.max(36, Math.min(72, short / 5.7));
    L.cardH = Math.round(L.cardW * 100 / 69);

    // ---- 出牌（落地牌）尺寸：固定 40*59（宽*高），牌间距固定 19 ----
    L.playCardW = 40;
    L.playCardH = 59;

    // ---- 玩家面板 ----
    L.playerPanelSelfW = Math.min(180, W * 0.25);
    L.playerPanelOtherW = Math.min(140, W * 0.2);
    L.playerPanelH = L.isLandscape ? Math.min(52, H * 0.14) : 68;

    // ---- 头像半径 ----
    L.selfAvR  = 34;   // 自己头像
    L.otherAvR = 23;   // 对手头像（Figma 130-2061 Player Areas：46×46，面板 61×97）

    // ---- 统一左边距（退出按钮 / 左侧头像 / 我的头像 左侧对齐，整体右移留安全距离）----
    L.leftEdgeX = Math.max(64, W * 0.075);

    // ---- 玩家位置 ----
    if (L.isLandscape) {
      // 横屏：自己在左下（靠近底部），左右玩家上移且水平对齐
      L.playerPos = [
        { x: L.leftEdgeX + L.selfAvR,  y: H - 46,    pw: L.playerPanelSelfW },
        { x: L.leftEdgeX + L.otherAvR, y: H * 0.28,  pw: L.playerPanelOtherW },
        { x: W * 0.855,                y: H * 0.28,  pw: L.playerPanelOtherW },
      ];
    } else {
      L.playerPos = [
        { x: L.leftEdgeX + L.selfAvR,  y: H - 80,    pw: L.playerPanelSelfW },
        { x: L.leftEdgeX + L.otherAvR, y: H * 0.28,  pw: L.playerPanelOtherW },
        { x: W * 0.86,                 y: H * 0.28,  pw: L.playerPanelOtherW },
      ];
    }

    // ---- 手牌 Y 位置（位于金豆/倍数上方，整体略微下移贴近底部）----
    // 底部留白 46 → 62：手牌整体上移 16px（2026-08-31 调参确认）
    L.handY = H - L.cardH - 62;

    // ---- 中央区域 ----
    L.centerY = L.isLandscape ? H * 0.5 : H * 0.44;

    // ---- 按钮区域 Y（位于手牌上方，靠近手牌）----
    L.actionY = H - L.cardH - 116;
    // ---- 出牌按钮区域底部（闹钟 45 高，居中于 36 高按钮，最低点约 actionY+41）----
    // 自己出的牌底部与该区域底部对齐（见 scene-game.drawCenter）。
    L.actionBottomY = L.actionY + 41;

    // ---- 出牌信息区 Y（落地牌 / 牌型 / 出牌提示，位于按钮上方，不被按钮遮挡）----
    L.playInfoY = L.actionY - 52;

    // ---- 首页按钮尺寸（长条竖矩形） ----
    L.homeBtnW = Math.min(180, short * 0.4);
    L.homeBtnH = Math.min(short * 0.62, H * 0.55);

    // ---- 登录按钮 ----
    L.loginBtnW = Math.min(240, short * 0.7);
    L.loginBtnH = Math.min(48, short * 0.12);

    // ---- 头像尺寸 ----
    L.avatarR = Math.min(22, short * 0.06);

    // ---- 登录弹窗尺寸（横屏要紧缩） ----
    L.loginCardW = Math.min(340, short * 0.9);
    L.loginCardH = L.isLandscape ? Math.min(H * 0.78, 280) : Math.min(L.loginCardW * 0.7, H * 0.55);

    // ---- 房间页面玩家卡 ----
    L.roomCardW = Math.min(280, short * 0.8);
    L.roomCardH = L.isLandscape ? 48 : 64;
    L.roomCardGap = L.isLandscape ? 8 : 16;
  };
})();