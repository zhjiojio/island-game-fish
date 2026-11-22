(function () {
  var AIGCUtils = window.AIGCUtils;
  var C = {
    ink: [0.24, 0.19, 0.15, 1],
    /** R0025：弹窗统一深棕字色 ≈ #5E3314（引导图手写风中位色） */
    dialogInk: [94 / 255, 51 / 255, 20 / 255, 1],
    cream: [0.98, 0.92, 0.79, 1],
    paper: [0.96, 0.86, 0.67, 1],
    sand: [0.91, 0.76, 0.52, 1],
    sea: [0.25, 0.61, 0.69, 1],
    seaDark: [0.16, 0.43, 0.53, 1],
    sky: [0.69, 0.83, 0.79, 1],
    leaf: [0.31, 0.52, 0.30, 1],
    leafLight: [0.47, 0.65, 0.36, 1],
    wood: [0.48, 0.30, 0.17, 1],
    woodLight: [0.67, 0.44, 0.24, 1],
    honey: [0.94, 0.63, 0.20, 1],
    orange: [0.88, 0.39, 0.20, 1],
    green: [0.42, 0.67, 0.34, 1],
    red: [0.76, 0.29, 0.22, 1],
    white: [0.99, 0.96, 0.86, 1],
    brown: [0.35, 0.22, 0.13, 1],
    fish: [0.55, 0.75, 0.76, 1],
    fishCooked: [0.83, 0.48, 0.20, 1],
    shadow: [0.18, 0.15, 0.12, 0.25],
    disabled: [0.43, 0.43, 0.39, 0.7],
    overlay: [0.12, 0.12, 0.12, 0.68]
  };

  AIGCUtils.Renderer = {
    gl: null,
    program: null,
    buffer: null,
    fontTexture: null,
    fontLoading: false,
    fontReady: false,
    fontNextRetryAt: 0,
    missingGlyphs: {},
    vertices: [],
    width: 960,
    height: 540,
    scale: 1,
    offsetX: 0,
    offsetY: 0,
    colors: C,

    init: function () {
      if (this.gl) return true;
      var gl = window.canvas.getContext("webgl");
      if (!gl) return false;
      var vertexSource = "attribute vec2 a_position;attribute vec4 a_color;attribute vec2 a_uv;attribute float a_textured;varying vec4 v_color;varying vec2 v_uv;varying float v_textured;void main(){gl_Position=vec4(a_position,0.0,1.0);v_color=a_color;v_uv=a_uv;v_textured=a_textured;}";
      var fragmentSource = [
        "precision mediump float;",
        "uniform sampler2D u_font;",
        "uniform sampler2D u_mask;",
        "uniform sampler2D u_meta;",
        "uniform float u_time;",
        "uniform float u_foam;",
        "uniform vec2 u_resolution;",
        "varying vec4 v_color;",
        "varying vec2 v_uv;",
        "varying float v_textured;",
        "void main(){",
        "  vec4 color=v_color;",
        // R0018 浪形保留；R0019 只改近岸浪花（碎点 swash + 波峰碎沫）
        "  if(v_textured>3.0){",
        "    vec4 m=texture2D(u_mask,v_uv);",
        "    float cover=m.a;",
        "    if(cover<0.004) discard;",
        "    float t=u_time;",
        "    float depth=smoothstep(0.18,0.88,v_uv.y);",
        "    float yFreq=mix(6.2,3.4,depth);",
        "    float warp=sin(v_uv.x*3.8+t*0.28)*0.55+sin(v_uv.x*1.6-t*0.14)*0.30;",
        "    float phase=v_uv.y*yFreq-t*0.68+warp;",
        "    float w1=sin(phase);",
        "    float w2=sin(phase*0.52+v_uv.x*1.05-t*0.26+1.0);",
        "    float h=w1*0.80+w2*0.32;",
        "    vec3 raw=m.rgb;",
        "    float lum=dot(raw,vec3(0.30,0.59,0.11));",
        "    vec3 chroma=raw/max(lum,0.06);",
        "    float flatLum=mix(lum,0.40,0.58);",
        "    vec3 col=chroma*flatLum;",
        "    col=mix(raw,col,0.72);",
        "    col+=vec3(0.11,0.10,0.07)*h;",
        "    col-=vec3(0.09,0.07,0.05)*smoothstep(0.10,-0.50,h);",
        "    float face=smoothstep(-0.20,0.40,h)*(1.0-smoothstep(0.45,0.90,h));",
        "    col+=vec3(0.05,0.045,0.03)*face;",
        "    float crest=pow(smoothstep(0.72,0.98,w1),2.5);",
        "    col=mix(col,vec3(0.96,0.94,0.88),crest*0.14);",
        "    col=clamp(col,0.0,1.0);",
        "    vec4 meta=texture2D(u_meta,v_uv);",
        "    float shore=meta.r*u_foam;",
        "    float pulse=0.5+0.5*sin(t*1.13);",
        "    float front=shore*1.15-0.20-pulse*0.55;",
        "    float swash=smoothstep(0.02,0.22,front)*smoothstep(0.55,0.18,front);",
        "    float grit=sin(v_uv.x*48.0+t*2.4+meta.b*6.28)*sin(v_uv.x*19.0-t*1.6+shore*9.0);",
        "    swash*=smoothstep(-0.15,0.55,grit);",
        "    swash*=smoothstep(0.08,0.45,shore);",
        "    float crestFoam=pow(smoothstep(0.55,0.95,h),2.0)*smoothstep(0.12,0.70,shore);",
        "    crestFoam*=smoothstep(0.0,0.6,grit*0.5+0.5);",
        "    float foam=max(swash*0.92,crestFoam*0.55)*cover;",
        "    col=mix(col,vec3(0.97,0.99,0.96),foam);",
        "    float a=smoothstep(0.02,0.85,cover);",
        "    gl_FragColor=vec4(col,a);",
        "    return;",
        "  }",
        "  if(v_textured>2.5){vec4 tex=texture2D(u_font,v_uv);float g=dot(tex.rgb,vec3(0.299,0.587,0.114));color=vec4(vec3(g)*v_color.rgb,tex.a*v_color.a);}",
        "  else if(v_textured>1.5){vec4 tex=texture2D(u_font,v_uv);color=vec4(tex.rgb*v_color.rgb,tex.a*v_color.a);}",
        "  else if(v_textured>0.5){color.a*=texture2D(u_font,v_uv).a;}",
        "  gl_FragColor=color;",
        "}"
      ].join("");
      function compile(type, source) {
        var shader = gl.createShader(type);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
          console.error("[Prototype] Shader error", gl.getShaderInfoLog(shader));
          return null;
        }
        return shader;
      }
      var vertex = compile(gl.VERTEX_SHADER, vertexSource);
      var fragment = compile(gl.FRAGMENT_SHADER, fragmentSource);
      if (!vertex || !fragment) return false;
      var program = gl.createProgram();
      gl.attachShader(program, vertex);
      gl.attachShader(program, fragment);
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return false;
      this.gl = gl;
      this.program = program;
      this.buffer = gl.createBuffer();
      gl.useProgram(program);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
      var position = gl.getAttribLocation(program, "a_position");
      var color = gl.getAttribLocation(program, "a_color");
      var uv = gl.getAttribLocation(program, "a_uv");
      var textured = gl.getAttribLocation(program, "a_textured");
      gl.enableVertexAttribArray(position);
      gl.enableVertexAttribArray(color);
      gl.enableVertexAttribArray(uv);
      gl.enableVertexAttribArray(textured);
      gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 36, 0);
      gl.vertexAttribPointer(color, 4, gl.FLOAT, false, 36, 8);
      gl.vertexAttribPointer(uv, 2, gl.FLOAT, false, 36, 24);
      gl.vertexAttribPointer(textured, 1, gl.FLOAT, false, 36, 32);
      this.fontUniform = gl.getUniformLocation(program, "u_font");
      gl.uniform1i(this.fontUniform, 0);
      this.maskUniform = gl.getUniformLocation(program, "u_mask");
      this.metaUniform = gl.getUniformLocation(program, "u_meta");
      this.timeUniform = gl.getUniformLocation(program, "u_time");
      this.foamUniform = gl.getUniformLocation(program, "u_foam");
      this.resUniform = gl.getUniformLocation(program, "u_resolution");
      gl.uniform1i(this.maskUniform, 1);
      gl.uniform1i(this.metaUniform, 2);
      gl.uniform1f(this.foamUniform, 1);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      this.loadFont();
      this.loadScenes();
      return true;
    },

    loadFont: function () {
      if (this.fontLoading || this.fontReady) return;
      if (Date.now() < this.fontNextRetryAt) return;
      if (typeof KwaiMedia === "undefined" || !KwaiMedia.Image) {
        this.fontNextRetryAt = Date.now() + 1000;
        console.error("[Prototype] Font image loader unavailable");
        return;
      }
      this.fontLoading = true;
      var renderer = this;
      KwaiMedia.Image.load(AIGCUtils.FontAtlas.image).then(function (image) {
        var gl = renderer.gl;
        var texture = gl.createTexture();
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
        renderer.fontTexture = texture;
        renderer.fontReady = true;
        renderer.fontLoading = false;
        console.log("[Prototype] Simplified Chinese font atlas loaded");
      }).catch(function (error) {
        renderer.fontLoading = false;
        renderer.fontNextRetryAt = Date.now() + 1000;
        console.error("[Prototype] Font atlas load failed", error);
      });
    },

    // 场景原画。key 对应 package/res/Image 下的横竖屏图，加载失败时继续用色块，不挡玩法。
    sceneCatalog: [
      { key: "map-land", path: "res/Image/scene-map-land.jpg" },
      { key: "map-port", path: "res/Image/scene-map-port.jpg" },
      { key: "fish-land", path: "res/Image/scene-fish-land.jpg" },
      { key: "fish-port", path: "res/Image/scene-fish-port.jpg" },
      { key: "coconut-land", path: "res/Image/scene-coconut-land.jpg" },
      { key: "coconut-port", path: "res/Image/scene-coconut-port.jpg" },
      { key: "shop-land", path: "res/Image/scene-shop-land.jpg" },
      { key: "shop-port", path: "res/Image/scene-shop-port.jpg" },
      { key: "build-land", path: "res/Image/scene-build-land.jpg" },
      { key: "night", path: "res/Image/scene-night.jpg" }
    ],
    uiSkinCatalog: [
      { key: "ui-skin-fish-land", path: "res/Image/ui/ui-skin-fish-land.png" },
      { key: "ui-skin-fish-port", path: "res/Image/ui/ui-skin-fish-port.png" },
      // 分层重做：去船完整海面（noboat）/ 浪层占位底板（seabase）/ 深海 + 浪 sheet + 真船
      { key: "ui-skin-fish-land-noboat", path: "res/Image/ui/ui-skin-fish-land-noboat.png" },
      { key: "ui-skin-fish-port-noboat", path: "res/Image/ui/ui-skin-fish-port-noboat.png" },
      { key: "ui-skin-fish-land-seabase", path: "res/Image/ui/ui-skin-fish-land-seabase.png?v=3" },
      { key: "ui-skin-fish-port-seabase", path: "res/Image/ui/ui-skin-fish-port-seabase.png?v=3" },
      { key: "ui-skin-fish-land-deepbase", path: "res/Image/ui/ui-skin-fish-land-deepbase.png?v=1" },
      { key: "ui-skin-fish-port-deepbase", path: "res/Image/ui/ui-skin-fish-port-deepbase.png?v=1" },
      { key: "ui-skin-fish-land-seaflat", path: "res/Image/ui/ui-skin-fish-land-seaflat.png?v=12" },
      { key: "ui-skin-fish-port-seaflat", path: "res/Image/ui/ui-skin-fish-port-seaflat.png?v=14" },
      { key: "ui-skin-fish-land-deepflat", path: "res/Image/ui/ui-skin-fish-land-deepflat.png?v=12" },
      { key: "ui-skin-fish-port-deepflat", path: "res/Image/ui/ui-skin-fish-port-deepflat.png?v=14" },
      { key: "ui-chrome-land", path: "res/Image/ui/ui-chrome-land.png?v=2" },
      { key: "ui-chrome-port", path: "res/Image/ui/ui-chrome-port.png?v=2" },
      { key: "sea-mask-land", path: "res/Image/ui/sea-mask-land.png?v=12" },
      { key: "sea-mask-port", path: "res/Image/ui/sea-mask-port.png?v=12" },
      { key: "sea-mask-deep-land", path: "res/Image/ui/sea-mask-deep-land.png?v=12" },
      { key: "sea-mask-deep-port", path: "res/Image/ui/sea-mask-deep-port.png?v=12" },
      { key: "sea-meta-land", path: "res/Image/ui/sea-meta-land.png?v=2" },
      { key: "sea-meta-port", path: "res/Image/ui/sea-meta-port.png?v=2" },
      { key: "sea-meta-deep-land", path: "res/Image/ui/sea-meta-deep-land.png?v=2" },
      { key: "sea-meta-deep-port", path: "res/Image/ui/sea-meta-deep-port.png?v=2" },
      { key: "boat_fish_land", path: "res/Image/sprites/boat_fish_land.png?v=6" },
      { key: "boat_fish_port", path: "res/Image/sprites/boat_fish_port.png?v=10" },
      { key: "rock_reef_lv1", path: "res/Image/sprites/rock_reef_lv1.png?v=2" },
      // 旧风景 sheet 保留加载，运行时改用纯海 swell/crash
      { key: "anim_sea_wave_shallow_land", path: "res/Image/sprites/anim/sea_wave_shallow_land_sheet.png?v=3" },
      { key: "anim_sea_wave_shallow_port", path: "res/Image/sprites/anim/sea_wave_shallow_port_sheet.png?v=3" },
      { key: "anim_sea_wave_deep_land", path: "res/Image/sprites/anim/sea_wave_deep_land_sheet.png?v=3" },
      { key: "anim_sea_wave_deep_port", path: "res/Image/sprites/anim/sea_wave_deep_port_sheet.png?v=3" },
      { key: "anim_sea_swell_land", path: "res/Image/sprites/anim/sea_swell_land_sheet.png?v=3" },
      { key: "anim_sea_swell_port", path: "res/Image/sprites/anim/sea_swell_port_sheet.png?v=3" },
      { key: "anim_sea_crash_land", path: "res/Image/sprites/anim/sea_crash_land_sheet.png?v=3" },
      { key: "anim_sea_crash_port", path: "res/Image/sprites/anim/sea_crash_port_sheet.png?v=3" },
      // R0020b：横屏浅滩整屏海域 16 帧全分辨率，拆 4 张 2×2 atlas（960×540 每格，避免半分辨率发糊）
      { key: "anim_fish_sea_gif_land_0", path: "res/Image/sprites/anim/fish_sea_gif_land_atlas0.png?v=5" },
      { key: "anim_fish_sea_gif_land_1", path: "res/Image/sprites/anim/fish_sea_gif_land_atlas1.png?v=5" },
      { key: "anim_fish_sea_gif_land_2", path: "res/Image/sprites/anim/fish_sea_gif_land_atlas2.png?v=5" },
      { key: "anim_fish_sea_gif_land_3", path: "res/Image/sprites/anim/fish_sea_gif_land_atlas3.png?v=5" },
      { key: "anim_rabbit_fish_cast", path: "res/Image/sprites/anim/rabbit_fish_cast_sheet.png?v=1" },
      { key: "anim_rabbit_fish_reel", path: "res/Image/sprites/anim/rabbit_fish_reel_sheet.png?v=1" },
      { key: "ui-skin-shop-land", path: "res/Image/ui/ui-skin-shop-land.png" },
      { key: "ui-skin-shop-port", path: "res/Image/ui/ui-skin-shop-port.png" },
      { key: "ui-skin-coconut-land", path: "res/Image/ui/ui-skin-coconut-land.png" },
      { key: "ui-skin-coconut-port", path: "res/Image/ui/ui-skin-coconut-port.png" },
      { key: "ui-skin-map-land", path: "res/Image/ui/ui-skin-map-land.png" },
      { key: "ui-skin-map-port", path: "res/Image/ui/ui-skin-map-port.png" }
    ],
    uiAssetCatalog: [
      // 竖屏共用顶栏木板条（自 fish-port 抠出，背景透明）
      { key: "ui-hud-chrome-port", path: "res/Image/ui/ui-hud-chrome-port.png?v=3" },
      { key: "btn-wood", path: "res/Image/ui/btn-wood.png" },
      { key: "dialog-settlement-base", path: "res/Image/ui/dialog-settlement-base.png" },
      { key: "dialog-settlement-title", path: "res/Image/ui/dialog-settlement-title.png" },
      { key: "dialog-settlement-btn-long", path: "res/Image/ui/dialog-settlement-btn-long.png" },
      { key: "dialog-settlement-btn-short", path: "res/Image/ui/dialog-settlement-btn-short.png" },
      { key: "dialog-settlement-mid-coconut", path: "res/Image/ui/dialog-settlement-mid-coconut.png" },
      { key: "dialog-settlement-mid-plate", path: "res/Image/ui/dialog-settlement-mid-plate.png" },
      // 旧一体底图保留加载（非结算壳路径），避免其它引用瞬时空档
      { key: "dialog-fish-result", path: "res/Image/ui/dialog-fish-result.png" },
      { key: "dialog-coconut-summary", path: "res/Image/ui/dialog-coconut-summary.png" },
      { key: "dialog-coconut-title", path: "res/Image/ui/dialog-coconut-title.png" },
      { key: "dialog-coconut-btn-long", path: "res/Image/ui/dialog-coconut-btn-long.png" },
      { key: "dialog-coconut-btn-short", path: "res/Image/ui/dialog-coconut-btn-short.png" },
      { key: "dialog-offline", path: "res/Image/ui/dialog-offline.png" },
      { key: "dialog-go-fishing", path: "res/Image/ui/dialog-go-fishing.png" },
      { key: "dialog-inventory", path: "res/Image/ui/dialog-inventory.png" },
      // R0025 新人引导：三弹窗 + 统一按钮底图（主包首屏）
      { key: "dialog-onboard-intro", path: "res/Image/ui/dialog-onboard-intro.png" },
      { key: "dialog-onboard-coconut", path: "res/Image/ui/dialog-onboard-coconut.png" },
      { key: "dialog-onboard-end", path: "res/Image/ui/dialog-onboard-end.png" },
      { key: "ui-guide-btn", path: "res/Image/ui/ui-guide-btn.png" },
      { key: "order-bubble", path: "res/Image/ui/order-bubble.png?v=3" },
      { key: "order-bubble-skin-land", path: "res/Image/ui/order-bubble-skin-land.png?v=1" },
      { key: "e1-fish-icons", path: "res/Image/e1_fish_icons.png?v=3" },
      { key: "e3-coconuts", path: "res/Image/e3_coconuts.png?v=3" },
      { key: "e4-grilled-fish", path: "res/Image/e4_grilled_fish.png?v=2" },
      { key: "grill_lv1", path: "res/Image/sprites/grill_lv1.png" },
      { key: "grill_lv2", path: "res/Image/sprites/grill_lv2.png" },
      { key: "grill_lv3", path: "res/Image/sprites/grill_lv3.png" },
      { key: "grill_lv4", path: "res/Image/sprites/grill_lv4.png" },
      { key: "hero_rabbit_grill", path: "res/Image/sprites/hero_rabbit_grill.png" },
      { key: "anim_rabbit_grill_cook", path: "res/Image/sprites/anim/grill_lv1_cook_sheet.png" },
      { key: "anim_grill_lv1_cook", path: "res/Image/sprites/anim/grill_lv1_cook_sheet.png" },
      { key: "anim_grill_lv2_cook", path: "res/Image/sprites/anim/grill_lv2_cook_sheet.png" },
      { key: "anim_grill_lv3_cook", path: "res/Image/sprites/anim/grill_lv3_cook_sheet.png" },
      { key: "anim_grill_lv4_cook", path: "res/Image/sprites/anim/grill_lv4_cook_sheet.png" },
      { key: "anim_rabbit_grill_ignite", path: "res/Image/sprites/anim/rabbit_grill_ignite_sheet.png" },
      { key: "anim_rabbit_grill_flip", path: "res/Image/sprites/anim/rabbit_grill_flip_sheet.png" },
      { key: "anim_rabbit_put_tools", path: "res/Image/sprites/anim/rabbit_put_tools_sheet.png?v=2" },
      { key: "anim_rabbit_juice_walk", path: "res/Image/sprites/anim/rabbit_juice_walk_sheet.png?v=2" },
      { key: "anim_rabbit_juice_crack", path: "res/Image/sprites/anim/rabbit_juice_crack_sheet.png?v=3" },
      { key: "anim_rabbit_juice_straw", path: "res/Image/sprites/anim/rabbit_juice_straw_sheet.png?v=3" },
      { key: "anim_customer_bear_walk", path: "res/Image/sprites/anim/customer_bear_walk_sheet.png" },
      { key: "anim_customer_penguin_walk", path: "res/Image/sprites/anim/customer_penguin_walk_sheet.png" },
      { key: "anim_customer_fox_walk", path: "res/Image/sprites/anim/customer_fox_walk_sheet.png" },
      { key: "anim_customer_pig_walk", path: "res/Image/sprites/anim/customer_pig_walk_sheet.png" },
      { key: "anim_customer_bear_wait", path: "res/Image/sprites/anim/customer_bear_wait_sheet.png" },
      { key: "anim_customer_penguin_wait", path: "res/Image/sprites/anim/customer_penguin_wait_sheet.png" },
      { key: "anim_customer_fox_wait", path: "res/Image/sprites/anim/customer_fox_wait_sheet.png" },
      { key: "anim_customer_pig_wait", path: "res/Image/sprites/anim/customer_pig_wait_sheet.png" },
      { key: "hero_rabbit_fish", path: "res/Image/sprites/hero_rabbit_fish.png" },
      { key: "fish_raw_small", path: "res/Image/sprites/fish_raw_small.png" },
      { key: "fish_raw_salmon", path: "res/Image/sprites/fish_raw_salmon.png" },
      { key: "fish_raw_tuna", path: "res/Image/sprites/fish_raw_tuna.png" },
      { key: "fish_raw_golden", path: "res/Image/sprites/fish_raw_golden.png" },
      { key: "customer_bear_blue", path: "res/Image/sprites/customer_bear_blue.png" },
      { key: "customer_bear_cream", path: "res/Image/sprites/customer_bear_cream.png" },
      { key: "customer_pig", path: "res/Image/sprites/customer_pig.png" },
      { key: "customer_penguin", path: "res/Image/sprites/customer_penguin.png" },
      { key: "customer_fox", path: "res/Image/sprites/customer_fox.png" },
      { key: "grilled_small", path: "res/Image/sprites/grilled_small.png" },
      { key: "grilled_salmon", path: "res/Image/sprites/grilled_salmon.png" },
      { key: "grilled_tuna", path: "res/Image/sprites/grilled_tuna.png" },
      { key: "grilled_golden", path: "res/Image/sprites/grilled_golden.png" },
      { key: "coconut_green", path: "res/Image/sprites/coconut_green.png" },
      { key: "coconut_green_juiced", path: "res/Image/sprites/coconut_green_juiced.png" },
      { key: "coconut_tree", path: "res/Image/sprites/coconut_tree.png?v=2" },
      { key: "coconut_basket_big", path: "res/Image/sprites/coconut_basket_big.png" },
      { key: "coconut_basket_small", path: "res/Image/sprites/coconut_basket_small.png" }
    ],

    scenes: {},
    sceneAspect: {},
    sceneLoading: {},
    sceneFailed: {},
    /** R0010 C1：sea-mask CPU 像素缓存，供海界采样（与 GPU 纹理同源） */
    seaMaskCpu: {},
    artOn: false,
    missingShopSprites: {},
    uiSkinChrome: false,
    artShiftX: 0,
    artShiftY: 0,
    /** R0008 C0：URL 调试参数，默认全关，不污染线上 */
    seaDebugMode: "",
    seaDebugT: null,
    seaUiMode: "", // "" | "off" | "baked"
    /** R0014 C3：?sea=static 跳过动态海，只露 seaflat */
    seaRenderMode: "",
    /** R0015 C4：?foam=0 关闭拍岸/波峰碎沫 */
    seaFoamMode: "",
    _seaDebugParsed: false,

    parseSeaDebugParams: function () {
      if (this._seaDebugParsed) return;
      this._seaDebugParsed = true;
      try {
        var q = new URLSearchParams(window.location.search || "");
        this.seaDebugMode = q.get("seaDebug") || "";
        var t = q.get("seaT");
        this.seaDebugT = t != null && t !== "" ? parseFloat(t) : null;
        this.seaUiMode = q.get("ui") || "";
        this.seaRenderMode = q.get("sea") || "";
        this.seaFoamMode = q.get("foam") || "";
        if (this.seaDebugMode || this.seaUiMode || this.seaDebugT != null || this.seaRenderMode || this.seaFoamMode) {
          console.log(
            "[FishAnim] R0008 seaDebug",
            this.seaDebugMode || "off",
            "seaT",
            this.seaDebugT,
            "ui",
            this.seaUiMode || "default",
            "sea",
            this.seaRenderMode || "dynamic",
            "foam",
            this.seaFoamMode === "0" ? "off" : "on"
          );
        }
      } catch (e) {
        this.seaDebugMode = "";
        this.seaDebugT = null;
        this.seaUiMode = "";
        this.seaRenderMode = "";
        this.seaFoamMode = "";
      }
    },

    fishingUiChromeKey: function () {
      return this.portrait ? "ui-chrome-port" : "ui-chrome-land";
    },

    /**
     * 钓鱼底板：
     * R0008：浅滩/礁石/深海用 seaflat/deepflat（海域由 sea-mask + GLSL；UI 已拆到 ui-chrome）。
     * 旧一体皮会把船烤进图里；noboat 有绿罩，均停用。
     */
    fishingBaseKey: function () {
      var spot = (AIGCUtils.Collection && AIGCUtils.Collection.spotId) || "shallow";
      var deep = spot === "deep";
      var key = this.portrait
        ? (deep ? "ui-skin-fish-port-deepflat" : "ui-skin-fish-port-seaflat")
        : (deep ? "ui-skin-fish-land-deepflat" : "ui-skin-fish-land-seaflat");
      if (this.scenes[key] || this.sceneLoading[key] || !this.sceneFailed[key]) return key;
      return this.portrait ? "ui-skin-fish-port" : "ui-skin-fish-land";
    },

    /**
     * R0020：横屏浅滩用整屏海域 GIF（含船+静坐兔+UI 皮）。
     * 深海/竖屏仍走着色器海 + 分层船兔。
     */
    fishingUsesLandSeaGif: function () {
      if (this.portrait) return false;
      var deep = ((AIGCUtils.Collection && AIGCUtils.Collection.spotId) || "shallow") === "deep";
      return !deep;
    },

    fishingLandSeaGifKey: function () {
      return "anim_fish_sea_gif_land_0";
    },

    /** GIF 内静坐兔脚底（设计坐标 960×540；舱内坐垫，近舷条带遮脚） */
    fishingLandSeaGifRabbitSeat: function () {
      return { x: 235, y: 248, h: 80 };
    },

    /** 横屏 GIF 船右侧开阔海：游鱼不得进入船身及其左侧 */
    fishingLandSeaGifFishMinX: function () {
      return 420;
    },

    /**
     * 与 paintLandSeaGifBackdrop / 兔摇摆共用一整圈时长（毫秒）。
     * 手动调这个即可：越小越快，越大越慢。参考：2000偏快 / 3000适中 / 4000偏慢；原片≈4480。
     */
    fishingLandSeaGifPeriodMs: 3000,
    fishingLandSeaGifFrameCount: 16,

    fishingLandSeaGifClock: function (now) {
      var n = this.fishingLandSeaGifFrameCount || 16;
      var periodMs = this.fishingLandSeaGifPeriodMs || 4000;
      var t = now || Date.now();
      var cycle = (t % periodMs) / periodMs;
      var ft = cycle * n;
      var f0 = Math.floor(ft) % n;
      var f1 = (f0 + 1) % n;
      var frac = ft - Math.floor(ft);
      return { periodMs: periodMs, n: n, cycle: cycle, frameT: ft, f0: f0, f1: f1, frac: frac };
    },

    /**
     * R0020g：兔与 GIF 同慢速时钟；一整圈一次柔和起伏（跟底图船浪观感），
     * 不再跟发跳的灯笼逐帧表（会显得更快、更不一致）。
     */
    fishingLandSeaGifSurf: function (now) {
      var clk = this.fishingLandSeaGifClock(now);
      var phase = clk.cycle * Math.PI * 2;
      // 第 0 帧 bobY=0；符号取反，与 GIF 船初始起伏同向
      var bobY = Math.sin(phase) * -4.5;
      var bobRot = Math.cos(phase) * -0.018;
      return {
        bobY: bobY,
        bobRot: bobRot,
        phase: phase,
        cycle: clk.cycle,
        frameT: clk.frameT,
        frameCount: clk.n,
        periodMs: clk.periodMs
      };
    },

    /**
     * R0006/R0007：只有真·无烤船底板才画船精灵，否则必双船。
     * 像素核对：seabase/deepbase 无船；一体皮/noboat 有烤船（noboat 还有绿罩，已停用）。
     */
    fishingBaseHasBakedBoat: function (key) {
      var k = key || this.backdropKey("fishing") || this.fishingBaseKey();
      if (!k) return true;
      if (k.indexOf("seaflat") >= 0 || k.indexOf("deepflat") >= 0) return false;
      if (k.indexOf("seabase") >= 0 || k.indexOf("deepbase") >= 0) return false;
      return true;
    },

    /** @deprecated 旧风景浪；运行时用 swell/crash */
    fishingWaveSheetKey: function () {
      return this.fishingCrashSheetKey();
    },

    fishingSwellSheetKey: function () {
      return this.portrait ? "anim_sea_swell_port" : "anim_sea_swell_land";
    },

    fishingCrashSheetKey: function () {
      return this.portrait ? "anim_sea_crash_port" : "anim_sea_crash_land";
    },

    fishingSeaMaskKey: function () {
      var deep = ((AIGCUtils.Collection && AIGCUtils.Collection.spotId) || "shallow") === "deep";
      if (this.portrait) return deep ? "sea-mask-deep-port" : "sea-mask-port";
      return deep ? "sea-mask-deep-land" : "sea-mask-land";
    },

    /** R0015：岸距/水深 meta，与 mask 同组 */
    fishingSeaMetaKey: function () {
      var deep = ((AIGCUtils.Collection && AIGCUtils.Collection.spotId) || "shallow") === "deep";
      if (this.portrait) return deep ? "sea-meta-deep-port" : "sea-meta-port";
      return deep ? "sea-meta-deep-land" : "sea-meta-land";
    },

    // 当前区域优先等待的皮肤/底板 key（用于首屏门闸，避免闪旧矢量层）
    preferredUiSkinKey: function (area) {
      if (area === "fishing") return this.fishingBaseKey();
      if (area === "coconut") return this.portrait ? "ui-skin-coconut-port" : "ui-skin-coconut-land";
      if (area === "shop") return this.portrait ? "ui-skin-shop-port" : "ui-skin-shop-land";
      if (area === "build") return this.portrait ? "shop-port" : "build-land";
      return this.portrait ? "ui-skin-map-port" : "ui-skin-map-land";
    },

    /**
     * R0037：当前区「必需包」key 列表（齐了才进玩法；失败也算 settled 防卡死）
     */
    bootAssetKeys: function (area) {
      var keys = [];
      var add = function (k) {
        if (k && keys.indexOf(k) < 0) keys.push(k);
      };
      area = area || "map";
      // R0039：离线「欢迎回来」/解锁窗依赖结算壳，进区前一并纳入必需包
      if (
        AIGCUtils.Game &&
        (AIGCUtils.Game.offlineDialog ||
          AIGCUtils.Game.offlinePrompt ||
          (AIGCUtils.GameState && AIGCUtils.GameState.pendingOffline))
      ) {
        add("dialog-settlement-base");
        add("dialog-settlement-title");
        add("dialog-settlement-btn-long");
        add("dialog-settlement-btn-short");
      }
      if (area === "map") {
        add(this.portrait ? "ui-skin-map-port" : "ui-skin-map-land");
        add("btn-wood");
        if (AIGCUtils.Onboarding && AIGCUtils.Onboarding.isActive && AIGCUtils.Onboarding.isActive()) {
          add("dialog-onboard-intro");
          add("dialog-onboard-coconut");
          add("dialog-onboard-end");
          add("ui-guide-btn");
        }
      } else if (area === "coconut") {
        add(this.portrait ? "ui-skin-coconut-port" : "ui-skin-coconut-land");
        add("coconut_tree");
        add("coconut_basket_big");
        add("coconut_basket_small");
        add("coconut_green");
        add("btn-wood");
        if (this.portrait) add("ui-hud-chrome-port");
      } else if (area === "fishing") {
        add(this.fishingBaseKey());
        add(this.fishingUiChromeKey());
        add(this.fishingSeaMaskKey());
        add(this.fishingSeaMetaKey());
        add("hero_rabbit_fish");
        add("btn-wood");
        if (this.fishingUsesLandSeaGif()) {
          add("anim_fish_sea_gif_land_0");
          add("anim_fish_sea_gif_land_1");
          add("anim_fish_sea_gif_land_2");
          add("anim_fish_sea_gif_land_3");
        } else {
          var fishBase = this.fishingBaseKey();
          if (!this.fishingBaseHasBakedBoat(fishBase)) {
            add(this.portrait ? "boat_fish_port" : "boat_fish_land");
          }
        }
      } else if (area === "shop") {
        add(this.portrait ? "ui-skin-shop-port" : "ui-skin-shop-land");
        add("hero_rabbit_grill");
        add("grill_lv1");
        add("btn-wood");
        add("order-bubble");
        if (!this.portrait) add("order-bubble-skin-land");
        if (this.portrait) add("ui-hud-chrome-port");
      } else if (area === "build") {
        add(this.portrait ? "shop-port" : "build-land");
      } else {
        add(this.preferredUiSkinKey(area));
      }
      return keys;
    },

    catalogHasKey: function (key) {
      if (!key) return false;
      var lists = [this.uiSkinCatalog, this.uiAssetCatalog, this.sceneCatalog];
      for (var li = 0; li < lists.length; li++) {
        var list = lists[li] || [];
        for (var i = 0; i < list.length; i++) {
          if (list[i].key === key) return true;
        }
      }
      return false;
    },

    /** 成功、失败、或不在目录（无法加载）都算 settled */
    isAssetSettled: function (key) {
      if (!key) return true;
      if (this.scenes[key] || this.sceneFailed[key]) return true;
      if (!this.catalogHasKey(key)) return true;
      return false;
    },

    isAreaArtReady: function (area) {
      var keys = this.bootAssetKeys(area || "map");
      for (var i = 0; i < keys.length; i++) {
        if (!this.isAssetSettled(keys[i])) return false;
      }
      return true;
    },

    /** R0037：字帖 + 当前区必需包齐（或失败放行）才进玩法 */
    isBootReady: function (area) {
      if (!this.fontReady) return false;
      return this.isAreaArtReady(area || (AIGCUtils.Game && AIGCUtils.Game.currentArea) || "map");
    },

    getBootProgress: function (area) {
      area = area || (AIGCUtils.Game && AIGCUtils.Game.currentArea) || "map";
      var keys = this.bootAssetKeys(area);
      var done = this.fontReady ? 1 : 0;
      var total = keys.length + 1;
      for (var i = 0; i < keys.length; i++) {
        if (this.isAssetSettled(keys[i])) done++;
      }
      return { done: done, total: total, pct: total ? Math.floor((done / total) * 100) : 100 };
    },

    syncBootLoadingDom: function (ready, progress) {
      // R0013：DOM 只允许出现在 H5 预览入口 index.html，玩法侧仅调用可选适配器
      var overlay = AIGCUtils.BootOverlay;
      if (overlay && overlay.sync) overlay.sync(ready, progress);
    },

    // 兼容旧名：改为走必需包门闸
    isCriticalArtReady: function (area) {
      return this.isBootReady(area);
    },

    /** R0013：横屏首屏跳过竖屏专用项；切竖屏时再由缺图分支触发 loadScenes */
    isPortraitOnlyCatalogItem: function (item) {
      var key = (item && item.key) || "";
      return key.indexOf("-port") >= 0 || key.indexOf("_port") >= 0;
    },

    loadScenes: function () {
      if (typeof KwaiMedia === "undefined" || !KwaiMedia.Image) {
        console.error("[Prototype] Scene art loader unavailable");
        return;
      }
      var renderer = this;
      var area =
        AIGCUtils.Game && AIGCUtils.Game.currentArea
          ? AIGCUtils.Game.currentArea
          : "map";
      // 优先：全屏皮肤 → UI 控件 → 场景 JPG
      var catalog = (this.uiSkinCatalog || [])
        .concat(this.uiAssetCatalog || [])
        .concat(this.sceneCatalog);
      // R0013：横屏只入队横屏+共用资源，避免竖屏大图抢首屏与显存
      if (!this.portrait) {
        var landOnly = [];
        var skippedPort = 0;
        for (var si = 0; si < catalog.length; si++) {
          if (this.isPortraitOnlyCatalogItem(catalog[si])) {
            skippedPort++;
            continue;
          }
          landOnly.push(catalog[si]);
        }
        if (skippedPort && this._loadScenesSkipPortLog !== skippedPort) {
          this._loadScenesSkipPortLog = skippedPort;
          console.log("[Prototype] R0013 landscape skip portrait assets", skippedPort);
        }
        catalog = landOnly;
      }
      // R0037：必需包优先；未齐前只下必需包，齐了再下其余（两阶段）
      var preferKeys = this.bootAssetKeys(area);
      var areaArtReady = this.isAreaArtReady(area);
      if (preferKeys.length) {
        var picked = [];
        var rest = [];
        var seen = {};
        for (var pk = 0; pk < preferKeys.length; pk++) {
          for (var ci = 0; ci < catalog.length; ci++) {
            if (catalog[ci].key === preferKeys[pk] && !seen[catalog[ci].key]) {
              picked.push(catalog[ci]);
              seen[catalog[ci].key] = true;
              break;
            }
          }
        }
        for (var cj = 0; cj < catalog.length; cj++) {
          if (!seen[catalog[cj].key]) rest.push(catalog[cj]);
        }
        catalog = areaArtReady ? picked.concat(rest) : picked;
        if (!areaArtReady && this._bootPhaseLog !== area) {
          this._bootPhaseLog = area;
          console.log("[Boot] R0037 phase1 boot-only", area, preferKeys.length);
        }
        if (areaArtReady && this._bootPhase2Log !== area) {
          this._bootPhase2Log = area;
          console.log("[Boot] R0037 phase2 rest catalog", area, rest.length);
        }
      }
      catalog.forEach(function (item) {
        if (renderer.scenes[item.key] || renderer.sceneLoading[item.key] || renderer.sceneFailed[item.key]) return;
        renderer.sceneLoading[item.key] = true;
        var cleanPath = String(item.path || "").split("?")[0];
        KwaiMedia.Image.load(item.path).then(function (image) {
          var gl = renderer.gl;
          var texture = gl.createTexture();
          gl.bindTexture(gl.TEXTURE_2D, texture);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
          renderer.scenes[item.key] = texture;
          renderer.sceneAspect[item.key] = image.width / image.height;
          // C1：海面蒙版额外缓存 CPU 像素，供鱼/泡沫/水线查询（半分辨率也够用）
          if (item.key.indexOf("sea-mask") === 0) {
            try {
              var maskW = image.width;
              var maskH = image.height;
              var maskFbo = gl.createFramebuffer();
              gl.bindFramebuffer(gl.FRAMEBUFFER, maskFbo);
              gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
              var rawPixels = new Uint8Array(maskW * maskH * 4);
              gl.readPixels(0, 0, maskW, maskH, gl.RGBA, gl.UNSIGNED_BYTE, rawPixels);
              gl.bindFramebuffer(gl.FRAMEBUFFER, null);
              gl.deleteFramebuffer(maskFbo);
              // readPixels 原点在左下，翻转成与 2D 画布一致的上到下顺序
              var maskPixels = new Uint8Array(maskW * maskH * 4);
              var rowBytes = maskW * 4;
              for (var my = 0; my < maskH; my++) {
                var srcOff = (maskH - 1 - my) * rowBytes;
                maskPixels.set(rawPixels.subarray(srcOff, srcOff + rowBytes), my * rowBytes);
              }
              renderer.seaMaskCpu[item.key] = {
                w: maskW,
                h: maskH,
                data: maskPixels
              };
              console.log("[FishAnim] R0011 sea-mask CPU cached", item.key, maskW, maskH);
            } catch (cpuErr) {
              console.warn("[FishAnim] R0011 sea-mask CPU cache failed", item.key, cpuErr);
            }
          }
          renderer.sceneLoading[item.key] = false;
          console.log("[Prototype] Scene art ready", item.key, image.width, image.height);
        }).catch(function (error) {
          renderer.sceneLoading[item.key] = false;
          renderer.sceneFailed[item.key] = true;
          console.error("[Prototype] Scene art failed", item.key, "path", item.path, "clean", cleanPath, error);
        });
      });
    },

    ensureDummyTexture: function () {
      if (this.dummyTexture) return this.dummyTexture;
      var gl = this.gl;
      var texture = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([255, 255, 255, 255]));
      this.dummyTexture = texture;
      return texture;
    },

    useTexture: function (texture) {
      var next = texture || this.fontTexture || this.ensureDummyTexture();
      if (this.boundTexture === next) return;
      this.flush();
      this.boundTexture = next;
    },

    flush: function () {
      if (!this.vertices.length || !this.gl) return;
      var gl = this.gl;
      gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.boundTexture || this.fontTexture || this.ensureDummyTexture());
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(this.vertices), gl.DYNAMIC_DRAW);
      gl.drawArrays(gl.TRIANGLES, 0, this.vertices.length / 9);
      this.vertices = [];
    },

    sceneKey: function (base) {
      return this.portrait ? base + "-port" : base + "-land";
    },

    backdropKey: function (area) {
      // R0037：UI 皮未失败前不回退旧 scene JPG，避免闪残缺旧底
      if (area === "map") {
        var night = AIGCUtils.DayCycle && AIGCUtils.DayCycle.state === "night" && this.scenes.night;
        if (night) return "night";
        var mapUi = this.portrait ? "ui-skin-map-port" : "ui-skin-map-land";
        if (this.scenes[mapUi]) return mapUi;
        if (!this.sceneFailed[mapUi]) return mapUi;
        return this.sceneKey("map");
      }
      if (area === "fishing") {
        var fishBase = this.fishingBaseKey();
        if (this.scenes[fishBase] || !this.sceneFailed[fishBase]) return fishBase;
        var fishUi = this.portrait ? "ui-skin-fish-port" : "ui-skin-fish-land";
        if (this.scenes[fishUi] || !this.sceneFailed[fishUi]) return fishUi;
        return this.sceneKey("fish");
      }
      if (area === "coconut") {
        var cocoUi = this.portrait ? "ui-skin-coconut-port" : "ui-skin-coconut-land";
        if (this.scenes[cocoUi] || !this.sceneFailed[cocoUi]) return cocoUi;
        return this.sceneKey("coconut");
      }
      if (area === "shop") {
        var shopUi = this.portrait ? "ui-skin-shop-port" : "ui-skin-shop-land";
        if (this.scenes[shopUi] || !this.sceneFailed[shopUi]) return shopUi;
        return this.sceneKey("shop");
      }
      if (area === "build") return this.portrait ? "shop-port" : "build-land";
      return null;
    },

    paintScene: function (key, x, y, width, height, dx, dy) {
      var texture = this.scenes[key];
      if (!texture) return false;
      this.useTexture(texture);
      var aspect = this.sceneAspect[key] || (width / height);
      var rectAspect = width / height;
      var u0 = 0, v0 = 0, u1 = 1, v1 = 1;
      if (aspect > rectAspect) {
        var showU = rectAspect / aspect;
        var padU = (1 - showU) / 2;
        u0 = padU;
        u1 = 1 - padU;
      } else {
        var showV = aspect / rectAspect;
        var padV = (1 - showV) / 2;
        v0 = padV;
        v1 = 1 - padV;
      }
      var shiftX = dx || 0;
      var shiftY = dy || 0;
      var white = [1, 1, 1, 1];
      this.vertex(x + shiftX, y + shiftY, white, u0, v0, 2);
      this.vertex(x + width + shiftX, y + shiftY, white, u1, v0, 2);
      this.vertex(x + shiftX, y + height + shiftY, white, u0, v1, 2);
      this.vertex(x + width + shiftX, y + shiftY, white, u1, v0, 2);
      this.vertex(x + width + shiftX, y + height + shiftY, white, u1, v1, 2);
      this.vertex(x + shiftX, y + height + shiftY, white, u0, v1, 2);
      return true;
    },

    paintUiStretch: function (key, x, y, width, height) {
      return this.paintUiRegion(key, x, y, width, height, 0, 0, 1, 1);
    },

    // 全结算弹窗共用 layout；底图像素 1626x1182，绘制与点击都读这里
    // variant: "fish" 时把长框下移，躲开中部圆盘（钓鱼区弹窗）
    getSettlementLayout: function (hw, hh, variant) {
      var dlgW = Math.min(520, Math.max(280, this.width - 40));
      var dlgH = Math.round(dlgW * 1182 / 1626);
      var dlgX = hw - Math.round(dlgW / 2);
      var dlgY = hh - Math.round(dlgH / 2);
      var longW = Math.round(dlgW * 0.72);
      var longH = Math.round(longW * 91 / 760);
      var shortW = Math.round(dlgW * 0.34);
      var shortH = Math.round(shortW * 112 / 371);
      var titleW = Math.round(dlgW * 586 / 1626);
      var titleH = Math.round(titleW * 168 / 586);
      var longX = dlgX + Math.round((dlgW - longW) / 2);
      var isFish = variant === "fish";
      // 默认长框偏上避开短框；钓鱼区长框再下移避开圆盘
      var long1Y = dlgY + Math.round(dlgH * (isFish ? 0.58 : 0.48));
      var long2Y = long1Y + longH + Math.round(dlgH * 0.014);
      var shortGap = Math.round(dlgW * 0.04);
      var shortPairW = shortW * 2 + shortGap;
      var shortLeftX = dlgX + Math.round((dlgW - shortPairW) / 2);
      var shortRightX = shortLeftX + shortW + shortGap;
      var shortY = dlgY + Math.round(dlgH * (isFish ? 0.86 : 0.82));
      var titleX = dlgX + Math.round((dlgW - titleW) / 2);
      var titleY = dlgY - Math.round(titleH * 0.3);
      var midW = Math.round(dlgW * 0.56);
      var midH = Math.round(midW * 958 / 1608);
      var midMaxH = Math.round(dlgH * 0.34);
      if (midH > midMaxH) {
        midH = midMaxH;
        midW = Math.round(midH * 1608 / 958);
      }
      var midX = dlgX + Math.round((dlgW - midW) / 2);
      var midY = dlgY + Math.round(dlgH * 0.14);
      var plateW = Math.round(dlgW * 0.3);
      var plateH = Math.round(plateW * 388 / 404);
      var plateX = dlgX + Math.round((dlgW - plateW) / 2);
      var plateY = dlgY + Math.round(dlgH * 0.16);
      return {
        dlgX: dlgX,
        dlgY: dlgY,
        dlgW: dlgW,
        dlgH: dlgH,
        title: { x: titleX, y: titleY, w: titleW, h: titleH },
        mid: { x: midX, y: midY, w: midW, h: midH },
        plate: { x: plateX, y: plateY, w: plateW, h: plateH },
        long1: { x: longX, y: long1Y, w: longW, h: longH },
        long2: { x: longX, y: long2Y, w: longW, h: longH },
        shortL: { x: shortLeftX, y: shortY, w: shortW, h: shortH },
        shortR: { x: shortRightX, y: shortY, w: shortW, h: shortH }
      };
    },

    // 兼容旧椰子结算调用名
    getCoconutSummaryLayout: function (hw, hh) {
      return this.getSettlementLayout(hw, hh);
    },

    // 按短框数量生成 1/2/3 个水平居中的点击与绘制矩形
    getSettlementShortBoxes: function (layout, count) {
      var n = count || 0;
      if (n <= 0) return [];
      if (n === 1) {
        return [
          {
            x: layout.dlgX + Math.round((layout.dlgW - layout.shortL.w) / 2),
            y: layout.shortL.y,
            w: layout.shortL.w,
            h: layout.shortL.h
          }
        ];
      }
      if (n === 2) return [layout.shortL, layout.shortR];
      var w = Math.round(layout.dlgW * 0.28);
      var h = Math.round(w * 112 / 371);
      var gap = Math.round(layout.dlgW * 0.03);
      var total = w * 3 + gap * 2;
      var x0 = layout.dlgX + Math.round((layout.dlgW - total) / 2);
      var y = layout.shortL.y;
      return [
        { x: x0, y: y, w: w, h: h },
        { x: x0 + w + gap, y: y, w: w, h: h },
        { x: x0 + (w + gap) * 2, y: y, w: w, h: h }
      ];
    },

    // 先画 UI 框图，成功后再把文案水平垂直居中填进框内；失败返回 false 由调用方兜底
    paintLabeledUiFrame: function (frameKey, box, label, fontSize, ink) {
      var painted = this.paintUiStretch(frameKey, box.x, box.y, box.w, box.h);
      if (!painted) return false;
      this.flush();
      var size = fontSize || 17;
      var color = ink || C.dialogInk;
      this.text(label, box.x + box.w / 2, this.textYInBox(label, size, box.y, box.h), size, color, "center");
      return true;
    },

    // 蒙层 + 共用底图 + 顶部木牌标题
    // options.titleBold / titleInk 只给需要加粗深棕标题的弹窗，缺省 dialogInk
    paintSettlementShell: function (layout, titleText, options) {
      var W = this.width;
      var H = this.height;
      var hw = layout.dlgX + Math.round(layout.dlgW / 2);
      var opts = options || {};
      var titleInk = opts.titleInk || C.dialogInk;
      this.rect(0, 0, W, H, C.overlay);
      if (!this.paintUiStretch("dialog-settlement-base", layout.dlgX, layout.dlgY, layout.dlgW, layout.dlgH)) {
        this.rect(layout.dlgX, layout.dlgY, layout.dlgW, layout.dlgH, C.cream);
      }
      if (opts.titleBold) {
        var titleBox = layout.title;
        var titleSize = opts.titleSize || 22;
        if (this.paintUiStretch("dialog-settlement-title", titleBox.x, titleBox.y, titleBox.w, titleBox.h)) {
          this.flush();
          var titleY = this.textYInBox(titleText, titleSize, titleBox.y, titleBox.h);
          var titleX = titleBox.x + titleBox.w / 2;
          this.text(titleText, titleX - 0.6, titleY, titleSize, titleInk, "center");
          this.text(titleText, titleX + 0.6, titleY, titleSize, titleInk, "center");
        } else {
          this.text(titleText, hw - 0.6, layout.dlgY + 28, 26, titleInk, "center");
          this.text(titleText, hw + 0.6, layout.dlgY + 28, 26, titleInk, "center");
        }
      } else if (!this.paintLabeledUiFrame("dialog-settlement-title", layout.title, titleText, 22, titleInk)) {
        this.text(titleText, hw, layout.dlgY + 28, 26, titleInk, "center");
      }
      return layout;
    },

    // 长框文案列表（最多两行）。fontSize 缺省 17，避免其它弹窗字号变化
    paintSettlementLongs: function (layout, labels, fontSize) {
      var list = labels || [];
      var boxes = [layout.long1, layout.long2];
      var hw = layout.dlgX + Math.round(layout.dlgW / 2);
      var size = fontSize || 17;
      var hasLong = !!this.scenes["dialog-settlement-btn-long"];
      for (var i = 0; i < list.length && i < boxes.length; i++) {
        if (!list[i]) continue;
        if (hasLong) {
          this.paintLabeledUiFrame("dialog-settlement-btn-long", boxes[i], list[i], size, C.dialogInk);
        } else {
          this.text(list[i], hw, boxes[i].y + Math.round(boxes[i].h / 2) - 8, size, C.dialogInk, "center");
        }
      }
    },

    // 短框按钮列表：[{ label, active }]
    paintSettlementShorts: function (layout, buttons) {
      var list = buttons || [];
      var boxes = this.getSettlementShortBoxes(layout, list.length);
      var hasShort = !!this.scenes["dialog-settlement-btn-short"];
      for (var i = 0; i < list.length; i++) {
        var box = boxes[i];
        if (!box || !list[i] || !list[i].label) continue;
        if (hasShort) {
          this.paintLabeledUiFrame("dialog-settlement-btn-short", box, list[i].label, 16, C.dialogInk);
        } else {
          this.button(box.x, box.y, box.w, box.h, list[i].label, !!list[i].active);
        }
      }
      return boxes;
    },

    paintUiRegion: function (key, x, y, width, height, u0, v0, u1, v1, tint, mode) {
      var texture = this.scenes[key];
      if (!texture) return false;
      this.useTexture(texture);
      var color = tint || [1, 1, 1, 1];
      var textured = mode || 2;
      this.vertex(x, y, color, u0, v0, textured);
      this.vertex(x + width, y, color, u1, v0, textured);
      this.vertex(x, y + height, color, u0, v1, textured);
      this.vertex(x + width, y, color, u1, v0, textured);
      this.vertex(x + width, y + height, color, u1, v1, textured);
      this.vertex(x, y + height, color, u0, v1, textured);
      return true;
    },

    drawOrderRow: function (cx, centerY, lineSize, label, iconSize, drawIcon, ink) {
      var tw = this.textWidth(label, lineSize);
      var gap = 5;
      var total = iconSize + gap + tw;
      var left = Math.round(cx - total / 2);
      var iconCx = left + Math.round(iconSize / 2);
      var textX = left + iconSize + gap;
      drawIcon(iconCx, centerY);
      this.text(label, textX, this.textYInBox(label, lineSize, centerY - lineSize, lineSize + 6), lineSize, ink || C.ink, "left");
    },

    paintCoconutIcon: function (variant, cx, cy, size) {
      var key = variant || "juice";
      if (!this.scenes["e3-coconuts"] && !this.sceneLoading["e3-coconuts"]) this.loadScenes();
      var grid = {
        green: [0, 0, 0.5, 0.5],
        golden: [0.5, 0, 1, 0.5],
        green_juiced: [0, 0.5, 0.5, 1],
        golden_juiced: [0.5, 0.5, 1, 1],
        juice: [0, 0.5, 0.5, 1],
        order: [0, 0.5, 0.5, 1]
      };
      var uv = grid[key] || grid.juice;
      if (
        this.paintUiRegion("e3-coconuts", cx - size / 2, cy - size / 2, size, size, uv[0], uv[1], uv[2], uv[3])
      ) {
        this.flush();
        return true;
      }
      if (this.uiSkinChrome) return false;
      this.juice(cx, cy, size * 0.85, true);
      return false;
    },

    paintFishIcon: function (speciesId, cx, cy, size, tint) {
      var id = AIGCUtils.Recipes.normalizeSpeciesId(speciesId);
      if (!this.scenes["e1-fish-icons"] && !this.sceneLoading["e1-fish-icons"]) this.loadScenes();
      var grid = {
        small: [0, 0, 0.5, 0.5],
        salmon: [0.5, 0, 1, 0.5],
        tuna: [0, 0.5, 0.5, 1],
        golden: [0.5, 0.5, 1, 1]
      };
      var uv = grid[id] || grid.small;
      if (this.paintUiRegion("e1-fish-icons", cx - size / 2, cy - size / 2, size, size, uv[0], uv[1], uv[2], uv[3], tint || null)) {
        this.flush();
        return true;
      }
      if (this.uiSkinChrome) return false;
      this.fish(cx, cy, size * 0.45, true, id);
      return false;
    },

    paintGrilledIcon: function (speciesId, cx, cy, size) {
      var id = AIGCUtils.Recipes.normalizeSpeciesId(speciesId);
      if (!this.scenes["e4-grilled-fish"] && !this.sceneLoading["e4-grilled-fish"]) this.loadScenes();
      var grid = {
        small: [0, 0, 0.5, 0.5],
        salmon: [0.5, 0, 1, 0.5],
        tuna: [0, 0.5, 0.5, 1],
        golden: [0.5, 0.5, 1, 1]
      };
      var uv = grid[id] || grid.small;
      if (
        this.paintUiRegion("e4-grilled-fish", cx - size / 2, cy - size / 2, size, size, uv[0], uv[1], uv[2], uv[3])
      ) {
        this.flush();
        return true;
      }
      return this.paintFishIcon(id, cx, cy, size);
    },

    // 横屏钓具：入口在左下「地图」木牌上方，展开面板与点击共用这一套矩形
    fishingGearLandLayout: function () {
      var navTop = this.height - 72;
      var entryH = 40;
      var entry = { x: 20, y: navTop - entryH - 8, w: 188, h: entryH };
      var btnW = 112;
      var btnH = 34;
      var gap = 6;
      var labelH = 20;
      var label = { x: entry.x, y: entry.y - 4 - labelH, w: entry.w, h: labelH };
      var baitY = label.y - gap - btnH;
      var spotY = baitY - gap - btnH;
      var x0 = entry.x;
      function col(index) { return x0 + index * (btnW + gap); }
      return {
        entry: entry,
        label: label,
        spots: [
          { id: "shallow", label: "浅滩·木竿", x: col(0), y: spotY, w: btnW, h: btnH },
          { id: "reef", label: "礁石·铁竿", x: col(1), y: spotY, w: btnW, h: btnH },
          { id: "deep", label: "深海·金竿", x: col(2), y: spotY, w: btnW, h: btnH }
        ],
        baits: [
          { id: "worm", label: "蚯蚓", x: col(0), y: baitY, w: btnW, h: btnH },
          { id: "shrimp", label: "虾米", x: col(1), y: baitY, w: btnW, h: btnH },
          { id: "secret", label: "秘制", x: col(2), y: baitY, w: btnW, h: btnH }
        ]
      };
    },

    // 竖屏钓具：入口贴在左下「地图」木牌正上方。宽度与横屏入口相同，才能放下整句文案。点击与绘制共用。
    fishingGearPortLayout: function () {
      var mapX = 20;
      var navTop = this.height - 72;
      var entryH = 40;
      var entry = { x: mapX, y: navTop - entryH - 8, w: 188, h: entryH };
      var btnW = 112;
      var btnH = 34;
      var gap = 6;
      var labelH = 20;
      var label = { x: entry.x, y: entry.y - 4 - labelH, w: entry.w, h: labelH };
      var baitY = label.y - gap - btnH;
      var spotY = baitY - gap - btnH;
      var x0 = entry.x;
      function col(index) { return x0 + index * (btnW + gap); }
      return {
        entry: entry,
        label: label,
        spots: [
          { id: "shallow", label: "浅滩·木竿", x: col(0), y: spotY, w: btnW, h: btnH },
          { id: "reef", label: "礁石·铁竿", x: col(1), y: spotY, w: btnW, h: btnH },
          { id: "deep", label: "深海·金竿", x: col(2), y: spotY, w: btnW, h: btnH }
        ],
        baits: [
          { id: "worm", label: "蚯蚓", x: col(0), y: baitY, w: btnW, h: btnH },
          { id: "shrimp", label: "虾米", x: col(1), y: baitY, w: btnW, h: btnH },
          { id: "secret", label: "秘制", x: col(2), y: baitY, w: btnW, h: btnH }
        ]
      };
    },

    // 竖屏待机抛竿按钮让到入口右侧，避免盖住「选取钓鱼区和鱼饵」
    fishingCastPortButton: function () {
      var entry = this.fishingGearPortLayout().entry;
      return { x: entry.x + entry.w + 8, y: this.height - 72 - 58, w: 240, h: 50 };
    },

    drawWoodSign: function (x, y, w, h, label, active, locked, fontSize) {
      if (!locked) {
        this.button(x, y, w, h, label, !!active, fontSize);
        return;
      }
      var fs = fontSize || (this.uiSkinChrome ? 16 : 17);
      var gray = [0.46, 0.44, 0.4, 1];
      if (this.scenes["btn-wood"]) {
        var pad = this.uiSkinChrome ? Math.max(2, Math.min(6, Math.round(Math.min(w, h) * 0.1))) : 0;
        this.paintUiRegion(
          "btn-wood",
          x + pad,
          y + pad,
          Math.max(1, w - pad * 2),
          Math.max(1, h - pad * 2),
          0, 0, 1, 1,
          [0.78, 0.78, 0.78, 1],
          3
        );
        this.flush();
      } else {
        this.rect(x, y, w, h, [0.55, 0.52, 0.46, 0.92]);
      }
      this.text(label, x + w / 2, this.textYInBox(label, fs, y, h), fs, gray, "center");
    },

    drawFishingGearSigns: function (collection, layout) {
      var entry = layout.entry;
      this.drawWoodSign(
        entry.x,
        entry.y,
        entry.w,
        entry.h,
        collection.fishingDrawerOpen ? "收回" : "选取钓鱼区和鱼饵",
        true,
        false,
        layout.entryFont
      );
      if (!collection.fishingDrawerOpen) return;
      var spotName = collection.spotId === "reef" ? "礁石" : collection.spotId === "deep" ? "深海" : "浅滩";
      var baitName = collection.baitId === "shrimp" ? "虾米" : collection.baitId === "secret" ? "秘制" : "蚯蚓";
      var current = "当前：" + spotName + " " + baitName;
      var label = layout.label;
      this.text(current, label.x + label.w / 2, this.textYInBox(current, 15, label.y, label.h), 15, [0.29, 0.18, 0.11, 1], "center");
      var i;
      for (i = 0; i < layout.spots.length; i++) {
        var spot = layout.spots[i];
        this.drawWoodSign(spot.x, spot.y, spot.w, spot.h, spot.label, collection.spotId === spot.id, !collection.isSpotUnlocked(spot.id));
      }
      for (i = 0; i < layout.baits.length; i++) {
        var bait = layout.baits[i];
        this.drawWoodSign(bait.x, bait.y, bait.w, bait.h, bait.label, collection.baitId === bait.id, !collection.isBaitUnlocked(bait.id));
      }
    },

    drawFishingGearLand: function (collection) {
      this.drawFishingGearSigns(collection, this.fishingGearLandLayout());
    },

    drawFishingGearPort: function (collection) {
      var layout = this.fishingGearPortLayout();
      if (!this._loggedPortGearLayout) {
        this._loggedPortGearLayout = true;
        console.log("[Prototype] Portrait fishing gear entry", layout.entry.x, layout.entry.y, layout.entry.w, layout.entry.h);
      }
      this.drawFishingGearSigns(collection, layout);
    },

    drawFishingGear: function (collection, portrait) {
      if (collection.phase !== "idle") return;
      if (!portrait) {
        this.drawFishingGearLand(collection);
        return;
      }
      this.drawFishingGearPort(collection);
    },

    /**
     * 首次烤鱼引导：FishSpecies 顺序中第一只已解锁且库存>0 的生鱼下标。
     * 已看过引导、正在烤制、或无可烤鱼时返回 -1。
     */
    firstCookableFishIndex: function () {
      var state = AIGCUtils.GameState;
      if (!state || state.grillFishGuideSeen) return -1;
      if (AIGCUtils.Baking && AIGCUtils.Baking.current) return -1;
      var list = AIGCUtils.FishSpecies || [];
      for (var i = 0; i < list.length; i++) {
        var sp = list[i];
        if (this.speciesShopUnlocked(sp.id) && state.getFishCount(sp.id) > 0) return i;
      }
      return -1;
    },

    /** 指向底部生鱼按钮的弹跳箭头（首次引导） */
    drawGrillFishGuideArrow: function (cx, tipY) {
      var bob = Math.sin(Date.now() / 220) * 5;
      var y = tipY + bob;
      this.tri(cx, y + 16, cx - 11, y, cx + 11, y, C.orange);
      // 白底加粗：深色木台上看不清黑字（R0015）
      this.drawGuideTip("点这里开始烤", cx, y - 14, { size: 15 });
    },

    speciesShopUnlocked: function (speciesId) {
      if (speciesId === "small") return true;
      if (AIGCUtils.GameState.getFishCount(speciesId) > 0) return true;
      var pool = AIGCUtils.Recipes.getOrderableSpeciesIds("shallow", "worm");
      return pool.indexOf(speciesId) >= 0;
    },

    rawFishKey: function (speciesId) {
      var id = AIGCUtils.Recipes.normalizeSpeciesId(speciesId || "small");
      if (id !== "small" && id !== "salmon" && id !== "tuna" && id !== "golden") id = "small";
      return "fish_raw_" + id;
    },

    paintSwimFish: function (speciesId, x, y, targetH, flip, opts) {
      opts = opts || {};
      var key = this.rawFishKey(speciesId);
      var scaleY = opts.scaleY == null ? 0.88 : opts.scaleY;
      var frame = this.spriteFrame(key, 0, targetH);
      if (!frame) return false;
      var drawH = frame.h * scaleY;
      var left = x - frame.w / 2;
      var top = y - drawH / 2;
      var u0 = frame.u0;
      var u1 = frame.u1;
      if (flip) {
        var swap = u0;
        u0 = u1;
        u1 = swap;
      }
      // 水下鱼：水色 tint + 可见透明度；出水 fish surface:true
      var alpha = opts.alpha != null ? opts.alpha : (opts.surface ? 0.98 : 0.7);
      var tint = opts.surface
        ? [1, 1, 1, alpha]
        : [0.78, 0.9, 1.0, alpha];
      if (!this.paintTexturedQuad(key, left, top, frame.w, drawH, u0, frame.v0, u1, frame.v1, 0, x, y, tint)) return false;
      this.flush();
      return true;
    },

    paintEscapedFish: function (x, y, size) {
      if (!this.artOn) {
        this.fish(x, y, size, false);
        return;
      }
      var pool = AIGCUtils.Recipes.getOrderableSpeciesIds(AIGCUtils.Collection.spotId, AIGCUtils.Collection.baitId);
      var id = (pool && pool[0]) || "small";
      if (!this.paintSwimFish(id, x, y, Math.round(size * 1.6), true)) this.fish(x, y, size, false);
    },

    /**
     * 钓鱼兔子脚底对齐座位。竿尖是精灵内部的木色尖端，旋转后仍从该点出线。
     * footU/tipU/tipV 来自 hero_rabbit_fish.png 内容区；sheet 帧沿用同一 tip 标定。
     */
    paintFishingRabbit: function (seatX, seatY, targetH, rot, motion) {
      motion = motion || {};
      var footU = 0.3813;
      var tipU = 0.9991;
      var tipV = 0.0532;
      var painted = false;
      var frameW = 0;
      var frameH = targetH;
      // R0020：hide=true 只算竿尖（GIF 已烤静坐兔），不画静帧
      var hideSprite = !!motion.hide;
      if (motion.hasSheet && motion.sheetKey) {
        painted = !!this.paintSheetFoot(motion.sheetKey, seatX, seatY, targetH, {
          u0: motion.u0,
          v0: motion.v0,
          u1: motion.u1,
          v1: motion.v1
        }, false, {
          rot: rot || 0,
          alpha: motion.alpha == null ? 1 : motion.alpha,
          pivotX: motion.pivotX,
          pivotY: motion.pivotY
        });
        if (painted) {
          var aspect = this.sceneAspect[motion.sheetKey] || 8;
          // 单格近似正方形 sheet：宽≈高
          frameW = targetH;
          frameH = targetH;
        }
      }
      if (!painted) {
        var key = "hero_rabbit_fish";
        var frame = this.spriteFrame(key, 0, targetH);
        if (!frame) {
          // R0020：静帧未就绪时仍按内容比例估 tip，避免 GIF 模式等竿线直接 return
          if (!hideSprite) return null;
          frameW = Math.round(targetH * (1690 / 1839));
          frameH = targetH;
        } else {
          frameW = frame.w;
          frameH = frame.h;
          var left = seatX - footU * frame.w;
          var top = seatY - frame.h;
          var pivotX = motion.pivotX == null ? seatX : motion.pivotX;
          var pivotY = motion.pivotY == null ? seatY : motion.pivotY;
          if (!hideSprite) {
            if (!this.paintTexturedQuad(key, left, top, frame.w, frame.h, frame.u0, frame.v0, frame.u1, frame.v1, rot, pivotX, pivotY)) return null;
            this.flush();
          }
        }
      } else {
        // sheet 脚底居中画；tip 仍按静帧 UV 相对座位推算
        frameW = targetH;
        frameH = targetH;
      }
      var left2 = seatX - footU * frameW;
      var top2 = seatY - frameH;
      var px = motion.pivotX == null ? seatX : motion.pivotX;
      var py = motion.pivotY == null ? seatY : motion.pivotY;
      var dx = left2 + tipU * frameW - px;
      var dy = top2 + tipV * frameH - py;
      var c = Math.cos(rot || 0);
      var s = Math.sin(rot || 0);
      return {
        tipX: px + dx * c - dy * s,
        tipY: py + dx * s + dy * c
      };
    },

    /**
     * 唯一海面时钟：上带 swell / 下带 crash / 船兔 bob 共用。
     * 12 帧、约 2.5s 一圈；禁止船另开频率。
     * R0010 补丁8：竖屏减小 amp/bobRot，避免船角抬起露沙、探出底边。
     */
    fishingSurfMotion: function (now) {
      var t = now || Date.now();
      var periodMs = 2500;
      var frameCount = 12;
      var cycle = (t % periodMs) / periodMs;
      var phase = cycle * Math.PI * 2;
      var amp = this.portrait ? 3 : 7;
      var bobY = Math.sin(phase) * amp + Math.sin(phase * 2) * amp * 0.2;
      var bobRot = this.portrait
        ? Math.sin(phase) * 0.008 + Math.sin(phase * 2) * 0.002
        : Math.sin(phase) * 0.032 + Math.sin(phase * 2) * 0.01;
      return {
        phase: phase,
        cycle: cycle,
        frameT: cycle * frameCount,
        frameCount: frameCount,
        bobY: bobY,
        bobRot: bobRot,
        periodMs: periodMs
      };
    },

    /** 设计画布在 framebuffer 中的 scissor 矩形（WebGL 原点左下） */
    designCanvasScissorRect: function () {
      var gl = this.gl;
      if (!gl) return null;
      var bufH = gl.drawingBufferHeight || this.viewHeight;
      var scaleX = (gl.drawingBufferWidth || this.viewWidth) / Math.max(1, this.viewWidth);
      var scaleY = bufH / Math.max(1, this.viewHeight);
      var x = Math.round(this.offsetX * scaleX);
      var w = Math.round(this.width * this.scale * scaleX);
      var h = Math.round(this.height * this.scale * scaleY);
      var topInView = this.offsetY * scaleY;
      var y = Math.round(bufH - topInView - h);
      return { x: x, y: y, w: w, h: h };
    },

    beginDesignCanvasScissor: function () {
      var gl = this.gl;
      var rect = this.designCanvasScissorRect();
      if (!gl || !rect || rect.w <= 0 || rect.h <= 0) return false;
      this.flush();
      gl.enable(gl.SCISSOR_TEST);
      gl.scissor(rect.x, rect.y, rect.w, rect.h);
      return true;
    },

    endDesignCanvasScissor: function () {
      var gl = this.gl;
      if (!gl) return;
      this.flush();
      gl.disable(gl.SCISSOR_TEST);
    },

    /** @deprecated 兼容旧调用；请用 fishingSurfMotion */
    fishingWavePhase: function (now) {
      return this.fishingSurfMotion(now).phase;
    },

    /**
     * 底板纹理 V → 屏幕 Y（与 paintScene 的 letterbox 一致），
     * 保证山脚线跟 seabase 像素对齐，而不是瞎猜屏幕百分比。
     */
    fishingTexVToScreenY: function (texV) {
      var box = this.fishingLetterbox();
      return box.y0 + (box.y1 - box.y0) * Math.max(0, Math.min(1, texV));
    },

    /** 与 paintScene / drawDynamicSea 同一套 letterbox（屏幕 ↔ 纹理 UV） */
    fishingLetterbox: function () {
      var aspect = this.sceneAspect[this.fishingBaseKey()] || (this.portrait ? 1152 / 2048 : 2048 / 1152);
      var rectAspect = this.width / Math.max(1, this.height);
      var u0 = 0;
      var v0 = 0;
      var u1 = 1;
      var v1 = 1;
      if (aspect > rectAspect) {
        var showU = rectAspect / aspect;
        var padU = (1 - showU) / 2;
        u0 = padU;
        u1 = 1 - padU;
      } else {
        var showV = aspect / rectAspect;
        var padV = (1 - showV) / 2;
        v0 = padV;
        v1 = 1 - padV;
      }
      return {
        u0: u0,
        v0: v0,
        u1: u1,
        v1: v1,
        y0: v0 * this.height,
        y1: v1 * this.height,
        x0: u0 * this.width,
        x1: u1 * this.width,
        aspect: aspect
      };
    },

    getSeaMaskCpu: function () {
      var key = this.fishingSeaMaskKey();
      return this.seaMaskCpu[key] || null;
    },

    /** 屏幕坐标 → 蒙版像素坐标（可小数，供双线性） */
    screenToSeaMaskPx: function (sx, sy) {
      var cpu = this.getSeaMaskCpu();
      if (!cpu) return null;
      var box = this.fishingLetterbox();
      var u = box.u0 + (sx / Math.max(1, this.width)) * (box.u1 - box.u0);
      var v = box.v0 + (sy / Math.max(1, this.height)) * (box.v1 - box.v0);
      return {
        x: Math.max(0, Math.min(cpu.w - 1.001, u * (cpu.w - 1))),
        y: Math.max(0, Math.min(cpu.h - 1.001, v * (cpu.h - 1))),
        cpu: cpu
      };
    },

    /** 蒙版像素 → 屏幕 Y（用 letterbox 逆变换） */
    seaMaskPxToScreenY: function (py) {
      var cpu = this.getSeaMaskCpu();
      if (!cpu) return null;
      var box = this.fishingLetterbox();
      var v = py / Math.max(1, cpu.h - 1);
      return box.y0 + ((v - box.v0) / Math.max(1e-6, box.v1 - box.v0)) * (box.y1 - box.y0);
    },

    seaMaskPxToScreenX: function (px) {
      var cpu = this.getSeaMaskCpu();
      if (!cpu) return null;
      var box = this.fishingLetterbox();
      var u = px / Math.max(1, cpu.w - 1);
      return box.x0 + ((u - box.u0) / Math.max(1e-6, box.u1 - box.u0)) * (box.x1 - box.x0);
    },

    /** 双线性采样蒙版 alpha（0~1）。蒙版未就绪返回 -1 */
    seaMaskAt: function (sx, sy) {
      var mapped = this.screenToSeaMaskPx(sx, sy);
      if (!mapped) return -1;
      var cpu = mapped.cpu;
      var x = mapped.x;
      var y = mapped.y;
      var x0 = Math.floor(x);
      var y0 = Math.floor(y);
      var x1 = Math.min(cpu.w - 1, x0 + 1);
      var y1 = Math.min(cpu.h - 1, y0 + 1);
      var fx = x - x0;
      var fy = y - y0;
      var data = cpu.data;
      function aAt(ix, iy) {
        return data[((iy * cpu.w + ix) << 2) + 3] / 255;
      }
      var a00 = aAt(x0, y0);
      var a10 = aAt(x1, y0);
      var a01 = aAt(x0, y1);
      var a11 = aAt(x1, y1);
      var a0 = a00 * (1 - fx) + a10 * fx;
      var a1 = a01 * (1 - fx) + a11 * fx;
      return a0 * (1 - fy) + a1 * fy;
    },

    /** 按屏幕行扫描左右水域边界；无海返回 null */
    seaBoundsAtY: function (sy) {
      var cpu = this.getSeaMaskCpu();
      if (!cpu) return null;
      var mapped = this.screenToSeaMaskPx(this.width * 0.5, sy);
      if (!mapped) return null;
      var row = Math.round(mapped.y);
      row = Math.max(0, Math.min(cpu.h - 1, row));
      var data = cpu.data;
      var w = cpu.w;
      var left = -1;
      var right = -1;
      var x;
      for (x = 0; x < w; x++) {
        if (data[((row * w + x) << 2) + 3] > 150) {
          left = x;
          break;
        }
      }
      if (left < 0) return null;
      for (x = w - 1; x >= left; x--) {
        if (data[((row * w + x) << 2) + 3] > 150) {
          right = x;
          break;
        }
      }
      return {
        left: this.seaMaskPxToScreenX(left),
        right: this.seaMaskPxToScreenX(right),
        midY: sy
      };
    },

    /**
     * 某列沙滩水线（海区底部边缘）的屏幕 Y。
     * 从该列顶部往下找最后一处 alpha 高的像素。
     */
    shoreLineAtX: function (sx) {
      var cpu = this.getSeaMaskCpu();
      if (!cpu) return null;
      var mapped = this.screenToSeaMaskPx(sx, this.height * 0.5);
      if (!mapped) return null;
      var col = Math.round(mapped.x);
      col = Math.max(0, Math.min(cpu.w - 1, col));
      var data = cpu.data;
      var w = cpu.w;
      var last = -1;
      var y;
      for (y = 0; y < cpu.h; y++) {
        if (data[((y * w + col) << 2) + 3] > 150) last = y;
      }
      if (last < 0) return null;
      return this.seaMaskPxToScreenY(last);
    },

    /**
     * R0010：海域几何以蒙版为真源；无蒙版时回退旧屏幕比例（仅兜底）。
     * seaTop/beachLine 若来自蒙版，可供鱼/泡沫使用；不得再当「猜海岸」权威去画海。
     */
    fishingSeaLayout: function () {
      var spot = (AIGCUtils.Collection && AIGCUtils.Collection.spotId) || "shallow";
      var deep = spot === "deep";
      var seaBottom = Math.max(88, this.height - 72);
      var seaTop;
      var beachLine;
      var fromMask = false;
      var cpu = this.getSeaMaskCpu();
      if (cpu) {
        var shores = [];
        var i;
        for (i = 0; i < 9; i++) {
          var sx = Math.round(this.width * (0.12 + i * 0.09));
          var sy = this.shoreLineAtX(sx);
          if (sy != null && !isNaN(sy)) shores.push(sy);
        }
        if (shores.length) {
          shores.sort(function (a, b) {
            return a - b;
          });
          beachLine = Math.round(shores[Math.floor(shores.length / 2)]);
          fromMask = true;
        }
        // 远海顶：屏幕中线附近自上而下第一个有海的 Y
        var midX = Math.round(this.width * 0.55);
        var yScan;
        for (yScan = 40; yScan < seaBottom; yScan += 4) {
          if (this.seaMaskAt(midX, yScan) > 0.55) {
            seaTop = yScan;
            fromMask = true;
            break;
          }
        }
      }
      if (seaTop == null) {
        seaTop = Math.round(this.fishingTexVToScreenY(this.portrait ? 480 / 2048 : 330 / 1152));
        seaTop = Math.max(seaTop, 80);
      }
      if (beachLine == null) {
        beachLine = Math.round(this.fishingTexVToScreenY(this.portrait ? 1680 / 2048 : 1000 / 1152));
      }
      seaBottom = Math.max(seaTop + 8, seaBottom);
      var seaH = Math.max(8, seaBottom - seaTop);
      var farWeight = deep ? 0.55 : 0.48;
      var farH = Math.round(seaH * farWeight);
      var nearTop = seaTop + farH;
      var nearH = Math.max(8, seaBottom - nearTop);
      if (fromMask && !this._seaGeomLog) {
        this._seaGeomLog = true;
        console.log(
          "[FishAnim] R0010 sea geometry from mask",
          this.fishingSeaMaskKey(),
          "seaTop",
          seaTop,
          "beachLine",
          beachLine
        );
      }
      return {
        seaTop: seaTop,
        seaBottom: seaBottom,
        beachTop: beachLine,
        beachLine: beachLine,
        seaH: seaH,
        farH: farH,
        nearTop: nearTop,
        nearH: nearH,
        deep: deep,
        fromMask: fromMask
      };
    },

    /** 画布内裁剪，杜绝外扩方块 */
    clipSeaRect: function (x, y, w, h) {
      var x0 = Math.max(0, x);
      var y0 = Math.max(0, y);
      var x1 = Math.min(this.width, x + w);
      var y1 = Math.min(this.height, y + h);
      if (x1 - x0 < 1 || y1 - y0 < 1) return null;
      return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
    },

    /**
     * R0008：实时海面。
     * 一张整幅海面 quad + sea-mask：RGB 是海水基色，A 是海岸线蒙版。
     * 浪、波光、拍岸白沫全部在 fragment shader 里按时间生成，
     * 不切条、不滚静图、不叠半透明矩形。
     */
    /**
     * R0020b：横屏浅滩整屏播海域 GIF——16 帧全分辨率，4 张 2×2 atlas。
     * 每格 960×540，1:1 铺满设计画布，不再半分辨率拉伸发糊。
     */
    paintLandSeaGifBackdrop: function () {
      var cols = 2;
      var rows = 2;
      var perAtlas = cols * rows;
      var atlasCount = 4;
      var clk = this.fishingLandSeaGifClock(Date.now());
      var f0 = clk.f0;
      var atlasIdx = Math.floor(f0 / perAtlas);
      var local = f0 % perAtlas;
      var key = "anim_fish_sea_gif_land_" + atlasIdx;
      if (!this.scenes[key]) {
        if (!this.sceneLoading[key] && !this.sceneFailed[key]) this.loadScenes();
        if (!this._landGifMissLog || this._landGifMissLog !== key) {
          this._landGifMissLog = key;
          console.warn("[FishAnim] R0020b land sea gif atlas missing/loading", key);
        }
        return false;
      }
      var c0 = local % cols;
      var r0 = Math.floor(local / cols);
      var u0 = c0 / cols;
      var u1 = (c0 + 1) / cols;
      var v0 = r0 / rows;
      var v1 = (r0 + 1) / rows;
      var ok = this.paintUiRegion(key, 0, 0, this.width, this.height, u0, v0, u1, v1, [1, 1, 1, 1]);
      if (ok) this.flush();
      if (ok && this._landGifPaintLog !== key + ":" + f0) {
        this._landGifPaintLog = key + ":" + f0;
        console.log("[FishAnim] R0020f paintLandSeaGifBackdrop syncClock", key, "frame", f0, "/", clk.n, "period", clk.periodMs);
      }
      return !!ok;
    },

    drawDynamicSea: function () {
      this.parseSeaDebugParams();
      // R0020：横屏浅滩改整屏 GIF，跳过着色器海
      if (this.fishingUsesLandSeaGif()) {
        if (!this._seaGifSkipLog) {
          this._seaGifSkipLog = true;
          console.log("[FishAnim] R0020 land sea gif skip drawDynamicSea");
        }
        return false;
      }
      // R0014：?sea=static 回退静态 seaflat，不画动态海
      if (this.seaRenderMode === "static") {
        if (!this._seaStaticLog) {
          this._seaStaticLog = true;
          console.log("[FishAnim] R0014 sea=static skip dynamic sea");
        }
        return false;
      }
      var maskKey = this.fishingSeaMaskKey();
      var mask = this.scenes[maskKey];
      var baseKey = this.fishingBaseKey();
      if (!mask || !this.scenes[baseKey] || !this.gl || !this.program) return false;
      var gl = this.gl;
      // C7：海面与底板锁定，不跟收线 artShift 平移
      var x = 0;
      var y = 0;
      var aspect = this.sceneAspect[baseKey] || (this.portrait ? 1152 / 2048 : 2048 / 1152);
      var rectAspect = this.width / this.height;
      var u0 = 0, v0 = 0, u1 = 1, v1 = 1;
      if (aspect > rectAspect) {
        var showU = rectAspect / aspect;
        var padU = (1 - showU) / 2;
        u0 = padU;
        u1 = 1 - padU;
      } else {
        var showV = aspect / rectAspect;
        var padV = (1 - showV) / 2;
        v0 = padV;
        v1 = 1 - padV;
      }
      gl.useProgram(this.program);
      // C0：?seaDebug=1 时可冻结海面时间（&seaT=秒）
      var seaT =
        this.seaDebugMode && this.seaDebugT != null && !isNaN(this.seaDebugT)
          ? this.seaDebugT
          : (Date.now() % 3600000) / 1000;
      gl.uniform1f(this.timeUniform, seaT);
      gl.uniform2f(this.resUniform, gl.drawingBufferWidth || this.width, gl.drawingBufferHeight || this.height);
      var metaKey = this.fishingSeaMetaKey();
      var hasMeta = !!this.scenes[metaKey];
      // meta 未就绪时关泡沫，避免 dummy 白纹里当岸距
      var foamOn = this.seaFoamMode === "0" || !hasMeta ? 0 : 1;
      gl.uniform1f(this.foamUniform, foamOn);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, mask);
      gl.uniform1i(this.maskUniform, 1);
      var meta = this.scenes[metaKey] || this.ensureDummyTexture();
      gl.activeTexture(gl.TEXTURE2);
      gl.bindTexture(gl.TEXTURE_2D, meta);
      gl.uniform1i(this.metaUniform, 2);
      gl.activeTexture(gl.TEXTURE0);
      var white = [1, 1, 1, 1];
      var mx = this.width;
      var my = this.height;
      this.vertex(x, y, white, u0, v0, 3.5);
      this.vertex(x + mx, y, white, u1, v0, 3.5);
      this.vertex(x, y + my, white, u0, v1, 3.5);
      this.vertex(x + mx, y, white, u1, v0, 3.5);
      this.vertex(x + mx, y + my, white, u1, v1, 3.5);
      this.vertex(x, y + my, white, u0, v1, 3.5);
      this.flush();
      if (!this._seaShaderLog) {
        this._seaShaderLog = true;
        console.log(
          "[FishAnim] R0019 C4 shore foam swash",
          maskKey,
          "meta",
          metaKey,
          !!this.scenes[metaKey],
          "foam",
          foamOn,
          "portrait",
          !!this.portrait
        );
      }
      return true;
    },

    /**
     * N 帧 sheet 双帧交叉。frameCount 默认 12。
     * tintRgb 可选 [r,g,b] 用于上带提亮/下带压暗。
     * stable：船区用单帧，避免交叉闪。
     */
    paintWaveSheetCrossfade: function (key, x, y, w, h, frameT, v0, v1, alpha, frameCount, tintRgb, stable) {
      if (!this.scenes[key] || w <= 0 || h <= 0) return false;
      var a = alpha == null ? 1 : alpha;
      if (a <= 0.01) return false;
      var clipped = this.clipSeaRect(x, y, w, h);
      if (!clipped) return false;
      // R0012：横向 12 帧长图超过 2048 纹理上限，已重排为 4×3 网格
      var sheetCols = 4;
      var sheetRows = 3;
      var n = frameCount || 12;
      var ft = ((frameT % n) + n) % n;
      var f0 = Math.floor(ft) % n;
      var f1 = (f0 + 1) % n;
      var frac = stable ? 0 : ft - Math.floor(ft);
      var vv0 = v0 == null ? 0 : v0;
      var vv1 = v1 == null ? 1 : v1;
      var tr = tintRgb && tintRgb[0] != null ? tintRgb[0] : 1;
      var tg = tintRgb && tintRgb[1] != null ? tintRgb[1] : 1;
      var tb = tintRgb && tintRgb[2] != null ? tintRgb[2] : 1;
      var c0 = f0 % sheetCols;
      var r0 = Math.floor(f0 / sheetCols);
      var u00 = c0 / sheetCols;
      var u01 = (c0 + 1) / sheetCols;
      var w00 = r0 / sheetRows + vv0 / sheetRows;
      var w01 = r0 / sheetRows + vv1 / sheetRows;
      var ok0 = this.paintUiRegion(key, clipped.x, clipped.y, clipped.w, clipped.h, u00, w00, u01, w01, [tr, tg, tb, a * (1 - frac)]);
      var ok1 = true;
      if (!stable && frac > 0.02) {
        var c1 = f1 % sheetCols;
        var r1 = Math.floor(f1 / sheetCols);
        var u10 = c1 / sheetCols;
        var u11 = (c1 + 1) / sheetCols;
        var w10 = r1 / sheetRows + vv0 / sheetRows;
        var w11 = r1 / sheetRows + vv1 / sheetRows;
        ok1 = this.paintUiRegion(key, clipped.x, clipped.y, clipped.w, clipped.h, u10, w10, u11, w11, [tr, tg, tb, a * frac]);
      }
      this.flush();
      return !!(ok0 || ok1);
    },

    /**
     * @deprecated R0010：第二套海岸线，新路径禁止使用。
     * 仅保留给旧 swell/crash 条带路径；动态海/鱼/泡沫已改查 sea-mask。
     * 返回 { cut, feather }：cut 以左为沙滩/栅栏，feather 内 alpha 0→1。
     */
    fishingSeaLeftMask: function (layout, midY) {
      if (layout.deep) return { cut: 0, feather: 0 };
      var beach = layout.beachLine != null ? layout.beachLine : layout.beachTop;
      var rise = this.portrait ? Math.round(layout.seaH * 0.42) : Math.round(layout.seaH * 0.48);
      var riseTop = beach - rise;
      var cut;
      var feather;
      if (this.portrait) {
        var tp = Math.max(0, Math.min(1, (midY - layout.seaTop) / Math.max(1, beach - layout.seaTop)));
        // 越靠近沙滩挖空越大，漏出沙滩；远水只让开一点岸
        cut = Math.round(this.width * (0.06 + 0.22 * tp * tp));
        feather = 28;
      } else {
        if (midY <= riseTop) {
          // 远水：尽量盖左侧静海，只留窄栅栏缝
          cut = Math.round(28 + Math.sin(midY * 0.04) * 3);
          feather = 32;
        } else if (midY >= beach) {
          // 沙滩线以下：大挖空漏出沙滩舌
          cut = Math.round(310 + Math.sin(midY * 0.03) * 6);
          feather = 44;
        } else {
          // 沙滩上升带：平滑加大 cut → 围绕沙滩包裹
          var u = (midY - riseTop) / Math.max(1, rise);
          u = u * u * (3 - 2 * u);
          cut = Math.round(28 + u * 282 + Math.sin(midY * 0.045) * 5);
          feather = Math.round(32 + u * 14);
        }
      }
      cut = Math.max(0, Math.min(cut, Math.round(this.width * 0.38)));
      if (cut <= 2) feather = 0;
      return { cut: cut, feather: feather };
    },

    /** @deprecated 改用 fishingSeaLeftMask */
    fishingSeaDrawSpans: function (layout, y, h) {
      var mask = this.fishingSeaLeftMask(layout, y + h * 0.5);
      return [{ x: mask.cut, w: this.width - mask.cut }];
    },

    /**
     * R0005：用户要求撤销海浪分层动画（R0001–R0004）。
     * 不再绘制 swell/crash/不透明海罩；画面用 noboat 完整静海 + 船兔。
     */
    drawFishingUnifiedSea: function () {
      if (!this._waveSheetLog || this._waveSheetLog.indexOf("R0005") !== 0) {
        this._waveSheetLog = "R0005:disabled";
        console.log("[FishAnim] R0005 sea wave overlay disabled by user rollback");
      }
      return false;
    },

    /** 单行浪：主体 + 左缘羽化（mask 已按该行 Y 算好） */
    paintSeaRowSoftLeft: function (key, layout, surf, y, h, mask, v0, v1, alpha, tint) {
      if (h < 2 || alpha < 0.02) return;
      var bodyX = mask.cut + mask.feather;
      if (bodyX < this.width - 2) {
        this.paintWaveSheetCrossfade(
          key,
          bodyX,
          y,
          this.width - bodyX,
          h,
          surf.frameT,
          v0,
          v1,
          alpha,
          surf.frameCount,
          tint,
          false
        );
      }
      if (mask.feather <= 0) return;
      var cols = 7;
      var cw = mask.feather / cols;
      var ci;
      for (ci = 0; ci < cols; ci++) {
        this.paintWaveSheetCrossfade(
          key,
          mask.cut + ci * cw,
          y,
          cw + 1.5,
          h,
          surf.frameT,
          v0,
          v1,
          alpha * ((ci + 1) / cols),
          surf.frameCount,
          tint,
          false
        );
      }
    },

    /** @deprecated R0004 改按行绘制 */
    paintSeaLayerSoftLeft: function (key, layout, surf, y, h, v0, v1, alpha, tint) {
      var mask = this.fishingSeaLeftMask(layout, y + h * 0.5);
      this.paintSeaRowSoftLeft(key, layout, surf, y, h, mask, v0, v1, alpha, tint);
    },

    /** 拍岸碎浪：落点必须在蒙版水域内（C1）；观感重做留给 C4 */
    drawFishingShoreFoam: function (layout, surf) {
      if (layout.deep) return;
      var yBase = (layout.beachLine || layout.beachTop) - 6;
      var i;
      for (i = 0; i < 20; i++) {
        var px = ((i * 71 + Math.floor(surf.cycle * 48)) % (this.width + 30)) - 10;
        var py = yBase + Math.sin(surf.phase * 1.3 + i * 0.9) * 5 + (i % 3) * 2;
        if (py < layout.seaTop + 8 || py > layout.seaBottom - 4) continue;
        if (px < 8 || px > this.width - 8) continue;
        // R0010：用蒙版判定，不再用 fishingSeaLeftMask 硬编码 cut
        var a = this.seaMaskAt(px, py);
        if (a >= 0 && a < 0.6) continue;
        var pr = 2 + (i % 4);
        var pa = 0.22 + 0.18 * (0.5 + 0.5 * Math.sin(surf.phase * 2 + i));
        this.circle(px, py, pr, [0.98, 0.99, 1, pa], 8);
        if (i % 2 === 0) this.circle(px + 7, py + 1, pr * 0.65, [1, 1, 1, pa * 0.65], 6);
      }
      this.flush();
    },

    // R0002：Far/Near 旧入口保留为空，避免误调再叠第二层矩形
    drawFishingFarBand: function () {},
    drawFishingNearBand: function () {},

    /**
     * 真船脚底槽（静帧位置）；实际绘制加 surf.bobY。
     * R0010：横屏可跟蒙版水线；竖屏是「甲板视角」，船脚必须固定在甲板槽。
     * 补丁5：竖屏换新抠图船精灵（完整船体），脚点居中贴底；横屏不变。
     * 补丁6/7：竖屏脚点下移并为上抬留余量；下晃溢出由 clipToCanvas 裁掉。
     */
    fishingBoatFoot: function () {
      // R0020d：横屏 GIF 空船底图上，船脚与烤兔座位用同一刚体偏移，才能同相摇摆
      if (this.fishingUsesLandSeaGif()) {
        var gs = this.fishingLandSeaGifRabbitSeat();
        var off = this.fishingRabbitSeatOnBoat();
        return {
          x: gs.x - (off.dx || 0),
          y: gs.y - (off.dy || 0),
          h: 176
        };
      }
      var x = this.portrait ? 270 : 210;
      var h = this.portrait ? 252 : 176;
      // 补丁7b：再下移，压住微转抬起的右下角，避免露沙；溢出仍靠 clipToCanvas 裁掉
      var y = this.portrait ? 1000 : 300;
      if (!this.portrait) {
        var shoreY = this.shoreLineAtX(x);
        if (shoreY != null && !isNaN(shoreY)) {
          y = Math.round(shoreY - 6);
          y = Math.max(120, Math.min(this.height - 80, y));
        }
      } else if (!this._boatPortFootLog) {
        this._boatPortFootLog = true;
        console.log("[FishAnim] R0010 patch7b portrait boat foot lower corner", x, y, h);
      }
      return { x: x, y: y, h: h };
    },

    /** 兔相对船脚底的固定甲板偏移（船兔一体） */
    fishingRabbitSeatOnBoat: function () {
      // 补丁5：新船居中后，兔坐左舷坐垫附近甲板
      if (this.portrait) return { dx: -55, dy: -118, h: 128 };
      return { dx: -58, dy: -72, h: 92 };
    },

    paintFishingBoatSprite: function (footX, footY, bobRot) {
      var key = this.portrait ? "boat_fish_port" : "boat_fish_land";
      if (!this.scenes[key]) {
        if (!this.sceneLoading[key] && !this.missingShopSprites[key]) {
          this.missingShopSprites[key] = true;
          console.warn("[FishAnim] boat sprite missing", key);
        }
        return null;
      }
      var foot = this.fishingBoatFoot();
      var drawn = this.paintFootSprite(key, footX, footY, 0, foot.h, false, {
        rot: bobRot || 0,
        alpha: 1,
        // 竖屏：下晃超出画布底的船底裁掉，避免探出沙滩底边
        clipToCanvas: !!this.portrait
      });
      if (!this._boatBobLog) {
        this._boatBobLog = true;
        var aspect = this.sceneAspect[key] || 1;
        var drawW = Math.round(foot.h * aspect);
        console.log(
          "[FishAnim] R0010 patch7 boat+rabbit surfBob",
          key,
          Math.round(footX),
          Math.round(footY),
          "h",
          foot.h,
          "w",
          drawW,
          "clip",
          !!this.portrait
        );
      }
      return drawn;
    },

    /** 礁石钓点才画；浅滩/深海不画。初期未解锁也不画。 */
    paintFishingReefRocks: function (bobY) {
      var spot = (AIGCUtils.Collection && AIGCUtils.Collection.spotId) || "shallow";
      if (spot !== "reef") return;
      if (!AIGCUtils.Collection.isSpotUnlocked || !AIGCUtils.Collection.isSpotUnlocked("reef")) return;
      var key = "rock_reef_lv1";
      if (!this.scenes[key]) return;
      var portrait = this.portrait;
      var rocks = portrait
        ? [{ x: 120, y: 720, h: 70 }, { x: 360, y: 760, h: 56 }]
        : [{ x: 520, y: 400, h: 64 }, { x: 700, y: 360, h: 52 }];
      for (var i = 0; i < rocks.length; i++) {
        var r = rocks[i];
        this.paintFootSprite(key, r.x, r.y + bobY * 0.35, 0, r.h, false, { alpha: 0.95 });
      }
    },

    drawArtFishingMotion: function () {
      var collection = AIGCUtils.Collection;
      var portrait = this.portrait;
      var now = Date.now();
      var shift = this.artShiftX || 0;
      var landGif = this.fishingUsesLandSeaGif();
      // R0020：横屏浅滩先铺整屏 GIF；否则着色器海
      if (landGif) {
        if (!this.paintLandSeaGifBackdrop()) {
          // sheet 未就绪时仍画着色器海兜底，避免黑屏
          this.drawDynamicSea();
        }
      } else {
        // R0008：先把实时海面铺满，再画鱼/礁石/船兔；UI 在返回后绘制，永远最上层
        this.drawDynamicSea();
      }
      // R0020f：横屏 GIF 用底图船实测位移时钟；其它模式仍用 fishingSurfMotion
      var surf = landGif ? this.fishingLandSeaGifSurf(now) : this.fishingSurfMotion(now);
      var foot = this.fishingBoatFoot();
      var boatX = foot.x + shift;
      var boatY = foot.y + surf.bobY;
      var seat = this.fishingRabbitSeatOnBoat();
      var seatX = boatX + seat.dx;
      var seatY = boatY + seat.dy;
      var rabbitH = seat.h;
      if (landGif) {
        rabbitH = this.fishingLandSeaGifRabbitSeat().h;
      }
      var anim = AIGCUtils.AnimDriver;
      var rabbitMotion = anim && anim.resolve ? anim.resolve("fish_rabbit") : null;
      if (rabbitMotion) {
        seatX += rabbitMotion.dx || 0;
        seatY += rabbitMotion.dy || 0;
      }
      var rot = surf.bobRot;
      if (rabbitMotion && (rabbitMotion.rot || rabbitMotion.rot === 0)) {
        rot += rabbitMotion.rot || 0;
      } else if (collection.phase === "reeling" && collection.reelHeld) {
        rot += Math.sin(collection.timer / 75) * 0.12;
      }
      var pool = AIGCUtils.Recipes.getOrderableSpeciesIds(collection.spotId, collection.baitId);
      if (!pool || !pool.length) pool = ["small"];

      var layout = this.fishingSeaLayout();

      // C1：鱼上限贴蒙版水线；自主游动完整逻辑留给 C6
      var fishCeil = Math.min(layout.beachLine || layout.beachTop, layout.seaBottom) - 30;
      var farLow = layout.seaTop + Math.round(layout.farH * 0.82);
      var school = portrait ? [
        { id: "small", x: 60, y: Math.min(layout.nearTop + 70, fishCeil), h: 30, vx: 34, phase: 0.2 },
        { id: "small", x: 210, y: Math.min(layout.nearTop + 125, fishCeil), h: 26, vx: -27, phase: 1.4 },
        { id: "small", x: 360, y: Math.min(layout.nearTop + 95, fishCeil), h: 29, vx: 40, phase: 2.3 },
        { id: "small", x: 450, y: Math.min(farLow, fishCeil), h: 22, vx: -21, phase: 3.1 },
        { id: "salmon", x: 140, y: layout.seaTop + Math.round(layout.farH * 0.52), h: 46, vx: 30, phase: 0.8 },
        { id: "salmon", x: 380, y: layout.seaTop + Math.round(layout.farH * 0.70), h: 38, vx: -24, phase: 2.0 }
      ] : [
        { id: "small", x: 480, y: Math.min(layout.nearTop + 30, fishCeil), h: 26, vx: 46, phase: 0.4 },
        { id: "small", x: 620, y: Math.min(layout.nearTop + 72, fishCeil), h: 23, vx: -35, phase: 1.6 },
        { id: "small", x: 800, y: Math.min(layout.nearTop + 26, fishCeil), h: 24, vx: 30, phase: 2.5 },
        { id: "small", x: 910, y: Math.min(farLow, fishCeil), h: 20, vx: -22, phase: 3.4 },
        { id: "salmon", x: 720, y: layout.seaTop + Math.round(layout.farH * 0.55), h: 38, vx: -30, phase: 0.9 },
        { id: "salmon", x: 560, y: layout.seaTop + Math.round(layout.farH * 0.76), h: 32, vx: 26, phase: 2.2 }
      ];
      var swimT = now / 1000;
      // R0020b：横屏 GIF 模式鱼只在船右侧游；其它横屏也抬高左界，避免穿船
      var fishMinX = landGif ? this.fishingLandSeaGifFishMinX() : portrait ? 60 : 400;
      var span = Math.max(1, this.width - fishMinX - 40);
      var fishOut = 0;
      for (var i = 0; i < school.length; i++) {
        var swimmer = school[i];
        var running = swimmer.x + swimT * swimmer.vx;
        var swimX = fishMinX + (((running % span) + span) % span) + shift;
        var swimY = swimmer.y + Math.cos(surf.phase * 0.9 + swimmer.phase) * 4 + surf.bobY * 0.4;
        if (swimX < fishMinX) {
          fishOut++;
          continue;
        }
        // 用蒙版夹左右界；越界则本帧不画（C6 再做掉头）
        var bounds = this.seaBoundsAtY(swimY);
        if (bounds && bounds.left != null && bounds.right != null) {
          var leftBound = Math.max(bounds.left + 12, fishMinX);
          if (swimX < leftBound || swimX > bounds.right - 12) {
            fishOut++;
            continue;
          }
        }
        var cover = this.seaMaskAt(swimX, swimY);
        if (cover >= 0 && cover < 0.6) {
          fishOut++;
          continue;
        }
        this.paintSwimFish(swimmer.id, swimX, swimY, swimmer.h, swimmer.vx < 0, {
          alpha: swimmer.id === "salmon" ? 0.78 : 0.88,
          scaleY: 0.9
        });
      }
      if (fishOut && (!this._fishMaskSkipLog || this._fishMaskSkipLog < 3)) {
        this._fishMaskSkipLog = (this._fishMaskSkipLog || 0) + 1;
        console.log("[FishAnim] R0010 skip fish outside mask", fishOut);
      }

      this.paintFishingReefRocks(0);
      // R0006：底板已烤船则禁止再画精灵，否则双船
      // R0020e：横屏 GIF 底图已带船 → 禁止再叠 boat 精灵；只画活兔并跟 surf bob 摇摆
      var baseKey = this.backdropKey("fishing") || this.fishingBaseKey();
      var bakedBoat = landGif || this.fishingBaseHasBakedBoat(baseKey);
      // R0010 补丁8：竖屏船兔用 scissor 硬裁设计画布，旋转角探底也被剪掉
      var boatScissor = portrait && this.beginDesignCanvasScissor();
      if (boatScissor && !this._boatScissorLog) {
        this._boatScissorLog = true;
        console.log("[FishAnim] R0010 patch8 portrait boat scissor+softBob", surf.bobY, surf.bobRot);
      }
      if (!bakedBoat) {
        this.paintFishingBoatSprite(boatX, boatY, surf.bobRot);
      } else if (!this._boatBakeLog || this._boatBakeLog !== baseKey + (landGif ? ":gif" : "")) {
        this._boatBakeLog = baseKey + (landGif ? ":gif" : "");
        console.log("[FishAnim] R0020e skip boat sprite (gif has boat)", baseKey, "landGif", !!landGif);
      }
      if (landGif && (!this._rabbitGifBobLog || this._rabbitGifBobLog !== "on")) {
        this._rabbitGifBobLog = "on";
        console.log(
          "[FishAnim] R0020e land gif rabbit-only surfBob",
          Math.round(seatX),
          Math.round(seatY),
          "bobY",
          surf.bobY.toFixed(1)
        );
      }

      // 船与兔绕同一个船底支点做刚体旋转，避免各自绕脚底转而「错位/闪」
      var rabbitDraw = {};
      if (rabbitMotion) {
        for (var mk in rabbitMotion) rabbitDraw[mk] = rabbitMotion[mk];
      }
      rabbitDraw.pivotX = boatX;
      rabbitDraw.pivotY = boatY;
      var rabbit = this.paintFishingRabbit(seatX, seatY, rabbitH, rot, rabbitDraw);
      if (boatScissor) this.endDesignCanvasScissor();
      var mark =
        (portrait ? "port" : "land") +
        ":" +
        (collection.spotId || "shallow") +
        ":" +
        collection.phase +
        ":surf" +
        surf.periodMs;
      if (this.fishArtLog !== mark) {
        this.fishArtLog = mark;
        console.log(
          "[FishingArt]",
          mark,
          "base",
          baseKey,
          "bakedBoat",
          bakedBoat,
          "boatSprite",
          !bakedBoat,
          "boat",
          Math.round(boatX),
          Math.round(boatY),
          "seat",
          Math.round(seatX),
          Math.round(seatY)
        );
      }
      if (!rabbit) return;
      var lineOut =
        collection.phase === "charging" ||
        collection.phase === "cast_anim" ||
        collection.phase === "waiting" ||
        collection.phase === "bite" ||
        collection.phase === "reeling";
      var floatX = collection.bubbleX;
      // 浮标跟同一 surf，幅度略小于船
      var floatY = collection.bubbleY + Math.sin(surf.phase * 1.15) * 4;
      if (collection.phase === "bite") floatY += 18;
      if (collection.phase === "reeling") {
        floatX += Math.sin(collection.timer / 90) * 18;
        floatY += Math.cos(collection.timer / 110) * 8;
      }
      if (lineOut) {
        this.line(rabbit.tipX, rabbit.tipY, floatX, floatY, 2, C.ink);
        var ripples = collection.phase === "bite" ? 3 : 2;
        for (var ripple = 0; ripple < ripples; ripple++) {
          var progress = ((now / 650 + ripple * 0.33) % 1);
          this.circle(floatX, floatY, 6 + progress * 30, [0.98, 0.92, 0.79, 0.3 * (1 - progress)], 14);
        }
        this.circle(floatX, floatY, collection.phase === "bite" ? 11 : 7, C.orange);
      }
      if (collection.phase === "reeling") {
        var hooked = pool[Math.floor(now / 700) % pool.length];
        this.paintSwimFish(hooked, floatX + 18, floatY + 26, portrait ? 36 : 32, false, { alpha: 0.88, scaleY: 0.92 });
      }
      if (collection.phase === "fishCaught") {
        var caughtT = Math.min(1, collection.timer / 850);
        var caughtId = collection.caughtFish && collection.caughtFish.speciesId;
        if (pool.indexOf(caughtId) < 0) caughtId = pool[0];
        var jumpY = collection.bubbleY - Math.sin(caughtT * Math.PI) * (portrait ? 110 : 130);
        this.paintSwimFish(caughtId, collection.bubbleX, jumpY, portrait ? 52 : 46, false, { surface: true, alpha: 0.98, scaleY: 1 });
        this.line(rabbit.tipX, rabbit.tipY, collection.bubbleX, jumpY, 2, C.ink);
        this.text("钓到了", portrait ? this.width / 2 : 610, portrait ? 420 : 150, 28, C.cream, "center");
      }
    },

    /**
     * R0008 C7：顶部木条 + 底部地图/背包独立透明层。
     * 绘制时机：动态海 / 鱼 / 礁石 / 船兔 / 鱼线 之后，HUD 叠字与弹窗之前。
     * ?ui=off 隐藏；?ui=baked 跳过（回退烤底板）。
     */
    paintFishingUiChrome: function () {
      this.parseSeaDebugParams();
      // R0020：GIF 已烤 UI 外观；返回 true 阻止再叠 shared hud，热区仍由 input 固定矩形负责
      if (this.fishingUsesLandSeaGif()) {
        if (!this._gifChromeSkipLog) {
          this._gifChromeSkipLog = true;
          console.log("[FishAnim] R0020 land sea gif skip ui-chrome (baked)");
        }
        return true;
      }
      if (this.seaUiMode === "off" || this.seaUiMode === "baked") return false;
      var key = this.fishingUiChromeKey();
      if (!this.scenes[key]) {
        if (!this.sceneLoading[key] && !this.sceneFailed[key]) this.loadScenes();
        if (!this._chromeMissLog || this._chromeMissLog !== key) {
          this._chromeMissLog = key;
          console.warn("[FishAnim] R0008 ui-chrome missing/loading", key);
        }
        return false;
      }
      this.flush();
      // 与 seaflat 同一 letterbox，位移恒为 0（C7：底板/UI 都不跟收线晃）
      var ok = this.paintScene(key, 0, 0, this.width, this.height, 0, 0);
      if (ok) this.flush();
      if (ok && this._chromePaintLog !== key) {
        this._chromePaintLog = key;
        console.log("[FishAnim] R0008 paintFishingUiChrome", key);
      }
      if (this.seaDebugMode === "mask") this.paintSeaDebugOverlay();
      return !!ok;
    },

    /** C0/C1：调试叠层——UI 矩形、船脚、蒙版水线采样点 */
    paintSeaDebugOverlay: function () {
      var navY = this.height - 72;
      this.rect(0, 0, this.width, 64, [1, 0.2, 0.2, 0.18]);
      this.rect(0, navY, this.width, 72, [0.2, 1, 0.3, 0.18]);
      this.rect(20, navY + 8, 130, 48, [1, 1, 0, 0.25]);
      this.rect(170, navY + 8, 130, 48, [1, 1, 0, 0.25]);
      var foot = this.fishingBoatFoot();
      this.circle(foot.x, foot.y, 6, [1, 0, 0, 0.9], 10);
      // 沿若干 X 画蒙版水线点（青色），便于对照岸线
      var xi;
      for (xi = 0; xi < 12; xi++) {
        var sx = Math.round(this.width * (0.08 + xi * 0.07));
        var sy = this.shoreLineAtX(sx);
        if (sy == null || isNaN(sy)) continue;
        this.circle(sx, sy, 3, [0.1, 0.95, 0.95, 0.85], 6);
      }
      var layout = this.fishingSeaLayout();
      if (layout && layout.beachLine != null) {
        this.rect(0, layout.beachLine - 1, this.width, 2, [0.2, 0.9, 1, 0.35]);
      }
      this.flush();
    },

    pulseFrame: function (x, y, width, height) {
      var alpha = 0.45 + Math.sin(Date.now() / 220) * 0.35;
      var color = [0.94, 0.63, 0.2, alpha];
      this.rect(x, y, width, 6, color);
      this.rect(x, y + height - 6, width, 6, color);
      this.rect(x, y, 6, height, color);
      this.rect(x + width - 6, y, 6, height, color);
    },

    /**
     * R0025：地图路牌右上角锁（锁梁 + 锁体），对齐其它未解锁区烤死锁的位置感。
     */
    drawMapPadlock: function (x, y, size) {
      var s = size || 28;
      var bodyW = Math.round(s * 0.72);
      var bodyH = Math.round(s * 0.58);
      var bodyX = Math.round(x - bodyW / 2);
      var bodyY = Math.round(y + s * 0.28);
      var shackleR = Math.round(s * 0.28);
      var metal = [0.22, 0.2, 0.18, 0.92];
      var metalHi = [0.38, 0.35, 0.32, 0.95];
      var hole = [0.1, 0.09, 0.08, 0.95];
      var thick = Math.max(3, Math.round(s * 0.12));
      // 锁梁：上半圆弧（屏坐标系 Y 向下，sin 负向为上）
      var i;
      for (i = 0; i < 12; i++) {
        var a0 = Math.PI + (i / 12) * Math.PI;
        var a1 = Math.PI + ((i + 1) / 12) * Math.PI;
        this.line(
          x + Math.cos(a0) * shackleR,
          bodyY + Math.sin(a0) * shackleR,
          x + Math.cos(a1) * shackleR,
          bodyY + Math.sin(a1) * shackleR,
          thick,
          metal
        );
      }
      this.rect(bodyX, bodyY, bodyW, bodyH, metal);
      this.rect(bodyX + 2, bodyY + 2, bodyW - 4, Math.max(2, Math.round(bodyH * 0.22)), metalHi);
      this.circle(x, bodyY + Math.round(bodyH * 0.42), Math.max(2, Math.round(s * 0.08)), hole, 8);
      this.rect(
        x - Math.max(1, Math.round(s * 0.04)),
        bodyY + Math.round(bodyH * 0.42),
        Math.max(2, Math.round(s * 0.08)),
        Math.round(bodyH * 0.28),
        hole
      );
    },

    /**
     * R0026：红色闪烁箭头，锚在路牌顶边正中上方，三角朝下指木牌文字。
     */
    drawMapGuideArrow: function (zoneRect) {
      if (!zoneRect) return;
      var ax = zoneRect.x + Math.round(zoneRect.w / 2);
      var tipY = zoneRect.y - 2;
      var baseY = tipY - 22;
      var alpha = 0.45 + 0.55 * (0.5 + 0.5 * Math.sin(Date.now() / 260));
      var col = [Math.min(1, C.red[0] * 1.15), C.red[1] * 0.85, C.red[2] * 0.85, alpha];
      this.tri(ax, tipY, ax - 12, baseY, ax + 12, baseY, col);
      this.rect(ax - 3, baseY - 14, 6, 16, col);
    },

    resize: function () {
      var layout = AIGCUtils.Layout || { w: 896, h: 414 };
      var width = layout.w || 896;
      var height = layout.h || 414;
      this.portrait = height > width;
      if (this.portrait) {
        this.width = 540;
        this.height = 960;
      } else {
        this.width = 960;
        this.height = 540;
      }
      this.scale = Math.min(width / this.width, height / this.height);
      this.offsetX = (width - this.width * this.scale) / 2;
      this.offsetY = (height - this.height * this.scale) / 2;
      this.viewWidth = width;
      this.viewHeight = height;
    },

    toDesign: function (x, y) {
      if (!this.scale) this.resize();
      return {
        x: (x - this.offsetX) / this.scale,
        y: (y - this.offsetY) / this.scale
      };
    },

    point: function (x, y) {
      return [
        ((this.offsetX + x * this.scale) / this.viewWidth) * 2 - 1,
        1 - ((this.offsetY + y * this.scale) / this.viewHeight) * 2
      ];
    },

    vertex: function (x, y, color, u, v, textured) {
      var point = this.point(x, y);
      var mode = textured === true ? 1 : (textured || 0);
      this.vertices.push(point[0], point[1], color[0], color[1], color[2], color[3], u || 0, v || 0, mode);
    },

    tri: function (x1, y1, x2, y2, x3, y3, color) {
      this.vertex(x1, y1, color);
      this.vertex(x2, y2, color);
      this.vertex(x3, y3, color);
    },

    rect: function (x, y, width, height, color) {
      this.tri(x, y, x + width, y, x, y + height, color);
      this.tri(x + width, y, x + width, y + height, x, y + height, color);
    },

    circle: function (x, y, radius, color, segments) {
      var count = segments || 24;
      for (var i = 0; i < count; i++) {
        var a = i / count * Math.PI * 2;
        var b = (i + 1) / count * Math.PI * 2;
        this.tri(x, y, x + Math.cos(a) * radius, y + Math.sin(a) * radius, x + Math.cos(b) * radius, y + Math.sin(b) * radius, color);
      }
    },

    ellipse: function (x, y, radiusX, radiusY, color) {
      var count = 28;
      for (var i = 0; i < count; i++) {
        var a = i / count * Math.PI * 2;
        var b = (i + 1) / count * Math.PI * 2;
        this.tri(x, y, x + Math.cos(a) * radiusX, y + Math.sin(a) * radiusY, x + Math.cos(b) * radiusX, y + Math.sin(b) * radiusY, color);
      }
    },

    line: function (x1, y1, x2, y2, width, color) {
      var dx = x2 - x1;
      var dy = y2 - y1;
      var length = Math.sqrt(dx * dx + dy * dy) || 1;
      var px = -dy / length * width / 2;
      var py = dx / length * width / 2;
      this.tri(x1 + px, y1 + py, x2 + px, y2 + py, x1 - px, y1 - py, color);
      this.tri(x2 + px, y2 + py, x2 - px, y2 - py, x1 - px, y1 - py, color);
    },

    textWidth: function (text, size) {
      var value = String(text);
      var font = AIGCUtils.FontAtlas;
      var scale = size / font.fontSize;
      var width = 0;
      for (var i = 0; i < value.length; i++) {
        var glyph = font.glyphs[value[i]];
        if (glyph) width += glyph.advance * scale;
      }
      return width;
    },

    /** 单行文字外框（与 text() 绘制一致），用于在矩形内垂直居中 */
    textLineBounds: function (text, size) {
      var value = String(text);
      var font = AIGCUtils.FontAtlas;
      var scale = size / font.fontSize;
      var minOff = null;
      var maxExt = 0;
      for (var i = 0; i < value.length; i++) {
        var glyph = font.glyphs[value[i]];
        if (!glyph || glyph.w <= 0 || glyph.h <= 0) continue;
        if (minOff === null || glyph.yoffset < minOff) minOff = glyph.yoffset;
        var ext = glyph.yoffset + glyph.h;
        if (ext > maxExt) maxExt = ext;
      }
      if (minOff === null) minOff = 0;
      return { scale: scale, minOff: minOff, maxExt: maxExt };
    },

    textYInBox: function (text, size, boxY, boxHeight) {
      var b = this.textLineBounds(text, size);
      return boxY + boxHeight / 2 - ((b.minOff + b.maxExt) / 2) * b.scale;
    },

    textQuad: function (x, y, width, height, glyph, color) {
      var font = AIGCUtils.FontAtlas;
      var left = glyph.x / font.width;
      var right = (glyph.x + glyph.w) / font.width;
      var top = glyph.y / font.height;
      var bottom = (glyph.y + glyph.h) / font.height;
      this.vertex(x, y, color, left, top, true);
      this.vertex(x + width, y, color, right, top, true);
      this.vertex(x, y + height, color, left, bottom, true);
      this.vertex(x + width, y, color, right, top, true);
      this.vertex(x + width, y + height, color, right, bottom, true);
      this.vertex(x, y + height, color, left, bottom, true);
    },

    text: function (text, x, y, size, color, align) {
      if (!this.fontReady) return;
      this.useTexture(this.fontTexture);
      var value = String(text);
      var font = AIGCUtils.FontAtlas;
      var scale = size / font.fontSize;
      var startX = x;
      if (align === "center") startX -= this.textWidth(value, size) / 2;
      if (align === "right") startX -= this.textWidth(value, size);
      var cursor = startX;
      for (var i = 0; i < value.length; i++) {
        var character = value[i];
        var glyph = font.glyphs[character];
        if (!glyph) {
          if (!this.missingGlyphs[character]) {
            this.missingGlyphs[character] = true;
            console.warn("[Prototype] Font glyph missing", character);
          }
          continue;
        }
        if (glyph.w > 0 && glyph.h > 0) {
          this.textQuad(
            cursor + glyph.xoffset * scale,
            y + glyph.yoffset * scale,
            glyph.w * scale,
            glyph.h * scale,
            glyph,
            color
          );
        }
        cursor += glyph.advance * scale;
      }
    },

    /** 伪加粗：位图字帖无字重，叠绘邻像素模拟黑体加粗（烤鱼引导字用） */
    textBold: function (text, x, y, size, color, align) {
      this.text(text, x + 1, y, size, color, align);
      this.text(text, x, y + 1, size, color, align);
      this.text(text, x + 1, y + 1, size, color, align);
      this.text(text, x, y, size, color, align);
    },

    /**
     * R0031→R0033：全局玩法提示——暖奶油金粗体 + 慢速流光。
     * 色板贴近本游戏 cream / honey，比绿跳、比纯棕闷更贴手绘木牌画风。
     */
    guideTipSize: function () {
      return this.portrait ? 17 : 20;
    },

    drawGuideTip: function (label, x, y, opts) {
      opts = opts || {};
      var size = opts.size != null ? opts.size : this.guideTipSize();
      var align = opts.align || "center";
      if (!label) return;
      var value = String(label);
      var totalW = this.fontReady ? this.textWidth(value, size) : value.length * size * 0.7;
      var startX = x;
      if (align === "center") startX -= totalW / 2;
      if (align === "right") startX -= totalW;
      // R0034/R0035：按字帖真实字形包围盒居中包裹
      // R0036c：无阴影边框；奶油多层由外向内渐隐，边缘淡化融入绿叶
      if (opts.backdrop) {
        var padX = Math.max(12, Math.round(size * 0.7));
        var padY = Math.max(6, Math.round(size * 0.35));
        var bounds = this.textLineBounds(value, size);
        var glyphTop = y + bounds.minOff * bounds.scale;
        var glyphBot = y + bounds.maxExt * bounds.scale;
        var boxX = Math.round(startX - padX);
        var boxY = Math.round(glyphTop - padY);
        var boxW = Math.round(totalW + padX * 2);
        var boxH = Math.max(
          Math.round(glyphBot - glyphTop + padY * 2),
          Math.round(size * 1.1)
        );
        var step = Math.max(3, Math.round(size * 0.18));
        // 由外到内叠淡奶油：外圈几乎透明，中心略实，模拟渐变淡化（无硬边阴影）
        var fadeLayers = [
          { expand: step * 3, a: 0.05 },
          { expand: step * 2, a: 0.08 },
          { expand: step, a: 0.14 },
          { expand: 0, a: 0.26 }
        ];
        for (var fi = 0; fi < fadeLayers.length; fi++) {
          var fl = fadeLayers[fi];
          this.rect(
            boxX - fl.expand,
            boxY - fl.expand,
            boxW + fl.expand * 2,
            boxH + fl.expand * 2,
            [C.cream[0], C.cream[1], C.cream[2], fl.a]
          );
        }
        if (!this._loggedGuideTipBackdrop) {
          this._loggedGuideTipBackdrop = true;
          console.log("[GuideTip] backdrop soft cream fade R0036c");
        }
      }
      // 描边：backdrop 时加粗加深（浅底上仍用深木色压字）
      var stroke = opts.backdrop
        ? [0.22, 0.14, 0.08, 0.78]
        : [0.22, 0.14, 0.08, 0.55];
      if (opts.backdrop) {
        this.text(value, x - 1, y, size, stroke, align);
        this.text(value, x + 1, y, size, stroke, align);
        this.text(value, x, y - 1, size, stroke, align);
        this.text(value, x, y + 1, size, stroke, align);
      }
      this.textBold(value, x, y, size, stroke, align);
      // 主色：暖奶油；流光：蜂蜜金
      var base = [0.98, 0.9, 0.72, 1];
      var hi = [1.0, 0.78, 0.32, 1];
      if (!this.fontReady || !this.fontTexture) {
        this.textBold(value, x, y, size, base, align);
        return;
      }
      var font = AIGCUtils.FontAtlas;
      var scale = size / font.fontSize;
      // R0033：流光约 2.5× 更慢（原 /260 → /650）
      var now = Date.now() / 650;
      this.useTexture(this.fontTexture);
      var cursor = startX;
      var n = Math.max(1, value.length - 1);
      for (var i = 0; i < value.length; i++) {
        var ch = value[i];
        var glyph = font.glyphs[ch];
        if (!glyph) continue;
        var u = i / n;
        var wave = 0.5 + 0.5 * Math.sin(now - u * Math.PI * 1.6);
        var bright = wave * wave;
        var col = [
          base[0] + (hi[0] - base[0]) * bright,
          base[1] + (hi[1] - base[1]) * bright,
          base[2] + (hi[2] - base[2]) * bright,
          1
        ];
        if (glyph.w > 0 && glyph.h > 0) {
          var gx = cursor + glyph.xoffset * scale;
          var gy = y + glyph.yoffset * scale;
          var gw = glyph.w * scale;
          var gh = glyph.h * scale;
          this.textQuad(gx + 1, gy, gw, gh, glyph, col);
          this.textQuad(gx, gy + 1, gw, gh, glyph, col);
          this.textQuad(gx + 1, gy + 1, gw, gh, glyph, col);
          this.textQuad(gx, gy, gw, gh, glyph, col);
        }
        cursor += glyph.advance * scale;
      }
    },

    button: function (x, y, width, height, label, active, fontSize) {
      if (this.uiSkinChrome) {
        if (this.scenes["btn-wood"]) {
          var pad = Math.max(2, Math.min(6, Math.round(Math.min(width, height) * 0.1)));
          this.paintUiStretch("btn-wood", x + pad, y + pad, width - pad * 2, height - pad * 2);
          this.flush();
          var fsSkin = fontSize || 16;
          this.text(
            label,
            x + width / 2,
            this.textYInBox(label, fsSkin, y, height),
            fsSkin,
            [0.22, 0.18, 0.14, active ? 1 : 0.88],
            "center"
          );
        } else {
          var ink = active ? C.ink : [0.42, 0.38, 0.34, 0.92];
          var fsFallback = fontSize || 16;
          this.text(label, x + width / 2, this.textYInBox(label, fsFallback, y, height), fsFallback, ink, "center");
        }
        return;
      }
      if (this.scenes["btn-wood"]) {
        var alpha = active ? 1 : 0.82;
        var fsWood = fontSize || 17;
        this.paintUiStretch("btn-wood", x, y, width, height);
        this.text(
          label,
          x + width / 2,
          this.textYInBox(label, fsWood, y, height),
          fsWood,
          [0.22, 0.18, 0.14, alpha],
          "center"
        );
        return;
      }
      this.rect(x + 3, y + 5, width, height, C.shadow);
      this.rect(x, y, width, height, active ? C.orange : C.wood);
      this.rect(x + 4, y + 4, width - 8, height - 10, active ? C.honey : C.paper);
      var fsVec = fontSize || 17;
      this.text(label, x + width / 2, this.textYInBox(label, fsVec, y, height), fsVec, C.ink, "center");
    },

    progress: function (x, y, width, value, cursor, zoneStart, zoneEnd) {
      var start = zoneStart === undefined ? 0.25 : zoneStart;
      var end = zoneEnd === undefined ? 0.75 : zoneEnd;
      // 填充深橙；游标/进度超出高亮区时更深橙红（钓鱼张力条不走这里）
      var marker = cursor === undefined || cursor === null ? value : cursor;
      var fillColor = C.orange;
      if (marker !== null && marker !== undefined && (marker < start || marker > end)) {
        fillColor = [0.82, 0.25, 0.12, 1];
      }
      if (this.uiSkinChrome) {
        // 绿区加深：原 α0.35 几乎看不见中心带（R0015）
        this.rect(x + width * start, y + 6, width * (end - start), 10, [0.28, 0.62, 0.30, 0.88]);
        this.rect(x + width * marker - 2, y, 4, 22, C.red);
        if (value !== null) this.rect(x, y + 18, width * Math.max(0, Math.min(1, value)), 6, fillColor);
        return;
      }
      this.rect(x - 4, y - 4, width + 8, 32, C.wood);
      this.rect(x, y, width, 24, C.cream);
      this.rect(x + width * start, y, width * (end - start), 24, C.green);
      if (value !== null) this.rect(x, y + 29, width * Math.max(0, Math.min(1, value)), 8, fillColor);
      this.rect(x + width * marker - 3, y - 8, 6, 40, C.red);
    },

    fish: function (x, y, size, cooked, speciesId) {
      var color = C.fish;
      if (speciesId === "salmon") color = C.orange;
      if (speciesId === "tuna") color = C.seaDark;
      if (speciesId === "golden") color = C.honey;
      if (cooked) {
        color = speciesId === "salmon" ? C.wood : speciesId === "tuna" ? C.seaDark : speciesId === "golden" ? C.honey : C.fishCooked;
      }
      this.ellipse(x, y, size, size * (speciesId === "golden" ? 0.58 : 0.48), color);
      this.tri(x - size * 0.75, y, x - size * 1.35, y - size * 0.55, x - size * 1.35, y + size * 0.55, color);
      this.circle(x + size * 0.45, y - size * 0.1, size * 0.09, C.ink, 12);
      if (speciesId === "salmon") {
        this.line(x - size * 0.25, y - size * 0.35, x - size * 0.1, y + size * 0.35, 2, C.cream);
        this.line(x + size * 0.1, y - size * 0.35, x + size * 0.25, y + size * 0.35, 2, C.cream);
      }
      if (speciesId === "tuna" || speciesId === "golden") this.tri(x - size * 0.2, y - size * 0.4, x + size * 0.15, y - size * 0.85, x + size * 0.35, y - size * 0.4, color);
      if (cooked) {
        this.line(x - size * 0.35, y - size * 0.3, x - size * 0.1, y + size * 0.3, 3, C.brown);
        this.line(x + size * 0.05, y - size * 0.3, x + size * 0.3, y + size * 0.3, 3, C.brown);
      }
    },

    coconut: function (x, y, radius, golden) {
      if (golden) this.circle(x, y, radius + 3, C.honey);
      this.circle(x, y, radius, golden ? C.honey : C.brown);
      this.circle(x - radius * 0.25, y - radius * 0.2, radius * 0.12, C.ink, 10);
      this.circle(x + radius * 0.2, y - radius * 0.25, radius * 0.12, C.ink, 10);
      this.circle(x, y + radius * 0.2, radius * 0.12, C.ink, 10);
    },

    juice: function (x, y, size, withStraw) {
      this.rect(x - size * 0.45, y - size * 0.55, size * 0.9, size * 1.1, C.cream);
      this.rect(x - size * 0.35, y - size * 0.1, size * 0.7, size * 0.55, C.honey);
      if (withStraw !== false) this.line(x + size * 0.1, y - size * 0.55, x + size * 0.5, y - size, 5, C.orange);
      this.coconut(x - size * 0.15, y - size * 0.3, size * 0.22);
    },

    rabbit: function (x, y, size) {
      this.ellipse(x - size * 0.28, y - size * 1.25, size * 0.2, size * 0.65, C.white);
      this.ellipse(x + size * 0.28, y - size * 1.25, size * 0.2, size * 0.65, C.white);
      this.ellipse(x, y + size * 0.65, size * 0.75, size * 0.85, C.white);
      this.circle(x, y, size * 0.78, C.white);
      this.circle(x - size * 0.25, y - size * 0.05, size * 0.08, C.ink, 12);
      this.circle(x + size * 0.25, y - size * 0.05, size * 0.08, C.ink, 12);
      this.circle(x, y + size * 0.18, size * 0.07, C.orange, 12);
      this.rect(x - size * 0.45, y + size * 0.45, size * 0.9, size * 0.85, C.paper);
      this.circle(x - size * 0.35, y - size * 0.85, size * 0.34, C.white);
      this.circle(x, y - size * 0.98, size * 0.38, C.white);
      this.circle(x + size * 0.35, y - size * 0.85, size * 0.34, C.white);
    },

    rabbitBack: function (x, y, size) {
      // 背向玩家版：耳朵 + 头 + 短身躯 + 小尾巴
      this.ellipse(x - size * 0.28, y - size * 1.1, size * 0.18, size * 0.55, C.white);  // 左耳
      this.ellipse(x + size * 0.28, y - size * 1.1, size * 0.18, size * 0.55, C.white);  // 右耳
      this.circle(x - size * 0.32, y - size * 0.78, size * 0.3, C.white);  // 头后左
      this.circle(x, y - size * 0.9, size * 0.34, C.white);                // 头顶
      this.circle(x + size * 0.32, y - size * 0.78, size * 0.3, C.white);  // 头后右
      this.circle(x, y, size * 0.72, C.white);                              // 头/颈
      this.ellipse(x, y + size * 0.42, size * 0.65, size * 0.5, C.white);  // 短身躯
      this.circle(x, y + size * 0.78, size * 0.18, C.white);               // 小尾巴
    },

    customer: function (x, y, wants, active) {
      if (!active) {
        this.text("完成", x, y, 20, C.green, "center");
        return;
      }
      this.ellipse(x, y + 28, 45, 48, wants === "fish_grilled" ? C.woodLight : C.honey);
      this.circle(x, y, 42, wants === "fish_grilled" ? C.woodLight : C.honey);
      this.circle(x - 25, y - 30, 15, C.woodLight);
      this.circle(x + 25, y - 30, 15, C.woodLight);
      this.circle(x - 14, y - 4, 5, C.ink, 10);
      this.circle(x + 14, y - 4, 5, C.ink, 10);
      this.rect(x - 75, y - 100, 150, 48, C.cream);
      if (wants === "fish_grilled") {
        this.fish(x, y - 76, 25, true);
      } else {
        this.juice(x, y - 77, 28);
      }
    },

    palm: function (x, y, scale) {
      this.line(x, y + 150 * scale, x + 15 * scale, y, 24 * scale, C.wood);
      this.line(x + 15 * scale, y, x - 90 * scale, y - 50 * scale, 22 * scale, C.leaf);
      this.line(x + 15 * scale, y, x + 110 * scale, y - 55 * scale, 22 * scale, C.leaf);
      this.line(x + 15 * scale, y, x - 65 * scale, y + 25 * scale, 20 * scale, C.leafLight);
      this.line(x + 15 * scale, y, x + 90 * scale, y + 30 * scale, 20 * scale, C.leafLight);
      this.coconut(x - 5 * scale, y + 18 * scale, 15 * scale);
      this.coconut(x + 30 * scale, y + 20 * scale, 15 * scale);
    },

    hudBarY: 10,
    hudBarH: 44,
    // 竖屏顶栏唯一权威：透明木板条 ui-hud-chrome-port + 下列叠字参数（全区共用）
    // barY 19→22：几何居中后中文位图视觉重心仍偏上，整体下移 3 与图标齐平
    hudBarYPort: 22,
    hudBarHPort: 27,
    hudChromeKeyPort: "ui-hud-chrome-port",
    hudSlotCxPort: [0.319, 0.446, 0.575, 0.705, 0.829],
    /** 竖屏只叠钓鱼区抠出的木板条（不带场景背景），数字另用钓鱼槽位参数 */
    paintSharedHudChromePort: function () {
      if (!this.portrait || !this.uiSkinChrome) return false;
      var key = this.hudChromeKeyPort || "ui-hud-chrome-port";
      if (!this.scenes[key]) {
        if (!this.sceneLoading[key] && !this.sceneFailed[key]) this.loadScenes();
        return false;
      }
      // 素材宽高比 → 设计宽度下的绘制高度（1152x154 ≈ 设计高 72）
      var aspect = this.sceneAspect[key] || (1152 / 154);
      var h = Math.max(1, Math.round(this.width / aspect));
      this.flush();
      var ok = this.paintUiRegion(key, 0, 0, this.width, h, 0, 0, 1, 1);
      if (ok) this.flush();
      if (ok && this._hudChromeLogKey !== key + ":" + h) {
        this._hudChromeLogKey = key + ":" + h;
        console.log("[HUD] portrait shared chrome strip", key, "h", h);
      }
      return ok;
    },
    hudSlotCenters: function () {
      if (this.portrait) {
        var list = this.hudSlotCxPort || [];
        var out = [];
        for (var i = 0; i < list.length; i++) {
          out.push({ cx: list[i], text: null });
        }
        return out;
      }
      return [
        { cx: 0.4025, text: null },
        { cx: 0.5225, text: null },
        { cx: 0.6525, text: null },
        { cx: 0.7875, text: null },
        { cx: 0.912, text: null }
      ];
    },

    drawHudMetric: function (line, slotIndex, size) {
      var slots = this.hudSlotCenters();
      var slot = slots[slotIndex];
      if (!slot) return;
      var cx = Math.round(this.width * slot.cx);
      var barY = this.portrait ? this.hudBarYPort : this.hudBarY;
      var barH = this.portrait ? this.hudBarHPort : this.hudBarH;
      var y = this.textYInBox(line, size, barY, barH);
      var area = AIGCUtils.Game && AIGCUtils.Game.currentArea;
      var logKey = (area || "") + "/" + barY + "/" + barH + "/" + size + "/" + cx;
      if (this.portrait && slotIndex === 0 && this._hudPortLogKey !== logKey) {
        this._hudPortLogKey = logKey;
        console.log("[HUD] portrait metric", area, "shared-fish", "bar", barY, barH, "size", size, "y0", Math.round(y), "cx0", cx);
      }
      this.text(line, cx, y, size, C.ink, "center");
    },

    drawHUD: function () {
      var state = AIGCUtils.GameState;
      var W = this.width;
      if (!this.uiSkinChrome) {
        this.rect(0, 0, W, 64, C.cream);
        this.rect(0, 60, W, 4, C.wood);
      }
      var fs = this.uiSkinChrome ? (this.portrait ? 12 : 15) : this.portrait ? 15 : 17;
      if (this.uiSkinChrome) {
        this.drawHudMetric("第" + state.day + "天", 0, fs);
        this.drawHudMetric("金币" + state.coins, 1, fs);
        this.drawHudMetric("鱼肉" + state.ingredients.fish, 2, fs);
        this.drawHudMetric("椰子" + state.ingredients.coconut, 3, fs);
        this.drawHudMetric("等级" + state.level, 4, fs);
        return;
      }
      if (this.portrait) {
        this.text("孤岛烤鱼店", 10, 16, 17, C.ink);
        this.text("第" + state.day + "天", 115, 21, 15, C.ink);
        this.text("金币" + state.coins, 192, 21, 15, C.ink);
        this.text("鱼肉" + state.ingredients.fish, 271, 21, 15, C.ink);
        this.text("椰子" + state.ingredients.coconut, 350, 21, 15, C.ink);
        this.text("等级" + state.level, 429, 21, 15, C.ink);
      } else {
        this.text("孤岛烤鱼店", 20, 16, 17, C.ink);
        this.text("第" + state.day + "天", 350, 21, 17, C.ink);
        this.text("金币 " + state.coins, 445, 21, 17, C.ink);
        this.text("鱼肉 " + state.ingredients.fish, 575, 21, 17, C.ink);
        this.text("椰子 " + state.ingredients.coconut, 700, 21, 17, C.ink);
        this.text("等级 " + state.level, 830, 21, 17, C.ink);
      }
    },

    drawNav: function () {
      var W = this.width, H = this.height;
      var navY = H - 72;
      var fishEnergy = AIGCUtils.Energy.get("fish");
      var coconutEnergy = AIGCUtils.Energy.get("coconut");
      var energyText = this.portrait
        ? "钓" + fishEnergy.value + "/" + fishEnergy.max + " 摘" + coconutEnergy.value + "/" + coconutEnergy.max
        : "钓鱼体力 " + fishEnergy.value + "/" + fishEnergy.max + "  采摘体力 " + coconutEnergy.value + "/" + coconutEnergy.max;
      if (this.uiSkinChrome) {
        var enSize = this.portrait ? 14 : 15;
        var enY = this.textYInBox(energyText, enSize, navY + 10, 52);
        this.text(energyText, W - 12, enY, enSize, C.ink, "right");
        return;
      }
      this.rect(0, navY, W, 72, C.cream);
      this.rect(0, navY, W, 4, C.wood);
      this.button(20, navY + 8, 130, 48, "地图", AIGCUtils.Game.currentArea === "map");
      this.button(170, navY + 8, 130, 48, "背包", false);
      this.text(energyText, W - 10, navY + 27, 17, C.ink, "right");
    },

    drawMap: function () {
      var W = this.width, H = this.height;
      var ct = 64, cb = H - 72, ch = cb - ct;
      var hw = Math.round(W / 2);
      if (!this.artOn) this.rect(0, ct, W, ch, C.sea);
      if (this.portrait) {
        // 竖屏：三区域上中下分布
        var zoneH = Math.round(ch * 0.27);
        var gap = Math.round(ch * 0.035);
        var fishY = ct + gap;
        var coconutY = ct + zoneH + gap * 2;
        var shopY = ct + zoneH * 2 + gap * 3;
        if (!this.artOn) {
          this.ellipse(hw, ct + ch * 0.5, W * 0.38, ch * 0.28, C.sand);
          this.rect(10, fishY, W - 20, zoneH, C.paper);
          this.rect(10, coconutY, W - 20, zoneH, C.leafLight);
          this.rect(10, shopY, W - 20, zoneH, AIGCUtils.GameState.shopBuilt ? C.honey : C.woodLight);
        } else {
          // R0025：引导进行中用红箭头，完成后保留旧脉冲框
          var OnbPulse = AIGCUtils.Onboarding;
          if (!OnbPulse || OnbPulse.isDone()) {
            var nextZone = fishY;
            if (AIGCUtils.GameState.fishCaught >= 3 && !AIGCUtils.GameState.tasks.coconut && !AIGCUtils.GameState.shopBuilt) nextZone = coconutY;
            else if (AIGCUtils.GameState.shopBuilt || AIGCUtils.GameState.tasks.coconut) nextZone = shopY;
            this.pulseFrame(10, nextZone, W - 20, zoneH);
          }
        }
        if (!this.artOn) {
          this.fish(70, fishY + zoneH * 0.5, 36, false);
          this.palm(90, coconutY + zoneH * 0.35, 0.42);
        }
        if (this.uiSkinChrome) {
          var pz = AIGCUtils.MapZones.port;
          var OnbP = AIGCUtils.Onboarding;
          // R0025：灰块改为锁图标；教程箭头由 drawMapGuideArrow 绘制
          if (OnbP ? OnbP.isCoconutLocked() : !AIGCUtils.GameState.tasks.fish) {
            this.drawMapPadlock(pz.coconut.x + pz.coconut.w - 22, pz.coconut.y + 18, 32);
          }
          if (OnbP ? OnbP.isShopLocked() : !AIGCUtils.GameState.shopBuilt) {
            this.drawMapPadlock(pz.shop.x + pz.shop.w - 22, pz.shop.y + 18, 32);
          }
          if (OnbP && OnbP.arrowZone) {
            var arrowPort =
              OnbP.arrowZone === "fishing"
                ? pz.fish
                : OnbP.arrowZone === "coconut"
                  ? pz.coconut
                  : OnbP.arrowZone === "shop"
                    ? pz.shop
                    : null;
            this.drawMapGuideArrow(arrowPort);
          }
        } else {
          this.text("钓鱼区", hw, fishY + zoneH * 0.45, 26, C.ink, "center");
          this.text("椰林区", hw, coconutY + zoneH * 0.45, 26, C.ink, "center");
          this.text(AIGCUtils.GameState.shopBuilt ? "烤鱼店" : "待搭建", hw, shopY + zoneH * 0.45, 26, C.ink, "center");
          if (AIGCUtils.GameState.fishCaught >= 3 && !AIGCUtils.GameState.tasks.coconut && !AIGCUtils.GameState.shopBuilt) {
            this.text("新目标 采摘椰子", hw, coconutY + zoneH * 0.72, 17, C.ink, "center");
          }
        }
        var offlineLit = !!AIGCUtils.GameState.pendingOffline || AIGCUtils.GameState.playTimeMs >= AIGCUtils.Game.offlineUnlockMs;
        var offlineLabel = AIGCUtils.GameState.pendingOffline ? "领取" : "离线";
        this.button(hw - 140, cb - 62, 280, 48, offlineLabel, offlineLit);
      } else {
        if (!this.artOn) {
          this.ellipse(480, 270, 405, 185, C.sand);
          this.line(310, 235, 480, 350, 16, C.paper);
          this.line(480, 350, 660, 220, 16, C.paper);
          this.rect(80, 105, 330, 180, C.paper);
          this.rect(520, 90, 330, 180, C.leafLight);
          this.rect(330, 295, 330, 150, AIGCUtils.GameState.shopBuilt ? C.honey : C.woodLight);
        } else {
          // R0025：引导进行中用红箭头，完成后保留旧脉冲框
          var OnbL = AIGCUtils.Onboarding;
          if (!OnbL || OnbL.isDone()) {
            var mapZ = AIGCUtils.MapZones.land;
            var guide = mapZ.fish;
            if (AIGCUtils.GameState.fishCaught >= 3 && !AIGCUtils.GameState.tasks.coconut && !AIGCUtils.GameState.shopBuilt) guide = mapZ.coconut;
            else if (AIGCUtils.GameState.shopBuilt || AIGCUtils.GameState.tasks.coconut) guide = mapZ.shop;
            this.pulseFrame(guide.x, guide.y, guide.w, guide.h);
          }
        }
        if (!this.artOn) {
          this.fish(185, 175, 48, false);
          this.palm(610, 150, 0.45);
        }
        if (this.uiSkinChrome) {
          var mz = AIGCUtils.MapZones.land;
          var OnbM = AIGCUtils.Onboarding;
          if (OnbM ? OnbM.isCoconutLocked() : !AIGCUtils.GameState.tasks.fish) {
            this.drawMapPadlock(mz.coconut.x + mz.coconut.w - 18, mz.coconut.y + 14, 26);
          }
          if (OnbM ? OnbM.isShopLocked() : !AIGCUtils.GameState.shopBuilt) {
            this.drawMapPadlock(mz.shop.x + mz.shop.w - 18, mz.shop.y + 14, 26);
          }
          if (OnbM && OnbM.arrowZone) {
            var arrowLand =
              OnbM.arrowZone === "fishing"
                ? mz.fish
                : OnbM.arrowZone === "coconut"
                  ? mz.coconut
                  : OnbM.arrowZone === "shop"
                    ? mz.shop
                    : null;
            this.drawMapGuideArrow(arrowLand);
          }
        } else {
          this.text("钓鱼区", 280, 160, 28, C.ink, "center");
          this.text("椰林区", 735, 150, 28, C.ink, "center");
          this.text(AIGCUtils.GameState.shopBuilt ? "烤鱼店" : "待搭建", 495, 345, 28, C.ink, "center");
          this.text("地图", 480, 76, 22, C.cream, "center");
          if (AIGCUtils.GameState.fishCaught >= 3 && !AIGCUtils.GameState.tasks.coconut && !AIGCUtils.GameState.shopBuilt) {
            this.text("新目标 采摘椰子", 735, 210, 17, C.ink, "center");
          }
        }
        var offlineLitLand = !!AIGCUtils.GameState.pendingOffline || AIGCUtils.GameState.playTimeMs >= AIGCUtils.Game.offlineUnlockMs;
        var offlineLabelLand = AIGCUtils.GameState.pendingOffline ? "领取" : "离线";
        this.button(675, 405, 250, 48, offlineLabelLand, offlineLitLand);
      }
    },

    drawFishing: function () {
      var W = this.width, H = this.height;
      var ct = 64, cb = H - 72, ch = cb - ct;
      var hw = Math.round(W / 2);
      var collection = AIGCUtils.Collection;
      var struggling = collection.phase === "reeling";
      var pull = struggling && collection.reelHeld ? Math.sin(collection.timer / 75) * 9 : 0;

      if (this.portrait) {
        // ── 竖屏布局 ──
        var uiH = Math.round(ch * 0.25);   // 上方操控区高度
        var skyH = Math.round(ch * 0.12);  // 天空
        var seaTop = ct + uiH + skyH;
        var seaH = cb - seaTop;
        if (!this.artOn) {
          this.rect(0, ct + uiH, W, skyH, C.sky);
          this.rect(0, seaTop, W, seaH, C.sea);
        }
        if (!this.uiSkinChrome) {
          this.rect(0, ct, W, uiH, C.cream);
          this.rect(0, ct + uiH - 4, W, 4, C.wood);
        }
        if (!this.uiSkinChrome) {
          this.rect(10, ct + 8, W - 120, 38, C.paper);
          this.text("1选点 2选饵 3抛竿 4等咬钩 5提竿", hw - 50, ct + 18, 14, C.ink, "center");
        }
        this.button(W - 108, ct + 8, 98, 38, "离开", false);
        if (!this.artOn) {
          for (var i = 0; i < 6; i++) {
            this.line(seaTop > 0 ? 40 + i * 80 : 0, seaTop + 22 + (i % 2) * 26, 70 + i * 80, seaTop + 22 + (i % 2) * 26, 4, C.cream);
          }
          var islandY = seaTop + Math.round(seaH * 0.78);
          this.ellipse(80, islandY + 28, 108, 42, C.sand);
          this.rabbit(70 - Math.abs(pull) * 0.5, islandY - 26 + Math.abs(pull) * 0.25, 34);
          var rodTipX = 120 + pull;
          var rodTipY = islandY - 78 + Math.abs(pull) * 0.5;
          this.line(105, islandY - 18, rodTipX, rodTipY, 5, C.wood);
          var bubblePulse = 4 + Math.sin(Date.now() / 350) * 2;
          for (var bubble = 0; bubble < 5; bubble++) {
            this.circle(collection.bubbleX - 28 + bubble * 14, collection.bubbleY + (bubble % 2) * 10, bubblePulse, C.cream, 12);
          }
          var fishX, fishY2;
          if (collection.phase === "idle") {
            fishX = rodTipX + 28;
            fishY2 = seaTop + 25;
          } else {
            fishX = collection.hookX + (struggling ? Math.sin(collection.timer / 90) * 16 : 0);
            var biteDrop = collection.phase === "bite" ? 18 : 0;
            fishY2 = collection.hookY + biteDrop + (struggling ? Math.cos(collection.timer / 110) * 8 : collection.phase === "waiting" ? Math.sin(collection.timer / 70) * 4 : 0);
          }
          if (rodTipY < seaTop && fishY2 >= seaTop) {
            var lineT = (seaTop - rodTipY) / (fishY2 - rodTipY);
            var waterEntryX = rodTipX + lineT * (fishX - rodTipX);
            this.line(rodTipX, rodTipY, waterEntryX, seaTop, 2, C.ink);
            this.line(waterEntryX, seaTop, fishX, fishY2, 2, C.seaDark);
          } else {
            this.line(rodTipX, rodTipY, fishX, fishY2, 2, C.ink);
          }
          this.circle(fishX, fishY2, 7, C.orange);
          if (struggling) {
            this.fish(fishX + 12, fishY2 + 28, 22, false);
            this.drawGuideTip("绿色区按住收线 松开放线", hw, seaTop + 40, { size: 16 });
          }
          if (collection.phase === "fishCaught") {
            var caughtT = Math.min(1, collection.timer / 850);
            this.fish(hw + caughtT * 80, seaTop + seaH * 0.35 - Math.sin(caughtT * Math.PI) * 120, 36, false);
            this.text("钓到了", hw, seaTop + 36, 26, C.cream, "center");
          }
        } else {
          this.drawArtFishingMotion();
        }
        if (collection.phase === "fishEscaped") {
          var escapedT = Math.min(1, collection.timer / 850);
          this.paintEscapedFish(hw + escapedT * 160, seaTop + seaH * 0.35 + escapedT * 55, 28);
          this.drawFishEscapedDialog(hw, Math.round(H / 2));
          return;
        }
        var instr = "按住抛竿";
        if (collection.phase === "charging") instr = "松开甩竿";
        if (collection.phase === "cast_anim") instr = "抛竿中";
        if (collection.phase === "waiting") instr = "等待浮标下沉再提竿";
        if (collection.phase === "bite") instr = "咬钩了 立即提竿";
        if (collection.phase === "reeling") instr = "进度条到绿色长条区域时长按";
        if (collection.phase === "idle") instr = "选中浅滩与蚯蚓 按住抛竿";
        var instrY = this.uiSkinChrome ? ct + 78 : seaTop + (struggling ? 64 : 40);
        // R0031：统一绿色流光粗体提示
        this.drawGuideTip(instr, hw, instrY, {
          size: collection.phase === "reeling" ? (this.portrait ? 15 : 17) : this.guideTipSize()
        });
        // 进度条
        var barY = cb - 110;
        if (collection.phase === "charging") this.progress(20, barY, W - 40, collection.power, collection.power, 0.4, 0.7);
        if (collection.phase === "reeling") {
          this.progress(20, barY, W - 40, collection.reelProgress, collection.reelCursor, 0.35, 0.65);
          var tensionGroove = [0.28, 0.16, 0.09, 1];
          var tensionFill = collection.tension > 0.8 ? C.red : C.orange;
          this.text("线张力", 20, barY + 24, 13, this.uiSkinChrome ? C.ink : C.cream, "left");
          this.rect(20, barY + 38, W - 40, 11, tensionGroove);
          this.rect(20, barY + 38, (W - 40) * Math.min(1, Math.max(0, collection.tension)), 11, tensionFill);
        }
        // 主操作按钮。待机和蓄力时入口还在左侧，抛竿钮靠右让开
        var actY = cb - 58;
        var castPort = this.fishingCastPortButton();
        if (collection.phase === "idle") this.button(castPort.x, castPort.y, castPort.w, castPort.h, "按住抛竿", true);
        if (collection.phase === "charging") this.button(castPort.x, castPort.y, castPort.w, castPort.h, "松开抛竿 " + Math.round(collection.power * 100) + "%", true);
        if (collection.phase === "cast_anim") this.button(hw - 120, actY, 240, 50, "抛竿中", false);
        if (collection.phase === "waiting") this.button(hw - 120, actY, 240, 50, "提竿", false);
        if (collection.phase === "bite") this.button(hw - 120, actY, 240, 50, "立即提竿", true);
        if (collection.phase === "reeling") this.button(hw - 140, actY, 280, 52, collection.reelHeld ? "收线中 松开可放线" : "按住收线 松开放线", true);
        // 钓具画在兔子和抛竿按钮之后，展开的木牌才不会被船舱挡住
        this.drawFishingGear(collection, true);

      } else {
        if (!this.artOn) {
          this.rect(0, 64, 960, 404, C.sky);
          this.rect(0, 150, 960, 318, C.sea);
        }
        if (!this.uiSkinChrome) {
          this.rect(20, 72, 810, 42, C.cream);
          this.text("1选点  2看气泡  3选饵  4抛竿  5等咬钩  6提竿  7拉锯", 425, 82, 17, C.ink, "center");
        }
        this.button(835, 72, 100, 42, "离开", false);
        if (!this.artOn) {
          for (var i = 0; i < 8; i++) {
            this.line(300 + i * 85, 205 + (i % 3) * 52, 340 + i * 85, 205 + (i % 3) * 52, 4, C.cream);
          }
          this.ellipse(125, 415, 180, 75, C.sand);
          this.rabbit(145 - Math.abs(pull) * 0.5, 280 + Math.abs(pull) * 0.25, 42);
          this.line(185, 260, 350 + pull, 180 + Math.abs(pull) * 0.5, 6, C.wood);
          var bubblePulse = 4 + Math.sin(Date.now() / 350) * 2;
          for (var bubble = 0; bubble < 5; bubble++) {
            this.circle(collection.bubbleX - 32 + bubble * 16, collection.bubbleY + (bubble % 2) * 12, bubblePulse, C.cream, 12);
          }
          var lsRodTipX = 350 + pull, lsRodTipY = 180 + Math.abs(pull) * 0.5;
          var fishX, fishY2;
          if (collection.phase === "idle") {
            fishX = lsRodTipX + 28;
            fishY2 = 175;
          } else {
            fishX = collection.hookX + (struggling ? Math.sin(collection.timer / 90) * 20 : 0);
            var biteDrop = collection.phase === "bite" ? 20 : 0;
            fishY2 = collection.hookY + biteDrop + (struggling ? Math.cos(collection.timer / 110) * 9 : collection.phase === "waiting" ? Math.sin(collection.timer / 70) * 4 : 0);
          }
          this.line(lsRodTipX, lsRodTipY, fishX, fishY2, 2, C.ink);
          this.circle(fishX, fishY2, 8, C.orange);
          if (struggling) {
            this.fish(fishX + 15, fishY2 + 36, 27, false);
            this.drawGuideTip("绿色区按住收线 松开放线", 600, 170, { size: 18 });
          }
          if (collection.phase === "fishCaught") {
            var caughtT = Math.min(1, collection.timer / 850);
            this.fish(460 + caughtT * 100, 300 - Math.sin(caughtT * Math.PI) * 150, 42, false);
            this.text("钓到了", 610, 175, 30, C.cream, "center");
          }
        } else {
          this.drawArtFishingMotion();
        }
        if (collection.phase === "fishEscaped") {
          var escapedT = Math.min(1, collection.timer / 850);
          this.paintEscapedFish(470 + escapedT * 210, 300 + escapedT * 70, 34);
          this.drawFishEscapedDialog(480, 270);
          return;
        }
        var instruction = "按住抛竿";
        if (collection.phase === "charging") instruction = "松开甩竿";
        if (collection.phase === "cast_anim") instruction = "抛竿中";
        if (collection.phase === "waiting") instruction = "等待浮标下沉再提竿";
        if (collection.phase === "bite") instruction = "咬钩了 立即提竿";
        if (collection.phase === "reeling") instruction = "进度条到绿色长条区域时长按";
        if (collection.phase === "idle") instruction = "选中浅滩与蚯蚓 按住抛竿";
        var landInstrY = this.uiSkinChrome ? 118 : 225;
        this.drawGuideTip(instruction, 600, landInstrY, {
          size: collection.phase === "reeling" ? 17 : this.guideTipSize()
        });
        if (collection.phase === "charging") this.progress(350, 340, 480, collection.power, collection.power, 0.4, 0.7);
        if (collection.phase === "reeling") {
          this.progress(350, 340, 480, collection.reelProgress, collection.reelCursor, 0.35, 0.65);
          var tensionGroove = [0.28, 0.16, 0.09, 1];
          var tensionFill = collection.tension > 0.8 ? C.red : C.orange;
          this.text("线张力", 330, 375, 16, this.uiSkinChrome ? C.ink : C.cream, "right");
          this.rect(350, 378, 480, 12, tensionGroove);
          this.rect(350, 378, 480 * Math.min(1, Math.max(0, collection.tension)), 12, tensionFill);
        }
        // R0039：横屏主操作钮统一锚在「按住抛竿」位 (520,405,240,50)，各阶段不跳位
        var landAct = { x: 520, y: 405, w: 240, h: 50 };
        if (collection.phase === "idle") this.button(landAct.x, landAct.y, landAct.w, landAct.h, "按住抛竿", true);
        if (collection.phase === "charging") this.button(landAct.x, landAct.y, landAct.w, landAct.h, "松开抛竿 " + Math.round(collection.power * 100) + "%", true);
        if (collection.phase === "cast_anim") this.button(landAct.x, landAct.y, landAct.w, landAct.h, "抛竿中", false);
        if (collection.phase === "waiting") this.button(landAct.x, landAct.y, landAct.w, landAct.h, "提竿", false);
        if (collection.phase === "bite") this.button(landAct.x, landAct.y, landAct.w, landAct.h, "立即提竿", true);
        if (collection.phase === "reeling") this.button(landAct.x, landAct.y, landAct.w, landAct.h, collection.reelHeld ? "收线中 松开可放线" : "按住收线 松开放线", true);
        this.drawFishingGear(collection, false);
      }
    },

    /**
     * 三棵可摇的椰子树。x 与 input.js 的 treeAt 一致。
     * 横屏大筐盖住中间树干下端，小筐盖住右边树干下端。接椰子落在小筐中心。
     * 竖屏只在沙滩右侧原筐位置画小筐，不画大筐。
     */
    coconutArtLayout: function () {
      var W = this.width;
      var xs = this.portrait
        ? [Math.round(W * 0.276), Math.round(W * 0.5), Math.round(W * 0.724)]
        : [265, 480, 695];
      var landBig = { x: xs[1], y: 436, h: 94 };
      var landSmall = { x: xs[2], y: 440, h: 103 };
      var portSmall = { x: 397, y: 750, h: 112 };
      return {
        xs: xs,
        rootY: this.portrait ? 730 : 432,
        treeH: this.portrait ? 560 : 384,
        basket: this.portrait ? { x: portSmall.x, y: portSmall.y } : { x: landSmall.x, y: landSmall.y },
        bigBasket: this.portrait ? null : landBig,
        smallBasket: this.portrait ? portSmall : landSmall,
        nutH: this.portrait ? 40 : 34
      };
    },

    // 树上那串青椰的位置，相对抠图内容区。v 从上往下。
    coconutCrownUV: { u: 0.5, v: 0.32 },

    coconutTreePose: function (index) {
      var layout = this.coconutArtLayout();
      var shakes = AIGCUtils.Collection && AIGCUtils.Collection.treeShakes;
      var shake = shakes ? shakes[index] || 0 : 0;
      return {
        x: layout.xs[index],
        y: layout.rootY,
        h: layout.treeH,
        rot: shake > 0 ? Math.sin(shake / 28) * 0.11 : 0,
        shake: shake
      };
    },

    coconutCrownPoint: function (index) {
      var pose = this.coconutTreePose(index);
      var frame = this.spriteFrame("coconut_tree", 0, pose.h);
      if (!frame) return null;
      var dx = (this.coconutCrownUV.u - 0.5) * frame.w;
      var dy = -(1 - this.coconutCrownUV.v) * frame.h;
      var c = Math.cos(pose.rot);
      var s = Math.sin(pose.rot);
      return {
        x: pose.x + dx * c - dy * s,
        y: pose.y + dx * s + dy * c
      };
    },

    coconutBasketAnchor: function () {
      if (!this.artOn || !this.uiSkinChrome) return null;
      return this.coconutArtLayout().basket;
    },

    drawArtCoconutGrove: function () {
      var layout = this.coconutArtLayout();
      var shakes = (AIGCUtils.Collection && AIGCUtils.Collection.treeShakes) || [0, 0, 0];
      var order = [0, 1, 2];
      order.sort(function (a, b) { return (shakes[a] > 0 ? 1 : 0) - (shakes[b] > 0 ? 1 : 0); });
      for (var n = 0; n < order.length; n++) {
        var i = order[n];
        var pose = this.coconutTreePose(i);
        var drawn = this.paintFootSprite("coconut_tree", pose.x, pose.y, 0, pose.h, false, { rot: pose.rot });
        if (!drawn && !this.cocoTreeMiss) {
          this.cocoTreeMiss = true;
          console.warn("[CoconutArt] tree sprite missing");
        }
        if (pose.shake > 300 && this.cocoSwayLog !== i) {
          this.cocoSwayLog = i;
          var crown = this.coconutCrownPoint(i);
          console.log("[CoconutArt] sway", i, "root", pose.x, pose.y, "crown", crown ? Math.round(crown.x) + "," + Math.round(crown.y) : "missing");
        }
      }
      if (this.portrait) this.drawPortCoconutBasket(layout);
      else this.drawLandCoconutBaskets(layout);
      if (shakes[0] <= 0 && shakes[1] <= 0 && shakes[2] <= 0) this.cocoSwayLog = -1;
      var mark = (this.portrait ? "port" : "land") + ":" + layout.xs.join(",");
      if (this.cocoArtLog !== mark) {
        this.cocoArtLog = mark;
        var big = layout.bigBasket;
        console.log("[CoconutArt] slots", layout.xs.join(","), "rootY", layout.rootY, "basket", layout.basket.x, layout.basket.y, "big", big ? big.x + "," + big.y : "none");
      }
    },

    // 竖屏只画小筐，中心是接椰子和数量字的位置。画在三棵树之后，盖住右边树干下端。
    drawPortCoconutBasket: function (layout) {
      var small = layout.smallBasket;
      if (!small) return;
      var drew = this.paintCenterSprite("coconut_basket_small", small.x, small.y, small.h, {});
      if (!drew && !this.cocoPortBasketMiss) {
        this.cocoPortBasketMiss = true;
        console.warn("[CoconutArt] portrait basket sprite missing");
      }
    },

    // 横屏大筐只摆放，小筐中心是接椰子和数量字的位置。画在三棵树之后，盖住树干下端。
    drawLandCoconutBaskets: function (layout) {
      var big = layout.bigBasket;
      var small = layout.smallBasket;
      if (!big || !small) return;
      var drewBig = this.paintCenterSprite("coconut_basket_big", big.x, big.y, big.h, {});
      var drewSmall = this.paintCenterSprite("coconut_basket_small", small.x, small.y, small.h, {});
      if ((!drewBig || !drewSmall) && !this.cocoBasketMiss) {
        this.cocoBasketMiss = true;
        console.warn("[CoconutArt] basket sprite missing", "big", !!drewBig, "small", !!drewSmall);
      }
    },

    drawCoconut: function () {
      var W = this.width, H = this.height;
      var ct = 64, cb = H - 72, ch = cb - ct;
      var hw = Math.round(W / 2);
      var collection = AIGCUtils.Collection;
      var treeX = collection.getTreeX ? collection.getTreeX() : [Math.round(W * 0.276), Math.round(W * 0.5), Math.round(W * 0.724)];
      var groundRatio = this.portrait ? 0.72 : 0.64;
      var groundY = ct + Math.round(ch * groundRatio);
      var sandH = cb - groundY;
      if (this.uiSkinChrome && this.artOn) {
        this.drawArtCoconutGrove();
      } else if (!this.artOn) {
        this.rect(0, ct, W, groundY - ct, C.leafLight);
        this.rect(0, groundY, W, sandH, C.sand);
        for (var i = 0; i < 3; i++) {
          var shakeX = collection.treeShakes[i] > 0 ? Math.sin(collection.treeShakes[i] / 28) * 9 : 0;
          var treeScale = this.portrait ? 0.68 : 0.8;
          this.palm(treeX[i] + shakeX, ct + Math.round(ch * 0.28), treeScale);
        }
      }
      if (!this.artOn && !this.uiSkinChrome) this.text("椰林区", hw, ct + 24, 28, C.ink, "center");
      // R0034：椰林绿叶底加半透明深底，奶油金字才清晰
      if (collection.phase !== "coconutSummary") {
        // R0039：去掉过亮底框，只保留奶油金提示字
        var cocoTip = "点击椰树摇落椰子 接住掉落椰子";
        var cocoTipY = this.uiSkinChrome ? ct + 76 : (collection.phase === "coconutRound" ? ct + 76 : groundY + 10);
        this.drawGuideTip(cocoTip, hw, cocoTipY);
      }
      collection.coconuts.forEach(function (coconut) {
        if (this.uiSkinChrome && this.artOn) {
          var nutH = this.coconutArtLayout().nutH;
          this.paintCenterSprite("coconut_green", coconut.x, coconut.y, nutH, { rot: coconut.cracked ? 0 : coconut.rotation || 0 });
          // 原画层碎裂：补两道裂痕，约半秒后由 updateCoconuts 移除
          if (coconut.cracked) {
            var span = nutH * 0.7;
            this.line(coconut.x - span, coconut.y - span * 0.3, coconut.x + span, coconut.y + span * 0.3, 4, C.cream);
            this.line(coconut.x - span * 0.85, coconut.y + span * 0.45, coconut.x + span * 0.85, coconut.y - span * 0.45, 4, C.cream);
          }
          return;
        }
        if (this.artOn && !coconut.cracked) {
          this.circle(coconut.x, coconut.y, coconut.golden ? 20 : 16, coconut.golden ? C.honey : C.leaf);
          this.circle(coconut.x - 4, coconut.y - 5, 5, C.cream);
        } else {
          this.coconut(coconut.x, coconut.y, coconut.cracked ? 15 : 21, coconut.golden);
          if (coconut.cracked) {
            this.line(coconut.x - 24, coconut.y - 8, coconut.x + 24, coconut.y + 8, 4, C.cream);
            this.line(coconut.x - 20, coconut.y + 12, coconut.x + 20, coconut.y - 12, 4, C.cream);
          }
        }
      }, this);
      var basketX = Math.round(W * 0.84);
      if (this.uiSkinChrome && this.artOn && this.coconutArtLayout().smallBasket) {
        var smallBasket = this.coconutArtLayout().smallBasket;
        var countLabel = "" + collection.caughtThisRound;
        this.text(countLabel, smallBasket.x, this.textYInBox(countLabel, 17, smallBasket.y - smallBasket.h / 2, smallBasket.h), 17, C.ink, "center");
      } else if (this.uiSkinChrome) {
        var signY = this.portrait ? ct + Math.round(ch * 0.55) : ct + Math.round(ch * 0.52);
        this.text("" + collection.caughtThisRound, basketX, signY, 17, C.ink, "center");
      } else {
        var basketY = groundY + Math.round(sandH * 0.12);
        if (!this.artOn) {
          this.rect(basketX - 75, basketY, 140, 60, C.wood);
          this.rect(basketX - 65, basketY + 6, 120, 46, C.woodLight);
          for (var basket = 0; basket < collection.basketVisual; basket++) {
            this.coconut(basketX - 60 + (basket % 5) * 22, basketY + 14 + Math.floor(basket / 5) * 20, 10);
          }
        }
        if (this.artOn) this.rect(basketX - 78, groundY - 30, 156, 30, [0.98, 0.92, 0.79, 0.9]);
        this.text("椰子筐 " + collection.caughtThisRound, basketX, groundY - 24, 17, C.ink, "center");
      }
      if (collection.phase === "coconutRound") {
        var remaining = Math.max(0, Math.ceil((collection.roundDuration - collection.timer) / 1000));
        this.text("剩余 " + remaining + " 秒", W - 24, ct + 52, 15, C.ink, "right");
      }
    },

    drawBuild: function () {
      var W = this.width, H = this.height;
      var ct = 64, cb = H - 72, ch = cb - ct;
      var hw = Math.round(W / 2);
      var game = AIGCUtils.Game;
      var swing = Math.sin(Math.min(1, game.buildAnim / 320) * Math.PI);
      var groundY = ct + Math.round(ch * 0.56);
      if (!this.artOn) {
        this.rect(0, ct, W, groundY - ct, C.sky);
        this.rect(0, groundY, W, cb - groundY, C.sand);
      }
      this.rabbit(Math.round(W * 0.2), groundY - 30, 36);
      var cx = hw, cy = Math.round(ct + ch * 0.3);
      if (game.buildStage === "chop") {
        this.text("第一步 亲手砍树", cx, ct + 24, 17, C.ink, "center");
        this.rect(cx - 28, cy + 28, 54, 164, C.wood);
        this.rect(cx - 22, cy + 34, 42, 152, [0.52, 0.36, 0.24, 1]);
        this.circle(cx, cy, 76, C.leaf);
        this.circle(cx - 38, cy - 50, 46, [0.38, 0.58, 0.32, 1]);
        this.line(Math.round(W * 0.25), groundY - 30, cx - 50 + swing * (-70), cy + 10 - swing * 60, 10, C.wood);
        this.rect(cx - 75 + swing * (-70), cy - 12 - swing * 60, 44, 26, C.woodLight);
        this.rect(cx - 118, ct + 46, 236, 16, C.wood);
        this.rect(cx - 116, ct + 48, 232 * Math.min(1, game.buildHits / 6), 12, C.honey);
      }
      if (game.buildStage === "saw") {
        this.text("第二步 把树干锯成木头", cx, ct + 24, 17, C.ink, "center");
        for (var log = 0; log < 3; log++) {
          this.rect(cx - 132, cy + 8 + log * 44, 254, 34, C.wood);
          this.rect(cx - 126, cy + 12 + log * 44, 242, 26, C.woodLight);
        }
        this.line(cx - 60 + swing * 160, cy + 20, cx - 20 + swing * 160, cy + 80, 11, [0.92, 0.88, 0.82, 1]);
        this.line(Math.round(W * 0.2), groundY - 30, cx - 80 + swing * 130, cy + 30, 9, C.wood);
      }
      if (game.buildStage === "assemble" || game.buildStage === "fire") {
        var stageLabel = game.buildStage === "assemble" ? "第三步 动手搭建烤鱼店" : "最后一步 整理烤鱼篝火";
        this.text(stageLabel, cx, ct + 24, 24, C.ink, "center");
        var assembled = game.buildStage === "fire" ? 4 : game.buildHits;
        this.rect(cx - 200, groundY - 26, 390, 40, C.woodLight);
        if (assembled >= 1) this.rect(cx - 180, cy + 20, 22, 165, C.wood);
        if (assembled >= 2) this.rect(cx + 155, cy + 20, 22, 165, C.wood);
        if (assembled >= 3) this.tri(cx - 215, cy + 30, cx, cy - 45, cx + 215, cy + 30, C.paper);
        if (assembled >= 4) {
          this.rect(cx - 110, cy + 40, 200, 52, C.paper);
          this.text("烤鱼店", cx, cy + 56, 22, C.ink, "center");
        }
        if (game.buildStage === "assemble") this.line(Math.round(W * 0.2), groundY - 30, cx - 110, groundY - 55 - swing * 80, 8, C.woodLight);
      }
      if (game.buildStage === "fire") {
        for (var stone = 0; stone < 8; stone++) {
          var angle = stone / 8 * Math.PI * 2;
          this.circle(cx + Math.cos(angle) * 48, groundY - 16 + Math.sin(angle) * 18, 12, C.brown);
        }
        this.line(cx - 35, groundY - 16, cx + 35, groundY - 32, 11, C.wood);
        this.line(cx - 35, groundY - 32, cx + 35, groundY - 16, 11, C.wood);
        if (game.buildHits > 0) this.tri(cx, groundY - 16 - 55 - swing * 16, cx - 28, groundY - 16, cx + 28, groundY - 16, C.orange);
      }
      var labels = { chop: "砍树", saw: "锯木", assemble: "搭建", fire: "生火" };
      var totals = { chop: 3, saw: 3, assemble: 4, fire: 2 };
      this.button(cx - 110, cb - 68, 220, 54, labels[game.buildStage] + " " + game.buildHits + "/" + totals[game.buildStage], true);
    },

    drawCustomerOrderBubble: function (cx, top, customer, ready, anchor) {
      var L = AIGCUtils.ShopLayout || {};
      var skinBubble = this.uiSkinChrome && this.artOn;
      anchor = anchor || {};
      var bw = skinBubble && anchor.bw ? anchor.bw : 188;
      var bh = skinBubble && anchor.bh ? anchor.bh : 72;
      var bubbleCx =
        skinBubble && anchor.cx
          ? anchor.cx > 0 && anchor.cx <= 1
            ? Math.round(this.width * anchor.cx)
            : anchor.cx
          : cx;
      var bx = bubbleCx - Math.round(bw / 2);
      var by = typeof (skinBubble && anchor.top) === "number" ? anchor.top : typeof top === "number" ? top : 0;
      var lineSize = skinBubble ? (this.portrait ? 12 : 13) : 12;
      var iconSize = skinBubble ? (this.portrait ? 24 : 28) : 26;
      var bubbleKey = "order-bubble";
      if (skinBubble && !this.portrait && this.scenes["order-bubble-skin-land"]) {
        bubbleKey = "order-bubble-skin-land";
      }
      if (this.scenes[bubbleKey]) {
        this.paintUiStretch(bubbleKey, bx, by, bw, bh);
        this.flush();
      } else if (!skinBubble) {
        this.rect(bx, by, bw, bh, C.paper);
        this.rect(bx + 3, by + 3, bw - 6, bh - 6, C.cream);
      }
      if (customer.leaving) {
        if (!skinBubble) this.text("谢谢光临", cx, by + Math.round(bh / 2), 14, C.green, "center");
        return;
      }
      var rowFishY;
      var rowJuiceY;
      if (skinBubble) {
        if (this.portrait) {
          var ct = 64;
          var custH = anchor.custH || Math.round((this.height - 136) * 0.47);
          rowFishY = ct + Math.round(custH * (anchor.rowFishFrac || 0.21));
          rowJuiceY = ct + Math.round(custH * (anchor.rowJuiceFrac || 0.28));
        } else {
          var midLine = anchor.rowFishY && anchor.rowJuiceY
            ? Math.round((anchor.rowFishY + anchor.rowJuiceY) / 2)
            : anchor.top + 36;
          rowFishY = anchor.rowFishY || anchor.top + 26;
          rowJuiceY = anchor.rowJuiceY || anchor.top + 50;
          if (customer.order.fish > 0 && customer.order.juice <= 0) rowFishY = midLine;
          if (customer.order.juice > 0 && customer.order.fish <= 0) rowJuiceY = midLine;
        }
      } else {
        rowFishY = by + 26;
        rowJuiceY = by + 50;
      }
      var self = this;
      if (customer.order.fish > 0) {
        var species = AIGCUtils.Recipes.getFishSpecies(customer.order.speciesId);
        var fishLine = species.name + "烤鱼×" + customer.order.fish;
        this.drawOrderRow(bubbleCx, rowFishY, lineSize, fishLine, iconSize, function (ix, iy) {
          self.paintGrilledIcon(customer.order.speciesId, ix, iy, iconSize);
        });
      }
      if (customer.order.juice > 0) {
        var juiceLine = "椰子汁×" + customer.order.juice;
        var jy = customer.order.fish > 0 ? rowJuiceY : rowFishY;
        this.drawOrderRow(bubbleCx, jy, lineSize, juiceLine, iconSize, function (ix, iy) {
          self.paintCoconutIcon("green_juiced", ix, iy, iconSize);
        });
      }
      if (!skinBubble) {
        var hint = ready ? "点击交付" : "等餐中";
        this.text(hint, cx, by + bh - 10, 11, ready ? C.green : C.orange, "center");
      }
    },

    drawOrderCustomer: function (customer, x, y) {
      var missing = AIGCUtils.Selling.getMissing(customer);
      var ready = missing.fish === 0 && missing.juice === 0;
      this.rect(x, y, 300, 140, C.cream);
      this.rect(x, y, 6, 140, customer.leaving ? C.green : C.woodLight);
      var slide = customer.arrival + (customer.leaving ? customer.leaveTimer * 0.65 : 0);
      var animalX = x + 52 + slide;
      var animalColor = customer.type === "cat" ? C.honey : customer.type === "rabbit" ? C.white : customer.type === "bear" ? C.woodLight : C.fish;
      this.ellipse(animalX, y + 91, 31, 35, animalColor);
      this.circle(animalX, y + 55, 30, animalColor);
      this.circle(animalX - 20, y + 32, 10, animalColor);
      this.circle(animalX + 20, y + 32, 10, animalColor);
      this.circle(animalX - 10, y + 52, 3, C.ink, 8);
      this.circle(animalX + 10, y + 52, 3, C.ink, 8);
      if (customer.leaving) {
        this.text("谢谢 欢迎再来", x + 190, y + 54, 19, C.green, "center");
        return;
      }
      var line = 0;
      if (customer.order.fish > 0) {
        if (this.uiSkinChrome) this.paintFishIcon(customer.order.speciesId, x + 125, y + 40, 28);
        else this.fish(x + 125, y + 38, 19, true, customer.order.speciesId);
        this.text("×" + customer.order.fish, x + 155, y + 24, 20, C.ink);
        line++;
      }
      if (customer.order.juice > 0) {
        this.juice(x + 125, y + 38 + line * 34, 25);
        this.text("×" + customer.order.juice, x + 155, y + 24 + line * 34, 20, C.ink);
      }
      this.text(ready ? "点击交付" : "等餐中", x + 105, y + 98, 17, ready ? C.green : C.orange);
    },

    shopPoint: function (slot) {
      if (!slot) return { x: 0, y: 0, headDx: 0, headDy: 0 };
      if (this.portrait) {
        return {
          x: slot.x * this.width,
          y: slot.y * this.height,
          headDx: (slot.headDx || 0) * this.width,
          headDy: (slot.headDy || 0) * this.height,
          id: slot.id
        };
      }
      return { x: slot.x, y: slot.y, headDx: slot.headDx || 0, headDy: slot.headDy || 0, id: slot.id };
    },

    spriteFrame: function (key, targetW, targetH) {
      if (!this.scenes[key]) {
        if (!this.sceneLoading[key] && !this.missingShopSprites[key]) {
          this.missingShopSprites[key] = true;
          console.warn("[ShopLayout] sprite missing", key);
        }
        return null;
      }
      var trimMap = AIGCUtils.AssetSprites && AIGCUtils.AssetSprites.trim;
      var trim = (trimMap && trimMap[key]) || [0, 0, 1, 1];
      var aspect = this.sceneAspect[key] || 1;
      var du = trim[2] - trim[0];
      var dv = trim[3] - trim[1];
      if (du <= 0 || dv <= 0) return null;
      var contentAspect = aspect * du / dv;
      var w;
      var h;
      if (targetH) {
        h = targetH;
        w = h * contentAspect;
      } else {
        w = targetW || 64;
        h = w / contentAspect;
      }
      return { w: w, h: h, u0: trim[0], v0: trim[1], u1: trim[2], v1: trim[3] };
    },

    // 设计画布矩形裁切贴图四边形（无旋转时按 UV 等比裁）；完全在画外返回 null
    clipTexturedRect: function (x, y, w, h, u0, v0, u1, v1) {
      if (w <= 0 || h <= 0) return null;
      var x2 = x + w;
      var y2 = y + h;
      var cx1 = Math.max(0, x);
      var cy1 = Math.max(0, y);
      var cx2 = Math.min(this.width, x2);
      var cy2 = Math.min(this.height, y2);
      if (cx2 <= cx1 || cy2 <= cy1) return null;
      return {
        x: cx1,
        y: cy1,
        w: cx2 - cx1,
        h: cy2 - cy1,
        u0: u0 + (u1 - u0) * ((cx1 - x) / w),
        v0: v0 + (v1 - v0) * ((cy1 - y) / h),
        u1: u0 + (u1 - u0) * ((cx2 - x) / w),
        v1: v0 + (v1 - v0) * ((cy2 - y) / h)
      };
    },

    paintTexturedQuad: function (key, x, y, w, h, u0, v0, u1, v1, rot, pivotX, pivotY, tint, clipToCanvas) {
      if (!this.scenes[key] || w <= 0 || h <= 0) return false;
      var color = tint || [1, 1, 1, 1];
      if (color[3] != null && color[3] <= 0.01) return false;
      var drawX = x;
      var drawY = y;
      var drawW = w;
      var drawH = h;
      var du0 = u0;
      var dv0 = v0;
      var du1 = u1;
      var dv1 = v1;
      // 先按设计画布裁 UV/矩形，再旋转（R0010 补丁7：船有 bobRot 时也要裁掉屏底溢出）
      if (clipToCanvas) {
        var clipped = this.clipTexturedRect(x, y, w, h, u0, v0, u1, v1);
        if (!clipped) return false;
        drawX = clipped.x;
        drawY = clipped.y;
        drawW = clipped.w;
        drawH = clipped.h;
        du0 = clipped.u0;
        dv0 = clipped.v0;
        du1 = clipped.u1;
        dv1 = clipped.v1;
      }
      this.useTexture(this.scenes[key]);
      var pts = [
        [drawX, drawY, du0, dv0],
        [drawX + drawW, drawY, du1, dv0],
        [drawX, drawY + drawH, du0, dv1],
        [drawX + drawW, drawY + drawH, du1, dv1]
      ];
      if (rot) {
        var c = Math.cos(rot);
        var s = Math.sin(rot);
        for (var i = 0; i < 4; i++) {
          var dx = pts[i][0] - pivotX;
          var dy = pts[i][1] - pivotY;
          pts[i][0] = pivotX + dx * c - dy * s;
          pts[i][1] = pivotY + dx * s + dy * c;
        }
      }
      this.vertex(pts[0][0], pts[0][1], color, pts[0][2], pts[0][3], 2);
      this.vertex(pts[1][0], pts[1][1], color, pts[1][2], pts[1][3], 2);
      this.vertex(pts[2][0], pts[2][1], color, pts[2][2], pts[2][3], 2);
      this.vertex(pts[1][0], pts[1][1], color, pts[1][2], pts[1][3], 2);
      this.vertex(pts[3][0], pts[3][1], color, pts[3][2], pts[3][3], 2);
      this.vertex(pts[2][0], pts[2][1], color, pts[2][2], pts[2][3], 2);
      return true;
    },

    paintFootSprite: function (key, footX, footY, targetW, targetH, flip, motion) {
      motion = motion || {};
      var frame = this.spriteFrame(key, targetW, targetH);
      if (!frame) return null;
      var scaleY = motion.scaleY == null ? 1 : motion.scaleY;
      var drawH = frame.h * Math.max(0, scaleY);
      var x = footX - frame.w / 2;
      var y = footY - drawH;
      if (drawH < 0.4) return { x: x, y: footY, w: frame.w, h: 0 };
      var u0 = frame.u0;
      var u1 = frame.u1;
      if (flip) {
        var swap = u0;
        u0 = u1;
        u1 = swap;
      }
      var pivotX = motion.pivotX == null ? footX : motion.pivotX;
      var pivotY = motion.pivotY == null
        ? (motion.pivot === "center" ? y + drawH / 2 : footY)
        : motion.pivotY;
      var alpha = motion.alpha == null ? 1 : motion.alpha;
      if (alpha <= 0.01) return null;
      var tint = [1, 1, 1, alpha];
      var clip = !!motion.clipToCanvas;
      if (!this.paintTexturedQuad(key, x, y, frame.w, drawH, u0, frame.v0, u1, frame.v1, motion.rot || 0, pivotX, pivotY, tint, clip)) return null;
      this.flush();
      return { x: x, y: y, w: frame.w, h: drawH };
    },

    /**
     * 合表（兔+炉）内兔子相对单格的中心/高度/脚底占比。
     * 用于把动态合表里的兔子对齐到静帧 rabbit 槽位。
     */
    combinedGrillRabbitMeta: function (sheetKey) {
      var table = {
        anim_grill_lv1_cook: { cxFrac: 0.25, hFrac: 0.59, botFrac: 0.95 },
        anim_grill_lv2_cook: { cxFrac: 0.25, hFrac: 0.72, botFrac: 0.98 },
        anim_grill_lv3_cook: { cxFrac: 0.25, hFrac: 0.64, botFrac: 0.92 },
        anim_grill_lv4_cook: { cxFrac: 0.25, hFrac: 0.61, botFrac: 0.92 },
        anim_rabbit_grill_cook: { cxFrac: 0.26, hFrac: 0.97, botFrac: 0.98 },
        anim_rabbit_grill_ignite: { cxFrac: 0.26, hFrac: 0.75, botFrac: 0.98 },
        anim_rabbit_grill_flip: { cxFrac: 0.26, hFrac: 0.9, botFrac: 0.98 }
      };
      return table[sheetKey] || { cxFrac: 0.25, hFrac: 0.62, botFrac: 0.95 };
    },

    /** 横条精灵表单帧：脚底对齐，UV 由 AnimDriver.resolve 给出 */
    paintSheetFoot: function (sheetKey, footX, footY, targetH, uv, flip, motion) {
      motion = motion || {};
      uv = uv || { u0: 0, v0: 0, u1: 1, v1: 1 };
      if (!this.scenes[sheetKey]) {
        if (!this.sceneLoading[sheetKey] && !this.missingShopSprites[sheetKey]) {
          this.missingShopSprites[sheetKey] = true;
          console.warn("[ShopAnim] sheet missing", sheetKey);
        }
        return null;
      }
      var aspect = this.sceneAspect[sheetKey] || 1;
      var du = Math.max(0.001, (uv.u1 - uv.u0));
      var dv = Math.max(0.001, (uv.v1 - uv.v0));
      // 整表宽高比 * 单格 UV → 单格内容比
      var cellAspect = aspect * du / dv;
      var h = targetH || 128;
      var w = h * cellAspect;
      var drawH = h * (motion.scaleY == null ? 1 : motion.scaleY);
      var x = footX - w / 2;
      var y = footY - drawH;
      var u0 = uv.u0;
      var u1 = uv.u1;
      if (flip) {
        var swap = u0;
        u0 = u1;
        u1 = swap;
      }
      var alpha = motion.alpha == null ? 1 : motion.alpha;
      if (alpha <= 0.01) return null;
      var pivotX = motion.pivotX == null ? footX : motion.pivotX;
      var pivotY = motion.pivotY == null ? footY : motion.pivotY;
      if (!this.paintTexturedQuad(sheetKey, x, y, w, drawH, u0, uv.v0, u1, uv.v1, motion.rot || 0, pivotX, pivotY, [1, 1, 1, alpha], !!motion.clipToCanvas)) return null;
      this.flush();
      return { x: x, y: y, w: w, h: drawH };
    },

    paintCenterSprite: function (key, cx, cy, targetH, motion) {
      motion = motion || {};
      var frame = this.spriteFrame(key, 0, targetH);
      if (!frame) return null;
      var scaleY = motion.scaleY == null ? 1 : motion.scaleY;
      var drawH = frame.h * Math.max(0, scaleY);
      var x = cx - frame.w / 2;
      var y = cy - drawH / 2;
      if (drawH < 0.4) return { x: x, y: cy, w: frame.w, h: 0 };
      var alpha = motion.alpha == null ? 1 : motion.alpha;
      if (alpha <= 0.01) return null;
      var tint = [1, 1, 1, alpha];
      if (!this.paintTexturedQuad(key, x, y, frame.w, drawH, frame.u0, frame.v0, frame.u1, frame.v1, motion.rot || 0, cx, cy, tint, !!motion.clipToCanvas)) return null;
      this.flush();
      return { x: x, y: y, w: frame.w, h: drawH };
    },

    // 离场：走到「右缘内侧、全身仍可见」再淡出；进场从同一内侧点走进，避免半身被裁
    customerLeaveWalkMs: 550,
    customerLeaveFadeMs: 550,
    // 脚底相对右缘内缩，约半个顾客身宽，站在边上也不被 clip 切成半身
    customerEdgeInset: 48,

    customerSlidePoint: function (slotPoint, customer) {
      var edgeRestX = this.width - (this.customerEdgeInset || 48);
      if (edgeRestX < slotPoint.x + 8) edgeRestX = Math.min(this.width - 8, slotPoint.x + 8);
      var enter = Math.max(0, Math.min(1, (customer.arrival || 0) / 320));
      // smoothstep，进场不弹射
      var enterEase = enter * enter * (3 - 2 * enter);
      var enterSpan = Math.max(24, edgeRestX - slotPoint.x);
      var enterX = slotPoint.x + enterSpan * enterEase;
      if (!customer.leaving) {
        return {
          x: enterX,
          y: slotPoint.y,
          headDx: slotPoint.headDx || 0,
          headDy: slotPoint.headDy || 0,
          alpha: 1,
          id: slotPoint.id,
          nearEdge: enter > 0.02
        };
      }
      var walkMs = this.customerLeaveWalkMs;
      var fadeMs = this.customerLeaveFadeMs;
      var leaveTimer = customer.leaveTimer || 0;
      var exitSpan = Math.max(1, edgeRestX - slotPoint.x);
      var walk = Math.max(0, Math.min(1, leaveTimer / walkMs));
      var walkEase = walk * walk * (3 - 2 * walk);
      var leaveX = slotPoint.x + exitSpan * walkEase;
      // 若交付时人还在进场途中，从更靠右的位置继续向右缘内侧走，不往回拽
      leaveX = Math.max(leaveX, Math.min(enterX, edgeRestX));
      if (leaveX > edgeRestX) leaveX = edgeRestX;
      var alpha = 1;
      if (leaveTimer > walkMs) {
        alpha = Math.max(0, 1 - (leaveTimer - walkMs) / fadeMs);
      }
      return {
        x: leaveX,
        y: slotPoint.y,
        headDx: slotPoint.headDx || 0,
        headDy: slotPoint.headDy || 0,
        alpha: alpha,
        id: slotPoint.id,
        nearEdge: true
      };
    },

    grillNet: function (box) {
      return {
        x: box.x + box.w * 0.5,
        y: box.y + box.h * 0.28
      };
    },

    drawArtStokeFlames: function (box) {
      var x = box.x + box.w * 0.5;
      var baseY = box.y + box.h;
      var now = typeof AIGCUtils._now === "function" ? AIGCUtils._now() : Date.now();
      var fh = box.h * 0.22 + Math.sin(now / 200) * box.h * 0.04 + Math.sin(now / 137) * box.h * 0.025;
      var fw = box.w * 0.1 + Math.sin(now / 160 + 1) * box.w * 0.015;
      this.tri(x, baseY - fh, x - fw, baseY, x + fw, baseY, C.orange);
      var fh2 = fh * 0.65 + Math.sin(now / 115 + 2) * box.h * 0.025;
      this.tri(x + fw * 0.1, baseY - fh2, x - fw * 0.5, baseY, x + fw * 0.55, baseY, C.honey);
      // 动态火星：多粒沿抛物线上升并淡出，烤制/生火共用
      this.drawGrillSparks(x, baseY - fh * 0.35, box.w, box.h, now);
      if (this.artFlameLog !== "stoke-sparks") {
        this.artFlameLog = "stoke-sparks";
        console.log("[ShopLayout] stoke flame+sparks at grill bottom", Math.round(x), Math.round(baseY));
      }
    },

    drawGrillSparks: function (cx, cy, boxW, boxH, now) {
      var n = 10;
      for (var i = 0; i < n; i++) {
        var life = ((now / (280 + i * 37) + i * 0.17) % 1);
        var rise = life * (boxH * 0.55 + (i % 3) * 6);
        var drift = Math.sin(now / 220 + i * 1.7) * (boxW * 0.08) + (i - n / 2) * (boxW * 0.012);
        var sx = cx + drift;
        var sy = cy - rise;
        var fade = 1 - life;
        var r = (1.2 + (i % 3) * 0.7) * (0.45 + fade);
        var hot = i % 2 === 0;
        var col = hot
          ? [1, 0.72 + 0.2 * fade, 0.25, 0.55 * fade]
          : [1, 0.45, 0.12, 0.4 * fade];
        this.circle(sx, sy, r, col, 8);
      }
    },

    drawArtGrillFish: function (current, box, slideAmp) {
      // 翻面 scaleY 只在点击翻面后的 flipFx 并行段启动，等待翻面时鱼保持静贴
      var flipFx = AIGCUtils.Baking && AIGCUtils.Baking.flipFx;
      var flipping = !!(flipFx && flipFx.timer < flipFx.duration);
      var phase = flipping ? (flipFx.timer / Math.max(1, flipFx.duration)) * Math.PI : 0;
      var slide = flipping ? Math.sin(phase) * slideAmp : 0;
      var scaleY = flipping ? Math.abs(Math.cos(phase)) : 1;
      var net = this.grillNet(box);
      var fishH = Math.max(28, Math.round(box.h * 0.4));
      var speciesId = AIGCUtils.Recipes.normalizeSpeciesId(
        (current && current.speciesId) || (flipFx && flipFx.speciesId) || "small"
      );
      var key = "grilled_" + speciesId;
      this.paintCenterSprite(key, net.x + slide, net.y, fishH, { scaleY: scaleY });
      var stageMark = flipping ? "flipFx" : (current && current.stage) || "none";
      var mark = stageMark + ":" + speciesId;
      if (this.artGrillLog !== mark) {
        this.artGrillLog = mark;
        console.log("[ShopLayout] grill fish", stageMark, key, "net", Math.round(net.x), Math.round(net.y), "scaleY", scaleY.toFixed(2), "slide", Math.round(slide));
      }
      this.shopNet = { x: net.x, y: net.y, scaleY: scaleY, slide: slide, key: key, stage: stageMark };
    },

    drawArtJuice: function (current) {
      // 台面椰子：横屏用 juiceNut（右红框），竖屏仍用 work（椰子位置不变）。
      // pick_coconut 起才画到台面；put_tools / walk 段不提前出现椰子。
      var anchor = this.shopWorkPoint;
      if (!current || !anchor) return false;
      if (current.stage === "put_tools" || current.stage === "walk_to_work") return false;
      // crack/straw 的兔子 sheet 只含角色；椰子落 juiceNut/work，与 juiceStand 左右分开
      var juiced = current.taps >= 3 || current.stage === "straw" || current.stage === "straw_anim";
      var key = juiced ? "coconut_green_juiced" : "coconut_green";
      var hitProgress = current.hitTimer > 0 ? 1 - current.hitTimer / 260 : 1;
      var shake = current.hitTimer > 0 ? Math.sin(hitProgress * Math.PI * 3) * 4 : 0;
      var pickLift = 0;
      if (current.stage === "pick_coconut") {
        var auto = (AIGCUtils.Baking.juiceAuto && AIGCUtils.Baking.juiceAuto.pick_coconut) || 280;
        pickLift = -Math.sin(Math.min(1, current.elapsed / auto) * Math.PI) * 18;
      }
      var h = 56;
      this.paintFootSprite(key, anchor.x + shake, anchor.y + pickLift, 0, h, false);
      var mark = (this.portrait ? "port:" : "land:") + key + ":" + current.taps + ":" + current.stage;
      if (this.artJuiceLog !== mark) {
        this.artJuiceLog = mark;
        console.log("[ShopLayout] juice sprite", this.portrait ? "port" : "land", key, "taps", current.taps, "stage", current.stage, "at", Math.round(anchor.x + shake), Math.round(anchor.y + pickLift), "shake", Math.round(shake));
      }
      this.shopJuice = { key: key, taps: current.taps, stage: current.stage, shake: shake, x: anchor.x, y: anchor.y + pickLift };
      return true;
    },

    drawArtFishFlight: function (plating, t) {
      if (!this.shopGrillBox || !AIGCUtils.ShopLayout) return false;
      var board = this.portrait ? AIGCUtils.ShopLayout.port : AIGCUtils.ShopLayout.land;
      if (!board || !board.plates) return false;
      var speciesId = AIGCUtils.Recipes.normalizeSpeciesId(plating.speciesId);
      var slot = null;
      for (var i = 0; i < board.plates.length; i++) {
        if (board.plates[i].id === speciesId) slot = board.plates[i];
      }
      if (!slot) return false;
      var end = this.shopPoint(slot);
      var net = this.grillNet(this.shopGrillBox);
      var h = this.portrait ? 48 : 38;
      var key = "grilled_" + speciesId;
      var frame = this.spriteFrame(key, 0, h);
      if (!frame) return false;
      var startY = net.y + frame.h / 2;
      var x = net.x + (end.x - net.x) * t;
      var y = startY + (end.y - startY) * t - Math.sin(t * Math.PI) * 65;
      this.paintFootSprite(key, x, y, 0, h, false);
      this.shopFlight = {
        key: key,
        t: t,
        x: x,
        y: y,
        netX: net.x,
        netY: net.y,
        endX: end.x,
        endY: end.y
      };
      if (this.artFlightLog !== key) {
        this.artFlightLog = key;
        console.log("[ShopLayout] plate flight", key, "net", Math.round(net.x), Math.round(net.y), "anchor", Math.round(end.x), Math.round(end.y));
      }
      return true;
    },

    drawShopOrderBubble: function (customer, foot) {
      var alpha = foot && foot.alpha != null ? foot.alpha : 1;
      if (alpha <= 0.01) return;
      var headX = foot.x + (foot.headDx || 0);
      var headY = foot.y + (foot.headDy || 0);
      var fishN = customer.leaving ? 0 : (customer.order.fish || 0);
      var juiceN = customer.leaving ? 0 : (customer.order.juice || 0);
      var lines = [];
      if (customer.leaving) {
        lines.push({ text: "谢谢光临", kind: "bye" });
      } else {
        if (fishN > 0) {
          var species = AIGCUtils.Recipes.getFishSpecies(customer.order.speciesId);
          lines.push({ text: species.name + "烤鱼×" + fishN, kind: "fish" });
        }
        if (juiceN > 0) lines.push({ text: "椰子汁×" + juiceN, kind: "juice" });
      }
      if (!lines.length) return;
      var font = this.portrait ? 12 : 13;
      var icon = this.portrait ? 22 : 24;
      var widest = 0;
      for (var li = 0; li < lines.length; li++) {
        var extra = lines[li].kind === "bye" ? 0 : icon + 6;
        widest = Math.max(widest, extra + this.textWidth(lines[li].text, font));
      }
      var lineH = font + 18;
      var bw = Math.max(this.portrait ? 168 : 188, Math.round(widest / 0.76));
      var bh = Math.max(this.portrait ? 64 : 68, Math.round(lines.length * lineH / 0.56));
      var padTop = Math.round(bh * 0.16);
      var bx = Math.round(headX - bw / 2);
      var by = Math.round(headY - bh);
      // 只降低框透明度；文字保持清晰
      var frameAlpha = Math.max(0, Math.min(1, alpha * 0.5));
      var bubbleTint = [1, 1, 1, frameAlpha];
      var bubbleClip = this.clipTexturedRect(bx, by, bw, bh, 0, 0, 1, 1);
      if (!bubbleClip) return;
      if (!this.paintUiRegion("order-bubble", bubbleClip.x, bubbleClip.y, bubbleClip.w, bubbleClip.h, bubbleClip.u0, bubbleClip.v0, bubbleClip.u1, bubbleClip.v1, bubbleTint)) {
        if (!this.missingShopSprites["order-bubble"]) {
          this.missingShopSprites["order-bubble"] = true;
          console.warn("[ShopLayout] order bubble missing");
        }
        return;
      }
      this.flush();
      var ccx = bx + bw * 0.5;
      var textLeft = ccx - widest / 2;
      var textRight = ccx + widest / 2;
      var textTop = by + padTop;
      var textBottom = textTop + lines.length * lineH;
      var inside = textLeft >= bx + 4 && textRight <= bx + bw - 4 && textBottom <= by + bh - 4;
      if (!this.shopBubbles) this.shopBubbles = [];
      this.shopBubbles.push({
        x: bx, y: by, w: bw, h: bh,
        headX: headX, headY: headY,
        textLeft: textLeft, textRight: textRight, textTop: textTop, textBottom: textBottom,
        inside: inside,
        customerId: customer.id,
        alpha: alpha
      });
      if (!inside && !this.bubbleFitWarned) {
        this.bubbleFitWarned = true;
        console.warn("[ShopLayout] order text outside bubble", customer.id, Math.round(textLeft), Math.round(textRight), bx, bx + bw);
      }
      // 气泡主体已裁出画外时不再画字，避免字飘到设计画面外
      if (ccx < 0 || ccx > this.width || textTop > this.height || textBottom < 0) return;
      var self = this;
      var greenInk = [C.green[0], C.green[1], C.green[2], C.green[3] * alpha];
      var inkFade = [C.ink[0], C.ink[1], C.ink[2], C.ink[3] * alpha];
      for (var row = 0; row < lines.length; row++) {
        var line = lines[row];
        var cy = textTop + lineH * row + lineH / 2;
        if (line.kind === "bye") {
          this.text(line.text, ccx, this.textYInBox(line.text, font, cy - lineH / 2, lineH), font, greenInk, "center");
        } else if (line.kind === "fish") {
          this.drawOrderRow(ccx, cy, font, line.text, icon, function (ix, iy) {
            self.paintGrilledIcon(customer.order.speciesId, ix, iy, icon);
          }, inkFade);
        } else {
          this.drawOrderRow(ccx, cy, font, line.text, icon, function (ix, iy) {
            self.paintCoconutIcon("green_juiced", ix, iy, icon);
          }, inkFade);
        }
      }
    },

    drawShopPlates: function () {
      var L = AIGCUtils.ShopLayout;
      var board = this.portrait ? L.port : L.land;
      var plates = (board && board.plates) || [];
      var goods = AIGCUtils.GameState.bakedGoods;
      // 竖屏成品约 48 并垫木盘；横屏保持原高度
      var height = this.portrait ? 48 : 38;
      var drawnIds = [];
      for (var i = 0; i < plates.length; i++) {
        var plate = plates[i];
        var count = goods.filter(function (good) {
          return good.recipeId === "fish_grilled" && good.speciesId === plate.id;
        }).length;
        if (!count) continue;
        var anchor = this.shopPoint(plate);
        if (this.portrait) {
          // 无盘子贴图时画扁木盘椭圆，鱼脚底落在盘心；锚点不挪以免挡邻槽
          this.ellipse(anchor.x, anchor.y + 1, 13, 5, C.wood);
          this.ellipse(anchor.x, anchor.y, 12, 4, C.woodLight);
          drawnIds.push(plate.id + "x" + count);
        }
        var placed = this.paintFootSprite("grilled_" + plate.id, anchor.x, anchor.y, 0, height, false);
        if (count > 1) {
          var labelX = placed ? placed.x + placed.w + 2 : anchor.x + 16;
          var labelY = placed ? placed.y + placed.h * 0.35 : anchor.y - 14;
          this.text("×" + count, labelX, labelY, this.portrait ? 12 : 13, C.ink, "left");
        }
      }
      if (this.portrait && drawnIds.length) {
        var plateMark = "port:" + drawnIds.join(",");
        if (this.portPlateLog !== plateMark) {
          this.portPlateLog = plateMark;
          // 核对竖屏成品脚底是否落在兔子同层木桌（rabbit.y≈0.825）
          var ys = plates.map(function (p) { return p.id + ":" + p.y; }).join(",");
          console.log("[ShopLayout] port plated fish", plateMark, "h", height, "anchors", ys);
        }
      } else if (!this.portrait) {
        var landIds = [];
        for (var li = 0; li < plates.length; li++) {
          var lp = plates[li];
          var lc = 0;
          for (var gi = 0; gi < goods.length; gi++) {
            if (goods[gi].recipeId === "fish_grilled" && goods[gi].speciesId === lp.id) lc++;
          }
          if (lc) landIds.push(lp.id + "x" + lc);
        }
        if (landIds.length) {
          var landMark = "land:" + landIds.join(",");
          if (this.landPlateLog !== landMark) {
            this.landPlateLog = landMark;
            console.log("[ShopLayout] R0046 land plated fish", landMark, "y", plates[0] && plates[0].y);
          }
        }
      }
    },

    /**
     * R0045：横屏桌面带五等分——小海鱼/三文鱼/金枪鱼/金色传说/椰子汁。
     * 分布域 = land.trayBand（约半屏），非整屏宽。
     * 每格单体 = 物体在上 + 同宽木牌(101×54)在下，格内水平居中；间距由等宽格自然均匀。
     */
    landShopTrayMetrics: function () {
      var land = AIGCUtils.ShopLayout && AIGCUtils.ShopLayout.land;
      var band = (land && land.trayBand) || { left: 36, right: 546 };
      var bandLeft = band.left;
      var bandRight = band.right;
      var usable = Math.max(1, bandRight - bandLeft);
      var cellW = usable / 5;
      var plaqueW = 101;
      var plaqueH = 54;
      var iconSize = 32;
      // R0045c：继续下沉贴木牌；负值越大越贴（抵消素材底透明边）
      var gapV = -18;
      var groupW = plaqueW;
      // R0045f：五格整体下移；木牌顶 Y（物体相对此贴紧）
      var plaqueY = (land && land.trayPlaqueY != null) ? land.trayPlaqueY : 414;
      var baseFootY = plaqueY - gapV;
      var baseIconY = baseFootY - Math.round(iconSize / 2);
      var iconDyList = (land && land.trayIconDy) || [0, 0, 0, 0, 0];
      var cells = [];
      if (cellW + 0.01 < groupW && !this._loggedTrayBandTight) {
        this._loggedTrayBandTight = true;
        console.log("[ShopLayout] R0045 trayBand cellW < plaqueW", "cellW", Math.round(cellW), "plaqueW", plaqueW, "band", bandLeft, bandRight);
      }
      for (var i = 0; i < 5; i++) {
        var cellLeft = bandLeft + i * cellW;
        var centerX = cellLeft + cellW / 2;
        var plaqueX = centerX - plaqueW / 2;
        var dy = iconDyList[i] || 0;
        var iconFootY = baseFootY + dy;
        var iconY = baseIconY + dy;
        var hitX = Math.min(plaqueX, centerX - iconSize / 2);
        var hitY = iconY - Math.round(iconSize / 2);
        var hitBottom = plaqueY + plaqueH;
        cells.push({
          index: i,
          cellLeft: Math.round(cellLeft),
          cellW: Math.round(cellW),
          centerX: Math.round(centerX),
          iconX: Math.round(centerX),
          iconY: Math.round(iconY),
          iconFootY: Math.round(iconFootY),
          iconSize: iconSize,
          iconDy: dy,
          plaqueX: Math.round(plaqueX),
          plaqueY: plaqueY,
          plaqueW: plaqueW,
          plaqueH: plaqueH,
          hitX: Math.round(hitX),
          hitY: Math.round(hitY),
          hitW: Math.round(Math.max(groupW, iconSize)),
          hitH: Math.round(hitBottom - hitY)
        });
      }
      return {
        cells: cells,
        plaqueW: plaqueW,
        plaqueH: plaqueH,
        barY: plaqueY,
        bandLeft: bandLeft,
        bandRight: bandRight,
        // 兼容旧调用
        start: cells[0].hitX,
        step: Math.round(cellW),
        btnW: plaqueW,
        btnPad: 0,
        hitW: Math.round(Math.max(groupW, iconSize))
      };
    },

    /** @deprecated 转调五等分 tray */
    landFishBarMetrics: function () {
      return this.landShopTrayMetrics();
    },

    landFishBarStep: function () {
      return this.landShopTrayMetrics().step;
    },

    landFishBarStartX: function () {
      return this.landShopTrayMetrics().start;
    },

    // 横屏椰汁脚点：落在第 5 格物体位（木牌上方），与竖排单体对齐
    landJuiceStackPoint: function () {
      var tray = this.landShopTrayMetrics();
      var juiceCell = tray.cells[4];
      return { x: juiceCell.iconX, y: juiceCell.iconFootY };
    },

    // 竖屏椰汁堆用独立锚点，不跟成品鱼末槽走，避免调鱼高度时连带下移。
    portJuiceStackPoint: function () {
      var stack = AIGCUtils.ShopLayout.port.juiceStack || { x: 0.23, y: 0.775 };
      var point = this.shopPoint(stack);
      if (this.portJuiceStackLog !== stack.y) {
        this.portJuiceStackLog = stack.y;
        console.log("[ShopLayout] port juice stack fixed anchor", stack.x, stack.y, "screen", Math.round(point.x), Math.round(point.y));
      }
      return point;
    },

    /** 竖屏兜底：椰汁旁木牌（横屏改走五等分格 4） */
    drawJuiceCountPlaque: function (anchor, count, juiceH) {
      if (!anchor || count < 1) return;
      if (!this.portrait) return;
      var plaqueW = Math.max(72, Math.round((this.width - 10) / AIGCUtils.FishSpecies.length) - 36);
      var plaqueH = 50;
      var plaqueX = Math.round(anchor.x + 4);
      var plaqueY = Math.round(anchor.y - juiceH * 0.45 - plaqueH * 0.5);
      this.button(plaqueX, plaqueY, plaqueW, plaqueH, "椰子汁 " + count, true, 14);
    },

    drawJuiceStack: function () {
      var goods = AIGCUtils.GameState.bakedGoods || [];
      var count = 0;
      for (var i = 0; i < goods.length; i++) {
        if (goods[i].recipeId === "coconut_juice") count++;
      }
      if (count < 1) return;
      var anchor = this.portrait ? this.portJuiceStackPoint() : this.landJuiceStackPoint();
      var shown = Math.min(3, count);
      var h = this.portrait ? 26 : 44;
      var step = this.portrait ? 15 : 26;
      for (var n = 0; n < shown; n++) {
        this.paintFootSprite("coconut_green_juiced", anchor.x, anchor.y - n * step, 0, h, false);
      }
      // 横屏木牌由 drawLandShopTray 第 5 格统一画；竖屏仍用旁侧牌
      if (this.portrait) this.drawJuiceCountPlaque(anchor, count, h);
      var stackMark = (this.portrait ? "port:" : "land:") + count;
      if (this.artJuiceStackLog !== stackMark) {
        this.artJuiceStackLog = stackMark;
        console.log("[ShopLayout] juice stack", this.portrait ? "port" : "land", count, "draw", shown, "at", Math.round(anchor.x), Math.round(anchor.y));
      }
    },

    /** R0045：横屏桌面带五等分绘制（4 鱼 + 椰汁；物体上、木牌下） */
    drawLandShopTray: function () {
      var state = AIGCUtils.GameState;
      var tray = this.landShopTrayMetrics();
      var cells = tray.cells;
      for (var i = 0; i < 4; i++) {
        var cell = cells[i];
        var species = AIGCUtils.FishSpecies[i];
        if (!species) continue;
        var fishCount = state.getFishCount(species.id);
        var unlocked = this.speciesShopUnlocked(species.id);
        var lbl = species.name + " " + (unlocked ? fishCount : 0);
        var active = unlocked && fishCount > 0;
        if (!unlocked) {
          var grayTint = [0.55, 0.55, 0.55, 1];
          if (this.uiSkinChrome) {
            this.paintFishIcon(species.id, cell.iconX, cell.iconY, 32, grayTint);
          } else {
            this.rect(cell.plaqueX, cell.plaqueY, cell.plaqueW, cell.plaqueH, [0.55, 0.52, 0.48, 0.55]);
            this.paintFishIcon(species.id, cell.iconX, cell.iconY, 30, grayTint);
          }
          if (this.uiSkinChrome) {
            this.button(cell.plaqueX, cell.plaqueY, cell.plaqueW, cell.plaqueH, lbl, false);
          }
        } else if (this.uiSkinChrome) {
          this.paintFishIcon(species.id, cell.iconX, cell.iconY, active ? 32 : 28);
          this.button(cell.plaqueX, cell.plaqueY, cell.plaqueW, cell.plaqueH, lbl, active);
        } else {
          this.button(cell.plaqueX, cell.plaqueY, cell.plaqueW, cell.plaqueH, lbl, active);
          this.paintFishIcon(species.id, cell.iconX, cell.iconY, active ? 30 : 28);
        }
      }
      // 第 5 格：物体在上、同宽木牌在下；有成品时桌上椰汁由 drawJuiceStack 画在 iconFootY
      var juiceCell = cells[4];
      var juiceCount = 0;
      var goods = state.bakedGoods || [];
      for (var g = 0; g < goods.length; g++) {
        if (goods[g].recipeId === "coconut_juice") juiceCount++;
      }
      var juiceLbl = "椰子汁 " + juiceCount;
      if (this.uiSkinChrome) {
        if (juiceCount < 1) {
          this.paintCenterSprite("coconut_green_juiced", juiceCell.iconX, juiceCell.iconY, 28, {});
        }
        this.button(
          juiceCell.plaqueX,
          juiceCell.plaqueY,
          juiceCell.plaqueW,
          juiceCell.plaqueH,
          juiceLbl,
          juiceCount > 0
        );
      } else {
        this.button(juiceCell.plaqueX, juiceCell.plaqueY, juiceCell.plaqueW, juiceCell.plaqueH, juiceLbl, juiceCount > 0);
      }
      if (!this._loggedLandShopTray) {
        this._loggedLandShopTray = true;
        console.log(
          "[ShopLayout] R0045d land tray iconDy",
          "tuna",
          cells[2] && cells[2].iconDy,
          cells[2] && cells[2].iconY,
          "juice",
          cells[4] && cells[4].iconDy,
          cells[4] && cells[4].iconFootY
        );
      }
      var guideIdxLand = this.firstCookableFishIndex();
      if (guideIdxLand >= 0 && guideIdxLand < 4) {
        var guideCell = cells[guideIdxLand];
        this.drawGrillFishGuideArrow(guideCell.centerX, guideCell.iconY - Math.round(guideCell.iconSize / 2) - 8);
      }
    },

    drawShopCast: function () {
      var L = AIGCUtils.ShopLayout;
      if (!L) return;
      var board = this.portrait ? L.port : L.land;
      if (!board) return;
      var grill = this.shopPoint(board.grill);
      var grillW = this.portrait ? Math.round(this.width * 0.32) : 164;
      var rabbit = this.shopPoint(board.rabbit);
      // 横屏约 1.4×（124→174），脚底已在 layout 下移，保持手靠近操作台（R0015）
      var rabbitH = this.portrait ? Math.round(this.height * 0.13) : 174;
      if (!this.portrait && this._landRabbitScaleLog !== rabbitH + ":" + Math.round(rabbit.y)) {
        this._landRabbitScaleLog = rabbitH + ":" + Math.round(rabbit.y);
        console.log("[ShopLayout] land rabbit scale", "h", rabbitH, "foot", Math.round(rabbit.x), Math.round(rabbit.y));
      }
      var bakingNow = AIGCUtils.Baking;
      var anim = AIGCUtils.AnimDriver;
      var rabbitMotion = anim ? anim.resolve("rabbit") : { rot: 0, scaleY: 1, dx: 0, dy: 0, flip: true, key: "hero_rabbit_grill" };
      // 合帧表已含烤架：跳过单独烤架，避免双炉。sheet 原画是兔左炉右，禁止整表镜像。
      var useCombined = !!(rabbitMotion && rabbitMotion.combinedGrill && rabbitMotion.hasSheet && rabbitMotion.sheetKey);
      if (useCombined) {
        // 按合表内兔子占比，把兔子对齐到静帧槽位的大小与脚底
        // R0020：maxH 须保住「合表内兔视觉高≈rabbitH」；0.36 在 960×540 会把 cook sheetH 295 压到 194（兔≈114）
        var comboMeta = this.combinedGrillRabbitMeta(rabbitMotion.sheetKey);
        var sheetHRaw = Math.round(rabbitH / Math.max(0.35, comboMeta.hFrac));
        var maxH = Math.min(this.width, this.height) * 0.56;
        var sheetH = sheetHRaw > maxH ? Math.round(maxH) : sheetHRaw;
        // 格心在脚底；兔子中心约在格内 cxFrac → 平移使兔子脚底对齐 rabbit 槽
        var comboX = rabbit.x + (0.5 - comboMeta.cxFrac) * sheetH;
        var comboY = rabbit.y + (1 - comboMeta.botFrac) * sheetH;
        var halfW = sheetH * 0.5;
        if (comboX - halfW < 4) comboX = halfW + 4;
        if (comboX + halfW > this.width - 4) comboX = this.width - 4 - halfW;
        this.shopGrillBox = {
          x: grill.x - grillW / 2,
          y: grill.y - Math.round(sheetH * 0.55),
          w: grillW,
          h: Math.round(sheetH * 0.55)
        };
        this.shopCombinedAnim = true;
        this._comboSheetH = sheetH;
        this._comboFootX = comboX;
        this._comboFootY = comboY;
        if (this._comboAlignLog !== rabbitMotion.sheetKey + ":" + sheetH) {
          this._comboAlignLog = rabbitMotion.sheetKey + ":" + sheetH;
          console.log(
            "[ShopAnim] combo align rabbit",
            rabbitMotion.sheetKey,
            "sheetH",
            sheetH,
            "raw",
            sheetHRaw,
            "maxH",
            Math.round(maxH),
            "clamped",
            sheetHRaw > maxH,
            "rabbitH",
            rabbitH,
            "rabbitVis",
            Math.round(sheetH * comboMeta.hFrac),
            "foot",
            Math.round(comboX),
            Math.round(comboY),
            "slot",
            Math.round(rabbit.x),
            Math.round(rabbit.y)
          );
        }
      } else {
        this.shopCombinedAnim = false;
        this._comboSheetH = 0;
        this.shopGrillBox = this.paintFootSprite(L.grillKey(), grill.x, grill.y, grillW, 0, false);
      }
      // 竖屏：成品鱼/椰汁先于兔子，桌面在角色之下
      if (this.portrait) {
        this.drawShopPlates();
        this.drawJuiceStack();
        this.portGoodsDrawnUnderRabbit = true;
        if (!this.portGoodsLayerLog) {
          this.portGoodsLayerLog = true;
          console.log("[ShopLayout] port ready goods under rabbit");
        }
      }
      var rabbitX = rabbit.x;
      var rabbitY = rabbit.y;
      if ((board.juiceStand || board.work) && bakingNow) {
        // 椰汁兔子站位：优先 juiceStand（与椰子左右分离），无则回退 work
        var standSlot = board.juiceStand || board.work;
        var work = this.shopPoint(standSlot);
        var juiceNow = bakingNow.current && bakingNow.current.recipeId === "coconut_juice";
        var juiceBack = !juiceNow && bakingNow.plating && bakingNow.plating.recipeId === "coconut_juice";
        if (juiceNow || juiceBack) {
          // 椰汁工位：横屏脚底见 juiceStand（红框地板）；大小与烤鱼兔同
          var homeH = this.portrait ? Math.round(this.height * 0.13) : 174;
          var workH = this.portrait ? Math.round(homeH * 1.08) : homeH;
          var standX = work.x;
          var standY = work.y;
          if (!this.portrait && this._landJuiceStandLog !== standX + ":" + standY) {
            this._landJuiceStandLog = standX + ":" + standY;
            console.log("[ShopLayout] land juiceStand foot", Math.round(standX), Math.round(standY), "h", workH);
          }
          var along = 0;
          var fromX = rabbit.x;
          var fromY = rabbit.y;
          var toX = standX;
          var toY = standY;
          var fromH = homeH;
          var toH = workH;
          if (juiceNow) {
            var js = bakingNow.current.stage;
            var auto = bakingNow.juiceAuto || { put_tools: 320, walk_to_work: 420, pick_coconut: 280 };
            // put_tools 留在烤架；walk 用 smoothstep，避免弹射起步；到位后停在 stand
            if (js === "put_tools") {
              along = 0;
            } else if (js === "walk_to_work") {
              along = Math.max(0, Math.min(1, (bakingNow.current.elapsed || 0) / auto.walk_to_work));
            } else {
              along = 1;
            }
            fromX = rabbit.x;
            fromY = rabbit.y;
            toX = standX;
            toY = standY;
            fromH = homeH;
            toH = workH;
          } else {
            along = Math.max(0, Math.min(1, (bakingNow.plating.timer || 0) / 420));
            fromX = standX;
            fromY = standY;
            toX = rabbit.x;
            toY = rabbit.y;
            fromH = workH;
            toH = homeH;
          }
          var ease = along * along * (3 - 2 * along);
          rabbitX = fromX + (toX - fromX) * ease;
          rabbitY = fromY + (toY - fromY) * ease;
          rabbitH = fromH + (toH - fromH) * ease;
          var phase = juiceNow ? (bakingNow.current.stage === "put_tools" ? "put-tools" : bakingNow.current.stage === "walk_to_work" ? "to-work" : "at-work") : "back";
          if (this.artRabbitPhase !== phase) {
            this.artRabbitPhase = phase;
            console.log("[ShopLayout] rabbit", phase, "juiceStand", Math.round(standX), Math.round(standY), "h", workH, "along", along.toFixed(2));
          }
        } else if (this.artRabbitPhase) {
          this.artRabbitPhase = "";
        }
      }
      rabbitX += rabbitMotion.dx || 0;
      rabbitY += rabbitMotion.dy || 0;
      var rabbitKey = rabbitMotion.key || "hero_rabbit_grill";
      // 兔子烤架默认面右用 flip；AnimDriver.flip 表示面朝左
      var rabbitFlip = rabbitMotion.flip != null ? rabbitMotion.flip : true;
      if (useCombined) {
        var sheetH2 = this._comboSheetH || Math.round(rabbitH / 0.62);
        var comboX2 = (this._comboFootX != null ? this._comboFootX : rabbit.x) + (rabbitMotion.dx || 0);
        var comboY2 = (this._comboFootY != null ? this._comboFootY : rabbit.y) + (rabbitMotion.dy || 0);
        // 合表原画兔左炉右：不跟兔子 facing 镜像，避免炉兔左右对调
        var painted = this.paintSheetFoot(rabbitMotion.sheetKey, comboX2, comboY2, sheetH2, {
          u0: rabbitMotion.u0,
          v0: rabbitMotion.v0,
          u1: rabbitMotion.u1,
          v1: rabbitMotion.v1
        }, false, { alpha: rabbitMotion.alpha == null ? 1 : rabbitMotion.alpha });
        if (!painted) {
          // sheet 未就绪时回退静帧
          this.shopCombinedAnim = false;
          if (!this.shopGrillBox || !this.shopGrillBox.w) {
            this.shopGrillBox = this.paintFootSprite(L.grillKey(), grill.x, grill.y, grillW, 0, false);
          }
          this.paintFootSprite("hero_rabbit_grill", rabbitX, rabbitY, 0, rabbitH, rabbitFlip, {
            rot: rabbitMotion.rot || 0,
            scaleY: rabbitMotion.scaleY == null ? 1 : rabbitMotion.scaleY
          });
        } else {
          var sheetMark = rabbitMotion.clipId + ":" + rabbitMotion.frame;
          if (this.artSheetLog !== sheetMark) {
            this.artSheetLog = sheetMark;
            console.log("[ShopAnim] sheet", rabbitMotion.sheetKey, "frame", rabbitMotion.frame, "/", rabbitMotion.frameCount, "at", Math.round(comboX2), Math.round(comboY2), "h", sheetH2, "noFlip");
          }
        }
      } else if (rabbitMotion && rabbitMotion.hasSheet && rabbitMotion.sheetKey) {
        // 椰汁走位/敲插等单角色 sheet（不含烤架）
        var juicePainted = this.paintSheetFoot(rabbitMotion.sheetKey, rabbitX, rabbitY, rabbitH, {
          u0: rabbitMotion.u0,
          v0: rabbitMotion.v0,
          u1: rabbitMotion.u1,
          v1: rabbitMotion.v1
        }, rabbitFlip, { alpha: rabbitMotion.alpha == null ? 1 : rabbitMotion.alpha });
        if (!juicePainted) {
          this.paintFootSprite("hero_rabbit_grill", rabbitX, rabbitY, 0, rabbitH, rabbitFlip, {
            rot: rabbitMotion.rot || 0,
            scaleY: rabbitMotion.scaleY == null ? 1 : rabbitMotion.scaleY
          });
        } else {
          var juiceMark = rabbitMotion.clipId + ":" + rabbitMotion.frame;
          if (this.artJuiceSheetLog !== juiceMark) {
            this.artJuiceSheetLog = juiceMark;
            console.log("[ShopAnim] juice sheet", rabbitMotion.sheetKey, "frame", rabbitMotion.frame, "at", Math.round(rabbitX), Math.round(rabbitY));
          }
        }
      } else {
        this.paintFootSprite(rabbitKey.indexOf("anim_") === 0 ? "hero_rabbit_grill" : rabbitKey, rabbitX, rabbitY, 0, rabbitH, rabbitFlip, {
          rot: rabbitMotion.rot || 0,
          scaleY: rabbitMotion.scaleY == null ? 1 : rabbitMotion.scaleY
        });
      }
      var customers = board.customers || [];
      var queue = (AIGCUtils.Selling && AIGCUtils.Selling.queue) || [];
      var customerH = this.portrait ? Math.round(this.height * 0.12) : 116;
      for (var i = 0; i < customers.length && i < queue.length; i++) {
        var point = this.shopPoint(customers[i]);
        var slid = this.customerSlidePoint(point, queue[i]);
        var custAnim = anim ? anim.resolve("customer_" + queue[i].id) : null;
        var custKey = L.customerSpriteKey(queue[i]);
        // 离场朝右 / 进场朝左：按各类型 walk sheet 原画朝向决定是否镜像（狐狸 sheet 面左）
        var custFlip = false;
        if (queue[i].leaving) {
          custFlip = AIGCUtils.ShopAnims.walkFlipForDir(queue[i].type, true);
        } else if ((queue[i].arrival || 0) > 2) {
          custFlip = AIGCUtils.ShopAnims.walkFlipForDir(queue[i].type, false);
        }
        var custAlpha = slid.alpha == null ? 1 : slid.alpha;
        if (custAnim && custAnim.alpha != null) custAlpha *= custAnim.alpha;
        // 站立精灵脚底贴 land/port.customers；侧身走/等待由 sheet 驱动；离场到右边界后淡出。
        if (custAlpha > 0.01) {
          // 等餐到位不裁切，避免右槽顾客被切成半身；仅进离场贴边时裁画外部分
          var custClip = !!(queue[i].leaving || (queue[i].arrival || 0) > 2);
          var cx = slid.x + (custAnim ? custAnim.dx || 0 : 0);
          var cy = slid.y + (custAnim ? custAnim.dy || 0 : 0);
          var usedSheet = false;
          if (custAnim && custAnim.hasSheet && custAnim.sheetKey) {
            usedSheet = !!this.paintSheetFoot(custAnim.sheetKey, cx, cy, customerH, {
              u0: custAnim.u0,
              v0: custAnim.v0,
              u1: custAnim.u1,
              v1: custAnim.v1
            }, custFlip, {
              alpha: custAlpha,
              clipToCanvas: custClip
            });
          }
          if (!usedSheet) {
            this.paintFootSprite(custKey, cx, cy, 0, customerH, custFlip, {
              alpha: custAlpha,
              clipToCanvas: custClip,
              rot: custAnim ? custAnim.rot || 0 : 0,
              scaleY: custAnim && custAnim.scaleY != null ? custAnim.scaleY : 1
            });
          }
          this.drawShopOrderBubble(queue[i], {
            x: slid.x,
            y: slid.y,
            headDx: slid.headDx,
            headDy: slid.headDy,
            alpha: custAlpha
          });
        }
        var motionKey = queue[i].id + ":" + (queue[i].leaving ? "out" : "in") + ":" + Math.round(custAlpha * 10) + ":" + (custAnim ? custAnim.clipId : "");
        if ((queue[i].arrival > 300 || queue[i].leaving) && this.customerMotionLog !== motionKey) {
          this.customerMotionLog = motionKey;
          var headX = Math.round(slid.x + (slid.headDx || 0));
          var headY = Math.round(slid.y + (slid.headDy || 0));
          console.log(
            "[ShopLayout] customer",
            queue[i].leaving ? "leave" : "arrive",
            queue[i].id,
            "slot",
            i,
            "clip",
            custAnim ? custAnim.clipId : "none",
            "side",
            custAnim ? !!custAnim.sideView : false,
            "foot",
            Math.round(slid.x),
            Math.round(slid.y),
            "edge",
            this.width,
            "alpha",
            custAlpha.toFixed(2),
            "head",
            headX,
            headY
          );
        }
      }
      this.shopJuicerPoint = this.shopPoint(board.juicer);
      // 台面椰子锚点：优先 juiceNut（横屏靠左红框 / 竖屏右红框圆木板），否则 work
      var nutSlot = board.juiceNut || board.work;
      this.shopWorkPoint = nutSlot ? this.shopPoint(nutSlot) : null;
      if (!this.shopArtLogged) {
        this.shopArtLogged = true;
        console.log("[ShopLayout] art slots", this.portrait ? "port" : "land", JSON.stringify(board));
      }
      var nutMark = (this.portrait ? "port:" : "land:") + (nutSlot ? Math.round(this.shopPoint(nutSlot).x) + "," + Math.round(this.shopPoint(nutSlot).y) : "none");
      if (this.artNutSlotLog !== nutMark) {
        this.artNutSlotLog = nutMark;
        console.log("[ShopLayout] juiceNut/work", this.portrait ? "port" : "land", nutMark);
      }
    },

    drawReadyGoods: function () {
      if (this.uiSkinChrome && this.artOn && AIGCUtils.ShopLayout) {
        this.drawShopPlates();
        this.drawJuiceStack();
        return;
      }
      var W = this.width, H = this.height;
      var goods = AIGCUtils.GameState.bakedGoods;
      var juiceGoods = goods.filter(function (good) { return good.recipeId === "coconut_juice"; });
      var plateY = H - 72 - 75;
      var startX = this.portrait ? 10 : 65;
      var stepX = this.portrait ? Math.round((W - 20) / AIGCUtils.FishSpecies.length) : 90;
      var labelColor = this.uiSkinChrome ? C.ink : C.cream;
      for (var plate = 0; plate < AIGCUtils.FishSpecies.length; plate++) {
        var plateX = startX + plate * stepX + Math.round(stepX / 2);
        var species = AIGCUtils.FishSpecies[plate];
        var fishGoods = goods.filter(function (good) {
          return good.recipeId === "fish_grilled" && good.speciesId === species.id;
        });
        if (!fishGoods.length) continue;
        if (!this.uiSkinChrome) {
          this.ellipse(plateX, plateY + 25, 28, 9, C.cream);
          var visible = Math.min(3, fishGoods.length);
          for (var fishIndex = 0; fishIndex < visible; fishIndex++) {
            this.fish(plateX - (visible - 1) * 10 + fishIndex * 20, plateY + 14 - fishIndex * 3, 14, true, species.id);
          }
        } else {
          this.paintGrilledIcon(species.id, plateX, plateY + 12, 28);
        }
        if (fishGoods.length > 1) this.text("×" + fishGoods.length, plateX + 18, plateY - 4, 12, labelColor, "center");
      }
      if (this.uiSkinChrome) return;
      var juiceStartX = this.portrait ? Math.round(W * 0.6) : 455;
      for (var juice = 0; juice < Math.min(3, juiceGoods.length); juice++) {
        var juiceX = juiceStartX + juice * (this.portrait ? 44 : 58);
        this.ellipse(juiceX, plateY + 22, 20, 7, C.cream);
        this.juice(juiceX, plateY + 5, 22);
        this.text("椰子汁", juiceX, plateY + 34, 11, C.ink, "center");
      }
      // R0042：非皮肤层也用右侧木牌数量，不用 ×N
      if (juiceGoods.length > 0) {
        this.drawJuiceCountPlaque(
          { x: juiceStartX, y: plateY + 5 },
          juiceGoods.length,
          22
        );
      }
    },

    drawPlating: function () {
      var W = this.width, H = this.height;
      var plating = AIGCUtils.Baking.plating;
      if (!plating) return;
      var t = Math.min(1, plating.timer / 750);
      var isFish = plating.recipeId === "fish_grilled";
      var hw = Math.round(W / 2);
      // 出餐动画：从烤制区飞向成品区
      var startX = this.portrait ? Math.round(W * 0.25) : 210;
      var startY = this.portrait ? Math.round(H * 0.55) : 235;
      var endX = this.portrait ? Math.round(W * 0.3) : 200;
      var endY = H - 72 - 75;
      if (!isFish) {
        startX = this.portrait ? Math.round(W * 0.75) : 520;
        endX = this.portrait ? Math.round(W * 0.65) : 520;
      }
      if (this.uiSkinChrome && this.artOn && AIGCUtils.ShopLayout) {
        var plateBoard = this.portrait ? AIGCUtils.ShopLayout.port : AIGCUtils.ShopLayout.land;
        if (isFish && plateBoard && plateBoard.plates) {
          var plateIndex = 0;
          for (var pi = 0; pi < AIGCUtils.FishSpecies.length; pi++) {
            if (AIGCUtils.FishSpecies[pi].id === plating.speciesId) plateIndex = pi;
          }
          var plateAnchor = this.shopPoint(plateBoard.plates[plateIndex]);
          endX = plateAnchor.x;
          endY = plateAnchor.y - 18;
          if (this.shopGrillBox) {
            startX = this.shopGrillBox.x + this.shopGrillBox.w / 2;
            startY = this.shopGrillBox.y + this.shopGrillBox.h * 0.3;
          }
        } else if (!isFish && this.shopWorkPoint) {
          var juiceStack = this.portrait ? this.portJuiceStackPoint() : this.landJuiceStackPoint();
          var lift = this.portrait ? 18 : 28;
          startX = this.shopWorkPoint.x;
          startY = this.shopWorkPoint.y - lift;
          endX = juiceStack.x;
          endY = juiceStack.y - lift;
        } else if (!isFish && this.shopJuicerPoint) {
          startX = this.shopJuicerPoint.x;
          startY = this.shopJuicerPoint.y - 36;
          endX = this.shopJuicerPoint.x;
          endY = this.shopJuicerPoint.y - 18;
        }
      }
      var x = startX + (endX - startX) * t;
      var y = startY + (endY - startY) * t - Math.sin(t * Math.PI) * 65;
      var artFlight = isFish && this.uiSkinChrome && this.artOn && this.drawArtFishFlight(plating, t);
      if (isFish && !artFlight) this.fish(x, y, 27, true, plating.speciesId);
      if (!isFish) {
        if (this.uiSkinChrome && this.artOn) this.paintCenterSprite("coconut_green_juiced", x, y, this.portrait ? 52 : 56, {});
        else this.juice(x, y, 40);
      }
      var titleX = isFish ? startX : (this.portrait ? Math.round(W * 0.75) : 520);
      if (!isFish && this.uiSkinChrome && this.artOn && this.shopWorkPoint) titleX = this.shopWorkPoint.x;
      // R0029：椰子汁完成提示上移；烤鱼标题位置不变
      var titleY = isFish ? Math.round(H * 0.2) : Math.round(H * 0.11);
      this.text(plating.title, titleX, titleY, 18, isFish ? C.cream : C.ink, "center");
    },

    drawShop: function () {
      this.shopGrillBox = null;
      this.shopJuicerPoint = null;
      this.shopWorkPoint = null;
      this.shopBubbles = [];
      this.shopFlight = null;
      this.portGoodsDrawnUnderRabbit = false;
      if (this.uiSkinChrome && this.artOn) this.drawShopCast();
      var W = this.width, H = this.height;
      var ct = 64, cb = H - 72, ch = cb - ct;
      var hw = Math.round(W / 2);
      var baking = AIGCUtils.Baking;
      var state = AIGCUtils.GameState;

      if (this.portrait) {
        // ── 竖屏商店布局：顾客区上（面朝玩家），厨房区下 ──
        var custH = Math.round(ch * 0.47);
        var custBottom = ct + custH;   // ~451
        var kitchenY = custBottom + 14;
        var kitchenH = Math.round(ch * 0.38);
        var hw2 = Math.round(W / 2);
        var slotW = hw2;

        if (!this.artOn) {
          this.rect(0, ct, W, custH, C.paper);
          this.rect(0, custBottom, W, 14, C.wood);
          this.rect(0, kitchenY, W, kitchenH, C.sky);
          this.rect(0, kitchenY + Math.round(kitchenH * 0.58), W, Math.round(kitchenH * 0.42), C.sand);
        }

        // ── 顾客区（面朝玩家，第一人称视角）──
        var queue = AIGCUtils.Selling.queue;
        for (var qi = 0; qi < Math.min(2, queue.length); qi++) {
          var customer2 = queue[qi];
          var missing2 = AIGCUtils.Selling.getMissing(customer2);
          var ready2 = missing2.fish === 0 && missing2.juice === 0;
          if (this.uiSkinChrome && this.artOn) {
            var skinCustomers = (AIGCUtils.ShopLayout && AIGCUtils.ShopLayout.port && AIGCUtils.ShopLayout.port.customers) || [];
            var skinP = skinCustomers[qi] ? this.customerSlidePoint(this.shopPoint(skinCustomers[qi]), customer2) : { x: Math.round(W / 2), y: custBottom };
            var stTextS = customer2.leaving ? "完成" : (ready2 ? "点击交付" : "等餐中");
            var stColorS = customer2.leaving || ready2 ? C.green : C.orange;
            this.text(stTextS, Math.round(skinP.x), Math.round(skinP.y + 14), 15, stColorS, "center");
            continue;
          }
          var portBubbles = (AIGCUtils.ShopLayout && AIGCUtils.ShopLayout.orderBubblePort) || [];
          var anchorP = portBubbles[qi] || portBubbles[0] || { cx: 0.34, rowFishFrac: 0.21, rowJuiceFrac: 0.28 };
          var cx2 = anchorP.cx > 0 && anchorP.cx <= 1 ? Math.round(W * anchorP.cx) : anchorP.cx;
          var animalColor = customer2.type === "cat" ? C.honey : customer2.type === "rabbit" ? C.white : customer2.type === "bear" ? C.woodLight : C.fish;
          var sz = Math.round(custH * 0.15);
          var headY2 = ct + Math.round(custH * 0.61);
          var bodyY2 = ct + Math.round(custH * 0.78);
          if (!this.uiSkinChrome) {
            this.ellipse(cx2, bodyY2, sz * 0.78, sz * 0.88, animalColor);
            this.circle(cx2, headY2, sz, animalColor);
            this.circle(cx2 - sz * 0.52, headY2 - sz * 0.72, sz * 0.3, animalColor);
            this.circle(cx2 + sz * 0.52, headY2 - sz * 0.72, sz * 0.3, animalColor);
            this.circle(cx2 - sz * 0.27, headY2 - sz * 0.1, sz * 0.11, C.ink, 12);
            this.circle(cx2 + sz * 0.27, headY2 - sz * 0.1, sz * 0.11, C.ink, 12);
            this.circle(cx2, headY2 + sz * 0.26, sz * 0.08, C.orange, 10);
          }
          var anchorDraw = {};
          for (var ak in anchorP) if (anchorP.hasOwnProperty(ak)) anchorDraw[ak] = anchorP[ak];
          anchorDraw.custH = custH;
          anchorDraw.cx = anchorP.cx;
          this.drawCustomerOrderBubble(cx2, ct, customer2, ready2, anchorDraw);
          // 状态标签（柜台边缘）
          var stText = customer2.leaving ? "完成" : (ready2 ? "点击交付" : "等餐中");
          var stColor = customer2.leaving ? C.green : (ready2 ? C.green : C.orange);
          this.text(stText, cx2, custBottom - 42, 17, stColor, "center");
        }
        // 金币飘字
        for (var me = 0; me < AIGCUtils.Selling.moneyEffects.length; me++) {
          var money = AIGCUtils.Selling.moneyEffects[me];
          var alpha = 1 - money.timer / 1100;
          var mx2 = money.slot % 2 === 0 ? Math.round(slotW * 0.5) : Math.round(slotW + slotW * 0.5);
          var my2 = custBottom - 40 - money.timer * 0.04;
          if (this.uiSkinChrome && this.artOn && AIGCUtils.ShopLayout && AIGCUtils.ShopLayout.port) {
            var portSlot = (AIGCUtils.ShopLayout.port.customers || [])[money.slot];
            if (portSlot) {
              var portP = this.shopPoint(portSlot);
              mx2 = portP.x;
              my2 = portP.y + portP.headDy - money.timer * 0.04;
            }
          }
          this.text("+" + money.amount, mx2, my2, 22, [0.42, 0.67, 0.34, alpha], "center");
        }

        // ── 厨房区（下方，烤制2/3宽 / 椰子汁1/3宽）──
        var kitchenW = Math.round(W * 2 / 3);   // ~360px
        var juiceW = W - kitchenW;               // ~180px
        var furnaceX = Math.round(kitchenW * 0.47), furnaceY = kitchenY + Math.round(kitchenH * 0.48);
        if (!this.artOn) this.rect(0, kitchenY, kitchenW, kitchenH, C.woodLight);
        if (!this.uiSkinChrome) this.text("烤鱼区 · 厨房", Math.round(kitchenW / 2), kitchenY + 14, 14, C.cream, "center");
        var grillY = furnaceY + 40, grillW = Math.round(kitchenW * 0.75);
        if (this.shopGrillBox) {
          furnaceX = Math.round(this.shopGrillBox.x + this.shopGrillBox.w / 2);
          grillY = Math.round(this.shopGrillBox.y + this.shopGrillBox.h * 0.58);
        }
        if (!this.artOn) {
          this.circle(furnaceX, furnaceY, 38, C.brown);
          this.rect(furnaceX - grillW / 2 - 4, grillY - 9, grillW + 8, 6, C.woodLight);
          var grillBars = Math.round(grillW / 18);
          for (var gbi = 0; gbi < grillBars; gbi++) {
            var barX = furnaceX - grillW / 2 + 8 + gbi * Math.round((grillW - 16) / Math.max(1, grillBars - 1));
            this.line(barX, grillY - 9, barX, grillY - 3, 3, C.wood);
          }
          this.rect(furnaceX - grillW / 2, grillY, grillW, 18, C.wood);
          this.rect(furnaceX - grillW / 2 + 4, grillY + 4, grillW - 8, 10, C.brown);
          this.line(furnaceX - grillW / 2 + 6, grillY + 18, furnaceX - grillW / 2 - 3, grillY + 36, 5, C.wood);
          this.line(furnaceX + grillW / 2 - 6, grillY + 18, furnaceX + grillW / 2 + 3, grillY + 36, 5, C.wood);
        }
        // 原画层：火在烤架精灵下沿，鱼贴烤网中心。矢量层仍相对旧烤架面。
        // flipFx：点击翻面后 current 已清空，仍要并行画完烤鱼翻面。
        // 出餐飞行已接管鱼时不再叠画 flipFx，避免烤网与飞行双鱼
        var flipFxPort = baking.flipFx && baking.flipFx.timer < baking.flipFx.duration && !(baking.plating && baking.plating.recipeId === "fish_grilled");
        var artFishPort = this.uiSkinChrome && this.artOn && this.shopGrillBox && ((baking.current && baking.current.recipeId === "fish_grilled") || flipFxPort);
        if (artFishPort) {
          // 合帧表已含火与鱼，不再叠画火星/烤鱼，避免双层
          if (!this.shopCombinedAnim) {
            if (baking.current && baking.current.stage === "stoke") this.drawArtStokeFlames(this.shopGrillBox);
            if (baking.current && (baking.current.stage === "cooking" || baking.current.stage === "flip")) {
              this.drawArtStokeFlames(this.shopGrillBox);
            }
            if ((baking.current && (baking.current.stage === "cooking" || baking.current.stage === "flip")) || flipFxPort) {
              this.drawArtGrillFish(baking.current, this.shopGrillBox, 16);
            }
          }
        } else {
          var flameNow = Date.now();
          var flameBase = baking.current && baking.current.recipeId === "fish_grilled" && baking.current.perfectFire ? 34 : 19;
          if (this.artOn && !(baking.current && baking.current.recipeId === "fish_grilled") && !flipFxPort) flameBase = 0;
          var fh = flameBase + Math.sin(flameNow / 200) * 6 + Math.sin(flameNow / 137) * 3;
          var fw = 14 + Math.sin(flameNow / 160 + 1) * 3;
          var flameBaseY = grillY - 9;
          if (flameBase > 0) {
            this.tri(furnaceX, flameBaseY - fh, furnaceX - fw, flameBaseY, furnaceX + fw, flameBaseY, C.orange);
            var fh2 = fh * 0.65 + Math.sin(flameNow / 115 + 2) * 3;
            this.tri(furnaceX + fw * 0.1, flameBaseY - fh2, furnaceX - fw * 0.5, flameBaseY, furnaceX + fw * 0.55, flameBaseY, C.honey);
          }
          if (baking.current && baking.current.recipeId === "fish_grilled") {
            // 等待翻面时鱼静贴；只有 flipFx 才抬翻
            var flipLift = flipFxPort ? Math.abs(Math.sin((baking.flipFx.timer / baking.flipFx.duration) * Math.PI)) * 26 : 0;
            var flipSlide = flipFxPort ? Math.sin((baking.flipFx.timer / baking.flipFx.duration) * Math.PI) * 16 : 0;
            if (this.uiSkinChrome) this.paintFishIcon(baking.current.speciesId, furnaceX + flipSlide, grillY - 48 - flipLift, 36);
            else this.fish(furnaceX + flipSlide, grillY - 48 - flipLift, 22, true, baking.current.speciesId);
          }
        }
        // R0031：烤鱼指引统一绿色流光粗体
        var grillHintXPort = Math.round(kitchenW / 2);
        var grillHintYPort = kitchenY + 26;
        if (!(baking.current && baking.current.recipeId === "fish_grilled")) {
          this.drawGuideTip("点击生鱼开始烤", grillHintXPort, grillHintYPort);
        }
        if (!this.artOn) this.rabbitBack(furnaceX, grillY + 18, 26);
        // 进度条/文字在兔子之上（最顶层）
        if (baking.current && baking.current.recipeId === "fish_grilled") {
          if (baking.current.stage === "stoke") {
            this.drawGuideTip("生火 绿区点击", grillHintXPort, grillHintYPort);
            this.progress(8, kitchenY + Math.round(kitchenH * 0.85), kitchenW - 18, baking.current.cursor, baking.current.cursor, 0.4, 0.6);
          } else if (baking.current.stage === "cooking") {
            this.drawGuideTip(baking.current.perfectFire ? "完美火势" : "烤制中", grillHintXPort, grillHintYPort);
            if (!this.uiSkinChrome) this.rect(8, kitchenY + Math.round(kitchenH * 0.85), kitchenW - 18, 13, C.cream);
            // 烤制填充深橙（横竖屏同源）
            this.rect(8, kitchenY + Math.round(kitchenH * 0.85), (kitchenW - 18) * Math.min(1, baking.current.elapsed / baking.current.cookDuration), 13, C.orange);
          } else if (baking.current.stage === "flip") {
            this.drawGuideTip("翻面 绿区点击", grillHintXPort, grillHintYPort);
            this.progress(8, kitchenY + Math.round(kitchenH * 0.85), kitchenW - 18, baking.current.cursor, baking.current.cursor);
          }
        }
        // 椰子汁区（右1/3）
        var juiceCX = kitchenW + Math.round(juiceW / 2);
        var juiceCY = kitchenY + Math.round(kitchenH * 0.42);
        if (this.shopJuicerPoint) {
          juiceCX = Math.round(this.shopJuicerPoint.x);
          juiceCY = Math.round(this.shopJuicerPoint.y - this.height * 0.02);
        }
        if (!this.uiSkinChrome) {
          this.rect(kitchenW + 4, kitchenY, juiceW - 4, kitchenH, C.paper);
          this.text("椰子汁", juiceCX, kitchenY + 14, 13, C.ink, "center");
        }
        if (!this.uiSkinChrome) {
          var jGrillY = juiceCY + 48, jGrillW = 40;
          this.rect(juiceCX - jGrillW / 2 - 3, jGrillY - 7, jGrillW + 6, 5, C.woodLight);
          for (var jgi = 0; jgi < 3; jgi++) {
            this.line(juiceCX - jGrillW / 2 + 4 + jgi * 14, jGrillY - 7, juiceCX - jGrillW / 2 + 4 + jgi * 14, jGrillY - 2, 3, C.wood);
          }
          this.rect(juiceCX - jGrillW / 2, jGrillY, jGrillW, 14, C.wood);
          this.rect(juiceCX - jGrillW / 2 + 3, jGrillY + 3, jGrillW - 6, 8, C.brown);
          this.line(juiceCX - jGrillW / 2 + 4, jGrillY + 14, juiceCX - jGrillW / 2 - 2, jGrillY + 28, 4, C.wood);
          this.line(juiceCX + jGrillW / 2 - 4, jGrillY + 14, juiceCX + jGrillW / 2 + 2, jGrillY + 28, 4, C.wood);
        }
        if (baking.current && baking.current.recipeId === "coconut_juice") {
          var artJuicePort = this.uiSkinChrome && this.artOn && this.drawArtJuice(baking.current);
          var hintX = juiceCX;
          var hintY = kitchenY + 26;
          if ((artJuicePort || this.shopWorkPoint) && this.shopWorkPoint) {
            hintX = Math.round(this.shopWorkPoint.x);
            hintY = Math.round(this.shopWorkPoint.y - 72);
          }
          var juiceStagePort = baking.current.stage;
          if (juiceStagePort === "put_tools" || juiceStagePort === "walk_to_work" || juiceStagePort === "pick_coconut" || juiceStagePort === "straw_anim") {
            // 自动段不画提示文案（避免出现「放下」等字）
          } else if (juiceStagePort === "crack") {
            if (!artJuicePort) {
              var hitProgress2 = baking.current.hitTimer > 0 ? 1 - baking.current.hitTimer / 260 : 1;
              var swing2 = baking.current.hitTimer > 0 ? Math.sin(hitProgress2 * Math.PI) : 0;
              var cShake = baking.current.hitTimer > 0 ? Math.sin(hitProgress2 * Math.PI * 3) * 4 : 0;
              this.coconut(juiceCX + cShake, juiceCY, 32);
              for (var cr2 = 0; cr2 < baking.current.taps; cr2++) this.line(juiceCX - 16 + cr2 * 10, juiceCY - 22, juiceCX - 8 + cr2 * 8, juiceCY - 4, 3, C.cream);
              this.line(juiceCX - 55, kitchenY + 38, juiceCX - 16 + swing2 * 10, juiceCY - 24 + swing2 * 18, 7, C.woodLight);
            }
            this.drawGuideTip(
              baking.current.taps >= 3 ? "敲开了" : "点击敲开 " + baking.current.taps + "/3",
              hintX,
              hintY
            );
          } else if (juiceStagePort === "straw") {
            if (!artJuicePort) this.juice(juiceCX, juiceCY, 44, false);
            this.drawGuideTip("点击插吸管", hintX, hintY);
          }
        } else {
          if (state.ingredients.coconut > 0) {
            // R0031：椰汁空闲提示统一绿色流光
            var juiceTipXPort = juiceCX;
            var juiceTipYPort = kitchenY + 10;
            if (this.shopWorkPoint) {
              juiceTipXPort = Math.round(this.shopWorkPoint.x);
              juiceTipYPort = Math.round(this.shopWorkPoint.y - 110);
            }
            this.drawGuideTip("点击椰子开始制作椰汁", juiceTipXPort, juiceTipYPort);
            if (!this.uiSkinChrome) {
              this.coconut(juiceCX - 18, juiceCY, 21);
              this.coconut(juiceCX + 16, juiceCY + 10, 17);
            }
          } else {
            this.rect(kitchenW + 8, kitchenY + 38, juiceW - 20, 45, C.disabled);
            this.text("椰子用完 去椰林", juiceCX, kitchenY + 56, 13, C.cream, "center");
          }
        }
        // 成品 + 食材选择。原画层成品已在兔子前画过，这里不再重复以免盖住兔子
        if (!(this.uiSkinChrome && this.artOn && this.portGoodsDrawnUnderRabbit)) {
          this.drawReadyGoods();
        }
        this.portGoodsDrawnUnderRabbit = false;
        this.drawPlating();
        var bW = Math.round((W - 10) / AIGCUtils.FishSpecies.length);
        for (var si = 0; si < AIGCUtils.FishSpecies.length; si++) {
          var species2 = AIGCUtils.FishSpecies[si];
          var fishCount2 = state.getFishCount(species2.id);
          var unlocked2 = this.speciesShopUnlocked(species2.id);
          var bx2 = 5 + si * bW;
          if (!unlocked2) {
            // 未解锁：灰色鱼标，不画「锁」字；点击仍走 startRecipe → 原弹窗
            var lockIc2 = Math.min(32, Math.round(bW * 0.38));
            var grayTint2 = [0.55, 0.55, 0.55, 1];
            if (this.uiSkinChrome) {
              this.paintFishIcon(species2.id, bx2 + 18, cb - 28, lockIc2, grayTint2);
            } else {
              this.rect(bx2, cb - 60, bW - 4, 50, [0.55, 0.52, 0.48, 0.55]);
              this.paintFishIcon(species2.id, bx2 + Math.round(bW * 0.28), cb - 28, lockIc2, grayTint2);
            }
          } else if (fishCount2) {
            var ic2 = Math.min(32, Math.round(bW * 0.38));
            if (this.uiSkinChrome) {
              this.paintFishIcon(species2.id, bx2 + 18, cb - 28, ic2);
              this.button(bx2 + 32, cb - 60, bW - 36, 50, species2.name + " " + fishCount2, true);
            } else {
              this.button(bx2, cb - 60, bW - 4, 50, species2.name + " " + fishCount2, true);
              this.paintFishIcon(species2.id, bx2 + Math.round(bW * 0.28), cb - 28, ic2);
            }
          } else {
            var ic0 = Math.min(28, Math.round(bW * 0.36));
            if (this.uiSkinChrome) {
              this.paintFishIcon(species2.id, bx2 + 18, cb - 28, ic0);
              this.button(bx2 + 30, cb - 60, bW - 34, 50, species2.name + " 0", false);
            } else {
              this.button(bx2, cb - 60, bW - 4, 50, species2.name + " 0", false);
              this.paintFishIcon(species2.id, bx2 + Math.round(bW * 0.28), cb - 28, ic0);
            }
          }
        }
        var guideIdxPort = this.firstCookableFishIndex();
        if (guideIdxPort >= 0) {
          var guideCxPort = 5 + guideIdxPort * bW + Math.round(bW / 2);
          this.drawGrillFishGuideArrow(guideCxPort, cb - 68);
        }

      } else {
        if (!this.artOn) {
          this.rect(0, 64, 960, 404, C.sky);
          this.rect(0, 130, 960, 338, C.sand);
          this.rect(20, 115, 390, 270, C.woodLight);
        }
        if (!this.uiSkinChrome) this.rect(420, 115, 200, 270, C.paper);
        if (!this.uiSkinChrome) {
          this.text("烤鱼区 · 厨房", 210, 125, 21, C.cream, "center");
          this.text("椰子汁区", 520, 125, 20, C.ink, "center");
          this.text("送餐口", 520, 151, 16, C.ink, "center");
        }
        var lgX = 210, lgY = 336, lgW = Math.round(390 * 0.75);
        if (this.shopGrillBox) {
          lgX = Math.round(this.shopGrillBox.x + this.shopGrillBox.w / 2);
          lgY = Math.round(this.shopGrillBox.y + this.shopGrillBox.h * 0.58);
        }
        if (!this.artOn) {
          this.circle(210, 285, 49, C.brown);
          this.rect(lgX - lgW / 2 - 4, lgY - 9, lgW + 8, 6, C.woodLight);
          var lgBars = Math.round(lgW / 18);
          for (var glb = 0; glb < lgBars; glb++) {
            var lgBarX = lgX - lgW / 2 + 8 + glb * Math.round((lgW - 16) / Math.max(1, lgBars - 1));
            this.line(lgBarX, lgY - 9, lgBarX, lgY - 3, 3, C.wood);
          }
          this.rect(lgX - lgW / 2, lgY, lgW, 20, C.wood);
          this.rect(lgX - lgW / 2 + 4, lgY + 4, lgW - 8, 12, C.brown);
          this.line(lgX - lgW / 2 + 7, lgY + 20, lgX - lgW / 2 - 4, lgY + 44, 5, C.wood);
          this.line(lgX + lgW / 2 - 7, lgY + 20, lgX + lgW / 2 + 4, lgY + 44, 5, C.wood);
        }
        var flipFxLand = baking.flipFx && baking.flipFx.timer < baking.flipFx.duration && !(baking.plating && baking.plating.recipeId === "fish_grilled");
        var artFishLand = this.uiSkinChrome && this.artOn && this.shopGrillBox && ((baking.current && baking.current.recipeId === "fish_grilled") || flipFxLand);
        if (artFishLand) {
          if (!this.shopCombinedAnim) {
            if (baking.current && baking.current.stage === "stoke") this.drawArtStokeFlames(this.shopGrillBox);
            if (baking.current && (baking.current.stage === "cooking" || baking.current.stage === "flip")) {
              this.drawArtStokeFlames(this.shopGrillBox);
            }
            if ((baking.current && (baking.current.stage === "cooking" || baking.current.stage === "flip")) || flipFxLand) {
              this.drawArtGrillFish(baking.current, this.shopGrillBox, 20);
            }
          }
        } else {
          var lgFlameNow = Date.now();
          var lgFlameBase = baking.current && baking.current.recipeId === "fish_grilled" && baking.current.perfectFire ? 44 : 26;
          if (this.artOn && !(baking.current && baking.current.recipeId === "fish_grilled") && !flipFxLand) lgFlameBase = 0;
          var lgFh = lgFlameBase + Math.sin(lgFlameNow / 200) * 8 + Math.sin(lgFlameNow / 137) * 4;
          var lgFw = 20 + Math.sin(lgFlameNow / 160 + 1) * 4;
          var lgFlameBaseY = lgY - 9;
          if (lgFlameBase > 0) {
            this.tri(lgX, lgFlameBaseY - lgFh, lgX - lgFw, lgFlameBaseY, lgX + lgFw, lgFlameBaseY, C.orange);
            var lgFh2 = lgFh * 0.65 + Math.sin(lgFlameNow / 115 + 2) * 4;
            this.tri(lgX + lgFw * 0.1, lgFlameBaseY - lgFh2, lgX - lgFw * 0.5, lgFlameBaseY, lgX + lgFw * 0.55, lgFlameBaseY, C.honey);
          }
          if (baking.current && baking.current.recipeId === "fish_grilled") {
            var landFlip = flipFxLand ? Math.abs(Math.sin((baking.flipFx.timer / baking.flipFx.duration) * Math.PI)) * 32 : 0;
            var landSlide = flipFxLand ? Math.sin((baking.flipFx.timer / baking.flipFx.duration) * Math.PI) * 20 : 0;
            if (this.uiSkinChrome) this.paintFishIcon(baking.current.speciesId, lgX + landSlide, lgY - 48 - landFlip, 42);
            else this.fish(lgX + landSlide, lgY - 48 - landFlip, 34, true, baking.current.speciesId);
          }
        }
        if (!(baking.current && baking.current.recipeId === "fish_grilled")) {
          this.drawGuideTip("点击生鱼开始烤", 220, 170);
        }
        if (!this.artOn) this.rabbitBack(lgX, lgY + 20, 28);
        // 进度条/文字在兔子之上（最顶层）— R0031 绿色流光统一样式
        if (baking.current && baking.current.recipeId === "fish_grilled") {
          if (baking.current.stage === "stoke") {
            this.drawGuideTip("生火 绿区点击", 210, 170);
            this.progress(75, 360, 270, baking.current.cursor, baking.current.cursor, 0.4, 0.6);
          } else if (baking.current.stage === "cooking") {
            this.drawGuideTip(baking.current.perfectFire ? "完美火势" : "烤制中", 210, 170);
            if (!this.uiSkinChrome) this.rect(75, 360, 270, 20, C.cream);
            // 烤制填充深橙（横竖屏同源）
            this.rect(75, 360, 270 * Math.min(1, baking.current.elapsed / baking.current.cookDuration), 20, C.orange);
          } else if (baking.current.stage === "flip") {
            this.drawGuideTip("翻面 绿区点击", 210, 170);
            this.progress(75, 360, 270, baking.current.cursor, baking.current.cursor);
          }
          if (this._grillHintStyleLog !== baking.current.stage) {
            this._grillHintStyleLog = baking.current.stage;
            console.log("[ShopGuide] land grill hint style", baking.current.stage, "drawGuideTip green shine");
          }
        }
        var artLayerLand = !!(this.uiSkinChrome && this.artOn);
        var ljX = 520, ljY = 245;
        if (artLayerLand && this.shopWorkPoint) {
          ljX = Math.round(this.shopWorkPoint.x);
          ljY = Math.round(this.shopWorkPoint.y - 8);
        } else if (this.shopJuicerPoint) {
          ljX = Math.round(this.shopJuicerPoint.x);
          ljY = Math.round(this.shopJuicerPoint.y - 28);
        }
        if (baking.current && baking.current.recipeId === "coconut_juice") {
          if (artLayerLand) this.drawArtJuice(baking.current);
          var juiceStageLand = baking.current.stage;
          if (juiceStageLand === "put_tools" || juiceStageLand === "walk_to_work" || juiceStageLand === "pick_coconut" || juiceStageLand === "straw_anim") {
            // 自动段不画提示文案（避免出现「放下」等字）
          } else if (juiceStageLand === "crack") {
            if (!artLayerLand) {
              var hitProgress = baking.current.hitTimer > 0 ? 1 - baking.current.hitTimer / 260 : 1;
              var swing = baking.current.hitTimer > 0 ? Math.sin(hitProgress * Math.PI) : 0;
              var coconutShake = baking.current.hitTimer > 0 ? Math.sin(hitProgress * Math.PI * 3) * 4 : 0;
              this.coconut(ljX + coconutShake, ljY, 48);
              for (var crack = 0; crack < baking.current.taps; crack++) this.line(ljX - 20 + crack * 15, ljY - 30, ljX - 10 + crack * 10, ljY + 5, 3, C.cream);
              this.line(ljX - 80, ljY - 95, ljX - 25 + swing * 15, ljY - 35 + swing * 35, 8, C.woodLight);
              this.rect(ljX - 42 + swing * 15, ljY - 55 + swing * 35, 45, 25, C.wood);
            }
            this.drawGuideTip(
              baking.current.taps >= 3 ? "敲开了" : "点击敲开 " + baking.current.taps + "/3",
              ljX,
              ljY - 65
            );
          } else if (juiceStageLand === "straw") {
            if (!artLayerLand) {
              this.juice(ljX, ljY, 65, false);
              if (!this.shopJuicerPoint) this.line(575, 280, 595, 220, 5, C.orange);
            }
            this.drawGuideTip("点击插吸管", ljX, ljY - 65);
          }
        } else {
          if (state.ingredients.coconut > 0) {
            var juiceTipXLand = 520;
            var juiceTipYLand = 150;
            if (this.shopWorkPoint) {
              juiceTipXLand = Math.round(this.shopWorkPoint.x);
              juiceTipYLand = Math.round(this.shopWorkPoint.y - 110);
            }
            this.drawGuideTip("点击椰子开始制作椰汁", juiceTipXLand, juiceTipYLand);
            if (!this.uiSkinChrome) {
              this.coconut(555, 220, 22);
              this.coconut(580, 230, 20);
              this.coconut(540, 238, 19);
            }
          } else {
            this.rect(442, 190, 155, 65, C.disabled);
            this.text("椰子用完了 去椰林", 520, 210, 17, C.cream, "center");
          }
        }
        this.drawReadyGoods();
        this.drawPlating();
        for (var customerIndex = 0; customerIndex < AIGCUtils.Selling.queue.length; customerIndex++) {
          if (!this.artOn) {
            this.drawOrderCustomer(AIGCUtils.Selling.queue[customerIndex], 630, 95 + customerIndex * 155);
          }
        }
        if (this.artOn && !this.uiSkinChrome) {
          var landBubbles = (AIGCUtils.ShopLayout && AIGCUtils.ShopLayout.orderBubbleLand) || [];
          for (var ai = 0; ai < Math.min(2, AIGCUtils.Selling.queue.length); ai++) {
            var oc = AIGCUtils.Selling.queue[ai];
            var anchor = landBubbles[ai] || landBubbles[0];
            if (!anchor) continue;
            var om = AIGCUtils.Selling.getMissing(oc);
            var oready = om.fish === 0 && om.juice === 0;
            this.drawCustomerOrderBubble(anchor.cx, anchor.top, oc, oready, anchor);
          }
        }
        for (var effect = 0; effect < AIGCUtils.Selling.moneyEffects.length; effect++) {
          var money = AIGCUtils.Selling.moneyEffects[effect];
          var alpha = 1 - money.timer / 1100;
          var moneyX = 690;
          var moneyY = 82 + money.slot * 155 - money.timer * 0.035;
          if (this.uiSkinChrome && this.artOn && AIGCUtils.ShopLayout && AIGCUtils.ShopLayout.land) {
            var moneySlot = (AIGCUtils.ShopLayout.land.customers || [])[money.slot];
            if (moneySlot) {
              moneyX = moneySlot.x;
              moneyY = moneySlot.y + (moneySlot.headDy || -90) - money.timer * 0.03;
            }
          }
          this.text("+" + money.amount, moneyX, moneyY, 25, [0.42, 0.67, 0.34, alpha], "center");
        }
        // R0045：桌面带五等分竖排（4 鱼 + 椰汁）统一绘制
        this.drawLandShopTray();
        if (!this.uiSkinChrome) this.text("点椰子做椰子汁", 520, 382, 16, C.ink, "center");
      }
    },

    drawInventory: function () {
      var state = AIGCUtils.GameState;
      var hw = Math.round(this.width / 2);
      var hh = Math.round(this.height / 2);
      var layout = this.getSettlementLayout(hw, hh);
      this.paintSettlementShell(layout, "背包");
      var lineSize = this.portrait ? 15 : 16;
      var lineY0 = layout.dlgY + Math.round(layout.dlgH * 0.16);
      for (var i = 0; i < AIGCUtils.FishSpecies.length; i++) {
        var species = AIGCUtils.FishSpecies[i];
        var fine = state.fishStock.filter(function (fish) {
          return fish.speciesId === species.id && fish.quality === "fine";
        }).reduce(function (total, fish) {
          return total + Math.max(1, fish.portions || 1);
        }, 0);
        var row = species.name + " " + state.getFishCount(species.id) + "  优质 " + fine;
        var rowY = lineY0 + i * 30;
        this.paintFishIcon(species.id, layout.dlgX + 40, rowY + 12, 26);
        this.text(row, layout.dlgX + 60, this.textYInBox(row, lineSize, rowY, 28), lineSize, C.ink, "left");
      }
      this.paintSettlementLongs(layout, [
        "椰子 " + state.ingredients.coconut + "    金椰子 " + state.ingredients.goldenCoconut,
        "烤鱼 " + state.getProductCount("fish_grilled") + "    椰子汁 " + state.getProductCount("coconut_juice")
      ]);
      this.text(
        "轻触空白处关闭",
        hw,
        layout.dlgY + layout.dlgH - 22,
        14,
        [0.45, 0.42, 0.38, 0.9],
        "center"
      );
    },

    drawFishEscapedDialog: function (hw, hh) {
      var collection = AIGCUtils.Collection;
      var layout = this.getSettlementLayout(hw, hh, "fish");
      this.paintSettlementShell(layout, "太晚了 鱼跑了");
      if (this.paintUiStretch("dialog-settlement-mid-plate", layout.plate.x, layout.plate.y, layout.plate.w, layout.plate.h)) {
        this.flush();
      }
      // R0041：与「钓到鱼了」同款，圆盘中心补生鱼素材
      var escaped = collection.escapedFish;
      var speciesId = (escaped && escaped.speciesId) || "small";
      this.paintFishIcon(
        speciesId,
        layout.plate.x + layout.plate.w / 2,
        layout.plate.y + layout.plate.h / 2,
        Math.round(layout.plate.w * 0.55)
      );
      if (!this._loggedEscapedFishIcon) {
        this._loggedEscapedFishIcon = true;
        console.log("[FishDialog] R0041 escaped plate fish", speciesId);
      }
      this.paintSettlementLongs(layout, ["看广告可复活本次", "可复活当前这次钓鱼"]);
      this.paintSettlementShorts(layout, [
        { label: collection.reviveBusy ? "广告加载中" : "看广告复活", active: true },
        { label: "放弃重钓", active: false }
      ]);
    },

    drawFishResult: function () {
      var fish = AIGCUtils.Collection.caughtFish;
      if (!fish) return;
      var hw = Math.round(this.width / 2);
      var hh = Math.round(this.height / 2);
      var layout = this.getSettlementLayout(hw, hh, "fish");
      var species = AIGCUtils.Recipes.getFishSpecies(fish.speciesId);
      this.paintSettlementShell(layout, "钓到鱼了");
      if (this.paintUiStretch("dialog-settlement-mid-plate", layout.plate.x, layout.plate.y, layout.plate.w, layout.plate.h)) {
        this.flush();
      }
      this.paintFishIcon(
        fish.speciesId,
        layout.plate.x + layout.plate.w / 2,
        layout.plate.y + layout.plate.h / 2,
        Math.round(layout.plate.w * 0.55)
      );
      var line1 = species.name + " " + fish.weight.toFixed(1) + "kg";
      var line2 =
        (fish.quality === "fine" ? "优质鱼获" : "普通鱼获") + " · " + fish.portions + "份鱼肉";
      var Onboarding = AIGCUtils.Onboarding;
      var legacyDone = !Onboarding || Onboarding.shouldShowLegacyThreeFishGuide();
      var showGuide =
        legacyDone &&
        AIGCUtils.GameState.fishCaught >= 3 &&
        !AIGCUtils.GameState.tasks.coconut &&
        !AIGCUtils.GameState.shopBuilt;
      if (showGuide) {
        this.paintSettlementLongs(layout, [line1, "三条鱼已备好 去地图选椰林"]);
        this.paintSettlementShorts(layout, [
          { label: "去地图", active: true },
          { label: "继续钓鱼", active: false }
        ]);
      } else {
        this.paintSettlementLongs(layout, [line1, line2]);
        this.paintSettlementShorts(layout, [{ label: "收进鱼篓", active: true }]);
      }
    },

    drawCoconutSummary: function () {
      var collection = AIGCUtils.Collection;
      var hw = Math.round(this.width / 2);
      var hh = Math.round(this.height / 2);
      var layout = this.getSettlementLayout(hw, hh);
      var countLabel = "本轮采摘了 " + collection.caughtThisRound + " 个椰子";
      var promptLabel = "";
      var shorts = [];
      var onboardActive = AIGCUtils.Onboarding && AIGCUtils.Onboarding.isActive();
      if (AIGCUtils.GameState.shopBuilt) {
        promptLabel = "继续采摘 还是去地图逛逛";
        shorts = [
          { label: "继续采摘", active: true },
          { label: "去地图逛逛", active: false }
        ];
      } else if (AIGCUtils.GameState.tasks.coconut) {
        if (onboardActive) {
          // R0025：首轮椰子二选一
          promptLabel = "去烤鱼店 还是继续采摘";
          shorts = [
            { label: "去烤鱼店", active: true },
            { label: "留在椰子林", active: false }
          ];
        } else {
          promptLabel = "现在建店 还是继续采摘";
          shorts = [
            { label: "搭建烤鱼店", active: true },
            { label: "再采一轮", active: false }
          ];
        }
      } else {
        shorts = [{ label: "再试一次", active: true }];
      }
      this.paintSettlementShell(layout, "本轮采摘结束");
      if (this.paintUiStretch("dialog-settlement-mid-coconut", layout.mid.x, layout.mid.y, layout.mid.w, layout.mid.h)) {
        this.flush();
      } else {
        this.coconut(hw, layout.mid.y + Math.round(layout.mid.h / 2), 35);
      }
      this.paintSettlementLongs(layout, promptLabel ? [countLabel, promptLabel] : [countLabel]);
      this.paintSettlementShorts(layout, shorts);
    },

    // 未解锁：轻蒙层 + 略高木牌，两行（标题 + 条件），奶油色字；点任意处关闭
    drawMapLockedPrompt: function () {
      var W = this.width;
      var H = this.height;
      var hw = Math.round(W / 2);
      var hh = Math.round(H / 2);
      var lines = AIGCUtils.MapZones.getLockedPromptLines(AIGCUtils.Game.mapLockedZone);
      var title = lines.title;
      var detail = lines.detail;
      var titleFs = this.portrait ? 18 : 20;
      var detailFs = this.portrait ? 13 : 14;
      var signW = Math.min(460, Math.max(300, Math.round(W * 0.58)));
      var signH = Math.max(110, Math.round(signW * 0.36));
      var signX = hw - Math.round(signW / 2);
      var signY = hh - Math.round(signH / 2);
      var maxTextW = Math.round(signW * 0.86);
      while (detailFs > 11 && this.textWidth(detail, detailFs) > maxTextW) {
        detailFs -= 1;
      }
      this.rect(0, 0, W, H, C.overlay);
      if (!this.paintUiStretch("dialog-settlement-title", signX, signY, signW, signH)) {
        this.rect(signX, signY, signW, signH, C.wood);
      } else {
        this.flush();
      }
      // 两行收在木牌中上：标题约 38%，条件约 58%，避免贴底
      var titleY = signY + Math.round(signH * 0.38);
      var detailY = signY + Math.round(signH * 0.58);
      // R0025：弹窗统一 dialogInk（木牌上若对比偏弱可再调）
      var inkLight = C.dialogInk;
      this.text(title, hw, titleY, titleFs, inkLight, "center");
      this.text(detail, hw, detailY, detailFs, inkLight, "center");
    },

    /**
     * R0025：新人引导三弹窗。失败时降级为纯色木牌 + 文字，不阻塞流程。
     */
    drawOnboardingDialog: function () {
      var Onboarding = AIGCUtils.Onboarding;
      if (!Onboarding || !Onboarding.dialog) return;
      var kind = Onboarding.dialog;
      var W = this.width;
      var H = this.height;
      var hw = Math.round(W / 2);
      var hh = Math.round(H / 2);
      var layout = this.getSettlementLayout(hw, hh);
      var assetKey =
        kind === "intro"
          ? "dialog-onboard-intro"
          : kind === "coconutGuide"
            ? "dialog-onboard-coconut"
            : kind === "end"
              ? "dialog-onboard-end"
              : null;
      this.rect(0, 0, W, H, C.overlay);
      var painted = assetKey && this.paintUiStretch(assetKey, layout.dlgX, layout.dlgY, layout.dlgW, layout.dlgH);
      if (!painted) {
        console.warn("[Onboarding] dialog asset missing, fallback", assetKey);
        this.rect(layout.dlgX, layout.dlgY, layout.dlgW, layout.dlgH, C.cream);
        var fallbackTitle =
          kind === "intro" ? "欢迎来到孤岛" : kind === "coconutGuide" ? "去椰子林" : "引导结束";
        this.text(fallbackTitle, hw, layout.dlgY + Math.round(layout.dlgH * 0.35), 22, C.dialogInk, "center");
      } else {
        this.flush();
      }

      Onboarding.buttonBox = null;
      if (kind === "end") {
        this.text(
          "点击任意处关闭",
          hw,
          layout.dlgY + Math.round(layout.dlgH * 0.88),
          16,
          C.dialogInk,
          "center"
        );
        return;
      }

      var btnLabel = kind === "intro" ? "去钓鱼" : "去椰子林";
      var btnW = Math.round(layout.dlgW * 0.4);
      var btnH = Math.round(btnW * 864 / 2016);
      var btnX = layout.dlgX + Math.round((layout.dlgW - btnW) / 2);
      var btnY = layout.dlgY + Math.round(layout.dlgH * 0.78);
      var btnBox = { x: btnX, y: btnY, w: btnW, h: btnH };
      if (!this.paintLabeledUiFrame("ui-guide-btn", btnBox, btnLabel, 18, C.dialogInk)) {
        this.rect(btnX, btnY, btnW, btnH, C.woodLight);
        this.flush();
        this.text(btnLabel, btnX + btnW / 2, this.textYInBox(btnLabel, 18, btnY, btnH), 18, C.dialogInk, "center");
      }
      Onboarding.buttonBox = btnBox;
    },

    drawEnergyPrompt: function () {
      var type = AIGCUtils.Game.energyPrompt;
      var energy = AIGCUtils.Energy.get(type);
      var isFish = type === "fish";
      var hw = Math.round(this.width / 2);
      var hh = Math.round(this.height / 2);
      var layout = this.getSettlementLayout(hw, hh);
      this.paintSettlementShell(layout, isFish ? "钓鱼体力耗尽" : "采摘体力耗尽");
      var line1 = isFish ? "15分钟恢复1格体力" : "36分钟恢复1格体力";
      var line2 = isFish
        ? "看广告可补满 不限次数"
        : "看广告可补满 今日剩" + energy.remainingAds + "次";
      if (energy.remainingAds === 0) {
        this.paintSettlementLongs(layout, [line1, "请等待恢复 或明天再来"]);
        this.paintSettlementShorts(layout, [{ label: "稍后再来", active: true }]);
      } else {
        var adLabel = isFish
          ? AIGCUtils.Game.energyAdBusy
            ? "广告加载中"
            : "看广告补满（不限次）"
          : AIGCUtils.Game.energyAdBusy
            ? "广告加载中"
            : "看广告补满（剩" + energy.remainingAds + "次）";
        this.paintSettlementLongs(layout, [line1, line2]);
        this.paintSettlementShorts(layout, [
          { label: adLabel, active: true },
          { label: isFish ? "继续等待" : "放弃采摘", active: false }
        ]);
      }
    },

    drawGoFishingPrompt: function () {
      var hw = Math.round(this.width / 2);
      var hh = Math.round(this.height / 2);
      var layout = this.getSettlementLayout(hw, hh);
      var speciesId = AIGCUtils.Game.goFishingSpeciesId || "small";
      var species = AIGCUtils.Recipes.getFishSpecies(speciesId);
      var line1 = species.name + "不足";
      var line2 = "去钓鱼区钓完后再回来烤制？";
      // 深棕，不是纯黑。加粗只描在木牌内部，其它弹窗不走这条
      var titleInk = [0.36, 0.2, 0.09, 1];
      this.paintSettlementShell(layout, "厨房缺鱼", { titleInk: titleInk, titleBold: true });
      var fishSize = 96;
      var fishCx = layout.dlgX + layout.dlgW / 2;
      var titleBottom = layout.title.y + layout.title.h;
      var fishCy = (titleBottom + layout.long1.y) / 2;
      this.paintFishIcon(speciesId, fishCx, fishCy, fishSize);
      var longSize = 17;
      var longLimit = layout.long1.w - 24;
      var lines = [line1, line2];
      for (var li = 0; li < lines.length; li++) {
        while (longSize > 13 && this.textWidth(lines[li], longSize) > longLimit) longSize -= 1;
      }
      this.paintSettlementLongs(layout, lines, longSize);
      this.goFishingShortBoxes = this.paintSettlementShorts(layout, [
        { label: "去钓鱼", active: true },
        { label: "暂时不去", active: false }
      ]);
      if (this._goFishingPaintKey !== speciesId) {
        this._goFishingPaintKey = speciesId;
        console.log(
          "[厨房缺鱼] 绘制",
          line1,
          "字号",
          longSize,
          "鱼中心",
          Math.round(fishCx),
          Math.round(fishCy),
          "尺寸",
          fishSize
        );
      }
    },

    /** R0039：结算壳图就绪才画离线窗，避免 cream 白块闪现 */
    isSettlementShellReady: function () {
      var keys = [
        "dialog-settlement-base",
        "dialog-settlement-title",
        "dialog-settlement-btn-long",
        "dialog-settlement-btn-short"
      ];
      for (var i = 0; i < keys.length; i++) {
        if (!this.scenes[keys[i]] && !this.sceneFailed[keys[i]]) return false;
      }
      return !!(this.scenes["dialog-settlement-base"] || this.sceneFailed["dialog-settlement-base"]);
    },

    drawOfflinePrompt: function () {
      if (!this.isSettlementShellReady()) {
        if (!this._loggedOfflineShellWait) {
          this._loggedOfflineShellWait = true;
          console.log("[Boot] R0039 wait settlement shell for offline prompt");
        }
        return;
      }
      var hw = Math.round(this.width / 2);
      var hh = Math.round(this.height / 2);
      var layout = this.getSettlementLayout(hw, hh);
      this.paintSettlementShell(layout, "离线自动采集");
      // 标题与两块长框之间的空白正中：长框贴图放大作花边框，字号同步加大
      var midLabel = "离线看广告实现自动采集食材";
      var midInk = [0.36, 0.2, 0.09, 1];
      var titleBottom = layout.title.y + layout.title.h;
      var gapMidY = (titleBottom + layout.long1.y) / 2;
      var midW = Math.round(layout.long1.w * 0.98);
      var midH = Math.max(Math.round(layout.long1.h * 1.65), Math.round(layout.dlgH * 0.12));
      var gapRoom = Math.max(24, layout.long1.y - titleBottom - 8);
      if (midH > gapRoom) midH = gapRoom;
      var midBox = {
        x: layout.dlgX + Math.round((layout.dlgW - midW) / 2),
        y: Math.round(gapMidY - midH / 2),
        w: midW,
        h: midH
      };
      var midSize = 18;
      var midLimit = midW - 28;
      while (midSize > 14 && this.textWidth(midLabel, midSize) > midLimit) midSize -= 1;
      if (!this.paintLabeledUiFrame("dialog-settlement-btn-long", midBox, midLabel, midSize, midInk)) {
        this.text(midLabel, hw, this.textYInBox(midLabel, midSize, midBox.y, midBox.h), midSize, midInk, "center");
      }
      this.paintSettlementLongs(layout, ["下线也能收鱼肉和椰子", "看 1 次广告，永久解锁"]);
      this.paintSettlementShorts(layout, [
        {
          label: AIGCUtils.Game.offlineAdBusy ? "广告加载中" : "看广告永久解锁",
          active: true
        },
        { label: "稍后再说", active: false }
      ]);
      var state = AIGCUtils.GameState;
      if (!state.offlinePromptSeen) {
        state.offlinePromptSeen = true;
        state.save();
        console.log(
          "[Prototype] Offline prompt drawn",
          "playTimeMs=" + state.playTimeMs,
          "offlinePromptSeen=" + state.offlinePromptSeen,
          "offlineUnlocked=" + state.offlineUnlocked,
          "offlinePrompt=" + AIGCUtils.Game.offlinePrompt,
          "midBox",
          midBox.x,
          midBox.y,
          midBox.w,
          midBox.h,
          "midSize",
          midSize
        );
      }
    },

    drawOfflineDialog: function () {
      var pending = AIGCUtils.GameState.pendingOffline;
      if (!pending) return;
      if (!this.isSettlementShellReady()) {
        if (!this._loggedWelcomeShellWait) {
          this._loggedWelcomeShellWait = true;
          console.log("[Boot] R0039 wait settlement shell for 欢迎回来");
        }
        return;
      }
      var hw = Math.round(this.width / 2);
      var hh = Math.round(this.height / 2);
      var layout = this.getSettlementLayout(hw, hh);
      this.paintSettlementShell(layout, "欢迎回来");
      this.paintSettlementLongs(layout, [
        "离线" + AIGCUtils.OfflineManager.getOfflineDuration() + " 采集到",
        "鱼肉 " + pending.fish + "份    椰子 " + pending.coconut + "个"
      ]);
      this.paintSettlementShorts(layout, [
        { label: "直接领取", active: true },
        {
          label: AIGCUtils.Game.offlineAdBusy ? "广告加载中" : "看广告双倍领取",
          active: false
        },
        { label: "稍后", active: false }
      ]);
    },

    draw: function () {
      if (!this.init()) return;
      if (!this.fontReady) this.loadFont();
      this.resize();
      var gl = this.gl;
      gl.clearColor(0.12, 0.16, 0.17, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
      this.vertices = [];
      this.boundTexture = this.fontTexture || this.ensureDummyTexture();
      this.loadScenes();
      var area = AIGCUtils.Game.currentArea;
      // R0037：必需包+字帖未齐不进玩法，只留 loading（禁旧 JPG/矢量兜底）
      var bootProgress = this.getBootProgress(area);
      var bootReady = this.isBootReady(area);
      this.syncBootLoadingDom(bootReady, bootProgress);
      if (!bootReady) {
        this.artOn = false;
        this.uiSkinChrome = false;
        var waitKey = this.preferredUiSkinKey(area);
        if (this._loggedWaitKey !== waitKey + ":" + bootProgress.done) {
          this._loggedWaitKey = waitKey + ":" + bootProgress.done;
          console.log(
            "[Boot] R0037 waiting",
            area,
            waitKey,
            bootProgress.done + "/" + bootProgress.total,
            "font=" + !!this.fontReady
          );
        }
        // 画布侧再盖一层，避免 HTML 层未挂时露残局
        this.rect(0, 0, this.width, this.height, [0.12, 0.16, 0.17, 1]);
        if (this.fontReady) {
          this.text(
            "加载中 " + bootProgress.pct + "%",
            Math.round(this.width / 2),
            Math.round(this.height / 2) - 10,
            22,
            C.cream,
            "center"
          );
        }
        this.flush();
        return;
      }
      this._loggedWaitKey = null;
      this.parseSeaDebugParams();
      this.artShiftX = 0;
      this.artShiftY = 0;
      // 已关闭画面震动：收线/建店不再写 artShift（船兔仍可走海浪 bob，不含左右震）
      var backdrop = this.backdropKey(area);
      var contentTop = 64;
      var contentHeight = this.height - 72 - contentTop;
      var shift = Math.max(-12, Math.min(12, this.artShiftX));
      var shiftY = Math.max(-8, Math.min(8, this.artShiftY));
      this.uiSkinChrome = !!(backdrop && backdrop.indexOf("ui-skin-") === 0);
      // 钓鱼底板锁定静止；其它区域仍可用 shift
      var backShiftX = area === "fishing" ? 0 : shift;
      var backShiftY = area === "fishing" ? 0 : shiftY;
      if (this.uiSkinChrome) {
        this.artOn = !!(backdrop && this.paintScene(backdrop, backShiftX, backShiftY, this.width, this.height, 0, 0));
        if (this.artOn && this._loggedBackdrop !== backdrop) {
          this._loggedBackdrop = backdrop;
          console.log("[Prototype] UI skin backdrop", backdrop);
        }
      } else {
        this.artOn = !!(backdrop && this.paintScene(backdrop, backShiftX - 14, contentTop + backShiftY, this.width + 28, contentHeight, 0, 0));
      }
      if (area === "map") this.drawMap();
      if (area === "fishing") this.drawFishing();
      if (area === "coconut") this.drawCoconut();
      if (area === "build") this.drawBuild();
      if (area === "shop") this.drawShop();
      // R0008：钓鱼区用全幅 ui-chrome；其它竖屏区仍用共享顶栏条
      var fishingChromeOk = false;
      if (area === "fishing") fishingChromeOk = this.paintFishingUiChrome();
      if (area !== "build" && !(area === "fishing" && fishingChromeOk)) this.paintSharedHudChromePort();
      if (area !== "build") {
        this.drawHUD();
        this.drawNav();
      }
      if (AIGCUtils.Game.showInventory) this.drawInventory();
      if (AIGCUtils.Game.messageTimer > 0) {
        var W = this.width;
        this.rect(Math.round(W / 2) - 220, 72, 440, 44, C.overlay);
        this.text(AIGCUtils.Game.message, Math.round(W / 2), 83, 20, C.cream, "center");
      }
      if (area === "fishing" && AIGCUtils.Collection.phase === "fishResult") this.drawFishResult();
      if (area === "coconut" && AIGCUtils.Collection.phase === "coconutSummary") this.drawCoconutSummary();
      if (AIGCUtils.Game.goFishingPrompt) this.drawGoFishingPrompt();
      else {
        this.goFishingShortBoxes = null;
        this._goFishingPaintKey = null;
      }
      if (AIGCUtils.Game.offlinePrompt) this.drawOfflinePrompt();
      if (AIGCUtils.Game.offlineDialog && AIGCUtils.GameState.pendingOffline) this.drawOfflineDialog();
      if (AIGCUtils.Game.energyPrompt) this.drawEnergyPrompt();
      if (AIGCUtils.Game.mapLockedPrompt) this.drawMapLockedPrompt();
      // R0025：引导弹窗盖在所有结算/提示之上
      if (AIGCUtils.Onboarding && AIGCUtils.Onboarding.isDialogOpen()) {
        this.drawOnboardingDialog();
      }
      this.flush();
    }
  };
})();
