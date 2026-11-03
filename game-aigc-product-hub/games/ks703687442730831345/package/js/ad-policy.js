(function(r){
 'use strict';
 // 结算插屏策略：只在局终自然间隙评估（胜/败结算），激励复活当局豁免。
 // 「实际游玩时间」只累计可操作的对局时间：广告、弹窗、切后台、挂机不计时。
 // 持久化字段：playSec 累计实际游玩秒数、rounds 完成局数、day/dayCount 每日计数、lastRound 上次插屏时的局数、bucket 固定分组。
 var M=r.M3,KEY='buffet-interstitial-v1';
 var P=null,sessShown=0,playSinceAd=1e9,roundRewarded=false;
 function cfg(k,d){var v=M.Config&&M.Config[k];return typeof v==='number'&&isFinite(v)&&v>=0?v:d;}
 function today(){var d=new Date();return d.getFullYear()+'-'+(d.getMonth()+1)+'-'+d.getDate();}
 function num(v,d){var n=Number(v);return isFinite(n)&&n>=0?n:d;}
 function load(){
  if(P)return P;
  P=M.Storage.get(KEY)||{};
  P.playSec=num(P.playSec,0);P.rounds=num(P.rounds,0);P.dayCount=num(P.dayCount,0);P.lastRound=num(P.lastRound,0);
  if(P.bucket!=='on'&&P.bucket!=='off')P.bucket=Math.random()<cfg('interstitialRollout',1)?'on':'off';
  P.day=P.day||today();
  M.Storage.set(KEY,P);
  return P;
 }
 function dayRoll(){if(P&&P.day!==today()){P.day=today();P.dayCount=0;M.Storage.set(KEY,P);}}
 var lastSave=0;
 function save(now){
  if(!P)return;
  var t=Date.now();
  if(!now&&t-lastSave<10000)return; // 实际游玩按秒累计，节流落盘。
  lastSave=t;M.Storage.set(KEY,P);
 }
 M.AdPolicy={
  bucket:function(){return load().bucket;},
  // 开局：清除当局激励豁免；resume 续局时若当局曾复活（看过激励）保留豁免。
  roundStart:function(hadRewarded){roundRewarded=!!hadRewarded;},
  // 终局（胜利/放弃复活后的失败局/终局重开）恰好调用一次；复活继续不算新局。
  roundEnd:function(){load();dayRoll();P.rounds++;save(true);},
  // 只在活的对局里由主循环喂入；sec<=0 直接忽略，单次裁剪防切后台大 dt。
  tick:function(sec){if(sec<=0)return;load();P.playSec+=Math.min(sec,1);playSinceAd+=Math.min(sec,1);save();},
  // 任意激励展示后关闭（看完或中途关闭都算「展示过」）；加载失败从未展示，不计。
  rewardedClosed:function(){roundRewarded=true;playSinceAd=0;},
  // 插屏成功展示并关闭：清零间隔、记录局数锚点、占用会话/每日额度。
  interstitialClosed:function(){load();dayRoll();sessShown++;P.dayCount++;P.lastRound=P.rounds;playSinceAd=0;save(true);},
  // 结算点判定：返回 ok 与首个不满足项（reason），供埋点与联调。
  evaluate:function(){
   load();dayRoll();
   var out={ok:false,reason:'',rounds:P.rounds,playSec:Math.round(P.playSec),sinceAd:Math.round(Math.min(playSinceAd,1e9)),dayCount:P.dayCount,sessShown:sessShown,bucket:P.bucket};
   if(!M.Platform.native){out.reason='non-native';return out;}
   if(P.bucket==='off'){out.reason='rollout';return out;}
   if(P.rounds<=cfg('interstitialFirstRounds',3)){out.reason='new-user-rounds';return out;}
   if(P.playSec<cfg('interstitialPlayMinSec',180)){out.reason='new-user-playtime';return out;}
   if(roundRewarded){out.reason='rewarded-round';return out;}
   if(playSinceAd<cfg('interstitialIntervalSec',180)){out.reason='interval';return out;}
   if(P.rounds-P.lastRound<cfg('interstitialRoundGap',2)){out.reason='round-gap';return out;}
   if(sessShown>=cfg('interstitialSessionMax',3)){out.reason='session-cap';return out;}
   if(P.dayCount>=cfg('interstitialDailyMax',6)){out.reason='daily-cap';return out;}
   out.ok=true;out.reason='pass';return out;
  }
 };
})(typeof GameGlobal!=='undefined'?GameGlobal:typeof window!=='undefined'?window:global);
