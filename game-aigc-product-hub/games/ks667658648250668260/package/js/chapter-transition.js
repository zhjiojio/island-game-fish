(function (global) {
  'use strict';
  var FONT = '"Songti SC", "STSong", "SimSun", serif';
  var NUMBERS = ['一', '二', '三', '四', '五', '六', '七', '八', '九'];
  function chapterLabel(chapter) { return '第' + (NUMBERS[Number(chapter.id.slice(2)) - 1] || chapter.id.slice(2)) + '章'; }
  function create(options) {
    var ctx = options.ctx, W = options.width, H = options.height;
    var pictures = {}, zones = [], gesture = null;
    function text(value, x, y, font, color) {
      ctx.font = font; ctx.fillStyle = color; ctx.fillText(value, x, y);
    }
    function picture(chapter) {
      if (!pictures[chapter.id]) {
        var entry = pictures[chapter.id] = { ready: false };
        var im = entry.image = typeof wx !== 'undefined' && wx.createImage ? wx.createImage() : new Image();
        im.onload = function () { entry.ready = true; options.render(); };
        im.src = chapter.poster;
      }
      return pictures[chapter.id];
    }
    function cover(im, x, y, w, h, focusY) {
      var scale = Math.max(w / im.width, h / im.height);
      ctx.drawImage(im, x + (w - im.width * scale) * 0.88, y + (h - im.height * scale) * (typeof focusY === 'number' ? focusY : 0.5), im.width * scale, im.height * scale);
    }
    function button(x, y, w, h) {
      ctx.beginPath(); ctx.moveTo(x + 13, y); ctx.lineTo(x + w - 13, y);
      ctx.lineTo(x + w, y + h / 2); ctx.lineTo(x + w - 13, y + h);
      ctx.lineTo(x + 13, y + h); ctx.lineTo(x, y + h / 2); ctx.closePath();
    }
    function wrap(value, x, y, width) {
      ctx.font = '13px sans-serif';
      var line = '', row = 0;
      for (var i = 0; i < value.length; i++) {
        if (ctx.measureText(line + value[i]).width > width && line) {
          text(line, x, y + row * 20, '13px sans-serif', '#cfc1a8'); line = ''; row++;
        }
        line += value[i];
      }
      text(line, x, y + row * 20, '13px sans-serif', '#cfc1a8');
    }
    function draw(info, busy, notice) {
      zones = [];
      var pad = 24, width = Math.min(W - pad * 2, 472), left = (W - width) / 2;
      var safeTop = options.safeTop || 24, safeBottom = options.safeBottom || 12;
      var imageH = Math.max(105, Math.min(width * 0.55, H - safeTop - safeBottom - 355));
      var top = safeTop + Math.max(18, (H - safeTop - safeBottom - imageH - 330) / 2);
      var imageTop = top + 84;
      var image = picture(info.to), available = options.isUnlocked(info.to.id);
      ctx.save(); ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = '#12130f'; ctx.fillRect(0, 0, W, H);
      if (image.ready) { ctx.save(); ctx.globalAlpha = 0.11; cover(image.image, 0, 0, W, H); ctx.restore(); }
      var bg = ctx.createLinearGradient(0, 0, 0, H);
      bg.addColorStop(0, 'rgba(24,23,17,.1)'); bg.addColorStop(1, '#10110e');
      ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
      text('你已完成' + chapterLabel(info.from), W / 2, top + 22, '700 25px ' + FONT, '#f6deaa');
      ctx.strokeStyle = '#776547'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(W / 2 - 86, top + 45); ctx.lineTo(W / 2 - 8, top + 45);
      ctx.moveTo(W / 2 + 8, top + 45); ctx.lineTo(W / 2 + 86, top + 45); ctx.stroke();
      text('◆', W / 2, top + 49, '10px serif', '#bfa06b');
      text('下一章 · ' + chapterLabel(info.to), W / 2, top + 75, '12px sans-serif', '#b8a27b');
      ctx.save(); ctx.beginPath(); ctx.rect(left, imageTop, width, imageH); ctx.clip();
      ctx.fillStyle = '#29271f'; ctx.fillRect(left, imageTop, width, imageH);
      if (image.ready) cover(image.image, left, imageTop, width, imageH, info.to.posterFocusY);
      var shade = ctx.createLinearGradient(0, imageTop + imageH * 0.65, 0, imageTop + imageH);
      shade.addColorStop(0, 'rgba(14,14,10,0)'); shade.addColorStop(1, 'rgba(14,14,10,.5)');
      ctx.fillStyle = shade; ctx.fillRect(left, imageTop, width, imageH); ctx.restore();
      ctx.strokeStyle = '#a78d5b'; ctx.strokeRect(left, imageTop, width, imageH);
      ctx.strokeStyle = 'rgba(234,208,150,.45)'; ctx.strokeRect(left + 4, imageTop + 4, width - 8, imageH - 8);
      var titleY = imageTop + imageH + 32, lines = info.to.titleLines || [info.to.title];
      lines.forEach(function (line, index) { text(line, W / 2, titleY + index * 29, '800 26px ' + FONT, '#fff0cb'); });
      wrap(info.to.description, W / 2, titleY + 68, width - 20);
      var buttonY = titleY + 120, bottom = buttonY + 92;
      var buttonX = left + 4, buttonW = width - 8, buttonH = 50;
      button(buttonX, buttonY, buttonW, buttonH);
      var gold = ctx.createLinearGradient(0, buttonY, 0, buttonY + 50);
      gold.addColorStop(0, busy ? '#aaa085' : '#f4ddb0'); gold.addColorStop(1, busy ? '#8f856d' : '#cfa763');
      ctx.fillStyle = gold; ctx.fill(); ctx.strokeStyle = '#ffe5ae'; ctx.stroke();
      // 主 CTA 呼吸 + 扫光：让“看广告解锁”成为页面唯一强点击焦点。
      if (!busy && !available) {
        var age = (Date.now() - (info._buttonT0 || (info._buttonT0 = Date.now())));
        var pulse = 1 + 0.035 * (0.5 - 0.5 * Math.cos(age / 700 * Math.PI * 2));
        var cx = W / 2, cy = buttonY + buttonH / 2;
        ctx.save(); ctx.translate(cx, cy); ctx.scale(pulse, pulse); ctx.translate(-cx, -cy);
        ctx.globalAlpha = 0.38;
        ctx.beginPath(); button(buttonX, buttonY, buttonW, buttonH); ctx.clip();
        var sweep = ((age % 1800) / 1800) * (buttonW + 90) - 45;
        var shine = ctx.createLinearGradient(buttonX + sweep - 34, 0, buttonX + sweep + 34, 0);
        shine.addColorStop(0, 'rgba(255,255,255,0)'); shine.addColorStop(.5, 'rgba(255,255,255,.9)'); shine.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = shine; ctx.fillRect(buttonX, buttonY, buttonW, buttonH);
        ctx.restore();
        ctx.save(); ctx.strokeStyle = 'rgba(255,232,164,.75)'; ctx.lineWidth = 1.5;
        ctx.shadowColor = 'rgba(255,204,92,.55)'; ctx.shadowBlur = 10;
        button(buttonX, buttonY, buttonW, buttonH); ctx.stroke(); ctx.restore();
      }
      text(busy ? '正在等待广告完成…' : (available ? '进入' + chapterLabel(info.to) : (info.to.unlockText || '看广告解锁' + chapterLabel(info.to))), W / 2, buttonY + 32, '700 17px ' + FONT, '#412b19');
      text(available ? '本章已解锁，可直接进入' : (info.to.unlockHint || '完整观看 1 次广告，解锁本章剧情'), W / 2, buttonY - 12, '11px sans-serif', '#ac9a78');
      text('重玩本章', W / 2 - width / 4, bottom - 8, '12px sans-serif', '#c6b38e');
      text('返回章节列表', W / 2 + width / 4, bottom - 8, '12px sans-serif', '#c6b38e');
      zones.push({ action: 'next', x: left, y: buttonY, w: width, h: 50 });
      zones.push({ action: 'replay', x: left, y: bottom - 30, w: width / 2, h: 38 });
      zones.push({ action: 'home', x: W / 2, y: bottom - 30, w: width / 2, h: 38 });
      if (notice) {
        ctx.fillStyle = '#ead9b1'; ctx.fillRect(left, buttonY - 51, width, 30);
        text(notice, W / 2, buttonY - 31, '11px sans-serif', '#412b19');
      }
      ctx.restore();
    }
    function hit(x, y) {
      return zones.filter(function (z) { return x >= z.x && x <= z.x + z.w && y >= z.y && y <= z.y + z.h; })[0];
    }
    return {
      draw: draw,
      touchStart: function (x, y) { gesture = { x: x, y: y, zone: hit(x, y), moved: false }; },
      touchMove: function (x, y) { if (gesture && Math.abs(x - gesture.x) + Math.abs(y - gesture.y) > 8) gesture.moved = true; },
      touchEnd: function (x, y) {
        var g = gesture; gesture = null; var z = hit(x, y);
        if (g && !g.moved && g.zone && z && g.zone.action === z.action && Math.abs(x - g.x) + Math.abs(y - g.y) <= 8) options.onAction(z.action);
      },
      cancelTouch: function () { gesture = null; }
    };
  }
  global.ChapterTransition = { create: create, label: chapterLabel };
})(typeof GameGlobal !== 'undefined' ? GameGlobal : window);
