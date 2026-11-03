(function () {
  var M3 = window.M3;
  M3.WorldMap = {
    isUnlocked: function (node, save) { var i, p = node.prerequisites || []; if ((save.playerLevel || 1) < (node.minPlayerLevel || 1)) return false; for (i = 0; i < p.length; i += 1) if (!save.completed[p[i]]) return false; return (save.stars[node.starSource || ''] || 0) >= (node.minStars || 0); },
    nodes: function (manifest) { var save = M3.SaveData.get(); return (manifest.worldMap.nodes || []).map(function (n, index) { return { id: n.id, levelId: n.levelId, x: n.x, y: n.y, displayName: n.displayName || ('前哨' + (index + 1)), description: n.description || '守住最后的珊瑚礁', unlocked: M3.WorldMap.isUnlocked(n, save), stars: save.stars[n.id] || 0 }; }); }
  };
})();
