// game.js · 主循环 · 状态机 · 触摸处理
(function () {
  var G = GameGlobal;

  var State = {
    favor: 50,
    taboo: 0,
    anchors: null,
    cgUnlocked: null,
    currentNode: null,
    frameIndex: 0,
    muted: false,
    // 阶段：node | reaction | ad | ending
    stage: 'node',
    reactionText: '',
    pendingChoice: null,   // 反应过场后要走的 choice
    adCountdown: 0,        // >0 表示广告倒计时中
    endingType: null,
    endingMeta: null,
    // hit rects
    reactionBtn: null,
    adBtns: null,
    endingBtns: null,
    videoPlaying: false
  };

  function reset() {
    State.favor = 50; State.taboo = 0;
    State.anchors = { size: 0, _set: {} };
    State.anchors.add = function (k) {
      if (!this._set[k]) { this._set[k] = 1; this.size++; }
    };
    State.cgUnlocked = {};
    State.stage = 'node';
    State.pendingChoice = null;
    State.adCountdown = 0;
    State.endingType = null;
    State.endingMeta = null;
    State.videoPlaying = false;
  }

  var NODE_ORDER = [];
  for (var i = 1; i <= 30; i++) NODE_ORDER.push('f' + i);

  function renderNode(id) {
    var S = G.SCRIPT;
    var n = S.nodes[id];
    if (!n) return;
    State.currentNode = n;
    State.frameIndex = NODE_ORDER.indexOf(id);
    State.stage = 'node';
    G.Audio.stopVoice();
    G.Video.destroy();
    State.videoPlaying = false;
    // 结局 Gate
    if (n.isEndingGate) {
      // 用 A 按钮触发进入结局
      requestDraw();
      return;
    }
    // 优先播视频（走 CDN URL 表）；视频不存在或播放异常时降级播 voice
    var vidUrl = n.talkingVideo && G.VideoAssets && G.VideoAssets[n.talkingVideo];
    if (vidUrl) {
      State.videoPlaying = true;
      var rect = G.Scene.getVideoRect();
      G.Video.play(vidUrl, rect, function () {
        State.videoPlaying = false;
        requestDraw();
      });
    } else if (n.voice) {
      G.Audio.playVoice(n.voice);
    }
    requestDraw();
  }

  function choose(node, c) {
    if (node.ad && c.ad) {
      // 进入广告卡点
      State.stage = 'ad';
      State.adCountdown = 0;
      State.pendingChoice = c;
      G.Audio.stopVoice();
      G.Video.destroy();
      State.videoPlaying = false;
      requestDraw();
      return;
    }
    proceed(c);
  }

  function proceed(c) {
    State.favor = Math.max(0, Math.min(200, State.favor + (c.favor || 0)));
    if (c.taboo) State.taboo += c.taboo;
    if (c.anchor) State.anchors.add(c.anchor === true ? State.currentNode.scene : c.anchor);

    State.reactionText = c.reaction || '';
    State.pendingChoice = c;
    State.stage = 'reaction';
    G.Audio.stopVoice();
    G.Video.destroy();
    State.videoPlaying = false;
    requestDraw();
  }

  function afterReaction() {
    var c = State.pendingChoice;
    State.pendingChoice = null;
    if (!c) return;
    if (c.next === 'ending') { renderEnding(); return; }
    renderNode(c.next);
  }

  function pickEnding() {
    var anchorCount = State.anchors.size;
    if (State.favor >= 170 && anchorCount >= 5) return 'HE';
    if (State.favor < 80 || State.taboo >= 3) return 'BE';
    if (State.favor >= 130) return 'GE';
    return 'NE';
  }
  function renderEnding() {
    var type = pickEnding();
    State.endingType = type;
    State.endingMeta = G.SCRIPT.endings[type];
    State.stage = 'ending';
    G.Audio.playVoice('voice-' + type.toLowerCase());
    requestDraw();
  }

  // 广告倒计时（每 1s tick 一次）
  var adTimer = null;
  function startAd() {
    if (State.adCountdown > 0) return;
    State.adCountdown = 5;
    requestDraw();
    adTimer = setInterval(function () {
      State.adCountdown--;
      if (State.adCountdown <= 0) {
        clearInterval(adTimer); adTimer = null;
        // 解锁 CG
        State.cgUnlocked[State.currentNode.scene] = 1;
        // 走 proceed
        State.stage = 'node';
        var c = State.pendingChoice;
        proceed(c);
      } else {
        requestDraw();
      }
    }, 1000);
  }
  function skipAd() {
    if (adTimer) { clearInterval(adTimer); adTimer = null; }
    State.adCountdown = 0;
    var c = State.pendingChoice;
    State.stage = 'node';
    proceed(c);
  }

  // === 绘制主循环 ===
  var dirty = true;
  function requestDraw() { dirty = true; }
  function frame() {
    // 视频播放中不清屏，直接靠视频原生层显示；只重画 hud+bubble+choices
    if (dirty) {
      draw();
      dirty = false;
    }
    // 广告倒计时时需持续刷新（timer 已控制），此外无需持续渲染
    requestAnimationFrame(frame);
  }

  function draw() {
    var Sc = G.Scene;
    Sc.clear();
    var n = State.currentNode;
    if (State.stage === 'ending' && State.endingMeta) {
      State.endingBtns = Sc.drawEnding(State, State.endingMeta, State.endingType);
      return;
    }
    // 场景
    Sc.drawScene(n ? n.scene : 'f1');
    // 立绘 / 视频区
    if (!State.videoPlaying) Sc.drawPortrait(n && n.env);
    // HUD
    State.frameIndex = NODE_ORDER.indexOf(n ? ('f' + (NODE_ORDER.indexOf(State.currentNode && (State.currentNode.scene)) + 1)) : 'f1');
    // 用 currentNode.scene（f1-f30）反查
    var idx = n ? NODE_ORDER.indexOf(n.scene) : 0;
    State.frameIndex = idx < 0 ? 0 : idx;
    Sc.drawHud(State);
    // 气泡
    if (n) {
      if (n.isEndingGate) {
        var fake = { text: '你和苏小雨的故事，走到了终章……', env: '★ 结局判定' };
        Sc.drawBubble(fake);
        Sc.drawChoices([{ kind: 'A', text: '继续 ▶ 见证结局' }], -1);
      } else {
        Sc.drawBubble(n);
        Sc.drawChoices(n.choices, -1);
      }
    }
    if (State.stage === 'reaction') {
      State.reactionBtn = Sc.drawReaction(State.reactionText);
    } else if (State.stage === 'ad') {
      State.adBtns = Sc.drawAdModal(State.adCountdown);
    }
  }

  // === 触摸 ===
  function onTap(pt) {
    var Sc = G.Scene;
    // mute
    if (Sc.hit(pt, Sc.getMuteRect())) {
      State.muted = !State.muted;
      G.Audio.setMuted(State.muted);
      requestDraw();
      return;
    }
    if (State.stage === 'ending') {
      if (State.endingBtns && Sc.hit(pt, State.endingBtns.restart)) {
        reset();
        renderNode(G.SCRIPT.entry);
      }
      return;
    }
    if (State.stage === 'reaction') {
      if (State.reactionBtn && Sc.hit(pt, State.reactionBtn)) {
        State.stage = 'node';
        afterReaction();
      }
      return;
    }
    if (State.stage === 'ad') {
      if (State.adBtns) {
        if (Sc.hit(pt, State.adBtns.watch) && !State.adBtns.watch.disabled) {
          startAd();
        } else if (Sc.hit(pt, State.adBtns.skip)) {
          skipAd();
        }
      }
      return;
    }
    // node 阶段 · 3 选项
    var n = State.currentNode;
    if (!n) return;
    if (n.isEndingGate) {
      var rects = Sc.getChoiceRects(1);
      if (Sc.hit(pt, rects[0])) {
        renderEnding();
      }
      return;
    }
    var rs = Sc.getChoiceRects(n.choices.length);
    for (var i = 0; i < rs.length; i++) {
      if (Sc.hit(pt, rs[i])) {
        choose(n, n.choices[i]);
        return;
      }
    }
  }

  ks.onTouchStart(function (e) {
    if (!e.touches || !e.touches[0]) return;
    var t = e.touches[0];
    onTap({ x: t.clientX || t.x || 0, y: t.clientY || t.y || 0 });
  });

  function boot() {
    reset();
    renderNode(G.SCRIPT.entry);
    requestAnimationFrame(frame);
  }

  G.MyFianceGame = { boot: boot };
})();
