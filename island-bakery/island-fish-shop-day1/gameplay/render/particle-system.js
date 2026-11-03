(function () {
  var AIGCUtils = window.AIGCUtils;

  AIGCUtils.ParticleSystem = {
    particles: [],

    init: function () {
      AIGCUtils.ParticleSystem.particles = [];
    },

    update: function (dt) {
      for (var i = AIGCUtils.ParticleSystem.particles.length - 1; i >= 0; i--) {
        var p = AIGCUtils.ParticleSystem.particles[i];
        p.x += p.vx * dt * 0.001;
        p.y += p.vy * dt * 0.001;
        p.life -= dt;
        p.alpha = Math.max(0, p.life / p.maxLife);

        if (p.life <= 0) {
          AIGCUtils.ParticleSystem.particles.splice(i, 1);
        }
      }
    },

    emit: function (x, y, type, count) {
      count = count || 1;
      for (var i = 0; i < count; i++) {
        var p = {
          x: x,
          y: y,
          vx: (Math.random() - 0.5) * 100,
          vy: (Math.random() - 0.5) * 100 - 50,
          life: 1000 + Math.random() * 1000,
          maxLife: 2000,
          alpha: 1,
          size: 4 + Math.random() * 4,
          color: AIGCUtils.ParticleSystem.getColor(type),
        };
        AIGCUtils.ParticleSystem.particles.push(p);
      }
    },

    getColor: function (type) {
      var colors = AIGCUtils.Renderer ? AIGCUtils.Renderer.colors : {};
      switch (type) {
        case "coin": return colors.gold || [1, 0.84, 0, 1];
        case "collect": return colors.green || [0.2, 0.8, 0.2, 1];
        case "bake": return colors.bread || [0.9, 0.7, 0.4, 1];
        case "sell": return colors.gold || [1, 0.84, 0, 1];
        case "upgrade": return colors.blue || [0.2, 0.4, 0.9, 1];
        case "defense": return colors.red || [1, 0.2, 0.2, 1];
        default: return colors.white || [1, 1, 1, 1];
      }
    },

    draw: function () {
      var renderer = AIGCUtils.Renderer;
      if (!renderer) return;

      AIGCUtils.ParticleSystem.particles.forEach(function (p) {
        var color = p.color.slice();
        color[3] = p.alpha;
        renderer.drawCircle(p.x, p.y, p.size, color);
      });
    },
  };
})();
