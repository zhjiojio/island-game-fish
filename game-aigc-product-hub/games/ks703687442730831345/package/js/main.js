(function(r){
 'use strict';
 if(typeof ks!=='undefined'&&typeof require==='function'){
  require('./m3-init.js');require('../api/platform.js');require('./telemetry.js');require('./feedback.js');require('./levels.js');require('./rules.js');require('./level-loader.js');require('./ad-policy.js');require('../api/kwai-ad.js');require('../api/kwai-share.js');require('../api/kwai-login.js');require('../api/kwai-open.js');require('../api/kwai-subpackage.js');require('./privacy-policy.js');require('./welcome.js');require('./video-background.js');require('./background-music.js');require('./assets.js');require('./game.js');
 }
 var M=r.M3,k=M.Platform.sdk,canvas=k?k.createCanvas():document.getElementById('game'),ctx=canvas.getContext('2d'),lastW=0,lastH=0,lastD=0,lastTouch=-10000;
 M.canvas=canvas;M.ctx=ctx;
 function resize(){
 var info=k?k.getSystemInfoSync():null,w=info?info.windowWidth:r.innerWidth,h=info?info.windowHeight:r.innerHeight,d=Math.min(2,info?info.pixelRatio:r.devicePixelRatio||1);
 if(w===lastW&&h===lastH&&d===lastD)return;lastW=w;lastH=h;lastD=d;
 canvas.width=Math.round(w*d);canvas.height=Math.round(h*d);if(canvas.style){canvas.style.width=w+'px';canvas.style.height=h+'px';}
 if(ctx.imageSmoothingEnabled!==undefined)ctx.imageSmoothingEnabled=true;if(ctx.imageSmoothingQuality!==undefined)ctx.imageSmoothingQuality='high';
  var top=info&&info.safeArea?info.safeArea.top:0,bottom=info&&info.safeArea?Math.max(0,h-info.safeArea.bottom):0;
  M.Layout={w:w,h:h,dpr:d,safeTop:top,safeBottom:bottom,usableH:h-top-bottom};
 }
var active=null;
 var twoFingerStart=0;
function contact(e,starting){var list=e.changedTouches||e.touches||[e];for(var i=0;i<list.length;i++){var t=list[i],id=typeof t.identifier==='number'?t.identifier:typeof t.pointerId==='number'?t.pointerId:'mouse';if(starting||id===active){var rect=canvas.getBoundingClientRect?canvas.getBoundingClientRect():{left:0,top:0};return {id:id,x:(typeof t.clientX==='number'?t.clientX:t.x)-rect.left,y:(typeof t.clientY==='number'?t.clientY:t.y)-rect.top};}}return null;}
 function down(e){
  var tc=e.touches?e.touches.length:(e.changedTouches?e.changedTouches.length:1);
  if(active!==null&&tc>=2){twoFingerStart=M._now();return;}
  if(active!==null||typeof e.button==='number'&&e.button!==0)return;
  var p=contact(e,true);if(!p)return;active=p.id;M.Game.pointerDown(p.x,p.y);if(canvas.setPointerCapture&&typeof e.pointerId==='number')canvas.setPointerCapture(e.pointerId);if(M.Game.state.drag)M.Game.draw();if(M.BackgroundMusic&&!M.BackgroundMusic.isPlaying())M.BackgroundMusic.play();}
function move(e){if(active===null)return;var p=contact(e,false);if(p)M.Game.pointerMove(p.x,p.y);}
 function up(e){var tc=e.touches?e.touches.length:0;if(tc<2)twoFingerStart=0;if(active===null){return;}var p=contact(e,false);if(!p)return;active=null;M.Game.pointerUp(p.x,p.y);if(M.BackgroundMusic)M.BackgroundMusic.sync();}
 function cancel(){active=null;twoFingerStart=0;M.Game.cancelPointer();if(M.BackgroundMusic)M.BackgroundMusic.sync();}
 if(k){k.onTouchStart(down);k.onTouchMove(move);k.onTouchEnd(up);k.onTouchCancel(cancel);if(k.onHide)k.onHide(function(){cancel();if(M.BackgroundMusic)M.BackgroundMusic.pause();M.Game.setBackground(true);});if(k.onShow)k.onShow(function(){M.Game.setBackground(false);resize();if(M.BackgroundMusic)M.BackgroundMusic.sync();});}
 else{if(r.PointerEvent){canvas.addEventListener('pointerdown',down);r.addEventListener('pointermove',move);r.addEventListener('pointerup',up);r.addEventListener('pointercancel',cancel);canvas.addEventListener('lostpointercapture',cancel);}else{canvas.addEventListener('touchstart',function(e){lastTouch=M._now();down(e);e.preventDefault();},{passive:false});r.addEventListener('touchmove',function(e){move(e);e.preventDefault();},{passive:false});r.addEventListener('touchend',up);r.addEventListener('touchcancel',cancel);canvas.addEventListener('mousedown',function(e){if(M._now()-lastTouch>600)down(e);});r.addEventListener('mousemove',move);r.addEventListener('mouseup',up);}r.addEventListener('blur',cancel);r.addEventListener('resize',function(){cancel();resize();});r.addEventListener('pagehide',M.Game.save);document.addEventListener('visibilitychange',function(){cancel();M.Game.setBackground(document.hidden);});}
 var raf=typeof requestAnimationFrame==='function'?requestAnimationFrame:canvas.requestAnimationFrame?canvas.requestAnimationFrame.bind(canvas):function(fn){setTimeout(fn,16);};
 function loop(){if(twoFingerStart&&M._now()-twoFingerStart>=5000){twoFingerStart=0;if(M.Game.resetProgress)M.Game.resetProgress();}M.Game.update();M.Game.draw();raf(loop);}
 var loadingStarted=M._now();
 resize();
 function startGame(){
  if(M.VideoBackground)M.VideoBackground.init();
  M.Assets.load(function(){var wait=Math.max(0,1000-(M._now()-loadingStarted));M.Assets.ready=false;setTimeout(function(){M.Assets.ready=true;if(M.BackgroundMusic)M.BackgroundMusic.init();M.Game.ready();},wait);});
  M.LevelLoader.load(function(){});raf(loop);
 }
 if(M.KwaiSubpackage)M.KwaiSubpackage.load('assets-all',function(ok){if(!ok)console.warn('[ASSETS] assets-all 分包加载失败');startGame();});else startGame();
 console.log('[VERSION] 自助餐消消乐 '+M.BUILD_VER+' [MARKER '+M.BUILD_VER+']');
})(typeof GameGlobal!=='undefined'?GameGlobal:typeof window!=='undefined'?window:global);
