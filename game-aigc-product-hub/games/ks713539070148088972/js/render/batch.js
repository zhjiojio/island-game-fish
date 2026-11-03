/**
 * render/batch.js — 批量 sprite/shape 渲染器
 * 职责：
 *   - 将多个 drawSprite / drawRect 调用合批到 Float32Array 缓冲
 *   - 一次 gl.drawArrays 提交，减少 draw call
 *   - 支持 flush()（切换着色器程序时必须先 flush）
 * 依赖：GLContext, Shaders
 * 导出：SpriteBatch（贴图批次）, ShapeBatch（纯色批次）
 *
 * 缓冲区格式（SPRITE）：
 *   每顶点 8 floats: [x, y, u, v, alpha, tintR, tintG, tintB]
 *   每四边形 6 顶点（2 三角形）= 48 floats
 *   （tint 是 per-vertex，而非整批共享的 uniform：同一批次里贴图相同但 tint 不同
 *    的 sprite 若共用一个 uniform，flush() 时只能生效"最后一次设置的 tint"，会
 *    把颜色渗到同批次其他 sprite 上，这是历史 bug，此处已改为 per-vertex 存储）
 *
 * 缓冲区格式（COLOR）：
 *   每顶点 6 floats: [x, y, r, g, b, a]
 *   每四边形 6 顶点 = 36 floats
 */
