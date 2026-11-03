(function () {
  var M3 = window.M3 = window.M3 || {};
  M3._now = function () { return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now(); };
}());
