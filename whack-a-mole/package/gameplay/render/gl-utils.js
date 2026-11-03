/**
 * gl-utils.js — WebGL 1.0 纯色图形绘制原语
 *
 * 平台约束：禁止 canvas.getContext('2d')，所有绘制必须走 WebGL。
 * 本文件提供最基础的「纯色矩形 / 椭圆 / 7 段数码管数字」绘制能力，
 * 不依赖任何贴图资源，供 render.js 组装具体场景使用。
 *
 * 坐标系：逻辑像素，原点在左上角，x 向右，y 向下（与 AIGCUtils.Layout 一致）。
 */
(function () {
  var AIGCUtils = (window.AIGCUtils = window.AIGCUtils || {});

  var _gl = null;
  var _program = null;
  var _posLoc = null;
  var _colorLoc = null;
  var _resolutionLoc = null;
  var _buffer = null;

  var VERT_SRC =
    'attribute vec2 a_pos;' +
    'uniform vec2 u_resolution;' +
    'void main() {' +
    '  vec2 clip = (a_pos / u_resolution) * 2.0 - 1.0;' +
    '  gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);' +
    '}';

  var FRAG_SRC =
    'precision mediump float;' +
    'uniform vec4 u_color;' +
    'void main() {' +
    '  gl_FragColor = u_color;' +
    '}';

  function _compile(gl, type, src) {
    var shader = gl.createShader(type);
    gl.shaderSource(shader, src);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.error('[gl-utils] shader compile error', gl.getShaderInfoLog(shader));
    }
    return shader;
  }

  function init(gl) {
    if (_program) return;
    _gl = gl;
    var vs = _compile(gl, gl.VERTEX_SHADER, VERT_SRC);
    var fs = _compile(gl, gl.FRAGMENT_SHADER, FRAG_SRC);
    _program = gl.createProgram();
    gl.attachShader(_program, vs);
    gl.attachShader(_program, fs);
    gl.linkProgram(_program);
    if (!gl.getProgramParameter(_program, gl.LINK_STATUS)) {
      console.error('[gl-utils] program link error', gl.getProgramInfoLog(_program));
    }
    _posLoc = gl.getAttribLocation(_program, 'a_pos');
    _colorLoc = gl.getUniformLocation(_program, 'u_color');
    _resolutionLoc = gl.getUniformLocation(_program, 'u_resolution');
    _buffer = gl.createBuffer();

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  }

  function _beginFrame(logicalW, logicalH) {
    var gl = _gl;
    gl.useProgram(_program);
    gl.uniform2f(_resolutionLoc, logicalW, logicalH);
    gl.bindBuffer(gl.ARRAY_BUFFER, _buffer);
    gl.enableVertexAttribArray(_posLoc);
    gl.vertexAttribPointer(_posLoc, 2, gl.FLOAT, false, 0, 0);
  }

  function clear(r, g, b, a) {
    var gl = _gl;
    gl.clearColor(r, g, b, a);
    gl.clear(gl.COLOR_BUFFER_BIT);
  }

  /** 画一个纯色矩形（左上角 x,y + 宽高），颜色 0~1 浮点 */
  function drawRect(x, y, w, h, r, g, b, a) {
    var gl = _gl;
    var verts = new Float32Array([
      x, y,
      x + w, y,
      x, y + h,
      x, y + h,
      x + w, y,
      x + w, y + h,
    ]);
    gl.bufferData(gl.ARRAY_BUFFER, verts, gl.DYNAMIC_DRAW);
    gl.uniform4f(_colorLoc, r, g, b, a === undefined ? 1 : a);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

  /** 画一个用多边形近似的椭圆（圆心 cx,cy，半径 rx,ry） */
  function drawEllipse(cx, cy, rx, ry, r, g, b, a, segments) {
    var gl = _gl;
    segments = segments || 24;
    var verts = [];
    for (var i = 0; i < segments; i++) {
      var a0 = (i / segments) * Math.PI * 2;
      var a1 = ((i + 1) / segments) * Math.PI * 2;
      verts.push(cx, cy);
      verts.push(cx + Math.cos(a0) * rx, cy + Math.sin(a0) * ry);
      verts.push(cx + Math.cos(a1) * rx, cy + Math.sin(a1) * ry);
    }
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(verts), gl.DYNAMIC_DRAW);
    gl.uniform4f(_colorLoc, r, g, b, a === undefined ? 1 : a);
    gl.drawArrays(gl.TRIANGLES, 0, segments * 3);
  }

  // 7 段数码管字模：每个数字由 7 段（上/左上/右上/中/左下/右下/下）组成，1=点亮
  // 顺序：[top, topLeft, topRight, middle, bottomLeft, bottomRight, bottom]
  var DIGIT_SEGMENTS = {
    '0': [1, 1, 1, 0, 1, 1, 1],
    '1': [0, 0, 1, 0, 0, 1, 0],
    '2': [1, 0, 1, 1, 1, 0, 1],
    '3': [1, 0, 1, 1, 0, 1, 1],
    '4': [0, 1, 1, 1, 0, 1, 0],
    '5': [1, 1, 0, 1, 0, 1, 1],
    '6': [1, 1, 0, 1, 1, 1, 1],
    '7': [1, 0, 1, 0, 0, 1, 0],
    '8': [1, 1, 1, 1, 1, 1, 1],
    '9': [1, 1, 1, 1, 0, 1, 1],
  };

  /** 画一个 7 段数码管数字，x,y 为左上角，h 为字高，粗细按比例自动计算 */
  function drawDigit(ch, x, y, h, r, g, b, a) {
    var seg = DIGIT_SEGMENTS[ch];
    if (!seg) return;
    var w = h * 0.55;
    var t = h * 0.12; // 笔画粗细
    var halfH = h / 2;
    // top
    if (seg[0]) drawRect(x + t, y, w - 2 * t, t, r, g, b, a);
    // topLeft
    if (seg[1]) drawRect(x, y + t, t, halfH - t * 1.5, r, g, b, a);
    // topRight
    if (seg[2]) drawRect(x + w - t, y + t, t, halfH - t * 1.5, r, g, b, a);
    // middle
    if (seg[3]) drawRect(x + t, y + halfH - t / 2, w - 2 * t, t, r, g, b, a);
    // bottomLeft
    if (seg[4]) drawRect(x, y + halfH + t / 2, t, halfH - t * 1.5, r, g, b, a);
    // bottomRight
    if (seg[5]) drawRect(x + w - t, y + halfH + t / 2, t, halfH - t * 1.5, r, g, b, a);
    // bottom
    if (seg[6]) drawRect(x + t, y + h - t, w - 2 * t, t, r, g, b, a);
  }

  /** 画一串数字文本，x,y 左上角，h 字高，返回总宽度 */
  function drawNumber(text, x, y, h, r, g, b, a) {
    var w = h * 0.55;
    var gap = h * 0.18;
    var cursor = x;
    for (var i = 0; i < text.length; i++) {
      drawDigit(text[i], cursor, y, h, r, g, b, a);
      cursor += w + gap;
    }
    return cursor - x - gap;
  }

  AIGCUtils.GL = {
    init: init,
    beginFrame: _beginFrame,
    clear: clear,
    drawRect: drawRect,
    drawEllipse: drawEllipse,
    drawNumber: drawNumber,
  };
})();
