/**
 * render/shaders.js — 顶点/片元着色器字符串 + 编译工具
 * 提供两套着色器程序：
 *   1. SPRITE_PROG   — 贴图四边形（用于图片、UI 切图）
 *   2. COLOR_PROG    — 纯色/渐变四边形（用于圆角矩形、遮罩）
 *   3. MASK_PROG     — 圆角裁剪（通过 SDF 实现，避免 stencil buffer 开销）
 * 导出：Shaders 对象
 */
(function () {
  'use strict';

  // ── 贴图 Shader ──────────────────────────────────────────────────────────────
  // 注意：tint 是 per-vertex attribute（不是 uniform）。SpriteBatch 会把不同 tint
  // 的 sprite 合并进同一批次（只要贴图相同），若 tint 做成 uniform，flush() 时只
  // 能应用"最后一次 drawSprite 设置的那个值"给整批，会导致同批次内其他 sprite被
  // "渗色"（历史 bug，已在 batch.js 里改为 per-vertex 修复，shader 侧配合同步）。
  var SPRITE_VS = [
    'attribute vec2 a_position;',
    'attribute vec2 a_texCoord;',
    'attribute float a_alpha;',
    'attribute vec3 a_tint;',
    'uniform vec2 u_resolution;',
    'varying vec2 v_texCoord;',
    'varying float v_alpha;',
    'varying vec3 v_tint;',
    'void main() {',
    '  vec2 clipSpace = (a_position / u_resolution) * 2.0 - 1.0;',
    '  gl_Position = vec4(clipSpace * vec2(1, -1), 0, 1);',
    '  v_texCoord = a_texCoord;',
    '  v_alpha = a_alpha;',
    '  v_tint = a_tint;',
    '}'
  ].join('\n');

  var SPRITE_FS = [
    'precision mediump float;',
    'uniform sampler2D u_texture;',
    'varying vec2 v_texCoord;',
    'varying float v_alpha;',
    'varying vec3 v_tint;',
    'void main() {',
    '  vec4 color = texture2D(u_texture, v_texCoord);',
    '  color.rgb *= v_tint;',
    '  color.a   *= v_alpha;',
    '  gl_FragColor = color;',
    '}'
  ].join('\n');

  // ── 纯色 Shader ──────────────────────────────────────────────────────────────
  var COLOR_VS = [
    'attribute vec2 a_position;',
    'attribute vec4 a_color;',
    'uniform vec2 u_resolution;',
    'varying vec4 v_color;',
    'void main() {',
    '  vec2 clipSpace = (a_position / u_resolution) * 2.0 - 1.0;',
    '  gl_Position = vec4(clipSpace * vec2(1, -1), 0, 1);',
    '  v_color = a_color;',
    '}'
  ].join('\n');

  var COLOR_FS = [
    'precision mediump float;',
    'varying vec4 v_color;',
    'void main() {',
    '  gl_FragColor = v_color;',
    '}'
  ].join('\n');

  // ── SDF 圆角矩形 Shader ──────────────────────────────────────────────────────
  // u_rect: [centerX, centerY, halfW, halfH]（逻辑像素）
  // u_radius: 圆角半径
  var ROUND_VS = [
    'attribute vec2 a_position;',
    'uniform vec2 u_resolution;',
    'varying vec2 v_position;',
    'void main() {',
    '  vec2 clipSpace = (a_position / u_resolution) * 2.0 - 1.0;',
    '  gl_Position = vec4(clipSpace * vec2(1, -1), 0, 1);',
    '  v_position = a_position;',
    '}'
  ].join('\n');

  var ROUND_FS = [
    'precision mediump float;',
    'uniform vec4 u_rect;',   // cx, cy, hw, hh
    'uniform float u_radius;',
    'uniform vec4 u_color;',
    'uniform float u_stroke;',
    'uniform vec4 u_strokeColor;',
    'varying vec2 v_position;',
    'float sdfRoundRect(vec2 p, vec2 b, float r) {',
    '  vec2 q = abs(p) - b + r;',
    '  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;',
    '}',
    'void main() {',
    '  vec2 p = v_position - u_rect.xy;',
    '  float d = sdfRoundRect(p, u_rect.zw, u_radius);',
    '  float aa = 1.0;',  // fwidth 需要 OES_standard_derivatives 扩展，用固定值替代
    '  float fill = 1.0 - smoothstep(-aa, aa, d);',
    '  vec4 color = u_color;',
    '  if (u_stroke > 0.0) {',
    '    float strokeInner = d + u_stroke;',
    '    float strokeMask  = (1.0 - smoothstep(-aa, aa, d)) * smoothstep(-aa, aa, strokeInner);',
    '    color = mix(color, u_strokeColor, strokeMask);',
    '  }',
    '  gl_FragColor = vec4(color.rgb, color.a * fill);',
    '}'
  ].join('\n');

  // ── 聚光灯挖空遮罩 Shader（提示用：矩形区域内除圆形挖空区外覆盖暗色） ──────────────
  var MASK_VS = [
    'attribute vec2 a_position;',
    'uniform vec2 u_resolution;',
    'varying vec2 v_position;',
    'void main() {',
    '  vec2 clipSpace = (a_position / u_resolution) * 2.0 - 1.0;',
    '  gl_Position = vec4(clipSpace * vec2(1, -1), 0, 1);',
    '  v_position = a_position;',
    '}'
  ].join('\n');

  var MASK_FS = [
    'precision mediump float;',
    'uniform vec2 u_holeCenter;',   // 挖空圆心（物理像素）
    'uniform float u_holeRadius;',  // 挖空圆半径（物理像素）
    'uniform vec4 u_dimColor;',     // 暗色遮罩颜色
    'varying vec2 v_position;',
    'void main() {',
    '  float d = length(v_position - u_holeCenter) - u_holeRadius;',
    '  float aa = 1.0;',
    '  float outside = smoothstep(-aa, aa, d);',  // 圆内=0（完全透明挖空），圆外=1（覆盖暗色）
    '  gl_FragColor = vec4(u_dimColor.rgb, u_dimColor.a * outside);',
    '}'
  ].join('\n');

  // ── 工具函数 ──────────────────────────────────────────────────────────────────
  function compileShader(gl, type, src) {
    var shader = gl.createShader(type);
    gl.shaderSource(shader, src);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.error('[Shader] compile error:', gl.getShaderInfoLog(shader), src.slice(0, 200));
      gl.deleteShader(shader);
      return null;
    }
    return shader;
  }

  function createProgram(gl, vsSrc, fsSrc) {
    var vs = compileShader(gl, gl.VERTEX_SHADER, vsSrc);
    var fs = compileShader(gl, gl.FRAGMENT_SHADER, fsSrc);
    if (!vs || !fs) return null;
    var prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      console.error('[Shader] link error:', gl.getProgramInfoLog(prog));
      return null;
    }
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    return prog;
  }

  var Shaders = window.Shaders = {
    // 已编译程序（init 后填充）
    sprite: null,
    color:  null,
    round:  null,
    mask:   null,

    /**
     * 编译所有着色器程序
     * @param {WebGLRenderingContext} gl
     */
    init: function (gl) {
      this.sprite = createProgram(gl, SPRITE_VS, SPRITE_FS);
      this.color  = createProgram(gl, COLOR_VS,  COLOR_FS);
      this.round  = createProgram(gl, ROUND_VS,  ROUND_FS);
      this.mask   = createProgram(gl, MASK_VS,   MASK_FS);
    },

    /** 重建（contextRestored 时调用） */
    rebuild: function (gl) {
      this.init(gl);
    }
  };
})();
