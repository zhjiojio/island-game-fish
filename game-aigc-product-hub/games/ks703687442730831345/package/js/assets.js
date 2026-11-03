(function(r){
  'use strict'; var M=r.M3;
  M.Assets={images:{},failed:[],loaded:0,total:0,ready:false};
  // Build solid silhouettes once during loading, not 17 full-image draws per drag frame.
  M.Assets.prepareDragOutline=function(type,img){
    try{
      var k=M.Platform&&M.Platform.sdk,c=typeof document!=='undefined'?document.createElement('canvas'):k&&k.createOffscreenCanvas?k.createOffscreenCanvas({type:'2d',width:264,height:568}):k&&k.createCanvas?k.createCanvas():null;
      if(!c||c===M.canvas)return; // 不允许离屏缓存改写主画布尺寸。
      var w=224,h=526,pad=20;c.width=w+pad*2;c.height=h+pad*2;var g=c.getContext('2d');
      for(var n=0;n<16;n++){var a=n*Math.PI/8;g.drawImage(img,pad+Math.cos(a)*16,pad+Math.sin(a)*16,w,h);}
      g.globalCompositeOperation='source-in';g.fillStyle='#fff3a3';g.fillRect(0,0,c.width,c.height);g.globalCompositeOperation='source-over';g.drawImage(img,pad,pad,w,h);
      M.Assets.dragOutlines=M.Assets.dragOutlines||{};M.Assets.dragOutlines[type]={canvas:c,w:w,h:h,pad:pad};
    }catch(e){/* The original food remains draggable if offscreen canvas is unavailable. */}
  };
  M.Assets.load=function(done){
    var A=M.Assets, names='home settings capsule star heart level start game tray rack tool refresh pack wand plus moon timer'.split(' '), list=[];
   list.push(['loading','subpackages/assets-all/assets/ui/loading.png']);
    list.push(['tutorialHand','tutorialHand.png']);
    list.push(['tutorialHandSub','subpackages/assets-all/assets/ui/tutorialHand.png']);
    names.forEach(function(n){list.push([n,'subpackages/assets-all/assets/figma/'+n+'.png'+(n==='game'?'':'' )]);});
    'homePlus homeDaily homeDesktop homeMystery homeFavorite energyPanel energyTitle energyClose energyHearts energyTv rewardStars'.split(' ').forEach(function(n){list.push([n,'subpackages/assets-all/assets/home-v2/'+n+'.png']);});
    list.push(['refreshGlow','subpackages/assets-all/assets/effects/refresh-glow.png']);
    list.push(['packEmpty','subpackages/assets-all/assets/effects/pack-empty.png']);
    list.push(['rewardPack','subpackages/assets-all/assets/home-v2/rewardPack.png']);list.push(['rewardWand','subpackages/assets-all/assets/home-v2/rewardWand.png']);
    list.push(['dailyChest','subpackages/assets-all/assets/home-v2/dailyChest.png']);
    ['returnButton','exitProgress','toolRefresh','winChef','winCombo','winClear'].forEach(function(n){list.push([n,'subpackages/assets-all/assets/home-v2/'+n+'.png']);});
    'settingMusic settingSound settingVibration toggleOn toggleOff'.split(' ').forEach(function(n){list.push([n,'subpackages/assets-all/assets/home-v2/'+n+'.png']);});
    for(var transitionFrame=0;transitionFrame<18;transitionFrame++)list.push(['transitionFrame'+transitionFrame,'subpackages/assets-all/assets/effects/transition/a_'+('00000'+transitionFrame).slice(-5)+'.png']);
    M.Foods.forEach(function(n,i){list.push(['food'+i,'subpackages/assets-all/assets/food/'+n+'.png']);});
    for(var frame=0;frame<17;frame++)list.push(['clearFrame'+frame,'subpackages/assets-all/assets/effects/clear/a_'+('00000'+frame).slice(-5)+'.png']);
    A.total=list.length;
    function startLoading(){
      list.forEach(function(entry){
        var img=M.Platform.image(),finished=false;
        var timer=setTimeout(function(){end(false);},15000);
        function end(ok){
          if(finished)return;
          finished=true;
          clearTimeout(timer);
          if(ok){
            A.images[entry[0]]=img;
            if(/^food\d+$/.test(entry[0]))A.prepareDragOutline(Number(entry[0].slice(4)),img);
          }else A.failed.push(entry[1]);
          A.loaded++;
         if(A.loaded===A.total){A.ready=true;done();}
          if(A.loaded===A.total){if(!A.images.tutorialHand&&A.images.tutorialHandSub)A.images.tutorialHand=A.images.tutorialHandSub;}
        }
        img.onload=function(){end(true);};
        img.onerror=function(){end(false);};
        img.src=entry[1];
      });
    }
    startLoading();
  };
})(typeof GameGlobal!=='undefined'?GameGlobal:typeof window!=='undefined'?window:global);
