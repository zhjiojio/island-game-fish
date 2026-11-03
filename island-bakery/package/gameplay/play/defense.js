(function () {
  var AIGCUtils = window.AIGCUtils;

  AIGCUtils.Defense = {
    // 防御塔配置
    towerTypes: [
      { id: "stone", name: "石塔", damage: 10, range: 100, cooldown: 1000, cost: 50 },
      { id: "fire", name: "火塔", damage: 20, range: 80, cooldown: 1500, cost: 100 },
      { id: "ice", name: "冰塔", damage: 5, range: 120, cooldown: 800, cost: 80, slow: 0.5 },
    ],

    // 敌人配置
    enemyTypes: [
      { id: "wolf", name: "野狼", hp: 30, speed: 50, damage: 10, reward: 5 },
      { id: "bear", name: "棕熊", hp: 80, speed: 30, damage: 20, reward: 15 },
      { id: "crab", name: "巨蟹", hp: 50, speed: 40, damage: 15, reward: 10 },
    ],

    // 当前波次
    wave: 0,
    // 敌人生成计时器
    spawnTimer: 0,
    SPAWN_INTERVAL: 3000,
    // 每波敌人数量
    enemiesPerWave: [3, 5, 7, 10, 15],
    // 已生成敌人数量
    spawnedCount: 0,
    // 敌人列表
    enemies: [],
    // 防御塔列表
    towers: [],
    // 战斗状态
    active: false,

    init: function () {
      AIGCUtils.Defense.wave = 0;
      AIGCUtils.Defense.spawnTimer = 0;
      AIGCUtils.Defense.spawnedCount = 0;
      AIGCUtils.Defense.enemies = [];
      AIGCUtils.Defense.towers = [];
      AIGCUtils.Defense.active = false;
    },

    start: function () {
      AIGCUtils.Defense.active = true;
      AIGCUtils.Defense.wave = Math.min(AIGCUtils.GameState.day - 1, AIGCUtils.Defense.enemiesPerWave.length - 1);
      AIGCUtils.Defense.spawnedCount = 0;
      AIGCUtils.Defense.enemies = [];
      AIGCUtils.EventBus.emit("defense:start", { wave: AIGCUtils.Defense.wave });
    },

    update: function (dt) {
      if (!AIGCUtils.Defense.active) return;

      var defense = AIGCUtils.Defense;
      var maxEnemies = defense.enemiesPerWave[defense.wave] || 3;

      // 生成敌人
      if (defense.spawnedCount < maxEnemies) {
        defense.spawnTimer += dt;
        if (defense.spawnTimer >= defense.SPAWN_INTERVAL) {
          defense.spawnTimer = 0;
          defense.spawnEnemy();
        }
      }

      // 更新敌人
      for (var i = defense.enemies.length - 1; i >= 0; i--) {
        var enemy = defense.enemies[i];
        enemy.x += enemy.speedX * dt * 0.001;
        enemy.y += enemy.speedY * dt * 0.001;

        // 检查是否到达店铺
        var dx = enemy.x - 207; // 店铺中心x
        var dy = enemy.y - 500; // 店铺中心y
        var dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 30) {
          // 攻击店铺
          AIGCUtils.GameState.defense.health -= enemy.damage;
          defense.enemies.splice(i, 1);
          AIGCUtils.EventBus.emit("defense:shop_hit", { damage: enemy.damage });

          if (AIGCUtils.GameState.defense.health <= 0) {
            AIGCUtils.Defense.gameOver();
          }
          continue;
        }

        // 检查是否死亡
        if (enemy.hp <= 0) {
          AIGCUtils.GameState.addCoins(enemy.reward);
          defense.enemies.splice(i, 1);
          AIGCUtils.EventBus.emit("defense:enemy_killed", { enemy: enemy });
        }
      }

      // 更新防御塔
      defense.towers.forEach(function (tower) {
        tower.cooldownTimer -= dt;
        if (tower.cooldownTimer <= 0) {
          tower.cooldownTimer = 0;
          defense.towerAttack(tower);
        }
      });

      // 检查波次结束
      if (defense.spawnedCount >= maxEnemies && defense.enemies.length === 0) {
        AIGCUtils.Defense.end();
      }
    },

    spawnEnemy: function () {
      var types = AIGCUtils.Defense.enemyTypes;
      var type = types[Math.floor(Math.random() * types.length)];
      var angle = Math.random() * Math.PI * 2;
      var spawnDist = 300;
      var enemy = {
        id: "enemy_" + Date.now() + "_" + Math.random(),
        type: type.id,
        name: type.name,
        hp: type.hp,
        maxHp: type.hp,
        x: 207 + Math.cos(angle) * spawnDist,
        y: 500 + Math.sin(angle) * spawnDist,
        speed: type.speed,
        speedX: -Math.cos(angle) * type.speed,
        speedY: -Math.sin(angle) * type.speed,
        damage: type.damage,
        reward: type.reward,
      };
      AIGCUtils.Defense.enemies.push(enemy);
      AIGCUtils.Defense.spawnedCount++;
    },

    towerAttack: function (tower) {
      var towerType = AIGCUtils.Defense.towerTypes.find(function (t) { return t.id === tower.type; });
      if (!towerType) return;

      // 寻找范围内最近的敌人
      var target = null;
      var minDist = Infinity;
      AIGCUtils.Defense.enemies.forEach(function (enemy) {
        var dx = enemy.x - tower.x;
        var dy = enemy.y - tower.y;
        var dist = Math.sqrt(dx * dx + dy * dy);
        if (dist <= towerType.range && dist < minDist) {
          minDist = dist;
          target = enemy;
        }
      });

      if (target) {
        target.hp -= towerType.damage;
        tower.cooldownTimer = towerType.cooldown;
        if (towerType.slow) {
          target.speed *= towerType.slow;
        }
        AIGCUtils.EventBus.emit("defense:tower_attack", { tower: tower, target: target });
      }
    },

    // 建造防御塔
    buildTower: function (typeId, x, y) {
      var towerType = AIGCUtils.Defense.towerTypes.find(function (t) { return t.id === typeId; });
      if (!towerType) return { success: false, message: "塔类型不存在" };
      if (AIGCUtils.GameState.coins < towerType.cost) return { success: false, message: "金币不足" };

      AIGCUtils.GameState.coins -= towerType.cost;
      AIGCUtils.Defense.towers.push({
        id: "tower_" + Date.now(),
        type: typeId,
        x: x,
        y: y,
        cooldownTimer: 0,
      });

      AIGCUtils.EventBus.emit("defense:tower_built", { type: typeId, x: x, y: y });
      return { success: true };
    },

    // 结束防御
    end: function () {
      AIGCUtils.Defense.active = false;
      AIGCUtils.EventBus.emit("defense:end", { wave: AIGCUtils.Defense.wave });
    },

    // 游戏结束（店铺被摧毁）
    gameOver: function () {
      AIGCUtils.Defense.active = false;
      AIGCUtils.GameState.defense.health = 0;
      AIGCUtils.EventBus.emit("defense:game_over");
    },

    // 复活
    revive: function () {
      AIGCUtils.GameState.defense.health = AIGCUtils.GameState.defense.maxHealth;
      AIGCUtils.Defense.enemies = [];
      AIGCUtils.Defense.active = true;
      AIGCUtils.EventBus.emit("defense:revive");
    },
  };
})();
