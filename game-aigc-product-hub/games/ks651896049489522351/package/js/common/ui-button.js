(function () {
  var M3 = window.M3 = window.M3 || {};

  // ─────────────────────────────────────────────────────────────────
  // 通用胶囊按钮 — 直接调用 M3.Render WebGL 接口（无 Canvas 2D ctx）
  // ─────────────────────────────────────────────────────────────────
  M3.UIButton = M3.UIButton || {};

  // 颜色预设（shadow 为按钮下方的投影色：取比按钮更深的暗色，Figma 如 teal 用 #2C5959）
  // border 为按钮边框描边（Figma 788-4212 组件集：teal/gray 有浅色渐变边框，red/gold/blue 无边框）
  var STYLES = {
    gold: { top: '#FFDE59', bottom: '#FDA33E', strokeTop: '#C75602', strokeBottom: '#AD4B02', edge: '#AD4B02', text: '#ffffff', shadow: 'rgba(120,55,2,.45)', border: '' },
    blue: { top: '#5BB3F0', bottom: '#2667BE', strokeTop: '#2E67AF', strokeBottom: '#184183', edge: '#184183', text: '#ffffff', shadow: 'rgba(16,42,90,.45)', border: '' },
    red:  { top: '#FF6A5A', bottom: '#CF3130', strokeTop: '#C23932', strokeBottom: '#951D1A', edge: '#951D1A', text: '#ffffff', shadow: 'rgba(90,16,14,.45)', border: '' },
    teal: { top: '#7EBABD', bottom: '#569091', strokeTop: '#508081', strokeBottom: '#305F5D', edge: '#305F5D', text: '#ffffff', shadow: 'rgba(28,77,76,.45)', border: 'rgba(206,244,243,0.6)' },
    gray: { top: '#8493AD', bottom: '#525B70', strokeTop: '#626B81', strokeBottom: '#3A4255', edge: '#3A4255', text: '#ffffff', shadow: 'rgba(24,28,40,.45)', border: 'rgba(163,175,195,0.46)' },
  };

  // 切图资源（公共目录 asset/image/common/btn/，全局常驻不释放）
  // gold=btn-6 金 / blue=btn-5 蓝 / teal=btn-3 青绿 / gray=btn-1 灰蓝 / red=btn-2 红
  // （btn-4 深藏青已弃用：disabled 状态改为同款样式降透明度）
  var BTN_ASSETS = {
    gold: ['btnGold', 'asset/image/common/btn/btn-6.png'],
    blue: ['btnBlue', 'asset/image/common/btn/btn-5.png'],
    teal: ['btnTeal', 'asset/image/common/btn/btn-3.png'],
    gray: ['btnGray', 'asset/image/common/btn/btn-1.png'],
    red:  ['btnRed',  'asset/image/common/btn/btn-2.png'],
  };
  var SPRITES = {
    gold: 'btnGold', blue: 'btnBlue', teal: 'btnTeal',
    gray: 'btnGray', red: 'btnRed',
  };

  /**
   * 预加载所有按钮底图（全局常驻，不释放）。
   * 在 main.js 初始化时调用一次即可；其他 scene 不必单独加载 btn-1~6。
   */
  M3.UIButton.preload = function () {
    var AM = M3.AssetManager;
    if (!AM) return;
    for (var k in BTN_ASSETS) {
      if (BTN_ASSETS.hasOwnProperty(k)) {
        var entry = BTN_ASSETS[k];
        if (!AM.loaded(entry[0])) AM.acquire('image', entry[0], entry[1], 'ui-buttons');
      }
    }
  };

  // 文字描边色（按按钮色系区分，设计提供：btn-1~6 对应 gray/red/teal/disabled/blue/gold）
  var TEXT_STROKES = {
    gray: '#626B81',   // btn-1
    red:  '#C23932',   // btn-2
    teal: '#508081',   // btn-3
    blue: '#2E67AF',   // btn-5
    gold: '#C75602',   // btn-6
  };

  function getBtnSprite (styleKey) {
    var AM = M3.AssetManager;
    if (!AM || !AM.loaded) return null;
    var key = SPRITES[styleKey] || '';
    if (!key || !AM.loaded(key)) return null;
    return AM.get(key);
  }

  // 颜色字符串 → [r,g,b,a]（复用，与 render.js 保持一致）
  function parseColor (css) {
    if (!css || css === 'transparent') return [0,0,0,0];
    var m = css.match(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)/);
    if (m) return [+m[1]/255, +m[2]/255, +m[3]/255, m[4]!==undefined ? +m[4] : 1];
    if (css[0]==='#') {
      var h=css.slice(1);
      if (h.length===3) h=h[0]+h[0]+h[1]+h[1]+h[2]+h[2];
      return [parseInt(h.slice(0,2),16)/255, parseInt(h.slice(2,4),16)/255,
              parseInt(h.slice(4,6),16)/255, h.length>=8?parseInt(h.slice(6,8),16)/255:1];
    }
    return [0,0,0,1];
  }

  // 两色线性混合（t=0→c1, t=1→c2）
  function mixColor (c1, c2, t) {
    var a=parseColor(c1), b=parseColor(c2);
    return 'rgba('+Math.round((a[0]*(1-t)+b[0]*t)*255)+','+
                   Math.round((a[1]*(1-t)+b[1]*t)*255)+','+
                   Math.round((a[2]*(1-t)+b[2]*t)*255)+','+(a[3]*(1-t)+b[3]*t)+')';
  }

  // 渐变填充：使用 fillRoundedGrad（顶点着色）实现真正的线性渐变圆角矩形
  function gradFillRect (r, x, y, w, h, c1, c2, steps, rd) {
    rd = rd || 0;
    if (r.fillRoundedGrad) {
      r.fillRoundedGrad(x, y, w, h, rd, c1, c2);
    } else {
      // 降级：直接用中间色
      var mid = mixColor(c1, c2, 0.5);
      if (rd > 0) r.fillRounded(x, y, w, h, rd, mid);
      else        r.fillRect(x, y, w, h, mid);
    }
  }

  // 圆角矩形辅助（用 arc 生成真正圆角，arcTo 在 render 的 _buildPts 中不生成弧点）
  function rrect (r, x, y, w, h, rd) {
    if (rd < 0) rd = 0;
    if (rd > h/2) rd = h/2;
    if (rd > w/2) rd = w/2;
    r.beginPath();
    r.moveTo(x+rd, y);
    r.lineTo(x+w-rd, y);
    r.arc(x+w-rd, y+rd, rd, -Math.PI/2, 0, false);
    r.lineTo(x+w, y+h-rd);
    r.arc(x+w-rd, y+h-rd, rd, 0, Math.PI/2, false);
    r.lineTo(x+rd, y+h);
    r.arc(x+rd, y+h-rd, rd, Math.PI/2, Math.PI, false);
    r.lineTo(x, y+rd);
    r.arc(x+rd, y+rd, rd, Math.PI, Math.PI*1.5, false);
    r.closePath();
  }

  /**
   * 绘制一个胶囊按钮（WebGL 直接绘制，无 Canvas 2D）
   * @param {Object} o - { x, y, w, h, label, style, disabled, onClick,
   *                        gradient, topColor, bottomColor, textColor,
   *                        align, minW }
   */
  M3.UIButton.draw = function (o) {
    var r = M3.Render;
    var hitBtns = r.getHitBtns();
    var x = o.x, y = o.y, h = o.h;
    var label = String(o.label || '');
    var disabled = !!o.disabled;

    var lip  = Math.max(2, Math.round(h * 0.055));
    var bodyH = h - lip;
    var rd   = bodyH / 2;     // 全胶囊圆角
    var sz   = Math.min(18, Math.max(13, Math.round(bodyH * 0.56)));
    var fontStr = '800 ' + sz + 'px sans-serif';
    var padX = Math.max(12, Math.round(bodyH * 0.47));

    // 动态宽度
    var textW = r.glMeasureText(label, fontStr);
    var needW = Math.ceil(textW + padX * 2);
    var minW  = (typeof o.minW === 'number') ? o.minW : (o.w || 0);
    var w     = Math.max(minW, needW);
    var align = o.align || 'left';
    if      (align === 'right')  x = x + (o.w || w) - w;
    else if (align === 'center') x = x + ((o.w || w) - w) / 2;

    r.save();

    // 按压缩放动画（与主页 beginPress 一致）：按住期间以按钮中心缩至 93%，
    // 松手/拖出恢复。热区矩形保持原始大小，不影响命中判定。
    // disabled 不做反馈（点了也无响应，视觉上也应无反应）。
    if (!disabled) {
      var _pressKey = o.hitLabel || label;
      if (M3.Input && M3.Input.getPressedLabel && M3.Input.getPressedLabel() === _pressKey) {
        var _pcx = x + w / 2, _pcy = y + h / 2;
        r.translate(_pcx, _pcy);
        r.scale(0.93, 0.93);
        r.translate(-_pcx, -_pcy);
      }
    }

    // 切图模式：4 角等比缩放 + 中列整体拉伸。
    // 角半径随高度等比（k=h/34），圆角保持正圆；中列取源图完整高度连续拉伸——
    // 若用普通 9 宫格上下行截取，h≠34 时两段源区间重叠，中间会出现拼缝色差线。
    // 切图已含 Figma 全部效果（渐变+按色系边框+立体底边）。
    // disabled 不换 btn-4 深藏青图：不可点击状态保持同款样式、整体降透明度。
    var sprite = getBtnSprite(o.style);
    if (sprite) {
      var iw = sprite.width || 87, ih = sprite.height || 34;
      var kx = iw / 87, ky = ih / 34;                 // 源图相对设计尺寸倍率（通常 3x）
      var pl = 17 * kx;                               // 源物理角（17 逻辑正方形）
      var c = Math.min(17 * (h / 34), w / 2);         // 目标角（等比，正圆）
      if (disabled) r.setAlpha(0.30);                 // 不可点击：同款按钮仅降透明度
      r.glDrawImage(sprite, 0, 0, pl, pl, x, y, c, c);                      // 左上
      r.glDrawImage(sprite, iw - pl, 0, pl, pl, x + w - c, y, c, c);        // 右上
      r.glDrawImage(sprite, 0, ih - pl, pl, pl, x, y + h - c, c, c);        // 左下
      r.glDrawImage(sprite, iw - pl, ih - pl, pl, pl, x + w - c, y + h - c, c, c);  // 右下
      if (w - 2 * c > 0.5) {
        r.glDrawImage(sprite, pl, 0, iw - 2 * pl, ih, x + c, y, w - 2 * c, h);  // 中列全高
      }
      var sTxt = (STYLES[o.style] || STYLES.blue).text;
      var textCY = y + h / 2;   // 切图主体为按钮全高（lip 是渐变模式的立边概念），几何居中
      // 文字描边：烘焙合一（描边+本体一张纹理，1 次绘制；色值按按钮色系区分）
      if (o.textStroke !== false && r.glFillTextStroke) {
        var sStrokeMid = o.textStroke || (TEXT_STROKES[o.style] || '#626B81');
        var sLw = o.textStrokeWidth || Math.max(2.5, sz * 0.16);
        r.glFillTextStroke(label, x+w/2, textCY, fontStr, sTxt, sStrokeMid, sLw, 'center', 'middle');
      } else {
        r.glFillText(label, x+w/2, textCY, fontStr, sTxt, 'center', 'middle');
      }
      r.restore();
      hitBtns.push({ x:x, y:y, w:w, h:h, onClick:o.onClick, label:o.hitLabel || label, disabled:disabled });
      return { x:x, y:y, w:w, h:h };
    }

    // 不可点击（无切图回退路径）：同样保持原样式、整体降透明度
    if (disabled) r.setAlpha(0.45);

    var s = STYLES[o.style] || STYLES.blue;
    var grad = o.gradient || [];
    var topColor    = o.topColor    || grad[0] || s.top;
    var bottomColor = o.bottomColor || grad[1] || s.bottom;
    var edgeColor   = o.edgeColor   || s.edge;
    var textColor   = o.textColor   || s.text;
    var strokeTop   = (o.strokeGradient||[])[0] || s.strokeTop || s.edge;
    var strokeBot   = (o.strokeGradient||[])[1] || s.strokeBottom || s.edge;

    // 1) 底部立边（与主体同形胶囊，仅向下偏移 lip，露出底部一条深色唇边；
    //    不再用全高胶囊 —— 全高胶囊在底部两侧的弧会比主体更外凸，形成左右突出的阴影）
    rrect(r, x, y + lip, w, bodyH, rd); r.fill(edgeColor);

    // 2) 主体渐变（圆角分段填充）
    gradFillRect(r, x, y, w, bodyH, topColor, bottomColor, 12, rd);

    // 3) 底部暗光
    gradFillRect(r, x, y + bodyH*0.6, w, bodyH*0.4, 'rgba(0,0,0,0)', 'rgba(0,0,0,0.12)', 4, rd);

    // 4) 边框描边（Figma：teal/gray 浅色系边框，red/gold/blue 无边框）
    var borderColor = o.borderColor || s.border || '';
    if (borderColor) {
      rrect(r, x+0.5, y+0.5, w-1, bodyH-1, rd);
      r.stroke(borderColor, 1);
    }

    // 6) 文字描边（取描边渐变中点近似；烘焙合一：1 次绘制）
    if (o.textStroke !== false && r.glFillTextStroke) {
      var strokeMid = o.textStroke || mixColor(strokeTop, strokeBot, 0.5);
      var lw = o.textStrokeWidth || Math.max(2.5, sz * 0.16);
      r.glFillTextStroke(label, x+w/2, y+bodyH/2, fontStr, textColor, strokeMid, lw, 'center', 'middle');
    } else {
      r.glFillText(label, x+w/2, y+bodyH/2, fontStr, textColor, 'center', 'middle');
    }

    hitBtns.push({ x:x, y:y, w:w, h:h, onClick:o.onClick, label:o.hitLabel || label, disabled:disabled });
    r.restore();
    return { x:x, y:y, w:w, h:h };
  };
})();
