(function (global) {
  'use strict';
  var UNLOCK_KEY = 'weihunqi_chapter_unlocks_v1';
  var DISPLAY_FONT = '"Songti SC", "STSong", "SimSun", serif';

  function read(key) {
    try {
      var value = typeof KwaiStorage !== 'undefined' ? KwaiStorage.getSync(key) : localStorage.getItem(key);
      var parsed = typeof value === 'string' ? JSON.parse(value || '{}') : value;
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch (_) { return {}; }
  }
  function write(key, value) {
    var json = JSON.stringify(value);
    if (typeof KwaiStorage !== 'undefined') KwaiStorage.setSync(key, json);
    else localStorage.setItem(key, json);
  }

  function create(options) {
    var ctx = options.ctx, W = options.width, H = options.height;
    // hidden 章节由内容配置控制，暂不在章节首页展示；保留对象数据供存档/迁移查询。
    var chapters = (options.chapters || []).filter(function (chapter) { return !chapter.hidden; });
    var unlocked = read(UNLOCK_KEY), progress = null;
    var pictures = {}, zones = [], scroll = 0, gesture = null, busy = false;
    var active = false, attempt = 0, notice = '', noticeUntil = 0;
    var dirty = true, velocity = 0, frameTime = 0, wheelTarget = null;
    var reducedMotion = !!options.reducedMotion;
    var clock = options.now || Date.now;
    var resumeVisible = false, sweepStart = null, sweepStep = -1, motionStep = -1, pulseScale = 1;
    var safeTop = options.safeTop || 24, safeBottom = options.safeBottom || 12;
    var contentW = Math.min(W - 32, 520), left = (W - contentW) / 2;
    // v92.9 · 页脚从 4 行压到 2 行（虚构声明+著作权人合并、认证号+隐私政策合并），
    //   固定高度 86→62，多出的 24px 全部还给章节卡区域，让最后一张卡（张姐）完整露出。
    var top = safeTop + 118, bottom = H - safeBottom - 62;
    var rowH = Math.max(132, Math.min(162, Math.round(contentW * 0.42))), gap = 18;
    var maxScroll = Math.max(0, chapters.length * (rowH + gap) - gap - (bottom - top));

    function find(id) { return chapters.filter(function (c) { return c.id === id; })[0]; }
    function savedFor(id) { return progress && progress.ep === id ? progress : null; }
    function clamp(value) { return Math.max(0, Math.min(maxScroll, value)); }
    function invalidate() { dirty = true; }
    function stopMotion() { velocity = 0; wheelTarget = null; frameTime = 0; }
    // The engine's existing animation loop owns scrolling and drawing, including on native devices.
    function update(now) {
      if (!active) return false;
      var dt = frameTime ? Math.max(0, now - frameTime) : 16;
      frameTime = now;
      var before = scroll;
      if (!gesture && !busy) {
        if (wheelTarget !== null) {
          scroll += (wheelTarget - scroll) * (1 - Math.exp(-dt / 55));
          if (Math.abs(wheelTarget - scroll) < 0.3) { scroll = wheelTarget; wheelTarget = null; }
        } else if (Math.abs(velocity) > 0.015) {
          var decay = Math.exp(-dt / 160);
          scroll = clamp(scroll + velocity * 160 * (1 - decay));
          velocity = scroll === 0 || scroll === maxScroll ? 0 : velocity * decay;
        } else { velocity = 0; }
      }
      if (noticeUntil && now >= noticeUntil) { noticeUntil = 0; dirty = true; }
      // Highlight the actual checkpoint (or EP01 for a fresh player), regardless
      // of old tutorial flags. Pause animation during gestures and offscreen.
      var nextSweep = -1, nextMotion = -1;
      if (!reducedMotion && resumeVisible && !gesture && !busy && !velocity && wheelTarget === null) {
        if (sweepStart === null) sweepStart = now;
        var age = Math.max(0, now - sweepStart);
        nextMotion = Math.floor(age / 33);
        if (age % 2600 < 850) nextSweep = Math.min(29, Math.floor((age % 2600) / 850 * 30));
        pulseScale = 1 + 0.08 * (0.5 - 0.5 * Math.cos(age / 2200 * Math.PI * 2));
      } else { sweepStart = null; pulseScale = 1; }
      var changed = dirty || scroll !== before || nextSweep !== sweepStep || nextMotion !== motionStep;
      sweepStep = nextSweep; motionStep = nextMotion;
      dirty = false;
      return changed;
    }
    // Preserve access to already-played scenes when an old free chapter is split.
    function migrateSave(value) {
      if (!value || typeof value !== 'object') return value;
      var rules = options.progressMigration;
      if (!rules || Number(value.chapterLayout || 1) >= rules.layout) return value;
      var save = JSON.parse(JSON.stringify(value));
      if (save.ep === rules.movedFrom && rules.movedNodeIds.indexOf(save.curId) >= 0) {
        unlocked[rules.movedTo] = true;
        write(UNLOCK_KEY, unlocked);
        save.ep = rules.movedTo;
      }
      save.curId = rules.redirects[save.curId] || save.curId;
      save.chapterLayout = rules.layout;
      return save;
    }
    function isUnlocked(id) { return !find(id) || id === 'EP01' || unlocked[id] === true; }
    function message(text) { notice = text; noticeUntil = Date.now() + 4500; options.render(); }
    function rounded(x, y, w, h, r) {
      ctx.beginPath();
      ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r);
      ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r);
      ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
    }
    function text(value, x, y, font, color, maxWidth) {
      ctx.font = font; ctx.fillStyle = color;
      var label = value;
      if (maxWidth && ctx.measureText(label).width > maxWidth) {
        while (label.length && ctx.measureText(label + '…').width > maxWidth) label = label.slice(0, -1);
        label += '…';
      }
      ctx.fillText(label, x, y);
    }
    // v92.9 · 章节卡副标题已删除，原 description() 折行绘制函数随之下线（无调用方）
    function icon(kind, x, y, color) {
      ctx.save(); ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = 1.8;
      ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.beginPath();
      if (kind === 'video') {
        rounded(x - 8, y - 6, 16, 12, 3); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(x - 2, y - 3); ctx.lineTo(x + 4, y); ctx.lineTo(x - 2, y + 3); ctx.closePath(); ctx.fill();
      } else if (kind === 'lock') {
        ctx.arc(x, y - 3, 4, Math.PI, 0); ctx.stroke();
        rounded(x - 6, y - 3, 12, 10, 2); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(x, y + 1); ctx.lineTo(x, y + 3); ctx.stroke();
      } else {
        ctx.moveTo(x - 3, y - 6); ctx.lineTo(x + 6, y); ctx.lineTo(x - 3, y + 6); ctx.closePath(); ctx.fill();
      }
      ctx.restore();
    }
    function loadPicture(chapter) {
      if (pictures[chapter.id]) return;
      var entry = pictures[chapter.id] = { ready: false, failed: false };
      var image = typeof wx !== 'undefined' && wx.createImage ? wx.createImage() : new Image();
      entry.image = image;
      image.onload = function () { entry.ready = true; invalidate(); };
      image.onerror = function () { entry.failed = true; invalidate(); };
      image.src = chapter.poster;
    }
    function cover(image, x, y, width, height, focusY) {
      var scale = Math.max(width / image.width, height / image.height);
      var iw = image.width * scale, ih = image.height * scale;
      ctx.drawImage(image, x + (width - iw) / 2, y + (height - ih) * (typeof focusY === 'number' ? focusY : 0.5), iw, ih);
    }
    function diamond(x, y, size, color) {
      ctx.fillStyle = color; ctx.beginPath();
      ctx.moveTo(x, y - size); ctx.lineTo(x + size, y); ctx.lineTo(x, y + size);
      ctx.lineTo(x - size, y); ctx.closePath(); ctx.fill();
    }
    function frame(x, y, width, height, featured) {
      ctx.lineWidth = 1;
      ctx.strokeStyle = featured ? '#edd6a0' : '#787568';
      rounded(x + 1, y + 1, width - 2, height - 2, 4); ctx.stroke();
      ctx.strokeStyle = featured ? 'rgba(244,216,157,.42)' : 'rgba(196,190,167,.26)';
      ctx.strokeRect(x + 4, y + 4, width - 8, height - 8);
      ctx.strokeStyle = featured ? '#e4c58a' : '#a19a81'; ctx.lineWidth = 1.5;
      [[x, y, 1, 1], [x + width, y, -1, 1], [x, y + height, 1, -1], [x + width, y + height, -1, -1]].forEach(function (corner) {
        var a = corner[0], b = corner[1], dx = corner[2], dy = corner[3];
        ctx.beginPath(); ctx.moveTo(a, b + dy * 17); ctx.lineTo(a, b);
        ctx.lineTo(a + dx * 20, b); ctx.stroke();
      });
    }
    function enterButton(x, y, width, available, saved, pressed, featured) {
      var height = 38;
      function shape(inset) {
        ctx.beginPath(); ctx.moveTo(x + 11, y + inset); ctx.lineTo(x + width - 11, y + inset);
        ctx.lineTo(x + width - inset, y + height / 2); ctx.lineTo(x + width - 11, y + height - inset);
        ctx.lineTo(x + 11, y + height - inset); ctx.lineTo(x + inset, y + height / 2); ctx.closePath();
      }
      ctx.save();
      if (featured && !pressed) {
        ctx.translate(x + width / 2, y + height / 2);
        ctx.scale(pulseScale, pulseScale);
        ctx.translate(-x - width / 2, -y - height / 2);
      }
      ctx.shadowColor = featured ? '#edb95b' : '#0d0805';
      ctx.shadowBlur = featured ? 11 : 7; ctx.shadowOffsetY = 2;
      shape(0); ctx.fillStyle = '#63302a'; ctx.fill();
      ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
      shape(2); ctx.fillStyle = pressed ? '#fff2c9' : available ? '#f0d599' : '#b6ac90'; ctx.fill();
      ctx.strokeStyle = available ? '#fbe5b1' : '#d2c6a7'; ctx.lineWidth = 1; ctx.stroke();
      if (featured && !pressed && sweepStep >= 0) {
        ctx.save(); shape(3); ctx.clip();
        var beamX = x - 40 + (width + 80) * sweepStep / 29;
        var beam = ctx.createLinearGradient(beamX - 22, y, beamX + 22, y + height);
        beam.addColorStop(0, 'rgba(255,252,225,0)');
        beam.addColorStop(0.5, 'rgba(255,252,225,.62)');
        beam.addColorStop(1, 'rgba(255,252,225,0)');
        ctx.fillStyle = beam; ctx.fillRect(x, y, width, height); ctx.restore();
      }
      shape(5); ctx.strokeStyle = 'rgba(99,63,27,.35)'; ctx.stroke();
      var label = available ? (saved ? '继续剧情' : featured ? '免费开玩' : '进入剧情') : '×1 解锁';
      icon(available ? 'play' : 'video', x + 25, y + height / 2, '#5a3021');
      ctx.textAlign = 'center';
      text(label, x + width / 2 + 10, y + height / 2 + 5, '800 16px ' + DISPLAY_FONT, '#4a291c', width - 41);
      ctx.restore();
    }
    function draw() {
      active = true; zones = []; resumeVisible = false;
      ctx.save(); ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = '#141411'; ctx.fillRect(0, 0, W, H);
      if (options.background) {
        loadPicture({ id: '_background', poster: options.background });
        var backdrop = pictures._background;
        if (backdrop && backdrop.ready) {
          ctx.save(); ctx.globalAlpha = 0.12; cover(backdrop.image, 0, 0, W, H); ctx.restore();
        }
      }
      ctx.textAlign = 'center';
      if (options.titleArt) loadPicture({ id: '_title', poster: options.titleArt });
      var title = pictures._title;
      if (title && title.ready) {
        var titleW = Math.min(contentW - 20, 304), titleH = titleW * title.image.height / title.image.width;
        ctx.drawImage(title.image, (W - titleW) / 2, safeTop, titleW, titleH);
      } else {
        text('荒年开局', W / 2, safeTop + 35, '900 34px ' + DISPLAY_FONT, '#f5e4bf');
        text('我的未婚妻', W / 2, safeTop + 66, '600 19px ' + DISPLAY_FONT, '#d3bd92');
      }
      var lineY = top - 17;
      ctx.strokeStyle = 'rgba(190,161,103,.5)'; ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(left + 24, lineY); ctx.lineTo(W / 2 - 12, lineY);
      ctx.moveTo(W / 2 + 12, lineY); ctx.lineTo(left + contentW - 24, lineY); ctx.stroke();
      diamond(W / 2, lineY, 3, '#bfa16a');
      ctx.textAlign = 'left';
      ctx.save(); ctx.beginPath(); ctx.rect(left - 1, top - 2, contentW + 2, bottom - top + 2); ctx.clip();
      chapters.forEach(function (chapter, index) {
        var y = top + index * (rowH + gap) - scroll;
        if (y + rowH >= top - rowH - gap && y <= bottom + rowH + gap) loadPicture(chapter);
        if (y + rowH < top || y > bottom) return;
        var available = isUnlocked(chapter.id), saved = savedFor(chapter.id);
        if (!busy && Math.min(y + rowH, bottom) - Math.max(y, top) >= rowH * .5 && options.onCardExpose)
          options.onCardExpose(chapter, !available);
        var im = pictures[chapter.id], pressed = gesture && !gesture.moved && gesture.id === chapter.id;
        ctx.save(); rounded(left + 2, y + 2, contentW - 4, rowH - 4, 3); ctx.clip();
        ctx.fillStyle = '#252622'; ctx.fillRect(left, y, contentW, rowH);
        if (im && im.ready) cover(im.image, left, y, contentW, rowH, chapter.posterFocusY);
        // A neutral scrim mutes locked artwork on both web and native canvas;
        // keep all title, caption and button text outside the scrim.
        if (!available) { ctx.fillStyle = 'rgba(34,38,36,.46)'; ctx.fillRect(left, y, contentW, rowH); }
        var shade = ctx.createLinearGradient(left, 0, left + contentW, 0);
        shade.addColorStop(0, 'rgba(9,10,8,.73)');
        shade.addColorStop(0.5, 'rgba(9,10,8,.24)');
        shade.addColorStop(1, 'rgba(9,10,8,0)');
        ctx.fillStyle = shade; ctx.fillRect(left, y, contentW, rowH);
        var lower = ctx.createLinearGradient(0, y + rowH - 63, 0, y + rowH);
        lower.addColorStop(0, 'rgba(9,10,8,0)');
        lower.addColorStop(1, 'rgba(9,10,8,.77)');
        ctx.fillStyle = lower; ctx.fillRect(left, y + rowH - 63, contentW, 63);
        if (pressed) { ctx.fillStyle = 'rgba(255,235,190,.1)'; ctx.fillRect(left, y, contentW, rowH); }
        ctx.restore();
        frame(left, y, contentW, rowH, available);
        ctx.save(); ctx.shadowColor = '#080605'; ctx.shadowBlur = 4; ctx.shadowOffsetY = 1;
        // v92.9 · 删除副标题小字（chapter.description）——基本没人看，反而挤压主标题。
        //   空出来的位置全给主标题：字号 22/23 → 26，并整体下移到卡片纵向偏上的舒适位，
        //   宽度限制放宽（原来为了给副标题留位只给到 48% 卡宽），保证主标题看得清、抓人。
        if (chapter.titleLines && chapter.titleLines.length === 2) {
          var titleWidth = Math.min(178, contentW * 0.60);
          text(chapter.titleLines[0], left + 17, y + 40, '800 26px ' + DISPLAY_FONT, '#fff4d9', titleWidth);
          text(chapter.titleLines[1], left + 17, y + 70, '800 26px ' + DISPLAY_FONT, '#fff4d9', titleWidth);
        } else {
          text(chapter.title, left + 17, y + 42, '800 26px ' + DISPLAY_FONT, '#fff4d9', contentW - 70);
        }
        ctx.restore();
        var sealX = left + contentW - 40;
        ctx.fillStyle = available ? '#71372f' : '#514b43'; rounded(sealX, y + 12, 26, 31, 2); ctx.fill();
        ctx.strokeStyle = available ? '#c29a6d' : '#97907b'; ctx.lineWidth = 0.8; ctx.strokeRect(sealX + 2, y + 14, 22, 27);
        ctx.textAlign = 'center';
        // v92.9 · 印章数字改用普通汉字数字（一二三四…），不再用古典写法（壹贰叁肆…）
        text(['一', '二', '三', '四', '五', '六', '七', '八', '九'][index] || String(index + 1), sealX + 13, y + 34, '700 17px ' + DISPLAY_FONT, '#fae3b5');
        ctx.textAlign = 'left';
        var featured = available && chapter.id === (progress ? progress.ep : chapters[0].id);
        var actionW = featured ? 132 : 119;
        var actionX = left + contentW - actionW - 13, actionY = y + rowH - 49;
        var stateLabel = available ? (saved ? '上次看到这里' : (index === 0 ? '首章开放' : '本章已解锁')) : '待解锁 · 1 次广告';
        if (available) {
          ctx.fillStyle = '#eed19a'; ctx.fillRect(left + 18, y + rowH - 28, 2, 10);
        } else { icon('lock', left + 24, y + rowH - 24, '#d3cbb6'); }
        var stateX = left + (available ? 26 : 37);
        text(stateLabel, stateX, y + rowH - 20, '11px sans-serif', available ? '#f5deb0' : '#e0d9c7', actionX - stateX - 9);
        if (featured && actionY >= top + 2 && actionY + 40 <= bottom) resumeVisible = true;
        enterButton(actionX, actionY, actionW, available, saved, pressed, featured);
        zones.push({ id: chapter.id, x: left, y: Math.max(y, top), w: contentW, h: Math.min(y + rowH, bottom) - Math.max(y, top) });
      });
      ctx.restore();
      if (maxScroll > 0) {
        var viewH = bottom - top, thumb = Math.max(24, viewH * viewH / (viewH + maxScroll));
        ctx.fillStyle = 'rgba(210,183,127,.5)';
        ctx.fillRect(left + contentW + 5, top + (viewH - thumb) * clamp(scroll) / maxScroll, 2, thumb);
      }
      var loading = Object.keys(pictures).some(function (id) { return !pictures[id].ready && !pictures[id].failed; });
      // v92.9 · 页脚压成两行：第 1 行「虚构声明 · 著作权人」，第 2 行「认证号 · 隐私政策」。
      //   原来 4 行（footerY+2/+19/+35/+51）吃掉 86px，把最后一张章节卡切掉了半截。
      var footerY = H - safeBottom - 40;
      ctx.fillStyle = '#141411'; ctx.fillRect(0, bottom + 2, W, H - bottom);
      ctx.strokeStyle = 'rgba(182,151,97,.28)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(left + 38, bottom + 6); ctx.lineTo(left + contentW - 38, bottom + 6); ctx.stroke();
      ctx.textAlign = 'center';
      // 第 1 行：状态/虚构声明 · 著作权人
      var _l1 = busy ? '广告加载中…' : loading ? '游戏加载中…' : '本故事纯属虚构 · 北京慕远科技有限公司';
      text(_l1, W / 2, footerY + 2, '10px sans-serif', '#c4b99f', W - 20);
      // 第 2 行：认证号 · 隐私政策（「隐私政策」为可点区，画在同一行右侧）
      var _certTxt = '认证号：2026SA0124642';
      var _privTxt = '隐私政策';
      ctx.font = '10px sans-serif';
      var _certW = ctx.measureText(_certTxt).width;
      ctx.font = '11px sans-serif';
      var _privW = ctx.measureText(_privTxt).width;
      var _sepW = 12;
      var _l2W = _certW + _sepW + _privW;
      var _l2X = W / 2 - _l2W / 2;
      ctx.textAlign = 'left';
      text(_certTxt, _l2X, footerY + 19, '10px sans-serif', '#988e79');
      text('·', _l2X + _certW + _sepW / 2 - 2, footerY + 19, '10px sans-serif', '#7a7263');
      text(_privTxt, _l2X + _certW + _sepW, footerY + 19, '11px sans-serif', '#d3bb88');
      ctx.textAlign = 'center';
      zones.push({ id: 'privacy', x: _l2X + _certW + _sepW - 8, y: footerY + 6, w: _privW + 16, h: 22 });
      if (Date.now() < noticeUntil) {
        rounded(left + 8, bottom - 48, contentW - 16, 40, 4); ctx.fillStyle = '#efe1bf'; ctx.fill();
        text(notice, W / 2, bottom - 23, '12px sans-serif', '#38281a', contentW - 32);
      }

      ctx.restore();
    }
    function unlock(id, onReady, onFail) {
      if (busy) return;
      var chapter = find(id); if (!chapter) return;
      if (isUnlocked(id)) { onReady(chapter); return; }
      // v92.4 · 今日免广告通行证生效 → 直接解锁，不弹激励视频
      if (options.adPassActive && options.adPassActive()) {
        unlocked[id] = true;
        try { write(UNLOCK_KEY, unlocked); } catch (_) { }
        if (options.onUnlock) options.onUnlock(chapter);
        onReady(chapter);
        return;
      }
      busy = true; var request = ++attempt, done = false;
      if (options.onAdRequest) options.onAdRequest(chapter);
      options.onBusy(true); options.render();
      function fail(err) {
        if (done || request !== attempt) return;
        done = true; busy = false; options.onBusy(false);
        if (options.onAdResult) options.onAdResult(chapter, 'fail', err);
        if (onFail) onFail(err);
        else message(err && err.reason === 'not_finished' ? '未看完广告，章节尚未解锁' : '广告暂时不可用，请稍后重试');
      }
      function reward() {
        if (done || request !== attempt) return;
        done = true; busy = false; options.onBusy(false);
        if (options.onAdResult) options.onAdResult(chapter, 'ok');
        unlocked[id] = true;
        try { write(UNLOCK_KEY, unlocked); }
        catch (_) { message('已解锁，本地保存失败'); }
        if (options.onUnlock) options.onUnlock(chapter);
        onReady(chapter);
      }
      try {
        if (typeof KwaiAd !== 'undefined' && KwaiAd.showRewarded) KwaiAd.showRewarded(reward, fail);
        else fail({ reason: 'unavailable' });
      } catch (_) { fail({ reason: 'unavailable' }); }
    }
    function select(id) {
      if (busy || !active) return;
      stopMotion(); scroll = clamp(scroll);
      if (id === 'privacy') { options.onPrivacy(); return; }
      var chapter = find(id); if (!chapter) return;
      if (options.onSelect) options.onSelect(chapter, !isUnlocked(id));
      if (isUnlocked(id)) { active = false; options.onEnter(chapter, savedFor(id)); return; }
      unlock(id, function () { active = false; options.onEnter(chapter, savedFor(id)); });
    }
    function hit(x, y) {
      for (var i = zones.length - 1; i >= 0; i--) {
        var z = zones[i];
        if (x >= z.x && x <= z.x + z.w && y >= z.y && y <= z.y + z.h) return z.id;
      }
      return null;
    }
    function touchStart(x, y) {
      if (busy || !active) return;
      var wasMoving = Math.abs(velocity) > 0.015 || wheelTarget !== null;
      stopMotion();
      gesture = { x: x, y: y, originY: y, originScroll: scroll, lastT: clock(), id: hit(x, y), moved: false, stoppedFling: wasMoving, canScroll: y >= top && y <= bottom };
      invalidate();
    }
    function touchMove(x, y) {
      if (!gesture || busy) return;
      if (Math.abs(y - gesture.y) > 8 || Math.abs(x - gesture.x) > 8) gesture.moved = true;
      var now = clock(), dt = Math.max(8, now - gesture.lastT);
      if (gesture.canScroll && gesture.moved) {
        if (maxScroll === 0) { scroll = 0; velocity = 0; }
        else {
          var desired = gesture.originScroll + gesture.originY - y;
          var next = clamp(desired), delta = next - scroll;
          scroll = next;
          if (next !== desired || next === 0 || next === maxScroll) {
            // Rebase at an edge so reversing the finger responds immediately.
            gesture.originScroll = scroll; gesture.originY = y; velocity = 0;
          } else {
            var sample = delta / dt;
            velocity = Math.max(-2.4, Math.min(2.4, delta === 0 ? 0 : delta * velocity <= 0 ? sample : 0.25 * velocity + 0.75 * sample));
          }
        }
      }
      gesture.lastT = now; invalidate();
    }
    function touchEnd(x, y) {
      var g = gesture; gesture = null;
      if (g && (clock() - g.lastT > 100 || reducedMotion)) velocity = 0;
      frameTime = clock();
      if (g && !g.moved && !g.stoppedFling && Math.abs(y - g.y) <= 8 && Math.abs(x - g.x) <= 8 && g.id && hit(x, y) === g.id) select(g.id);
      invalidate();
    }
    return {
      migrateSave: migrateSave, draw: draw, update: update, select: select, unlock: unlock, isUnlocked: isUnlocked, find: find,
      // 已完成外部激励广告（成就“直通该章”）后写入章节解锁状态。
      grant: function (id) { if (!id) return; unlocked[id] = true; try { write(UNLOCK_KEY, unlocked); } catch (_) {} invalidate(); },
      // v92.4 · 底部栏「解锁全部章节」：看满 3 个广告后一次性写入全部章节解锁。
      grantAll: function () {
        chapters.forEach(function (c) { unlocked[c.id] = true; });
        try { write(UNLOCK_KEY, unlocked); } catch (_) {}
        invalidate();
        return chapters.length;
      },
      resetUnlocks: function () { unlocked = {}; progress = null; invalidate(); },
      touchStart: touchStart, touchMove: touchMove, touchEnd: touchEnd,
      cancelTouch: function () { gesture = null; stopMotion(); scroll = clamp(scroll); invalidate(); },
      wheel: function (dy) {
        if (busy || !active || !isFinite(dy)) return;
        gesture = null; velocity = 0;
        var target = clamp((wheelTarget === null ? scroll : wheelTarget) + dy);
        if (reducedMotion) { scroll = target; wheelTarget = null; }
        else wheelTarget = target;
        invalidate();
      },
      show: function (id) {
        active = true; gesture = null; stopMotion(); scroll = clamp(scroll); invalidate();
        if (!id) id = progress && progress.ep;
        if (id) { var index = chapters.indexOf(find(id)); scroll = Math.max(0, Math.min(maxScroll, index * (rowH + gap))); }
        else scroll = 0;
      },
      record: function (data) {
        if (!data || !data.curId || !find(data.ep) || !isUnlocked(data.ep)) return;
        progress = JSON.parse(JSON.stringify(data));
        invalidate();
      },
      clearProgress: function () { progress = null; invalidate(); }
    };
  }
  global.ChapterHome = { create: create };
})(typeof GameGlobal !== 'undefined' ? GameGlobal : window);
