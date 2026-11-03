(function () {
  var M3=window.M3, canvas, lastTouch=-Infinity, modalTouchY=null, mouseDragging=false, bgmKicked=false;
  function down(e) {
    // Browsers block autoplay before the first gesture; kick the bgm on the
    // first tap (idempotent on device where init already started it).
    if(!bgmKicked){bgmKicked=true;if(window.KwaiMedia&&M3.Game.getProgress().settings[2]!==false)KwaiMedia.Audio.playBgm('audio/bgm.mp3');}
    if(e.preventDefault)e.preventDefault();
    if(e.touches)lastTouch=M3._now();else if(M3._now()-lastTouch<500)return;
    var t=e.touches?e.touches[0]:e;if(!t)return;
    var r=canvas.getBoundingClientRect(),x=(t.clientX-r.left)*375/r.width,rawY=(t.clientY-r.top)*812/r.height,y=(rawY-M3.Layout.safeTop)*812/(812-M3.Layout.safeTop);
    var G=M3.Game,modal=G.getModal(),i;
    if(G.getState()==='ad')return;
    if(modal){
      modalTouchY=t.clientY;mouseDragging=!e.touches;
      var action=M3.FigmaUI.hit(modal,x,y);
      if(action){M3.Sound.play('click');
        if(action.indexOf('toggle')===0)G.toggle(Number(action.slice(6)));
        else if(typeof G[action]==='function')G[action]();
      }
      return;
    }
    // The gear is baked into the full-bleed home background (raw screen
    // space) but drawn in content space while playing.
    if(x<65&&(G.getState()==='home'?rawY:y)<85){M3.Sound.play('click');G.open('settings');return;}
    if(G.getState()==='home'){
      // Home buttons are standalone sprites; hit zones follow the new
      // layout (raw screen coordinates) — add-to-desktop under the gear,
      // shop on the left middle, works on the right middle, share/album
      // at the bottom, start centered, privacy at the bottom bar.
      if(x<80&&rawY>=105&&rawY<=165){M3.Sound.play('click');G.addDesktop();}
      else if(x<80&&rawY>580&&rawY<660){M3.Sound.play('click');G.open('shop');}
      else if(x>295&&rawY>580&&rawY<660){M3.Sound.play('click');G.open('works');}
      else if(x<80&&rawY>=660&&rawY<=770){M3.Sound.play('click');G.share();}
      else if(x>295&&rawY>=660){M3.Sound.play('click');G.open('album');}
      else if(rawY>580&&rawY<680&&x>=80&&x<=295){M3.Sound.play('click');G.start();}
      else if(rawY>770&&rawY<812&&x>115&&x<260){M3.Sound.play('click');G.open('privacy');}
      return;
    }
    if(y>M3.Layout.buttonY&&y<M3.Layout.buttonY+75){i=Math.floor((x-55.5)/70.125);if(i>=0&&i<4){M3.Sound.play('click');G.tool(i);}return;}
    var slots=G.getSlots(),cars=G.getCars();
    // Parking bays now reach lower on screen; check them before the speed
    // dial so the first bay stays tappable where the two zones overlap.
    for(i=0;i<slots.length;i++){
      var sx=M3.Layout.slotX(i,slots.length-1);
      if(x>=sx&&x<sx+52&&y>=M3.Layout.bayY&&y<M3.Layout.bayY+60){if(!slots[i].unlocked){M3.Sound.play('click');G.unlockAdSlot(i);}return;}
    }
    if(x>=M3.Layout.speedX&&x<M3.Layout.speedX+M3.Layout.speedSize&&y>=M3.Layout.speedY&&y<M3.Layout.speedY+M3.Layout.speedSize){if(G.getMultiplier&&G.getMultiplier()<=1){M3.Sound.play('click');G.doubleSpeed();}return;}
    for(i=0;i<cars.length;i++){var c=cars[i];if(c.stage==='queue'&&c.row<2&&x>=c.x&&x<c.x+52&&y>=c.y&&y<c.y+77.55){G.activate(c.id);return;}}
  }
  M3.Input={bind:function(){
    canvas=window.canvas;
    function scrollDelta(delta){return delta*812/canvas.getBoundingClientRect().height*812/(812-M3.Layout.safeTop);}
    canvas.addEventListener('touchstart',down,{passive:false});
    canvas.addEventListener('touchmove',function(e){
      if(e.preventDefault)e.preventDefault();
      var modal=M3.Game.getModal();
      if((modal==='works'||modal==='privacy')&&modalTouchY!==null&&e.touches&&e.touches[0]){
        var next=e.touches[0].clientY,delta=modalTouchY-next;
        if(modal==='works')M3.Game.scrollWorks(scrollDelta(delta));else M3.Game.scrollPrivacy(scrollDelta(delta));
        modalTouchY=next;
      }
    },{passive:false});
    canvas.addEventListener('touchend',function(){modalTouchY=null;},{passive:false});
    canvas.addEventListener('touchcancel',function(){modalTouchY=null;mouseDragging=false;},{passive:false});
    canvas.addEventListener('wheel',function(e){
      var modal=M3.Game.getModal();
      if(modal==='works'){e.preventDefault();M3.Game.scrollWorks(scrollDelta(e.deltaY*(e.deltaMode===1?24:e.deltaMode===2?244:1)));}
      else if(modal==='privacy'){e.preventDefault();M3.Game.scrollPrivacy(scrollDelta(e.deltaY*(e.deltaMode===1?24:e.deltaMode===2?379:1)));}
    },{passive:false});
    canvas.addEventListener('mousedown',down);
    canvas.addEventListener('mousemove',function(e){
      if(!mouseDragging||(M3.Game.getModal()!=='works'&&M3.Game.getModal()!=='privacy')||modalTouchY===null)return;
      var delta=modalTouchY-e.clientY;
      if(M3.Game.getModal()==='works')M3.Game.scrollWorks(scrollDelta(delta));else M3.Game.scrollPrivacy(scrollDelta(delta));
      modalTouchY=e.clientY;
    });
    canvas.addEventListener('mouseup',function(){mouseDragging=false;modalTouchY=null;});
    canvas.addEventListener('mouseleave',function(){mouseDragging=false;modalTouchY=null;});
  }};
}());
