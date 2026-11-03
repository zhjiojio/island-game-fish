(function () {
  if (typeof require === 'function') {
    require('./m3-init.js');
    require('./kwai-ad-config.js');
    require('../standard/asset-manager.js');
    require('../standard/subpackage-loader.js');
    require('../api/kwai-base.js');
    require('../api/kwai-storage.js');
    require('../api/kwai-ad.js');
    require('../api/kwai-ui.js');
    require('../api/kwai-device.js');
    require('../api/kwai-shortcut.js');
    require('../api/kwai-share.js');
    require('../api/kwai-media.js');
    require('./sound.js');
    require('./layout.js'); require('./board.js'); require('./motion.js'); require('./game.js');
    require('./figma-ui.js'); require('./render.js'); require('./input.js');
  }
  var M3 = window.M3;
  var canvas = window.canvas = window.canvas || window.wxhelper.GetMainCanvas('canvas'), gl;
  if (!canvas) throw new Error('未取得主画布');
  function resize() {
    var w = M3.Layout.w, h = M3.Layout.h, d = window.devicePixelRatio || 1;
    if (typeof ks !== 'undefined' && ks.getSystemInfoSync) d = ks.getSystemInfoSync().pixelRatio || d;
    if (canvas.width !== w*d) canvas.width = w*d;
    if (canvas.height !== h*d) canvas.height = h*d;
  }
  var lastTime = M3._now();
  function draw() { var now = M3._now(); M3.Game.update(now-lastTime); lastTime=now; M3.Render.draw(); window.requestAnimationFrame(draw); }
  try { gl = canvas.getContext('webgl2'); } catch (error) {}
  if (!gl) { try { gl = canvas.getContext('webgl'); } catch (error) {} }
  if (!gl) throw new Error('设备无法初始化 WebGL');
  var info = window.KwaiBase.getSystemInfo();
  if(info.safeArea&&info.windowHeight)M3.Layout.safeTop=Math.max(0,info.safeArea.top||0)*812/info.windowHeight;
  resize(); M3.Game.init(); M3.Render.init(gl); M3.Input.bind(); draw();
  // Folding screens and windowed containers can change the canvas size while
  // backgrounded; re-apply the backing resolution on every return.
  if (window.KwaiBase && window.KwaiBase.onShow) window.KwaiBase.onShow(resize);
}());
