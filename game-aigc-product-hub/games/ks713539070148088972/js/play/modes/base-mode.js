/**
 * play/modes/base-mode.js — 玩法模式基类
 * 职责：
 *   - 提供 4 种内置玩法模式（hidden/spot/hunt/story）共用的默认实现，
 *     减少新增玩法时的样板代码（框架化关键点：BaseMode.extend + 覆盖需要
 *     定制的方法即可，无需从零实现整套接口）
 *   - 具体玩法通过 BaseMode.extend(Ctor) 继承后，按需覆盖
 *     draw/hitTest/onCorrect/showNarrative/_drawNarrative 等方法
 * 约定：
 *   子类构造函数中先调用 BaseMode.call(this, level, theme) 初始化公共字段
 *   （this.level / this.theme / this._fit / this._marks /
 *    this._narrativeTxt / this._narrativeTimer），再设置自身专属字段。
 * 依赖：Renderer, TextureManager, CONFIG, M3, Difficulty
 * 导出：window.BaseMode
 *
 * 新增玩法最小示例：
 *   function MyMode(level, theme) { BaseMode.call(this, level, theme); }
 *   BaseMode.extend(MyMode);
 *   MyMode.prototype.draw = function (state) { ... 只需实现绘制 ... };
 *   ModeRegistry.register('myMode', MyMode);
 *   // hitTest/onCorrect/update/showNarrative/_drawNarrative 均可直接复用默认实现
 */
