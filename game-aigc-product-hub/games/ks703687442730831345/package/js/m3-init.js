(function(root){
  'use strict';
  var M3=root.M3=root.M3||{};
  M3.root=root;
  M3.Layout={w:750,h:1624,safeTop:0,safeBottom:0,usableH:1624};
  M3._now=function(){return typeof performance!=='undefined'&&performance.now?performance.now():Date.now();};
  M3.BUILD_VER='1.0.86';
})(typeof GameGlobal!=='undefined'?GameGlobal:typeof window!=='undefined'?window:global);
