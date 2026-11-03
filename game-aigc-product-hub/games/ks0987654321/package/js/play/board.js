(function () {
  var M3 = window.M3;
  function Board(level) { this.level = level; this.width = level.map.width; this.height = level.map.height; this.tiles = level.map.tiles.slice(0); this.path = level.map.path.slice(0); }
  Board.prototype.index = function (x, y) { return y * this.width + x; };
  Board.prototype.inBounds = function (x, y) { return x >= 0 && y >= 0 && x < this.width && y < this.height; };
  Board.prototype.tile = function (x, y) { return this.inBounds(x, y) ? this.tiles[this.index(x, y)] : 'void'; };
  Board.prototype.isBuildable = function (x, y) { return this.tile(x, y) === 'buildable' || this.tile(x, y) === 'grass'; };
  Board.prototype.isObstacle = function (x, y) { return this.tile(x, y) === 'obstacle'; };
  Board.prototype.clearObstacle = function (x, y) { if (!this.isObstacle(x, y)) return false; this.tiles[this.index(x, y)] = (this.level.map.obstacles && this.level.map.obstacles.afterClear) || 'buildable'; return true; };
  M3.Board = { create: function (level) { return new Board(level); } };
})();
