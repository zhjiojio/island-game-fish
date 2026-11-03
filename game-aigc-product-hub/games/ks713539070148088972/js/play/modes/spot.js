/**
 * play/modes/spot.js — 双图找不同模式
 * 职责：
 *   - 支持 layout='h'（上下）/ layout='v'（左右）双图排版
 *   - 点击 A 图坐标自动映射到 B 图等比坐标
 *   - 两图均可点击，命中框基准为 B 图
 *   - 绿圈在两图对应位置均显示
 *   - hitTest/onCorrect 为双图特殊逻辑，需覆盖 BaseMode 默认实现；
 *     其余（_calcFitWidth/_drawMark/update/showNarrative/_drawNarrative）复用 BaseMode
 * 依赖：BaseMode, Renderer, TextureManager, CONFIG, M3, Difficulty
 */
(function () {
  'use strict';

  function SpotMode(level, theme) {
    BaseMode.call(this, level, theme);
    this._fitA  = null;  // A 图矩形
    this._fitB  = null;  // B 图矩形
    // 命中标记覆盖为百分比坐标格式（两图通用）：[{pct:{x,y}}]
    this._marks = [];
  }
  BaseMode.extend(SpotMode);

  SpotMode.collectAssetGroups = function (level) {
    return [[level.sceneA, level.sceneB], [level.completeImage]];
  };

  SpotMode.prototype.draw = function (state) {
    var level  = this.level;
    var layout = level.layout || 'h';
    var stage  = CONFIG.getLayoutRegions(level.mode).stage;
    var stageX = stage.x;
    var stageY = stage.y;
    var stageW = stage.w;
    var stageH = stage.h;

    var fitA = null, fitB = null;

    // 两图之间留 2px 间隔露出背景（不再画黑线分割），双图均按各自所占宽度
    // （layout='h' 上下各占满整宽；layout='v' 左右各占一半）撑满宽度，高度按原图比例
    // 自适应、纵向居中于对应半区（不再用旧版 contain 联合缩放限制总高度）
    var GAP = M3.Layout.px(2);
    if (layout === 'h') {
      // 注意：不能像 layout='v' 那样简单二等分再各自居中——_calcFitWidth 会在
      // 分配到的半区高度内把图片纵向居中，若图片实际缩放高度小于半区高度，
      // 上下各会多出一段镂空的背景色留白，叠加 GAP 后视觉间距远大于 2px
      // （旧 bug）。这里先按原图宽高比各自算出「贴宽后的真实高度」，再以
      // dhA + GAP + dhB 整体在 stageH 内居中拼接，保证两图之间实际就是 GAP。
      var entryA = TextureManager.get(level.sceneA);
      var entryB = TextureManager.get(level.sceneB);
      if (entryA && entryA.img && entryB && entryB.img) {
        var dhA = stageW * (entryA.img.height / entryA.img.width);
        var dhB = stageW * (entryB.img.height / entryB.img.width);
        var totalH = dhA + GAP + dhB;
        // 宽度始终撑满 stageW（与 _calcFitWidth 的统一设计一致，横向不留空白）；
        // 高度按原图比例算出，不做二次缩放——用 scaleDown 只压高度会把图压扁
        // 变形，这里只在 totalH 超出 stageH 时整体居中（不缩放），保持原图比例。
        var pairY = stageY;
        fitA = { x: stageX, y: pairY, w: stageW, h: dhA };
        fitB = { x: stageX, y: pairY + dhA + GAP, w: stageW, h: dhB };
      } else {
        var halfH = (stageH - GAP) / 2;
        fitA = this._calcFitWidth(level.sceneA, stageX, stageY, stageW, halfH);
        fitB = this._calcFitWidth(level.sceneB, stageX, stageY + halfH + GAP, stageW, halfH);
        if (!fitA || !fitB) { fitA = null; fitB = null; }
      }
    } else {
      var halfW = (stageW - GAP) / 2;
      fitA = this._calcFitWidth(level.sceneA, stageX, stageY, halfW, stageH);
      fitB = this._calcFitWidth(level.sceneB, stageX + halfW + GAP, stageY, halfW, stageH);
      if (!fitA || !fitB) { fitA = null; fitB = null; }
    }

    this._fitA = fitA;
    this._fitB = fitB;
    if (fitA) this._drawZoomedImage(level.sceneA, fitA);
    if (fitB) this._drawZoomedImage(level.sceneB, fitB);

    if (fitA && fitB) {
      // 紫色分割线贴在两图合并区域的最外侧上下边缘
      var bboxTop = Math.min(fitA.y, fitB.y);
      var bboxBottom = Math.max(fitA.y + fitA.h, fitB.y + fitB.h);
      this._drawImageDividers(bboxTop, bboxBottom);
    }

    // 命中标记（两图各自绘制，双指缩放时随 uv 裁剪窗口重新投影，与 A/B 图保持同步；
    // 放大后被裁剪窗口挪出可视范围的标记直接跳过，避免圆圈画到图片框外面）
    var uv = this._zoomUV();
    for (var i = 0; i < this._marks.length; i++) {
      var m = this._marks[i];
      if (fitA) {
        var ax = fitA.x + ((m.pct.x - uv.u0) / uv.us) * fitA.w;
        var ay = fitA.y + ((m.pct.y - uv.v0) / uv.vs) * fitA.h;
        if (ax >= fitA.x && ax <= fitA.x + fitA.w && ay >= fitA.y && ay <= fitA.y + fitA.h) {
          this._drawMark(ax, ay);
        }
      }
      if (fitB) {
        var bxc = fitB.x + ((m.pct.x - uv.u0) / uv.us) * fitB.w;
        var byc = fitB.y + ((m.pct.y - uv.v0) / uv.vs) * fitB.h;
        if (bxc >= fitB.x && bxc <= fitB.x + fitB.w && byc >= fitB.y && byc <= fitB.y + fitB.h) {
          this._drawMark(bxc, byc);
        }
      }
    }

    // 提示遮罩（A、B 两图都要挖空提示，保持双图视觉一致，不能只提示下面一张）
    this._drawHintMask(state, fitA);
    this._drawHintMask(state, fitB);

    this._drawNarrative();
  };

  SpotMode.prototype.hitTest = function (cx, cy, hits) {
    var fitA = this._fitA, fitB = this._fitB;
    if (!fitA || !fitB) return { hit: false };

    var odds = this.level.odds || [];
    var diff = window.Difficulty ? Difficulty.getDiff(this.level) : { hitScale: 1.0 };
    var hs   = diff.hitScale || 1.0;
    var uv   = this._zoomUV();

    // 判断点击在哪个图上，统一换算为图片百分比坐标（考虑双指缩放的 uv 裁剪窗口）
    var pctX, pctY;
    if (cx >= fitA.x && cx <= fitA.x + fitA.w && cy >= fitA.y && cy <= fitA.y + fitA.h) {
      pctX = uv.u0 + ((cx - fitA.x) / fitA.w) * uv.us;
      pctY = uv.v0 + ((cy - fitA.y) / fitA.h) * uv.vs;
    } else if (cx >= fitB.x && cx <= fitB.x + fitB.w && cy >= fitB.y && cy <= fitB.y + fitB.h) {
      pctX = uv.u0 + ((cx - fitB.x) / fitB.w) * uv.us;
      pctY = uv.v0 + ((cy - fitB.y) / fitB.h) * uv.vs;
    } else {
      return { hit: false };
    }

    for (var i = 0; i < odds.length; i++) {
      if (hits.indexOf(i) >= 0) continue;
      var o  = odds[i];
      var ox = o.x / 100, oy = o.y / 100;
      var ow = (o.w / 100) * hs, oh = (o.h / 100) * hs;
      // 中心收缩
      var ocx = ox + (o.w / 100) / 2;
      var ocy = oy + (o.h / 100) / 2;
      var rx  = ocx - ow / 2, ry = ocy - oh / 2;

      if (pctX >= rx && pctX <= rx + ow && pctY >= ry && pctY <= ry + oh) {
        return { hit: true, oddIdx: i };
      }
    }
    return { hit: false };
  };

  SpotMode.prototype.onCorrect = function (oddIdx, cx, cy) {
    var odd = this.level.odds && this.level.odds[oddIdx];
    if (!odd) return;
    this._marks.push({
      pct: { x: (odd.x + odd.w / 2) / 100, y: (odd.y + odd.h / 2) / 100 }
    });
  };

  /** 飞行特效起点：用户点在哪张图上，就从那张图的 odd 中心（绿圈位置）起飞 */
  SpotMode.prototype.getCorrectScreenPos = function (oddIdx, cx, cy) {
    var odd = this.level.odds && this.level.odds[oddIdx];
    if (!odd) return { x: cx, y: cy };
    var fitA = this._fitA, fitB = this._fitB;
    // 判断点击落在哪张图上，特效从对应那张图的圈中心起飞（绿圈两图都画，以点击图为准）
    var fit = (fitA && cx >= fitA.x && cx <= fitA.x + fitA.w &&
               cy >= fitA.y && cy <= fitA.y + fitA.h) ? fitA : fitB;
    if (!fit) return { x: cx, y: cy };
    var uv = this._zoomUV();
    var fx = (odd.x + odd.w / 2) / 100, fy = (odd.y + odd.h / 2) / 100;
    return {
      x: fit.x + ((fx - uv.u0) / uv.us) * fit.w,
      y: fit.y + ((fy - uv.v0) / uv.vs) * fit.h
    };
  };

  if (typeof ModeRegistry !== 'undefined') {
    ModeRegistry.register('spot', SpotMode);
  }
})();
