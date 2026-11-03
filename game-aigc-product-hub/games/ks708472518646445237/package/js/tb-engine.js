// js/tb-engine.js — 主引擎：剧情推进 + 视频调度 + 交互分发（纯 Canvas）
(function () {
  var M3 = window.M3;
  var UI = M3.UI, L = M3.Loader, Model = M3.Model, Story = M3.Story, Aud = M3.Audio;

  var ctx = null;
  var CO = M3.Config.COLOR;

  // ─── 运行时状态 ──────────────────────────────────────────────
  var st = {
    phase: 'splash',       // splash | live | ending
    curId: Story.entry,
    video: null, videoKey: null, videoLoading: false,
    poster: null, posterKey: null,
    seqIdx: -1,            // 多段视频序列进度
    voiceToken: 0,
    caption: { who: '', text: '', t0: 0 },
    chat: [], toasts: [], particles: [], pulses: {},
    giftTo: null,          // 礼物「送给」选中的候选人（Figma 473:14803 选择器）
    giftFx: null,          // 送礼特效大图（Figma 442:9693 260×260）
    broadcast: null,
    muted: false,
    starT: Date.now(),     // 星光自动增长计时
    pending: null,         // 待处理的交互状态（换装 / 多选等）
    entered: false,        // 是否已确认进入 shot（避免重复副作用）
    autoT: 0,              // 自动推进计时器句柄标记
    countdown: null,
    adBusy: false,
    adLoading: false,       // 广告加载中遮罩
    showPrivacy: false,     // 隐私政策浮层
    pureMode: false,        // v1.0.8 纯净模式：隐藏所有 UI，只留视频
    hudCollapsed: false,    // v1.0.8 团员排名+弹幕区一键折叠 → 互动区胶囊
    needStars: null,        // v1.0.9 星光不足弹窗：{cost:number}
    thanksOverlay: null,    // v1.0.10 送礼后感谢视频覆盖层：{cid, t0, life, file}
    giftOpen: false,        // v1.0.13 底部送礼面板默认收起，点击「礼物栏」入口才展开
    mediaDone: false, voiceDone: false, enterRun: 0,
    outfitPreview: null, outfitPreviewDone: false, outfitSpeaking: false, outfitPromptRun: 0,
    outfitAdvance: null,   // 452:13015「继续游戏」回调（定装照需玩家确认后才推进）
    gameFx: null, gameLocked: false, gameResultReady: false, outfitDone: {},
    appliedEntryVotes: {}
  };

  function node() { return Story.shots[st.curId] || null; }

  function bind(context) { ctx = context; }

  // ─── 文案 / 弹幕 ─────────────────────────────────────────────
  function say(who, str) {
    st.caption = { who: who || '', text: str || '', t0: Date.now() };
  }
  function pushChat(user, txt, vip) {
    st.chat.push({ user: user, text: txt, vip: !!vip, t0: Date.now() });
    if (st.chat.length > 40) st.chat.shift();
  }
  function autoChat() {
    var c = Story.chat[Math.floor(Math.random() * Story.chat.length)];
    pushChat(c[0], c[1]);
  }
  function toast(txt, color) {
    st.toasts.push({ text: txt, color: color || CO.gold, t0: Date.now(), life: 1500 });
  }

  // ─── 礼物特效 ────────────────────────────────────────────────
  // v1.0.10 送礼反馈：真机震动 + 感谢视频覆盖
  function buzz() {
    try {
      if (typeof wx !== 'undefined') {
        if (wx.vibrateShort) wx.vibrateShort({ type: 'medium' });
        else if (wx.vibrate) wx.vibrate();
      }
    } catch (e) {}
  }
  // v1.0.11 感谢台词库（贴图立绘 + 音色 + 字幕，取代未生成的视频）
  var THANKS_TEXT = {
    pijiu:    '哥哥～谢谢你的星光！佳琪最喜欢你了，人家会一直加油的哦！',
    tiaojiu:  '算你有眼光。妮蔻记住你了，这一杯，本姐特调给你。',
    zhuchang: '谢谢老板一直听可可唱歌……可可不会让你失望的。',
    lingwu:   '这份心意，泡泡收下啦～今晚整个舞台，都是你的哦。'
  };
  function playThanksVideo(candidateId) {
    // v1.0.12 短时间连点合并：同一位候选人 4.2s 内重复送礼，感谢浮层+音频只播一次
    if (st.thanksOverlay && st.thanksOverlay.cid === candidateId) {
      var age = Date.now() - st.thanksOverlay.t0;
      if (age < st.thanksOverlay.life) return;
    }
    var img = 'media/thanks/thanks-' + candidateId + '-v1.png';
    var audio = 'media/thanks/thanks-' + candidateId + '-v1.mp3';
    var text = THANKS_TEXT[candidateId] || '谢谢老板！';
    // 停掉之前不同角色未结束的一句
    if (st.thanksOverlay && st.thanksOverlay.audio) {
      try { Aud.stop && Aud.stop(st.thanksOverlay.audio); } catch (e) {}
    }
    st.thanksOverlay = {
      cid: candidateId, t0: Date.now(), life: 4200,
      image: img, audio: audio, text: text
    };
    if (L.loadImage) L.loadImage(img, function () {});
    if (Aud && Aud.play) { try { Aud.play(audio); } catch (e) {} }
    report && report('thanks_play', { cid: candidateId });
  }

  function flyGift(giftId, toId) {
    var g = Model.gift(giftId); if (!g) return;
    // v1.0.12 移除送礼额外音效——感谢音色已承担反馈职责，避免与人声/视频重叠
    // 送礼特效大图（Figma 442:9693 / 452:12449·12451·12452·12453）：
    // 五个礼物均有 260×260 专属切图，缺失时回落图标切图、最后 emoji。
    var fxIm = UI.IM_FX[giftId] || UI.giftIcon(giftId);
    st.giftFx = { im: fxIm || '', icon: g.icon, t0: Date.now() };
    var idx = 0, rk = Model.ranking();
    for (var i = 0; i < rk.length; i++) if (rk[i].id === toId) idx = i;
    st.particles.push({
      fx: UI.W / 2, fy: UI.H * 0.62,
      tx: 55, ty: UI.TOP + 74 + idx * 39,
      color: Story.candidates[toId].color, icon: g.icon,
      t0: Date.now(), life: 850, to: toId
    });
  }

  // ─── 视频调度 ────────────────────────────────────────────────
  // 无缝切换：新视频 onPlay（首帧已出）后再销毁旧实例
  function setVideo(file, onEnded, opts) {
    var url = M3.Config.url(file);
    if (st.videoKey === url) return;
    st.videoKey = url;

    var old = st.video;
    if (!L.isKS) { // H5 预览：仅用海报，靠自动推进走流程
      st.video = null;
      if (old) L.destroyVideo(old);
      return;
    }
    var cached = L.cachedVideo ? L.cachedVideo(url) : null;
    st.videoLoading = !cached;

    function startCurrentVideo(source) {
      if (st.videoKey !== url) return;
      var v = L.createVideo(source, {
        width: UI.W, height: UI.H,
        // v1.0.8 视频默认带声音（跟随全局 st.muted）；早前把非嵌入模式强制静音是错误的
        muted: !!st.muted,
        loop: !!(opts && opts.loop)
      }, {
        onPlay: function () {
          st.videoLoading = false;
          // v1.0.13 视频带声播放时压低 BGM，避免叠加噪音
          if (!st.muted && Aud && Aud.duck) { try { Aud.duck(); } catch (e) {} }
          if (opts && opts.startSec && v && v.seek) { try { v.seek(opts.startSec); } catch (e) {} }
          if (old && old !== v) { L.destroyVideo(old); old = null; }
        },
        onEnded: function () {
          if (Aud && Aud.restore) { try { Aud.restore(); } catch (e) {} }
          if (st.videoKey === url) onEnded && onEnded();
        },
        onError: function (e) {
          console.log('[v] err', url, e && e.errMsg);
          if (Aud && Aud.restore) { try { Aud.restore(); } catch (e) {} }
          st.videoLoading = false;
          if (old) { L.destroyVideo(old); old = null; }
          if (st.videoKey === url) onEnded && onEnded();
        }
      });
      st.video = v;
      if (opts && opts.startSec && v && v.seek) { try { v.seek(opts.startSec); } catch (e) {} }
      if (opts && opts.maxMs) setTimeout(function () { if (st.videoKey === url) { try { v.stop && v.stop(); } catch (e) {} onEnded && onEnded(); } }, opts.maxMs);
      // 兜底：3s 内 onPlay 未触发也清掉旧实例
      setTimeout(function () { if (old && old !== v) { L.destroyVideo(old); old = null; } }, 3000);
      // 兜底：60s 强制推进，防止某段视频卡住整条剧情
      setTimeout(function () { if (st.videoKey === url) onEnded && onEnded(); }, 60000);
    }

    // 当前视频未命中内存缓存时立即从 CDN 流播，不再等待整文件，
    // 也不并行下载同一文件，避免与首帧争抢带宽。
    startCurrentVideo(cached || url);
    prefetch(2);
  }

  function clearVideo() {
    if (st.video) L.destroyVideo(st.video);
    st.video = null; st.videoKey = null; st.videoLoading = false;
  }

  // 沿 next 链预取后续视频，减少切镜等待
  function prefetch(count) {
    var current = Story.shots[st.curId];
    var id = current && current.ui && current.ui.options && current.ui.options[0]
      ? current.ui.options[0].next : current && current.next;
    var seen = {}, n = count || 2, hop = 0;
    while (id && !seen[id] && n > 0 && hop < 40) {
      seen[id] = 1; hop++;
      var nd = Story.shots[id];
      if (!nd) break;
      var f = nd.video || (nd.sequence && nd.sequence[0] && nd.sequence[0].video);
      if (f) {
        var u = M3.Config.url(f);
        if (!L.isCached(u)) { L.ensureLocal(u); n--; }
      }
      if (nd.ui && nd.ui.options && nd.ui.options[0]) id = nd.ui.options[0].next;
      else id = nd.next;
    }
  }

  // 启动预取：只拉取入口之后的第一段视频，避免启动时抢占带宽
  function bootPrefetch() {
    var ids = ['shot-02'];
    for (var i = 0; i < ids.length; i++) {
      var nd = Story.shots[ids[i]];
      if (nd && nd.video) L.ensureLocal(M3.Config.url(nd.video));
    }
  }

  // 海报（视频缓冲时的底图，也是 H5 预览的主画面）
  function setPoster(file) {
    if (!file) return;
    var url = M3.Config.url(file);
    if (st.posterKey === url) return;
    st.posterKey = url;
    st.poster = L.getImage(file);
    if (!st.poster) L.loadImage(file, function (im) { if (st.posterKey === url) st.poster = im; });
  }

  // ─── 按当前排名/支持者解析动态字段 ────────────────────────────
  function resolveWho(item, ctxIds) {
    if (item.byLeader) return ctxIds.leader;
    if (item.bySupport) return ctxIds.support;
    if (item.byRival) return ctxIds.rival;
    if (item.byLast) return ctxIds.last;
    return null;
  }
  function pickDyn(item, key, who) {
    var m = item[key];
    return m && who ? m[who] : null;
  }

  // ─── 进入 shot ───────────────────────────────────────────────
  function enter(id) {
    st.curId = id;
    st.entered = false;
    st.seqIdx = -1;
    st.pending = null;
    st.countdown = null;
    st.outfitPreview = null; st.gameFx = null; st.gameLocked = false; st.gameResultReady = false;
    st.outfitAdvance = null;
    st.giftFx = null;   // 送礼特效不跨场景残留（Figma 442:9693）
    st.outfitPromptRun++;
    st.mediaDone = false; st.voiceDone = false; st.enterRun++;
    Aud.cancel();

    var nd = node();
    if (!nd) { st.phase = 'ending'; clearVideo(); return; }
    var shotNo = parseInt((nd.id.match(/\d+/) || ['1'])[0], 10);
    Aud.enter(shotNo <= 4 ? 'opening' : shotNo <= 17 ? 'showcase' : shotNo <= 26 ? 'pk' : 'finale');

    // ① 结算（先算，后面文案要用）
    var ids = {
      leader:  Model.ranking()[0].id,
      support: Model.getSupport(),
      rival:   Model.getRival(),
      last:    Model.ranking()[Model.ranking().length - 1].id
    };
    // 排名相关票数先一次性入账，再结算并解析动态音视频，避免画面、榜单和播报各说各话。
    if (nd.crowdTicks) Model.crowdTick(nd.id, nd.crowdTicks);
    if (nd.voices && !st.appliedEntryVotes[nd.id]) {
      for (var vi = 0; vi < nd.voices.length; vi++) if (nd.voices[vi].voteDelta && nd.voices[vi].to) Model.recordVote(nd.voices[vi].to, nd.voices[vi].voteDelta, 'crowd', nd.id);
      st.appliedEntryVotes[nd.id] = true;
    }
    ids.leader = Model.ranking()[0].id;
    ids.last = Model.ranking()[Model.ranking().length - 1].id;
    if (nd.settle) {
      var r = Model.settle(nd.settle, nd.id);
      if (nd.settle === 'rank-first') ids.leader = r;
      if (nd.settle === 'rank-last')  ids.last = r;
      if (nd.settle === 'rival' || nd.settle === 'final-rival') ids.rival = r;
      if (nd.settle === 'support-first' && ids.support) {
        var top = Model.ranking()[0], supportVotes = Model.votes()[ids.support];
        if (top.id !== ids.support) Model.recordVote(ids.support, top.votes - supportVotes + 500, 'player', nd.id);
        ids.leader = ids.support;
      }
    }
    st.ids = ids;

    // ② 星光奖励 / 倍率
    if (nd.rewardStars) { Model.addStars(nd.rewardStars); toast('见面礼 +' + nd.rewardStars + ' 星光'); }
    if (nd.multiplier)  { Model.setMultiplier(nd.multiplier); }
    if (nd.intimacy && ids.support) Model.addIntimacy(ids.support, nd.intimacy);

    // ③ 龙哥出手
    if (nd.rivalSurge && ids.rival) {
      Model.rivalGift(ids.rival, nd.rivalSurge.gift, nd.rivalSurge.count, nd.id);
      st.pulses[ids.rival] = Date.now();
      pushChat('龙哥', '这局我押' + Story.candidates[ids.rival].short + '。', true);
      flyGift(nd.rivalSurge.gift, ids.rival);
      st.gameFx = {
        game: 'rival-surge',
        label: '龙哥押 ' + Story.candidates[ids.rival].short,
        detail: (ids.support ? Story.candidates[ids.support].short : '你的候选人') + ' VS ' + Story.candidates[ids.rival].short,
        t0: Date.now(), support: ids.support, rival: ids.rival
      };
    }

    // ④ 弹幕
    if (nd.chat) for (var i = 0; i < nd.chat.length; i++) pushChat('老铁' + (100 + i), nd.chat[i]);
    if (nd.broadcast) st.broadcast = { msg: nd.broadcast, t0: Date.now() };

    // ⑤ 画面：多段序列 / 单段视频 / 动态视频
    setPoster(nd.posterByLeader ? nd.posterByLeader[ids.leader] : nd.posterBySupport ? nd.posterBySupport[ids.support] : nd.poster);
    say(nd.voices && nd.voices[0] ? (nd.voices[0].who || nd.voices[0].whoLabel || '') : '', nd.text);

    if (nd.sequence && nd.sequence.length) {
      st.voiceDone = true;
      playSequence(nd, 0);
    } else {
      var f = nd.videoByLeader ? nd.videoByLeader[ids.leader] : nd.videoBySupport ? nd.videoBySupport[ids.support] : nd.video;
      if (f) setVideo(f, onSceneEnd, { embedded: false, maxMs: nd.previewMs });
      else { clearVideo(); st.mediaDone = true; }
      playVoices(nd, ids);
      maybeAdvance();
    }

    st.entered = true;
    prefetch(3);
  }

  // 多段视频顺播（声音钩子 / 私藏资料）
  function playSequence(nd, idx) {
    var seq = nd.sequence;
    if (idx >= seq.length) { Aud.restore(); onSceneEnd(); return; }
    st.seqIdx = idx;
    var s = seq[idx];
    setPoster(s.poster || nd.poster);
    say(s.who || '', s.text || nd.text);
    if (s.voteDelta && s.to) {
      Model.recordVote(s.to, s.voteDelta, 'crowd', nd.id);
      st.pulses[s.to] = Date.now();
    }
    if (s.video) {
      if (s.embedded) Aud.duck();
      setVideo(s.video, function () { playSequence(nd, idx + 1); }, { embedded: !!s.embedded });
      // 视频自带口型音时不叠人声
      if (!s.embedded && s.audio) Aud.play(s.audio);
    } else {
      if (s.audio) Aud.play(s.audio, function () { playSequence(nd, idx + 1); });
      else scheduleAuto(2800, function () { playSequence(nd, idx + 1); });
    }
  }

  // 顺序人声播报（支持按 leader/support/rival/last 动态取音轨）
  // v1.0.17：如果本场景有视频（nd.video / videoByLeader / videoBySupport），
  //   视频本身通常已带原生同步音频（Kling AIGC 视频含台词），
  //   跳过 mp3 语音播报避免"视频原声 + mp3 重叠"的双声道混乱。
  //   仍保留字幕/say 显示，只是不播 mp3。
  function playVoices(nd, ids) {
    if (!nd.voices || !nd.voices.length) { st.voiceDone = true; return; }
    var hasVideo = !!(nd.video
      || (nd.videoByLeader && ids.leader && nd.videoByLeader[ids.leader])
      || (nd.videoBySupport && ids.support && nd.videoBySupport[ids.support])
      || (nd.sequence && nd.sequence.length && nd.sequence.some(function (s) { return s.video; })));
    if (hasVideo) {
      // 视频自带原声，只显示首句字幕，跳过所有 mp3 播报
      var v0 = nd.voices[0];
      var who0 = v0.who || v0.whoLabel || '';
      var text0 = v0.text || nd.text;
      say(who0, text0);
      st.voiceDone = true;
      return;
    }
    var outfitUi = nd.ui && (nd.ui.type === 'outfit' || nd.ui.type === 'outfit-all' || nd.ui.type === 'outfit-dynamic' || nd.ui.type === 'outfit-hub');
    var source = outfitUi ? (nd.ui.type === 'outfit-hub' ? [] : nd.voices.slice(0, 1)) : nd.voices;
    if (!source.length) { st.voiceDone = true; return; }
    if(nd.outfitReveal&&ids.support){var supportName=Story.candidates[ids.support].short;source=nd.voices.filter(function(v,i){return i===0||v.who===supportName;});}
    if(nd.id==='shot-21'&&ids.support){var names=[Story.candidates[ids.support].short,ids.rival&&Story.candidates[ids.rival].short];source=nd.voices.filter(function(v,i){return i===0||names.indexOf(v.who)>=0;});}
    var items = source.map(function (v) {
      var who = resolveWho(v, ids);
      var audio = v.audio
        || pickDyn(v, 'audioByLeader',  ids.leader)
        || pickDyn(v, 'audioBySupport', ids.support)
        || pickDyn(v, 'audioByRival',   ids.rival)
        || pickDyn(v, 'audioByLast',    ids.last);
      var text = v.text
        || pickDyn(v, 'textByLeader',  ids.leader)
        || pickDyn(v, 'textBySupport', ids.support)
        || pickDyn(v, 'textByRival',   ids.rival)
        || pickDyn(v, 'textByLast',    ids.last)
        || nd.text;
      var label = v.who
        || (v.whoByLeader && who && v.whoByLeader[who])
        || (who ? Story.candidates[who] && Story.candidates[who].short : '')
        || v.whoLabel;
      return { audio: audio, text: text, who: label, voteDelta: v.voteDelta, to: v.to };
    });
    st.voiceToken = Aud.sequence(items, function (i, it) {
      say(it.who, it.text);
      autoChat();
    }, function () { st.voiceDone = true; maybeAdvance(); });
  }

  // ─── 场景结束：视频播完后的推进策略 ──────────────────────────
  function onSceneEnd() {
    if(st.mediaDone)return;st.mediaDone = true; maybeAdvance();
  }

  function maybeAdvance() {
    var nd=node();if(!nd||nd.ui)return;
    if(nd.type==='ending'){if(st.mediaDone&&st.voiceDone)st.phase='ending';return;}
    if(st.mediaDone&&st.voiceDone)scheduleAuto(500,advance);
  }

  var _autoTimer = null;
  function scheduleAuto(ms, fn) {
    if (_autoTimer) { clearTimeout(_autoTimer); _autoTimer = null; }
    var id = st.curId;
    _autoTimer = setTimeout(function () {
      _autoTimer = null;
      if (st.curId !== id) return;    // 已切镜
      (fn || advance)();
    }, ms);
  }

  function advance() {
    var nd = node(); if (!nd) return;
    if (nd.ui) return;                                   // 有交互不自动走
    if (nd.type === 'ending' || !nd.next) { st.phase = 'ending'; return; }
    enter(nd.next);
  }

  // ─── 交互处理 ────────────────────────────────────────────────
  function handle(action) {
    if (!action) return;
    var nd = node();
    if (action === 'noop') return;   // 弹层遮罩吞噬点击，不发音、不响应
    if (action !== 'mute') Aud.foley('assets/audio/foley/ui-tap.wav');

    if (action === 'mute') {
      st.muted = !st.muted;
      Aud.setMuted(st.muted);
      if (st.video && st.video.muted !== undefined) { try { st.video.muted = st.muted; } catch (e) {} }
      return;
    }
    if (action === 'splash_start') { startGame(); return; }
    if (action === 'open_privacy') { st.showPrivacy = true; report('privacy_open', {}); return; }
    if (action === 'close_privacy') { st.showPrivacy = false; return; }
    if (action === 'toggle_pure')  { st.pureMode = !st.pureMode; return; }
    if (action === 'toggle_gift')  { st.giftOpen = !st.giftOpen; return; }
    if (action === 'toggle_hud')   { st.hudCollapsed = !st.hudCollapsed; return; }
    if (action.indexOf('need_stars:') === 0) {
      st.needStars = { cost: parseInt(action.slice(11), 10) || 0 };
      return;
    }
    if (action === 'need_stars_watch') {
      st.needStars = null;
      watchAd(M3.Config.AD_REWARD);
      return;
    }
    if (action === 'need_stars_cancel') { st.needStars = null; return; }
    if (action === 'restart')      { restart(); return; }
    if (action === 'supply')       { watchAd(M3.Config.AD_REWARD); return; }
    // 游戏结果弹窗的「继续」：弹窗改为常驻式（不再靠 1900ms 计时自动隐藏），
    // 必须显式清空 gameFx，否则弹层会永久盖住 HUD。
    // 注意：要早于下面的 'next' 分支，否则会被 onNextTap 先截走。
    if (action === 'next' && st.gameFx) { st.gameFx = null; return; }
    if (action === 'next')         { onNextTap(); return; }
    if (action === 'share')        { doShare(); return; }
    if (action === 'game_continue' && st.gameResultReady) { enter(nd.next); return; }


    // 452:13015 定装弹窗双按钮
    if (action === 'outfit_continue') {
      // 单件定装由 outfitAdvance 推进；组合定装照（shot-17 outfitReveal）
      // 没有 pending 流程，回落到常规「点击继续」推进。
      if (st.outfitAdvance) st.outfitAdvance();
      else onNextTap();
      return;
    }
    if (action === 'save_outfit') { saveOutfit(); return; }

    // 礼物「送给」目标切换（Figma 473:14803 选择器）
    if (action.indexOf('giftto:') === 0) {
      var tid = action.slice(7);
      if (Story.candidates[tid]) {
        st.giftTo = tid;
        toast('已选择送给 ' + Story.candidates[tid].short, Story.candidates[tid].color);
      }
      return;
    }

    // 送礼
    if (action.indexOf('gift:') === 0) {
      var gid = action.slice(5);
      var to = st.giftTo || Model.getSupport() || Model.ranking()[0].id;
      var e = Model.sendGift(to, gid, 1, st.curId);
      if (!e) {
        // v1.0.9 星光不足 → 弹窗提示
        var gInfo = Model.gift(gid); var cost0 = gInfo ? gInfo.cost : 0;
        st.needStars = { cost: cost0 };
        return;
      }
      st.pulses[to] = Date.now();
      flyGift(gid, to);
      buzz();                              // v1.0.10 送礼震动反馈
      playThanksVideo(to);                 // v1.0.10 感谢视频（4s 覆盖层）
      var g = Model.gift(gid);
      toast(Story.candidates[to].short + ' +' + (g.votes).toLocaleString() + ' 票');
      pushChat('你', '送出' + g.name, true);
      return;
    }

    // 分支选项
    if (action.indexOf('branch:') === 0 && nd && nd.ui) {
      chooseBranch(nd, +action.slice(7));
      return;
    }
    // 选定支持者
    if (action.indexOf('support:') === 0 && nd && nd.ui) {
      var opt = nd.ui.options[+action.slice(8)];
      if (opt.starCost && !Model.spendStars(opt.starCost)) { st.needStars = { cost: opt.starCost }; return; }
      Model.chooseSupport(opt.value);
      Model.recordVote(opt.value, 1200, 'player', nd.id);
      st.pulses[opt.value]=Date.now();
      Model.settle('rival', 'boot');   // 预定对手
      toast('已 all in ' + Story.candidates[opt.value].short, Story.candidates[opt.value].color);
      pushChat('你', '我押' + Story.candidates[opt.value].short + '！', true);
      enter(nd.next);
      return;
    }
    if (action.indexOf('room:') === 0 && nd && nd.ui && nd.ui.type === 'outfit-hub') {
      var roomId = action.slice(5);
      if (roomId === 'skip') { enter(nd.next); return; }
      if (!Story.candidates[roomId] || st.outfitDone[roomId] || roomId === Model.getSupport()) return;
      if (!Model.spendStars(M3.Config.OUTFIT_UNLOCK_COST)) { toast('需要 ' + M3.Config.OUTFIT_UNLOCK_COST + ' 星光解锁化妆间', '#ffbb55'); return; }
      st.pending = { kind:'outfit', queue:[roomId], whoIdx:0, who:roomId, slots:nd.ui.slots, slotIdx:0, fromHub:true };
      st.outfitPreview = null;
      if(nd.videoByWho&&nd.videoByWho[roomId])setVideo(nd.videoByWho[roomId],function(){},{embedded:false,loop:true});
      if(nd.posterByWho&&nd.posterByWho[roomId])setPoster(nd.posterByWho[roomId]);
      toast(Story.candidates[roomId].short + '化妆间已解锁');
      playOutfitPrompt(nd, st.pending);
      return;
    }
    if (action.indexOf('silhouette:') === 0 && nd && nd.ui && nd.ui.type === 'silhouette-pick') {
      var sIdx = +action.slice(11);
      var sOpt = (nd.ui.options || [])[sIdx];
      if (!sOpt) return;
      if (sOpt.cid) {
        // 记录一次"点选"投票，让被选中的候选人在实时排名里加分
        try { Model.recordVote(sOpt.cid, 300, 'player', nd.id); } catch (e) {}
        st.pulses[sOpt.cid] = Date.now();
        toast('老板选了 ' + (Story.candidates[sOpt.cid] && Story.candidates[sOpt.cid].short) + '，她从屏风后走出来了',
              Story.candidates[sOpt.cid] && Story.candidates[sOpt.cid].color);
      }
      enter(sOpt.next);
      return;
    }
    // 换装 / 小游戏选择
    if (action.indexOf('pick:') === 0) { onPick(nd, +action.slice(5)); return; }
    if (action.indexOf('multi:') === 0) { onMulti(nd, +action.slice(6)); return; }
    if (action === 'pick_done') { onPickDone(nd); return; }
    if (action === 'ad_skip')   { enter(nd.next); return; }
    if (action === 'ad_watch')  { watchAd(nd.ui.reward, function () { enter(nd.next); }); return; }
  }

  function onNextTap() {
    var nd = node();
    if (!nd) { restart(); return; }
    if (nd.ui && nd.ui.type === 'enter-live') { enter(nd.next); return; }
    if (nd.ui && nd.ui.type === 'confirm')    { enter(nd.next); return; }
    if (nd.ui && nd.ui.type === 'continue')   { enter(nd.next); return; }
    if (nd.type === 'ending') { restart(); return; }
    advance();
  }

  function chooseBranch(nd, idx) {
    var o = nd.ui.options[idx]; if (!o) return;
    var to = o.toSupport ? Model.getSupport() : (o.to || Model.getSupport() || Model.ranking()[0].id);

    if (o.gift) {
      var e = Model.sendGift(to, o.gift, o.count || 1, nd.id);
      if (!e) {
        var gInfo2 = Model.gift(o.gift); var cost2 = gInfo2 ? gInfo2.cost * (o.count || 1) : 0;
        st.needStars = { cost: cost2 };
        return;
      }
      st.pulses[to] = Date.now();
      flyGift(o.gift, to);
      buzz();                              // v1.0.10 震动
      playThanksVideo(to);                 // v1.0.10 感谢视频
      var g = Model.gift(o.gift);
      toast(g.name + ' → ' + Story.candidates[to].short + ' +' + g.votes * (o.count || 1) + ' 票');
      pushChat('你', '送出' + g.name + (o.count > 1 ? ' ×' + o.count : ''), true);
    }
    if (o.action === 'rally' && to) {
      var p = Model.rallyPower(to);
      Model.recordVote(to, p, 'player', nd.id);
      st.pulses[to] = Date.now();
      toast('老板号召！' + Story.candidates[to].short + ' +' + p.toLocaleString() + ' 票');
      pushChat('系统', '全场老板响应号召！', true);
    }
    enter(o.next);
  }

  // 换装 / 单选小游戏
  function onPick(nd, idx) {
    var ui = nd.ui;
    if (ui.type === 'outfit' || ui.type === 'outfit-all' || ui.type === 'outfit-dynamic' || (ui.type === 'outfit-hub' && st.pending)) {
      var p = st.pending;
      if (st.outfitSpeaking) return;
      var slot = p.slots[p.slotIdx];
      var list = Story.outfits[p.who][slot] || [];
      var item = list[idx]; if (!item) return;
      var baseCost=item.cost||0,giftCost=0;
      if(item.gift){var gift=Model.gift(item.gift);giftCost=gift?gift.cost*(item.count||1):0;}
      var cost=(baseCost||giftCost)?(baseCost||giftCost)*10:M3.Config.OUTFIT_COST[slot];
      var surcharge=p.who!==Model.getSupport()?M3.Config.OTHER_ROOM_MULT:1;
      cost=Math.min(M3.Config.STAR_MAX,Math.round(cost*surcharge));
      if(!Model.canAfford(cost)){toast('需要 '+cost+' 星光，先补给再换装','#ffbb55');return;}
      Model.saveOutfit(p.who, slot, item.label);
      Model.spendStars(cost);
      Model.recordVote(p.who, 600, 'player', nd.id);
      st.pulses[p.who] = Date.now();
      if (item.gift) flyGift(item.gift, p.who);
      if (item.media) setPoster(item.media);
      var previewWho=p.who,previewMedia=item.media;
      st.outfitPreview={who:previewWho,slot:slot,label:item.label,media:previewMedia,cost:cost,t0:Date.now(),imageReady:!item.media,voiceReady:!item.responseAudio};
      st.outfitPreviewDone=false;
      // 图加载完成只置标记，不再调 maybeFinishOutfit：
      // 推进权交给 452:13015 弹窗的「继续游戏」，否则第三件会绕过弹窗直接跳幕。
      if(item.media)L.loadImage(item.media,function(im){if(st.outfitPreview&&st.outfitPreview.media===previewMedia&&st.outfitPreview.who===previewWho&&st.pending&&previewWho===st.pending.who){st.outfitPreview.image=im;st.outfitPreview.imageReady=true;}});
      toast(Story.candidates[p.who].short + ' · ' + item.label + '（-'+cost+' 星光）', Story.candidates[p.who].color);
      if (item.responseText) say(Story.candidates[p.who].short, item.responseText);
      nextSlot(nd);
      st.outfitSpeaking=true;
      function afterResponse(){
        if(st.pending!==p||st.curId!==nd.id)return;
        if(st.outfitPreview&&st.outfitPreview.media===previewMedia&&st.outfitPreview.who===previewWho)st.outfitPreview.voiceReady=true;
        st.outfitSpeaking=false;
        // 452:13015 弹窗接管推进：不再自动跳下一件/下一幕，等玩家点「继续游戏」。
        // 没有定装照可展示时（缺图）保持原自动流程，避免卡死。
        if(!previewMedia){
          if(p.slotIdx>=p.slots.length)maybeFinishOutfit(nd,p);
          else setTimeout(function(){if(st.pending===p&&st.curId===nd.id)playOutfitPrompt(nd,p);},700);
          return;
        }
        st.outfitAdvance=function(){
          if(st.pending!==p||st.curId!==nd.id)return;
          st.outfitAdvance=null;
          st.outfitPreview=null;
          if(p.slotIdx>=p.slots.length)maybeFinishOutfit(nd,p);
          else playOutfitPrompt(nd,p);
        };
        // 兜底：定装照 3.5s 内没加载出来（CDN 失败等），弹窗不会显示，
        // 此时自动推进，避免玩家卡在没有任何可点按钮的界面。
        var advanceRef=st.outfitAdvance;
        setTimeout(function(){
          if(st.outfitAdvance!==advanceRef)return;                 // 玩家已点过
          if(st.outfitPreview&&st.outfitPreview.image)return;       // 弹窗已正常显示
          advanceRef();
        },3500);
      }
      if(item.responseAudio)Aud.play(item.responseAudio,afterResponse);
      else setTimeout(afterResponse,900);
      return;
    }
    // 小游戏单选
    if(st.gameLocked)return;
    var opts = ui.options || [];
    var label = opts[idx]; if (label == null) return;
    if(ui.game==='split-rps'){
      var support=Model.getSupport()||Model.ranking()[0].id;
      if(label===Story.candidates[support].short){toast('不能和自己猜拳，请选另一位','#ffbb55');return;}
      st.gameFx={game:'split-rps',label:Story.candidates[support].short+' VS '+label,t0:Date.now(),support:support,ranking:Model.ranking()};
    }
    else st.gameFx={game:ui.game,label:label,t0:Date.now(),support:Model.getSupport(),ranking:Model.ranking()};
    if (ui.game === 'benefit') {
      Model.setBenefit(label);
      toast('第一名获得：' + label);
    } else {
      var win = Model.getSupport() || Model.ranking()[0].id;
      Model.addWin(win, ui.game);
      Model.recordVote(win, 1500, 'player', nd.id);
      st.pulses[win] = Date.now();
      toast('你选了「' + label + '」· ' + Story.candidates[win].short + ' +1500 票');
    }
    pushChat('你', '选择：' + label, true);
    beginGameReplay(nd,Model.getSupport() || Model.ranking()[0].id);
  }

  function slot2cn(s) {
    return s === 'accessory' ? '装饰' : s === 'clothes' ? '服装' : '道具';
  }

  // 多选（选 5 个字母）
  function onMulti(nd, idx) {
    if(st.gameLocked)return;
    var p = st.pending;
    var label = nd.ui.options[idx];
    var at = p.picked.indexOf(label);
    if (at >= 0) p.picked.splice(at, 1);
    else if (p.picked.length < nd.ui.pick) p.picked.push(label);
    if (p.picked.length === nd.ui.pick) toast('已选满 ' + nd.ui.pick + ' 个，点击确认');
  }

  function onPickDone(nd) {
    if(st.gameLocked)return;
    var p = st.pending;
    var win = Model.getSupport() || Model.ranking()[0].id;
    Model.addWin(win, nd.ui.game);
    Model.recordVote(win, 1800, 'player', nd.id);
    st.pulses[win] = Date.now();
    toast('字母：' + p.picked.join(' ') + ' · ' + Story.candidates[win].short + ' +1800 票');
    st.gameFx={game:'body-letter',label:p.picked.join(' · '),t0:Date.now(),support:win,ranking:Model.ranking()};
    pushChat('你', '选了 ' + p.picked.join('/'), true);
    beginGameReplay(nd,win);
  }

  // 换装：推进到下一个部位 / 下一位候选人
  function nextSlot(nd) {
    var p = st.pending;
    p.slotIdx++;
  }

  function playOutfitPrompt(nd,p){
    if(!p||st.pending!==p||p.slotIdx>=p.slots.length)return;
    var slot=p.slots[p.slotIdx],who=p.who;
    var textMap=nd.outfitPromptTextByWho&&nd.outfitPromptTextByWho[who];
    var audioMap=nd.outfitPromptAudioByWho&&nd.outfitPromptAudioByWho[who];
    var text=textMap&&textMap[slot],audio=audioMap&&audioMap[slot];
    var run=++st.outfitPromptRun;
    st.outfitSpeaking=!!audio;
    if(text)say(Story.candidates[who].short,text);
    if(audio)Aud.play(audio,function(){if(run===st.outfitPromptRun&&st.pending===p&&p.slots[p.slotIdx]===slot)st.outfitSpeaking=false;});
  }

  function finishOutfitPreview(nd,p) {
    if (st.outfitPreviewDone || st.pending !== p) return;
    st.outfitPreviewDone = true;
    // 玩家已在 452:13015 弹窗点过「继续游戏」，此处直接推进，不再二次等待。
    st.outfitDone[p.who] = true;
    st.outfitPreview = null;
    st.pending = null;
    if (p.fromHub) {
      say('老板助理', Story.candidates[p.who].short + '定装完成。还要解锁其他人，还是直接给老板展示？');
    } else {
      enter(nd.next);
    }
  }

  function maybeFinishOutfit(nd,p){
    if(!p||p.slotIdx<p.slots.length)return;
    // outfitPreview 可能已被弹窗「继续游戏」清掉，这里只校验进度
    if(!st.outfitPreview||(st.outfitPreview.imageReady&&st.outfitPreview.voiceReady))finishOutfitPreview(nd,p);
  }

  function playResultClip(nd, who, done) {
    var file = nd.resultVideoBySupport && nd.resultVideoBySupport[who];
    if (!file) { setTimeout(done, 1400); return; }
    say(Story.candidates[who].short, '这一轮表现完成！精彩片段回放中。');
    var clip=nd.resultClip||{startSec:6.5,durationMs:3800};
    if (!L.isKS) { setTimeout(done, 1400); return; }
    setVideo(file, done, { embedded:false, startSec:clip.startSec, maxMs:clip.durationMs });
  }

  function beginGameReplay(nd,who){
    st.gameLocked=true;st.gameResultReady=false;
    playResultClip(nd,who,function(){
      if(st.curId!==nd.id||st.gameResultReady)return;
      st.gameResultReady=true;
      say('老板助理','本轮精彩回放结束，结果已计入实时排名。确认后进入下一项考核。');
    });
  }

  // ─── 激励视频 ────────────────────────────────────────────────
  function watchAd(reward, done) {
    if (st.adBusy) return;
    if (!Model.canWatchAd()) { toast('今日补给次数已用完', '#ffbb55'); return; }
    st.adBusy = true;
    st.adLoading = true;             // 展示"正在加载中"遮罩，直到 SDK 回调
    var r = reward || M3.Config.AD_REWARD;
    var loadingTimer = setTimeout(function () {
      // 兜底：8 秒还没起播就自动清理 loading 态，避免遮罩卡死
      if (st.adLoading) { st.adLoading = false; }
    }, 8000);

    function clearLoading() {
      st.adLoading = false;
      if (loadingTimer) { clearTimeout(loadingTimer); loadingTimer = null; }
    }

    function ok() {
      clearLoading();
      st.adBusy = false;
      Model.markAdView();
      Model.addStars(r);
      toast('补给到账 +' + r + ' 星光');
      report('ad_reward_ok', { node: st.curId, reward: r });
      done && done();
    }
    function fail() {
      clearLoading();
      st.adBusy = false;
      toast('未看完广告，未获得补给', '#ffbb55');
      report('ad_cancel', { node: st.curId });
    }
    report('ad_click', { node: st.curId });

    if (window.KwaiAd && window.KwaiAd.showRewarded) window.KwaiAd.showRewarded(ok, fail);
    else { clearLoading(); ok(); }   // H5 预览直接发放，方便自测
  }

  function report(evt, params) {
    try {
      if (typeof ks !== 'undefined' && ks.reportAnalytics) ks.reportAnalytics(evt, params || {});
    } catch (e) {}
    console.log('[report]', evt, params);
  }

  // 452:13091「保存到手机」：把当前定装照存进相册
  //   快手运行时用 ks.saveImageToPhotosAlbum（需先落成本地临时文件）；
  //   H5 预览无该能力，仅提示，不阻塞流程。
  function saveOutfit() {
    var p = st.outfitPreview, media = p && p.media, who = p && p.who, label = p && p.label;
    // 组合定装照（shot-17）没有 outfitPreview，回落保存该候选人的服装定装图
    if (!media) {
      var nd = node();
      if (nd && nd.outfitReveal) {
        who = Model.getSupport() || Model.ranking()[0].id;
        var look = Model.getOutfit(who), slots = ['clothes', 'accessory', 'prop'];
        for (var i = 0; i < slots.length && !media; i++) {
          var list = Story.outfits[who] && Story.outfits[who][slots[i]];
          var picked = look[slots[i]];
          if (!list || !picked) continue;
          for (var j = 0; j < list.length; j++) {
            if (list[j].label === picked) { media = list[j].media; label = picked; break; }
          }
        }
      }
    }
    if (!media) { toast('暂无可保存的定装照', '#ffbb55'); return; }
    var url = M3.Config.url(media);
    report('outfit_save_click', { who: who, label: label });

    if (typeof ks === 'undefined' || !ks.saveImageToPhotosAlbum) {
      toast('当前环境不支持保存', '#ffbb55');
      return;
    }
    // 远程图先下载到本地临时路径，再存相册
    if (/^https?:/.test(url) && ks.downloadFile) {
      ks.downloadFile({
        url: url,
        success: function (res) {
          if (res.statusCode !== 200 || !res.tempFilePath) { toast('保存失败，请重试', '#ff6b8a'); return; }
          ks.saveImageToPhotosAlbum({
            filePath: res.tempFilePath,
            success: function () { toast('已保存到相册', '#7CFFB2'); },
            fail: function () { toast('保存失败，请检查相册权限', '#ff6b8a'); }
          });
        },
        fail: function () { toast('图片下载失败', '#ff6b8a'); }
      });
      return;
    }
    ks.saveImageToPhotosAlbum({
      filePath: url,
      success: function () { toast('已保存到相册', '#7CFFB2'); },
      fail: function () { toast('保存失败，请检查相册权限', '#ff6b8a'); }
    });
  }

  function doShare() {
    var champ = Model.ranking()[0];
    var title = '我在提艾默酒吧把「' + Story.candidates[champ.id].short + '」捧成了今日店长，来试试你的眼光！';
    if (window.KwaiShare && window.KwaiShare.share) window.KwaiShare.share({ title: title });
    toast('已唤起分享');
    report('share_click', { champion: champ.id });
  }

  // ─── 生命周期 ────────────────────────────────────────────────
  function startGame() {
    st.phase = 'live';
    st.starT = Date.now();
    bootPrefetch();
    enter(Story.entry);
    report('game_start', {});
  }

  function restart() {
    Aud.stopAll(); clearVideo();
    Model.reset();
    st.phase = 'splash';
    st.chat = []; st.toasts = []; st.particles = []; st.pulses = {};
    st.broadcast = null; st.pending = null; st.poster = null; st.posterKey = null;
    st.curId = Story.entry;
    st.appliedEntryVotes = {};
    st.outfitDone = {}; st.outfitPreviewDone = false; st.outfitSpeaking = false;
    st.outfitAdvance = null;
  }

  // 每帧：仅随机弹幕（v1.0.9 起排名不再自动波动，只由玩家送礼/剧本事件驱动）
  var _lastChat = 0;
  function tick() {
    if (st.phase !== 'live') return;
    var now = Date.now();
    if (now - _lastChat > 2600) { _lastChat = now; autoChat(); }
  }

  // ─── 交互态初始化（换装 / 多选）──────────────────────────────
  function ensurePending(nd) {
    if (st.pending || !nd.ui) return;
    var ui = nd.ui;
    if (ui.type === 'outfit' || ui.type === 'outfit-dynamic') {
      var outfitWho=ui.who==='support'?(Model.getSupport()||Model.ranking()[0].id):ui.who;
      st.pending = { kind: 'outfit', queue: [outfitWho], whoIdx: 0, who: outfitWho, slots: ui.slots, slotIdx: 0 };
      playOutfitPrompt(nd,st.pending);
    } else if (ui.type === 'outfit-all') {
      st.pending = { kind: 'outfit', queue: ui.candidates.slice(), whoIdx: 0, who: ui.candidates[0], slots: ui.slots, slotIdx: 0 };
    } else if (ui.type === 'game-multi') {
      st.pending = { kind: 'multi', picked: [] };
    }
  }

  M3.Engine = {
    bind: bind, state: st, node: node, handle: handle, tick: tick,
    ensurePending: ensurePending, startGame: startGame, restart: restart,
    watchAd: watchAd, report: report
  };
})();
