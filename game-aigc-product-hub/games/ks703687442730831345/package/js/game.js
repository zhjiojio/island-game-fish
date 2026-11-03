(function(r){
  'use strict';
  // All UI positions and animation distances use the 750x1624 design space.
  // The small content inset preserves the original composition without stretching.
  var M=r.M3,R=M.Rules,C=M.Config,ctx,S=1,OX=0,OY=0,VW=750,VH=1624,CONTENT_X=1.276151;
  var names={refresh:'刷新',pack:'打包',wand:'变换（魔法棒）'};
  var profile=M.Storage.get('buffet-profile-v1')||{},gameBgCache=null,gameBgKey=null,foodCache=null;
  profile.stars=Number(profile.stars)||0;profile.level=Math.max(1,Number(profile.level)||1);
  if(typeof profile.energy!=='number'||!isFinite(profile.energy)||profile.energy<0)profile.energy=C.energyMax;
  if(typeof profile.energyAt!=='number'||!isFinite(profile.energyAt)||profile.energyAt<=0)profile.energyAt=Date.now();
  profile.energy=Math.min(C.energyMax,Math.max(0,Math.floor(profile.energy)));
  profile.gifts=profile.gifts||{};profile.bought=profile.bought||{};profile.granted=profile.granted||{};profile.tutorialDone=profile.tutorialDone===true;
  if(typeof profile.musicEnabled!=='boolean')profile.musicEnabled=!profile.muted;
  if(typeof profile.soundEnabled!=='boolean')profile.soundEnabled=!profile.muted;
  if(typeof profile.vibrationEnabled!=='boolean')profile.vibrationEnabled=true;
  profile.toolStock=profile.toolStock&&typeof profile.toolStock==='object'?profile.toolStock:{};
  Object.keys(names).forEach(function(k){var n=Number(profile.toolStock[k]);profile.toolStock[k]=isFinite(n)?Math.max(0,Math.floor(n)):0;});
  var st={scene:'home',transition:null,modal:null,groups:[],drag:null,press:null,taps:[],time:0,combo:0,comboLeft:0,maxCombo:0,stars:0,starSpent:0,clears:0,revived:false,idle:0,lock:0,effects:[],starFlights:[],toast:'',toastLeft:0,last:M._now(),background:false,ad:false,adPending:null,pending:null,animations:[],level:null,hint:[],daily:false,tutorial:null,privacyScroll:0,privacyTouch:null};
  function save(){M.Storage.set('buffet-profile-v1',profile);}
  // Earned stars remain provisional until victory; spend them before banked stars.
  function runBalance(){return Math.max(0,st.stars-(st.starSpent||0));}
  function starBalance(){return profile.stars+(st.scene==='game'?runBalance():0);}
  function spendStars(cost){if(starBalance()<cost)return false;var local=Math.min(runBalance(),cost);st.starSpent=(st.starSpent||0)+local;profile.stars-=cost-local;save();return true;}
  function discardRun(){st.runDiscarded=true;st.stars=0;st.starSpent=0;st.pending=null;st.animations=[];st.lock=0;st.effects=[];st.starFlights=[];clearSnapshot();}
  function snapshot(preservePointer){if(preservePointer!==true)cancelPointer();if(st.pending){var jobs=animationJobs();st.pending=null;st.animations=[];st.lock=0;jobs.forEach(function(job){award(job.events);});if(!R.total(st.groups)){finish();return;}}persistRun();}
  function persistRun(){if(st.scene==='game'&&!st.runDiscarded&&st.groups.length){var rewards=[];animationJobs().forEach(function(job){job.events.forEach(function(e){if(e.kind==='clear'&&!e.awarded)rewards.push(e);});});M.Storage.set('buffet-run-v1',{version:2,groups:st.groups,level:st.level,time:st.time,combo:st.combo,comboLeft:st.comboLeft,maxCombo:st.maxCombo,stars:st.stars,starSpent:st.starSpent||0,clears:st.clears,revived:st.revived,empty:st.openEmpty,daily:st.daily,rewards:rewards});st.savedAt=M._now();}}
  function clearSnapshot(){M.Storage.set('buffet-run-v1',null);}
  function toast(t,dismissOnInput){st.toast=t;st.toastLeft=3.5;st.toastDismissOnInput=dismissOnInput===true;}
  function dismissEntryToast(){if(st.scene==='game'&&!st.modal&&!st.ad&&st.toastDismissOnInput){st.toastLeft=0;st.toastDismissOnInput=false;}}
  function modal(title,lines,buttons,closeable){cancelPointer();st.modal={title:title,lines:lines,buttons:buttons||[],closeable:closeable!==false};}
  function close(){st.modal=null;st.last=M._now();if(st.scene==='win')winModal();}
  function blankButton(label,fn,color){return {label:label,fn:fn,color:color||'#a7cd27'};}
  function energyTick(){var now=Date.now(),period=C.energySeconds*1000;if(profile.energy>=C.energyMax){profile.energyAt=now;return;}if(profile.energyAt>now)profile.energyAt=now;var steps=Math.floor((now-profile.energyAt)/period);if(steps>0){profile.energy=Math.min(C.energyMax,profile.energy+steps);profile.energyAt=profile.energy>=C.energyMax?now:profile.energyAt+steps*period;save();}}
  function energyCountdown(){if(profile.energy>=C.energyMax)return '已满';var left=Math.max(0,Math.ceil((C.energySeconds*1000-(Date.now()-profile.energyAt))/1000));return ('0'+Math.floor(left/60)).slice(-2)+':'+('0'+left%60).slice(-2);}
  function adReward(fn){if(st.ad)return;st.ad=true;st.modal=null;st.last=M._now();var settled=false;M.KwaiAd.showRewarded(function(ok,msg){if(settled)return;settled=true;st.ad=false;st.adPreview=null;st.last=M._now();if(ok)fn();else toast(msg||'未完成观看，没有消耗或奖励');if(st.scene==='win'&&!st.modal&&!st.transition)winModal();if(!st.pending)snapshot();});}
  function energyModal(){if(st.ad||st.transition)return;energyTick();modal('获得体力',[],[blankButton('我要体力',function(){adReward(function(){energyTick();profile.energy=Math.min(C.energyMax,profile.energy+1);if(profile.energy>=C.energyMax)profile.energyAt=Date.now();save();toast('体力 +1');});})]);st.modal.kind='energy';}
  function grant(l){if(profile.granted[l.number])return;Object.keys(names).forEach(function(k){profile.gifts[k]=(profile.gifts[k]||0)+(l.gifts[k]||0);});profile.granted[l.number]=true;save();}
  function sceneTransition(action){
    if(st.transition)return;cancelPointer();st.modal=null;
    st.transition={elapsed:0,duration:1,switched:false,action:action};st.last=M._now();
  }
  function updateTransition(dt){
    var tr=st.transition;tr.elapsed=Math.min(tr.duration,tr.elapsed+dt);
    if(!tr.switched&&tr.elapsed>=tr.duration/2){tr.switched=true;tr.action();}
    if(tr.elapsed>=tr.duration)st.transition=null;
  }
  function drawTransition(){
    var tr=st.transition;if(!tr)return;st.taps=[];
    var progress=tr.elapsed/tr.duration,frame=Math.min(17,Math.floor(progress*18)),cover=Math.max(0,Math.min(1,progress/(4/18),(1-progress)/(5/18)));
    ctx.save();ctx.globalAlpha=cover;ctx.fillStyle='#ffbb36';ctx.fillRect(-CONTENT_X,0,VW,VH);ctx.restore();
    var scale=Math.max(VW/495,VH/1068),w=495*scale,h=1068*scale;
    image('transitionFrame'+frame,(VW-w)/2,(VH-h)/2,w,h);
  }
  function returnHome(){gameBgCache=null;gameBgKey=null;foodCache=null;sceneTransition(function(){st.scene='home';close();});}
  function tutorialClearMove(groups){var moves=R.moves(groups);for(var i=0;i<moves.length;i++){var m=moves[i],dest=groups[m.to].a.indexOf(null),copy=R.clone(groups),events=R.move(copy,m.from,m.slot,m.to,dest);if(events&&events.some(function(e){return e.kind==='clear';}))return {from:m.from,slot:m.slot,to:m.to,dest:dest,type:groups[m.from].a[m.slot]};}return null;}
  function tutorialIntro(move){st.tutorial={active:true,step:'drag',move:move,elapsed:0};toast('拖动餐品到相同餐品旁',true);}
  function tutorialFinish(){if(!st.tutorial||st.tutorial.step!=='waiting')return;profile.tutorialDone=true;save();st.tutorial=null;}
  function start(index,daily){
    if(st.transition)return;
    energyTick();if(profile.energy<1){energyModal();return;}
    var l=M.LEVELS[Math.min(index,M.LEVELS.length-1)],gen,tutorialMove=null,baseSeed=(Date.now()>>>0)+(daily?1777:0),needTutorial=l.number===1&&!daily&&!profile.tutorialDone;
    try{for(var tutorialTry=0;tutorialTry<(needTutorial?20:1);tutorialTry++){gen=R.generate(l,baseSeed+tutorialTry*977);tutorialMove=needTutorial?tutorialClearMove(gen.groups):null;if(!needTutorial||tutorialMove)break;}if(needTutorial&&!tutorialMove)throw Error('未找到引导三消');}catch(e){toast('本次布局验证未完成，请再试一次');return;}
    sceneTransition(function(){
    st.runDiscarded=false;profile.energy--;grant(l);save();
    if(M.AdPolicy&&M.AdPolicy.roundStart)M.AdPolicy.roundStart();
    st.scene='game';st.level=l;st.groups=gen.groups;gameBgCache=null;gameBgKey=null;foodCache=null;st.openEmpty=gen.empty;st.time=l.duration;st.combo=0;st.comboLeft=0;st.maxCombo=0;st.stars=0;st.starSpent=0;st.clears=0;st.revived=false;st.idle=0;st.modal=null;st.effects=[];st.pending=null;st.animations=[];st.lock=0;st.last=M._now();st.daily=!!daily;st.hint=[];
    snapshot();M.Tele.report('level_start',{level:l.number,groups:l.groups});
    if(tutorialMove)tutorialIntro(tutorialMove);else if(l.number===1)toast('拖动餐品到空位即可',true);
    });
  }
  function validRun(run){
    function number(n,max){return typeof n==='number'&&isFinite(n)&&n>=0&&n<=max;}
    if(!run||!run.level||run.version!==undefined&&run.version!==2)return false;
    var l=run.level;
    if(!number(l.number,M.LEVELS.length)||l.number<1||l.number%1||!number(l.duration,86400)||!number(l.revive,3600))return false;
    if(!['time','combo','comboLeft','maxCombo','stars','clears'].every(function(k){return number(run[k],1000000);}))return false;
    if(run.starSpent!==undefined&&!number(run.starSpent,run.stars))return false;
    if(!number(run.empty,l.groups*3)||typeof run.revived!=='boolean'||typeof run.daily!=='boolean')return false;
    if(!Array.isArray(run.groups)||run.groups.length!==l.groups||[6,9,12].indexOf(l.groups)<0)return false;
    if(!run.groups.every(function(g){return g&&Array.isArray(g.a)&&g.a.length===3&&Array.isArray(g.q)&&g.q.length<=1000&&[g.a].concat(g.q).every(function(a,i){return Array.isArray(a)&&(i===0||a.length>=1&&a.length<=3)&&a.every(function(t){return t===null&&i===0||number(t,M.Foods.length-1)&&t%1===0;});});}))return false;
    var c=R.counts(run.groups);if(!Object.keys(c).every(function(k){return c[k]%3===0;}))return false;
    return run.rewards===undefined||Array.isArray(run.rewards)&&run.rewards.length<=1000&&run.rewards.every(function(e){return e&&e.kind==='clear'&&number(e.group+1,l.groups)&&e.group%1===0&&(e.type===undefined||number(e.type,M.Foods.length-1)&&e.type%1===0);});
  }
  function resume(run){if(st.transition)return;if(!validRun(run)){clearSnapshot();start(profile.level-1);return;}sceneTransition(function(){st.runDiscarded=false;st.scene='game';st.groups=R.clone(run.groups);st.level=run.level;['time','combo','comboLeft','maxCombo','stars','clears','revived','daily'].forEach(function(k){st[k]=run[k];});st.starSpent=Math.min(st.stars,Math.max(0,Number(run.starSpent)||0));st.openEmpty=run.empty;st.modal=null;st.lock=0;st.pending=null;st.animations=[];st.idle=0;st.hint=[];st.tutorial=null;st.last=M._now();st.effects=[];st.starFlights=[];if(M.AdPolicy&&M.AdPolicy.roundStart)M.AdPolicy.roundStart(st.revived);award(Array.isArray(run.rewards)?run.rewards:[]);persistRun();if(!R.total(st.groups)){finish();return;}if(st.level.number===1&&!st.daily&&!profile.tutorialDone){var move=tutorialClearMove(st.groups);if(move)tutorialIntro(move);}if(st.level.duration&&st.time<=0)timeup();});}
  function begin(){var run=M.Storage.get('buffet-run-v1');if(validRun(run))resume(run);else start(profile.level-1);}
  function quit(){if(st.transition||st.ad)return;discardRun();returnHome();}
  function toggleSetting(key){profile[key]=!profile[key];save();if(key==='musicEnabled'&&M.BackgroundMusic){if(profile[key])M.BackgroundMusic.play();else M.BackgroundMusic.pause();}if(key==='soundEnabled'&&!profile[key]&&M.Feedback.stop)M.Feedback.stop();if(key==='vibrationEnabled'&&M.Feedback.vibrate)M.Feedback.vibrate(profile[key]?20:0);}
 function settings(){modal('设置',[],[]);st.modal.kind=st.scene==='home'?'settings':'gameSettings';if(st.scene==='game')persistRun();}
 function resetProgress(){modal('重置游戏进度',['确定重置游戏进度吗？','星星和体力不受影响。'],[blankButton('确认重置',doReset,'#efb35f'),blankButton('取消',close)]);}
 function doReset(){M.Storage.set('buffet-run-v1',null);profile.level=1;profile.tutorialDone=false;save();st.scene='home';st.modal=null;st.groups=[];st.drag=null;st.pending=null;st.animations=[];st.lock=0;st.effects=[];st.starFlights=[];st.transition=null;st.tutorial=null;toast('游戏进度已重置');}
 function confirmQuit(){modal('返回首页',['返回会损失当前进度和星星'],[],false);st.modal.kind='exitConfirm';}
  function help(){modal('怎么玩',['3个相同餐品聚到同一餐架即消除','餐架清空后下层餐盘补上来','拖到空位，不可交换'],[]);}
  function privacy(){if(st.ad||st.transition)return;st.privacyScroll=0;privacyDrawn=null;modal('隐私政策',[],[]);st.modal.kind='privacy';}
 function winModal(){modal('全部收盘',[],[],false);st.modal.kind='win';}
 // 局终结算：先判插屏策略（新手保护/间隔/局数/封顶/分组），满足则在动效排空后的自然间隙展示一次插屏再进结算页；
 // 任何不满足或展示失败都直接进入结算页，不等广告、也不在下一局补弹。激励复活的当局由策略层直接豁免。
 function settleAd(after){
  var v=null;
  if(M.AdPolicy&&M.AdPolicy.evaluate&&M.KwaiAd&&M.KwaiAd.showInterstitial)v=M.AdPolicy.evaluate();
  if(v)M.Tele.report('interstitial_eval',{ok:!!v.ok,reason:v.reason,level:st.level?st.level.number:0,rounds:v.rounds,playSec:v.playSec,sinceAd:v.sinceAd,dayCount:v.dayCount,sessShown:v.sessShown,bucket:v.bucket});
  if(!v||!v.ok){after();return;}
  if(M.KwaiAd.preloadInterstitial)M.KwaiAd.preloadInterstitial();
  st.adPending={fn:after,at:M._now()};
 }
 function winPlay(next){if(st.scene!=='win'||st.transition||st.ad||st.adPending)return;var index=st.level.number-1+(next?1:0);if(index>=M.LEVELS.length){returnHome();return;}start(index,false);}
 function finish(){if(st.scene!=='game')return;var credited=runBalance();st.scene='win';profile.stars+=credited;profile.totalStars=(profile.totalStars||0)+st.stars;if(!st.daily)profile.level=Math.max(profile.level,Math.min(M.LEVELS.length,st.level.number+1));dailyWin(st.level.number);save();clearSnapshot();M.Feedback.play('win');M.Tele.report('win',{level:st.level.number,stars:st.stars});if(M.AdPolicy&&M.AdPolicy.roundEnd)M.AdPolicy.roundEnd();settleAd(winModal);}
 // 失败局只在「不再复活」的终局过渡判插屏：复活弹窗本身不弹广告，「重新开始/返回首页」也不直接触发，进过渡后由策略决定。
 function lose(){discardRun();st.scene='lose';if(M.AdPolicy&&M.AdPolicy.roundEnd)M.AdPolicy.roundEnd();settleAd(function(){modal('下次一定能收完',['本局剩余星星已清除，历史余额不受影响。','调整空位，再试一次。'],[blankButton('再试一次',function(){start(st.level.number-1,st.daily);}),blankButton('返回首页',returnHome,'#efb35f')],false);});}
 function timeup(){
  if(st.adPending)return;
  if(st.revived){discardRun();st.scene='lose';if(M.AdPolicy&&M.AdPolicy.roundEnd)M.AdPolicy.roundEnd();settleAd(function(){modal('时间到了',[],[blankButton('返回首页',returnHome,'#efb35f')],false);st.modal.kind='timeup';st.modal.gameOver=true;});return;}
  modal('时间到了',[],[blankButton('广告复活',function(){adReward(function(){st.revived=true;st.time=st.level.revive;st.combo=0;st.comboLeft=0;close();});}),blankButton('重新开始',function(){st.modal=null;st.scene='lose';discardRun();if(M.AdPolicy&&M.AdPolicy.roundEnd)M.AdPolicy.roundEnd();settleAd(function(){start(st.level.number-1,st.daily);});},'#efb35f')],false);st.modal.kind='timeup';
 }
  function award(events){events.forEach(function(e){if(e.kind!=='clear'||e.awarded)return;e.awarded=true;st.combo=st.comboLeft>0?st.combo+1:1;st.comboLeft=C.comboWindow;st.maxCombo=Math.max(st.maxCombo,st.combo);var gain=1+(st.combo>1?C.comboBonus:0);st.stars+=gain;st.clears++;var p=e.group<0?{x:373.723849,y:696.485356,w:0,h:0}:foodPos(e.group,1);st.effects.push({group:e.group,life:0.52,label:'+'+gain+' ★'});st.starFlights.push({x:p.x+p.w/2,y:p.y+p.h/2,life:0.55,gain:gain});if(e.group<0)M.Feedback.play('clear');});}
  // Each animation owns its affected racks; unrelated moves can animate concurrently.
  function animationJobs(){return st.pending?[st.pending].concat(st.animations):[];}
  function syncAnimations(jobs){st.pending=jobs[0]||null;st.animations=jobs.slice(1);st.lock=jobs.reduce(function(max,job){return Math.max(max,job.remaining);},0);}
  function groupAnimating(i){return animationJobs().some(function(job){return job.affected.indexOf(i)>=0;});}
  function commit(groups,events,motion,trace,ordinary){
    if(ordinary){
      var jobs=animationJobs(),tracks={};
      function track(i){return tracks[i]||(tracks[i]=[]);}
      var targetClears=motion&&(trace||[]).some(function(s){return s.kind==='clear'&&s.group===motion.to;});
      if(motion&&!targetClears){
        var before=R.clone(trace&&trace.length?trace[0].before:groups);before[motion.to].a[motion.dest]=null;
        track(motion.to).push({kind:'move',before:before,motion:motion,duration:0.12});
      }
      (trace||[]).forEach(function(s){var count=s.before[s.group].q[0]?s.before[s.group].q[0].length:1;s.duration=s.kind==='clear'?0.46:s.kind==='refill'?0.25:0.20;track(s.group).push(s);});
      Object.keys(tracks).forEach(function(key){var i=Number(key),stages=tracks[key],duration=0;stages.forEach(function(s){s.start=duration;duration+=s.duration;});jobs.push({events:events.filter(function(e){return e.group===i;}),stages:stages,affected:[i],duration:duration,remaining:duration});});
      st.groups=groups;syncAnimations(jobs);st.hint=[];st.idle=0;persistRun();return;
    }
    var stages=[],duration=0,affected=[];
    function touch(i){if(affected.indexOf(i)<0)affected.push(i);}
    if(motion){touch(motion.from);touch(motion.to);stages.push({kind:'move',before:R.clone(st.groups),motion:motion,duration:0.46});}
    (trace||[]).forEach(function(s){touch(s.group);var count=s.before&&s.before[s.group]&&s.before[s.group].q[0]?s.before[s.group].q[0].length:1;s.duration=(s.kind==='refresh'||s.kind==='pack'||s.kind==='wand')?1:s.kind==='clear'?0.46:s.kind==='refill'?0.25:0.20;stages.push(s);});
    if(!motion)groups.forEach(function(g,i){touch(i);});
    stages.forEach(function(s){s.start=duration;duration+=s.duration;});
    var jobs=animationJobs();jobs.push({events:events,motion:motion,stages:stages,affected:affected,duration:duration||0.32,remaining:duration||0.32});
    st.groups=groups;syncAnimations(jobs);st.hint=[];st.idle=0;persistRun();
  }
  function animationStage(job){
    var p=job||st.pending;if(!p||!p.stages)return null;var elapsed=p.duration-p.remaining;
    for(var i=0;i<p.stages.length;i++){var s=p.stages[i];if(elapsed<s.start+s.duration){s.t=Math.max(0,Math.min(1,(elapsed-s.start)/s.duration));return s;}}return null;
  }
  function groupAnimationStage(i){var jobs=animationJobs();for(var j=0;j<jobs.length;j++)if(jobs[j].affected.indexOf(i)>=0)return animationStage(jobs[j]);return null;}
  function visibleGroups(){return st.groups.map(function(g,i){var stage=groupAnimationStage(i);return stage?((stage.kind==='refresh'&&stage.t>=0.5)||(stage.kind==='wand'&&stage.t>=0.56)?stage.after[i]:stage.before[i]):g;});}
  // Reserve every rack participating in a sequence, including its future refill stages.
  function moveElement(from,slot,to,dest,motion){if(st.level&&st.level.duration&&st.time<=0)return false;if(st.transition||st.scene!=='game'||st.modal||st.ad)return false;var guide=st.tutorial&&st.tutorial.step==='drag'?st.tutorial.move:null;if(guide&&(from!==guide.from||slot!==guide.slot||to!==guide.to||dest!==guide.dest))return false;if(groupAnimating(from)||groupAnimating(to))return false;var g=R.clone(st.groups),trace=[],events=R.move(g,from,slot,to,dest,trace);if(events===null)return false;commit(g,events,motion,trace,true);if(guide)st.tutorial.step='waiting';return true;}
  function logicalPoint(x,y){return {x:(x-OX)/S,y:(y-OY)/S};}
  function slotAt(p){for(var i=0;i<st.groups.length;i++){var b=geometry(i);for(var j=0;j<3;j++){var f=foodPos(i,j),pad=3.963738*b.scale;if(p.x>=f.x-pad&&p.x<=f.x+f.w+pad&&p.y>=f.y-pad&&p.y<=f.y+f.h+pad)return {group:i,slot:j};}}return null;}
  function snapSlot(p){
    var exact=slotAt(p);
    if(exact)return !groupAnimating(exact.group)&&st.groups[exact.group].a[exact.slot]===null?exact:null;
    var best=null,score=Infinity,radius=30/S;
    for(var i=0;i<st.groups.length;i++)for(var j=0;j<3;j++){
      if(st.groups[i].a[j]!==null||groupAnimating(i))continue;var f=foodPos(i,j);
      var dx=Math.max(f.x-p.x,0,p.x-f.x-f.w),dy=Math.max(f.y-p.y,0,p.y-f.y-f.h);
      if(dx>radius||dy>radius)continue;
      var dist=Math.pow(p.x-f.x-f.w/2,2)+Math.pow(p.y-f.y-f.h/2,2);
      if(dist<score){score=dist;best={group:i,slot:j};}
    }return best;
  }
  function hitArea(p){for(var i=st.taps.length-1;i>=0;i--){var a=st.taps[i];if(p.x>=a.x&&p.x<=a.x+a.w&&p.y>=a.y&&p.y<=a.y+a.h)return a;}return null;}
  function cancelPointer(){st.drag=null;st.press=null;foodCache=null;st.privacyTouch=null;}
  function pointerDown(x,y){cancelPointer();if(!M.Assets.ready||st.background||st.transition||st.adPending)return;dismissEntryToast();var p=logicalPoint(x,y);if(st.modal&&st.modal.kind==='privacy'){st.privacyTouch={y:y,scroll:st.privacyScroll};var privacyHit=hitArea(p);if(privacyHit)st.press={area:privacyHit,x:x,y:y,moved:false};return;}
    if(st.scene==='game'&&!st.modal&&!st.ad&&(!st.level.duration||st.time>0)){var hit=slotAt(p);if(hit&&!groupAnimating(hit.group)){var guide=st.tutorial&&st.tutorial.step==='drag'?st.tutorial.move:null;if(guide&&(hit.group!==guide.from||hit.slot!==guide.slot)){toast('请拖动高亮的餐品');return;}var type=st.groups[hit.group].a[hit.slot];if(type!==null){var f=foodPos(hit.group,hit.slot);st.drag={from:hit.group,slot:hit.slot,type:type,x:f.x,y:f.y,offsetX:p.x-f.x,offsetY:p.y-f.y};st.hint=[];st.idle=0;foodCache=buildFoodCache(hit.group,hit.slot);}return;}}
    var a=hitArea(p);if(a)st.press={area:a,x:x,y:y,moved:false};
  }
  function pointerMove(x,y){var p=logicalPoint(x,y);if(st.modal&&st.modal.kind==='privacy'&&st.privacyTouch){var delta=(st.privacyTouch.y-y)/S;st.privacyScroll=Math.max(0,Math.min(st.privacyMaxScroll||0,st.privacyTouch.scroll+delta));if(Math.abs(delta)>8/S&&st.press)st.press.moved=true;return;}if(st.drag){st.drag.x=p.x-st.drag.offsetX;st.drag.y=p.y-st.drag.offsetY;st.drag.target=snapSlot(p);st.idle=0;}if(st.press&&Math.abs(x-st.press.x)+Math.abs(y-st.press.y)>10)st.press.moved=true;}
  function pointerUp(x,y){var d=st.drag,press=st.press;pointerMove(x,y);if(st.modal&&st.modal.kind==='privacy'){st.privacyTouch=null;st.drag=null;st.press=null;if(press&&!press.moved){var privacyButton=hitArea(logicalPoint(x,y));if(privacyButton&&privacyButton.id===press.area.id)privacyButton.fn();}return;}cancelPointer();if(d){if(st.modal||st.ad||st.scene!=='game')return;var hit=snapSlot(logicalPoint(x,y));if(hit)moveElement(d.from,d.slot,hit.group,hit.slot,{from:d.from,slot:d.slot,to:hit.group,dest:hit.slot,type:d.type,startX:d.x,startY:d.y});return;}if(press&&!press.moved&&!st.adPending){var a=hitArea(logicalPoint(x,y));if(a&&a.id===press.area.id)a.fn();}}

  function hint(){var counts={},chosen=null;st.groups.forEach(function(g,i){g.a.forEach(function(t,j){if(t!==null){counts[t]=counts[t]||[];counts[t].push([i,j]);if(counts[t].length===3&&chosen===null)chosen=t;}});});st.hint=chosen===null?[]:counts[chosen].slice(0,3);}
  function executeTool(k,cost,fromStock){
    if(st.transition||st.scene!=='game'||st.lock||st.ad||st.level.duration&&st.time<=0)return;
    if(fromStock&&!profile.toolStock[k])return;
    var g=R.clone(st.groups),events=[],trace=[],res,seed=Date.now()>>>0;
    try{
      if(k==='refresh'){res=R.refresh(g,st.openEmpty,seed);if(res.empty<st.openEmpty)throw Error('空位不满足要求');g=res.groups;trace.push({kind:'refresh',before:R.clone(st.groups),after:R.clone(g)});}
      else if(k==='wand'){res=R.wand(g,seed,trace);if(!res){toast('当前已没有可变换的餐品，未扣道具');return;}trace.unshift({kind:'wand',group:-1,before:R.clone(st.groups),after:R.clone(res.transformed||res.groups),selected:res.selected,type:res.type,size:res.size,fallback:res.fallback});g=res.groups;events=res.events;}
      else{res=R.pack(g,R.rng(seed),trace);if(res)events=events.concat(res);if(!events.length){toast('没有可打包的餐品');return;}}
    }catch(e){toast('本次排列未通过验证，未扣道具，请重试');return;}
    if(cost&&!spendStars(cost)){toast('星星不足，请观看广告使用');return;}
    if(fromStock){profile.toolStock[k]--;save();}
    close();commit(g,events,null,trace);persistRun();M.Tele.report('tool',{type:k});
  }
  function useTool(k){if(st.transition||st.scene!=='game'||st.lock)return;toolModal(k);}
  function toolModal(k){
    if(st.transition||st.lock||st.ad||st.scene!=='game'||!names[k])return;
    if(profile.toolStock[k]>0){executeTool(k,0,true);return;}
    if(starBalance()<C.prices[k]){adReward(function(){executeTool(k,0);});return;}
    var detail={refresh:['重新排列所有尚未消除的餐品。','恢复开局空位；不直接消除，不增加星星。'],pack:['随机打包3份相同餐品。','优先选择大餐架，数量不足再匹配补位队列。'],wand:['按剩余数量变换9、6或3份台面餐品。','优先与隐藏餐品交换；必要时安全重排，保证可以继续清盘。']}[k];
    var lines=detail.concat(['观看广告不消耗星星，或支付星星立即使用。','当前总余额 '+starBalance()+' 星星']);
    var buttons=[blankButton('观看广告使用一次',function(){adReward(function(){executeTool(k,0);});}),blankButton('支付 '+C.prices[k]+' 星星并使用',function(){executeTool(k,C.prices[k]);},'#efb35f')];
    modal(names[k],lines,buttons);st.modal.kind='toolPurchase';st.modal.tool=k;
  }
  // Beijing 06:00 is UTC 22:00 on the previous calendar day.
  function dailyDay(){return Math.floor((Date.now()+2*3600000)/86400000);}
  function dailyState(){var day=dailyDay(),d=profile.dailyChallenge;if(!d||!isFinite(d.day)||day>d.day){d=profile.dailyChallenge={day:day,status:'locked'};save();}return d;}
  function dailyUnlock(){
    if(st.ad||st.transition||st.scene!=='home')return;var d=dailyState();if(d.day!==dailyDay()){toast('设备时间异常，请恢复正确时间');return;}if(d.status!=='locked'){daily();return;}
    adReward(function(){
      var current=dailyState();if(current.day!==dailyDay()||current.status!=='locked'){daily();return;}
      var choices=[{type:'wins',target:1},{type:'wins',target:2}];
      if(profile.level<M.LEVELS.length)choices.push({type:'level',target:profile.level+1});
      var task=choices[Math.floor(Math.random()*choices.length)];
      profile.dailyChallenge={day:current.day,status:'active',type:task.type,target:task.target,progress:0,reward:200,unlockedAt:Date.now()};save();daily();
    });
  }
  function dailyWin(level){
    var d=dailyState();if(d.day!==dailyDay()||d.status!=='active'||st.daily)return;
    if(d.type==='wins')d.progress=Math.min(d.target,d.progress+1);else if(d.type==='level'&&level===d.target)d.progress=1;
    if(d.progress>=(d.type==='wins'?d.target:1)){d.status='completed';d.completedAt=Date.now();profile.stars+=d.reward;toast('每日挑战完成，奖励 +'+d.reward+' 星星已到账');}save();
  }
  function daily(){if(st.ad||st.transition)return;var d=dailyState();modal('每日挑战',[],d.status==='locked'?[blankButton('我要挑战',dailyUnlock)]:[]);st.modal.kind='daily';st.modal.day=d.day;}
  function gift(){starWallet();}
  function envelope(){starWallet();}
  function favorite(){modal('设为常用',['请使用平台右上角菜单，添加到常用。','浏览器预览中可使用收藏功能。'],[]);}
  function formatTime(t){t=Math.max(0,Math.ceil(t));return Math.floor(t/60)+':'+('0'+t%60).slice(-2);}
  function rr(x,y,w,h,rad){ctx.beginPath();ctx.moveTo(x+rad,y);ctx.arcTo(x+w,y,x+w,y+h,rad);ctx.arcTo(x+w,y+h,x,y+h,rad);ctx.arcTo(x,y+h,x,y,rad);ctx.arcTo(x,y,x+w,y,rad);ctx.closePath();}
  function box(x,y,w,h,fill,stroke){rr(x,y,w,h,14.156206);ctx.fillStyle=fill;ctx.fill();if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=2.831241;ctx.stroke();}}
  function text(t,x,y,size,color,align,outline){ctx.font='bold '+size+'px "Alibaba PuHuiTi 2.0", "Microsoft YaHei", sans-serif';ctx.textAlign=align||'center';ctx.textBaseline='middle';if(outline){ctx.lineJoin='round';ctx.lineWidth=Math.max(2.831241,size*0.12);ctx.strokeStyle=outline;ctx.strokeText(String(t),x,y);}ctx.fillStyle=color||'#fff';ctx.fillText(String(t),x,y);}
  function image(n,x,y,w,h){var img=M.Assets.images[n];if(img&&img.width)ctx.drawImage(img,x,y,w,h);}
  function bgCacheKey(){return st.groups.map(function(g){return g.q.length;}).join(",");}
  function buildGameBgCache(){var k=M.Platform&&M.Platform.sdk;var c=k?k.createCanvas():(typeof document!=="undefined"?document.createElement("canvas"):null);if(!c)return null;c.width=VW;c.height=VH;var g=c.getContext("2d");if(g.imageSmoothingQuality!==undefined)g.imageSmoothingQuality='high';var img;var bg=M.Assets.images.game;if(bg&&bg.width)g.drawImage(bg,-0.566248,-2.264993,749.146444,1628.529986);st.groups.forEach(function(gr,i){var p=geometry(i),s=p.scale,count=gr.q.length,show=Math.min(3,count);for(var n=show-1;n>=0;n--){img=M.Assets.images.tray;if(img&&img.width)g.drawImage(img,p.x+22.050387*s,p.y+(174.245914+n*6.913891)*s,204.655144*s,128.006647*s);}img=M.Assets.images.rack;if(img&&img.width)g.drawImage(img,p.x,p.y,p.w,p.h);});[177.235704,359.001395,540.767085].forEach(function(cx){g.save();g.beginPath();g.rect(cx+41.902371,80.973501,130.237099,69.648536);g.clip();img=M.Assets.images.capsule;if(img&&img.width)g.drawImage(img,cx+41.902371-130.237099*0.342,80.747001,130.237099*1.342,69.648536*1.0065);g.restore();});img=M.Assets.images.settings;if(img&&img.width)g.drawImage(img,22.083682,81.539749,67.949791,67.949791);img=M.Assets.images.moon;if(img&&img.width)g.drawImage(img,99.659693,80.407252,67.949791,70.781032);["refresh","pack","wand"].forEach(function(key,i){var x=95.129707+i*195.355649;img=M.Assets.images.tool;if(img&&img.width)g.drawImage(img,x,1386.436206,161.689358,161.689358);img=M.Assets.images[key];if(img&&img.width)g.drawImage(img,x+40.787179,1411.885,80.115,80.115);});return c;}
  function ensureGameBgCache(){var key=bgCacheKey();if(key===gameBgKey&&gameBgCache)return gameBgCache;gameBgKey=key;gameBgCache=buildGameBgCache();return gameBgCache;}
  function area(x,y,w,h,fn,id){st.taps.push({x:x,y:y,w:w,h:h,fn:fn,id:id});}
  function buildFoodCache(excludeG,excludeS){
    var k=M.Platform&&M.Platform.sdk;
    var c=k?k.createCanvas():(typeof document!=='undefined'?document.createElement('canvas'):null);
    if(!c)return null;
    c.width=VW;c.height=VH;
    var g=c.getContext('2d');
    st.groups.forEach(function(gr,i){
      var count=gr.q.length;
      if(count&&gr.q[0]){gr.q[0].forEach(function(t,j){if(t===null)return;var f=trayFoodPos(i,j);g.save();g.translate(f.x,f.y);g.rotate(f.angle);var img=M.Assets.images['food'+t];if(img&&img.width)g.drawImage(img,-f.w/2,-f.h/2,f.w,f.h);g.restore();});}
      for(var j=0;j<3;j++){var v=gr.a[j];if(v===null||(excludeG===i&&excludeS===j))continue;var f=foodPos(i,j);var img=M.Assets.images['food'+v];if(img&&img.width)g.drawImage(img,f.x,f.y,f.w,f.h);}
    });
    return c;
  }
  function iconButton(n,x,y,w,h,fn,id){image(n,x,y,w,h);area(x,y,w,h,fn,id);}
  function resource(icon,x,value,fn){image(icon,x,80.973501,67.949791,69.648536);text(value,x+105.888424,115.514644,String(value).length>5?19.252441:22.64993,'#29272b');if(fn)area(x,80.973501,172.13947,69.648536,fn,'resource-'+icon);}
  function homeAction(icon,x,y,label,fn,id){
    iconButton(icon,x,y,150.848536,150.848536,fn,id);
    ctx.save();ctx.font='bold 35.158354px "Alibaba PuHuiTi 2.0", "Microsoft YaHei", sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.lineJoin='round';
    var cx=x+75.622455,cy=y+115.797768;
    ctx.strokeStyle='#fff';ctx.lineWidth=9.62622;ctx.strokeText(label,cx,cy);ctx.strokeStyle='#16120e';ctx.lineWidth=5.662483;ctx.strokeText(label,cx,cy);ctx.fillStyle='#fff';ctx.fillText(label,cx,cy);ctx.restore();
  }
  function homeStarCount(){
    var value=String(profile.stars),size=22.64993;ctx.save();ctx.font='bold '+size+'px "Alibaba PuHuiTi 2.0", "Microsoft YaHei", sans-serif';
    var width=ctx.measureText(value).width;if(width>67.949791)size*=67.949791/width;
    text(value,203.849372,113.8159,size,'#000','center');ctx.restore();
  }
  function homeCapsule(x,w,offset,scale){ctx.save();ctx.beginPath();ctx.rect(x,79.274756,w,69.648536);ctx.clip();image('capsule',x+offset,79.048257,w*scale,69.648536*1.0065);ctx.restore();}
  function starWallet(){if(st.ad||st.transition)return;modal('获得星星',[],[blankButton('我要星星',function(){adReward(function(){profile.stars+=100;save();toast('星星 +100');});})]);st.modal.kind='stars';}
  function mysteryModal(){if(st.ad||st.transition)return;modal('获得道具',[],[blankButton('我要道具',function(){adReward(function(){var keys=['refresh','pack','wand'],k=keys[Math.floor(Math.random()*keys.length)];profile.toolStock[k]++;save();toast('获得 '+names[k]+' ×1，已存入道具库存');});})]);st.modal.kind='tools';}
  function firstAddBadge(x,y,line){ctx.save();ctx.fillStyle='rgba(0,0,0,0.8)';rr(x,y,79.501255,54.359833,8.833473);ctx.fill();text('首次添加',x+10.192469,y+16.421199,13.589958,'#fff','left');text(line,x+10.192469,y+35.107392,13.589958,'#fff','left');ctx.restore();}
  function desktopReward(){M.KwaiShare.desktop(function(){if(profile.desktopRewardClaimed){toast('已添加桌面，首次奖励已领取');return;}var before=profile.stars;profile.desktopRewardClaimed=true;profile.stars+=100;if(M.Storage.set('buffet-profile-v1',profile)===false){profile.desktopRewardClaimed=false;profile.stars=before;toast('奖励保存失败，请稍后重试');return;}toast('首次添加桌面，星星 +100');});}
  function drawHome(){
    if(!(M.VideoBackground&&M.VideoBackground.draw(ctx,-2.264993,-5.096234,752.543933,1638.156206)))image('home',-2.264993,-5.096234,752.543933,1638.156206);
    if(M.VideoBackground)M.VideoBackground.play();
    iconButton('settings',22.64993,79.841004,67.949791,67.949791,settings,'settings');
    homeCapsule(148.357043,130.237099,-130.237099*0.342,1.342);image('star',106.454672,79.274756,67.949791,69.648536);
    homeStarCount();area(106.454672,79.274756,140.429568,69.648536,starWallet,'resource-star');
    iconButton('homePlus',246.88424,98.074198,31.936402,32.6159,starWallet,'star-plus');
    homeCapsule(316.532775,164.778243,-164.778243*0.0607,1.0607);
    iconButton('heart',288.220363,79.274756,67.949791,69.648536,energyModal,'resource-heart');text(profile.energy,322.195258,113.8159,String(profile.energy).length>2?16.987448:22.64993,'#000');
    text(energyCountdown(),360.133891,113.8159,22.64993,'#000','left');iconButton('homePlus',449.601116,98.074198,31.936402,32.6159,energyModal,'energy-plus');
    homeCapsule(536.803347,130.237099,-130.237099*0.342,1.342);image('level',494.900976,79.274756,67.949791,69.648536);text('LV:'+profile.level,570.211994,113.8159,22.64993,'#000','left');area(494.900976,79.274756,172.13947,69.648536,help,'resource-level');
    homeAction('homeDaily',22.64993,184.030683,'每日挑战',daily,'daily');
    homeAction('homeDesktop',22.64993,343.372943,'添加桌面',desktopReward,'desktop');if(!profile.desktopRewardClaimed)firstAddBadge(9.399721,339.748954,'星星+100');
    homeAction('homeMystery',574.487169,184.030683,'神秘道具',mysteryModal,'mystery');
    homeAction('homeFavorite',574.487169,343.372943,'设为常用',favorite,'favorite');firstAddBadge(561.491771,339.748954,'体力+5');
    iconButton('start',113.084873,1114.942817,520.711138,200.451883,begin,'start');text('开 始',373.723849,1211.771269,57.523462,'#fff','center','#568126');
    ctx.save();ctx.font='bold 18px "Alibaba PuHuiTi 2.0", "Microsoft YaHei", sans-serif';
    var consentText='点击按钮代表您已同意',policyText='《隐私政策》',gap=5;
    var consentWidth=ctx.measureText(consentText).width,policyWidth=ctx.measureText(policyText).width,totalWidth=consentWidth+gap+policyWidth,startX=(VW-totalWidth)/2;
    text(consentText,startX+consentWidth/2,1497,18,'#fff','center','#421700');
    text(policyText,startX+consentWidth+gap+policyWidth/2,1497,18,'#ffe68a','center','#421700');
    area(startX+consentWidth+gap-8,1478,policyWidth+16,38,privacy,'privacy-link');ctx.restore();
    text('著作权人：北京慕远科技有限公司',373.723849,1534,16,'#fff','center','#421700');
  }
  // 隐私政策会覆盖首页交互元素；滑动时只保留背景，避免每帧重复绘制被遮罩的按钮、文字和图标。
  function drawPrivacyBackground(){
    if(!(M.VideoBackground&&M.VideoBackground.draw(ctx,-2.264993,-5.096234,752.543933,1638.156206)))image('home',-2.264993,-5.096234,752.543933,1638.156206);
  }
  // Figma 3048:81068, refreshed 2026-09-16. Geometry also drives hit tests and effects.
  // Six groups retain the sprite sizes; twelve groups scale the whole rack/tray together.
  function geometry(i){var rows=st.groups.length/3,scale=rows===4?0.8:1,top=rows===2?415.122259:223.1641,step=rows===4?283.124128:383.916318;return {x:-1.410312+i%3*250.20387+249.492521*(1-scale)/2,y:top+Math.floor(i/3)*step,w:249.492521*scale,h:187.550483*Math.min(1,scale),scale:scale};}
  function foodPos(i,j){var p=geometry(i),s=p.scale;return {x:p.x+(21.229001+j*71.177406)*s,y:p.y+18.70318*s,w:63.794661*s,h:149.733593*s};}
  function trayFoodPos(i,j){var p=geometry(i),s=p.scale;return {x:p.x+(61.731819+j*56.311124)*s,y:p.y+227.780722*s,w:35.819732*s,h:90.752608*s,angle:20.1934*Math.PI/180};}
  function drawTrayFood(type,i,j,alpha){var f=trayFoodPos(i,j);ctx.save();ctx.globalAlpha=alpha;ctx.translate(f.x,f.y);ctx.rotate(f.angle);food(type,{x:-f.w/2,y:-f.h/2,w:f.w,h:f.h});ctx.restore();}
  function food(t,p){image('food'+t,p.x,p.y,p.w,p.h);}
  function dragFood(type,p){
    var outline=M.Assets.dragOutlines&&M.Assets.dragOutlines[type];
    if(outline){var padX=p.w*outline.pad/outline.w,padY=p.h*outline.pad/outline.h;ctx.drawImage(outline.canvas,p.x-padX,p.y-padY,p.w+padX*2,p.h+padY*2);}
    else food(type,p);
  }
  function drawDragPreview(){
    var d=st.drag;if(!d||!d.target)return;
    var h=d.target;if(st.groups[h.group].a[h.slot]!==null)return;
    ctx.save();ctx.globalAlpha=0.38;food(d.type,foodPos(h.group,h.slot));ctx.restore();
  }
  function refreshFoods(groups){
    var items=[];groups.forEach(function(g,i){g.a.forEach(function(type,j){if(type!==null){var f=foodPos(i,j);items.push({type:type,x:f.x+f.w/2,y:f.y+f.h/2,w:f.w,h:f.h,angle:0});}});if(g.q[0])g.q[0].forEach(function(type,j){var f=trayFoodPos(i,j);items.push({type:type,x:f.x,y:f.y,w:f.w,h:f.h,angle:f.angle});});});return items;
  }
  function drawRefresh(s){
    var t=s.t,first=geometry(0),last=geometry(st.groups.length-1),cx=373.723849,cy=(first.y+last.y+316.569582*last.scale)/2;
    function smooth(v){v=Math.max(0,Math.min(1,v));return v*v*(3-2*v);}
    function layer(groups,incoming,alpha){
      if(alpha<=0)return;var spread=incoming?smooth((t-0.6)/0.4):1-smooth(t/0.4),size=0.55+0.45*spread;
      refreshFoods(groups).forEach(function(f){var dx=(f.x-cx)*spread,dy=(f.y-cy)*spread;
        ctx.save();ctx.globalAlpha=alpha;ctx.translate(cx+dx,cy+dy);ctx.rotate(f.angle);
        food(f.type,{x:-f.w*size/2,y:-f.h*size/2,w:f.w*size,h:f.h*size});ctx.restore();
      });
    }
    // Only visible plates fly; hidden inventory changes behind the central overlap.
    var mix=smooth((t-0.45)/0.10);layer(s.before,false,1-mix);layer(s.after,true,mix);
    var glow=Math.sin(Math.PI*t);ctx.save();ctx.translate(cx,cy);ctx.rotate(2*Math.PI*t);
    ctx.globalAlpha=glow;image('refreshGlow',-509.623431,-509.623431,1019.246862,1019.246862);
    ctx.globalAlpha=Math.min(1,glow*2);image('refresh',-73.612273,-73.612273,147.224547,147.224547);ctx.restore();
  }
  // One empty box; front lip masks arriving plates so they actually enter it.
  function packPicked(stage,group,slot,layer){return stage&&stage.kind==='pack'&&stage.t>=0.14&&stage.items.some(function(f){return f.group===group&&f.slot===slot&&f.layer===layer;});}
  function packSpring(t){t=Math.max(0,Math.min(1,t));var z=t-1;return 1+2.15*z*z*z+1.15*z*z;}
  function drawPack(s){
    var t=s.t,cx=373.723849,cy=787.085077,size=317.099024,pop=packSpring(t/0.22),out=Math.max(0,Math.min(1,(t-0.76)/0.24));
    var scale=pop*(out>0?packSpring(1-out):1),bounce=1+0.055*Math.sin(Math.max(0,Math.min(1,(t-0.55)/0.21))*Math.PI);
    scale*=bounce;var w=size*scale,h=w,by=cy-h/2+15.854951*Math.sin(out*Math.PI),bx=cx-w/2,mouthY=by+h*0.225,frontSplit=0.31;
    ctx.save();ctx.globalAlpha=Math.min(1,t/0.08);image('packEmpty',bx,by,w,h);ctx.restore();
    if(t>=0.14)s.items.forEach(function(f,j){
      var p=f.layer<0?foodPos(f.group,f.slot):trayFoodPos(f.group,f.slot),sx=f.layer<0?p.x+p.w/2:p.x,sy=f.layer<0?p.y+p.h/2:p.y;
      var local=Math.max(0,Math.min(1,(t-0.14-j*0.035)/0.27)),ease=packSpring(local),tx=cx+(j-1)*65.11855,ty=mouthY-42;
      var enter=packSpring((t-0.49)/0.22),x=sx+(tx-sx)*ease-(j-1)*19.818689*enter,y=sy+(ty-sy)*ease-39.637378*Math.sin(local*Math.PI)+42*enter;
      var itemW=p.w+(84.937238-p.w)*ease,itemH=p.h+(200.032859-p.h)*ease,itemScale=out>0?scale:1;
      if(out>0){x=cx+(x-cx)*scale;y=mouthY+(y-mouthY)*scale+15.854951*Math.sin(out*Math.PI);}
      ctx.save();
      // Hide the inserted portion behind the front panel, including transparent corners.
      if(t>=0.49){ctx.beginPath();ctx.rect(0,0,VW,by+h*frontSplit);ctx.clip();}
      ctx.globalAlpha=f.layer>0?Math.min(1,local*5):1;ctx.translate(x,y);ctx.rotate((p.angle||0)*(1-ease)+(j-1)*18*Math.PI/180*ease);
      food(f.type,{x:-itemW*itemScale/2,y:-itemH*itemScale/2,w:itemW*itemScale,h:itemH*itemScale});ctx.restore();
    });
    var img=M.Assets.images.packEmpty;
    if(img&&w>0){ctx.drawImage(img,0,img.height*frontSplit,img.width,img.height*(1-frontSplit),bx,by+h*frontSplit,w,h*(1-frontSplit));}
    if(t>=0.49){var fxTime=(t-0.49)/0.51,frame=Math.min(16,Math.floor(fxTime*17)),fx=351.073919*(1+0.08*Math.sin(fxTime*Math.PI));ctx.save();ctx.globalAlpha=Math.min(1,fxTime/0.12)*Math.min(1,(1-fxTime)/0.16);image('clearFrame'+frame,cx-fx/2,mouthY-fx/2,fx,fx);ctx.globalAlpha*=0.3;image('clearFrame'+frame,cx-fx*0.58,mouthY-fx*0.58,fx*1.16,fx*1.16);ctx.restore();}
    if(t>=0.55&&t<0.9){var life=(t-0.55)/0.35;ctx.save();ctx.globalAlpha=Math.sin(Math.PI*life);for(var k=0;k<6;k++){var angle=k*Math.PI/3,dist=101.924686+36.806137*packSpring(life),spark=19.252441*Math.sin(Math.PI*life);image('star',cx+Math.cos(angle)*dist-spark/2,mouthY+Math.sin(angle)*dist-spark/2,spark,spark);}ctx.restore();}
  }
  function wandPhase(stage,index){return Math.max(0,Math.min(1,(stage.t-0.25-index*0.014)/0.47));}
  function wandPicked(stage,group,slot){if(!stage||stage.kind!=='wand')return false;for(var i=0;i<stage.selected.length;i++)if(stage.selected[i][0]===group&&stage.selected[i][1]===slot)return wandPhase(stage,i)<1;return false;}
  function drawWand(s){
    var t=s.t,cx=373.723849,cy=787.085077,pop=packSpring(t/0.18),out=Math.max(0,Math.min(1,(t-0.78)/0.22)),wandScale=pop*packSpring(1-out);
    // A broad flash hides the exact inventory switch used by the safe fallback.
    var flash=Math.max(0,1-Math.abs(t-0.56)/0.18);ctx.save();ctx.globalAlpha=0.40*flash;ctx.fillStyle='#ffd95d';ctx.fillRect(0,186.861925,VW,1126.834031);ctx.restore();
    (s.selected||[]).forEach(function(item,index){
      var p=foodPos(item[0],item[1]),phase=wandPhase(s,index),shrink=Math.max(0,Math.min(1,(phase-0.35)/0.23)),oldScale=phase<0.35?1+0.30*Math.sin(phase/0.35*Math.PI):phase<0.58?1-shrink*shrink*(3-2*shrink):0;
      var newProgress=Math.max(0,Math.min(1,(phase-0.52)/0.48)),newScale=phase<0.52?0:packSpring(newProgress)+0.18*Math.sin(Math.PI*newProgress);
      ctx.save();ctx.translate(p.x+p.w/2,p.y+p.h/2);var halo=Math.sin(Math.PI*Math.min(1,phase/0.82));ctx.globalAlpha=0.85*halo;ctx.strokeStyle='#fff177';ctx.lineWidth=6.794979;ctx.beginPath();ctx.arc(0,0,Math.max(p.w,p.h)*0.57*(1+0.18*halo),0,Math.PI*2);ctx.stroke();if(oldScale>0){ctx.globalAlpha=0.92*Math.sin(Math.PI*Math.min(1,phase/0.58));food(item[2],{x:-p.w*oldScale/2,y:-p.h*oldScale/2,w:p.w*oldScale,h:p.h*oldScale});ctx.globalCompositeOperation='source-over';ctx.globalAlpha=1;food(item[2],{x:-p.w*oldScale/2,y:-p.h*oldScale/2,w:p.w*oldScale,h:p.h*oldScale});}if(newScale>0&&phase<1){var nr={x:-p.w*newScale/2,y:-p.h*newScale/2,w:p.w*newScale,h:p.h*newScale};ctx.globalAlpha=1;food(s.type,nr);ctx.globalAlpha=0.78*Math.sin(Math.PI*newProgress);food(s.type,nr);}ctx.restore();
      if(phase>=0.38&&phase<1){var fxLife=(phase-0.38)/0.62,frame=Math.min(16,Math.floor(fxLife*17)),fx=206.680614*(1+0.16*Math.sin(fxLife*Math.PI));ctx.save();ctx.globalAlpha=Math.min(1,1.35*Math.sin(Math.PI*fxLife));image('clearFrame'+frame,p.x+p.w/2-fx/2,p.y+p.h/2-fx/2,fx,fx);ctx.restore();}
    });
    ctx.save();ctx.translate(cx,cy);ctx.rotate((-0.16+0.32*Math.sin(Math.min(1,t/0.72)*Math.PI*2))*Math.sin(Math.PI*Math.min(1,t/0.78)));ctx.globalAlpha=Math.min(1,t/0.08);var ww=305.774059*wandScale,wh=305.774059*wandScale;image('wand',-ww/2,-wh/2,ww,wh);ctx.globalAlpha=0.58*Math.sin(Math.PI*Math.min(1,t/0.78));image('wand',-ww*0.58,-wh*0.58,ww*1.16,wh*1.16);ctx.restore();
  }
  function drawFoodAnimation(s){
    if(!s)return;if(s.kind==='wand'){drawWand(s);return;}if(s.kind==='pack'){drawPack(s);return;}if(s.kind==='refresh'){drawRefresh(s);return;}var t=s.t,u=1-Math.pow(1-t,3),i,j,a,b,p,v;
    if(s.kind==='move'){
      var m=s.motion;b=foodPos(m.to,m.dest);var grow=1+0.22*Math.sin(Math.min(1,t/0.82)*Math.PI),settle=Math.min(1,t/0.82);
      dragFood(m.type,{x:m.startX+(b.x-m.startX)*u+b.w*(1-grow)/2,y:m.startY+(b.y-m.startY)*u+b.h*(1-grow)/2,w:b.w*grow,h:b.h*grow});return;
    }
    if(s.kind==='clear'){
      b=foodPos(s.group,1);var converge=Math.min(1,t/0.15);converge=converge*converge*(3-2*converge);
      var fade=Math.max(0,Math.min(1,(t-0.31)/0.18)),scale=t<0.31?1+0.12*Math.sin(t/0.31*Math.PI):1-fade*0.9;
      s.before[s.group].a.forEach(function(type,j){
        a=foodPos(s.group,j);ctx.save();ctx.globalAlpha=1-fade;
        food(type,{x:a.x+(b.x-a.x)*converge+b.w*(1-scale)/2,y:b.y+b.h*(1-scale)/2,w:b.w*scale,h:b.h*scale});ctx.restore();
      });
      if(t>=0.31){var frame=Math.min(16,Math.floor((t-0.31)/0.69*17)),cx=b.x+b.w/2,cy=b.y+b.h/2,fx=294.449093,fadeFx=Math.min(1,(t-0.31)/0.12)*Math.max(0,1-(t-0.84)/0.16);image('clearFrame'+frame,cx-fx/2,cy-fx/2,fx,fx);ctx.save();ctx.globalAlpha=0.34*fadeFx;var overlay=fx*1.16;image('clearFrame'+frame,cx-overlay/2,cy-overlay/2,overlay,overlay);ctx.restore();}return;
    }
    if(s.kind==='refill'){
      p=geometry(s.group);var layer=s.before[s.group].q[0]||[];
      layer.forEach(function(type,j){
        var local=Math.max(0,Math.min(1,t)),up=local;
        b=foodPos(s.group,j);
        var source=trayFoodPos(s.group,j),x=source.x,y=source.y;
        var w=source.w+(b.w-source.w)*up,h=source.h+(b.h-source.h)*up;
        ctx.save();ctx.translate(x+(b.x+b.w/2-x)*up,y+(b.y+b.h/2-y)*up);ctx.rotate(source.angle*(1-up));
        var rect={x:-w/2,y:-h/2,w:w,h:h};food(type,rect);ctx.restore();
      });
    }
  }
  function drawBoard(g,i){var anim=groupAnimationStage(i),active=anim&&anim.group===i,p=geometry(i),s=p.scale,count=g.q.length,hintSet=st.hint.length?new Set(st.hint.map(function(h){return h[0]*3+h[1];})):null;if(count){if(!(anim&&anim.kind==='refresh')&&!(active&&anim.kind==='refill'))g.q[0].forEach(function(t,j){if(!packPicked(anim,i,j,0))drawTrayFood(t,i,j,1);});if(active&&anim.kind==='refill'&&g.q[1]){var reveal=Math.max(0,Math.min(1,(anim.t*anim.duration-(anim.duration-0.26))/0.26));g.q[1].forEach(function(t,j){drawTrayFood(t,i,j,reveal);});}}

    for(var j=0;j<3;j++){var f=foodPos(i,j),v=g.a[j],glow=!st.drag&&hintSet&&hintSet.has(i*3+j);if(glow){ctx.save();ctx.fillStyle='rgba(255,239,92,0.35)';ctx.strokeStyle='#fff48a';ctx.lineWidth=2.831241;ctx.fillRect(f.x-2.831241,f.y-2.831241,f.w+5.662483,f.h+5.662483);ctx.strokeRect(f.x-2.831241,f.y-2.831241,f.w+5.662483,f.h+5.662483);ctx.restore();}if(v!==null&&!wandPicked(anim,i,j)&&!packPicked(anim,i,j,-1)&&!(anim&&anim.kind==='refresh')&&!(st.drag&&st.drag.from===i&&st.drag.slot===j)&&!(active&&anim.kind==='clear')&&!(anim&&anim.kind==='move'&&anim.motion.from===i&&anim.motion.slot===j))food(v,f);}

  }
  function drawTools(){['refresh','pack','wand'].forEach(function(k,i){var x=95.129707+i*195.355649;area(x,1386.436206,161.689358,161.689358,function(){useTool(k);},'tool-'+k);text(k==='wand'?'变换':names[k],x+80.843264,1508.887392,28.795989,'#fff','center','#b96b25');if(profile.toolStock[k]>0){text(profile.toolStock[k],x+137.032078,1407.693166,36.239888,'#fff','center','#421700');area(x+107.587169,1377.11576,58.858109,61.154812,function(){useTool(k);},'stock-'+k);}else{image('plus',x+107.587169,1377.11576,58.858109,61.154812);area(x+107.587169,1377.11576,58.858109,61.154812,function(){toolModal(k);},'plus-'+k);}});}
  function drawStarFlights(){st.starFlights.forEach(function(f){var t=1-f.life/0.55;t=Math.max(0,Math.min(1,t));var ease=t*t*(3-2*t),x=f.x+(211.2106-f.x)*ease,y=f.y+(115.514644-f.y)*ease,scale=1.38-0.62*t;ctx.save();ctx.globalAlpha=Math.min(1,(1-t)*3);image('star',x-35.107392*scale,y-35.107392*scale,70.214784*scale,70.214784*scale);ctx.restore();});}
  function drawTutorial(){var guide=st.tutorial;if(!guide||guide.step!=='drag'||st.modal)return;var m=guide.move,from=foodPos(m.from,m.slot),to=foodPos(m.to,m.dest),now=M._now(),pulse=0.5+0.5*Math.sin(now/180),phase=(now%2200)/2200,grab=phase<0.15?phase/0.15:1,travel=phase<0.15?0:Math.min(1,(phase-0.15)/0.55),drop=phase>0.85?(phase-0.85)/0.15:0,ease=travel*travel*(3-2*travel),sx=from.x+from.w/2,sy=from.y+from.h/2,tx=to.x+to.w/2,ty=to.y+to.h/2,hand=M.Assets.images.tutorialHand;ctx.save();ctx.globalAlpha=1;ctx.lineWidth=5.662483+2.831241*pulse;ctx.strokeStyle='#fff36b';ctx.strokeRect(from.x-5.662483,from.y-5.662483,from.w+11.324965,from.h+11.324965);ctx.strokeStyle='#8fff66';ctx.strokeRect(to.x-5.662483,to.y-5.662483,to.w+11.324965,to.h+11.324965);ctx.globalAlpha=Math.max(0.3,1-travel*0.5);food(m.type,from);ctx.globalAlpha=1;var fx=sx+(tx-sx)*ease,fy=sy+(ty-sy)*ease-30*Math.sin(travel*Math.PI);if(travel>0&&travel<1){ctx.globalAlpha=Math.max(0.4,1-travel*0.3);food(m.type,{x:fx-from.w/2,y:fy-from.h/2,w:from.w,h:from.h});ctx.globalAlpha=1;}if(drop>0){ctx.globalAlpha=drop;food(m.type,to);ctx.globalAlpha=1;}var handX=fx+34,handY=fy+34-12*grab;if(phase>0.85){handY+=drop*20;}if(hand){var hw=112,hh=112;ctx.translate(handX,handY);ctx.rotate(-0.12+0.08*Math.sin(now/240));ctx.drawImage(hand,-hw/2,-hh/2,hw,hh);}else{text('☝',handX,handY,49.829847,'#fff5c8','center','#7a421e');}ctx.restore();}
  function drawGame(){var cache=ensureGameBgCache();if(cache){ctx.drawImage(cache,0,0,VW,VH);}else{image('game',-0.566248,-2.264993,749.146444,1628.529986);}area(22.083682,81.539749,67.949791,67.949791,settings,'settings');area(99.659693,80.407252,67.949791,70.781032,function(){modal('休息一下',['计时已暂停'],[blankButton('继续游戏',close)],false);},'pause');resource('star',177.235704,starBalance());resource('timer',359.001395,st.level.duration?formatTime(st.time):'∞');resource('level',540.767085,'LV:'+st.level.number);if(st.combo>1&&st.comboLeft>0){text(st.combo+' 连击',373.723849,175.53696,27.746165,'#fff6a4','center','#91501b');box(260.474198,198.18689,226.499303,8.493724,'#b88a58');box(260.474198,198.18689,226.499303*st.comboLeft/C.comboWindow,8.493724,'#ffd35b');}var noAnim=!st.pending&&!st.animations.length;if(noAnim&&!st.drag&&!foodCache)foodCache=buildFoodCache();if(foodCache&&(noAnim||st.drag)){ctx.drawImage(foodCache,0,0,VW,VH);}else{visibleGroups().forEach(drawBoard);}drawTools();st.effects.forEach(function(e){var p=e.group<0?{x:249.149233,y:679.497908,w:249.149233,scale:1}:geometry(e.group);ctx.save();ctx.globalAlpha=Math.min(1,e.life*2);text(e.label,p.x+p.w/2,p.y+56.624826*p.scale-(1-e.life)*79.274756,39.637378,'#fff070','center','#7b391b');ctx.restore();});animationJobs().forEach(function(job){drawFoodAnimation(animationStage(job));});drawStarFlights();drawDragPreview();if(st.drag){var dragSize=foodPos(st.drag.from,st.drag.slot);dragFood(st.drag.type,{x:st.drag.x,y:st.drag.y,w:dragSize.w,h:dragSize.h});}if(st.idle>3&&!st.modal&&!st.groups.some(function(g){return g.a.indexOf(null)>=0;}))text('没有空位，用刷新排列',373.723849,1319.358438,22.64993,'#673c21');drawTutorial();}
  function drawDailyModal(){
    var d=profile.dailyChallenge;st.taps=[];ctx.fillStyle='rgba(0,0,0,0.6)';ctx.fillRect(-CONTENT_X,0,VW,VH);
    ctx.save();ctx.beginPath();ctx.rect(38.504881,785.386332,670.437936,320.496513);ctx.clip();image('energyPanel',38.504881,785.386332-320.496513*1.3463,670.437936,320.496513*2.3463);ctx.restore();
    ctx.save();ctx.beginPath();ctx.rect(38.504881,554.357043,670.437936,285.95537);ctx.clip();image('energyPanel',38.504881,554.357043,670.437936,285.95537*2.6297);ctx.restore();
    image('dailyChest',256.51046,648.354254,234.426778,234.426778);image('energyTitle',137.598326,518.683403,472.251046,169.36995);
    var gold=ctx.createLinearGradient(0,577.573222,0,622.873082);gold.addColorStop(0,'#fdf3a8');gold.addColorStop(1,'#fed41a');text('每日挑战',373.723849,600.223152,45.299861,gold,'center','#421700');
    iconButton('energyClose',605.319386,584.934449,89.467225,89.467225,close,'modal-close');
    if(d.status==='locked'){
      text('每日挑战',373.723849,917.322176,36.239888,'#725137');text('可通过观看广告获得',373.723849,968.284519,36.239888,'#725137');
      iconButton('start',113.249651,1114.942817,520.711138,200.451883,dailyUnlock,'daily-unlock');image('energyTv',200.451883,1171.001395,74.74477,74.74477);text('我要挑战',292.1841,1211.771269,57.523462,'#fff','left','#026a30');
    }else if(d.status==='completed'){text('今日挑战已完成',373.723849,917.322176,36.239888,'#725137');text('奖励已发放',373.723849,968.284519,36.239888,'#725137');}
    else{
      text(d.type==='level'?'通关第'+d.target+'关':'再通关'+(d.target-d.progress)+'次',373.723849,917.322176,36.239888,'#725137');
      text('额外获得',373.723849,968.284519,36.239888,'#725137','right');text('+'+d.reward,373.723849,968.284519,36.239888,'#df0b0b','left');text('星星',464.32357,968.284519,36.239888,'#725137','left');
    }
  }
 function drawSettingsModal(){
   st.taps=[];ctx.fillStyle='rgba(0,0,0,0.6)';ctx.fillRect(-CONTENT_X,0,VW,VH);
    ctx.save();ctx.beginPath();ctx.rect(38.504881,785.386332,670.437936,320.496513);ctx.clip();image('energyPanel',38.504881,785.386332-320.496513*1.3463,670.437936,320.496513*2.3463);ctx.restore();
    ctx.save();ctx.beginPath();ctx.rect(38.504881,554.357043,670.437936,285.95537);ctx.clip();image('energyPanel',38.504881,554.357043,670.437936,285.95537*2.6297);ctx.restore();
    image('energyTitle',137.598326,518.683403,472.251046,169.36995);var gold=ctx.createLinearGradient(0,577.573222,0,622.873082);gold.addColorStop(0,'#fdf3a8');gold.addColorStop(1,'#fed41a');text('设 置',373.723849,600.223152,45.299861,gold,'center','#421700');
    iconButton('energyClose',605.319386,584.934449,89.467225,89.467225,close,'modal-close');
    [['musicEnabled','settingMusic','音乐'],['soundEnabled','settingSound','音效'],['vibrationEnabled','settingVibration','震动']].forEach(function(row,i){
      var y=689.124128+i*105.888424,v=i===2;image(row[1],v?135.899582:141.562064,y+(v?1.698745:7.361227),v?79.274756:67.949791,v?79.274756:67.949791);text(row[2],274.188731,y+41.336123,40.998639,'#725137');
     iconButton(profile[row[0]]?'toggleOn':'toggleOff',452.998605,y,165.344491,82.672245,function(){toggleSetting(row[0]);},'setting-'+row[0]);
   });
 }
 function drawRunSettingsModal(){
    var exit=st.modal.kind==='exitConfirm',top=exit?522.080893:497.165969,by=exit?782.555091:686.292887,bh=exit?355.603905:476.214784,factor=exit?1.1146:0.5791;
    st.taps=[];ctx.fillStyle='rgba(0,0,0,0.6)';ctx.fillRect(-CONTENT_X,0,VW,VH);
    ctx.save();ctx.beginPath();ctx.rect(38.504881,by,670.437936,bh);ctx.clip();image('energyPanel',38.504881,by-bh*factor,670.437936,bh*(1+factor));ctx.restore();
    ctx.save();ctx.beginPath();ctx.rect(38.504881,top,670.437936,285.95537);ctx.clip();image('energyPanel',38.504881,top,670.437936,285.95537*2.6297);ctx.restore();
    image('energyTitle',137.598326,top-35.67364,472.251046,169.36995);var gold=ctx.createLinearGradient(0,top+23.216179,0,top+68.516039);gold.addColorStop(0,'#fdf3a8');gold.addColorStop(1,'#fed41a');text(exit?'返 回 首 页':'设 置',373.723849,top+45.866109,45.299861,gold,'center','#421700');
    if(exit){image('exitProgress',238.956764,624.005579,269.53417,269.53417);text('返回会损失当前进度和星星',373.723849,906.563459,36.239888,'#725137');}
    else [['musicEnabled','settingMusic','音乐'],['soundEnabled','settingSound','音效'],['vibrationEnabled','settingVibration','震动']].forEach(function(row,i){
      var y=631.933054+i*105.888424,v=i===2;image(row[1],v?135.899582:141.562064,y+(v?1.698745:7.361227),v?79.274756:67.949791,v?79.274756:67.949791);text(row[2],274.188731,y+41.336123,40.998639,'#725137');
      iconButton(profile[row[0]]?'toggleOn':'toggleOff',452.998605,y,165.344491,82.672245,function(){toggleSetting(row[0]);},'setting-'+row[0]);
    });
    var y=exit?942.803347:955.827057;iconButton('returnButton',108.719665,y,265.145746,102.023213,exit?quit:confirmQuit,'run-home');text(exit?'主 页':'返回主页',241.292538,y+51.011607,29.275035,'#fff','center','#8b3900');
    iconButton('start',373.723849,y,265.145746,102.023213,close,'run-continue');text('继续本局',506.296722,y+51.011607,29.275035,'#fff','center','#026a30');
  }
  function drawWinModal(){
    st.taps=[];ctx.fillStyle='rgba(0,0,0,0.6)';ctx.fillRect(-CONTENT_X,0,VW,VH);
    ctx.save();ctx.beginPath();ctx.rect(38.504881,740.65272,670.437936,372.591353);ctx.clip();image('energyPanel',38.504881,740.65272-372.591353*1.0182,670.437936,372.591353*2.0182);ctx.restore();
    ctx.save();ctx.beginPath();ctx.rect(38.504881,519.8159,670.437936,285.95537);ctx.clip();image('energyPanel',38.504881,519.8159,670.437936,285.95537*2.6297);ctx.restore();
    image('winChef',232.728033,291.617852,281.991632,281.991632);image('energyTitle',137.598326,484.142259,472.251046,169.36995);
    var gold=ctx.createLinearGradient(0,543.032078,0,588.331939);gold.addColorStop(0,'#fdf3a8');gold.addColorStop(1,'#fed41a');text('全部收盘',373.723849,565.682008,45.299861,gold,'center','#421700');
    image('star',163.515509,658.546722,84.30757,86.762823);
    ctx.save();ctx.beginPath();ctx.rect(286.940642,658.546722,151.334377,86.662031);ctx.clip();image('winCombo',286.940642-151.334377*0.0852,658.546722,151.334377*1.1478,86.662031*1.0002);ctx.restore();
    image('winClear',483.009763,655.149233,93.430962,93.430962);
    text('+'+st.stars,205.893529,770.097629,29.741623,'#725137');text('X'+st.maxCombo,361.119163,770.097629,29.741623,'#725137');text('消除'+st.clears+'组',530.08198,770.097629,st.clears>=100?26.04742:29.741623,'#725137');
    text('恭喜过关，真的太厉害啦！',373.723849,862.396095,36.239888,'#725137');
    iconButton('returnButton',108.719665,916.189679,265.145746,102.023213,function(){winPlay(false);},'win-replay');text('重玩本关',241.292538,963.754533,29.275035,'#fff','center','#8b3900');
    iconButton('start',373.585119,916.189679,265.145746,102.023213,function(){winPlay(true);},'win-next');text(st.level.number>=M.LEVELS.length?'返回首页':'下一关',506.157992,963.754533,29.275035,'#fff','center','#026a30');
  }
  function drawToolPurchaseModal(){
    var m=st.modal,k=m.tool,title={refresh:'刷 新',pack:'打 包',wand:'变 换'}[k];
    st.taps=[];ctx.fillStyle='rgba(0,0,0,0.6)';ctx.fillRect(-CONTENT_X,0,VW,VH);
    ctx.save();ctx.beginPath();ctx.rect(38.504881,782.555091,670.437936,355.603905);ctx.clip();image('energyPanel',38.504881,782.555091-355.603905*1.1146,670.437936,355.603905*2.1146);ctx.restore();
    ctx.save();ctx.beginPath();ctx.rect(38.504881,522.080893,670.437936,285.95537);ctx.clip();image('energyPanel',38.504881,522.080893,670.437936,285.95537*2.6297);ctx.restore();
    image('energyTitle',137.598326,486.407252,472.251046,169.36995);var gold=ctx.createLinearGradient(0,545.297071,0,590.596932);gold.addColorStop(0,'#fdf3a8');gold.addColorStop(1,'#fed41a');text(title,373.723849,k==='pack'?566.814505:567.947001,45.299861,gold,'center','#421700');
    image({refresh:'toolRefresh',pack:'rewardPack',wand:'rewardWand'}[k],294.449093,633.065551,158.549512,158.549512);
    iconButton('energyClose',605.319386,546.429568,89.467225,89.467225,close,'modal-close');
    text('支付'+C.prices[k]+'星星购买',373.723849,832.384937,36.239888,'#725137');text('或观看广告解锁',373.723849,883.34728,36.239888,'#725137');
    iconButton('returnButton',108.719665,942.803347,265.145746,102.023213,m.buttons[1].fn,'tool-pay');text('使用星星',241.292538,990.368201,29.275035,'#fff','center','#8b3900');
    iconButton('start',373.723849,942.803347,265.145746,102.023213,m.buttons[0].fn,'tool-ad');image('energyTv',419.02371,969.983264,40.769874,40.769874);text('观看广告',527.177127,990.368201,29.275035,'#fff','center','#026a30');
  }
  function drawTimeupModal(){
    var m=st.modal,over=m.gameOver;
    st.taps=[];ctx.fillStyle='rgba(0,0,0,0.6)';ctx.fillRect(-CONTENT_X,0,VW,VH);
    ctx.save();ctx.beginPath();ctx.rect(38.504881,782.555091,670.437936,355.603905);ctx.clip();image('energyPanel',38.504881,782.555091-355.603905*1.1146,670.437936,355.603905*2.1146);ctx.restore();
    ctx.save();ctx.beginPath();ctx.rect(38.504881,522.080893,670.437936,285.95537);ctx.clip();image('energyPanel',38.504881,522.080893,670.437936,285.95537*2.6297);ctx.restore();
    image('energyTitle',137.598326,486.407252,472.251046,169.36995);var gold=ctx.createLinearGradient(0,545.297071,0,590.596932);gold.addColorStop(0,'#fdf3a8');gold.addColorStop(1,'#fed41a');text(over?'游 戏 结 束':'时 间 到 了',373.723849,567.947001,45.299861,gold,'center','#421700');
    image('timer',294.449093,633.065551,158.549512,158.549512);
    if(over){text('时间已到，本局结束',373.723849,832.384937,36.239888,'#725137');text('返回首页重新挑战',373.723849,883.34728,36.239888,'#725137');iconButton('start',241.292538,942.803347,265.145746,102.023213,m.buttons[0].fn,'timeup-home');text('返回首页',373.723849,990.368201,29.275035,'#fff','center','#026a30');}
    else{text('观看广告复活 +180秒',373.723849,832.384937,36.239888,'#725137');text('或重新开始本局',373.723849,883.34728,36.239888,'#725137');iconButton('returnButton',108.719665,942.803347,265.145746,102.023213,m.buttons[1].fn,'timeup-restart');text('重新开始',241.292538,990.368201,29.275035,'#fff','center','#8b3900');iconButton('start',373.723849,942.803347,265.145746,102.023213,m.buttons[0].fn,'timeup-revive');image('energyTv',419.02371,969.983264,40.769874,40.769874);text('广告复活',527.177127,990.368201,29.275035,'#fff','center','#026a30');}
  }
  function drawEnergyModal(){
    var stars=st.modal.kind==='stars',tools=st.modal.kind==='tools';
    st.taps=[];ctx.fillStyle='rgba(0,0,0,0.6)';ctx.fillRect(-CONTENT_X,0,VW,VH);
    // Figma uses overlapping top/bottom crops of the original panel, not a stretched frame.
    ctx.save();ctx.beginPath();ctx.rect(38.504881,785.386332,670.437936,320.496513);ctx.clip();image('energyPanel',38.504881,785.386332-320.496513*1.3463,670.437936,320.496513*2.3463);ctx.restore();
    ctx.save();ctx.beginPath();ctx.rect(38.504881,554.357043,670.437936,285.95537);ctx.clip();image('energyPanel',38.504881,554.357043,670.437936,285.95537*2.6297);ctx.restore();
    if(tools){
      image('refresh',145.567003,682.936302,155,155);image('pack',296.671003,682.936302,155,155);image('wand',447.446003,682.936302,155,155);
      text('从刷新、打包、变换道具中',373.723849,917.322176,36.239888,'#725137');
      text('随机获得',373.723849,968.284519,36.239888,'#725137','right');text('1个',373.723849,968.284519,36.239888,'#df0b0b','left');text('道具',446.203626,968.284519,36.239888,'#725137','left');
    }else{
      image(stars?'rewardStars':'energyHearts',235.559275,627.403068,276.329149,276.329149);
      text('观看广告可获得',373.723849,917.322176,36.239888,'#725137');
      text(stars?'星星':'体力',stars?353.338912:370.32636,968.284519,36.239888,'#725137','right');text(stars?'+100':'+1',stars?353.338912:370.32636,968.284519,36.239888,'#df0b0b','left');
    }
    image('energyTitle',137.598326,518.683403,472.251046,169.36995);
    var gold=ctx.createLinearGradient(0,577.573222,0,622.873082);gold.addColorStop(0,'#fdf3a8');gold.addColorStop(1,'#fed41a');
    text(tools?'获 得 道 具':stars?'获 得 星 星':'获 得 体 力',373.723849,600.223152,45.299861,gold,'center','#421700');
    iconButton('energyClose',605.319386,584.934449,89.467225,89.467225,close,'modal-close');
    iconButton('start',113.249651,1114.942817,520.711138,200.451883,st.modal.buttons[0].fn,'modal-button-0');
    image('energyTv',200.451883,1171.001395,74.74477,74.74477);text(tools?'我要道具':stars?'我要星星':'我要体力',292.1841,1211.771269,57.523462,'#fff','left','#026a30');
  }
  function fittedText(value,x,y,size,width,color,outline){ctx.font='bold '+size+'px "Alibaba PuHuiTi 2.0", "Microsoft YaHei", sans-serif';var measured=ctx.measureText(String(value)).width;text(value,x,y,measured>width?size*width/measured:size,color,'center',outline);}
  function drawStandardModal(m){
    st.taps=[];ctx.fillStyle='rgba(0,0,0,0.6)';ctx.fillRect(-CONTENT_X,0,VW,VH);
    var icons={'欢迎来到自助餐厅':'winChef','完成得很好！':'winChef','怎么玩':'food0','下次一定能收完':'exitProgress','时间到了':'timer','休息一下':'moon','设为常用':'homeFavorite','部分素材加载失败':'settings'};
    var icon=m.icon||icons[m.title]||'star',lines=[],size=27.179916;
    ctx.font='bold '+size+'px "Alibaba PuHuiTi 2.0", "Microsoft YaHei", sans-serif';
    (m.lines||[]).forEach(function(line){var part='';Array.from(line).forEach(function(ch){if(part&&ctx.measureText(part+ch).width>520.948396){lines.push(part);part=ch;}else part+=ch;});lines.push(part);});
    var buttons=m.buttons||[],buttonY=Math.max(942.803347,808.036262+lines.length*40.769874+28.312413),buttonW=buttons.length===1?430.348675:265.145746,buttonH=buttonW*778/2021,bottom=Math.max(1138.158996,buttonY+(buttons.length?buttonH:0)+90.599721),bh=bottom-782.555091,full=751.977685;
    ctx.save();ctx.beginPath();ctx.rect(38.504881,782.555091,670.437936,bh);ctx.clip();image('energyPanel',38.504881,bottom-full,670.437936,full);ctx.restore();
    ctx.save();ctx.beginPath();ctx.rect(38.504881,522.080893,670.437936,285.95537);ctx.clip();image('energyPanel',38.504881,522.080893,670.437936,285.95537*2.6297);ctx.restore();
    image('energyTitle',137.598326,486.407252,472.251046,169.36995);var gold=ctx.createLinearGradient(0,545.297071,0,590.596932);gold.addColorStop(0,'#fdf3a8');gold.addColorStop(1,'#fed41a');fittedText(m.title,373.723849,567.947001,45.299861,362.398884,gold,'#421700');
    if(icon==='food0')image(icon,343.146444,628.535565,61.154812,143.827057);else image(icon,294.449093,633.065551,158.549512,158.549512);
    if(m.closeable)iconButton('energyClose',605.319386,546.429568,89.467225,89.467225,close,'modal-close');
    lines.forEach(function(line,i){text(line,373.723849,826.722455+i*40.769874,size,'#725137');});
    buttons.forEach(function(b,i){var w=buttonW,scale=w/265.145746,x=buttons.length===1?158.549512:108.719665+i*265.004184,ad=/广告|模拟观看/.test(b.label),green=b.color!=='#efb35f'&&b.color!=='#f9ba61';iconButton(green?'start':'returnButton',x,buttonY,w,buttonH,b.fn,b.id||'modal-button-'+i);if(ad)image('energyTv',x+25.481172*scale,buttonY+30.011158*scale,40.769874*scale,40.769874*scale);fittedText(b.label,x+w/2+(ad?19.818689*scale:0),buttonY+47.564854*scale,29.275035*scale,w-(ad?87.76848:40.769874)*scale,'#fff',green?'#026a30':'#8b3900');});
  }
  var privacyRows=null,privacyTiles=null,privacyFrame=null,privacyFrameKey='',privacyFrameDrawn=false,privacyDrawn=null;
  function buildPrivacyRows(){
    // 折行只依赖常量（字号/字体/内宽600），构建一次缓存；y 为相对正文顶部的累计坐标。
    var rows=[],lineH=28,yy=0;
    (M.PrivacyPolicy||[]).slice(2).forEach(function(paragraph,index){
      var heading=index===0||/^一、|^二、|^三、|^四、|^五、|^六、|^七、/.test(paragraph);
      var size=heading?19:16;
      ctx.font=(heading?'bold ':'')+size+'px "Microsoft YaHei", sans-serif';
      var part='';Array.from(paragraph).forEach(function(ch){if(part&&ctx.measureText(part+ch).width>600){rows.push({t:part,y:yy,b:heading,size:size,c:heading?'#6b2b0d':'#4f392d'});yy+=lineH;part=ch;}else part+=ch;});
      if(part){rows.push({t:part,y:yy,b:heading,size:size,c:heading?'#6b2b0d':'#4f392d'});yy+=lineH;}
      yy+=heading?8:5;
    });
    rows.height=yy;
    return rows;
  }
  function privacySurface(w,h){
    var k=M.Platform&&M.Platform.sdk;
    if(typeof document!=='undefined'){var d=document.createElement('canvas');d.width=w;d.height=h;return d;}
    if(k&&k.createOffscreenCanvas){try{return k.createOffscreenCanvas({type:'2d',width:w,height:h});}catch(e){return null;}}
    if(k&&k.createCanvas){var c=k.createCanvas();if(c&&c!==M.canvas){c.width=w;c.height=h;return c;}}
    return null;
  }
  function buildPrivacyTiles(){
    // 政策正文一次性预渲染到离屏 canvas，每帧只需 1-2 次 drawImage，替代逐帧 fillText。
    // scale 按 dpr 渲染保清晰，总内存>24MB 自动降采样；单块高≤2048 设备像素，规避低端机 4096 纹理上限。
    if(!privacyRows)privacyRows=buildPrivacyRows();
    var innerW=600,lineH=28,H=privacyRows.height,dpr=Math.min(2,M.Layout.dpr||1),scale=dpr;
    while(scale>1&&innerW*H*scale*scale*4>25165824)scale-=0.5;
    var tileH=Math.min(H,2048/scale),list=[];
    for(var top=0;top<H;top+=tileH){
      var len=Math.min(tileH,H-top),cv=privacySurface(Math.round(innerW*scale),Math.round(len*scale));
      if(!cv)return null;
      var g=cv.getContext('2d');g.scale(scale,scale);g.textAlign='left';g.textBaseline='top';
      for(var ri=0;ri<privacyRows.length;ri++){var row=privacyRows[ri];if(row.y+lineH<top)continue;if(row.y>top+len)break;g.font=(row.b?'bold ':'')+row.size+'px "Microsoft YaHei", sans-serif';g.fillStyle=row.c;g.fillText(row.t,0,row.y-top);}
      list.push({cv:cv,top:top,len:len});
    }
    return {list:list,dpr:dpr};
  }
  function drawPrivacyStage(){
    // 隐私页整帧（底图+遮罩+面板+标题+关闭按钮）一次性预渲染进离屏 canvas；
    // 每帧只 1 次全屏 blit，替代「底色填充+背景大图+遮罩混合」三次全屏合成。创建失败回退旧绘制。
    var L=M.Layout,key=L.w+'x'+L.h+'x'+L.dpr;
    if(!privacyFrame||privacyFrameKey!==key){
      var cv=privacySurface(Math.round(L.w*L.dpr),Math.round(L.h*L.dpr));
      if(!cv){
        privacyFrame=null;privacyFrameKey='';
        ctx.save();ctx.setTransform(L.dpr,0,0,L.dpr,0,0);ctx.fillStyle='#3d2115';ctx.fillRect(0,0,L.w,L.h);ctx.restore();
        drawPrivacyBackground();privacyFrameDrawn=false;return;
      }
      var g=cv.getContext('2d'),oc=ctx;
      g.setTransform(L.dpr,0,0,L.dpr,0,0);g.fillStyle='#3d2115';g.fillRect(0,0,L.w,L.h);
      g.save();g.translate(OX,OY);g.scale(S,S);g.beginPath();g.rect(-CONTENT_X,0,VW,VH);g.clip();
      ctx=g;
      try{
        if(!(M.VideoBackground&&M.VideoBackground.draw(ctx,-2.264993,-5.096234,752.543933,1638.156206)))image('home',-2.264993,-5.096234,752.543933,1638.156206);
        ctx.fillStyle='rgba(0,0,0,0.75)';ctx.fillRect(-CONTENT_X,0,VW,VH);
        box(55,180,640,1180,'#fff8e8','#8b3900');
        text('隐私政策',VW/2,228,30,'#6b2b0d','center');
        text('生效日期：2026年9月24日',VW/2,264,15,'#8d6048','center');
        rr(275,1270,200,52,26);ctx.fillStyle='#8b3900';ctx.fill();text('关闭',375,1296,22,'#fff','center');
      }finally{ctx=oc;}
      g.restore();
      privacyFrame=cv;privacyFrameKey=key;
    }
    ctx.save();ctx.setTransform(1,0,0,1,0,0);ctx.drawImage(privacyFrame,0,0);ctx.restore();
    privacyFrameDrawn=true;
  }
  function drawPrivacyModal(){
    if(!privacyRows)privacyRows=buildPrivacyRows();
    if(privacyTiles&&privacyTiles.dpr!==(M.Layout.dpr||1))privacyTiles=null;
    if(!privacyTiles)privacyTiles=buildPrivacyTiles();
    var bx=55,by=180,bw=640,bh=1180;
    var innerX=75,innerW=600,lineH=28;
    var titleY=by+48,subtitleY=by+84,clipTop=by+112,btnY=by+bh-90,clipH=btnY-24-clipTop,contentTop=clipTop+20;
    var btnW=200,btnH=52,btnX=(VW-btnW)/2;
    st.taps=[];
    if(!privacyFrameDrawn){ctx.fillStyle='rgba(0,0,0,0.75)';ctx.fillRect(-CONTENT_X,0,VW,VH);box(bx,by,bw,bh,'#fff8e8','#8b3900');text('隐私政策',VW/2,titleY,30,'#6b2b0d','center');text('生效日期：2026年9月24日',VW/2,subtitleY,15,'#8d6048','center');}
    ctx.save();ctx.beginPath();ctx.rect(innerX,clipTop,innerW,clipH);ctx.clip();
    ctx.translate(0,-st.privacyScroll);
    var viewTop=st.privacyScroll+clipTop,viewBottom=viewTop+clipH;
    if(privacyTiles){
      for(var ti=0;ti<privacyTiles.list.length;ti++){var tile=privacyTiles.list[ti],tileTop=contentTop+tile.top;if(tileTop>viewBottom||tileTop+tile.len<viewTop)continue;ctx.drawImage(tile.cv,innerX,tileTop,innerW,tile.len);}
    }else{
      ctx.textAlign='left';ctx.textBaseline='top';
      for(var ri=0;ri<privacyRows.length;ri++){var rowY=contentTop+privacyRows[ri].y;if(rowY+lineH<viewTop)continue;if(rowY>viewBottom+8)break;ctx.font=(privacyRows[ri].b?'bold ':'')+privacyRows[ri].size+'px "Microsoft YaHei", sans-serif';ctx.fillStyle=privacyRows[ri].c;ctx.fillText(privacyRows[ri].t,innerX,rowY);}
    }
    ctx.restore();
    st.privacyMaxScroll=Math.max(0,contentTop+privacyRows.height-(clipTop+clipH-20));
    if(!privacyFrameDrawn){rr(btnX,btnY,btnW,btnH,26);ctx.fillStyle='#8b3900';ctx.fill();text('关闭',btnX+btnW/2,btnY+btnH/2,22,'#fff','center');}
    area(btnX,btnY,btnW,btnH,close,'privacy-close');
    area(innerX,clipTop,innerW,clipH,function(){},'privacy-scroll');
    privacyDrawn={k:(st.toastLeft>0)+'|'+st.toast+'|'+st.privacyScroll+'|'+M.Layout.w+'x'+M.Layout.h+'x'+M.Layout.dpr};
  }
  function drawModal(){var m=st.modal;if(!m)return;if(m.kind==='privacy'){drawPrivacyModal();return;}if(m.kind==='win'){drawWinModal();return;}if(m.kind==='toolPurchase'){drawToolPurchaseModal();return;}if(m.kind==='timeup'){drawTimeupModal();return;}if(m.kind==='gameSettings'||m.kind==='exitConfirm'){drawRunSettingsModal();return;}if(m.kind==='daily'){drawDailyModal();return;}if(m.kind==='settings'){drawSettingsModal();return;}if(m.kind==='energy'||m.kind==='stars'||m.kind==='tools'){drawEnergyModal();return;}drawStandardModal(m);}
  function drawAd(){if(!st.ad)return;var preview=!!st.adPreview;drawStandardModal({title:preview?'广告流程测试':'广告播放中',icon:'energyTv',closeable:false,lines:preview?['H5预览：这不是实际广告，不产生广告收益。','关卡倒计时与连击已暂停。']:['正在加载或播放广告，请稍候。','关卡倒计时与连击已暂停。'],buttons:preview?[{label:'模拟观看完成',id:'ad-0',fn:function(){var cb=st.adPreview;if(!cb)return;st.adPreview=null;cb(true);}},{label:'模拟中途关闭',id:'ad-1',color:'#efb35f',fn:function(){var cb=st.adPreview;if(!cb)return;st.adPreview=null;cb(false);}}]:[]});}
  function update(){if(M.storageError&&!st.storageWarningShown){toast(M.storageError);st.storageWarningShown=true;}if(!M.storageError)st.storageWarningShown=false;dailyState();var now=M._now(),dt=Math.max(0,(now-st.last)/1000);st.last=now;energyTick();if(st.background)return;if(st.transition){updateTransition(dt);return;}st.toastLeft=Math.max(0,st.toastLeft-dt);st.effects=st.effects.filter(function(e){e.life-=dt;return e.life>0;});st.starFlights=st.starFlights.filter(function(f){f.life-=dt;return f.life>0;});
      // 局终插屏：等胜利动效（星飞/飘字）排空后在本帧自然间隙展示；超时 1.2s 兜底，绝不卡住结算。
      if(st.adPending){var pend=st.adPending;if(!st.starFlights.length&&!st.effects.length||now-pend.at>1200){st.adPending=null;st.modal=null;st.ad=true;st.last=M._now();M.KwaiAd.showInterstitial(function(){st.ad=false;st.adPreview=null;st.last=M._now();pend.fn();});}return;}
      if(st.scene!=='game'||st.modal||st.ad||st.adPending)return;
      st.idle+=dt;
      // 实际游玩时间：挂机（60s 无操作）不计时，弹窗/广告/切后台在上方分支已提前 return。
      if(M.AdPolicy&&M.AdPolicy.tick)M.AdPolicy.tick(st.idle<=60?dt:0);
      if(st.pending){
      var jobs=animationJobs(),hits=[];
      jobs.forEach(function(job){var previous=job.duration-job.remaining;job.remaining=Math.max(0,job.remaining-dt);if(job.remaining<0.000001)job.remaining=0;var elapsed=job.duration-job.remaining;
        job.stages.forEach(function(stage){if((stage.kind==='clear'||stage.kind==='pack')&&!stage.sounded&&elapsed>=stage.start+stage.duration*(stage.kind==='pack'?0.72:0.31)){stage.sounded=true;hits.push({job:job,stage:stage,at:stage.start+stage.duration*(stage.kind==='pack'?0.72:0.31)-previous});}});
      });
      hits.sort(function(a,b){return a.at-b.at;}).forEach(function(hit){if(hit.stage.kind!=='pack')M.Feedback.play('clear');var event=hit.job.events.filter(function(e){return e.kind==='clear'&&!e.awarded&&e.group===hit.stage.group;})[0];if(event)award([event]);});
      jobs.forEach(function(job){if(!job.remaining)award(job.events);});
      syncAnimations(jobs.filter(function(job){return job.remaining>0;}));
      // Do not flush another rack's pending rewards or cancel a held pointer.
      if(!st.pending){foodCache=null;snapshot(true);if(st.tutorial&&st.tutorial.step==='waiting')tutorialFinish();if(!R.total(st.groups)){finish();return;}}
    }if(st.comboLeft>0){st.comboLeft=Math.max(0,st.comboLeft-dt);if(!st.comboLeft)st.combo=0;}if(st.level.duration){st.time=Math.max(0,st.time-dt);if(!st.time&&!st.pending){timeup();return;}}if(!st.drag&&st.idle>C.hintDelay&&!st.hint.length)hint();if(now-(st.savedAt||0)>=5000)persistRun();}
  function draw(){ctx=M.ctx;var L=M.Layout;if(st.modal&&st.modal.kind==='privacy'&&!st.transition&&!st.ad&&privacyDrawn&&privacyDrawn.k===((st.toastLeft>0)+'|'+st.toast+'|'+st.privacyScroll+'|'+L.w+'x'+L.h+'x'+L.dpr))return;S=Math.max(L.w/VW,(L.h-L.safeTop-L.safeBottom)/VH);OX=(L.w-VW*S)/2+CONTENT_X*S;OY=L.safeTop+(L.h-L.safeTop-L.safeBottom-VH*S)/2;ctx.setTransform(L.dpr,0,0,L.dpr,0,0);var privacyStage=M.Assets.ready&&st.modal&&st.modal.kind==='privacy'&&st.scene==='home';if(!privacyStage){ctx.fillStyle='#3d2115';ctx.fillRect(0,0,L.w,L.h);}ctx.save();ctx.translate(OX,OY);ctx.scale(S,S);ctx.beginPath();ctx.rect(-CONTENT_X,0,VW,VH);ctx.clip();st.taps=[];privacyFrameDrawn=false;if(!M.Assets.ready){if(M.Assets.images.loading)image('loading',0,0,VW,VH);else{ctx.fillStyle='#ff8a24';ctx.fillRect(0,0,VW,VH);}var progress=M.Assets.total?Math.min(1,M.Assets.loaded/M.Assets.total):0,barX=128.647753,barY=1198.351046,barW=490.15079,barH=39.637378;var barR=barH/2;ctx.fillStyle='#451907';rr(barX,barY,barW,barH,barR);ctx.fill();ctx.fillStyle='#fff4a6';rr(barX+5.662483,barY+5.662483,Math.max(0,(barW-11.324966)*progress),barH-11.324966,(barH-11.324966)/2);ctx.fill();ctx.strokeStyle='#fffbe0';ctx.lineWidth=4.246862;rr(barX,barY,barW,barH,barR);ctx.stroke();text('正在准备餐厅  '+Math.round(progress*100)+'%',373.723849,1268.333449,26.614923,'#fffbe0','center','#7d300b');ctx.restore();return;}if(privacyStage)drawPrivacyStage();else if(st.scene==='home')drawHome();else drawGame();drawModal();if(st.toastLeft>0){var toastSize=st.toast.length>29?30:36,toastLines=[],toastPart='';ctx.font='bold '+toastSize+'px "Alibaba PuHuiTi 2.0", "Microsoft YaHei", sans-serif';Array.from(String(st.toast)).forEach(function(ch){if(toastPart&&ctx.measureText(toastPart+ch).width>549.260809){toastLines.push(toastPart);toastPart=ch;}else toastPart+=ch;});toastLines.push(toastPart);var toastLineH=toastSize*1.4,toastH=62.287308+(toastLines.length-1)*toastLineH;box((VW-605.885635)/2,(VH-toastH)/2,605.885635,toastH,'rgba(55,31,15,.91)');toastLines.forEach(function(line,i){text(line,VW/2,VH/2+(i-(toastLines.length-1)/2)*toastLineH,toastSize,'#fff4c2');});}drawTransition();ctx.restore();}
  function handleTap(x,y){if(!M.Assets.ready||(st.lock>0&&!st.modal)||st.transition||st.adPending)return;dismissEntryToast();var dx=(x-OX)/S,dy=(y-OY)/S;for(var i=st.taps.length-1;i>=0;i--){var a=st.taps[i];if(dx>=a.x&&dx<=a.x+a.w&&dy>=a.y&&dy<=a.y+a.h){a.fn();return;}}}
  M.Game={state:st,profile:profile,draw:draw,update:update,handleTap:handleTap,start:start,moveElement:moveElement,pointerDown:pointerDown,pointerMove:pointerMove,pointerUp:pointerUp,cancelPointer:cancelPointer,useTool:useTool,toolModal:toolModal,toast:toast,save:snapshot,showAdPreview:function(cb){st.adPreview=cb;},setBackground:function(hidden){if(hidden)snapshot();st.background=hidden;st.last=M._now();},ready:function(){if(M.Assets.failed.length)modal('部分素材加载失败',['请检查网络或素材文件是否齐全。',M.Assets.failed.length+' 个图片未能加载。'],[]);M.Tele.report('home_ready');},geometry:geometry,screenPoint:function(x,y){return {x:OX+x*S,y:OY+y*S};},resetProgress:resetProgress};
})(typeof GameGlobal!=='undefined'?GameGlobal:typeof window!=='undefined'?window:global);
