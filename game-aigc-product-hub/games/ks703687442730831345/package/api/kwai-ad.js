(function(r){
 'use strict';var M=r.M3;
 var interstitialBusy=false,interstitialAt=0,preAd=null;
 function policy(fn){return M.AdPolicy&&typeof M.AdPolicy[fn]==='function';}
 M.KwaiAd={showRewarded:function(cb){
  if(!M.Platform.native){
   // H5 预览模拟一次完整展示，同样通知策略层（当局激励豁免 + 间隔清零）。
   M.Game.showAdPreview(function(ok,msg){if(policy('rewardedClosed'))M.AdPolicy.rewardedClosed();cb(ok,msg);});
   return;
  }
  var k=M.Platform.sdk;if(!M.Config.adUnitId||!k.createRewardedVideoAd){cb(false,'广告暂未配置，请使用星星购买');return;}
  var ad,finished=false,timer;
  function done(ok,msg){if(finished)return;finished=true;clearTimeout(timer);if(ad&&ad.offClose)ad.offClose(close);if(ad&&ad.offError)ad.offError(error);cb(ok,msg);}
  function close(x){
   // 激励真实展示过并关闭（看完或中途关闭都算），通知策略层。
   if(policy('rewardedClosed'))M.AdPolicy.rewardedClosed();
   done(!!(x&&(typeof x.count==='number'?x.count>0:x.isEnded)),'完整观看后才能获得奖励');
  }
  function error(){done(false,'广告暂不可用，请稍后再试');}
  // 加载超时只限制加载阶段，不能截断正常的视频播放。
  try{ad=k.createRewardedVideoAd({adUnitId:M.Config.adUnitId});ad.onClose(close);ad.onError(error);timer=setTimeout(error,10000);ad.load().then(function(){if(finished)return;return ad.show();}).then(function(){if(!finished)clearTimeout(timer);}).catch(error);}catch(e){error();}
 },
 // 结算前提前 create 插屏实例，把拉取耗时挪出结算过渡；失败静默，展示时回退现场 create。
 preloadInterstitial:function(){
  var k=M.Platform.sdk;
  if(!M.Platform.native||!M.Config.interstitialAdUnitId||!k||!k.createInterstitialAd||preAd||interstitialBusy)return false;
  try{
   preAd=k.createInterstitialAd({adUnitId:M.Config.interstitialAdUnitId});
   preAd.__preloadErr=function(){try{if(preAd){preAd.offError(preAd.__preloadErr);preAd.destroy();}}catch(e){}preAd=null;};
   preAd.onError(preAd.__preloadErr);
   return true;
  }catch(e){preAd=null;return false;}
 },
 showInterstitial:function(cb){
  // 结算插屏：自然间隙展示；所有失败路径（H5/无API/平台频控/拉取失败/iOS低版本默认值）一律静默放行，绝不阻塞流程。
  cb=cb||function(){};
  var k=M.Platform.sdk;
  if(!M.Platform.native||!M.Config.interstitialAdUnitId||!k||!k.createInterstitialAd){cb(false);return;}
  // 客户端冷却对齐平台频控：60s 内展示过任意广告（含激励视频）插屏必失败，直接放行省一次无效请求。
  if(interstitialBusy||Date.now()-interstitialAt<60000){cb(false);return;}
  interstitialBusy=true;
  var ad=preAd;preAd=null;
  var preloaded=!!ad,finished=false;
  function done(shown){
   if(finished)return;finished=true;interstitialBusy=false;
   if(shown){interstitialAt=Date.now();if(policy('interstitialClosed'))M.AdPolicy.interstitialClosed();}
   try{if(ad){if(ad.offClose)ad.offClose(closeFn);if(ad.offError)ad.offError(errorFn);ad.destroy();}}catch(e){}
   if(M.Tele&&M.Tele.report)M.Tele.report('interstitial',{ok:!!shown,preloaded:preloaded});
   cb(!!shown);
  }
  function closeFn(){done(true);}
  function errorFn(){done(false);}
  try{
   // 优先复用结算前预载的实例；没有则现场 create（快手插屏每次新实例，用完 destroy）。
   if(!ad)ad=k.createInterstitialAd({adUnitId:M.Config.interstitialAdUnitId});
   else if(ad.offError&&ad.__preloadErr){try{ad.offError(ad.__preloadErr);}catch(e){}}
   ad.onClose(closeFn);ad.onError(errorFn);
   ad.show().then(function(res){
    // iOS 低版本/横屏：show resolve 默认值而非真正展示，需主动放行，否则等不到 onClose 会挂死。
    if(res&&res.code===1&&/default value/i.test(String(res.msg||'')))done(false);
   }).catch(function(){done(false);});
  }catch(e){interstitialBusy=false;cb(false);}
 }};
})(typeof GameGlobal!=='undefined'?GameGlobal:typeof window!=='undefined'?window:global);
