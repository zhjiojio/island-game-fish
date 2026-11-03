
(function () {
  
  if (AIGCUtils && AIGCUtils.SceneManager) {
    AIGCUtils.SceneManager.register("vip-content", {
      onEnter: function () {
        
      },
      update: function (dt) {},
      draw: function () {
        if (AIGCUtils.Renderer) {
          var r = AIGCUtils.Renderer;
          r.drawRect(0, 0, r.width, r.height, r.colors.ui_bg);
          r.drawText("VIP专属内容", r.width / 2 - 80, r.height / 2, 24, r.colors.gold);
        }
      },
    });
  }
})();
