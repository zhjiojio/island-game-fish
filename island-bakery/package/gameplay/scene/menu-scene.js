
(function () {
  var AIGCUtils = window.AIGCUtils;

  AIGCUtils.MenuScene = {
    init: function () {
      
    },

    update: function (dt) {},

    draw: function () {
      var renderer = AIGCUtils.Renderer;
      var gl = renderer.gl;
      if (!gl) return;

      
      gl.clearColor(0.2, 0.6, 0.8, 1.0);
      gl.clear(gl.COLOR_BUFFER_BIT);

      var w = renderer.width;
      var h = renderer.height;

      
      renderer.drawRect(0, 0, w, h, [0.2, 0.6, 0.8, 1.0]);

      
      renderer.drawRect(w * 0.2, h * 0.6, w * 0.6, h * 0.3, [0.4, 0.7, 0.3, 1.0]);
      renderer.drawRect(w * 0.3, h * 0.5, w * 0.4, h * 0.15, [0.5, 0.8, 0.4, 1.0]);

      
      var shopX = w / 2 - 50;
      var shopY = h * 0.45;
      renderer.drawRect(shopX, shopY, 100, 80, [0.6, 0.4, 0.2, 1.0]);
      renderer.drawRect(shopX - 10, shopY - 15, 120, 15, [0.8, 0.3, 0.2, 1.0]);

      
      renderer.drawRect(w / 2 - 120, h * 0.15, 240, 50, [0.1, 0.3, 0.5, 0.8]);
      renderer.drawRect(w / 2 - 110, h * 0.17, 220, 40, [0.15, 0.35, 0.55, 0.9]);

      
      renderer.drawRect(w / 2 - 100, h * 0.25, 200, 30, [0.1, 0.3, 0.5, 0.6]);

      
      var btnW = 180;
      var btnH = 50;
      var btnX = w / 2 - btnW / 2;
      var btnY = h * 0.75;
      renderer.drawRect(btnX, btnY, btnW, btnH, [0.3, 0.5, 0.3, 1.0]);
      renderer.drawRect(btnX + 3, btnY + 3, btnW - 6, btnH - 6, [0.4, 0.6, 0.4, 1.0]);

      
      renderer.drawRect(btnX + btnW / 2 - 40, btnY + 15, 80, 20, [0.5, 0.7, 0.5, 0.8]);

      
      renderer.drawRect(w - 80, h - 30, 70, 20, [0.1, 0.2, 0.3, 0.5]);
    },

    handleClick: function (x, y) {
      var w = AIGCUtils.Renderer.width;
      var h = AIGCUtils.Renderer.height;
      var btnW = 180;
      var btnH = 50;
      var btnX = w / 2 - btnW / 2;
      var btnY = h * 0.75;

      if (x >= btnX && x <= btnX + btnW && y >= btnY && y <= btnY + btnH) {
        
        if (AIGCUtils.SceneManager) {
          AIGCUtils.SceneManager.switchTo("game");
        }
        return true;
      }
      return false;
    },
  };

  
  if (AIGCUtils.SceneManager) {
    AIGCUtils.SceneManager.register("menu", {
      onEnter: function () {
        AIGCUtils.MenuScene.init();
      },
      update: function (dt) {
        AIGCUtils.MenuScene.update(dt);
      },
      draw: function () {
        AIGCUtils.MenuScene.draw();
      },
    });
  }
})();
