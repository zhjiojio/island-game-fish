(function () {
  var M3=window.M3,canvas=window.canvas,down=false,startPoint;
  function pos(e){var r=canvas.getBoundingClientRect(),p=e.touches&&e.touches.length?e.touches[0]:e.changedTouches&&e.changedTouches.length?e.changedTouches[0]:e;return{x:(p.clientX-r.left)*(M3.Layout.w/r.width),y:(p.clientY-r.top)*(M3.Layout.h/r.height)};}
  function start(e){down=true;startPoint=pos(e);if(e.preventDefault)e.preventDefault();}
  function move(e){if(down&&e.preventDefault)e.preventDefault();}
  function end(e){var p,dy;if(!down)return;down=false;if(e.preventDefault)e.preventDefault();p=pos(e);dy=startPoint?startPoint.y-p.y:0;if(M3.Game){if(Math.abs(dy)>12)M3.Game.handleMapScroll(dy);else M3.Game.handlePointer(p.x,p.y);}}
  function wheel(e){if(M3.Game){M3.Game.handleMapScroll(e.deltaY);if(e.preventDefault)e.preventDefault();}}
  canvas.addEventListener('touchstart',start,{passive:false});canvas.addEventListener('touchmove',move,{passive:false});canvas.addEventListener('touchend',end,{passive:false});canvas.addEventListener('mousedown',start);canvas.addEventListener('mouseup',end);canvas.addEventListener('wheel',wheel,{passive:false});
  M3.Input={};
})();