(function () {
  'use strict';

  function BaseMode(level, theme) {
    this.level  = level;
    this.theme  = theme;
    this._fit   = null;   // {x,y,w,h} 单图 contain 矩形（多图模式可自行维护额外字段，如 spot 的 _fitA/_fitB）
    this._marks = [];     // 已命中标记，默认格式 [{fx,fy}]（图片百分比坐标，随缩放/平移重新投影；spot 自行覆盖存储方式）
    this._narrativeTxt   = '';
    this._narrativeTimer = 0;
    this._allFoundFlashAt = null;  // 全部选对后触发的闪烁起始时间戳（见 triggerAllFoundFlash）
    // 双指缩放状态：{scale, u0, v0} —— u0/v0 是当前显示的图片 UV 子区域左上角(0~1)，
    // us=vs=1/scale 是子区域宽高。scale=1 时 u0=v0=0，等价于未缩放（见 CONFIG.getShowZoom）。
    this._zoom = { scale: 1, u0: 0, v0: 0 };
  }

  BaseMode.ZOOM_MIN    = 1;
  BaseMode.ZOOM_MAX    = 2;     // 放大倍数上限（原为 3，放大后纹理拉伸糊；2 倍在清晰度和可用性间更均衡
  BaseMode.ZOOM_PRESET = 1.8;   // 点击「放大」按钮时一键跳到的预设倍数（点「缩小」还原为 1）

  /**
   * 让子类构造函数继承 BaseMode 原型（ES5 继承样板，供所有玩法模式复用）
   * @param {Function} Ctor  子类构造函数
   */
  BaseMode.extend = function (Ctor) {
    Ctor.prototype = Object.create(BaseMode.prototype);
    Ctor.prototype.constructor = Ctor;
  };

  /**
   * 通用 contain 适配计算（图片等比缩放居中于目标区域）
   * @returns {{x,y,w,h}|null}  纹理未就绪时返回 null
   */
  BaseMode.prototype._calcFit = function (src, areaX, areaY, areaW, areaH) {
    var entry = TextureManager.get(src);
    if (!entry || !entry.img) return null;
    var iw = entry.img.width, ih = entry.img.height;
    var scale = Math.min(areaW / iw, areaH / ih);
    var dw = iw * scale, dh = ih * scale;
    return {
      x: areaX + (areaW - dw) / 2,
      y: areaY + (areaH - dh) / 2,
      w: dw, h: dh
    };
  };

  /**
   * 撑满宽度适配计算：图片宽度撑满目标区域宽度（不再按 contain 居中留白），
   * 高度按原图宽高比自适应，纵向居中于目标区域。舞台区域内所有玩法图片统一走这个
   * 适配方式（hidden/hunt/story/spot/dressup），保证画面横向撑满、不留左右空白。
   * @returns {{x,y,w,h}|null}  纹理未就绪时返回 null
   */
  BaseMode.prototype._calcFitWidth = function (src, areaX, areaY, areaW, areaH) {
    var entry = TextureManager.get(src);
    if (!entry || !entry.img) return null;
    var iw = entry.img.width, ih = entry.img.height;
    var scale = areaW / iw;
    var dw = areaW, dh = ih * scale;
    var offsetY = 0;
    return {
      x: areaX,
      y: areaY + offsetY,
      w: dw, h: dh
    };
  };

  /**
   * 舞台图片区域上下紫色分割线（#908ee5，各 4px，贴在图片区域边框外侧，不遮挡图片本身）。
   * 供各玩法在绘制完舞台图片（单图/双图合并区域/换装原图区域）后统一调用一次。
   * @param {number} top    图片区域顶边 y（分割线画在 top 上方）
   * @param {number} bottom 图片区域底边 y（分割线画在 bottom 下方）
   */
  BaseMode.DIVIDER_COLOR = '#908ee5';
  BaseMode.prototype._drawImageDividers = function (top, bottom) {
    var W = M3.Layout.w;
    var t = M3.Layout.px ? M3.Layout.px(4) : 4;
    Renderer.drawRect(0, top - t, W, t, BaseMode.DIVIDER_COLOR);
    Renderer.drawRect(0, bottom, W, t, BaseMode.DIVIDER_COLOR);
    // 纯色矩形(ShapeBatch)与贴图(SpriteBatch)是两个独立批次，只有在这里立即 flush，
    // 才能让分割线稳定卡在"舞台图之上、后续手势引导等贴图之下"，否则会因批次统一
    // 提交顺序（SpriteBatch 先、ShapeBatch 后）永远盖住本帧所有贴图（旧 bug：换装
    // 引导手势 tapHand 被这两条分割线盖住）。
    if (Renderer.flush) Renderer.flush();
  };


  /**
   * 获取当前缩放的 UV 子区域 {u0,v0,us,vs}（scale=1 时 us=vs=1，等价于整图）。
   * 供 draw() 里替换 Renderer.drawImage 为 _drawZoomedImage，以及 hitTest/_drawHintMask/
   * _drawMarks 换算屏幕坐标 <-> 图片百分比坐标时统一复用。
   */
  BaseMode.prototype._zoomUV = function () {
    var z = this._zoom || { scale: 1, u0: 0, v0: 0 };
    var s = z.scale || 1;
    return { u0: z.u0 || 0, v0: z.v0 || 0, us: 1 / s, vs: 1 / s };
  };

  /**
   * 按 UV 子区域绘制图片（目标矩形固定为 fit，放大时只是从图片里截取更小的区域铺满，
   * 不会让内容溢出舞台区域，也不需要额外裁剪/scissor）。放大位未开启（scale=1）时
   * 与 Renderer.drawImage(fit) 完全等价。
   * @param {string} src
   * @param {{x,y,w,h}|null} fit
   */
  BaseMode.prototype._drawZoomedImage = function (src, fit) {
    if (!fit) return;
    var uv = this._zoomUV();
    Renderer.drawImageRegion(src, fit.x, fit.y, fit.w, fit.h, uv.u0, uv.v0, uv.us, uv.vs);
  };

  /**
   * 应用一次双指缩放增量（由 InputManager.onPinch 回调触发，见 core/input.js handlePinch）。
   * @param {number} scaleDelta   本帧相对上帧的两指间距比值
   * @param {number} dxScreen,dyScreen  两指中点本帧相对上帧的位移（逻辑像素）
   * @param {{x,y,w,h}} refFit    用于把屏幕像素位移换算成 UV 位移的参考矩形（取当前画面里任一张图的 fit 即可）
   */
  BaseMode.prototype.applyPinch = function (scaleDelta, dxScreen, dyScreen, refFit) {
    if (!refFit || !refFit.w || !refFit.h) return;
    var z = this._zoom;
    var newScale = (z.scale || 1) * (scaleDelta || 1);
    newScale = Math.max(BaseMode.ZOOM_MIN, Math.min(BaseMode.ZOOM_MAX, newScale));

    var oldUs = 1 / (z.scale || 1);
    var newUs = 1 / newScale;
    // 缩放锚点取当前裁剪窗口中心，保证放大/缩小时画面视觉中心基本不跳变
    var centerU = (z.u0 || 0) + oldUs / 2;
    var centerV = (z.v0 || 0) + oldUs / 2;

    z.scale = newScale;
    z.u0 = centerU - newUs / 2;
    z.v0 = centerV - newUs / 2;

    // 双指中点位移 => 平移裁剪窗口（手指往右移，画面内容应往右移，即裁剪窗口往左移）
    z.u0 -= (dxScreen / refFit.w) * newUs;
    z.v0 -= (dyScreen / refFit.h) * newUs;

    // clamp：裁剪窗口不能超出图片范围 [0,1]
    z.u0 = Math.max(0, Math.min(1 - newUs, z.u0));
    z.v0 = Math.max(0, Math.min(1 - newUs, z.v0));

    // 缩小到接近 1 倍时直接归位，避免浮点误差残留出一个几乎无感的裁剪窗口
    if (z.scale <= 1.02) { z.scale = 1; z.u0 = 0; z.v0 = 0; }
  };

  /** 是否处于放大状态（预留给需要在放大时隐藏部分 UI 的玩法自行判断） */
  BaseMode.prototype.isZoomed = function () {
    return !!(this._zoom && this._zoom.scale > 1.001);
  };

  /** 重置缩放（关卡切换/复活/重开时调用，避免残留上一关的缩放状态） */
  BaseMode.prototype.resetZoom = function () {
    this._zoom = { scale: 1, u0: 0, v0: 0 };
  };

  /**
   * 一键放大到预设倍数（BaseMode.ZOOM_PRESET），裁剪窗口居中对焦画面中点。
   * 由 HUD「放大」按钮点击触发（未放大时点它 → 放大；已放大时点它改调 resetZoom 还原），
   * 放大后仍可继续用双指捏合/单指拖拽自由调整缩放与位置。
   */
  BaseMode.prototype.zoomInPreset = function () {
    var scale = Math.max(BaseMode.ZOOM_MIN, Math.min(BaseMode.ZOOM_MAX, BaseMode.ZOOM_PRESET));
    var us = 1 / scale;
    this._zoom = { scale: scale, u0: (1 - us) / 2, v0: (1 - us) / 2 };
  };

  /** 绘制单个命中标记圆圈 */
  BaseMode.prototype._drawMark = function (cx, cy, color) {
    var alpha = this._markFlashAlpha();
    var src = CONFIG.uiAsset('mnvIconCorrect');
    var entry = src ? TextureManager.get(src) : null;
    if (entry) {
      var size = 44;
      Renderer.drawImage(src, cx - size / 2, cy - size / 2, size, size, alpha);
    } else {
      Renderer.drawCircle(cx, cy, 22, {
        fill: 'rgba(0,0,0,0)',
        stroke: color || '#00ff88',
        strokeW: 3
      });
    }
  };

  /**
   * 一关全部选对后触发一次"全部标记闪烁"动效，供 play.js 在最后一击命中时调用，
   * 闪烁结束（duration 内）后自动恢复常亮，随后再进入结算画面。
   */
  BaseMode.prototype.triggerAllFoundFlash = function () {
    this._allFoundFlashAt = M3._now();
  };

  BaseMode.ALL_FOUND_FLASH_DURATION = 2000;
  BaseMode.ALL_FOUND_FLASH_BLINKS = 4;

  /** 计算当前标记的绘制透明度：闪烁窗口内按 sin 波往返明暗，其余时间常亮 */
  BaseMode.prototype._markFlashAlpha = function () {
    if (!this._allFoundFlashAt) return 1;
    var age = M3._now() - this._allFoundFlashAt;
    var duration = BaseMode.ALL_FOUND_FLASH_DURATION;
    if (age >= duration) { this._allFoundFlashAt = null; return 1; }
    var t = age / duration;
    return 0.3 + 0.7 * Math.abs(Math.sin(t * Math.PI * BaseMode.ALL_FOUND_FLASH_BLINKS));
  };

  /**
   * 绘制 this._marks（{fx,fy} 图片百分比坐标格式）里的全部标记，按当前缩放/平移
   * 状态重新投影到屏幕坐标，保证放大/平移后已命中的标记依然贴在原来的图片位置上。
   * 放大后被裁剪窗口挪出可视范围的标记会直接跳过，避免圆圈画到图片框外面。
   */
  BaseMode.prototype._drawMarks = function (color) {
    var fit = this._fit;
    if (!fit) return;
    var uv = this._zoomUV();
    for (var i = 0; i < this._marks.length; i++) {
      var m = this._marks[i];
      var sx = fit.x + ((m.fx - uv.u0) / uv.us) * fit.w;
      var sy = fit.y + ((m.fy - uv.v0) / uv.vs) * fit.h;
      if (sx < fit.x || sx > fit.x + fit.w || sy < fit.y || sy > fit.y + fit.h) continue;
      this._drawMark(sx, sy, color);
    }
  };

  /**
   * 绘制提示定位遮罩：黑色半透明遮罩覆盖整张目标图片，仅在正确答案（odd）
   * 所在的圆形区域挖空，直接给出定位提示（替代旧版"小手"指示）。
   * @param {object} state  PlayController.state
   * @param {{x,y,w,h}|null} fit  目标图片矩形（多图模式传对应的那张图的 fit）
   */
  BaseMode.prototype._drawHintMask = function (state, fit) {
    if (state.hintArrow === null || !fit) return;
    var odd = this.level.odds && this.level.odds[state.hintArrow.oddIdx];
    if (!odd) return;
    var uv = this._zoomUV();
    var fx = (odd.x + odd.w / 2) / 100, fy = (odd.y + odd.h / 2) / 100;
    var hcx = fit.x + ((fx - uv.u0) / uv.us) * fit.w;
    var hcy = fit.y + ((fy - uv.v0) / uv.vs) * fit.h;
    var halfW = (odd.w / 100) / uv.us * fit.w / 2;
    var halfH = (odd.h / 100) / uv.vs * fit.h / 2;
    // 挖空圆半径 = 目标包围盒外接圆半径 + 25% 余量，确保答案完整露出
    var radius = Math.max(halfW, halfH, 18) * 1.25;
    Renderer.drawSpotlightMask(fit.x, fit.y, fit.w, fit.h, hcx, hcy, radius);
  };

  /**
   * 默认命中判定：单张 fit 图 + hitScale 中心收缩。
   * 单图玩法（如 hidden/hunt）可直接复用；多图/特殊判定逻辑（如 spot/story）需自行覆盖。
   * 换算时会考虑当前双指缩放的 UV 裁剪窗口（_zoomUV），未开启放大时 u0=v0=0/us=vs=1，
   * 与旧版行为完全一致。
   */
  BaseMode.prototype.hitTest = function (cx, cy, hits) {
    var fit = this._fit;
    if (!fit) return { hit: false };
    if (cx < fit.x || cx > fit.x + fit.w || cy < fit.y || cy > fit.y + fit.h) return { hit: false };

    var uv = this._zoomUV();
    var fracX = (cx - fit.x) / fit.w, fracY = (cy - fit.y) / fit.h;
    // 屏幕坐标 -> 图片百分比坐标（0~1），考虑当前放大裁剪窗口
    var px = uv.u0 + fracX * uv.us;
    var py = uv.v0 + fracY * uv.vs;

    var odds = this.level.odds || [];
    var diff = window.Difficulty ? Difficulty.getDiff(this.level) : { hitScale: 1.0 };
    var hs   = diff.hitScale || 1.0;

    for (var i = 0; i < odds.length; i++) {
      if (hits.indexOf(i) >= 0) continue;
      var o   = odds[i];
      var ox  = o.x / 100, oy = o.y / 100;
      var ow  = (o.w / 100) * hs, oh = (o.h / 100) * hs;
      var ocx = ox + (o.w / 100) / 2;
      var ocy = oy + (o.h / 100) / 2;
      var rx  = ocx - ow / 2, ry = ocy - oh / 2;
      if (px >= rx && px <= rx + ow && py >= ry && py <= ry + oh) {
        return { hit: true, oddIdx: i };
      }
    }
    return { hit: false };
  };

  /** 默认命中反馈：记录一个 {fx,fy} 图片百分比坐标标记（单图模式可直接复用），
   *  存图片坐标而非屏幕坐标，是为了放大/平移后 _drawMarks 仍能正确重新投影。 */
  BaseMode.prototype.onCorrect = function (oddIdx, cx, cy) {
    var fit = this._fit;
    if (!fit) return;
    var uv = this._zoomUV();
    var fracX = (cx - fit.x) / fit.w, fracY = (cy - fit.y) / fit.h;
    this._marks.push({
      fx: uv.u0 + fracX * uv.us,
      fy: uv.v0 + fracY * uv.vs
    });
  };

  /** 默认每帧 update：无操作（多数玩法不需要逐帧逻辑） */
  BaseMode.prototype.update = function (dt) {};

  /**
   * 命中后飞行特效的起点：取 odd 中心点在屏幕上的投影（与 _drawMark 绿圈位置一致），
   * 保证光尾从"圈出来的位置"起飞，而不是用户实际点击的偏移点。
   * 多图/特殊模式（如 spot）可覆盖此方法返回对应图的圈中心。
   * @returns {{x,y}} 屏幕坐标（逻辑像素）
   */
  BaseMode.prototype.getCorrectScreenPos = function (oddIdx, cx, cy) {
    var fit = this._fit;
    var odd = this.level.odds && this.level.odds[oddIdx];
    if (!fit || !odd) return { x: cx, y: cy };
    var uv = this._zoomUV();
    var fx = (odd.x + odd.w / 2) / 100, fy = (odd.y + odd.h / 2) / 100;
    return {
      x: fit.x + ((fx - uv.u0) / uv.us) * fit.w,
      y: fit.y + ((fy - uv.v0) / uv.vs) * fit.h
    };
  };

  /**
   * 默认覆盖层绘制：无操作。
   * 由 PlayController.draw() 在 HUD 绘制之后调用，用于绘制需要盖住 HUD 的
   * 全屏元素（如 story 的简报蒙版+卡片）。多数玩法不需要覆盖 HUD，无需覆盖此方法。
   */
  BaseMode.prototype.drawOverlay = function (state) {};

  /** 默认旁白气泡：记录文本 + 起始时间（配合 _drawNarrative 的淡入淡出） */
  BaseMode.prototype.showNarrative = function (text) {
    this._narrativeTxt   = text;
    this._narrativeTimer = M3._now();
  };

  /** 默认旁白气泡绘制（3s 淡入淡出；需要打字机等特效的玩法可覆盖此方法） */
  BaseMode.prototype._drawNarrative = function () {
    if (!this._narrativeTxt) return;
    var age = M3._now() - this._narrativeTimer;
    if (age > 3000) { this._narrativeTxt = ''; return; }
    var alpha = age > 2400 ? 1 - (age - 2400) / 600 : 1;
    var W  = M3.Layout.w;
    var bw = 240, bh = 48;
    var bx = (W - bw) / 2, by = CONFIG.getLayoutRegions(this.level.mode).stage.y + 16;
    Renderer.drawRoundRect(bx, by, bw, bh, 10, { fill: 'rgba(0,0,0,' + (0.7 * alpha) + ')' });
    Renderer.drawText(this._narrativeTxt, W/2, by + 14, {
      fontSize: 14, color: 'rgba(255,255,200,' + alpha + ')', align: 'center',
      maxWidth: 220, maxLines: 2
    });
  };

  // ── 可覆盖的多态方法（子类按需重写）────────────────────────────────────────

  /** 是否需要倒计时（true=需要，false=不需要） */
  BaseMode.prototype.needsCountdown = function () { return true; };

  /** 每帧 tick（无计时模式可在此驱动逐帧逻辑，默认无操作） */
  BaseMode.prototype.onTick = function (dt, state) {};

  /** 计算星级（默认调 Difficulty） */
  BaseMode.prototype.calcStars = function (state) {
    if (!window.Difficulty) return 0;
    return Difficulty.calcStars(state.time, state.totalTime);
  };

  /** 计算击败百分比（默认调 Difficulty） */
  BaseMode.prototype.calcBeatPct = function (state) {
    if (!window.Difficulty) return 0;
    return Difficulty.calcBeatPercent(this.calcStars(state));
  };

  /**
   * 获取当前玩法「看视频复活」实际追加的数值（按 limitType 区分秒数/次数，按玩法可单独配置，
   * 见 config.js CONFIG.getReviveAmount）。这是复活链路数值的唯一来源：
   * play.js 在打开失败弹窗时调用本方法，把结果显式塞进 SceneManager.open 的
   * data.reviveAmount 传给 lose-modal 卡片文案；卡片按钮点击后 useRevive 把同一个
   * limitType 传回 onRevive，onRevive 内部再次调用本方法取得同一数值应用生效，
   * 保证「文案显示的数值」与「实际生效的数值」始终一致。
   * @param {'time'|'count'} limitType
   */
  BaseMode.prototype.getReviveAmount = function (limitType) {
    return CONFIG.getReviveAmount(this.level && this.level.mode, limitType);
  };

  /**
   * 复活（按 limitType 精确恢复对应资源，避免文案与实际效果不一致）：
   *   - 'time'  → 计时器耗尽触发，只加时间，不动生命值（生命本就没用完）
   *   - 'count' → 生命值用尽触发，在已用尽的基础上追加 getReviveAmount('count') 次机会
   *     （而非直接重置 used=0——重置后恢复的次数等于 lives.max，与「看视频可增加5次」
   *     文案不一致，见 watchVideoHint 配置），不加时间（时间本就没到）
   *   - 不传    → 兼容旧版默认行为（无 lives 概念的失败弹窗，时间+次数一起恢复）
   */
  BaseMode.prototype.onRevive = function (state, limitType) {
    state.running = true;
    if (limitType === 'count') {
      if (state.lives) state.lives.max = (state.lives.max || 0) + this.getReviveAmount('count');
    } else if (limitType === 'time') {
      // 复活加时是额外奖励，不应被关卡原始时长钳制（追加秒数本身可能大于 totalTime）
      state.time = state.time + this.getReviveAmount('time');
    } else {
      state.time = state.time + this.getReviveAmount('time');
      if (state.lives) state.lives.used = 0;
    }
    // 关键：必须同步刷新 _lastTick，否则 update() 会把"倒计时到0之后 + 看广告"
    // 这段真实经过的时间当成一次性 elapsed 扣掉，导致刚加的秒数在几帧内被瞬间
    // 清空（表现为"60 秒像 1 秒一样飞速流过"）。
    state._lastTick = M3._now();
  };

  /**
   * 状态栏信息（HUD 用）
   * @returns {{progress, progressTotal, rightText, rightColor, rightIsTimer}}
   */
  BaseMode.prototype.getStatusInfo = function (state) {
    var secs = Math.max(0, Math.ceil(state.time));
    return {
      progress: state.hits.length,
      progressTotal: state.totalOdds || 1,
      rightText: secs + '',
      rightColor: secs <= 10 ? '#ff4444' : '#ffffff',
      rightIsTimer: true,
      showLives: !!state.lives  // 倒计时之外，额外展示剩余生命值红心（点错扣命，非扣秒）
    };
  };

  /** 失败弹窗标题 */
  BaseMode.prototype.getLoseTitle = function () { return '⏰ 时间到！'; };

  /** 失败弹窗副标题 */
  BaseMode.prototype.getLoseSubtitle = function (state) {
    var remaining = (state.totalOdds || 0) - state.hits.length;
    return '还剩 ' + remaining + ' 个没找到';
  };

  /** 复活按钮文案（仅供旧版 _drawCard/_drawFullscreen 死代码路径使用，当前 loseModal.style 固定为
   *  'card-image'，实际展示的文案见 product.config.js watchVideoHintTime，此处保留仅为兼容） */
  BaseMode.prototype.getReviveLabel = function () { return '+' + this.getReviveAmount('time') + '秒继续'; };

  /** 复活成功 toast 文案（按 limitType 区分：'time'=只加了时间，'count'=只加了机会次数） */
  BaseMode.prototype.getReviveToast = function (limitType) {
    if (limitType === 'count') return '❤️ +' + this.getReviveAmount('count') + ' 次机会已恢复！';
    return '⏰ +' + this.getReviveAmount('time') + ' 秒！继续加油！';
  };

  /** HUD 工具栏显示哪些按钮（提示按钮是否展示按 CONFIG.getShowHint(mode) 可配置，跳过按钮默认展示） */
  BaseMode.prototype.showToolbarButtons = function () {
    return { hint: CONFIG.getShowHint(this.level && this.level.mode), skip: true };
  };

  /** 进关语音 key（默认找茬开场白） */
  BaseMode.prototype.getIntroAudio = function () { return 'scene_hunt_intro'; };

  /**
   * 初始化 mode 专属 state 字段（子类按需覆盖，如 dressup 完全自定义 state.dressup）。
   * 默认（hidden/spot/hunt/story 等 odds 类玩法）初始化生命值：点错扣命，命数用尽即失败，
   * 不再像旧版那样点错扣倒计时秒数（倒计时只管关卡整体时限/星级，两者独立判定失败）。
   */
  BaseMode.prototype.initState = function (state) {
    state.lives = {
      max: typeof this.level.maxErrors === 'number' ? this.level.maxErrors : 3,
      used: 0
    };
  };

  /** 命中正确回调（子类可覆盖以追加专属文案/埋点/音效） */
  BaseMode.prototype.onCorrectCallback = function (state, ctx) {
    Audio.playCorrect();
    state.floats.push({
      x: ctx.x !== undefined ? ctx.x : M3.Layout.w / 2,
      y: M3.Layout.h / 2 - 60,
      text: ctx.text || '找到了！', t: M3._now(), life: 900,
      color: ctx.color || '#00ff88',
      align: ctx.align || 'center'
    });
    Storage.addStat('correct');
  };

  /** 命中错误回调（子类可覆盖以追加专属文案/埋点/音效） */
  BaseMode.prototype.onWrongCallback = function (state, ctx) {
    Audio.playWrong();
    state.floats.push({
      x: M3.Layout.w / 2, y: M3.Layout.h / 2 - 60,
      text: ctx.text || '不对哦！', t: M3._now(), life: 900,
      color: ctx.color || '#ff4444'
    });
  };

  window.BaseMode = BaseMode;
})();
