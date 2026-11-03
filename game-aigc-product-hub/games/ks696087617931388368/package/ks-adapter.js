/* Project-scoped bridge, not the complete vendor Web API shim. */
(function () {
  if (typeof ks === 'undefined') return;
  if (!window.requestAnimationFrame) window.requestAnimationFrame = function (fn) { return setTimeout(function () { fn(Date.now()); }, 16); };
  if (!window.cancelAnimationFrame) window.cancelAnimationFrame = function (id) { clearTimeout(id); };
}());
