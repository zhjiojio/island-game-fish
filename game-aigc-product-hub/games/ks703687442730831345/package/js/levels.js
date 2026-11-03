(function(r){
  'use strict'; var M=r.M3;
  M.Config={title:'自助餐消消乐',adUnitId:'2300061896_01',interstitialAdUnitId:'2300061896_03',remoteLevelsUrl:'',shareTitle:'自助餐消消乐，来挑战你的眼力！',prices:{refresh:100,pack:100,wand:100},reviveSeconds:60,hintDelay:8,comboWindow:10,comboBonus:1,energyMax:5,energySeconds:600,
  // 结算插屏频控（首次参数，可按数据调整）：前3局+累计实际游玩3分钟双重新手保护；距上一次全屏广告关闭需再实际游玩180s；
  // 两次插屏之间至少完成2局（复活继续不算新局）；本局展示过激励（含中途关闭）当局免插屏；单会话≤3次、每日≤6次。
  interstitialFirstRounds:3,interstitialPlayMinSec:180,interstitialIntervalSec:180,interstitialRoundGap:2,interstitialSessionMax:3,interstitialDailyMax:6,
  // 1=全量开放；改 0.2 即随机 20% 用户开放插屏（分组本地固定，供小流量对照）。
  interstitialRollout:1};
  M.Foods=['garlic-shrimp','steamed-dumpling','honey-chicken-wings','black-pepper-steak','garlic-broccoli','croissant','fried-egg','burger','cheese-baked-scallop','butter-corn','tomato-pasta','fried-chicken-nugget','portuguese-egg-tart','strawberry-cake','salmon-sushi','chocolate-donut'];
  M.LEVELS=[];
  for(var i=1;i<=100;i++) M.LEVELS.push({number:i,groups:i<3?6:i<5?9:12,kinds:Math.min(16,i<3?8+(i-1)*2:i<5?12+(i-3)*2:14+Math.floor((i-5)/2)),triples:i<=30?12+3*i:102+3*Math.ceil((i-30)/5),empty:6,duration:i<5?180:360,revive:180,gifts:{refresh:0,pack:0,wand:0}});
})(typeof GameGlobal!=='undefined'?GameGlobal:typeof window!=='undefined'?window:global);
