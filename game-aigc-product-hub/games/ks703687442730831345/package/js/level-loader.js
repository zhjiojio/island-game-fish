(function(r){
 'use strict';var M=r.M3;M.remoteLevelsStatus='local';
 function integer(n,min,max){return typeof n==='number'&&isFinite(n)&&n%1===0&&n>=min&&n<=max;}
 function valid(l,i){return l&&l.number===i+1&&[6,9,12].indexOf(l.groups)>=0&&integer(l.kinds,1,16)&&integer(l.triples,l.kinds,1000)&&integer(l.empty,3,l.groups*3-1)&&l.triples*3-(l.groups*3-l.empty)>=l.groups*3&&integer(l.duration,0,86400)&&integer(l.revive,1,3600)&&l.gifts&&['refresh','pack','wand'].every(function(k){return integer(l.gifts[k],0,1000);});}
 M.LevelLoader={valid:valid,load:function(cb){
  cb=cb||function(){};if(!M.Config.remoteLevelsUrl){cb();return;}
  var settled=false;M.remoteLevelsStatus='pending';
  function done(data){if(settled)return;settled=true;clearTimeout(t);if(data&&Array.isArray(data.levels)&&data.levels.length&&data.levels.length<=1000&&data.levels.every(valid)&&(!M.Game||M.Game.state.scene==='home')){M.LEVELS=data.levels;M.remoteLevelsStatus='remote';}else M.remoteLevelsStatus='local';cb();}
  var t=setTimeout(function(){done(null);},3000);
  try{M.Platform.request(M.Config.remoteLevelsUrl,done,function(){done(null);});}catch(e){done(null);}
 }};
})(typeof GameGlobal!=='undefined'?GameGlobal:typeof window!=='undefined'?window:global);