(function () {
  'use strict';

  var MAX_QUADS = 512;

  // ── SpriteBatch ──────────────────────────────────────────────────────────────
  var SpriteBatch = window.SpriteBatch = {
    _buf:    null,  // Float32Array
    _vbo:    null,  // WebGLBuffer
    _count:  0,     // 当前已积累四边形数
    _prog:   null,
    _uRes:   null,
    _uTex:   null,

    init: function () {
      var gl   = GLContext.gl;
      var prog = Shaders.sprite;
      if (!gl || !prog) return;
      this._prog = prog;
      this._buf  = new Float32Array(MAX_QUADS * 6 * 8);
      this._vbo  = gl.createBuffer();
      this._uRes  = gl.getUniformLocation(prog, 'u_resolution');
      this._uTex  = gl.getUniformLocation(prog, 'u_texture');
    },

    rebuild: function () { this.init(); },

    /**
     * 加入一个贴图四边形
     * @param {WebGLTexture} tex
     * @param {number} x,y,w,h  目标矩形（逻辑像素，左上角）
     * @param {number} [sx,sy,sw,sh]  源 UV 矩形（0~1），默认全图
     * @param {number} [alpha]
     * @param {number[]} [tint]  [r,g,b] 0~1，per-vertex，不影响同批次其他 sprite
     * @param {number} [angle]  绕目标矩形中心的顺时针旋转角度（弧度），默认 0
     */
    drawSprite: function (tex, x, y, w, h, sx, sy, sw, sh, alpha, tint, angle) {
      var gl = GLContext.gl;
      if (!gl) return;
      if (this._count >= MAX_QUADS) this.flush();

      // 切换到不同纹理时必须 flush
      if (this._currentTex && this._currentTex !== tex) this.flush();
      this._currentTex = tex;

      var dpr = GLContext.dpr;
      var px  = x * dpr, py = y * dpr, pw = w * dpr, ph = h * dpr;

      sx = sx === undefined ? 0 : sx;
      sy = sy === undefined ? 0 : sy;
      sw = sw === undefined ? 1 : sw;
      sh = sh === undefined ? 1 : sh;
      alpha = alpha === undefined ? 1 : alpha;
      var t  = tint || [1, 1, 1];
      var tr = t[0], tg = t[1], tb = t[2];

      var u0 = sx, v0 = sy, u1 = sx + sw, v1 = sy + sh;

      var cx = px + pw / 2, cy = py + ph / 2;
      var hw = pw / 2, hh = ph / 2;
      var corners;
      if (angle) {
        var cos = Math.cos(angle), sin = Math.sin(angle);
        var rot = function (lx, ly) {
          return [cx + lx * cos - ly * sin, cy + lx * sin + ly * cos];
        };
        corners = [rot(-hw, -hh), rot(hw, -hh), rot(-hw, hh), rot(hw, hh)];
      } else {
        corners = [[cx-hw, cy-hh], [cx+hw, cy-hh], [cx-hw, cy+hh], [cx+hw, cy+hh]];
      }
      var p00 = corners[0], p10 = corners[1], p01 = corners[2], p11 = corners[3];

      var buf = this._buf;
      var off = this._count * 48; // 6 verts * 8 floats
      // tri 0
      buf[off+ 0]=p00[0]; buf[off+ 1]=p00[1]; buf[off+ 2]=u0; buf[off+ 3]=v0; buf[off+ 4]=alpha; buf[off+ 5]=tr; buf[off+ 6]=tg; buf[off+ 7]=tb;
      buf[off+ 8]=p10[0]; buf[off+ 9]=p10[1]; buf[off+10]=u1; buf[off+11]=v0; buf[off+12]=alpha; buf[off+13]=tr; buf[off+14]=tg; buf[off+15]=tb;
      buf[off+16]=p01[0]; buf[off+17]=p01[1]; buf[off+18]=u0; buf[off+19]=v1; buf[off+20]=alpha; buf[off+21]=tr; buf[off+22]=tg; buf[off+23]=tb;
      // tri 1
      buf[off+24]=p10[0]; buf[off+25]=p10[1]; buf[off+26]=u1; buf[off+27]=v0; buf[off+28]=alpha; buf[off+29]=tr; buf[off+30]=tg; buf[off+31]=tb;
      buf[off+32]=p11[0]; buf[off+33]=p11[1]; buf[off+34]=u1; buf[off+35]=v1; buf[off+36]=alpha; buf[off+37]=tr; buf[off+38]=tg; buf[off+39]=tb;
      buf[off+40]=p01[0]; buf[off+41]=p01[1]; buf[off+42]=u0; buf[off+43]=v1; buf[off+44]=alpha; buf[off+45]=tr; buf[off+46]=tg; buf[off+47]=tb;

      this._count++;
    },

    flush: function () {
      var gl = GLContext.gl;
      if (!gl || this._count === 0) { this._count = 0; return; }

      var prog = this._prog;
      gl.useProgram(prog);

      var canvas = GLContext.canvas;
      gl.uniform2f(this._uRes, canvas.width, canvas.height);

      gl.bindTexture(gl.TEXTURE_2D, this._currentTex);
      gl.uniform1i(this._uTex, 0);

      gl.bindBuffer(gl.ARRAY_BUFFER, this._vbo);
      gl.bufferData(gl.ARRAY_BUFFER, this._buf.subarray(0, this._count * 48), gl.DYNAMIC_DRAW);

      var STRIDE = 8 * 4;
      var aPos   = gl.getAttribLocation(prog, 'a_position');
      var aTex   = gl.getAttribLocation(prog, 'a_texCoord');
      var aAlpha = gl.getAttribLocation(prog, 'a_alpha');
      var aTint  = gl.getAttribLocation(prog, 'a_tint');
      gl.enableVertexAttribArray(aPos);
      gl.vertexAttribPointer(aPos,   2, gl.FLOAT, false, STRIDE, 0);
      gl.enableVertexAttribArray(aTex);
      gl.vertexAttribPointer(aTex,   2, gl.FLOAT, false, STRIDE, 8);
      gl.enableVertexAttribArray(aAlpha);
      gl.vertexAttribPointer(aAlpha, 1, gl.FLOAT, false, STRIDE, 16);
      gl.enableVertexAttribArray(aTint);
      gl.vertexAttribPointer(aTint,  3, gl.FLOAT, false, STRIDE, 20);

      gl.drawArrays(gl.TRIANGLES, 0, this._count * 6);

      gl.bindBuffer(gl.ARRAY_BUFFER, null);
      gl.bindTexture(gl.TEXTURE_2D, null);
      this._count = 0;
      this._currentTex = null;
    }
  };

  // ── ShapeBatch ───────────────────────────────────────────────────────────────
  var ShapeBatch = window.ShapeBatch = {
    _buf:   null,
    _vbo:   null,
    _count: 0,
    _prog:  null,
    _uRes:  null,

    init: function () {
      var gl   = GLContext.gl;
      var prog = Shaders.color;
      if (!gl || !prog) return;
      this._prog = prog;
      this._buf  = new Float32Array(MAX_QUADS * 6 * 6);
      this._vbo  = gl.createBuffer();
      this._uRes = gl.getUniformLocation(prog, 'u_resolution');
    },

    rebuild: function () { this.init(); },

    /**
     * 加入一个纯色矩形
     * @param {number} x,y,w,h
     * @param {number[]} color  [r,g,b,a] 0~1
     */
    drawRect: function (x, y, w, h, color) {
      var gl = GLContext.gl;
      if (!gl) return;
      if (this._count >= MAX_QUADS) this.flush();

      var dpr = GLContext.dpr;
      var x0 = x*dpr, y0 = y*dpr, x1 = (x+w)*dpr, y1 = (y+h)*dpr;
      var r = color[0], g = color[1], b = color[2], a = color[3];

      var buf = this._buf;
      var off = this._count * 36;
      buf[off+ 0]=x0; buf[off+ 1]=y0; buf[off+ 2]=r; buf[off+ 3]=g; buf[off+ 4]=b; buf[off+ 5]=a;
      buf[off+ 6]=x1; buf[off+ 7]=y0; buf[off+ 8]=r; buf[off+ 9]=g; buf[off+10]=b; buf[off+11]=a;
      buf[off+12]=x0; buf[off+13]=y1; buf[off+14]=r; buf[off+15]=g; buf[off+16]=b; buf[off+17]=a;
      buf[off+18]=x1; buf[off+19]=y0; buf[off+20]=r; buf[off+21]=g; buf[off+22]=b; buf[off+23]=a;
      buf[off+24]=x1; buf[off+25]=y1; buf[off+26]=r; buf[off+27]=g; buf[off+28]=b; buf[off+29]=a;
      buf[off+30]=x0; buf[off+31]=y1; buf[off+32]=r; buf[off+33]=g; buf[off+34]=b; buf[off+35]=a;
      this._count++;
    },

    flush: function () {
      var gl = GLContext.gl;
      if (!gl || this._count === 0) { this._count = 0; return; }

      var prog = this._prog;
      gl.useProgram(prog);
      gl.uniform2f(this._uRes, GLContext.canvas.width, GLContext.canvas.height);

      gl.bindBuffer(gl.ARRAY_BUFFER, this._vbo);
      gl.bufferData(gl.ARRAY_BUFFER, this._buf.subarray(0, this._count * 36), gl.DYNAMIC_DRAW);

      var STRIDE = 6 * 4;
      var aPos   = gl.getAttribLocation(prog, 'a_position');
      var aColor = gl.getAttribLocation(prog, 'a_color');
      gl.enableVertexAttribArray(aPos);
      gl.vertexAttribPointer(aPos,   2, gl.FLOAT, false, STRIDE, 0);
      gl.enableVertexAttribArray(aColor);
      gl.vertexAttribPointer(aColor, 4, gl.FLOAT, false, STRIDE, 8);

      gl.drawArrays(gl.TRIANGLES, 0, this._count * 6);
      gl.bindBuffer(gl.ARRAY_BUFFER, null);
      this._count = 0;
    }
  };
})();
