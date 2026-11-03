(function () {
  var M3 = window.M3 = window.M3 || {};
  var C = M3.Config.C || {};
  var L = M3.Layout;

  // ================================================================
  // WebGL 1.0 渲染引擎 — 直接调用 gl API，无任何 2D 适配层
  // ================================================================
  var gl;           // WebGLRenderingContext
  var _prog;        // WebGLProgram（主程序：纹理 + 纯色 + 圆形裁剪）
  var _loc = {};    // attribute / uniform locations
  var _vbo;
  var _vboData;
  var VBO_MAX = 131072; // float 数量上限（约 5461 个三角形，8 float/顶点）

  // ================================================================
  // 批量合并渲染（Batch Rendering）
  // 同一纹理/模式的顶点累积到 _batchBuf，帧末或切换时统一 flush，
  // 将每帧 100+ 次 gl.drawArrays 压缩到个位数。
  // ================================================================
  var BATCH_MAX = 65536;              // float 容量（~2730 个矩形）
  var _batchBuf     = new Float32Array(BATCH_MAX);
  var _batchLen     = 0;              // 当前 batch 已写入的 float 数
  var _batchTex     = null;           // 当前 batch 绑定的纹理
  var _batchUseTex  = false;          // 当前 batch 纹理/纯色模式

  var _cpuMs = 0, _cpuAcc = 0, _cpuN = 0;   // 每帧 CPU 绘制耗时（HUD 显示）
  var _gapMs = 0, _gapAcc = 0, _gapN = 0, _frameLast = 0;   // rAF 帧间隔（HUD 显示）
  var _dc = 0, _dcLast = 0;   // 每帧 drawArrays 次数（HUD 显示，真机批处理效果的直接指标）

  // ── GL 状态影子缓存 ────────────────────────────────────────────────
  // 快手小游戏每次 GL 调用都要跨 JS→native 桥，代价远高于浏览器；
  // program / VBO / 顶点属性指针在本渲染器里从头到尾不变，uniform 也大多帧内恒定。
  // 这里记录已提交的状态，只在真正变化时才下发，把每帧 GL 调用数从 900+ 压到 ~200。
  var _stProg = null, _stBuf = null, _stAttrs = false, _stTexUnit = -1;
  var _stTex = null, _stUseTex = -1, _stClip = -1, _stFeather = -1, _stRingInner = -1, _stProj = false;
  var _stTexSampler = -1;

  // 状态在外部被改动（context 重建等）后调用，强制下一次重新下发
  function _resetGlState () {
    _stProg = null; _stBuf = null; _stAttrs = false; _stTexUnit = -1;
    _stTex = null; _stUseTex = -1; _stClip = -1; _stFeather = -1; _stRingInner = -1; _stProj = false;
  }

  // program + VBO + 顶点属性布局：三者恒定，整个生命周期只需下发一次
  function _bindPipeline () {
    if (_stProg !== _prog) { gl.useProgram(_prog); _stProg = _prog; }
    if (_stBuf !== _vbo) { gl.bindBuffer(gl.ARRAY_BUFFER, _vbo); _stBuf = _vbo; }
    if (!_stAttrs) {
      var F = 4, stride = 8 * F;
      gl.vertexAttribPointer(_loc.aPos,   2, gl.FLOAT, false, stride, 0);
      gl.vertexAttribPointer(_loc.aUV,    2, gl.FLOAT, false, stride, 2 * F);
      gl.vertexAttribPointer(_loc.aColor, 4, gl.FLOAT, false, stride, 4 * F);
      gl.enableVertexAttribArray(_loc.aPos);
      gl.enableVertexAttribArray(_loc.aUV);
      gl.enableVertexAttribArray(_loc.aColor);
      _stAttrs = true;
    }
    if (!_stProj) { gl.uniformMatrix4fv(_loc.uProj, false, _projMat); _stProj = true; }
  }

  function _setUseTex (v) { v = v ? 1 : 0; if (_stUseTex !== v) { gl.uniform1i(_loc.uUseTex, v); _stUseTex = v; } }
  function _setClip (v)   { if (_stClip !== v) { gl.uniform1i(_loc.uClipCircle, v); _stClip = v; } }
  function _setFeather (v){ if (_stFeather !== v) { gl.uniform1f(_loc.uFeather, v); _stFeather = v; } }
  function _setRingInner (v) { if (_stRingInner !== v) { gl.uniform1f(_loc.uRingInner, v); _stRingInner = v; } }

  function _bindTex (tex) {
    if (_stTexUnit !== 0) { gl.activeTexture(gl.TEXTURE0); _stTexUnit = 0; }
    if (_stTex !== tex) { gl.bindTexture(gl.TEXTURE_2D, tex); _stTex = tex; }
    if (_loc.uTex != null && _stTexSampler !== 0) { gl.uniform1i(_loc.uTex, 0); _stTexSampler = 0; }
  }

  function _flushBatch () {
    if (_batchLen === 0 || !gl || !_prog) return;
    _bindPipeline();
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, _batchBuf.subarray(0, _batchLen));
    _setUseTex(_batchUseTex);
    _setClip(0);
    if (_batchUseTex && _batchTex) _bindTex(_batchTex);
    gl.drawArrays(gl.TRIANGLES, 0, _batchLen / 8); _dc++;
    _batchLen = 0;
  }

  // FPS 计数器
  var _fpsFrames = 0;
  var _fpsLast   = 0;
  var _fpsVal    = 0;
  var _showFps   = false;     // 通过 M3.Render.showFps(bool) 开关

  // 正交投影矩阵（列主序 4x4）
  var _projMat = new Float32Array(16);
  var _lw = 375, _lh = 667;   // CSS 逻辑分辨率

  // 透明度栈
  var _alpha = 1;
  var _alphaStack = [];

  // 2D 仿射变换（行主序 3x3：[a,b,tx, c,d,ty, 0,0,1]）
  var _tf = [1,0,0, 0,1,0, 0,0,1];
  var _tfStack = [];

  // 路径命令队列
  var _cmds = [];

  // 离屏 2D canvas（文字测量 + 纹理烘焙）
  var _txtCvs, _txtCtx;
  var _txtTexCache = {};   // "font|color|text" → {tex, tw, th, cw, ch}

  // 图片纹理缓存
  var _imgTexMap = typeof WeakMap !== 'undefined' ? new WeakMap() : null;
  var _imgTexArr = [];

  // 渐变近似
  function _GradColor(stops) { this.stops = stops; }
  _GradColor.prototype._sample = function () {
    var s = this.stops; if (!s || !s.length) return [0,0,0,1];
    var r=0,g=0,b=0,a=0;
    for (var i=0;i<s.length;i++){var c=_parseColor(s[i].css);r+=c[0];g+=c[1];b+=c[2];a+=c[3];}
    var n=s.length; return [r/n,g/n,b/n,a/n];
  };

  // ---- 游戏图片资源 ----
  var AM = M3.AssetManager;
  var handHits = [], hitBtns = [];
  var _bgTime = 0;

  // ================================================================
  // WebGL 初始化
  // ================================================================
  function _initGL (glCtx) {
    gl = glCtx;
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    var vsSrc = [
      'attribute vec2 a_pos;',
      'attribute vec2 a_uv;',
      'attribute vec4 a_color;',
      'uniform mat4 u_proj;',
      'varying vec2 v_uv;',
      'varying vec4 v_color;',
      'void main(){',
      '  gl_Position = u_proj * vec4(a_pos, 0.0, 1.0);',
      '  v_uv = a_uv; v_color = a_color;',
      '}',
    ].join('\n');
    var fsSrc = [
      'precision mediump float;',
      'varying vec2 v_uv; varying vec4 v_color;',
      'uniform sampler2D u_tex; uniform int u_useTexture;',
      'uniform int u_clipCircle;',  // 0=正常 1=圆形裁剪（图像）2=圆环描边（纯色）
      'uniform float u_feather;',   // 羽化宽度（UV 空间）
      'uniform float u_ringInner;', // 圆环内径（UV 空间，=1-lineW/r）
      'void main(){',
      '  vec4 color;',
      '  if(u_useTexture==1){ color = texture2D(u_tex, v_uv) * v_color; }',
      '  else { color = v_color; }',
      '  if(u_clipCircle==1){',
      '    float dist = length(v_uv - vec2(0.5));',
      '    float mask = 1.0 - smoothstep(0.5 - u_feather, 0.5, dist);',
      '    color.a *= mask;',
      '  } else if(u_clipCircle==2){',
      // 圆环：外边 smoothstep(0.5-feather, 0.5) + 内边 smoothstep(inner, inner+feather)
      '    float dist = length(v_uv - vec2(0.5));',
      '    float outer = 1.0 - smoothstep(0.5 - u_feather, 0.5, dist);',
      '    float inner = smoothstep(u_ringInner, u_ringInner + u_feather, dist);',
      '    color.a *= outer * inner;',
      '  }',
      '  gl_FragColor = color;',
      '}',
    ].join('\n');
    function mkShader(type, src) {
      var s = gl.createShader(type);
      gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) console.error('[render]', gl.getShaderInfoLog(s));
      return s;
    }
    _prog = gl.createProgram();
    gl.attachShader(_prog, mkShader(gl.VERTEX_SHADER, vsSrc));
    gl.attachShader(_prog, mkShader(gl.FRAGMENT_SHADER, fsSrc));
    gl.linkProgram(_prog);
    _loc.aPos    = gl.getAttribLocation(_prog,  'a_pos');
    _loc.aUV     = gl.getAttribLocation(_prog,  'a_uv');
    _loc.aColor  = gl.getAttribLocation(_prog,  'a_color');
    _loc.uProj   = gl.getUniformLocation(_prog, 'u_proj');
    _loc.uTex    = gl.getUniformLocation(_prog, 'u_tex');
    _loc.uUseTex = gl.getUniformLocation(_prog, 'u_useTexture');
    _loc.uClipCircle = gl.getUniformLocation(_prog, 'u_clipCircle');
    _loc.uFeather    = gl.getUniformLocation(_prog, 'u_feather');
    _loc.uRingInner  = gl.getUniformLocation(_prog, 'u_ringInner');

    _vboData = new Float32Array(VBO_MAX);
    _vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, _vbo);
    // VBO 大小取 BATCH_MAX 与 VBO_MAX 中的较大值，batch buffer 与 vboData 都能放下
    gl.bufferData(gl.ARRAY_BUFFER, Math.max(BATCH_MAX, VBO_MAX) * 4, gl.DYNAMIC_DRAW);

    _resetGlState();   // GL 对象刚重建，影子状态全部作废

    _updateProj();

    _txtCvs = _mkCanvas(4, 4);
    _txtCtx = _txtCvs.getContext('2d');
  }

  function _updateProj () {
    var w = _lw, h = _lh;
    _stProj = false;   // 矩阵已变，缓存作废
    _projMat[0]=2/w; _projMat[4]=0;    _projMat[8]=0;  _projMat[12]=-1;
    _projMat[1]=0;   _projMat[5]=-2/h; _projMat[9]=0;  _projMat[13]=1;
    _projMat[2]=0;   _projMat[6]=0;    _projMat[10]=1; _projMat[14]=0;
    _projMat[3]=0;   _projMat[7]=0;    _projMat[11]=0; _projMat[15]=1;
  }

  // ================================================================
  // 底层 draw call — 写入批量 buffer，切换纹理/模式时 flush
  // 每顶点 8 float：x,y, u,v, r,g,b,a
  // ================================================================
  function _drawVerts (verts, useTexture, tex) {
    if (!gl || !_prog || !verts.length) return;
    // 纹理/模式切换：先 flush 当前 batch
    if (_batchLen > 0 && (_batchUseTex !== !!useTexture || _batchTex !== (tex || null))) {
      _flushBatch();
    }
    _batchUseTex = !!useTexture;
    _batchTex    = tex || null;
    // buffer 溢出：先 flush 再写入
    if (_batchLen + verts.length > BATCH_MAX) {
      _flushBatch();
    }
    // 仍然超出（单次调用本身超大）：直接单帧提交
    if (verts.length > BATCH_MAX) {
      console.warn('[render] single draw too large:', verts.length);
      // 临时借用 _vboData 提交
      var tmp = verts.length <= VBO_MAX ? _vboData : new Float32Array(verts.length);
      tmp.set(verts);
      _bindPipeline();
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, tmp.subarray(0, verts.length));
      _setUseTex(useTexture);
      _setClip(0);
      if (useTexture && tex) _bindTex(tex);
      gl.drawArrays(gl.TRIANGLES, 0, verts.length / 8); _dc++;
      return;
    }
    _batchBuf.set(verts, _batchLen);
    _batchLen += verts.length;
  }

  // ================================================================
  // 颜色解析（带缓存：同一 CSS 字符串跨帧只解析一次）
  // ================================================================
  var _colorCache = {};
  function _parseColor (css) {
    if (!css || css === 'transparent') return [0,0,0,0];
    if (css instanceof _GradColor) return css._sample();
    var cached = _colorCache[css];
    if (cached) return cached;
    var result;
    var m = css.match(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)/);
    if (m) {
      result = [+m[1]/255, +m[2]/255, +m[3]/255, m[4]!==undefined ? +m[4] : 1];
    } else if (css[0]==='#') {
      var h=css.slice(1);
      if (h.length===3) h=h[0]+h[0]+h[1]+h[1]+h[2]+h[2];
      result = [parseInt(h.slice(0,2),16)/255, parseInt(h.slice(2,4),16)/255,
                parseInt(h.slice(4,6),16)/255, h.length>=8 ? parseInt(h.slice(6,8),16)/255 : 1];
    } else if (css==='black') {
      result = [0,0,0,1];
    } else if (css==='white') {
      result = [1,1,1,1];
    } else {
      result = [0,0,0,1];
    }
    _colorCache[css] = result;
    return result;
  }

  // ================================================================
  // 变换
  // ================================================================
  // _tp 仍保留（供路径 _fill/_stroke 循环用），但热路径改用内联
  function _tp (x, y) {
    var t=_tf; return [t[0]*x+t[1]*y+t[2], t[3]*x+t[4]*y+t[5]];
  }
  // 内联变换辅助（返回标量，避免临时数组）
  function _tpx (x, y) { var t=_tf; return t[0]*x+t[1]*y+t[2]; }
  function _tpy (x, y) { var t=_tf; return t[3]*x+t[4]*y+t[5]; }
  function _glSave () {
    _alphaStack.push(_alpha);
    _tfStack.push(_tf.slice());
  }
  function _glRestore () {
    if (_alphaStack.length) _alpha = _alphaStack.pop();
    if (_tfStack.length)    _tf    = _tfStack.pop();
  }
  function _glTranslate (tx, ty) {
    var t=_tf;
    _tf=[t[0],t[1],t[2]+t[0]*tx+t[1]*ty, t[3],t[4],t[5]+t[3]*tx+t[4]*ty, 0,0,1];
  }
  function _glScale (sx, sy) {
    var t=_tf;
    _tf=[t[0]*sx,t[1]*sy,t[2], t[3]*sx,t[4]*sy,t[5], 0,0,1];
  }
  function _glRotate (angle) {
    var co=Math.cos(angle), si=Math.sin(angle), t=_tf;
    _tf=[t[0]*co+t[1]*si, -t[0]*si+t[1]*co, t[2],
         t[3]*co+t[4]*si, -t[3]*si+t[4]*co, t[5], 0,0,1];
  }

  // ================================================================
  // 填充矩形（热路径：内联变换 + 直写 _batchBuf，零临时对象分配）
  // ================================================================
  function _fillRect (x, y, w, h, col) {
    if (!gl || !_prog) return;
    var c=_parseColor(col), a=c[3]*_alpha;
    var cr=c[0], cg=c[1], cb=c[2];
    // 纹理/模式切换
    if (_batchLen > 0 && (_batchUseTex || _batchTex !== null)) _flushBatch();
    _batchUseTex = false; _batchTex = null;
    if (_batchLen + 48 > BATCH_MAX) _flushBatch();
    var b=_batchBuf, i=_batchLen;
    // 直接内联变换 (恒等变换时 t0=t4=1, 其余=0，分支跳过加法)
    var t=_tf;
    var x0=t[0]*x    +t[1]*y    +t[2], y0=t[3]*x    +t[4]*y    +t[5];
    var x1=t[0]*(x+w)+t[1]*y    +t[2], y1=t[3]*(x+w)+t[4]*y    +t[5];
    var x2=t[0]*(x+w)+t[1]*(y+h)+t[2], y2=t[3]*(x+w)+t[4]*(y+h)+t[5];
    var x3=t[0]*x    +t[1]*(y+h)+t[2], y3=t[3]*x    +t[4]*(y+h)+t[5];
    // tri 1: p0 p1 p2
    b[i]=x0;b[i+1]=y0;b[i+2]=0;b[i+3]=0;b[i+4]=cr;b[i+5]=cg;b[i+6]=cb;b[i+7]=a;
    b[i+8]=x1;b[i+9]=y1;b[i+10]=1;b[i+11]=0;b[i+12]=cr;b[i+13]=cg;b[i+14]=cb;b[i+15]=a;
    b[i+16]=x2;b[i+17]=y2;b[i+18]=1;b[i+19]=1;b[i+20]=cr;b[i+21]=cg;b[i+22]=cb;b[i+23]=a;
    // tri 2: p0 p2 p3
    b[i+24]=x0;b[i+25]=y0;b[i+26]=0;b[i+27]=0;b[i+28]=cr;b[i+29]=cg;b[i+30]=cb;b[i+31]=a;
    b[i+32]=x2;b[i+33]=y2;b[i+34]=1;b[i+35]=1;b[i+36]=cr;b[i+37]=cg;b[i+38]=cb;b[i+39]=a;
    b[i+40]=x3;b[i+41]=y3;b[i+42]=0;b[i+43]=1;b[i+44]=cr;b[i+45]=cg;b[i+46]=cb;b[i+47]=a;
    _batchLen = i + 48;
  }

  // ================================================================
  // 路径 API
  // ================================================================
  function _beginPath () { _cmds = []; }
  function _moveTo (x, y) { _cmds.push({t:'M',x:x,y:y}); }
  function _lineTo (x, y) { _cmds.push({t:'L',x:x,y:y}); }
  function _arc (cx, cy, r, sa, ea, ccw) { _cmds.push({t:'A',cx:cx,cy:cy,r:r,sa:sa,ea:ea,ccw:!!ccw}); }
  function _arcTo (x1, y1, x2, y2, r)   { _cmds.push({t:'AT',x1:x1,y1:y1,x2:x2,y2:y2,r:r}); }
  function _closePath () { _cmds.push({t:'Z'}); }

  function _buildPts () {
    var pts=[], sx=0, sy=0;
    for (var i=0;i<_cmds.length;i++) {
      var cmd=_cmds[i];
      if      (cmd.t==='M')  { pts.push([cmd.x,cmd.y]); sx=cmd.x; sy=cmd.y; }
      else if (cmd.t==='L')  { pts.push([cmd.x,cmd.y]); }
      else if (cmd.t==='Z')  { pts.push([sx,sy]); }
      else if (cmd.t==='A') {
        var span=cmd.ea-cmd.sa;
        if (cmd.ccw&&span>0) span-=Math.PI*2;
        if (!cmd.ccw&&span<0) span+=Math.PI*2;
        var N=Math.max(8,Math.ceil(Math.abs(span)/(Math.PI/12)));
        for (var k=0;k<=N;k++) {
          var ang=cmd.sa+span*k/N;
          pts.push([cmd.cx+Math.cos(ang)*cmd.r, cmd.cy+Math.sin(ang)*cmd.r]);
        }
      } else if (cmd.t==='AT') {
        pts.push([cmd.x1,cmd.y1]); pts.push([cmd.x2,cmd.y2]);
      }
    }
    return pts;
  }

  function _fill (col) {
    var pts=_buildPts(); if (pts.length<3) return;
    var c=_parseColor(col), a=c[3]*_alpha;
    var cr=c[0],cg=c[1],cb=c[2];
    var need = (pts.length - 2) * 24;  // 每个三角形 3 顶点 × 8 float
    if (!gl || !_prog) return;
    if (_batchLen > 0 && (_batchUseTex || _batchTex !== null)) _flushBatch();
    _batchUseTex = false; _batchTex = null;
    if (_batchLen + need > BATCH_MAX) _flushBatch();
    if (need > BATCH_MAX) { /* 极端情况：降级走数组路径 */ var verts=[]; var p0t=_tp(pts[0][0],pts[0][1]); for (var ii=1;ii<pts.length-1;ii++){var pa=_tp(pts[ii][0],pts[ii][1]),pb=_tp(pts[ii+1][0],pts[ii+1][1]);verts.push(p0t[0],p0t[1],0,0,cr,cg,cb,a,pa[0],pa[1],0,0,cr,cg,cb,a,pb[0],pb[1],0,0,cr,cg,cb,a);} _drawVerts(verts,false); return; }
    var b=_batchBuf, bi=_batchLen;
    var p0x=_tpx(pts[0][0],pts[0][1]), p0y=_tpy(pts[0][0],pts[0][1]);
    for (var i=1; i<pts.length-1; i++) {
      var pax=_tpx(pts[i][0],pts[i][1]),   pay=_tpy(pts[i][0],pts[i][1]);
      var pbx=_tpx(pts[i+1][0],pts[i+1][1]), pby=_tpy(pts[i+1][0],pts[i+1][1]);
      b[bi]=p0x;b[bi+1]=p0y;b[bi+2]=0;b[bi+3]=0;b[bi+4]=cr;b[bi+5]=cg;b[bi+6]=cb;b[bi+7]=a;
      b[bi+8]=pax;b[bi+9]=pay;b[bi+10]=0;b[bi+11]=0;b[bi+12]=cr;b[bi+13]=cg;b[bi+14]=cb;b[bi+15]=a;
      b[bi+16]=pbx;b[bi+17]=pby;b[bi+18]=0;b[bi+19]=0;b[bi+20]=cr;b[bi+21]=cg;b[bi+22]=cb;b[bi+23]=a;
      bi += 24;
    }
    _batchLen = bi;
  }

  function _stroke (col, lw) {
    var pts=_buildPts(); if (pts.length<2) return;
    var c=_parseColor(col), a=c[3]*_alpha, hw=(lw||1)/2;
    var cr=c[0],cg=c[1],cb=c[2];
    var need = (pts.length - 1) * 48; // 每段 2 个三角形 × 3 顶点 × 8 float
    if (!gl || !_prog) return;
    if (_batchLen > 0 && (_batchUseTex || _batchTex !== null)) _flushBatch();
    _batchUseTex = false; _batchTex = null;
    if (_batchLen + need > BATCH_MAX) _flushBatch();
    if (need > BATCH_MAX) { var verts2=[]; for (var ii=0;ii<pts.length-1;ii++){var ax=pts[ii][0],ay=pts[ii][1],bx2=pts[ii+1][0],by2=pts[ii+1][1];var ddx=bx2-ax,ddy=by2-ay,ll=Math.sqrt(ddx*ddx+ddy*ddy);if(ll<0.001)continue;var nx2=-ddy/ll*hw,ny2=ddx/ll*hw;var pa=_tp(ax+nx2,ay+ny2),pb=_tp(ax-nx2,ay-ny2),pc=_tp(bx2+nx2,by2+ny2),pd=_tp(bx2-nx2,by2-ny2);verts2.push(pa[0],pa[1],0,0,cr,cg,cb,a,pb[0],pb[1],0,0,cr,cg,cb,a,pc[0],pc[1],0,0,cr,cg,cb,a,pb[0],pb[1],0,0,cr,cg,cb,a,pd[0],pd[1],0,0,cr,cg,cb,a,pc[0],pc[1],0,0,cr,cg,cb,a);} _drawVerts(verts2,false); return; }
    var b=_batchBuf, bi=_batchLen;
    for (var i=0; i<pts.length-1; i++) {
      var ax=pts[i][0],ay=pts[i][1],bx=pts[i+1][0],by=pts[i+1][1];
      var dx=bx-ax,dy=by-ay,len=Math.sqrt(dx*dx+dy*dy);
      if (len<0.001) continue;
      var nx=-dy/len*hw, ny=dx/len*hw;
      var pax=_tpx(ax+nx,ay+ny),pay=_tpy(ax+nx,ay+ny);
      var pbx=_tpx(ax-nx,ay-ny),pby=_tpy(ax-nx,ay-ny);
      var pcx=_tpx(bx+nx,by+ny),pcy=_tpy(bx+nx,by+ny);
      var pdx=_tpx(bx-nx,by-ny),pdy=_tpy(bx-nx,by-ny);
      // tri1: pa pb pc
      b[bi]=pax;b[bi+1]=pay;b[bi+2]=0;b[bi+3]=0;b[bi+4]=cr;b[bi+5]=cg;b[bi+6]=cb;b[bi+7]=a;
      b[bi+8]=pbx;b[bi+9]=pby;b[bi+10]=0;b[bi+11]=0;b[bi+12]=cr;b[bi+13]=cg;b[bi+14]=cb;b[bi+15]=a;
      b[bi+16]=pcx;b[bi+17]=pcy;b[bi+18]=0;b[bi+19]=0;b[bi+20]=cr;b[bi+21]=cg;b[bi+22]=cb;b[bi+23]=a;
      // tri2: pb pd pc
      b[bi+24]=pbx;b[bi+25]=pby;b[bi+26]=0;b[bi+27]=0;b[bi+28]=cr;b[bi+29]=cg;b[bi+30]=cb;b[bi+31]=a;
      b[bi+32]=pdx;b[bi+33]=pdy;b[bi+34]=0;b[bi+35]=0;b[bi+36]=cr;b[bi+37]=cg;b[bi+38]=cb;b[bi+39]=a;
      b[bi+40]=pcx;b[bi+41]=pcy;b[bi+42]=0;b[bi+43]=0;b[bi+44]=cr;b[bi+45]=cg;b[bi+46]=cb;b[bi+47]=a;
      bi += 48;
    }
    _batchLen = bi;
  }

  // ================================================================
  // 纹理 / drawImage
  // ================================================================
  function _mkCanvas (w, h) {
    var c;
    if (typeof wx!=='undefined'&&wx.createCanvas) c=wx.createCanvas();
    else if (typeof ks!=='undefined'&&ks.createCanvas) c=ks.createCanvas();
    else c=document.createElement('canvas');
    c.width=w; c.height=h; return c;
  }

  function _mkTex (src) {
    var tex=gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D,tex); _stTex = tex;   // 同步影子状态，避免后续 _bindTex 误判已绑定
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
    // 双重守卫：src 必须是已加载完的图片或 canvas，否则上传 1×1 透明占位纹理
    var valid = src && (src.getContext ||
      (src.tagName === 'IMG' && src.complete && (src.naturalWidth || src.width) > 0) ||
      (!src.tagName && (src.width || 0) > 0));
    if (valid) {
      try { gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,src); }
      catch(e){ gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,1,1,0,gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array([0,0,0,0])); }
    } else {
      gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,1,1,0,gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array([0,0,0,0]));
    }
    return tex;
  }

  function _getTex (src) {
    if (!src) return null;
    // HTMLImageElement 未加载完时 naturalWidth=0，直接传给 texImage2D 会触发
    // "INVALID_VALUE: texImage2D: invalid image" 控制台报错。此处提前拦截。
    if (src.tagName === 'IMG' && !(src.complete && (src.naturalWidth || src.width) > 0)) return null;
    if (_imgTexMap) {
      var t=_imgTexMap.get(src);
      if (t) return t;
      var nt=_mkTex(src); _imgTexMap.set(src,nt); return nt;
    }
    for (var i=0;i<_imgTexArr.length;i++) if (_imgTexArr[i].src===src) return _imgTexArr[i].tex;
    var nt2=_mkTex(src); _imgTexArr.push({src:src,tex:nt2}); return nt2;
  }

  function _updateCanvasTex (src, tex) {
    // 静态 canvas（牌面 sprite、背景渐变等烘焙后不变）：纹理只上传一次。
    // 重绘静态 canvas 时需把 _texUploaded 置回 false 触发重新上传。
    if (src._texStatic && src._texUploaded) return;
    gl.bindTexture(gl.TEXTURE_2D,tex); _stTex = tex;
    try { gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,src); } catch(e){}
    if (src._texStatic) src._texUploaded = true;
  }

  // glDrawImage(src, dx, dy [, dw, dh]) or (src, sx, sy, sw, sh, dx, dy, dw, dh)
  function glDrawImage (src, a1, a2, a3, a4, a5, a6, a7, a8) {
    if (!src || !gl || !_prog) return;
    var tex=_getTex(src);
    if (!tex) return;
    if (src.getContext) _updateCanvasTex(src, tex);

    var imgW=src.width||src.naturalWidth||_lw;
    var imgH=src.height||src.naturalHeight||_lh;
    var dx,dy,dw,dh,u0,v0,u1,v1;
    if (arguments.length===3) {
      u0=0;v0=0;u1=1;v1=1; dx=a1;dy=a2;dw=imgW;dh=imgH;
    } else if (arguments.length===5) {
      u0=0;v0=0;u1=1;v1=1; dx=a1;dy=a2;dw=a3;dh=a4;
    } else {
      u0=a1/imgW;v0=a2/imgH;u1=(a1+a3)/imgW;v1=(a2+a4)/imgH;
      dx=a5;dy=a6;dw=a7;dh=a8;
    }

    // 纹理切换：直接与当前 batch 比较
    if (_batchLen > 0 && (!_batchUseTex || _batchTex !== tex)) _flushBatch();
    _batchUseTex = true; _batchTex = tex;
    if (_batchLen + 48 > BATCH_MAX) _flushBatch();

    var a=_alpha;
    var t=_tf;
    var x0=t[0]*dx      +t[1]*dy      +t[2], y0=t[3]*dx      +t[4]*dy      +t[5];
    var x1=t[0]*(dx+dw) +t[1]*dy      +t[2], y1=t[3]*(dx+dw) +t[4]*dy      +t[5];
    var x2=t[0]*(dx+dw) +t[1]*(dy+dh) +t[2], y2=t[3]*(dx+dw) +t[4]*(dy+dh) +t[5];
    var x3=t[0]*dx      +t[1]*(dy+dh) +t[2], y3=t[3]*dx      +t[4]*(dy+dh) +t[5];
    var b=_batchBuf, i=_batchLen;
    b[i]=x0;b[i+1]=y0;b[i+2]=u0;b[i+3]=v0;b[i+4]=1;b[i+5]=1;b[i+6]=1;b[i+7]=a;
    b[i+8]=x1;b[i+9]=y1;b[i+10]=u1;b[i+11]=v0;b[i+12]=1;b[i+13]=1;b[i+14]=1;b[i+15]=a;
    b[i+16]=x2;b[i+17]=y2;b[i+18]=u1;b[i+19]=v1;b[i+20]=1;b[i+21]=1;b[i+22]=1;b[i+23]=a;
    b[i+24]=x0;b[i+25]=y0;b[i+26]=u0;b[i+27]=v0;b[i+28]=1;b[i+29]=1;b[i+30]=1;b[i+31]=a;
    b[i+32]=x2;b[i+33]=y2;b[i+34]=u1;b[i+35]=v1;b[i+36]=1;b[i+37]=1;b[i+38]=1;b[i+39]=a;
    b[i+40]=x3;b[i+41]=y3;b[i+42]=u0;b[i+43]=v1;b[i+44]=1;b[i+45]=1;b[i+46]=1;b[i+47]=a;
    _batchLen = i + 48;
  }

  // 圆形裁剪绘图：复用主 shader 的 u_clipCircle + smoothstep 羽化，无第二个 program
  // src: 图片/canvas；cx,cy: 圆心；r: 半径；featherPx: 羽化宽度（逻辑像素，默认 1.5）
  function glDrawImageCircle (src, cx, cy, r, featherPx) {
    if (!src || !gl) return;
    var tex = _getTex(src);
    if (!tex) return;
    if (src.getContext) _updateCanvasTex(src, tex);

    var fp = (featherPx == null ? 1.5 : featherPx);
    var diam = r * 2;
    var featherUV = fp / diam;   // UV 空间羽化宽度

    var x = cx - r, y = cy - r, w = diam, h = diam;
    var u0=0, v0=0, u1=1, v1=1;
    var a = _alpha;
    var p0=_tp(x,y), p1=_tp(x+w,y), p2=_tp(x+w,y+h), p3=_tp(x,y+h);
    var verts = [
      p0[0],p0[1], u0,v0, 1,1,1,a,
      p1[0],p1[1], u1,v0, 1,1,1,a,
      p2[0],p2[1], u1,v1, 1,1,1,a,
      p0[0],p0[1], u0,v0, 1,1,1,a,
      p2[0],p2[1], u1,v1, 1,1,1,a,
      p3[0],p3[1], u0,v1, 1,1,1,a,
    ];

    // 先把主 program 积压的顶点 flush（避免混批）
    // 然后单独提交这批顶点，开启圆形裁剪 uniform，绘制后 flush 使后续批次重新开始
    _flushBatch();
    if (verts.length > VBO_MAX) return;
    _bindPipeline();
    _vboData.set(verts);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, _vboData.subarray(0, verts.length));
    _setUseTex(1);
    _setClip(1);                               // 开启圆形裁剪
    _setFeather(featherUV);
    _bindTex(tex);
    gl.drawArrays(gl.TRIANGLES, 0, 6); _dc++;
    _batchLen = 0; _batchTex = null;           // 使后续批次重新开始积累
  }

  // 圆环描边（shader smoothstep 抗锯齿，替代 arc+stroke）
  // cx,cy: 圆心；r: 外半径；lineW: 描边宽度（逻辑像素）；color: CSS 颜色
  function glDrawCircleStroke (cx, cy, r, lineW, color) {
    if (!gl) return;
    // 画一个正方形 quad（边长 2*(r+feather)），让 shader 自己裁圆环
    var featherPx = 1.0;
    var pad = featherPx;
    var size = r + pad;   // quad 半边长（逻辑像素），比 r 略大确保羽化区域包含在内
    var x = cx - size, y = cy - size, w = size*2, h = size*2;

    // UV(0~1) → UV 空间内，r 对应 0.5*(size*2 - 2*pad)/(size*2) ... 暂不精确映射
    // 直接在 UV 空间里换算：圆心在 (0.5,0.5)，r 对应 UV=0.5*(1 - pad/size)
    // 外径 UV: outerR = r / (size*2)  = 0.5 * r/size
    // 内径 UV: innerR = (r - lineW) / (size*2)
    // feather UV: featherPx / (size*2)
    var outerR  = 0.5 * r / size;
    var innerR  = 0.5 * Math.max(0, r - lineW) / size;
    var featherUV = featherPx / (size * 2);

    var col = _parseColor(color);
    var a = col[3] * _alpha;
    var p0=_tp(x,y), p1=_tp(x+w,y), p2=_tp(x+w,y+h), p3=_tp(x,y+h);
    var verts = [
      p0[0],p0[1], 0,0, col[0],col[1],col[2],a,
      p1[0],p1[1], 1,0, col[0],col[1],col[2],a,
      p2[0],p2[1], 1,1, col[0],col[1],col[2],a,
      p0[0],p0[1], 0,0, col[0],col[1],col[2],a,
      p2[0],p2[1], 1,1, col[0],col[1],col[2],a,
      p3[0],p3[1], 0,1, col[0],col[1],col[2],a,
    ];

    _flushBatch();
    _bindPipeline();
    _vboData.set(verts);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, _vboData.subarray(0, verts.length));
    _setUseTex(0);                           // 纯色模式（颜色从 v_color 来）
    _setClip(2);                             // 圆环模式
    _setFeather(featherUV);
    _setRingInner(innerR);
    gl.drawArrays(gl.TRIANGLES, 0, 6); _dc++;
    _batchLen = 0; _batchTex = null;
  }

  // 9 宫格拉伸：四角不变形，边与中心拉伸。
  // sliceX/sliceY 为设计稿逻辑切片边距；designW/designH 为切图设计逻辑尺寸
  // （源图 3x 导出时按 iw/designW 自动换算物理切片）。
  // 目标高/宽不足以放下四角时自动收缩切片，保证任意尺寸不越界。
  function glDrawImage9 (src, x, y, w, h, sliceX, sliceY, designW, designH) {
    if (!src) return;
    var iw = src.width || src.naturalWidth || 0;
    var ih = src.height || src.naturalHeight || 0;
    if (!iw || !ih || w <= 0 || h <= 0 || !designW || !designH) return;
    var kx = iw / designW, ky = ih / designH;
    var pl = sliceX * kx, pt = sliceY * ky, pr = pl, pb = pt;
    var dl = sliceX, dt = sliceY, dr = sliceX, db = sliceY;
    if (dl + dr > w) { dl = w / 2; dr = w / 2; }
    if (dt + db > h) { dt = h / 2; db = h / 2; }
    var cw = iw - pl - pr, ch = ih - pt - pb;
    function seg (sx, sy, sw, sh, dx, dy, dw, dh) {
      if (sw <= 0 || sh <= 0 || dw <= 0.01 || dh <= 0.01) return;
      glDrawImage(src, sx, sy, sw, sh, dx, dy, dw, dh);
    }
    // 上行（左角/中/右角）
    seg(0, 0, pl, pt, x, y, dl, dt);
    seg(pl, 0, cw, pt, x + dl, y, w - dl - dr, dt);
    seg(iw - pr, 0, pr, pt, x + w - dr, y, dr, dt);
    // 中行
    seg(0, pt, pl, ch, x, y + dt, dl, h - dt - db);
    seg(pl, pt, cw, ch, x + dl, y + dt, w - dl - dr, h - dt - db);
    seg(iw - pr, pt, pr, ch, x + w - dr, y + dt, dr, h - dt - db);
    // 下行
    seg(0, ih - pb, pl, pb, x, y + h - db, dl, db);
    seg(pl, ih - pb, cw, pb, x + dl, y + h - db, w - dl - dr, db);
    seg(iw - pr, ih - pb, pr, pb, x + w - dr, y + h - db, dr, db);
  }

  // ================================================================
  // 文字渲染
  // ================================================================
  function glMeasureText (text, font) {
    _txtCtx.font = font || '400 16px sans-serif';
    return _txtCtx.measureText(String(text)).width;
  }

  // 文字纹理烘焙的设备像素密度：按屏幕 DPR 放大烘焙，避免高清屏下纹理被 GPU 上采样导致发糊
  var _txtDPR = 0;
  function _textDPR () {
    if (_txtDPR) return _txtDPR;
    var d = (M3.renderDpr ? M3.renderDpr()
           : ((typeof window !== 'undefined' && window.devicePixelRatio) ? window.devicePixelRatio : 1));
    if (d < 1) d = 1;   // 上限交给 M3.renderDpr（H5 钳 2，小游戏用平台原始 dpr），此处必须与 backing store 同 DPR

    _txtDPR = d;
    return d;
  }

  function glFillText (text, x, y, font, fillColor, textAlign, textBaseline) {
    _glFillTextImpl(text, x, y, font, fillColor, null, 0, textAlign, textBaseline);
  }

  // 带描边文字：描边+本体一次性烘焙进同一张纹理（运行期 1 次绘制），
  // 替代「8 方向偏移多次 glFillText」的逐帧多次顶点提交（性能优化点）。
  function glFillTextStroke (text, x, y, font, fillColor, strokeColor, strokeW, textAlign, textBaseline) {
    _glFillTextImpl(text, x, y, font, fillColor, strokeColor, strokeW || 2.5, textAlign, textBaseline);
  }

  function _glFillTextImpl (text, x, y, font, fillColor, strokeColor, strokeW, textAlign, textBaseline) {
    text = String(text==null?'':text); if (!text) return;
    var dpr = _textDPR();
    var key = font+'|'+(fillColor instanceof _GradColor?'#fff':fillColor)+'|'
            +(strokeColor||'')+'|'+(strokeW||0)+'|'+text+'|@'+dpr;
    var entry = _txtTexCache[key];
    if (!entry) {
      _txtCtx.font = font;
      // 逻辑尺寸（用于布局 / 对齐 / 绘制 quad 大小）
      var tw=Math.ceil(_txtCtx.measureText(text).width)+4;
      var _fsm=font.match(/(\d+(?:\.\d+)?)px/); var fsize=_fsm?parseFloat(_fsm[1]):16;
      // 纹理高度：留足够空间容纳上行部（ascender）+ 下行部（descender）
      var th=Math.ceil(fsize*1.5)+4;
      // 文字视觉中心固定在纹理正中央（textBaseline='middle' 绘制）：
      // 不依赖 actualBoundingBoxAscent/Descent，跨平台（Chrome/安卓/iOS）完全一致。
      var toff = Math.ceil(th / 2);
      // 描边外扩：纹理需容纳 strokeW 偏移
      var ext = strokeColor ? Math.ceil(strokeW*0.4)+2 : 0;
      tw += ext*2; th += ext*2; toff += ext;
      // 设备像素尺寸（实际烘焙分辨率）
      var dw = Math.ceil(tw * dpr), dh = Math.ceil(th * dpr);
      if (_txtCvs.width<dw)  { _txtCvs.width=dw;  _txtCtx=_txtCvs.getContext('2d'); }
      if (_txtCvs.height<dh) { _txtCvs.height=dh; _txtCtx=_txtCvs.getContext('2d'); }
      _txtCtx.setTransform(dpr,0,0,dpr,0,0);   // 以 dpr 缩放绘制，字体按逻辑尺寸但栅格化在高分画布上
      _txtCtx.clearRect(0,0,_txtCvs.width/dpr,_txtCvs.height/dpr);
      _txtCtx.font=font;
      _txtCtx.textAlign='left'; _txtCtx.textBaseline='middle';
      // 绘制 y：纹理垂直中心（视觉中心锚点），与 toff 保持一致
      var tpx=2+ext, tpy=toff;
      if (strokeColor) {
        // 8 方向偏移描边：烘焙期一次完成，运行期整体一个 quad
        var sw=strokeW*0.4;
        var offs=[[-1,-1],[1,-1],[-1,1],[1,1],[0,-1],[0,1],[-1,0],[1,0]];
        _txtCtx.fillStyle=strokeColor;
        for (var oi=0;oi<offs.length;oi++) _txtCtx.fillText(text, tpx+offs[oi][0]*sw, tpy+offs[oi][1]*sw);
      }
      _txtCtx.fillStyle=(fillColor instanceof _GradColor)?'#ffffff':fillColor;
      _txtCtx.fillText(text,tpx,tpy);
      _txtCtx.setTransform(1,0,0,1,0,0);       // 还原变换，避免影响 measureText
      var tex=gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D,tex); _stTex = tex;
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
      try { gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,_txtCvs); } catch(e){}
      // tw/th 保存逻辑尺寸；uv 用设备像素尺寸 dw/dh 与画布物理尺寸 cw/ch 之比
      entry={tex:tex,tw:tw,th:th,cw:_txtCvs.width,ch:_txtCvs.height,toff:toff,dw:dw,dh:dh};
      _txtTexCache[key]=entry;
    }
    var ox=x, oy=y;
    if      (textAlign==='center') ox=x-entry.tw/2;
    else if (textAlign==='right')  ox=x-entry.tw;
    // 使用 toff 计算正确的垂直对齐，避免因 th 包含过多 padding 导致文字偏上
    if      (textBaseline==='middle')     oy=y-entry.toff;
    else if (textBaseline==='bottom')     oy=y-entry.th+2;
    else if (textBaseline==='alphabetic') oy=y-entry.toff-Math.round((entry.toff-2)*0.15);
    var u1=entry.dw/entry.cw, v1=entry.dh/entry.ch, a=_alpha;
    var p0=_tp(ox,oy),p1=_tp(ox+entry.tw,oy),p2=_tp(ox+entry.tw,oy+entry.th),p3=_tp(ox,oy+entry.th);
    _drawVerts([
      p0[0],p0[1],0,0, 1,1,1,a,
      p1[0],p1[1],u1,0,1,1,1,a,
      p2[0],p2[1],u1,v1,1,1,1,a,
      p0[0],p0[1],0,0, 1,1,1,a,
      p2[0],p2[1],u1,v1,1,1,1,a,
      p3[0],p3[1],0,v1,1,1,1,a,
    ], true, entry.tex);
  }

  // ================================================================
  // 高阶绘制原语（直接对应原 2D ctx 调用）
  // ================================================================

  // 圆角矩形路径 — 用真正的 arc 命令生成圆角弧，而非 arcTo（arcTo 在 _buildPts 中不生成弧点）
  function rrect (x, y, w, h, r) {
    if (r < 0) r = 0;
    if (r > w / 2) r = w / 2;
    if (r > h / 2) r = h / 2;
    _beginPath();
    // 顶边
    _moveTo(x + r, y);
    _lineTo(x + w - r, y);
    // 右上角弧
    _arc(x + w - r, y + r, r, -Math.PI/2, 0, false);
    // 右边
    _lineTo(x + w, y + h - r);
    // 右下角弧
    _arc(x + w - r, y + h - r, r, 0, Math.PI/2, false);
    // 底边
    _lineTo(x + r, y + h);
    // 左下角弧
    _arc(x + r, y + h - r, r, Math.PI/2, Math.PI, false);
    // 左边
    _lineTo(x, y + r);
    // 左上角弧
    _arc(x + r, y + r, r, Math.PI, Math.PI*1.5, false);
    _closePath();
  }

  function fillRounded (x, y, w, h, r, color) {
    rrect(x, y, w, h, r);
    _fill(color);
  }

  function strokeRounded (x, y, w, h, r, color, lw) {
    rrect(x, y, w, h, r);
    _stroke(color, lw || 2);
  }

  // 圆角矩形线性渐变填充（顶色→底色，顶点着色实现真正渐变）
  function fillRoundedGrad (x, y, w, h, r, colorTop, colorBottom) {
    if (r < 0) r = 0;
    if (r > w / 2) r = w / 2;
    if (r > h / 2) r = h / 2;
    var ct = _parseColor(colorTop),   at = ct[3] * _alpha;
    var cb = _parseColor(colorBottom), ab = cb[3] * _alpha;
    // 生成圆角路径点（与 rrect 相同逻辑）
    _beginPath();
    _moveTo(x + r, y);
    _lineTo(x + w - r, y);
    _arc(x + w - r, y + r, r, -Math.PI/2, 0, false);
    _lineTo(x + w, y + h - r);
    _arc(x + w - r, y + h - r, r, 0, Math.PI/2, false);
    _lineTo(x + r, y + h);
    _arc(x + r, y + h - r, r, Math.PI/2, Math.PI, false);
    _lineTo(x, y + r);
    _arc(x + r, y + r, r, Math.PI, Math.PI*1.5, false);
    _closePath();
    // 用顶点着色填充渐变（每个顶点根据 Y 位置插值颜色）
    var pts = _buildPts();
    if (pts.length < 3) return;
    var need = (pts.length - 2) * 24;
    if (!gl || !_prog) return;
    if (_batchLen > 0 && (_batchUseTex || _batchTex !== null)) _flushBatch();
    _batchUseTex = false; _batchTex = null;
    if (_batchLen + need > BATCH_MAX) _flushBatch();
    if (need > BATCH_MAX) {
      // 极端情况降级
      var verts = [], p0f = _tp(pts[0][0], pts[0][1]);
      var tc0f = _gradColorAtY(pts[0][1], y, h, ct, at, cb, ab);
      for (var ii = 1; ii < pts.length - 1; ii++) {
        var paf = _tp(pts[ii][0], pts[ii][1]), pbf = _tp(pts[ii+1][0], pts[ii+1][1]);
        var caf = _gradColorAtY(pts[ii][1], y, h, ct, at, cb, ab);
        var cbf = _gradColorAtY(pts[ii+1][1], y, h, ct, at, cb, ab);
        verts.push(p0f[0],p0f[1],0,0,tc0f[0],tc0f[1],tc0f[2],tc0f[3],
                   paf[0],paf[1],0,0,caf[0],caf[1],caf[2],caf[3],
                   pbf[0],pbf[1],0,0,cbf[0],cbf[1],cbf[2],cbf[3]);
      }
      _drawVerts(verts, false); return;
    }
    var bbb=_batchBuf, bi=_batchLen;
    var p0x=_tpx(pts[0][0],pts[0][1]), p0y=_tpy(pts[0][0],pts[0][1]);
    var tc0 = _gradColorAtY(pts[0][1], y, h, ct, at, cb, ab);
    for (var i = 1; i < pts.length - 1; i++) {
      var pax=_tpx(pts[i][0],pts[i][1]),   pay=_tpy(pts[i][0],pts[i][1]);
      var pbx=_tpx(pts[i+1][0],pts[i+1][1]), pby=_tpy(pts[i+1][0],pts[i+1][1]);
      var ca = _gradColorAtY(pts[i][1], y, h, ct, at, cb, ab);
      var cb2 = _gradColorAtY(pts[i+1][1], y, h, ct, at, cb, ab);
      bbb[bi]=p0x;bbb[bi+1]=p0y;bbb[bi+2]=0;bbb[bi+3]=0;bbb[bi+4]=tc0[0];bbb[bi+5]=tc0[1];bbb[bi+6]=tc0[2];bbb[bi+7]=tc0[3];
      bbb[bi+8]=pax;bbb[bi+9]=pay;bbb[bi+10]=0;bbb[bi+11]=0;bbb[bi+12]=ca[0];bbb[bi+13]=ca[1];bbb[bi+14]=ca[2];bbb[bi+15]=ca[3];
      bbb[bi+16]=pbx;bbb[bi+17]=pby;bbb[bi+18]=0;bbb[bi+19]=0;bbb[bi+20]=cb2[0];bbb[bi+21]=cb2[1];bbb[bi+22]=cb2[2];bbb[bi+23]=cb2[3];
      bi += 24;
    }
    _batchLen = bi;
  }
  function _gradColorAtY (py, y, h, ct, at, cb, ab) {
    var t = h > 0 ? Math.max(0, Math.min(1, (py - y) / h)) : 0;
    return [ct[0]*(1-t)+cb[0]*t, ct[1]*(1-t)+cb[1]*t, ct[2]*(1-t)+cb[2]*t, at*(1-t)+ab*t];
  }

  // 渐变填充（旧接口，取中间色近似）
  function gradientFill (x, y, w, h, c1, c2) {
    fillRoundedGrad(x, y, w, h, 6, c1, c2);
  }

  // 横向多色标线性渐变填充（顶点着色实现真正平滑渐变，无色块）
  // stops: [{t:0..1, css:'rgba/hex'}...]（按 t 升序）
  function fillRectGradH (x, y, w, h, stops) {
    if (!stops || stops.length < 2) return;
    var verts = [];
    for (var i = 0; i < stops.length - 1; i++) {
      var s0 = stops[i], s1 = stops[i + 1];
      var x0 = x + w * s0.t, x1 = x + w * s1.t;
      var c0 = _parseColor(s0.css), a0 = c0[3] * _alpha;
      var c1 = _parseColor(s1.css), a1 = c1[3] * _alpha;
      var p0 = _tp(x0, y),   p1 = _tp(x1, y);
      var p2 = _tp(x1, y+h), p3 = _tp(x0, y+h);
      verts.push(
        p0[0],p0[1],0,0, c0[0],c0[1],c0[2],a0,
        p1[0],p1[1],0,0, c1[0],c1[1],c1[2],a1,
        p2[0],p2[1],0,0, c1[0],c1[1],c1[2],a1,
        p0[0],p0[1],0,0, c0[0],c0[1],c0[2],a0,
        p2[0],p2[1],0,0, c1[0],c1[1],c1[2],a1,
        p3[0],p3[1],0,0, c0[0],c0[1],c0[2],a0
      );
    }
    _drawVerts(verts, false);
  }

  // 面板（带投影阴影近似：画一个深色偏移矩形模拟）
  function panel (x, y, w, h, strokeColor, bg) {
    // 阴影近似：先画半透明深色偏移块
    _glSave();
    _alpha *= 0.35;
    fillRounded(x+2, y+2, w, h, 10, '#000000');
    _glRestore();
    fillRounded(x, y, w, h, 10, bg || C.panel);
    strokeRounded(x, y, w, h, 10, strokeColor || C.panelBorder);
  }

  function txt (x, y, text, size, color, weight, align) {
    var font = (weight || 400) + ' ' + size + 'px sans-serif';
    glFillText(String(text), x, y, font, color, align || 'left', 'top');
  }

  function ctext (x, y, text, size, color, weight) {
    txt(x, y, text, size, color, weight || (size >= 24 ? 700 : 400), 'center');
  }

  function hit (r, x, y) { return x>=r.x && x<=r.x+r.w && y>=r.y && y<=r.y+r.h; }

  // ================================================================
  // 按钮
  // ================================================================
  function btn (x, y, w, h, label, onClick, disabled, primary) {
    _glSave();
    var sz = Math.min(17, Math.floor(h * 0.36));
    if (disabled) {
      gradientFill(x, y, w, h, '#334155', '#1e293b');
      strokeRounded(x, y, w, h, 8, '#475569');
      glFillText(String(label), x+w/2, y+h/2, '600 '+sz+'px sans-serif', '#64748b', 'center', 'middle');
    } else {
      var _pr = M3.Render.beginPressScale(label || 'btn', x + w / 2, y + h / 2);
      if (primary) {
        gradientFill(x, y, w, h, C.goldL, C.gold);
        strokeRounded(x, y, w, h, 8, 'rgba(180,83,9,.4)');
        glFillText(String(label), x+w/2, y+h/2, '700 '+sz+'px sans-serif', '#1f2937', 'center', 'middle');
      } else {
        gradientFill(x, y, w, h, C.btnGreen, C.btnGreenL);
        strokeRounded(x, y, w, h, 8, 'rgba(0,0,0,.2)');
        glFillText(String(label), x+w/2, y+h/2, '600 '+sz+'px sans-serif', C.textWhite, 'center', 'middle');
      }
      M3.Render.endPressScale(_pr);
      hitBtns.push({ x:x, y:y, w:w, h:h, onClick:onClick, label:label||'btn' });
    }
    _glRestore();
  }

  // ================================================================
  // 牌绘制
  // ================================================================
  function drawCardBack (x, y, w, h, lbl) {
    var cbImg = AM.get('cardBack');
    if (cbImg) {
      glDrawImage(cbImg, x, y, w, h);
    } else {
      fillRounded(x, y, w, h, 5, '#1a4a8a');
      _beginPath();
      rrect(x+3, y+3, w-6, h-6, 3);
      _stroke('rgba(255,255,255,.2)', 1);
    }
    if (lbl) ctext(x+w/2, y+h/2, lbl, Math.min(18, Math.floor(w*0.45)), C.textWhite, 700);
  }



  // ================================================================
  // 扑克图集帧坐标表（TexturePacker Cocos2d 导出，54张全齐）
  // key = card.id，值 = [sx, sy, sw, sh]（图集物理像素）
  // ================================================================
  var _ATLAS_FRAMES = {
    'clubs-10':[202,584,200,290],    'clubs-11':[606,584,200,290],    'clubs-12':[808,584,200,290],    'clubs-13':[202,1460,200,290],
    'clubs-14':[404,584,200,290],    'clubs-15':[606,292,200,290],    'clubs-3':[808,292,200,290],    'clubs-4':[1010,292,200,290],
    'clubs-5':[1212,292,200,290],    'clubs-6':[1414,292,200,290],    'clubs-7':[1616,292,200,290],    'clubs-8':[1818,292,200,290],
    'clubs-9':[0,584,200,290],    'diamonds-10':[808,876,200,290],    'diamonds-11':[1010,876,200,290],    'diamonds-12':[1414,876,200,290],
    'diamonds-13':[1212,876,200,290],    'diamonds-14':[404,1460,200,290],    'diamonds-15':[1212,584,200,290],    'diamonds-3':[1414,584,200,290],
    'diamonds-4':[1616,584,200,290],    'diamonds-5':[1818,584,200,290],    'diamonds-6':[0,876,200,290],    'diamonds-7':[202,876,200,290],
    'diamonds-8':[404,876,200,290],    'diamonds-9':[606,876,200,290],    'hearts-10':[1212,1168,200,290],    'hearts-11':[1414,1168,200,290],
    'hearts-12':[1818,1168,200,290],    'hearts-13':[1616,1168,200,290],    'hearts-14':[606,1460,200,290],    'hearts-15':[1616,876,200,290],
    'hearts-3':[1818,876,200,290],    'hearts-4':[0,1168,200,290],    'hearts-5':[202,1168,200,290],    'hearts-6':[404,1168,200,290],
    'hearts-7':[606,1168,200,290],    'hearts-8':[808,1168,200,290],    'hearts-9':[1010,1168,200,290],    'joker-16':[1010,584,200,290],
    'joker-17':[0,0,200,290],    'spades-10':[1818,0,200,290],    'spades-11':[202,292,200,290],    'spades-12':[404,292,200,290],
    'spades-13':[0,1460,200,290],    'spades-14':[0,292,200,290],    'spades-15':[202,0,200,290],    'spades-3':[404,0,200,290],
    'spades-4':[606,0,200,290],    'spades-5':[808,0,200,290],    'spades-6':[1010,0,200,290],    'spades-7':[1212,0,200,290],
    'spades-8':[1414,0,200,290],    'spades-9':[1616,0,200,290],
  };

  function _drawCardFromAtlas (src, card, dx, dy, dw, dh) {
    var f = _ATLAS_FRAMES[card.id];
    if (!f) return false;
    glDrawImage(src, f[0], f[1], f[2], f[3], dx, dy, dw, dh);
    return true;
  }

  function _bakeCardFromAtlas2D (c2d, src, card, dx, dy, dw, dh) {
    var f = _ATLAS_FRAMES[card.id];
    if (!f) return false;
    c2d.drawImage(src, f[0], f[1], f[2], f[3], dx, dy, dw, dh);
    return true;
  }

  var _atlasDbgLogged = false;
  function drawCard (x, y, card, w, h, selected) {
    var atlasImg = AM.get('cardAtlas');
    // 轻量阴影
    _glSave();
    _alpha *= 0.25;
    fillRounded(x+2, y+2, w, h, Math.min(6, w*0.12), '#000000');
    _glRestore();
    var atlasReady = _imgReadyByKey('cardAtlas');
    var hasFrame = !!_ATLAS_FRAMES[card && card.id];
    if (!_atlasDbgLogged) {
      _atlasDbgLogged = true;
      var img = atlasImg;
      console.log('[DDZ Atlas]',
        'AM.loaded=', AM.loaded('cardAtlas'),
        'img=', img ? 'exists' : 'null',
        'img._amLoaded=', img && img._amLoaded,
        'img.complete=', img && img.complete,
        'img.naturalWidth=', img && img.naturalWidth,
        'img.width=', img && img.width,
        'atlasReady=', atlasReady,
        'card.id=', card && card.id,
        'hasFrame=', hasFrame
      );
    }
    if (atlasReady && _drawCardFromAtlas(atlasImg, card, x, y, w, h)) return;
    // 图集未就绪：白底 + 文字占位
    var r = Math.min(6, w*0.12);
    fillRounded(x, y, w, h, r, C.cardWhite);
    strokeRounded(x, y, w, h, r, 'rgba(0,0,0,.12)');
    var isRed = M3.Deck.isRed(card);
    ctext(x+w/2, y+h/2, card.label || '?', Math.floor(h*0.22), isRed ? C.cardRed : C.cardBlack, 700);
  }

  // ================================================================
  // 牌面 sprite 缓存（离屏 2D canvas 烘焙后整体贴图，比逐帧 drawCard 快）
  // ================================================================
  var _cardSprites = {};

  // 图片是否已加载完成可用于 drawImage / texImage2D
  function _imgReady (img) {
    if (!img) return false;
    if (img._amLoaded) return true;           // AM onload 打的标（最可靠）
    if (img.complete === false) return false; // HTMLImageElement 明确未完成
    return (img.naturalWidth || img.width || 0) > 0;
  }

  function _imgReadyByKey (key) {
    return AM.loaded(key);
  }

  function _cardImgsReady (card) {
    if (!card) return false;
    return _imgReadyByKey('cardAtlas') && !!_ATLAS_FRAMES[card.id];
  }

  function _getCardSprite (card, w, h) {
    if (!_cardImgsReady(card)) return null;
    var dpr = M3.renderDpr ? M3.renderDpr() : (window.devicePixelRatio||1);
    var rw=Math.round(w), rh=Math.round(h), pad=8;
    var key = card.id+'|'+rw+'x'+rh+'|'+dpr;
    var s = _cardSprites[key];
    if (s) return s;
    // 用离屏 2D canvas 烘焙牌面
    var cw=Math.round((rw+pad*2)*dpr), ch=Math.round((rh+pad*2)*dpr);
    var cvs=_mkCanvas(cw,ch);
    var sctx=cvs.getContext('2d');
    sctx.setTransform(dpr,0,0,dpr,0,0);
    // 临时借用一个迷你 2D 渲染路径来烘焙
    _bakeCard2D(sctx, pad, pad, card, rw, rh);
    cvs._texStatic = true;   // 烘焙后内容不再变化：纹理只上传一次
    s={canvas:cvs,pad:pad,wl:rw+pad*2,hl:rh+pad*2};
    _cardSprites[key]=s;
    return s;
  }

  // 在离屏 2D context 上绘制牌面（仅用于 sprite 缓存烘焙，不走 WebGL 路径）
  function _bakeCard2D (c2d, x, y, card, w, h) {
    var r = Math.min(6, w*0.12);
    c2d.save();
    var atlasImg = AM.get('cardAtlas');
    if (_imgReadyByKey('cardAtlas') && _bakeCardFromAtlas2D(c2d, atlasImg, card, x, y, w, h)) {
      c2d.restore();
      return;
    }
    // 图集未就绪：白底占位
    c2d.fillStyle = C.cardWhite;
    _rrect2d(c2d, x, y, w, h, r); c2d.fill();
    c2d.strokeStyle = 'rgba(0,0,0,.12)'; c2d.lineWidth = 1;
    _rrect2d(c2d, x, y, w, h, r); c2d.stroke();
    var isRed = M3.Deck.isRed(card);
    c2d.fillStyle = isRed ? C.cardRed : C.cardBlack;
    c2d.font = Math.floor(h*0.22) + 'px sans-serif';
    c2d.textAlign = 'center'; c2d.textBaseline = 'middle';
    c2d.fillText(card.label || '?', x + w/2, y + h/2);
    c2d.restore();
  }

  function _rrect2d (c2d, x, y, w, h, r) {
    c2d.beginPath();
    c2d.moveTo(x+r,y); c2d.lineTo(x+w-r,y);
    c2d.arcTo(x+w,y,x+w,y+r,r); c2d.lineTo(x+w,y+h-r);
    c2d.arcTo(x+w,y+h,x+w-r,y+h,r); c2d.lineTo(x+r,y+h);
    c2d.arcTo(x,y+h,x,y+h-r,r); c2d.lineTo(x,y+r);
    c2d.arcTo(x,y,x+r,y,r); c2d.closePath();
  }

  // 牌面绘制优先直接采样图集：所有牌共用 cardAtlas 一张纹理，
  // 17 张手牌 + 落地牌能合并进同一个 batch（每张牌单独烘焙 canvas 时，
  // 每张都是独立纹理，逐张打断批次 → 一帧数十次 drawArrays）。
  function drawCardFast (x, y, card, w, h) {
    var atlasImg = AM.get('cardAtlas');
    if (_imgReadyByKey('cardAtlas') && _drawCardFromAtlas(atlasImg, card, x, y, w, h)) return;
    var s = _getCardSprite(card, w, h);
    if (s) glDrawImage(s.canvas, x-s.pad, y-s.pad, s.wl, s.hl);
    else   drawCard(x, y, card, w, h, false);
  }

  // 烘焙尺寸与绘制尺寸分离：sprite 按 bakeW/bakeH 查（可复用已有缓存，如手牌 sprite），
  // 绘制时整体缩放到 w×h。用于出牌飞行动画——避免为动画尺寸首帧集中烘焙新 sprite 造成掉帧。
  function drawCardScaled (x, y, card, w, h, bakeW, bakeH) {
    var atlasImg2 = AM.get('cardAtlas');
    if (_imgReadyByKey('cardAtlas') && _drawCardFromAtlas(atlasImg2, card, x, y, w, h)) return;
    var s = _getCardSprite(card, bakeW, bakeH);
    if (s) {
      var k = w / bakeW;
      glDrawImage(s.canvas, x-s.pad*k, y-s.pad*k, s.wl*k, s.hl*k);
    } else {
      drawCard(x, y, card, w, h, false);
    }
  }

  // ================================================================
  // 背景
  // ================================================================
  var _bgGradCanvas = null;
  function drawBackground () {
    var W=L.w, H=L.h;
    if (!_bgGradCanvas || _bgGradCanvas._lw!==W || _bgGradCanvas._lh!==H) {
      var bgCvs=_mkCanvas(W,H);
      bgCvs._lw=W; bgCvs._lh=H;
      var bgCtx=bgCvs.getContext('2d');
      var g=bgCtx.createRadialGradient(W*0.4,H*0.35,0,W/2,H/2,Math.max(W,H)*0.72);
      g.addColorStop(0,C.bg2); g.addColorStop(0.55,C.bg1); g.addColorStop(1,'#041a10');
      bgCtx.fillStyle=g; bgCtx.fillRect(0,0,W,H);
      bgCvs._texStatic = true;   // 渐变烘焙后不变：纹理只上传一次
      _bgGradCanvas=bgCvs;
    }
    glDrawImage(_bgGradCanvas, 0, 0, W, H);
  }

  function drawGameBackground () {
    var W=L.w, H=L.h;
    var bgImg=AM.get('bgGame');
    if (bgImg) {
      glDrawImage(bgImg, 0, 0, W, H);
    } else {
      // 降级：用三段近似渐变
      fillRounded(0, 0, W, H*0.5, 0, '#1a3a6e');
      fillRounded(0, H*0.5, W, H*0.5, 0, '#050d20');
    }
  }

  // ================================================================
  // Flash 提示弹窗
  // ================================================================
  function wrapText (text, maxW, font) {
    text=String(text==null?'':text);
    if (glMeasureText(text,font)<=maxW) return [text];
    var lines=[],cur='';
    for (var i=0;i<text.length;i++){
      var ch=text[i];
      if (ch==='\n'){lines.push(cur);cur='';continue;}
      var test=cur+ch;
      if (glMeasureText(test,font)>maxW&&cur!==''){lines.push(cur);cur=ch;}
      else cur=test;
    }
    if (cur!=='') lines.push(cur);
    return lines.length?lines:[text];
  }

  function drawFlash () {
    var W=L.w, H=L.h;
    var msg=M3.Game.getFlashMsg();
    if (!msg) return;
    var short=Math.min(W,H), fontSz=16;
    var font='600 '+fontSz+'px sans-serif';
    var padX=20, padY=14, lineH=fontSz+6;
    var maxBW=Math.min(360,short*0.86), maxTextW=maxBW-padX*2;
    var lines=wrapText(msg,maxTextW,font);
    var contentW=0;
    for (var i=0;i<lines.length;i++){
      var lw=glMeasureText(lines[i],font);
      if (lw>contentW) contentW=lw;
    }
    var bw=Math.min(maxBW,Math.ceil(contentW)+padX*2);
    var bh=padY*2+lineH*lines.length;
    var fx=W/2-bw/2, fy=H/2-bh/2;
    // 阴影近似
    _glSave(); _alpha*=0.65;
    fillRounded(fx+2,fy+2,bw,bh,10,'#000000');
    _glRestore();
    fillRounded(fx,fy,bw,bh,10,'rgba(10,30,16,.96)');
    strokeRounded(fx,fy,bw,bh,10,'rgba(245,158,11,.6)',1.5);
    var startY=fy+padY+lineH/2;
    for (var j=0;j<lines.length;j++)
      glFillText(lines[j],W/2,startY+j*lineH,font,'#fef3c7','center','middle');
  }

  // ================================================================
  // 加入房间弹窗
  // ================================================================
  function drawJoinModal () {
    var W=L.w,H=L.h,short=Math.min(W,H);
    _fillRect(0,0,W,H,'rgba(0,0,0,.65)');
    var mw=Math.min(300,short*0.82);
    var mh=L.isLandscape?Math.min(H*0.85,340):380;
    var mx=W/2-mw/2,my=(H-mh)/2;
    fillRounded(mx,my,mw,mh,14,'rgba(15,30,20,.96)');
    strokeRounded(mx,my,mw,mh,14,'rgba(42,166,120,.6)',2);
    glFillText('输入房间号',W/2,my+16,'700 18px sans-serif','#fcd34d','center','top');
    var digits=M3.Game.getRoomDigits();
    var dgCh=40,dgGap=6,dgTotal=6*dgCh+5*dgGap;
    var dgX=W/2-dgTotal/2,dgY=my+50;
    for (var di=0;di<6;di++){
      var dx=dgX+di*(dgCh+dgGap);
      fillRounded(dx,dgY,dgCh,dgCh,6,'rgba(6,36,24,.8)');
      strokeRounded(dx,dgY,dgCh,dgCh,6,digits.length===di?C.goldL:'rgba(42,166,120,.4)');
      if (di<digits.length)
        glFillText(digits.charAt(di),dx+dgCh/2,dgY+dgCh/2,'700 22px sans-serif','#fef3c7','center','middle');
    }
    var keyY=dgY+dgCh+16, keyW=Math.floor((mw-32)/3);
    var keyH=L.isLandscape?34:44, keyGap=6;
    var keys=[1,2,3,4,5,6,7,8,9,'删除',0,'确认'];
    var filled=digits.length>=6;
    for (var ki=0;ki<12;ki++){
      var col=ki%3,row=Math.floor(ki/3);
      var kx=mx+10+col*(keyW+keyGap), ky=keyY+row*(keyH+keyGap), key=keys[ki];
      var keyColor,textColor;
      if (key==='删除'){keyColor='rgba(185,28,28,.4)';textColor='#fca5a5';}
      else if (key==='确认'){keyColor=filled?'rgba(5,150,105,.5)':'rgba(5,150,105,.15)';textColor=filled?'#6ee7b7':'#4ade80';}
      else {keyColor='rgba(30,58,42,.7)';textColor='#f1f5f9'; strokeRounded(kx,ky,keyW,keyH,8,'rgba(42,166,120,.3)',1);}
      var kp = M3.Render.beginPressScale('key_'+key, kx + keyW / 2, ky + keyH / 2, 0.94);
      fillRounded(kx,ky,keyW,keyH,8,keyColor);
      var kfont=(key==='确认'?'700':'600')+' '+(key==='确认'?16:key==='删除'?14:22)+'px sans-serif';
      glFillText(String(key),kx+keyW/2,ky+keyH/2,kfont,textColor,'center','middle');
      M3.Render.endPressScale(kp);
      hitBtns.push({x:kx,y:ky,w:keyW,h:keyH,label:'key_'+key,onClick:(function(k){
        return function(){
          if (k==='删除') M3.Game.delRoomDigit();
          else if (k==='确认') M3.Game.confirmJoinRoom();
          else M3.Game.addRoomDigit(k);
        };
      })(key)});
    }
  }

  // ================================================================
  // M3.Render 公开接口
  // ================================================================
  M3.Render = {
    init: function () {
      var g = M3.gl;
      if (g) {
        _initGL(g);
        _lw = L.w || 375;
        _lh = L.h || 667;
        _updateProj();
      }
    },

    onResize: function (cssW, cssH) {
      _lw = cssW; _lh = cssH;
      _updateProj();
    },

    getCtx:        function () { return null; },
    getHandHits:   function () { return handHits; },
    getHitBtns:    function () { return hitBtns; },
    resetHits:     function () { handHits = []; hitBtns = []; },

    drawCard:     function (x, y, card, w, h, sel) { drawCard(x, y, card, w, h, sel); },
    drawCardFast: function (x, y, card, w, h)      { drawCardFast(x, y, card, w, h); },
    clearCardCache: function () { _cardSprites = {}; },   // 调试用：清牌面烘焙缓存
    drawCardScaled: function (x, y, card, w, h, bw, bh) { drawCardScaled(x, y, card, w, h, bw, bh); },
    drawCardBack: function (x, y, w, h, lbl)        { drawCardBack(x, y, w, h, lbl); },

    // 供外部 scene 文件直接调用底层 WebGL 原语
    glDrawImage:  glDrawImage,
    glDrawImageCircle: glDrawImageCircle,
    glDrawCircleStroke: glDrawCircleStroke,
    glDrawImage9: function (src, x, y, w, h, sliceX, sliceY, designW, designH) {
      glDrawImage9(src, x, y, w, h, sliceX, sliceY, designW, designH);
    },
    glFillText:   glFillText,
    glFillTextStroke: glFillTextStroke,
    glMeasureText:glMeasureText,
    fillRounded:  fillRounded,
    strokeRounded:strokeRounded,
    gradientFill: gradientFill,
    fillRect:     _fillRect,
    beginPath:    _beginPath,
    moveTo:       _moveTo,
    lineTo:       _lineTo,
    arc:          _arc,
    arcTo:        _arcTo,
    closePath:    _closePath,
    fill:         _fill,
    stroke:       _stroke,
    save:         _glSave,
    restore:      _glRestore,
    translate:    _glTranslate,
    scale:        _glScale,
    rotate:       _glRotate,
    // 按压缩放动画原语（与主页/UIButton 同款，供各场景自绘按钮共用）：
    // begin：命中按下按钮时以中心缩放（自带 save）；end：成对 restore。
    // 热区矩形保持原始大小，不影响命中判定。
    beginPressScale: function (key, cx, cy, scale) {
      if (!M3.Input || !M3.Input.getPressedLabel) return false;
      if (M3.Input.getPressedLabel() !== key) return false;
      _glSave();
      var s = scale || 0.92;
      _glTranslate(cx, cy);
      _glScale(s, s);
      _glTranslate(-cx, -cy);
      return true;
    },
    endPressScale: function (pressed) {
      if (pressed) _glRestore();
    },
    setAlpha:     function (a) { _alpha = a; },
    fillRoundedGrad: fillRoundedGrad,
    fillRectGradH: fillRectGradH,

    // Scissor（WebGL 裁剪区域），用于防止 UI 滚动溢出
    setScissor: function (x, y, w, h) {
      if (!gl) return;
      // 批处理下顶点是延后提交的：不先 flush，之前积压的内容会被这里的新裁剪框裁掉
      _flushBatch();
      var dpr = M3.renderDpr ? M3.renderDpr() : (window.devicePixelRatio || 1);
      var canvasH = gl.drawingBufferHeight || (_lh * dpr);
      gl.enable(gl.SCISSOR_TEST);
      // WebGL scissor 坐标系：左下角原点，Y 轴向上
      var sy = Math.round(canvasH - (y + h) * dpr);
      gl.scissor(Math.round(x * dpr), sy, Math.round(w * dpr), Math.round(h * dpr));
    },
    clearScissor: function () {
      if (!gl) return;
      _flushBatch();   // 同上：裁剪区内的顶点必须在关闭裁剪前提交
      gl.disable(gl.SCISSOR_TEST);
    },
    panel:        panel,
    txt:          txt,
    ctext:        ctext,

    update: function (now) {
      _bgTime = now;
      // 帧间隔：rAF 两次回调的时间差。与 _cpuMs（帧内 draw 耗时）相减即可判断
      // 掉帧责任方——gap 远大于 cpu 说明时间耗在引擎合成/系统调度，不在我们的绘制代码。
      if (_frameLast) { _gapAcc += now - _frameLast; _gapN++; }
      _frameLast = now;
      // FPS 统计：每秒重置一次计数
      _fpsFrames++;
      if (_fpsLast === 0) _fpsLast = now;
      if (now - _fpsLast >= 1000) {
        _fpsVal = Math.round(_fpsFrames * 1000 / (now - _fpsLast));
        _fpsFrames = 0;
        _fpsLast = now;
        _cpuMs = _cpuN ? (_cpuAcc / _cpuN) : 0;
        _cpuAcc = 0; _cpuN = 0;
        _gapMs = _gapN ? (_gapAcc / _gapN) : 0;
        _gapAcc = 0; _gapN = 0;
      }
      if (M3.SceneGame) M3.SceneGame.update(now);
    },

    draw: function () {
      var W = L.w, H = L.h;
      if (!gl || !_prog) return;

      // WebGL 清屏
      gl.clearColor(0, 0, 0, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);

      // 帧开始：重置 batch 状态
      _batchLen = 0; _batchTex = null; _batchUseTex = false;
      _dcLast = _dc; _dc = 0;
      var _t0 = M3._now();

      // 重置变换和透明度
      _tf = [1,0,0, 0,1,0, 0,0,1];
      _alpha = 1;
      _tfStack = [];
      _alphaStack = [];
      handHits = [];
      hitBtns  = [];

      var screen = M3.Game.getScreen();

      // 游戏背景由 M3.SceneGame.draw() 内部处理，此处只需保证非 game 场景有背景
      if (screen !== 'game') drawBackground();

      if (screen === 'home') {
        M3.SceneHome.draw();
        if (M3.Game.getShowJoinModal()) drawJoinModal();
        if (M3.SceneRecord && M3.SceneRecord.isVisible && M3.SceneRecord.isVisible())
          M3.SceneRecord.draw();
        // 破产补助弹窗（结算页未领取、主页点场次时优先弹出；
        // game 屏的绘制由 settlement.draw 内部挂载，此处只挂 home 避免同帧双绘）
        if (M3.SceneBankrupt && M3.SceneBankrupt.isVisible && M3.SceneBankrupt.isVisible())
          M3.SceneBankrupt.draw();
      }
      else if (screen === 'game') {
        if (M3.SceneGame) M3.SceneGame.draw();
        if (M3.SceneSettlement && M3.SceneSettlement.draw) M3.SceneSettlement.draw();
        // 结算屏上的看广告得铁豆弹窗（破产链路：豆不足关闭后弹广告）；
        // home 屏由 SceneHome.draw 内部挂载，此处只挂 game 屏避免双绘
        if (M3.SceneAdReward && M3.SceneAdReward.isVisible && M3.SceneAdReward.isVisible())
          M3.SceneAdReward.draw();
        // 退出确认弹窗保持在结算层之上（进行中牌局点退出时可见）
        if (M3.SceneGame && M3.SceneGame.drawLeaveConfirmModal) M3.SceneGame.drawLeaveConfirmModal();
      }

      if ((screen==='home'||screen==='game') && M3.SceneVoice &&
          M3.SceneVoice.isVisible && M3.SceneVoice.isVisible())
        M3.SceneVoice.draw();

      if (M3.SceneProfile && M3.SceneProfile.draw) M3.SceneProfile.draw();

      if (M3.SceneShop && M3.SceneShop.draw) M3.SceneShop.draw();

      // 平台币充值与兑换位于通用商城之上，兑换页再覆盖充值页。
      if (M3.SceneDiamondStore && M3.SceneDiamondStore.isVisible && M3.SceneDiamondStore.isVisible())
        M3.SceneDiamondStore.draw();
      if (M3.SceneDiamondExchange && M3.SceneDiamondExchange.isVisible && M3.SceneDiamondExchange.isVisible())
        M3.SceneDiamondExchange.draw();

      // 钻石兑换铁豆确认弹窗（叠在商城之上）
      if (M3.SceneExchangePopup && M3.SceneExchangePopup.isVisible && M3.SceneExchangePopup.isVisible())
        M3.SceneExchangePopup.draw();

      // 豆子不足弹窗（进场引导购买；钻石不足弹窗会再叠在其上）
      if (M3.SceneInsufficientBeans && M3.SceneInsufficientBeans.isVisible && M3.SceneInsufficientBeans.isVisible())
        M3.SceneInsufficientBeans.draw();

      // 钻石不足弹窗（叠在商城之上）
      if (M3.SceneInsufficientDiamondPopup && M3.SceneInsufficientDiamondPopup.isVisible && M3.SceneInsufficientDiamondPopup.isVisible())
        M3.SceneInsufficientDiamondPopup.draw();

      // 获得豆子弹窗：全局最顶层，任意场景均可弹出
      if (M3.SceneBeanReward && M3.SceneBeanReward.isVisible && M3.SceneBeanReward.isVisible())
        M3.SceneBeanReward.draw();

      // FPS 显示（左上角，仅 game 场景 / debug 模式下展示）
      if (_showFps && (screen === 'game' || screen === 'home')) {
        _flushBatch();  // 先 flush 场景内容，再覆盖 FPS 文字（保证最顶层）
        var safeTop = (L.safeTop || 0);
        glFillText('FPS ' + _fpsVal + '  cpu ' + _cpuMs.toFixed(1) + '  gap ' + _gapMs.toFixed(1) + '  dc ' + _dcLast,
                   8, safeTop + 4, '600 11px sans-serif', 'rgba(0,255,120,0.9)', 'left', 'top');
        _flushBatch();
      }

      // 帧末 flush：提交所有尚未绘制的批量顶点
      _flushBatch();

      // Spine 特效（三带一/春天/主页 spine 按钮等）：绘制在所有游戏内容之上
      // （共享本 GL 上下文，画完内部恢复 blend + 作废影子状态）
      if (M3.SpineFX && M3.SpineFX.draw) M3.SpineFX.draw(_t0);
      // overlay：spine 之上的叠加内容（如按钮上的文字）。overlay 走 2D 批处理，
      // 画完需要再 flush 一次才能本帧上屏
      if (M3.SpineFX && M3.SpineFX.drawOverlays && M3.SpineFX.drawOverlays()) {
        _flushBatch();
      }

      // 全局提示条：绘制在 spine 之后，保证「看完视频才能领取铁豆哦~」等
      // 提示不被结算 spine（GL 直绘）盖住
      drawFlash();
      _flushBatch();

      _cpuAcc += M3._now() - _t0; _cpuN++;
    },

    showFps: function (v) { _showFps = (v !== false); },

    // 外部（如 SpineFX）改动了 GL 状态后调用：作废影子缓存，下一帧重新下发
    resetGlState: function () { _resetGlState(); },

    // 提交尚未绘制的批量顶点（GL 直接绘制如 spine 前，须先 flush 才能保持层级：
    // 未 flush 的 batch 会在之后提交，反过来盖住 GL 直绘内容）
    flushBatch: function () { _flushBatch(); },
  };

  M3.Render.enqueueAnimation = function (act) {
    if (M3.SceneGame) M3.SceneGame.enqueueAnimation(act);
  };

})();
