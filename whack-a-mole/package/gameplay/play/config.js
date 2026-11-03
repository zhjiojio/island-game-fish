/**
 * config.js — 打地鼠游戏规则常量
 */
(function () {
  var AIGCUtils = (window.AIGCUtils = window.AIGCUtils || {});

  AIGCUtils.Config = {
    GRID_COLS: 4,
    GRID_ROWS: 3, // 4x3 = 12 个洞
    MOLE_UP_MS: 1000, // 地鼠出来后固定停留 1s，超时未打则算漏打
    SPAWN_INTERVAL_MS: 900, // 每隔多久尝试刷新一波地鼠
    MIN_SPAWN_COUNT: 1, // 每波最少同时出现的地鼠数
    MAX_SPAWN_COUNT: 3, // 每波最多同时出现的地鼠数
    MAX_HEALTH: 20, // 血条格数
    SCORE_PER_HIT: 10,
  };
})();
