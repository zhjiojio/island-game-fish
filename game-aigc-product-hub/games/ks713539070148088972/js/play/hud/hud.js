/**
 * play/hud/hud.js — HUD + 状态条 + 工具栏
 * 对照旧版 package/js/game.js drawStatusStrip / drawToolbar 逐像素还原
 * 依赖：Renderer, UIKit, CONFIG, M3, TextRenderer, TextureManager
 * 导出：HUDView
 *
 * 【机型适配说明】本文件内所有布局用的像素常量（padding/间距/图标尺寸/字号）均按
 * 375 设计稿书写，实际绘制前统一套一层 M3.Layout.px(n) = round(n * M3.Layout.scale)，
 * scale 是单一系数同时作用于宽高，只做等比放大缩小，不会拉伸图片/图标变形。
 */
(function () {
  'use strict';

  var _flyParticles = [];
  var _dotPopTs     = [];
  var _dotRevealAt  = []; // 对应进度点"飞行未到达前仍显示灰色"的揭晓时间戳

  /** 光尾贴图 key 表：新版绿色粒子拖尾，24 帧（00→23）自然序号顺序。
   *  第 13 帧抵达进度点，之后帧为消散余尾。 */
  var _TRAIL_KEYS = [
    'mnvFlyTrail00', 'mnvFlyTrail01', 'mnvFlyTrail02', 'mnvFlyTrail03',
    'mnvFlyTrail04', 'mnvFlyTrail05', 'mnvFlyTrail06', 'mnvFlyTrail07',
    'mnvFlyTrail08', 'mnvFlyTrail09', 'mnvFlyTrail10', 'mnvFlyTrail11',
    'mnvFlyTrail12', 'mnvFlyTrail13', 'mnvFlyTrail14', 'mnvFlyTrail15',
    'mnvFlyTrail16', 'mnvFlyTrail17', 'mnvFlyTrail18', 'mnvFlyTrail19',
    'mnvFlyTrail20', 'mnvFlyTrail21', 'mnvFlyTrail22', 'mnvFlyTrail23'
  ];
  var _TRAIL_ARRIVE_FRAME = 13;
  var _TRAIL_TOTAL_FRAMES = 24;

  // ── candyButton / drawAdBadge 已迁移到 UIKit.candyButton / UIKit.drawAdBadge ──

  // ── drawSegmentedProgress（对齐旧版 game.js L3974）──────────────────────────────
  function _drawSegmentedProgress(x, y, w, h, done, total) {
    if (!total || total <= 0) return;
    var segGap = M3.Layout.px(2);
    var segW = (w - segGap * (total - 1)) / total;
    for (var i = 0; i < total; i++) {
      var sx = x + i * (segW + segGap);
      var filled = i < done;
      Renderer.drawRoundRect(sx, y, segW, h, M3.Layout.px(1.5), {
        fill: filled ? '#ffe066' : 'rgba(0,0,0,0.28)'
      });
      Renderer.drawRoundRect(sx, y, segW, h, M3.Layout.px(1.5), {
        stroke: filled ? '#7a5a10' : 'rgba(0,0,0,0.35)', strokeW: M3.Layout.px(0.8)
      });
    }
  }

  var HUDView = window.HUDView = {

    // 紫色分割条层级需求：只能盖住背景图，不能盖住舞台场景图，所以必须在
    // 舞台场景图绘制之前单独画（play.js 在 drawFlowingBackground 之后、
    // state.mode.draw 之前调用本方法），draw() 内部不再重复绘制。
    drawDividers: function (state) {
      if (!state.level) return;
      var W       = M3.Layout.w;
      var H       = M3.Layout.h;
      var T = CONFIG.TEMPLATE.hud;
      var px = M3.Layout.px;

      if (!T.showDividerBars) return;

      var statusY2 = CONFIG.getHudHeaderRowsHeight(state.level.mode);

      if (T.progressStyle !== 'dots') {
        var divColor = T.dividerColor || '#908FE6';
        var statusY = statusY2 + CONFIG._scale(CONFIG.DOT_SIZE) + CONFIG.getProgressToStage(state.level.mode);
        UIKit.drawDividerBar(0, statusY, W, px(10), divColor, T.dividerAsset);
      }

      if (!T.showBottomItemStrip) {
        var divColor2 = T.dividerColor || '#908FE6';
        var toolY2 = H - CONFIG.getStageBottomReserve();
        UIKit.drawDividerBar(0, toolY2 - px(10), W, px(10), divColor2, T.dividerAsset);
      }
    },

    draw: function (state) {
      var areas = [];
      if (!state.level) return areas;

      var W       = M3.Layout.w;
      var H       = M3.Layout.h;
      var safeTop = M3.Layout.safeTop;
      var T = CONFIG.TEMPLATE.hud;
      var px = M3.Layout.px;

      var hudY = safeTop + CONFIG.getAdaptiveTopMargin();

      var backRect = CONFIG.getBackButtonRect();
      var btnSize = backRect.size;
      var backX = backRect.x, backY = backRect.y;
      var backSrc = CONFIG.uiAsset('mnvBtnBack');
      var backEntry = backSrc ? TextureManager.get(backSrc) : null;
      if (backEntry) {
        Renderer.drawImage(backSrc, backX, backY, btnSize, btnSize);
      } else {
        backSrc = CONFIG.uiAsset('btnBack');
        backEntry = backSrc ? TextureManager.get(backSrc) : null;
        if (backEntry) {
          Renderer.drawImage(backSrc, backX, backY, btnSize, btnSize);
        } else {
          Renderer.drawText('◀', backX + btnSize / 2, backY + btnSize / 2 - px(14), {
            fontSize: px(18), color: '#ffffff', align: 'center', bold: true,
            strokeColor: 'rgba(0,0,0,0.5)', strokeWidth: px(2)
          });
        }
      }
      areas.push({
        x: backX - px(4), y: backY - px(4), w: btnSize + px(8), h: btnSize + px(8),
        priority: 200, label: 'back',
        onTap: function () {
          Telemetry.levelExit(state.level, 'back', 0);
          PlayController.goHome();
        }
      });

      if (T.showStatusPills) {
        var pill = CONFIG.getPillSize();
        this._drawStatusPills(state, backX + btnSize + px(6), backY + (btnSize - pill.h) / 2);
      }

      // levelTitleType 支持按玩法覆盖：T.levelTitleTypeByMode = { }
      // 未在 byMode 里配置的玩法，回退到 T.levelTitleType 默认值（逻辑集中在 CONFIG.getHudTitleType）。
      // 新增玩法时若需要图片标题，直接在 product.config.js 的 levelTitleTypeByMode 里加一条即可，
      // 无需改动本文件代码。
      // 换装玩法（dressup）以外的玩法 top 区不展示关卡标题（CONFIG.getShowTitle 按玩法可配置）
      if (CONFIG.getShowTitle(state.level.mode)) {
        var titleType = CONFIG.getHudTitleType(state.level.mode);
        // 标题始终独立一行（不随 titleType 变化），舞台区域的上移由 CONFIG.getHudContentHeight
        // 单独控制标题行与舞台之间的间距（分割条+进度条区域），互不影响。
        // 标题行与上方倒计时/生命值胶囊行贴得太开，额外上移 3px 收紧间距（不影响
        // getHudHeaderRowsHeight 计算出的整体行高，只是标题在行内的绘制位置微调）。
        var titleY = T.showStatusPills ? hudY + CONFIG._scale(CONFIG.STATUS_BAR_H + CONFIG.TITLE_GAP) : hudY;
        var titleRowHReal = CONFIG._scale(CONFIG.TITLE_BAR_H);
        if (titleType === 'image' && T.levelTitleAsset) {
          var ltSrc = CONFIG.uiAsset(T.levelTitleAsset);
          var ltEntry = ltSrc ? TextureManager.get(ltSrc) : null;
          if (ltEntry) {
            var ltW = px(258), ltH = px(37);
            Renderer.drawImage(ltSrc, (W - ltW) / 2, titleY + (titleRowHReal - ltH) / 2, ltW, ltH);
          } else {
            Renderer.drawText(state.level.title || '', W / 2, titleY + (titleRowHReal - px(22) * 1.4) / 2, {
              fontSize: px(22), color: '#ffffff', align: 'center',
              strokeColor: '#141056', strokeWidth: px(2), bold: true,
              maxWidth: W - px(100)
            });
          }
        } else {
          // 标题格式由 CONFIG.TEMPLATE.hud.levelTitleFormatByMode 配置：
          // 1=「第x关 标题名」，2=仅展示标题名。
          var themeLevels = RemoteConfig.getLevelsByTheme(state.level.themeId) || [];
          var levelNo = 0;
          for (var _li = 0; _li < themeLevels.length; _li++) {
            if (themeLevels[_li].idx === state.level.idx) { levelNo = _li + 1; break; }
          }
          var titleFormat = CONFIG.getHudTitleFormat(state.level.mode);
          var prefix = (titleFormat === 2 || !levelNo) ? '' : ('第' + levelNo + '关 ');
          var title = prefix + (state.level.title || '');
          Renderer.drawText(title, W / 2, titleY + (titleRowHReal - px(18) * 1.4) / 2, {
            fontSize: px(18), color: '#ffffff', align: 'center',
            strokeColor: '#141056', strokeWidth: px(2), bold: true,
            maxWidth: W - px(100)
          });
        }
      }

      // 说明：游戏页不再展示右上角音乐/设置按钮组，仅首页保留（见 home.js，改用 mnvBtnSetting 图标+文案样式）。
      // 说明：曾经这里有一组固定画在 H-182 处、点击后 goHome() 的装饰箭头(game_nav_left/right)，
      // 功能和左上角返回按钮完全重复，且位置正好落在底部「加时/提示/加5次」按钮栏范围内，
      // 导致每个按钮旁边都多出一个箭头图标，故整体移除（各玩法真正需要的换页/换角色箭头
      // 由各自 mode.draw() 自行绘制，如 dressup.js 的 prev/next 切换箭头）。

      // showStatusPills 模版：标题另起一行，进度点紧跟标题下方，分割条放在进度点与舞台之间
      // （旧逻辑把分割条画在标题下方、进度点画在分割条下方，会与另起一行的标题重叠）。
      // 不展示标题的玩法（CONFIG.getShowTitle）直接省去标题行，进度点上移紧跟返回栏。
      // statusY2 必须与 CONFIG.getHudContentHeight() 的前两项（TOP_PAD+返回栏[+标题行]）
      // 用同一个 getHudHeaderRowsHeight() 计算，否则不同 scale 下会因为两次独立 round() 产生
      // 1px 漂移，导致舞台图片与 HUD 分割线错位。
      var statusY2 = CONFIG.getHudHeaderRowsHeight(state.level.mode);
      if (!T.showDividerBars) {
        this._drawStatusStrip(state, statusY2, W, areas);
      }

      if (T.progressStyle === 'dots') {
        this._drawProgressDots(state, statusY2, W);
        this._drawFlyParticles();
      }

      // 紫色分割条已提前到 play.js 的背景绘制之后、舞台绘制之前，见 drawDividers()

      if (T.errorDisplayFormat && !T.showStatusPills) {
        var errInfo = state.mode ? state.mode.getStatusInfo(state) : null;
        if (errInfo && !errInfo.rightIsTimer && errInfo.progress != null) {
          var errText = T.errorDisplayFormat
            .replace('{used}', String(errInfo.progress))
            .replace('{max}', String(errInfo.progressTotal));
          var errColor = T.errorDisplayColor || '#FF0000';
          Renderer.drawText(errText, W / 2, statusY2 + px(20), {
            fontSize: px(20), color: errColor, align: 'center',
            strokeColor: '#ffffff', strokeWidth: px(2), bold: true
          });
        }
      }

      if (state.level.dialogText) {
        this._drawDialogBubble(state, statusY2 + CONFIG._scale(CONFIG.DOT_SIZE) + (T.progressStyle === 'dots' ? CONFIG.getProgressToStage(state.level.mode) : 0) + px(8));
      }

      if (T.showBottomItemStrip) {
        this._drawItemStrip(state, H - CONFIG.getStageBottomReserve(), W, areas);
      }

      // dressup 模式的衣服缩略框栏由 DressupMode.draw() 自行绘制（含拖拽+横向滚动），
      // HUD 不再画通用假头像栏，避免与 dressup.js 的真实衣服条重叠冲突。

      var toolY = H - CONFIG.getStageBottomReserve();
      if (!T.showDividerBars) {
        this._drawToolbar(state, toolY, W, areas);
      }

      return areas;
    },

    /**
     * 点球进度条：每个找茬对应一个球，已找到=绿色✓球，未找到=灰色？球
     * progressStyle === 'dots' 时由 draw() 调用
     */
    _drawProgressDots: function (state, stripY, W) {
      var info = state.mode ? state.mode.getStatusInfo(state) : null;
      if (!info) return;

      var total = info.progressTotal || 1;
      var done  = info.progress || 0;

      // 必须先确定最终点尺寸，再计算间距和总宽度；否则手机适配缩小 dotSize 后，
      // startX 仍使用缩放前的宽度，左右边距就会不对称。
      var px = M3.Layout.px;
      var availableW = Math.max(0, W - px(32));
      var dotSize = Math.min(px(CONFIG.DOT_SIZE), Math.floor(availableW / total) - px(4));
      dotSize = Math.max(px(16), dotSize);
      var gap = total > 1
        ? Math.min(px(6), Math.max(0, (availableW - dotSize * total) / (total - 1)))
        : 0;
      var totalW = dotSize * total + gap * (total - 1);
      var startX = (W - totalW) / 2;
      var cy = stripY;

      var now       = M3._now();
      var pendingSrc = CONFIG.uiAsset('dotPending');
      var doneSrc    = CONFIG.uiAsset('dotDone');
      var hasPending = pendingSrc && TextureManager.get(pendingSrc);
      var hasDone    = doneSrc    && TextureManager.get(doneSrc);

      for (var i = 0; i < total; i++) {
        var ix = startX + i * (dotSize + gap);
        var isDone = i < done;
        // 正在飞行中的对勾还没"吸附"到这个点之前，即使 state 里已经计数完成，
        // 视觉上仍先展示灰点，等飞行特效落地那一刻再切绿 + 弹一下
        if (isDone && _dotRevealAt[i] && now < _dotRevealAt[i]) isDone = false;

        var scale = 1;
        var flashAlpha = 0;
        if (isDone && _dotPopTs[i]) {
          var age = now - _dotPopTs[i];
          if (age < 350) {
            var p = age / 350;
            scale = 1 + 0.12 * Math.sin(p * Math.PI);
          }
          // 落地瞬间白光爆闪：前 180ms 内从满白快速淡出，制造"爆炸感"
          if (age < 180) {
            flashAlpha = 1 - age / 180;
          }
        }

        var ds = dotSize * scale;
        var dx = ix + (dotSize - ds) / 2;
        var dy = cy  + (dotSize - ds) / 2;

        if (isDone) {
          if (hasDone) {
            Renderer.drawImage(doneSrc, dx, dy, ds, ds);
          } else {
            Renderer.drawCircle(ix + dotSize / 2, cy + dotSize / 2, ds / 2, { fill: '#5fd35a', stroke: '#1a7a18', strokeW: 1.5 });
            Renderer.drawText('✓', ix + dotSize / 2, cy + dotSize / 2 - (dotSize * 0.35), { fontSize: dotSize * 0.55, color: '#fff', align: 'center', bold: true });
          }
          if (flashAlpha > 0) {
            var flashR = ds / 2 * (1 + 0.6 * (1 - flashAlpha));
            Renderer.drawCircle(ix + dotSize / 2, cy + dotSize / 2, flashR, { fill: 'rgba(255,255,255,' + flashAlpha + ')' });
          }
        } else {
          if (hasPending) {
            Renderer.drawImage(pendingSrc, ix, cy, dotSize, dotSize);
          } else {
            Renderer.drawCircle(ix + dotSize / 2, cy + dotSize / 2, dotSize / 2, { fill: '#b0b0c8', stroke: '#6a6a8a', strokeW: 1.5 });
            Renderer.drawText('?', ix + dotSize / 2, cy + dotSize / 2 - (dotSize * 0.35), { fontSize: dotSize * 0.55, color: '#fff', align: 'center', bold: true });
          }
        }
      }

      this._dotLayout = { startX: startX, cy: cy, dotSize: dotSize, gap: gap };
    },

    /**
     * 渲染飞行特效（答对时：对勾脱离 → 带光尾飞行 → 顶部吸附）
     * 路径：二次贝塞尔曲线（起点=点击位置，控制点=上抛弧顶，终点=对应进度点）；
     * 光尾贴图沿曲线切线方向反向铺开（跟随飞行方向），随进度切换更"长"的帧模拟生长感；
     * 到达终点时：隐藏飞行对勾，标记该点弹出时间戳（由 _drawProgressDots 触发绿点+弹性缩放）。
     */
    _drawFlyParticles: function () {
      var now  = M3._now();
      var keep = [];

      for (var i = 0; i < _flyParticles.length; i++) {
        var p   = _flyParticles[i];
        var age = now - p.startT;
        var t  = age / p.dur;
        var frameIdx = Math.min(_TRAIL_TOTAL_FRAMES - 1, Math.floor(t * _TRAIL_TOTAL_FRAMES));
        var trailSrc  = CONFIG.uiAsset(_TRAIL_KEYS[frameIdx]);

        // 第 0 帧在起点原地不动；第 1-13 帧沿贝塞尔飞向进度点；第 14-23 帧停在进度点消散
        var flyT;
        if (frameIdx === 0) {
          flyT = 0;
        } else if (frameIdx <= _TRAIL_ARRIVE_FRAME) {
          flyT = (frameIdx - 1) / (_TRAIL_ARRIVE_FRAME - 1);
        } else {
          flyT = 1;
        }
        var et = 1 - Math.pow(1 - flyT, 3);
        var mt = 1 - et;

        var px2 = mt*mt*p.fromX + 2*mt*et*p.ctrlX + et*et*p.toX;
        var py  = mt*mt*p.fromY + 2*mt*et*p.ctrlY + et*et*p.toY;

        var angle = p.arriveAngle || 0;
        if (frameIdx <= _TRAIL_ARRIVE_FRAME) {
          var tvx = 2*mt*(p.ctrlX - p.fromX) + 2*et*(p.toX - p.ctrlX);
          var tvy = 2*mt*(p.ctrlY - p.fromY) + 2*et*(p.toY - p.ctrlY);
          var tlen = Math.hypot(tvx, tvy) || 1;
          var bx = -tvx / tlen, by = -tvy / tlen;
          angle = Math.atan2(bx, -by) + Math.PI;
          // 限制每帧转角：贝塞尔末端曲率大，解析切线会在最后几帧猛甩，
          // 钳制单帧角速度让转向平滑（±20°/帧）， arriveAngle 也取钳制后角度
          var MAX_TURN = 0.35;
          if (p.lastAngle != null) {
            var dAng = angle - p.lastAngle;
            while (dAng >  Math.PI) dAng -= 2 * Math.PI;
            while (dAng < -Math.PI) dAng += 2 * Math.PI;
            dAng = Math.max(-MAX_TURN, Math.min(MAX_TURN, dAng));
            angle = p.lastAngle + dAng;
          }
          p.lastAngle = angle;
          p.arriveAngle = angle;
        }

        // 第 13 帧抵达进度点的瞬间触发变绿 + 弹性缩放（只触发一次）
        if (frameIdx >= _TRAIL_ARRIVE_FRAME && !p._popped) {
          p._popped = true;
          _dotPopTs[p.dotIdx] = now;
        }

        // 14-23 帧消散阶段透明度渐降
        var trailAlpha = frameIdx > _TRAIL_ARRIVE_FRAME
          ? Math.max(0, 1 - (frameIdx - _TRAIL_ARRIVE_FRAME) / (_TRAIL_TOTAL_FRAMES - 1 - _TRAIL_ARRIVE_FRAME))
          : 1;

        var dotSize = p.dotSize || 24;
        // 光尾长度随飞行距离压缩（trailScale 在 triggerDotFly 里按距离算好）
        var dh = Math.max(78, dotSize * 7.5) * (p.trailScale || 1);
        var dw = dh * (100 / 600);

        if (trailSrc && TextureManager.get(trailSrc)) {
          var halfDh = dh / 2;
          // 锚点沿贴图长度方向滑动：起飞时路径点对齐贴图"尾端"（anchorS=-1），
          // 抵达时对齐"头端"（anchorS=+1），中间随 flyT 线性过渡；
          // 起飞时尾端贴点击处、头部（亮头）朝飞行前方伸出，光尾从点击处自然"拉出"
          var anchorS = 2 * flyT - 1; // flyT 0→1 → anchorS -1→+1；14~23 帧 flyT=1 保持头端
          var cx = px2 - anchorS * halfDh * Math.sin(angle);
          var cy = py  + anchorS * halfDh * Math.cos(angle);
          Renderer.drawImageRotated(trailSrc, cx - dw/2, cy - dh/2, dw, dh, angle, trailAlpha);
        }

        if (age < p.dur) keep.push(p);
      }
      _flyParticles = keep;
    },

    /**
     * 答对时由 PlayController 调用，触发第 dotIdx 个球的飞入特效
     * @param {number} dotIdx  - 刚点亮的球的索引（0-based）
     * @param {number} fromX   - 点击位置 X（canvas 坐标）
     * @param {number} fromY   - 点击位置 Y
     */
    triggerDotFly: function (dotIdx, fromX, fromY) {
      var layout = this._dotLayout;
      if (!layout) return;
      var toX = layout.startX + dotIdx * (layout.dotSize + layout.gap) + layout.dotSize / 2;
      var toY = layout.cy + layout.dotSize / 2;

      // 控制点：两点中点向上抬起，形成上抛弧线（贝塞尔曲线路径）
      var dist = Math.hypot(toX - fromX, toY - fromY);
      var arch = Math.min(90, dist * 0.35) + 24;
      // 飞行时长随距离缩放：长距离 1400ms，短距离按比例压缩，最近不低于 400ms；
      // 距离过近时光尾整体长度也压缩（trailScale 0.45~1），避免光尾比飞行路径还长
      var dur = 400 + 1000 * Math.min(1, dist / 400);
      var trailScale = 0.45 + 0.55 * Math.min(1, dist / 300);

      // 补加载缺失帧：真机上 24 帧 CDN 图若未全部就绪，_drawFlyParticles 里
      // TextureManager.get 拿不到的帧会被整帧跳过，表现为光尾断断续续。
      // 这里在特效触发瞬间把未就绪的帧全部插入加载队列（load 内部按 src 去重，
      // 已加载/加载中的直接命中），配合 TextureManager 的并发队列逐帧补齐，
      // 飞行过程中后续帧即可陆续到货，第一两次点击后缓存全量就绪不再断续。
      for (var fi = 0; fi < _TRAIL_KEYS.length; fi++) {
        var ts = CONFIG.uiAsset(_TRAIL_KEYS[fi]);
        if (ts && !TextureManager.get(ts)) TextureManager.load(ts).catch(function () {});
      }

      _flyParticles.push({
        fromX: fromX, fromY: fromY, toX: toX, toY: toY,
        ctrlX: (fromX + toX) / 2, ctrlY: (fromY + toY) / 2 - arch,
        startT: M3._now(), dur: dur, dotIdx: dotIdx, dotSize: layout.dotSize,
        trailScale: trailScale
      });
      // 进度点在飞行第 13 帧（抵达帧）切换贴图：13/24 * dur
      _dotRevealAt[dotIdx] = M3._now() + dur * _TRAIL_ARRIVE_FRAME / _TRAIL_TOTAL_FRAMES;
    },

    /**
     * 顶部数字底板胶囊：倒计时"80"(秒表底板) + 剩余机会"3"(红心底板)
     * 对齐 Figma 25:330 顶部行 87×40 / 87×42 两个 pill，紧跟返回按钮右侧
     * @returns {number} 绘制完成后的右边界 x 坐标
     */
    _drawStatusPills: function (state, startX, y) {
      var px = M3.Layout.px;
      var info = state.mode ? state.mode.getStatusInfo(state) : null;
      var pill = CONFIG.getPillSize();
      var pillH = pill.h;
      var pillGap = px(6);
      var cx = startX;

      // 胶囊底图中图标的垂直中心比率（原图像素分析得出）：
      //   timer(261x120) icon center y=60.5/120 → 0.504
      //   lives(261x129) icon center y=70.5/129 → 0.547（图标偏下）
      // drawText 默认 valign='top'（y=纹理顶部），文字纹理内字形中心 =
      //   strokeWidth + 2 + fontSize/2（textBaseline='top'，见 text.js getTexture），
      // 令 y + 字形中心 = 图标中心(pillH * ratio)，反求 y。
      var TIMER_ICON_CY = 0.547;
      var LIVES_ICON_CY = 0.547;
      var glyphCenterInTex = px(2) + 2 + pill.font / 2;

      if (info && (info.rightIsTimer || info.timerSecs != null)) {
        var secs = info.timerSecs != null ? Math.max(0, Math.ceil(info.timerSecs)) : Math.max(0, Math.ceil(state.time));
        var pw = pill.w;
        var timesSrc = CONFIG.uiAsset('mnvTimesBarEmpty');
        var timesEntry = timesSrc ? TextureManager.get(timesSrc) : null;
        if (timesEntry) {
          Renderer.drawImage(timesSrc, cx, y, pw, pillH);
        } else {
          Renderer.drawRoundRect(cx, y, pw, pillH, pillH / 2, { fill: 'rgba(60,50,140,0.85)' });
        }
        Renderer.drawText(String(secs), cx + pw * 0.62, y + pillH * TIMER_ICON_CY - glyphCenterInTex, {
          fontSize: pill.font, color: '#ffffff', align: 'center', bold: true,
          strokeColor: 'rgba(0,0,0,0.4)', strokeWidth: px(2)
        });
        cx += pw + pillGap;
      }

      if (info && info.progress != null && (!info.rightIsTimer || info.showLives)) {
        var maxE, used;
        if (state.dressup || state.puzzle) {
          var matchState = state.dressup || state.puzzle;
          maxE = matchState.maxErrors;
          used = matchState.errorCount;
        } else if (state.lives) {
          maxE = state.lives.max;
          used = state.lives.used;
        } else {
          maxE = info.progressTotal || 3;
          used = info.progress;
        }
        var remain = Math.max(0, maxE - used);
        var lw = pill.w;
        var livesSrc = CONFIG.uiAsset('mnvLivesBarEmpty');
        var livesEntry = livesSrc ? TextureManager.get(livesSrc) : null;
        if (livesEntry) {
          Renderer.drawImage(livesSrc, cx, y, lw, pillH + px(2));
        } else {
          Renderer.drawRoundRect(cx, y, lw, pillH, pillH / 2, { fill: 'rgba(140,20,30,0.85)' });
        }
        var livesH = pillH + px(2);
        Renderer.drawText(String(remain), cx + lw * 0.66, y + livesH * LIVES_ICON_CY - glyphCenterInTex, {
          fontSize: pill.font, color: '#ffffff', align: 'center', bold: true,
          strokeColor: 'rgba(0,0,0,0.4)', strokeWidth: px(2)
        });
        cx += lw + pillGap;
      }

      return cx;
    },

    /**
     * 场景内台词气泡（新模版：白色气泡框叠在场景左下/右下角，展示关卡台词）
     * 对齐 Figma 25:330 - container_246:498_246:436（138x59），可选 level.dialogText 字段
     * 依赖：level.dialogDir（'left'|'right'，默认left）
     */
    _drawDialogBubble: function (state, y) {
      var px = M3.Layout.px;
      var level = state.level;
      var text = level.dialogText;
      if (!text) return;

      var W = M3.Layout.w;
      var dir = level.dialogDir === 'right' ? 'right' : 'left';
      var bw = px(138), bh = px(59);
      var bx = dir === 'left' ? px(20) : W - bw - px(20);

      var src = CONFIG.uiAsset(dir === 'left' ? 'mnvBubbleTailLeft' : 'mnvBubbleTailRight');
      var entry = src ? TextureManager.get(src) : null;
      if (entry) {
        Renderer.drawImage(src, bx, y, bw, bh);
      } else {
        Renderer.drawRoundRect(bx, y, bw, bh, px(12), {
          fill: 'rgba(255,255,255,0.92)', stroke: 'rgba(20,16,86,0.3)', strokeW: 1.5
        });
      }
      Renderer.drawText(text, bx + bw / 2, y + px(10), {
        fontSize: px(12), color: '#141056', align: 'center', bold: true,
        maxWidth: bw - px(24), maxLines: 2
      });
    },

    /**
     * 状态条：左侧绿色 candyButton 内嵌分段进度条 + 右侧 timer-bg.png 倒计时
     * 对齐旧版 game.js drawStatusStrip() L3384-3439
     */
    _drawStatusStrip: function (state, y, W, areas) {
      var px = M3.Layout.px;
      var info = state.mode ? state.mode.getStatusInfo(state) : null;
      if (!info) return;

      var stripH = px(30);
      var sy = y + px(6);

      var need = info.progressTotal || 1;
      var found = info.progress || 0;

      var label;
      var mode = state.level.mode;
      if (mode === 'spot') label = '找不同进度：' + found + '/' + need + ' 处';
      else if (mode === 'hunt') label = '🔍 寻物进度：' + found + '/' + need + ' 个';
      else if (mode === 'story') label = '🔍 线索进度：' + found + '/' + need + ' 条';
      else label = '本关需要找茬：' + found + '/' + need + ' 个';

      var tw = px(90);
      var sidePad = px(24);
      var pw = W - tw - sidePad * 2 - px(8);
      var pxLeft = sidePad;

      UIKit.candyButton(pxLeft, sy, pw, stripH, label, 'green', null, { fontSize: px(14), priority: 0 });

      // 右：倒计时（timer-bg.png + 抖动动画）
      var secs = Math.max(0, Math.ceil(state.time));
      var m = String(Math.floor(secs / 60)).padStart(2, '0');
      var s = String(secs % 60).padStart(2, '0');
      var timeStr = m + ':' + s;
      var warn = secs <= 10;

      var tx = W - sidePad - tw;
      var shakeX = 0, shakeY = 0;
      if (warn && secs > 0) {
        var t = M3._now() * 0.02;
        shakeX = Math.sin(t) * 1.5;
        shakeY = Math.cos(t * 1.3) * 1.2;
      }

      var tpw = tw;
      var tph = Math.round(tpw * 84 / 236);
      var timerOffY = (stripH - tph) / 2;
      var timerEntry = TextureManager.get(CONFIG.uiAsset('timerBg'));
      if (timerEntry) {
        Renderer.drawImage(CONFIG.uiAsset('timerBg'), tx + shakeX, sy + timerOffY + shakeY, tpw, tph);
      } else {
        UIKit.candyButton(tx + shakeX, sy + shakeY, tpw, stripH, '', warn ? 'red' : 'blue', null, { fontSize: px(14) });
      }

      Renderer.drawText(timeStr, tx + shakeX + tpw * 0.68, sy + shakeY + timerOffY + tph / 2 - (px(14) * 1.4) / 2, {
        fontSize: px(14), color: '#ffffff', align: 'center',
        strokeColor: '#0a2040', strokeWidth: px(2), bold: true
      });
    },

    /**
     * 底部工具栏：设置齿轮 + 揭晓线索(orange) + 跳过本关(green) + 广告角标
     * 对齐旧版 game.js drawToolbar() L3988-4042
     */
    _drawToolbar: function (state, y, W, areas) {
      var px = M3.Layout.px;
      // 原版无深色背景条，透明叠加在场景图上
      var bh = px(64), gap = px(12);
      var bwSet = px(60);
      var sidePad = px(16); // 两侧留白加大
      var _avail = W - sidePad * 2 - bwSet - gap * 2;
      var bwHint = Math.round(_avail * 0.40);
      var bwSkip = _avail - bwHint;
      var _total = bwSet + gap + bwHint + gap + bwSkip;
      var startX = (W - _total) / 2;
      var by = y + Math.round((CONFIG.getStageBottomReserve() - bh) / 2);

      // 设置齿轮按钮（切图 160×160 正方形）
      var setEntry = TextureManager.get(CONFIG.uiAsset('btnSettingsGame'));
      if (setEntry) {
        var _side = bh;
        var _sx = startX + (bwSet - _side) / 2;
        Renderer.drawImage(CONFIG.uiAsset('btnSettingsGame'), _sx, by, _side, _side);
      } else {
        Renderer.drawCircle(startX + bwSet / 2, by + bh / 2, bh / 2 - px(4), {
          fill: '#ffcf5b', stroke: '#1a1015', strokeW: px(2.5)
        });
      }
      areas.push({
        x: startX, y: by, w: bwSet, h: bh,
        priority: 100, label: 'settings',
        onTap: function () {
          Telemetry.openSettings();
          SceneManager.open('settings-overlay', { from: 'game' });
        }
      });

      // 提示按钮 + 跳过按钮
      var btnCfg = state.mode ? state.mode.showToolbarButtons() : { hint: true, skip: true };

      // 提示按钮状态（最大可用次数按玩法可配置，见 CONFIG.getHintMaxUses）
      var hintMax = CONFIG.getHintMaxUses(state.level.mode);
      var hintUsed = state.hintUsed >= hintMax;
      var hintLabel = hintUsed ? '已 用' : _hintButtonLabel(state);
      var hintAds = state.hintUsed || 0;

      // 跳过按钮状态
      var skipUsed = state.skipUsed || false;
      var skipLabel = skipUsed ? '已 用' : '跳过本关';
      var skipAdCount = state.skipAdCount || 0;

      var cx2 = startX + bwSet + gap;

      // 揭晓线索按钮（orange）
      if (btnCfg.hint) {
        var hintX = cx2;
        var hintArea = UIKit.candyButton(hintX, by, bwHint, bh, hintLabel, 'orange', function () {
          if (!hintUsed) PlayController.useHint();
        }, { fontSize: px(15), priority: 100 });
        areas.push(hintArea);
        if (!hintUsed) {
          UIKit.drawAdBadge(hintX, by, bwHint, { total: hintMax, done: Math.min(hintMax, hintAds) });
        }
        cx2 += bwHint + gap;
      }

      // 跳过本关按钮（green）
      if (btnCfg.skip) {
        var skipX = cx2;
        var skipArea = UIKit.candyButton(skipX, by, bwSkip, bh, skipLabel, 'green', function () {
          if (!skipUsed) PlayController.useSkip();
        }, { fontSize: px(15), priority: 100 });
        areas.push(skipArea);
        if (!skipUsed) {
          UIKit.drawAdBadge(skipX, by, bwSkip, { total: 2, done: skipAdCount });
        }
      }
    },

    /**
     * 底部功能按钮栏（新模版：加时/提示，居中排列；「加5次机会」按玩法可选，仅在
     * CONFIG.getShowAddChance(mode) 为 true 时追加显示第 3 个按钮——换装玩法有
     * 「容错次数」概念需要它，其余玩法（找茬/寻物/剧情）没有对应机制，默认不显示。
     * 按钮数量变化时 totalW/startX 会自动重新居中，不需要额外调整布局代码。
     * 对齐 Figma componentId 92:450/92:455/92:460（Frame 56/57/58）
     */
    _drawItemStrip: function (state, y, W, areas) {
      var px = M3.Layout.px;
      var item = CONFIG.getItemSize();
      var itemSize = item.size;
      var gap = item.gap;
      var botH = CONFIG.getStageBottomReserve();
      var itemY = y + Math.round((botH - itemSize) / 2);

      var hintUsed = state.hintUsed >= CONFIG.getHintMaxUses(state.level.mode);
      var items = [];

      // 加时按钮是否展示按玩法可配置（CONFIG.getShowAddTime，见 TEMPLATE.hud.showAddTimeByMode）
      if (CONFIG.getShowAddTime(state.level.mode)) {
        items.push({
          key: 'mnvBtnAddTime', label: 'add-time', done: state.addTimeUsed || 0,
          onTap: function () { PlayController.useAddTime(); }
        });
      }

      // 提示按钮是否展示按玩法可配置（CONFIG.getShowHint，见 TEMPLATE.hud.showHintByMode）
      if (CONFIG.getShowHint(state.level.mode)) {
        items.push({
          key: 'mnvBtnHint', label: 'hint', done: state.hintUsed || 0, disabled: hintUsed,
          onTap: function () { if (!hintUsed) PlayController.useHint(); }
        });
      }

      if (CONFIG.getShowAddChance(state.level.mode)) {
        items.push({
          key: 'mnvBtnAddChance', label: 'add-chance', done: state.addChanceUsed || 0,
          onTap: function () { PlayController.useAddChance(); }
        });
      }

      // 放大按钮是否展示按玩法可配置（CONFIG.getShowZoom，见 TEMPLATE.hud.showZoomByMode）；
      // 图标按当前是否已放大（state.mode.isZoomed()）在「放大/缩小」两张图之间切换，
      // 点击统一走 PlayController.useZoom() 内部自行判断当前状态做对应的放大/还原。
      if (CONFIG.getShowZoom(state.level.mode)) {
        var _zoomed = !!(state.mode.isZoomed && state.mode.isZoomed());
        items.push({
          key: _zoomed ? 'mnvBtnZoomOut' : 'mnvBtnZoom',
          label: _zoomed ? 'zoom-out' : 'zoom-in', done: 0,
          onTap: function () { PlayController.useZoom(); }
        });
      }

      var totalW = items.length * itemSize + (items.length - 1) * gap;
      var startX = (W - totalW) / 2;

      for (var i = 0; i < items.length; i++) {
        var item = items[i];
        var ix = startX + i * (itemSize + gap);
        var src = CONFIG.uiAsset(item.key);
        var entry = src ? TextureManager.get(src) : null;
        var alpha = item.disabled ? 0.5 : 1;

        if (entry) {
          Renderer.drawImage(src, ix, itemY, itemSize, itemSize, alpha);
        } else {
          Renderer.drawRoundRect(ix, itemY, itemSize, itemSize, px(12), {
            fill: item.disabled ? 'rgba(40,40,40,0.6)' : 'rgba(60,90,180,0.5)'
          });
          Renderer.drawText(item.label, ix + itemSize / 2, itemY + itemSize / 2 - px(12), {
            fontSize: px(13), color: '#ffffff', align: 'center', maxWidth: itemSize - px(8)
          });
        }

        areas.push({
          x: ix, y: itemY, w: itemSize, h: itemSize,
          priority: 100, label: 'item-' + item.label,
          onTap: item.disabled ? function () {} : item.onTap
        });
      }
    }
  };

  // ── 提示按钮文案（与 CONFIG.getHintMaxUses 的真实启用/禁用状态对齐）──────────────
  // 注意：调用方（_drawToolbar）只在 state.hintUsed < hintMax 时才会调用本函数，
  // 达到上限时由调用方直接显示"已 用"，因此这里不需要（也不应该）再单独判断
  // state.hintUsed 是否为真值，避免"明明还没到上限，按钮却已显示已用过"的问题。
  function _hintButtonLabel(state) {
    var info = state.mode && state.mode.getStatusInfo ? state.mode.getStatusInfo(state) : null;
    var allFound = info
      ? info.progress >= (info.progressTotal || 1)
      : state.hits.length >= (state.totalOdds || 1);
    if (allFound) return '全找到';
    return '提 示';
  }
})();
