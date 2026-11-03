/**
 * render.js — 打地鼠场景整体绘制（纯色 WebGL 图形，无贴图版）
 *
 * 职责：每帧读取 AIGCUtils.Game 的状态，调用 AIGCUtils.GL 的纯色绘制原语
 * 把洞、地鼠、锤子、计分板、血条画出来。
 */
(function () {
  var AIGCUtils = (window.AIGCUtils = window.AIGCUtils || {});
  var GL = AIGCUtils.GL;

  var COLOR_BG = [0.42, 0.72, 0.36]; // 草地绿
  var COLOR_HOLE = [0.25, 0.17, 0.1]; // 洞口深棕
  var COLOR_MOLE = [0.55, 0.36, 0.2]; // 地鼠棕色
  var COLOR_MOLE_EAR = [0.4, 0.26, 0.14];
  var COLOR_HAMMER = [0.75, 0.1, 0.1];
  var COLOR_HEALTH_FULL = [0.2, 0.75, 0.3];
  var COLOR_HEALTH_EMPTY = [0.3, 0.3, 0.3];
  var COLOR_TEXT = [1, 1, 1];
  var COLOR_SCORE_TEXT = [1, 0.85, 0.2];

  function _drawHUD(L) {
    var barH = L.h * 0.16;
    var barY = L.safeTop;
    // 顶部状态条底色
    GL.drawRect(0, barY, L.w, barH, 0.1, 0.12, 0.08, 0.55);

    // 血条：20 格小方块
    var maxHealth = AIGCUtils.Game.getMaxHealth();
    var health = AIGCUtils.Game.getHealth();
    var padX = L.w * 0.02;
    var barAreaW = L.w * 0.5;
    var segGap = 2;
    var segW = (barAreaW - segGap * (maxHealth - 1)) / maxHealth;
    var segH = barH * 0.32;
    var segY = barY + barH * 0.14;
    for (var i = 0; i < maxHealth; i++) {
      var c = i < health ? COLOR_HEALTH_FULL : COLOR_HEALTH_EMPTY;
      GL.drawRect(padX + i * (segW + segGap), segY, segW, segH, c[0], c[1], c[2], 1);
    }
    // 血量数字
    GL.drawNumber(String(health), padX, segY + segH + barH * 0.08, barH * 0.3, COLOR_TEXT[0], COLOR_TEXT[1], COLOR_TEXT[2], 1);

    // 分数（右侧）
    var scoreText = String(AIGCUtils.Game.getScore());
    var digitH = barH * 0.42;
    var estW = scoreText.length * (digitH * 0.73);
    GL.drawNumber(scoreText, L.w - padX - estW, barY + (barH - digitH) / 2, digitH, COLOR_SCORE_TEXT[0], COLOR_SCORE_TEXT[1], COLOR_SCORE_TEXT[2], 1);
  }

  function _drawHoles(holes, now) {
    for (var i = 0; i < holes.length; i++) {
      var hole = holes[i];
      // 洞口（椭圆）
      GL.drawEllipse(hole.cx, hole.cy + hole.h * 0.15, hole.w / 2, hole.h / 2, COLOR_HOLE[0], COLOR_HOLE[1], COLOR_HOLE[2], 1);

      if (hole.state === 'up') {
        // 地鼠冒出来的「倒计时」比例，用来做一点缩放/变暗提示即将回缩
        var remain = Math.max(0, hole.upUntil - now);
        var ratio = remain / AIGCUtils.Config.MOLE_UP_MS; // 1 -> 0
        var bodyRy = hole.h * 0.42 * (0.6 + 0.4 * Math.min(1, ratio + 0.2));
        var bodyRx = hole.w * 0.38;
        var cy = hole.cy - hole.h * 0.1;

        // 耳朵
        GL.drawEllipse(hole.cx - bodyRx * 0.55, cy - bodyRy * 0.7, bodyRx * 0.22, bodyRy * 0.3, COLOR_MOLE_EAR[0], COLOR_MOLE_EAR[1], COLOR_MOLE_EAR[2], 1);
        GL.drawEllipse(hole.cx + bodyRx * 0.55, cy - bodyRy * 0.7, bodyRx * 0.22, bodyRy * 0.3, COLOR_MOLE_EAR[0], COLOR_MOLE_EAR[1], COLOR_MOLE_EAR[2], 1);
        // 身体
        GL.drawEllipse(hole.cx, cy, bodyRx, bodyRy, COLOR_MOLE[0], COLOR_MOLE[1], COLOR_MOLE[2], 1);
        // 鼻子
        GL.drawEllipse(hole.cx, cy + bodyRy * 0.25, bodyRx * 0.18, bodyRy * 0.14, 0.2, 0.08, 0.05, 1);
      }
    }
  }

  function _drawHammer(L, now) {
    var hammer = AIGCUtils.Input.getHammer();
    if (!hammer.visible) return;
    var elapsed = now - hammer.downAt;
    if (elapsed > 180) {
      hammer.visible = false;
      return;
    }
    var scale = 1 - elapsed / 180; // 砸下去再弹起的简单动效
    var size = L.w * 0.05 * (0.6 + 0.4 * scale);
    GL.drawEllipse(hammer.x, hammer.y, size, size * 0.7, COLOR_HAMMER[0], COLOR_HAMMER[1], COLOR_HAMMER[2], 0.85);
  }

  function draw(gl, now) {
    var L = AIGCUtils.Layout;
    GL.beginFrame(L.w, L.h);
    GL.clear(COLOR_BG[0], COLOR_BG[1], COLOR_BG[2], 1);

    AIGCUtils.Game.layoutHoles(); // 布局随屏幕尺寸变化，开销极低，每帧重算即可
    _drawHoles(AIGCUtils.Game.getHoles(), now);
    _drawHammer(L, now);
    _drawHUD(L);
  }

  AIGCUtils.Render = {
    draw: draw,
  };
})();
