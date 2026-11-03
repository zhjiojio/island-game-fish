// MAIN · 我的温柔未婚妻 · Flash 主循环（F1-F30 完整版）
(function () {
  const S = window.SCRIPT;
  const $ = id => document.getElementById(id);
  const NODE_ORDER = Array.from({length: 30}, (_, i) => 'f' + (i + 1));
  const state = {
    favor: 50, taboo: 0, anchors: new Set(), cgUnlocked: new Set(),
    current: S.entry, muted: false
  };
  const bgm = $('bgm'), voice = $('voice');
  bgm.volume = 0.35; voice.volume = 1.0;

  function initDots() {
    const dots = $('dots');
    dots.innerHTML = '';
    // 30 帧太密 → 每 5 帧一颗大点，其间小点
    NODE_ORDER.forEach((k, i) => {
      const i2 = document.createElement('i');
      i2.dataset.k = k;
      const isAnchor = S.anchors.includes(i + 1);
      if (isAnchor) i2.classList.add('anchor');
      dots.appendChild(i2);
    });
  }
  function updateDots(cur) {
    const idx = NODE_ORDER.indexOf(cur);
    document.querySelectorAll('#dots i').forEach((el, i) => {
      el.classList.remove('done', 'now');
      if (i < idx) el.classList.add('done');
      else if (i === idx) el.classList.add('now');
    });
  }
  function updateFavor(delta) {
    state.favor = Math.max(0, Math.min(200, state.favor + delta));
    $('favor-val').textContent = state.favor;
    $('favor-fill').style.width = Math.min(100, state.favor / 200 * 100) + '%';
    if (delta !== 0) {
      const pop = $('favor-pop');
      pop.textContent = (delta > 0 ? '+' : '') + delta;
      pop.classList.toggle('neg', delta < 0);
      pop.classList.remove('show'); void pop.offsetWidth; pop.classList.add('show');
    }
  }
  function playVoice(name) {
    if (!name) return;
    voice.src = `../assets/audio/${name}.mp3`;
    voice.currentTime = 0;
    const p = voice.play();
    if (p && p.catch) p.catch(() => {});
    const portrait = $('portrait');
    portrait.classList.remove('speaking'); void portrait.offsetWidth; portrait.classList.add('speaking');
    voice.onended = () => portrait.classList.remove('speaking');
  }
  function playTalkingVideo(name) {
    // f1-final 是带音频的（画面 + 台词）
    const vid = $('portrait-video'), img = $('portrait');
    vid.src = `../assets/video/${name}.mp4`;
    vid.muted = state.muted;
    vid.currentTime = 0;
    vid.classList.remove('hidden');
    img.style.opacity = '0';
    const p = vid.play();
    if (p && p.catch) p.catch(() => {});
    vid.onended = () => {
      vid.classList.add('hidden');
      img.style.opacity = '1';
    };
  }
  function startBgm() {
    if (!state.muted) { const p = bgm.play(); if (p && p.catch) p.catch(() => {}); }
  }
  function playSfx(kind) {
    try {
      const ctx = state.audioCtx || (state.audioCtx = new (window.AudioContext || window.webkitAudioContext)());
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine';
      o.frequency.value = kind === 'up' ? 880 : kind === 'down' ? 320 : 660;
      g.gain.setValueAtTime(0.15, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
      o.connect(g); g.connect(ctx.destination);
      o.start(); o.stop(ctx.currentTime + 0.15);
    } catch (e) {}
  }

  function renderNode(id) {
    const n = S.nodes[id];
    if (!n) return;
    state.current = id;
    $('scene').dataset.scene = n.scene;
    $('bubble-text').textContent = n.text;
    updateDots(id);

    // F30 结局判定 gate
    if (n.isEndingGate) {
      $('choices').innerHTML = '';
      const btn = document.createElement('button');
      btn.className = 'choice';
      btn.dataset.kind = 'A';
      btn.innerHTML = `<span class="ico">♥</span><span class="txt">继续 ▶ 见证结局</span>`;
      btn.onclick = () => renderEnding();
      $('choices').appendChild(btn);
      $('bubble-text').textContent = `你和苏小雨的故事，走到了终章……`;
      return;
    }

    const portrait = $('portrait');
    portrait.classList.remove('enter'); void portrait.offsetWidth; portrait.classList.add('enter');

    if (n.ad) {
      renderChoices(n);
      playVoice(n.voice);
      return;
    }
    renderChoices(n);
    if (n.talkingVideo) {
      playTalkingVideo(n.talkingVideo);
    } else {
      playVoice(n.voice);
    }
  }

  function renderChoices(n) {
    const box = $('choices'); box.innerHTML = '';
    n.choices.forEach((c) => {
      const btn = document.createElement('button');
      btn.className = 'choice';
      btn.dataset.kind = c.kind;
      if (c.anchor) btn.dataset.anchor = '1';
      const ico = c.kind === 'A' ? '♥' : c.kind === 'B' ? '★' : '○';
      btn.innerHTML = `<span class="ico">${ico}</span><span class="txt">${c.text}</span>`;
      btn.onclick = () => choose(n, c);
      box.appendChild(btn);
    });
  }

  function choose(node, c) {
    playSfx(c.favor > 0 ? 'up' : c.favor < 0 ? 'down' : 'flat');
    if (node.ad && c.ad) {
      showAd(() => {
        state.cgUnlocked.add(node.scene);
        showCG(node.scene, '💗 CG 已解锁');
        setTimeout(() => hideCG(), 2400);
        proceed(c);
      });
      return;
    }
    proceed(c);
  }

  function proceed(c) {
    updateFavor(c.favor || 0);
    if (c.taboo) state.taboo += c.taboo;
    if (c.anchor) state.anchors.add(c.anchor === true ? state.current : c.anchor);

    $('reaction-text').textContent = c.reaction || '';
    $('reaction').classList.remove('hidden');
    $('reaction-next').onclick = () => {
      $('reaction').classList.add('hidden');
      if (c.next === 'ending') renderEnding();
      else renderNode(c.next);
    };
  }

  function showAd(cb) {
    $('ad-modal').classList.remove('hidden');
    $('ad-watch').onclick = () => {
      const btn = $('ad-watch');
      let s = 5; btn.disabled = true;
      btn.textContent = `广告播放中… ${s}s`;
      const t = setInterval(() => {
        s--; btn.textContent = `广告播放中… ${s}s`;
        if (s <= 0) {
          clearInterval(t);
          btn.textContent = '观看广告 · 5s'; btn.disabled = false;
          $('ad-modal').classList.add('hidden');
          cb && cb();
        }
      }, 1000);
    };
    $('ad-skip').onclick = () => {
      $('ad-modal').classList.add('hidden');
      cb && cb();
    };
  }
  function showCG(id, label) {
    const layer = $('cg-layer');
    layer.innerHTML = `<div class="cg-label">${label} · ${id.toUpperCase()}</div><img src="../assets/reference/su-xiaoyu-master.png" alt="CG" />`;
    layer.classList.remove('hidden');
  }
  function hideCG() { $('cg-layer').classList.add('hidden'); }

  function pickEnding() {
    const anchorCount = state.anchors.size;
    // HE：≥ 170 且 5 锚点全命中
    if (state.favor >= 170 && anchorCount >= 5) return 'HE';
    // BE：< 80 或 禁忌 ≥ 3
    if (state.favor < 80 || state.taboo >= 3) return 'BE';
    // GE：130-169
    if (state.favor >= 130) return 'GE';
    // NE：80-129
    return 'NE';
  }
  function renderEnding() {
    const type = pickEnding();
    const meta = S.endings[type];
    $('ending-title').textContent = meta.title;
    $('ending-sub').textContent = `${meta.sub}\n"${meta.line}"`;
    $('ending-favor').textContent = state.favor;
    $('ending-anchor').textContent = `${state.anchors.size} / 5 · ${state.anchors.size === 5 ? '全命中 ✅' : '部分命中'}`;
    // 结局 CG 样式
    const cg = $('ending-cg');
    cg.style.filter = type === 'HE' ? 'saturate(1.15) brightness(1.05)' :
                      type === 'GE' ? 'saturate(0.9)' :
                      type === 'NE' ? 'saturate(0.6) brightness(0.85)' :
                                      'saturate(0.3) brightness(0.6) contrast(0.95)';
    $('ending').classList.remove('hidden');
    playVoice(`voice-${type.toLowerCase()}`);
    if (!state.muted) bgm.volume = 0.15;
  }

  $('restart').onclick = () => {
    state.favor = 50; state.taboo = 0;
    state.anchors = new Set(); state.cgUnlocked = new Set();
    $('ending').classList.add('hidden');
    bgm.volume = 0.35;
    updateFavor(0); $('favor-val').textContent = 50; $('favor-fill').style.width = '25%';
    renderNode(S.entry);
  };
  $('mute').onclick = () => {
    state.muted = !state.muted;
    $('mute').textContent = state.muted ? '🔇' : '🔊';
    bgm.muted = state.muted; voice.muted = state.muted;
    if (!state.muted) startBgm();
  };

  const kick = () => { startBgm(); document.removeEventListener('click', kick); document.removeEventListener('touchstart', kick); };
  document.addEventListener('click', kick, { once: true });
  document.addEventListener('touchstart', kick, { once: true });

  initDots();
  updateFavor(0);
  renderNode(S.entry);
})();
