// js/engine.js — 提艾默酒吧 直播间应援剧游引擎（DOM + video）
(function () {
  var S = window.STORY;
  var app = document.getElementById('app');
  var state = { node: null, stars: 50, support: null, muted: false, votes: {}, intimacy: {}, ranks: {} };
  // 初始票数（万票，对齐参考图量级），内部以"万"为单位显示
  var BASE = { pijiu: 10.8, tiaojiu: 9.2, zhuchang: 6.3, lingwu: 3.7 };

  // 昵称（对齐参考图直播间风格）
  var HOST_NAME = '兔兔在营业';

  var danmuPool = [
    ['清风徐来','左边跳得太棒了吧！'],['酒酿小圆子','这舞蹈绝了，爱了爱了'],
    ['大白兔奶糖','兔兔宝贝冲鸭！🐰🐰'],['一只小迷妹','右边姐姐好性感！'],
    ['KKK','两位都很棒，给你们打call！'],['不吃香菜','好难选啊，太精彩了吧'],
    ['用户123456789','来了来了，支持兔兔！'],['小霸王','支持小鹿 冲冲冲'],
    ['快乐肥宅','全要了'],['为你心动','这身材绝了'],['酒鬼小张','1号好活泼啊'],
    ['星辰大海','这谁顶得住啊'],['小幸运','太顶了太精彩了']
  ];

  function esc(s){ return String(s).replace(/[&<>]/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;'}[c];}); }
  function el(html){ var d=document.createElement('div'); d.innerHTML=html.trim(); return d.firstChild; }

  // ── 星光 ──
  function addStars(n){ state.stars = Math.max(0, state.stars + n); var p=document.getElementById('starVal'); if(p) p.textContent = state.stars; }

  // ── 排名计算 ──
  function ensureVotes(){
    for(var k in S.candidates){ if(state.votes[k]==null) state.votes[k]=BASE[k]; }
  }
  function renderRank(){
    ensureVotes();
    var arr = Object.keys(S.candidates).map(function(k){ return {k:k, v:state.votes[k]}; });
    arr.sort(function(a,b){ return b.v-a.v; });
    var medals=['🥇','🥈','🥉',''];
    var html='';
    arr.forEach(function(it,i){
      var c=S.candidates[it.k];
      var gold = (it.k===state.support);
      html+='<div class="rank-item '+(i===0?'gold':'')+'">'+
        '<span class="no">'+(i+1)+'</span>'+
        '<img class="ava" src="'+c.avatar+'" alt="">'+
        '<div class="txt"><b>'+esc(c.name)+'</b><span>'+it.v.toFixed(1)+'万票</span></div>'+
        (i<3?'<span class="badge">'+medals[i]+'</span>':'')+
        '</div>';
    });
    var box=document.getElementById('rankList'); if(box) box.innerHTML=html;
  }

  // ── 弹幕 ──
  var danmuTimer=null;
  function startDanmu(){
    stopDanmu();
    var box=document.getElementById('danmu'); if(!box) return;
    danmuTimer=setInterval(function(){
      var d=danmuPool[Math.floor(Math.random()*danmuPool.length)];
      var line=el('<div class="d"><span class="u">'+esc(d[0])+'：</span><span class="c">'+esc(d[1])+'</span></div>');
      box.appendChild(line);
      while(box.children.length>7) box.removeChild(box.firstChild);
    },1400);
  }
  function stopDanmu(){ if(danmuTimer){clearInterval(danmuTimer);danmuTimer=null;} }
  function pushDanmu(u,c){ var box=document.getElementById('danmu'); if(!box)return; box.appendChild(el('<div class="d"><span class="u">'+esc(u)+'：</span><span class="c">'+esc(c)+'</span></div>')); while(box.children.length>7)box.removeChild(box.firstChild); }

  // ── 特效 ──
  function fxLayer(){ var f=document.querySelector('.fx-layer'); if(!f){f=el('<div class="fx-layer"></div>');app.appendChild(f);} return f; }
  function floatGifts(icon,count){
    var f=fxLayer();
    for(var i=0;i<count;i++){ (function(idx){ setTimeout(function(){
      var g=el('<div class="fx-gift">'+icon+'</div>');
      g.style.left=(10+Math.random()*70)+'%'; g.style.bottom='320px';
      f.appendChild(g); setTimeout(function(){g.remove();},2200);
    },idx*90); })(i); }
  }
  function nightFx(name){
    var f=fxLayer();
    var n=el('<div class="fx-night"><div class="beam"></div></div>'); f.appendChild(n);
    var bc=el('<div class="broadcast">🌌 你点亮了「提艾默之夜」！<br>为【'+esc(name)+'】投出 30000 票！</div>'); f.appendChild(bc);
    if(!state.muted) beep(0.5,180,'sine');
    setTimeout(function(){n.remove();bc.remove();},2600);
  }
  function toast(txt){ var t=el('<div class="toast">'+esc(txt)+'</div>'); app.appendChild(t); setTimeout(function(){t.remove();},1800); }
  function hotPop(txt){ var stage=document.getElementById('stage'); var h=el('<div class="hot-pop">'+esc(txt)+'</div>'); app.appendChild(h); setTimeout(function(){h.remove();},1400); }

  // ── 简易音效（WebAudio，礼物拟音）──
  var actx=null;
  function beep(dur,freq,type){ try{ if(state.muted)return; actx=actx||new (window.AudioContext||window.webkitAudioContext)(); var o=actx.createOscillator(),g=actx.createGain(); o.type=type||'triangle'; o.frequency.value=freq||440; o.connect(g); g.connect(actx.destination); g.gain.setValueAtTime(0.15,actx.currentTime); g.gain.exponentialRampToValueAtTime(0.001,actx.currentTime+dur); o.start(); o.stop(actx.currentTime+dur);}catch(e){} }

  // ── PK 进度条 ──
  function renderPK(focusKey, rivalKey){
    ensureVotes();
    var fv=state.votes[focusKey]||1, rv=state.votes[rivalKey]|| (BASE[rivalKey]||5);
    var total=fv+rv; var lp=Math.round(fv/total*100); var rp=100-lp;
    var l=document.querySelector('.pkbar .l'), r=document.querySelector('.pkbar .r');
    if(l){ l.style.width=lp+'%'; l.textContent=lp+'%'; }
    if(r){ r.textContent=rp+'%'; }
  }

  // ── 主渲染 ──
  function chapterFor(node){
    if(/第一幕/.test(node.text)) return '第一幕 · 竞选出场';
    if(/第二幕/.test(node.text)) return '第二幕 · 定制化改造';
    if(/第三幕/.test(node.text)) return '第三幕 · 谁是最强店长';
    if(/第四幕/.test(node.text)) return '第四幕 · 店长的诞生';
    return null;
  }
  var lastChapter=null;
  function maybeChapter(node,cb){
    var c=chapterFor(node);
    if(c && c!==lastChapter){ lastChapter=c; var ch=el('<div class="chapter"><b>'+esc(c)+'</b></div>'); app.appendChild(ch); setTimeout(function(){ch.remove();cb();},1500); }
    else cb();
  }

  function stageHtml(node){
    var scene=node.scene;
    if(scene==='ending'){
      var c=S.candidates[node.focus];
      return '<div class="stage" id="stage"><video src="'+c.video+'" poster="'+c.poster+'" autoplay loop muted playsinline></video></div>';
    }
    if(scene==='opening'){
      return '<div class="stage" id="stage"><video src="assets/video/opening-scene.mp4" poster="assets/keyframes/opening-scene.png" autoplay loop muted playsinline></video></div>';
    }
    // pk：单人或分屏（选择/含 rival 时分屏）
    var focus=node.focus?S.candidates[node.focus]:S.candidates[state.support]||S.candidates.pijiu;
    if(node.rival){
      var rival=S.candidates[node.rival];
      return '<div class="stage pk" id="stage">'+
        '<div class="half"><video src="'+focus.video+'" poster="'+focus.poster+'" autoplay loop muted playsinline></video></div>'+
        '<div class="half dim"><video src="'+rival.video+'" poster="'+rival.poster+'" autoplay loop muted playsinline></video></div>'+
      '</div>';
    }
    return '<div class="stage" id="stage"><video src="'+focus.video+'" poster="'+focus.poster+'" autoplay loop muted playsinline></video></div>';
  }

  function hudHtml(node){
    var likes = node.scene==='ending' ? '188.8万本场点赞' : '98.6万本场点赞';
    var crown = node.scene==='ending' ? '10万+' : '6.8万';
    var title = node.scene==='ending' ? '兔兔老板娘' : HOST_NAME;
    var top =
      '<div class="topbar">'+
        '<div class="host-card"><img class="ava" src="assets/image/avatar-pijiu.png"><div class="meta"><b>'+title+'</b><small>'+likes+'</small></div><span class="vip">VIP</span></div>'+
        '<div class="top-right"><div class="crown-count">👑 '+crown+'</div><span class="mute-btn" id="muteBtn">'+(state.muted?'🔇':'🔊')+'</span><span class="close-x">✕</span></div>'+
      '</div>';
    var showRank = node.scene!=='opening' || true;
    var rankSub = node.scene==='ending' ? '最终排名' : (node.scene==='opening'?'距结算 23:36:48':'实时应援');
    var rank =
      '<div class="rank"><h4>团员排名 <span style="font-size:11px">ⓘ</span></h4><div class="sub">'+rankSub+'</div><div id="rankList"></div></div>';
    var danmu = '<div class="danmu" id="danmu"></div>';
    var pk = (node.scene==='pk') ?
      '<div class="pk-timer">距结算 10s</div>'+
      '<div class="pkbar"><div class="l" style="width:55%">55%</div><div class="r">45%</div><div class="mid">PK</div></div>' : '';
    var badge = (node.scene==='ending') ?
      '<div class="ending-badge"><div class="crown">👑</div><div class="title">今日店长</div></div>' : '';
    return top+rank+danmu+pk+badge;
  }

  function dockHtml(){
    var g='<div class="gift-row">';
    S.gifts.forEach(function(gf){
      g+='<div class="gift" data-gift="'+gf.id+'"><div class="ic">'+gf.icon+'</div><div class="nm">'+gf.name+'</div><div class="pr">'+gf.cost+'快币</div></div>';
    });
    g+='<div class="gift send" id="giftSend"><div class="ic">🎁</div><div class="nm">送礼</div></div></div>';
    return '<div class="dock">'+
      '<div class="star-bar"><div class="star-pill">💫 <span id="starVal">'+state.stars+'</span> 星光</div><button class="ad-btn" id="adBtn">📺 看广告 +10</button></div>'+
      g+'</div>';
  }

  function subtitleHtml(node){
    return '<div class="subtitle" id="subtitle"><div class="who">'+esc(node.host||'旁白')+'</div><div class="body">'+esc(node.text)+'</div><div class="tap-hint">点击继续 ▸</div></div>';
  }

  function choicesHtml(node){
    var h='<div class="choices">';
    node.choices.forEach(function(ch,i){
      var cost = ch.giftCost||0;
      var disabled = (cost>state.stars);
      h+='<div class="choice'+(disabled?' disabled':'')+'" data-idx="'+i+'">'+
          '<span>'+esc(ch.label)+'</span><span class="ck">✓</span></div>';
    });
    h+='</div>';
    return h;
  }

  // ── 送礼 ──
  function sendGift(giftId){
    var gf=null; S.gifts.forEach(function(g){if(g.id===giftId)gf=g;});
    if(!gf) return;
    if(!state.support){ toast('先选一位候选人 all in 吧'); return; }
    if(state.stars < gf.cost){ toast('星光不足，看广告攒星光 📺'); flashAd(); return; }
    addStars(-gf.cost);
    ensureVotes();
    state.votes[state.support]+= gf.vote/10000; // 万票
    if(gf.id==='night'){ nightFx(S.candidates[state.support].name); }
    else { floatGifts(gf.icon, Math.min(12, Math.max(3, Math.round(gf.vote/50)))); if(!state.muted) beep(0.15,gf.cost>50?300:520); }
    hotPop('人气 +'+gf.vote);
    pushDanmu('你', '给'+S.candidates[state.support].name+'送了'+gf.name+'！');
    renderRank();
    var cur=state.node;
    if(cur && cur.scene==='pk' && cur.rival) renderPK(cur.focus||state.support, cur.rival);
  }

  function flashAd(){ var b=document.getElementById('adBtn'); if(b){ b.style.animation='none'; b.offsetHeight; b.style.animation='blink .5s 3'; } }

  // ── 看广告 ──
  function watchAd(cb){
    var ov=el('<div class="overlay"><div class="neon">提艾默</div><div class="ad-count" id="adC">激励视频 15s…</div><div class="bar"><i></i></div><small>看完 +10 星光</small></div>');
    app.appendChild(ov);
    var t=15, c=ov.querySelector('#adC');
    // 快手激励视频广告接入点：window.KwaiAdConfig.rewardedAdUnitId
    var demo=setInterval(function(){ t--; if(c)c.textContent='激励视频 '+t+'s…'; if(t<=0){clearInterval(demo); ov.remove(); addStars(10); toast('+10 星光已到账 💫'); if(cb)cb();} },1000);
  }

  // ── 节点流转 ──
  function go(nodeId){
    var node = S.nodes[nodeId];
    if(!node){ return; }
    state.node = node;
    if(node.support){ /* handled by choice */ }
    maybeChapter(node, function(){ render(node); });
  }

  function render(node){
    // 应援奖励
    if(node.reward){ addStars(node.reward); }
    if(node.intimacy && state.support){ setTimeout(function(){ toast('亲密度提升 · '+node.intimacy+'（'+S.candidates[state.support].tag+'）'); },400); }

    var body = stageHtml(node) + hudHtml(node) + dockHtml(node);
    if(node.type==='choice') body += choicesHtml(node);
    else if(node.type==='ending') body += endingReplayHtml(node);
    else body += subtitleHtml(node);
    app.innerHTML = body;

    renderRank(); startDanmu();
    if(node.scene==='pk' && node.rival) renderPK(node.focus||state.support, node.rival);
    bindCommon();

    if(node.type==='story'){
      var st=document.getElementById('subtitle');
      st.addEventListener('click', function(){ go(node.next); });
      // 也允许点舞台推进
      document.getElementById('stage').addEventListener('click', function(){ go(node.next); });
    } else if(node.type==='choice'){
      bindChoices(node);
    } else if(node.type==='ending'){
      bindEnding(node);
    }
  }

  function endingReplayHtml(node){
    return '<div class="fx-layer"></div>'+
      '<div class="subtitle"><div class="who">'+esc(node.title)+'</div><div class="body">'+esc(node.text)+'</div></div>'+
      '<div class="replay-bar"><button class="ghost" id="reSel">选别的候选人</button><button id="reAll">再玩一次</button></div>';
  }

  function bindCommon(){
    var mb=document.getElementById('muteBtn');
    if(mb) mb.addEventListener('click', function(){ state.muted=!state.muted; mb.textContent=state.muted?'🔇':'🔊'; });
    var ad=document.getElementById('adBtn');
    if(ad) ad.addEventListener('click', function(){ watchAd(); });
    // 礼物
    document.querySelectorAll('.gift[data-gift]').forEach(function(g){
      g.addEventListener('click', function(){ sendGift(g.getAttribute('data-gift')); });
    });
    var send=document.getElementById('giftSend');
    if(send) send.addEventListener('click', function(){ sendGift('neon'); });
  }

  function bindChoices(node){
    document.querySelectorAll('.choice').forEach(function(c){
      c.addEventListener('click', function(){
        if(c.classList.contains('disabled')){ toast('星光不足，先看广告 📺'); flashAd(); return; }
        var idx=+c.getAttribute('data-idx'); var ch=node.choices[idx];
        c.classList.add('selected');
        // 选候选人
        if(ch.support){ state.support=ch.support; }
        // all-in 送礼
        if(ch.giftCost){ addStars(-ch.giftCost); ensureVotes(); state.votes[state.support]+= (ch.votes||30000)/10000; nightFx(S.candidates[state.support].name); }
        else if(ch.watchAd){ }
        if(ch.intimacy && state.support){ setTimeout(function(){toast('亲密度 · '+ch.intimacy);},300); }

        function proceed(){ setTimeout(function(){ go(ch.next); }, ch.giftCost?1400:200); }
        if(ch.watchAd){ watchAd(function(){ ensureVotes(); state.votes[state.support]+=(ch.votes||6000)/10000; floatGifts('🚀',8); hotPop('人气 +'+(ch.votes||6000)); renderRank(); proceed(); }); }
        else proceed();
      });
    });
  }

  function bindEnding(node){
    document.getElementById('reAll').addEventListener('click', function(){ state.stars=50; state.support=null; state.votes={}; lastChapter=null; go('opening'); });
    document.getElementById('reSel').addEventListener('click', function(){ state.stars=Math.max(state.stars,50); state.support=null; state.votes={}; lastChapter=null; go('choose'); });
    // 结局礼花
    floatGifts('🎉',14); floatGifts('✨',10);
  }

  // ── 启动 ──
  function boot(){
    var ov=el('<div class="overlay"><div class="neon">提艾默</div><div class="bar"><i></i></div><small>店长争夺战 · 加载中…</small></div>');
    app.appendChild(ov);
    setTimeout(function(){ ov.remove(); go(S.entry); }, 1300);
  }
  window.TIAIMO = { boot: boot, state: state };
  if(document.readyState!=='loading') boot(); else document.addEventListener('DOMContentLoaded', boot);
})();
