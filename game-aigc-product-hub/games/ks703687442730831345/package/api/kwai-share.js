(function(r){
 'use strict';var M=r.M3,busy=false;
 M.KwaiShare={share:function(){var k=M.Platform.sdk;if(k&&k.shareAppMessage)k.shareAppMessage({title:M.Config.shareTitle});else M.Game.toast('浏览器体验版：可复制当前页面地址分享');},
 desktop:function(cb){
  var k=M.Platform.sdk,p=M.Game&&M.Game.profile;
  if(busy)return;
  if(!k||!k.addShortcut){M.Game.toast('当前环境无法验证桌面添加，请在支持的快手客户端操作');return;}
  // 判定优先级：先「是否真的加桌」，再「是否已领过奖励」（领奖与否由 game.js 的 desktopRewardClaimed 判）。
  // 不用本地 desktopAdded 短路——用户可能删过桌面图标导致本地记录过期：
  // 安卓每次 checkShortcut 实查真伪；iOS 无法实查，重走加桌流程后按时间差判定。
  var platform='';
  try{if(k.getSystemInfoSync)platform=(k.getSystemInfoSync()||{}).platform||'';}catch(e){}
  var ios=/^ios/i.test(platform);
  // checkShortcut 仅安卓支持；iOS 走「调用时刻→回前台」时间差判定。
  if(!ios&&!k.checkShortcut){M.Game.toast('当前环境无法验证桌面添加，请在支持的快手客户端操作');return;}
  busy=true;var done=false;
  function finish(ok){
    if(done)return;done=true;busy=false;
    if(ok){
      // 加桌成功本地存储；发奖与否由 desktopReward 按 desktopRewardClaimed 判定。
      if(p){p.desktopAdded=true;M.Storage.set('buffet-profile-v1',p);}
      if(cb)cb();else M.Game.toast('已添加桌面');
    }else M.Game.toast('暂未验证到桌面快捷方式，未发放奖励，可稍后重试');
  }
  if(ios){
    // iOS：调加桌接口后，以「addShortcut 调用时刻 t0 → onShow 回前台时刻」真实经过≥3s 判成功；不设超时。
    // 注：iOS 切后台时 JS 被挂起，onHide 回调常延迟到回前台后才补执行，onHide→onShow 的回调间隔会失真（实测仅数 ms），
    // 故基准取前台同步记录的 t0；onShow 回调里取当前真实时间求差。
    var t0=Date.now(),offWatch=function(){try{if(k.offShow)k.offShow(onShowRef);}catch(e){}};
    var onShowRef=function(){if(done)return;offWatch();finish(Date.now()-t0>=3000);};
    try{k.onShow(onShowRef);}catch(e){finish(false);return;}
    try{k.addShortcut({fail:function(){if(done)return;offWatch();finish(false);}});}catch(e){offWatch();finish(false);}
    return;
  }
  // 安卓/支持平台：checkShortcut 实查；addShortcut 成功回调早于快捷方式真正落地，
  // 复查按 800ms 间隔重试最多 3 次（覆盖落地时序），任一次 installed=true 即成功；无超时。
  function check(add){try{k.checkShortcut({success:function(res){if(done)return;if(res&&res.installed===true)finish(true);else if(add)create();else finish(false);},fail:function(){if(done)return;if(add)create();else finish(false);}});}catch(e){finish(false);}}
  function create(){try{k.addShortcut({success:function(){
    if(done)return;
    var tries=0;
    (function recheck(){
      try{k.checkShortcut({success:function(res){
        if(done)return;
        if(res&&res.installed===true)finish(true);
        else if(++tries<3)setTimeout(recheck,800);
        else finish(false);
      },fail:function(){if(done)return;if(++tries<3)setTimeout(recheck,800);else finish(false);}});}catch(e){finish(false);}
    })();
  },fail:function(){finish(false);}});}catch(e){finish(false);}}
  check(true);
 }};
})(typeof GameGlobal!=='undefined'?GameGlobal:typeof window!=='undefined'?window:global);
