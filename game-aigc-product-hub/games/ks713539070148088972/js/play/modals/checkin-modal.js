/**
 * play/modals/checkin-modal.js — 每日签到弹窗（UI 层）
 * 状态机/奖励发放逻辑见 systems/checkin.js，本文件只负责把状态渲染成 7 天卡片网格 +
 * 领取按钮，不直接读写 Storage。
 * 素材：assets/meinv/biz/checkin/，均为已烘焙标题+图标+文案的成品卡片图，
 * 第 1~6 天为 2 列网格小卡(249x288)，第 7 天为整行横幅(825x285)。
 */
(function () {
  'use strict';

  SceneManager.register('checkin-modal', {
    enter: function () {},

    _drawDayCell: function (x, y, w, h, dayConf, state, areas) {
      var px = M3.Layout.px;
      var src = CONFIG.uiAsset(dayConf.cardAsset);
      var entry = src ? TextureManager.get(src) : null;
      if (entry) {
        Renderer.drawImage(src, x, y, w, h);
      } else {
        Renderer.drawRoundRect(x, y, w, h, px(12), { fill: '#EDE9FF', stroke: '#6A4FD6', strokeW: px(3) });
      }

      var isClaimed = dayConf.day <= state.claimedDays;
      var isToday = dayConf.day === state.currentDay && !state.claimedToday;

      if (isClaimed) {
        // 已领取：整体压暗 + 右上角绿色对勾
        Renderer.drawRoundRect(x, y, w, h, px(12), { fill: 'rgba(20,10,40,0.45)' });
        var badgeR = px(13);
        var badgeX = x + w - badgeR - px(6), badgeY = y + badgeR + px(6);
        Renderer.drawCircle(badgeX, badgeY, badgeR, { fill: '#2ECC71', stroke: '#ffffff', strokeW: px(2) });
        Renderer.drawText('✓', badgeX, badgeY - px(7), {
          fontSize: px(16), color: '#ffffff', align: 'center', bold: true
        });
      } else if (dayConf.day > state.currentDay) {
        // 未到达：整体压暗 + 锁形图标
        Renderer.drawRoundRect(x, y, w, h, px(12), { fill: 'rgba(20,10,40,0.55)' });
        var lockSrc = CONFIG.uiAsset('mnvIconLock') || CONFIG.uiAsset('iconLock');
        var lockEntry = lockSrc ? TextureManager.get(lockSrc) : null;
        var lockSize = Math.min(px(28), w * 0.24);
        if (lockEntry) {
          Renderer.drawImage(lockSrc, x + w / 2 - lockSize / 2, y + h / 2 - lockSize / 2, lockSize, lockSize);
        } else {
          Renderer.drawText('🔒', x + w / 2, y + h / 2 - px(8), { fontSize: lockSize, color: '#ffffff', align: 'center' });
        }
      } else if (isToday) {
        // 今天可领：金色描边高亮
        Renderer.drawRoundRect(x - px(2), y - px(2), w + px(4), h + px(4), px(14), { stroke: '#FFD84A', strokeW: px(3) });
      }

      areas.push({
        x: x, y: y, w: w, h: h, priority: 900, label: 'checkin-day-' + dayConf.day,
        onTap: function () {
          if (isToday) UIKit.toast('点击下方按钮领取今日奖励');
          else if (isClaimed) UIKit.toast('第 ' + dayConf.day + ' 天已领取');
          else UIKit.toast('第 ' + dayConf.day + ' 天还未解锁');
        }
      });
    },

    _doClaim: function (multiplier) {
      var res = CheckIn.claim({ multiplier: multiplier });
      if (!res.ok) {
        if (res.reason === 'already-claimed') UIKit.toast('今天已经签到过啦，明天再来～');
        return;
      }
      var reward = res.reward;
      var label = '签到成功';
      if (reward.type === 'prop') label = '获得道具 x' + (reward.amount * multiplier);
      else if (reward.type === 'hint') label = '获得提示 x' + (reward.amount * multiplier);
      else if (reward.type === 'tempUnlock') label = '全部关卡限时解锁 ' + reward.hours + ' 小时';
      UIKit.toast('🎉 ' + label);
    },

    draw: function () {
      var px = M3.Layout.px;
      var W = M3.Layout.w, H = M3.Layout.h;
      var cx = W / 2;
      var T = CONFIG.TEMPLATE.checkinModal || {};
      var days = (T.days || []);
      var state = CheckIn.getState();

      Renderer.drawRoundRect(0, 0, W, H, 0, { fill: 'rgba(10,10,10,0.72)' });

      var areas = [];

      // ── 尺寸计算（均以面板宽度 panelW 为基准，等比换算各素材显示尺寸）──────────
      var panelW = Math.min(px(320), W - px(32));
      var padX = px(20);
      var innerW = panelW - padX * 2;
      var gap = px(10);
      var cardW = (innerW - gap) / 2;
      var cardH = Math.round(cardW * (288 / 249));
      var day7H = Math.round(innerW * (285 / 825));
      var btnW = Math.min(px(208), innerW);
      var btnH = Math.round(btnW * (264 / 528));
      var tripleBtnW = Math.round(btnW * 0.62);
      var tripleBtnH = Math.round(tripleBtnW * (264 / 528));
      var ribbonW = Math.round(panelW * 0.72);
      var ribbonH = Math.round(ribbonW * (279 / 837));

      var topPad = Math.round(ribbonH * 0.6);
      var gridH = cardH * 3 + gap * 2;
      var panelH = topPad + gridH + px(16) + day7H + px(18) + btnH + (T.claimTripleButtonAsset ? (tripleBtnH + px(10)) : 0) + px(20);

      var panelY = Math.max(M3.Layout.safeTop + px(30), (H - panelH) / 2 + ribbonH * 0.35);
      var panelX = cx - panelW / 2;

      // ── 面板背景 ──
      var panelSrc = T.panelBgAsset ? CONFIG.uiAsset(T.panelBgAsset) : null;
      var panelEntry = panelSrc ? TextureManager.get(panelSrc) : null;
      if (panelEntry) {
        Renderer.drawImage(panelSrc, panelX, panelY, panelW, panelH);
      } else {
        Renderer.drawRoundRect(panelX, panelY, panelW, panelH, px(24), { fill: '#EBF3FF', stroke: '#6AA0F2', strokeW: px(4) });
      }

      // ── 顶部绶带标题（叠在面板上边缘之上）──
      var ribbonX = cx - ribbonW / 2;
      var ribbonY = panelY - ribbonH * 0.55 - px(3);
      var ribbonSrc = T.ribbonAsset ? CONFIG.uiAsset(T.ribbonAsset) : null;
      var ribbonEntry = ribbonSrc ? TextureManager.get(ribbonSrc) : null;
      if (ribbonEntry) {
        Renderer.drawImage(ribbonSrc, ribbonX, ribbonY, ribbonW, ribbonH);
      } else {
        Renderer.drawRoundRect(ribbonX, ribbonY, ribbonW, ribbonH, px(12), { fill: 'rgba(230,60,60,0.9)' });
        Renderer.drawText('每日签到', cx, ribbonY + ribbonH / 2 - px(10), {
          fontSize: px(20), color: '#ffffff', align: 'center', bold: true
        });
      }

      // ── 左上角返回按钮 ──
      areas.push(UIKit.drawBackCloseButton(function () { SceneManager.close(); }, 1000));

      // ── 1~6 天：2 列 x 3 行网格 ──
      var gridX = panelX + padX;
      var gridY = panelY + topPad;
      var self = this;
      for (var i = 0; i < 6 && i < days.length; i++) {
        var col = i % 2, row = Math.floor(i / 2);
        var cellX = gridX + col * (cardW + gap);
        var cellY = gridY + row * (cardH + gap);
        self._drawDayCell(cellX, cellY, cardW, cardH, days[i], state, areas);
      }

      // ── 第 7 天：整行横幅 ──
      var day7Y = gridY + gridH + px(16);
      if (days[6]) {
        self._drawDayCell(gridX, day7Y, innerW, day7H, days[6], state, areas);
      }

      // ── 领取按钮 ──
      var btnY = day7Y + day7H + px(18);
      var btnX = cx - btnW / 2;
      var claimable = !state.claimedToday;

      if (T.claimTripleButtonAsset) {
        var tripleX = cx - tripleBtnW / 2;
        if (claimable) {
          areas.push(UIKit.imageButton(tripleX, btnY, tripleBtnW, tripleBtnH, T.claimTripleButtonAsset, function () {
            Ads.showRewarded(function (ok) {
              if (!ok) return;
              self._doClaim(3);
            }, 'checkin_triple');
          }, { priority: 900, adBadge: false }));
        } else {
          var tripleSrc = CONFIG.uiAsset(T.claimTripleButtonAsset);
          if (TextureManager.get(tripleSrc)) {
            Renderer.drawImage(tripleSrc, tripleX, btnY, tripleBtnW, tripleBtnH);
            Renderer.drawRoundRect(tripleX, btnY, tripleBtnW, tripleBtnH, px(20), { fill: 'rgba(20,10,40,0.5)' });
          }
        }
        btnY += tripleBtnH + px(10);
      }

      if (claimable) {
        areas.push(UIKit.imageButton(btnX, btnY, btnW, btnH, T.claimButtonAsset, function () {
          self._doClaim(1);
        }, { priority: 900, fallbackLabel: '签到领取', fallbackColor: 'green' }));
      } else {
        var claimSrc = T.claimButtonAsset ? CONFIG.uiAsset(T.claimButtonAsset) : null;
        var claimEntry = claimSrc ? TextureManager.get(claimSrc) : null;
        if (claimEntry) {
          Renderer.drawImage(claimSrc, btnX, btnY, btnW, btnH);
          Renderer.drawRoundRect(btnX, btnY, btnW, btnH, px(20), { fill: 'rgba(20,10,40,0.55)' });
        } else {
          Renderer.drawRoundRect(btnX, btnY, btnW, btnH, px(20), { fill: '#999999' });
        }
        Renderer.drawText('明日再来', cx, btnY + btnH / 2 - px(8), {
          fontSize: px(16), color: '#ffffff', align: 'center', bold: true
        });
      }

      // ── 全屏吸收，防止穿透命中下层场景 ──
      areas.push({
        x: 0, y: 0, w: W, h: H,
        priority: 500, label: 'checkin-absorber',
        onTap: function () {}
      });

      InputManager.addAll(areas);
    }
  });
})();
