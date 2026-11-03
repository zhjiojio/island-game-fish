// Regression tests for true first-frame video startup on the Kuaishou runtime.
const fs = require('fs');
const path = require('path');
const PKG = path.resolve(__dirname, '../package');

const noop = function () {};
const createdVideos = [];
const pendingDownloads = [];
const ctx = new Proxy({}, {
  get: function (_, key) {
    if (key === 'measureText') return function () { return { width: 10 }; };
    if (key === 'createLinearGradient' || key === 'createRadialGradient') return function () { return { addColorStop: noop }; };
    return noop;
  },
  set: function () { return true; }
});

global.window = {
  canvas: { width: 1179, height: 2556, style: {}, getContext: function () { return ctx; }, addEventListener: noop },
  innerWidth: 393, innerHeight: 852, devicePixelRatio: 3, addEventListener: noop
};
global.window.window = global.window;
global.requestAnimationFrame = noop;
global.performance = { now: function () { return Date.now(); } };

const wx = {
  downloadFile: function (options) { pendingDownloads.push(options); return {}; },
  createVideo: function (options) {
    createdVideos.push(options);
    return {
      onPlay: noop, onEnded: noop, onError: noop,
      play: noop, stop: noop, destroy: noop, seek: noop
    };
  },
  createImage: function () { return { set src(_) {} }; }
};

function load(file) {
  const code = fs.readFileSync(path.join(PKG, file), 'utf8');
  new Function('window', 'requestAnimationFrame', 'performance', 'console', 'setTimeout',
    'clearTimeout', 'setInterval', 'clearInterval', 'Image', 'ks', 'wx', code)(
      global.window, noop, global.performance, console, function () { return 1; },
      noop, function () { return 1; }, noop, undefined, wx, wx
    );
}

['js/m3-init.js', 'js/tb-config.js', 'js/tb-loader.js', 'js/tb-story.js',
 'js/tb-model.js', 'js/tb-ui.js', 'js/tb-audio.js', 'js/tb-engine.js'].forEach(load);

const M3 = global.window.M3;
let failures = 0;
function ok(condition, message) {
  if (condition) console.log('  ✅', message);
  else { console.log('  ❌', message); failures++; }
}

console.log('\n[1] Local video source handling');
M3.Loader.createVideo('/tmp/cached-video.mp4', { width: 393, height: 852 }, {});
ok(createdVideos[0] && createdVideos[0].src === '/tmp/cached-video.mp4', 'downloaded local path is passed directly to createVideo');

console.log('\n[2] First-frame startup');
createdVideos.length = 0;
M3.UI.bind(ctx);
M3.Engine.bind(ctx);
M3.Model.init(M3.Story);
M3.Engine.startGame();
ok(pendingDownloads.length > 0, 'future videos begin downloading in the background');
ok(createdVideos.length === 1, 'current video starts before background downloads finish');
ok(createdVideos[0] && /^https:\/\//.test(createdVideos[0].src), 'uncached current video streams from CDN');
ok(!pendingDownloads.some(function (item) { return item.url === createdVideos[0].src; }),
  'current streaming video is not downloaded a second time in parallel');

console.log(failures ? '\n💥 ' + failures + ' 项失败\n' : '\n🎉 视频加载回归测试通过\n');
process.exit(failures ? 1 : 0);
