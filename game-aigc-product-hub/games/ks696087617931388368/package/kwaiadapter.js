(function () {
  if (typeof GameGlobal === 'undefined') return;
  GameGlobal.window = GameGlobal;
  if (typeof ks !== 'undefined') {
    GameGlobal.wx = ks;
    if (!ks.onMessage) ks.onMessage = function () {};
    if (!ks.getOpenDataContext) ks.getOpenDataContext = function () {};
  }
}());
