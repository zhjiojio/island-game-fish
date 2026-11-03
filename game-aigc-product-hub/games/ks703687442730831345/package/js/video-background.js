(function(r){
  'use strict';
  var M=r.M3, image=null, ready=false, failed=false;
  M.VideoBackground={ready:false,available:false,init:function(){
    if(image||failed)return;
    image=M.Platform&&M.Platform.image?M.Platform.image():(typeof Image!=='undefined'?new Image():null);
    if(!image){failed=true;return;}
    image.onload=function(){ready=true;M.VideoBackground.ready=true;M.VideoBackground.available=true;};
    image.onerror=function(){failed=true;M.VideoBackground.available=false;};
    image.src='subpackages/assets-all/assets/scenes/home-background.jpg';
  },play:function(){},
  pause:function(){},
  draw:function(ctx,x,y,w,h){if(image&&ready){try{ctx.drawImage(image,x,y,w,h);return true;}catch(e){}}return false;}};
})(typeof GameGlobal!=='undefined'?GameGlobal:typeof window!=='undefined'?window:global);
