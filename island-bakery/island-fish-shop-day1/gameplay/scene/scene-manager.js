(function () {
  var AIGCUtils = window.AIGCUtils;

  AIGCUtils.SceneManager = {
    currentScene: "game",

    update: function (dt) {
      if (!AIGCUtils.Game.initialized) {
        AIGCUtils.Game.init();
        AIGCUtils.Input.init();
      }
      AIGCUtils.Game.update(dt);
    },

    draw: function () {
      AIGCUtils.Game.draw();
    }
  };
})();
