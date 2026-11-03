
(function () {
  
  if (AIGCUtils && AIGCUtils.SceneManager) {
    AIGCUtils.SceneManager.register("night-defense", {
      onEnter: function () {
        
        if (AIGCUtils.Defense) AIGCUtils.Defense.start();
      },
      update: function (dt) {
        if (AIGCUtils.Defense) AIGCUtils.Defense.update(dt);
      },
      draw: function () {
        if (AIGCUtils.Renderer) AIGCUtils.Renderer.draw();
      },
    });
  }
})();
