/**
 * welcome.js — 老铁眼真尖 · 全局宣传欢迎页（v0.0.54）
 *
 * 功能：
 *   1) 全屏动态渐变+粒子背景（等价"动态宣传视频"，纯 canvas 实现，快手兼容）
 *   2) 大 Logo 呼吸 + slogan 抖动
 *   3) 【立即去玩】大按钮 → 触发 ks.login + ks.getUserInfo
 *   4) 授权成功 → 顶部 toast 显示"头像 + 昵称 + 欢迎语" 2 秒 → 自动进入首页
 *   5) 底部小字：点击代表同意《隐私政策》&《用户协议》，预留跳转能力
 *
 * 对接：
 *   - state.scene='welcome' 时由 game.js draw 循环调用 drawWelcome
 *   - 用户信息缓存到 state.user = { avatar, nickName }
 *   - state.welcomeToast = { untilTs, avatarImg, nickName } 显示 2s
 */
(function(){
  var M3 = window.M3 = window.M3 || {};
  var Welcome = M3.Welcome = {};

  // ⭐ 隐私政策 / 用户协议 URL（预留可外链跳转，业务上可换真实链接）
  var URL_PRIVACY = 'https://aiminigame-onepage.frontend-cloud.corp.kuaishou.com/privacy.html';
  var URL_TERMS   = 'https://aiminigame-onepage.frontend-cloud.corp.kuaishou.com/terms.html';

  // 粒子池 · 20 个小圆点飘浮
  var particles = null;
  function ensureParticles(VW, VH){
    if (particles) return particles;
    particles = [];
    for (var i=0;i<24;i++){
      particles.push({
        x: Math.random()*VW,
        y: Math.random()*VH,
        r: 2 + Math.random()*4,
        vx: (Math.random()-0.5)*0.4,
        vy: -0.3 - Math.random()*0.6,
        a: 0.4 + Math.random()*0.5,
        hue: Math.random() < 0.5 ? 40 : 320   // 金黄 / 樱花粉
      });
    }
    return particles;
  }

  /** ⭐ v1.0.50 极简 CRITICAL_ASSETS：首屏必需素材（welcome-char 已回主包，重新加入等待）
   *  首页 4 张 covers 改为背景加载（进图时 fadeIn，不阻塞"立即找茬"按钮）
   */
  var CRITICAL_ASSETS = [
    'assets/ui/welcome-char.png',
    'assets/ui/title.png',
    'assets/ui/tap-hand.png'
  ];
  // ⭐ 首页封面走"背景加载"，进 welcome 后异步拉，不进 CRITICAL 门槛
  var LAZY_COVERS = [
    'assets/scenes/covers/scene1.jpg',
    'assets/scenes/covers/scene2.jpg',
    'assets/scenes/covers/scene3.jpg',
    'assets/scenes/covers/scene4.jpg'
  ];
  var _lazyKickedOff = false;
  function _kickoffLazyCovers(){
    if (_lazyKickedOff) return; _lazyKickedOff = true;
    try {
      var _reload = (window.M3 && window.M3.loadImg) || window.loadImg;
      if (typeof _reload === 'function'){
        LAZY_COVERS.forEach(function(k){ try{ _reload(k); }catch(_){} });
      }
    } catch(_){}
  }
  var _critStartTs = 0;
  function _criticalProgress(state){
    if (!_critStartTs) _critStartTs = Date.now();
    _kickoffLazyCovers();
    var total = CRITICAL_ASSETS.length;
    var done = 0;
    for (var i=0; i<total; i++){
      var k = CRITICAL_ASSETS[i];
      var im = state.imgs && state.imgs[k];
      if (im && im.width > 0) done++;
      else if (state.imgFailed && state.imgFailed[k]) done++;
      else if (state.imgLoading && !state.imgLoading[k] && !state.imgFailed[k]){
        try {
          var _reload = (window.M3 && window.M3.loadImg) || window.loadImg;
          if (typeof _reload === 'function') _reload(k);
        } catch(_){}
      }
    }
    // ⭐ 远程关卡 JSON 作为一个虚拟"素材"，pending 时占 total 不占 done
    //   状态：pending → 等；success/timeout/error → 视为 done（timeout/error 会 fallback baseline）
    total += 1;
    var _remoteStatus = (window.M3 && window.M3.remoteLevelsStatus) || 'pending';
    if (_remoteStatus !== 'pending') done += 1;

    // ⭐ v1.0.50 3 秒硬兜底（3 张 UI 小图 < 500KB，CDN 通就秒过；远程 JSON 自己也有 3s 超时）
    var elapsed = Date.now() - _critStartTs;
    if (elapsed > 3000 && done < total) {
      try { console.log('[LOAD] timeout after ' + elapsed + 'ms, forcing done ' + done + '/' + total + ' remoteStatus=' + _remoteStatus); } catch(_){}
      done = total;
    }
    return { done: done, total: total, ready: done >= total };
  }
  /** ⭐ v1.0.17 按钮位置的细进度条 loading（横线条，不是丑胶囊）
   *  非线性平滑：前 90% 走 easeOutCubic 慢一点，防止用户觉得"90% 后卡死"
   */
  function _drawLoadingCapsule(ctx, VW, VH, p){
    // 与按钮同一位置
    var bw = VW*0.62;
    var bx = (VW - bw)/2;
    var by = VH*0.60 + 8 + 80 + 35;

    // 非线性映射：raw 0~1 → display 0~1
    // 让整体节奏更接近"慢速匀速"，防止前面快后面卡
    var raw = Math.max(0, Math.min(1, p.done / p.total));
    // easeInOutQuad：两端稍慢，中段快，整体平滑
    var display = raw < 0.5
      ? 2 * raw * raw
      : 1 - Math.pow(-2 * raw + 2, 2) / 2;
    // 若已 100%，直接锁 100（避免尾部再抖）
    if (raw >= 1) display = 1;
    var pct = Math.max(1, Math.round(display * 100));

    // ═ 顶部说明文字 ═
    ctx.save();
    ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.font = 'bold 15px -apple-system,PingFang SC,sans-serif';
    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.55)';
    var txt = '正在加载游戏素材… ' + pct + '%';
    ctx.strokeText(txt, VW/2, by - 20);
    ctx.fillStyle = '#ffffff'; ctx.fillText(txt, VW/2, by - 20);
    ctx.restore();

    // ═ 底槽（细）═
    var barH = 8;
    ctx.save();
    ctx.beginPath(); roundRect(ctx, bx, by, bw, barH, barH/2);
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.45)';
    ctx.lineWidth = 1; ctx.stroke();
    // ═ 进度填充（暖色渐变 + 高光扫光）═
    var fw = Math.max(2, bw * display);
    ctx.beginPath(); roundRect(ctx, bx, by, fw, barH, barH/2);
    var g = ctx.createLinearGradient(bx, by, bx + bw, by);
    g.addColorStop(0, '#ffe08a'); g.addColorStop(1, '#ff8c3d');
    ctx.fillStyle = g; ctx.fill();
    // 扫光高光（动画）
    var t = (M3._now ? M3._now() : Date.now())/1000;
    var sweepX = bx + ((t * 0.6) % 1) * bw;
    var lg = ctx.createLinearGradient(sweepX - 30, 0, sweepX + 30, 0);
    lg.addColorStop(0, 'rgba(255,255,255,0)');
    lg.addColorStop(0.5, 'rgba(255,255,255,0.55)');
    lg.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.beginPath(); roundRect(ctx, bx, by, fw, barH, barH/2);
    ctx.save(); ctx.clip();
    ctx.fillStyle = lg; ctx.fillRect(bx, by, bw, barH);
    ctx.restore();
    ctx.restore();
  }
  function _drawLoadingBar(ctx, VW, VH, p){ /* alias · 保留避免外部引用报错 */
    _drawLoadingCapsule(ctx, VW, VH, p);
  }

  /** 主绘制入口 */
  Welcome.draw = function(ctx, VW, VH, state){
    var t = (M3._now ? M3._now() : Date.now()) / 1000;

    // ⭐ v1.0.69 埋点：欢迎页首帧绘制（A 组启动漏斗第 2 站）
    if (!Welcome._teleShown && M3.Tele){
      Welcome._teleShown = true;
      // ⭐ v1.0.74 Analytics: 首屏进入 welcome
      try { if (M3.Analytics) M3.Analytics.screenEnter('welcome'); } catch(_){}
      var _imgs = state.imgs || {};
      var _okCnt = 0;
      for (var _k in _imgs){ if (_imgs[_k] && _imgs[_k].complete !== false && _imgs[_k].width > 0) _okCnt++; }
      M3.Tele.report(M3.Tele.SC.WELCOME_SHOWN, { sinceStart:true, metric:{ criticalOk: _okCnt } });
      // 稍后一帧再打 HOME_READY，因为首次 draw 完成 = 首页可点击就绪
      setTimeout(function(){
        if (!M3.Tele.has(M3.Tele.SC.HOME_READY)){
          var _failCnt = 0;
          var _imgs2 = state.imgs || {};
          for (var _k2 in _imgs2){ if (!_imgs2[_k2] || _imgs2[_k2].width === 0) _failCnt++; }
          M3.Tele.report(M3.Tele.SC.HOME_READY, { sinceStart:true, metric:{ imgFailCnt:_failCnt } });
        }
      }, 100);
    }

    // ⭐ v0.0.55 首帧启动全局 BGM（受 mute 开关控制）
    if (!Welcome._bgmStarted){
      Welcome._bgmStarted = true;
      try {
        if (M3.Feedback && M3.Feedback.startBgm && !M3.Feedback.isMuted()){
          // 延迟一点等 AudioContext unlock
          setTimeout(function(){ try { M3.Feedback.startBgm(); } catch(e){} }, 200);
        }
      } catch(e){}
    }

    // ═════ 1. 首页背景（welcome-char.png 完整合图，全屏 cover）═════
    // ⭐ v1.0.16 首帧 0 延迟：main.js 顶层已 IIFE 预热，此处若 state.imgs 还没灌好，尝试从 __PRELOAD_IMGS 直接拿
    // ⭐ v1.0.77 welcome-char 已回归主包，直接用本地路径
    var _charKey = 'assets/ui/welcome-char.png';
    var charImg = state.imgs && state.imgs[_charKey];
    if (!charImg && window.__PRELOAD_IMGS && window.__PRELOAD_IMGS[_charKey]){
      var _prech = window.__PRELOAD_IMGS[_charKey];
      if (_prech.width > 0){
        state.imgs[_charKey] = _prech;
        state.imgLoading[_charKey] = false;
        charImg = _prech;
      }
    }
    if (!charImg && window.__PRELOAD_IMGS && window.__PRELOAD_IMGS['assets/ui/welcome-char.png']){
      var _prech2 = window.__PRELOAD_IMGS['assets/ui/welcome-char.png'];
      if (_prech2.width > 0){
        state.imgs['assets/ui/welcome-char.png'] = _prech2;
        charImg = _prech2;
      }
    }
    if (charImg && charImg.width > 0){
      // cover 模式：等比缩放，短边对齐，长边居中裁切
      var cs = Math.max(VW / charImg.width, VH / charImg.height);
      var cdw = charImg.width * cs, cdh = charImg.height * cs;
      ctx.drawImage(charImg, (VW - cdw)/2, (VH - cdh)/2, cdw, cdh);
    } else {
      // ⭐ v1.0.16 极端兜底：主题品牌色渐变（不再用刺眼蓝）+ 触发加载
      var _fb = ctx.createLinearGradient(0, 0, 0, VH);
      _fb.addColorStop(0, '#f5d78a'); _fb.addColorStop(1, '#c47a3d');
      ctx.fillStyle = _fb; ctx.fillRect(0,0,VW,VH);
      if (state.imgLoading && !state.imgLoading[_charKey] && window.loadImg){
        try { window.loadImg(_charKey); } catch(_){}
      }
    }

    // ═════ 2. 粒子飘浮（已移除，使用背景图替代）═════

    // ═════ 3. Logo 大标题（居上，宽度约 VW*0.72）═════
    var titleImg = state.imgs && state.imgs['assets/ui/title.png'];
    if (titleImg){
      var tw = VW * 0.88;
      var th = tw * (titleImg.height / titleImg.width);
      ctx.drawImage(titleImg, (VW - tw) / 2, VH * 0.12, tw, th);
    } else {
      ctx.save();
      ctx.textAlign='center'; ctx.textBaseline='middle';
      ctx.font = 'bold 38px -apple-system,PingFang SC,sans-serif';
      ctx.fillStyle = '#fff';
      ctx.shadowColor='rgba(0,0,0,.6)'; ctx.shadowBlur=8;
      ctx.fillText('老铁眼真尖', VW/2, VH*0.12);
      ctx.restore();
    }

    // \u2b50 v0.0.67 \u5220\u9664 slogan\uff08\u201c60\u79d2 \u00b7 \u627e\u51fa\u6240\u6709\u7a7f\u8d8a\u7269\u201d\uff09

    // ⭐ v1.0.16 关键素材未加载完 → 按钮位置显示灰色 loading 胶囊，不注册"立即找茬"点击热区
    var _prog = _criticalProgress(state);
    if (!_prog.ready){
      _drawLoadingCapsule(ctx, VW, VH, _prog);
      // 依然画音乐开关（可提前 mute），但不画立即找茬按钮和协议热区
      return;
    }

    // ═════ 4. 立即找茬 · 绿色糖果按钮 ═════
    var bw = VW*0.62;
    var bh = 70;
    var bx = (VW - bw)/2;
    var by = VH*0.60 + 8 + 80;

    // 呼吸缩放
    var breath = 1 + Math.sin(t*3) * 0.05;
    ctx.save();
    ctx.translate(VW/2, by + bh/2);
    ctx.scale(breath, breath);
    ctx.translate(-VW/2, -(by + bh/2));

    var btnR = Math.min(bh/2, 14);

    // 阴影
    ctx.beginPath(); roundRect(ctx, bx + 1, by + 5, bw, bh, btnR);
    ctx.fillStyle = 'rgba(0,70,0,0.38)'; ctx.fill();
    // 外圈描边层
    ctx.beginPath(); roundRect(ctx, bx, by, bw, bh, btnR);
    ctx.fillStyle = '#1a5000'; ctx.fill();
    // 主体渐变 ABF489→87EF57
    ctx.save();
    ctx.beginPath(); roundRect(ctx, bx + 3, by + 3, bw - 6, bh - 6, btnR - 1); ctx.clip();
    var btnGrad = ctx.createLinearGradient(0, by + 3, 0, by + bh - 3);
    btnGrad.addColorStop(0, '#ABF489'); btnGrad.addColorStop(1, '#87EF57');
    ctx.fillStyle = btnGrad; ctx.fillRect(bx + 3, by + 3, bw - 6, bh - 6);
    ctx.restore();
    // 描边
    ctx.strokeStyle = '#1a5c00'; ctx.lineWidth = 2.5;
    ctx.beginPath(); roundRect(ctx, bx, by, bw, bh, btnR); ctx.stroke();

    // 文字（白色+深绿描边）
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = 'bold 22px -apple-system,PingFang SC,sans-serif';
    ctx.lineWidth = 4; ctx.strokeStyle = '#003008';
    ctx.strokeText('立即找茬', VW/2, by + bh/2 + 1);
    ctx.fillStyle = '#ffffff';
    ctx.fillText('立即找茬', VW/2, by + bh/2 + 1);

    ctx.restore();

    // ⭐ 引导手势：蓝白手指切图，指尖对准脉冲光圈
    (function(){
      var floatY = Math.sin(t*4) * 5;
      var handSize = 62;
      // 光圈圆心：在按钮右侧（按钮内靠右）
      var ringX = bx + bw * 0.80;
      var ringY = by + bh / 2 + floatY;
      // 绿色脉冲光圈
      var ring = 0.5 + 0.5 * Math.sin(t*4);
      ctx.save();
      ctx.globalAlpha = 0.55 * (1 - ring);
      ctx.beginPath();
      ctx.arc(ringX, ringY, 13 + ring * 19, 0, Math.PI*2);
      ctx.strokeStyle = '#a8f0a3';
      ctx.lineWidth = 2.5;
      ctx.stroke();
      ctx.restore();
      // 手指切图（160×160，指尖约在图片 0.25,0.16 处）
      // 使指尖对准 ringX/ringY：hcx = ringX + handSize*0.25, hcy = ringY + handSize*0.34
      var handImg = state.imgs && state.imgs['assets/ui/tap-hand.png'];
      if (handImg && handImg.width > 1){
        var hcx = ringX + handSize * 0.25;
        var hcy = ringY + handSize * 0.34;
        ctx.drawImage(handImg, hcx - handSize/2, hcy - handSize/2, handSize, handSize);
      } else {
        if (state.imgLoading && !state.imgLoading['assets/ui/tap-hand.png'] && window.loadImg){
          try { window.loadImg('assets/ui/tap-hand.png'); } catch(_){}
        }
        ctx.save();
        ctx.fillStyle = '#a8f0a3';
        ctx.beginPath(); ctx.arc(ringX, ringY, 8, 0, Math.PI*2); ctx.fill();
        ctx.restore();
      }
    })();

    // ⭐ v0.0.95 登录页左侧「全局音乐」开关 · 位置下移+去 icon+不双播
    (function(){
      var muted = (M3.Feedback && M3.Feedback.isMuted && M3.Feedback.isMuted()) || false;
      var rowY = 68;             // ⭐ v0.0.96 从 60 再下移 8px → 68
      var labelX = 14;
      // 文案（去掉 🔊 emoji）
      ctx.save();
      ctx.font = 'bold 14px -apple-system,PingFang SC,sans-serif';
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.55)';
      ctx.strokeText('全局音乐', labelX, rowY);
      ctx.fillStyle = 'rgba(255,255,255,0.95)';
      ctx.fillText('全局音乐', labelX, rowY);
      var labelW = ctx.measureText('全局音乐').width;
      // 开关（iOS 胶囊）
      var swW = 46, swH = 24;
      var swX = labelX + labelW + 10;
      var swY = rowY - swH/2;
      ctx.beginPath();
      var r = swH/2;
      ctx.moveTo(swX+r, swY);
      ctx.arcTo(swX+swW, swY, swX+swW, swY+swH, r);
      ctx.arcTo(swX+swW, swY+swH, swX, swY+swH, r);
      ctx.arcTo(swX, swY+swH, swX, swY, r);
      ctx.arcTo(swX, swY, swX+swW, swY, r);
      ctx.closePath();
      ctx.fillStyle = muted ? '#b8b8b8' : '#5fd35a';
      ctx.fill();
      ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.stroke();
      var knobR = swH/2 - 3;
      var knobCx = muted ? (swX + knobR + 4) : (swX + swW - knobR - 4);
      ctx.beginPath(); ctx.arc(knobCx, swY+swH/2, knobR, 0, Math.PI*2);
      ctx.fillStyle = '#fff'; ctx.fill();
      ctx.lineWidth = 1.2; ctx.strokeStyle = '#333'; ctx.stroke();
      ctx.font = 'bold 10px -apple-system,PingFang SC,sans-serif';
      ctx.textAlign = 'left';
      ctx.fillStyle = muted ? 'rgba(255,255,255,0.55)' : '#a7f0a2';
      ctx.fillText(muted ? '已关闭' : '已开启', swX + swW + 6, rowY);
      ctx.restore();
      state.tapAreas.push({
        x: labelX - 6, y: rowY - 16, w: swW + labelW + 60, h: 32,
        priority: 250,
        onTap: function(){
          if (!M3.Feedback || !M3.Feedback.toggleMuted) return;
          // ⭐ v0.0.95 关键：toggleMuted 内部已 startBgm，绝不再手动清 _bgm 或 startBgm（否则双播！）
          M3.Feedback.toggleMuted();
          if (!M3.Feedback.isMuted() && M3.Feedback.click) M3.Feedback.click();
        }
      });
    })();

    // 注册按钮点击
    state.tapAreas.push({
      x: bx, y: by, w: bw, h: bh,
      priority: 200,
      onTap: function(){ 
        // ⭐ v0.0.96 登录按钮即时震动 + click 音效（避免用户以为 bug）
        try { if (M3.Feedback){ if (M3.Feedback.vibrate) M3.Feedback.vibrate('medium'); if (M3.Feedback.click) M3.Feedback.click(); } } catch(_){}
        Welcome.onPlayClick(state); 
      }
    });

    // ═════ 5. 底部隐私协议小字（v1.0.24 · 删除《用户协议》，只保留《隐私政策》）═════
    var footerY = by + bh + 26;
    ctx.save();
    ctx.textAlign='center'; ctx.textBaseline='top';
    ctx.font = '11px -apple-system,PingFang SC,sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,.75)';
    var prefix = '点击按钮代表您已同意';
    var mid1 = '《隐私政策》';
    var full = prefix + mid1;
    var totalW = ctx.measureText(full).width;
    var curX = (VW - totalW)/2;
    // 分段绘制以支持点击态高亮
    ctx.textAlign='left';
    ctx.fillText(prefix, curX, footerY);
    curX += ctx.measureText(prefix).width;
    var linkY = footerY;
    var mid1W = ctx.measureText(mid1).width;
    ctx.fillStyle = '#ffdd66';
    ctx.fillText(mid1, curX, linkY);
    // 下划线
    ctx.strokeStyle='#ffdd66'; ctx.lineWidth=1;
    ctx.beginPath(); ctx.moveTo(curX, linkY+13); ctx.lineTo(curX+mid1W, linkY+13); ctx.stroke();
    // 隐私点击热区
    state.tapAreas.push({
      x: curX, y: linkY-2, w: mid1W, h: 18, priority: 210,
      onTap: function(){ Welcome.openLink(URL_PRIVACY, '隐私政策'); }
    });
    ctx.restore();

    // ⭐ v0.0.77 著作权人小字（放在“点击按钮代表…”下方）
    ctx.save();
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.font = '10px -apple-system,PingFang SC,sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,.55)';
    ctx.fillText('著作权人：北京慕远科技有限公司', VW/2, footerY + 20);
    ctx.fillText('认 证 号: 2026SA0124640', VW/2, footerY + 34);
    ctx.restore();

    // ═════ 6. 顶部欢迎 Toast（授权成功后 2s）═════
    if (state.welcomeToast && (M3._now ? M3._now() : Date.now()) < state.welcomeToast.untilTs){
      drawWelcomeToast(ctx, VW, VH, state);
    }

    // ⭐ v0.0.75 协议浮层（最顶层）
    if (Welcome._agreement){ Welcome.drawAgreement(ctx, VW, VH, state); }
  };

  function drawWelcomeToast(ctx, VW, VH, state){
    var w = state.welcomeToast;
    // ⭐ v0.0.75 渐隐：最后 500ms 淡出
    var now = M3._now ? M3._now() : Date.now();
    var left = w.untilTs - now;
    var alpha = left < 500 ? Math.max(0, left/500) : 1;
    ctx.save();
    ctx.globalAlpha = alpha;
    var boxW = Math.min(VW - 40, 300);
    var avSize = 84;                         // \u65b9\u5934\u50cf\u8fb9\u957f
    var padTop = 16, gapAv = 12, gapLine = 8, padBot = 20;
    var lineH1 = 20, lineH2 = 18;
    var boxH = padTop + avSize + gapAv + lineH1 + gapLine + lineH2 + padBot;
    var boxX = (VW - boxW)/2;
    var boxY = (VH - boxH)/2 - 30;

    // \u2b50 \u5168\u5c4f\u906e\u7f69\uff08\u907f\u514d\u6df7\u5165\u540e\u9762\u80cc\u666f\uff09
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, 0, VW, VH);
    ctx.restore();

    // \u2b50 \u5361\u7247\u672c\u4f53 \u00b7 \u80f6\u7247\u771f\u98ce\u98ce
    ctx.save();
    ctx.shadowColor='rgba(0,0,0,.45)'; ctx.shadowBlur=22; ctx.shadowOffsetY=6;
    // \u5e95\u8272\u6e10\u53d8\uff1a\u7c73\u9ec4\u2192\u7c73\u767d
    var cardGrad = ctx.createLinearGradient(0, boxY, 0, boxY+boxH);
    cardGrad.addColorStop(0, '#fff8e6');
    cardGrad.addColorStop(1, '#f4e6c0');
    ctx.fillStyle = cardGrad;
    roundRect(ctx, boxX, boxY, boxW, boxH, 16); ctx.fill();
    ctx.restore();
    // \u7ea2\u8272\u63cf\u8fb9\uff08\u5177\u80f6\u7247\u98ce\uff09
    ctx.save();
    ctx.strokeStyle='#c93a1f'; ctx.lineWidth=2;
    roundRect(ctx, boxX+2, boxY+2, boxW-4, boxH-4, 14); ctx.stroke();
    ctx.setLineDash([5,3]);
    ctx.strokeStyle='rgba(201,58,31,.5)'; ctx.lineWidth=1;
    roundRect(ctx, boxX+6, boxY+6, boxW-12, boxH-12, 10); ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();

    // \u2b50 \u65b9\u5f62\u5934\u50cf\uff08\u5c45\u4e2d\u4e0a\u65b9\uff09
    var avX = (VW - avSize)/2;
    var avY = boxY + padTop;
    ctx.save();
    // \u9634\u5f71
    ctx.shadowColor='rgba(0,0,0,.3)'; ctx.shadowBlur=8; ctx.shadowOffsetY=2;
    // \u5934\u50cf\u5757\u5185\u5bb9
    if (w.avatarImg && w.avatarImg.width){
      // \u5148\u753b\u5706\u89d2\u77e9\u524d\u7f6e\u5e95\uff0c\u518d clip \u7ed8\u5236\u5934\u50cf
      ctx.save();
      roundRect(ctx, avX, avY, avSize, avSize, 12); ctx.clip();
      ctx.drawImage(w.avatarImg, avX, avY, avSize, avSize);
      ctx.restore();
    } else {
      // \u65e0\u5934\u50cf\uff1a\u7ea2\u5e95 + \u9996\u5b57
      ctx.save();
      roundRect(ctx, avX, avY, avSize, avSize, 12); ctx.clip();
      var avGrad = ctx.createLinearGradient(0, avY, 0, avY+avSize);
      avGrad.addColorStop(0, '#ff7a3a'); avGrad.addColorStop(1, '#c93a1f');
      ctx.fillStyle = avGrad; ctx.fillRect(avX, avY, avSize, avSize);
      ctx.textAlign='center'; ctx.textBaseline='middle';
      ctx.font='bold 44px -apple-system,PingFang SC,sans-serif'; ctx.fillStyle='#fff';
      ctx.fillText((w.nickName||'\u94c1')[0], avX + avSize/2, avY + avSize/2);
      ctx.restore();
    }
    ctx.restore();
    // \u5934\u50cf\u91d1\u8fb9
    ctx.save();
    ctx.strokeStyle='#c93a1f'; ctx.lineWidth=2.5;
    roundRect(ctx, avX, avY, avSize, avSize, 12); ctx.stroke();
    ctx.strokeStyle='#ffdd66'; ctx.lineWidth=1;
    roundRect(ctx, avX-3, avY-3, avSize+6, avSize+6, 14); ctx.stroke();
    ctx.restore();

    // \u2b50 \u6587\u5b57\u533a
    var textY1 = avY + avSize + gapAv + lineH1/2;
    var textY2 = textY1 + lineH1/2 + gapLine + lineH2/2;
    ctx.save();
    ctx.textAlign='center'; ctx.textBaseline='middle';
    // \u7b2c\u4e00\u884c\uff1a\u5c0a\u8d35\u7684 xxx\uff08\u9ed1\u8272\u52a0\u7c97 + \u7ea2\u8272\u6635\u79f0\uff09
    ctx.font = 'bold 17px -apple-system,PingFang SC,sans-serif';
    var nick = w.nickName || '铁子';
    // ⭐ v1.0.4 昵称超 8 字省略号（文档 B3124250）
    if (nick.length > 8) nick = nick.slice(0, 8) + '...';
    var prefix = '尊贵的 ';
    var full = prefix + nick;
    // \u5148\u91cf\u5bbd \u2192 \u5206\u6bb5\u753b
    var pfW = ctx.measureText(prefix).width;
    var nkW = ctx.measureText(nick).width;
    var totalW = pfW + nkW;
    var startX = (VW - totalW)/2;
    ctx.textAlign = 'left';
    ctx.fillStyle = '#3a1400';
    ctx.fillText(prefix, startX, textY1);
    ctx.fillStyle = '#c93a1f';
    ctx.fillText(nick, startX + pfW, textY1);
    // \u7b2c\u4e8c\u884c\uff1a\u6b22\u8fce\u6765\u627e\u832c
    ctx.textAlign='center';
    ctx.font = '600 14px -apple-system,PingFang SC,sans-serif';
    ctx.fillStyle = '#8b2410';
    ctx.fillText('\u6b22\u8fce\u6765\u627e\u832c \ud83d\udd0d', VW/2, textY2);
    ctx.restore();
    ctx.restore();  // ⭐ v0.0.75 收尾 globalAlpha
  }
  // ⭐ v0.0.75 暴露给 game.js，让 theme_select 场景也能继续画渐隐 toast
  Welcome.drawWelcomeToast = drawWelcomeToast;

  /** 点击「立即去玩」*/
  Welcome.onPlayClick = function(state){
    if (state._loginPending) return;
    state._loginPending = true;
    // ⭐ v1.3.1 F组埋点：BUTTON_CLICK btn_enter（进入游戏按钮）
    try { if (M3.Tele) M3.Tele.report(M3.Tele.SC.BUTTON_CLICK, { costTime: M3.Tele.elapsed ? M3.Tele.elapsed() : 0, dimension:{ btnId:'btn_enter', location:'welcome', levelIdx:'-1', themeId:'', isAd:'0', adSlot:'' } }); } catch(_e){}

    // ⭐ v0.0.60 登录按钮点击触觉反馈（用户明确要求）
    try {
      if (M3.Feedback && M3.Feedback.vibrate) M3.Feedback.vibrate('medium');
      else if (typeof ks !== 'undefined' && ks.vibrateShort) ks.vibrateShort({ type:'medium' });
      else if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(20);
    } catch(e){}

    // ⭐ v0.0.55 用户手势触发 → unlock AudioContext & 启动 BGM
    try {
      if (M3.Feedback){
        if (M3.Feedback.unlockAudio) M3.Feedback.unlockAudio();
        if (M3.Feedback.startBgm){
          M3.Feedback.startBgm();
          console.log('[Welcome v0.0.60] BGM 启动尝试完成, _muted=', M3.Feedback.isMuted && M3.Feedback.isMuted());
        }
      }
    } catch(e){ console.warn('[Welcome v0.0.60] BGM 启动异常', e); }

    // ⭐ v1.0.7 关键改动：点击后立即先进入首页（不再等登录回调阻塞 UI）
    //   登录/授权/getUserInfo 全部异步在后台跑，成功后再回填 user
    var _fastEntered = false;
    function _fastEnter(fallbackNick){
      if (_fastEntered) return;
      _fastEntered = true;
      // 先给个占位 user，防止 theme_select 空引用
      if (!state.user) state.user = { avatar: null, nickName: fallbackNick || '铁子' };
      state.scene = 'theme_select';
      // ⭐ v1.0.74 Analytics: welcome → home
      try { if (M3.Analytics) M3.Analytics.screenEnter('home'); } catch(_){}
      state.welcomeToast = null;
    }
    // 立即切场景：让"立即找茬"点击零延迟
    _fastEnter('铁子');
    // 后台异步做登录，成功后覆写 state.user + 持久化
    setTimeout(function(){
      _asyncLogin(state);
    }, 0);
    // 3s 兜底：如果登录还在挂起，state._loginPending 强制解锁
    setTimeout(function(){ state._loginPending = false; }, 3000);
  };

  // ⭐ v1.0.7 拆出：异步登录（后台跑，不阻塞 UI）
  function _asyncLogin(state){
    // 非快手环境（H5 预览）→ 跳过授权
    if (typeof ks === 'undefined' || !ks.login){
      _writeUser(state, { avatar: null, nickName: '铁子游客' });
      state._loginPending = false;
      return;
    }
    var KO = window.KwaiOpen;
    function _finishOK(userInfo){
      var u = userInfo || {};
      console.log('[Welcome async] 真实用户信息', u);
      _writeUser(state, { avatar: u.avatarUrl || u.headImgUrl || null, nickName: u.nickName || u.userName || '铁子' });
      state._loginPending = false;
    }
    function _finishFail(err){
      console.warn('[Welcome async] 登录/授权失败', err);
      state._loginPending = false;
    }
    function step3_getUserInfo(){
      var opts = {
        withCredentials: true, lang: 'zh_CN',
        success: function(res){ _finishOK(res && res.userInfo); },
        onSuccess: function(res){ _finishOK(res && res.userInfo); },
        fail: _finishFail, onFail: _finishFail
      };
      if (KO && KO.getUserInfo) KO.getUserInfo(opts);
      else if (ks.getUserInfo)   ks.getUserInfo(opts);
      else _finishFail({errMsg:'no getUserInfo'});
    }
    function step2_authorize(){
      var authOpts = {
        scope: 'scope.userInfo',
        success: step3_getUserInfo, onSuccess: step3_getUserInfo,
        fail: _finishFail, onFail: _finishFail
      };
      var settingCb = function(res){
        var granted = res && res.authSetting && (res.authSetting['scope.userInfo'] === true);
        if (granted) step3_getUserInfo();
        else {
          if (KO && KO.authorize) KO.authorize(authOpts);
          else if (ks.authorize)   ks.authorize(authOpts);
          else step3_getUserInfo();
        }
      };
      if (KO && KO.getSetting) KO.getSetting({success:settingCb, onSuccess:settingCb, fail:function(){ step3_getUserInfo(); }, onFail:function(){ step3_getUserInfo(); }});
      else if (ks.getSetting)   ks.getSetting({success:settingCb, fail:function(){ step3_getUserInfo(); }});
      else step3_getUserInfo();
    }
    var loginOpts = {
      success: function(res){ console.log('[Welcome async] ks.login OK code=', res && res.code); step2_authorize(); },
      onSuccess: function(res){ console.log('[Welcome async] KO.login OK code=', res && res.code); step2_authorize(); },
      fail: _finishFail, onFail: _finishFail
    };
    if (KO && KO.login) KO.login(loginOpts);
    else if (ks.login)   ks.login(loginOpts);
    else step2_authorize();
  }
  function _writeUser(state, user){
    state.user = user;
    try {
      var uInfo = { avatar: user.avatar || '', nickName: user.nickName || '铁子' };
      if (typeof ks!=='undefined' && ks.setStorageSync) ks.setStorageSync('laotie_user', uInfo);
      else if (typeof localStorage!=='undefined') localStorage.setItem('laotie_user', JSON.stringify(uInfo));
    } catch(_e){}
  }

  Welcome._legacyOnPlayClick = function(state){
    if (state._loginPending) return;
    state._loginPending = true;

    // ⭐ v0.0.60 登录按钮点击触觉反馈（用户明确要求）
    try {
      if (M3.Feedback && M3.Feedback.vibrate) M3.Feedback.vibrate('medium');
      else if (typeof ks !== 'undefined' && ks.vibrateShort) ks.vibrateShort({ type:'medium' });
      else if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(20);
    } catch(e){}

    // ⭐ v0.0.55 用户手势触发 → unlock AudioContext & 启动 BGM
    //   ⭐ v0.0.60 强启动兜底：即使 muted 也解锁 AudioContext；BGM 启动后加日志验证
    try {
      if (M3.Feedback){
        if (M3.Feedback.unlockAudio) M3.Feedback.unlockAudio();
        // ⭐ v0.0.60 之前 !isMuted() 判断可能因初始状态不同导致 BGM 永不启
        //   现在无条件启动一次（内部 _muted 检查会兜底静音）
        if (M3.Feedback.startBgm){
          M3.Feedback.startBgm();
          console.log('[Welcome v0.0.60] BGM 启动尝试完成, _muted=', M3.Feedback.isMuted && M3.Feedback.isMuted());
        }
      }
    } catch(e){ console.warn('[Welcome v0.0.60] BGM 启动异常', e); }

    // 非快手环境（H5 预览）→ 跳过授权，直接 mock 用户
    if (typeof ks === 'undefined' || !ks.login){
      Welcome.finishLogin(state, { avatar: null, nickName: '铁子游客' });
      return;
    }

    // ⭐ v0.0.58 真登录三步走：login → authorize(scope.userInfo) → getUserInfo(withCredentials)
    //   之前一直跳过 authorize 直接 getUserInfo，快手返回匿名信息（"铁子"），
    //   必须先 authorize 才能拿真实头像/昵称。
    var KO = window.KwaiOpen;

    function _finishOK(userInfo){
      var u = userInfo || {};
      console.log('[Welcome] 真实用户信息', u);
      Welcome.finishLogin(state, {
        avatar: u.avatarUrl || u.headImgUrl || null,
        nickName: u.nickName || u.userName || '铁子'
      });
    }
    function _finishFail(err){
      console.warn('[Welcome] 登录/授权失败，用兜底昵称', err);
      Welcome.finishLogin(state, { avatar: null, nickName: '铁子' });
    }

    // 【第 3 步】真拉用户信息（此时已授权，返回真数据）
    function step3_getUserInfo(){
      var opts = {
        withCredentials: true,   // 关键：告诉快手要真实签名过的信息
        lang: 'zh_CN',
        success: function(res){ _finishOK(res && res.userInfo); },
        onSuccess: function(res){ _finishOK(res && res.userInfo); },  // KwaiOpen 封装
        fail: _finishFail,
        onFail: _finishFail
      };
      if (KO && KO.getUserInfo) KO.getUserInfo(opts);
      else if (ks.getUserInfo)   ks.getUserInfo(opts);
      else _finishFail({errMsg:'no getUserInfo'});
    }

    // 【第 2 步】授权 scope.userInfo（用户会看到弹窗 → 授权后才能真拿信息）
    function step2_authorize(){
      var authOpts = {
        scope: 'scope.userInfo',
        success: step3_getUserInfo,
        onSuccess: step3_getUserInfo,
        fail: function(err){
          console.warn('[Welcome] 用户拒绝授权 scope.userInfo', err);
          _finishFail(err);
        },
        onFail: function(err){
          console.warn('[Welcome] 用户拒绝授权 scope.userInfo', err);
          _finishFail(err);
        }
      };
      // 先查一下有没有已授权
      var settingCb = function(res){
        var granted = res && res.authSetting && (res.authSetting['scope.userInfo'] === true);
        if (granted){
          console.log('[Welcome] scope.userInfo 已授权，直接拿信息');
          step3_getUserInfo();
        } else {
          console.log('[Welcome] scope.userInfo 未授权，发起授权弹窗');
          if (KO && KO.authorize) KO.authorize(authOpts);
          else if (ks.authorize)   ks.authorize(authOpts);
          else step3_getUserInfo();  // 兜底
        }
      };
      if (KO && KO.getSetting) KO.getSetting({success:settingCb, onSuccess:settingCb, fail:function(){ step3_getUserInfo(); }, onFail:function(){ step3_getUserInfo(); }});
      else if (ks.getSetting)   ks.getSetting({success:settingCb, fail:function(){ step3_getUserInfo(); }});
      else step3_getUserInfo();
    }

    // 【第 1 步】login 拿 code（后端可换 session/openid）
    var loginOpts = {
      success: function(res){
        console.log('[Welcome] ks.login OK code=', res && res.code);
        step2_authorize();
      },
      onSuccess: function(res){
        console.log('[Welcome] KO.login OK code=', res && res.code);
        step2_authorize();
      },
      fail: function(err){
        console.warn('[Welcome] ks.login 失败', err);
        _finishFail(err);
      },
      onFail: function(err){
        console.warn('[Welcome] KO.login 失败', err);
        _finishFail(err);
      }
    };
    if (KO && KO.login) KO.login(loginOpts);
    else if (ks.login)   ks.login(loginOpts);
    else step2_authorize();
  };

  /** 登录/授权完成 → 存用户 + 显示 toast + 2s 后进首页 */
  Welcome.finishLogin = function(state, user){
    state._loginPending = false;
    state.user = user;

    // 预加载头像 image — 直接通过 loadImg 存入 state.imgs，渲染时可直接用
    if (user.avatar){
      try {
        var _ldr = (window.M3 && window.M3.loadImg) || window.loadImg;
        if (typeof _ldr === 'function') _ldr(user.avatar);
      } catch(e){}
    }
    var now = M3._now ? M3._now() : Date.now();
    // ⭐ v0.0.85 不再显示"个人信息 toast 一闪而过"（用户反馈无意义），直接进首页
    state.welcomeToast = null;
    // 存持久化用户信息
    try {
      var uInfo = { avatar: user.avatar || '', nickName: user.nickName || '铁子' };
      if (typeof ks!=='undefined' && ks.setStorageSync) ks.setStorageSync('laotie_user', uInfo);
      else if (typeof localStorage!=='undefined') localStorage.setItem('laotie_user', JSON.stringify(uInfo));
    } catch(_e){}
    // 直接切换到首页
    state.scene = 'theme_select';
    // ⭐ v1.0.74 Analytics: welcome → home (finishLogin path)
    try { if (M3.Analytics) M3.Analytics.screenEnter('home'); } catch(_){}
  };

  /** ⭐ v0.0.75 打开协议浮层（不再外链，在 canvas 内画一个可关闭的可滚动浮层）*/
  Welcome.openLink = function(url, label){
    console.log('[Welcome] openAgreement:', label);
    Welcome._agreement = { label: label, ts: Date.now(), scrollY: 0, _touchY: null, maxScroll: 0 };
  };
  Welcome._agreementText = {
    '隐私政策': [
      '隐私政策',
      '',
      '生效日期：2026年8月12日',
      '',
      '北京慕远科技有限公司及其关联公司（以下简称"我们"）深知个人信息对您的重要性，我们将按照法律法规的规定，保护您的个人信息及隐私安全。我们制定本《隐私政策》并特别提示：希望您在使用我们的小游戏前仔细阅读并理解本《隐私政策》，以便做出适当的选择。',
      '',
      '【特别提示】请您仔细阅读本《隐私政策》，尤其是加粗、划线的内容，以充分理解我们对您个人信息的处理规则。如您在阅读或使用小游戏过程中有任何疑问，可通过本隐私政策预留的联系方式与我们沟通。如您经沟通后仍不同意本隐私政策的条款，有权立即停止访问和使用。',
      '',
      '一、我们如何收集和使用您的个人信息',
      '',
      '1. 账号登录',
      '当您登录我们的小游戏时，我们将申请使用您的快手账号信息（包括快手昵称、头像及您授权的其他信息），以完成账号登录、标识您的游戏身份并展示游戏内个人信息。',
      '',
      '2. 支付服务',
      '当您在游戏内进行充值、购买服务或虚拟资产时，部分支付服务由我们的合作方及第三方支付机构向您提供，我们、我们的合作方及第三方支付机构可能会获取您的订单信息（如订单流水号、支付金额、优惠券信息、商品信息、银行信息等），这些信息是支付功能所必需的信息，拒绝提供将导致您无法使用该功能，但不影响其他功能的正常使用。',
      '',
      '3. 分享',
      '（1）我们支持您将游戏内容分享至快手聊天、朋友圈或外部平台。分享功能由您主动触发，我们不会未经您的操作自动分享您的信息。',
      '（2）我们在游戏中向您提供榜单功能，如游戏排行榜，在榜单中我们会对信息内容、用户等进行自动化排序展示，您的昵称、头像等账号公开信息、我们根据您在游戏内的行为情况形成统计数据等将在榜单中公开展示。',
      '',
      '4. 运营安全保障与统计分析',
      '（1）为了向用户提供优质而可靠的内容、服务，维护产品及功能的正常稳定运行，更好地预防恶意程序、钓鱼网站、网络漏洞、计算机病毒、网络攻击、网络侵入安全风险，更准确地识别违反法律法规或平台相关规则的情况，我们需收集、使用和整合终端用户的设备信息、操作日志信息、传感器信息以及用户授权的信息，用于分析服务的稳定性、判断账号安全、进行身份验证、识别违法违规情况、检测及防范安全事件，依法采取必要的记录、分析、处置措施。',
      '（2）设备信息：设备标识信息（OAID、IDFA、IDFV、AndroidID及其他综合设备参数和系统信息形成的设备标识符，不同的标识符在有效期、是否可由用户重置以及获取方式及不同系统方面会有所不同）、网络相关信息（蓝牙、IP地址、网络状态、类型、接入方式、网络质量数据）、设备参数信息（设备名称、设备型号）、硬件操作系统信息（操作系统、语言、分辨率）。',
      '（3）为了提升运营质量与效率而进行研究、统计分析时，我们可能会收集您在游戏中的游戏行为数据以及其他根据上述场景收集的个人信息，用于优化游戏体验和改进游戏功能。上述数据均为去标识化后的统计数据分析，我们不会将其用于识别您的特定身份。',
      '',
      '5. 征得同意的例外',
      '根据法律法规规定，在下列情形中，处理您的个人信息无需征得您的同意：',
      '（1）为订立、履行您作为一方当事人的合同所必需，或者按照依法制定的劳动规章制度和依法签订的集体合同实施人力资源管理所必需；',
      '（2）为履行法定职责或者法定义务所必需；',
      '（3）为应对突发公共卫生事件，或者紧急情况下为保护自然人的生命健康和财产安全所必需；',
      '（4）为公共利益实施新闻报道、舆论监督行为，在合理的范围内处理您的个人信息；',
      '（5）依照《个人信息保护法》规定在合理范围内处理您自行公开或者其他已经合法公开的个人信息；',
      '（6）法律行政法规规定的其他情形。',
      '',
      '二、我们如何委托处理、共享、转移、公开披露您的个人信息',
      '',
      '1. 委托处理',
      '为了向您提供更完善、更优质的产品和/或服务，某些功能可能由我们的技术服务合作方提供，我们可能会委托合作方处理您的某些个人信息。我们会与受托处理您个人信息的合作方依据法律规定签署相关协议，并对其个人信息处理活动进行约束和监督。',
      '',
      '2. 共享',
      '为实现本隐私政策中声明的目的，我们需与关联公司或第三方合作伙伴共享您的个人信息。我们将遵守合法、正当、必要的原则，审慎评估合作伙伴的处理目的、安全保障能力，并根据法律规定签署相关协议。同时，我们会对合作伙伴进行严格的监督与管理，一旦发现其存在违规违约行为，将立即停止合作并追究其法律责任。',
      '',
      '3. 合作场景',
      '（1）为实现本隐私政策中声明的目的，我们的某些服务将由我们和授权合作伙伴共同提供或者委托处理，如第三方支付机构、活动合作方等。我们可能会与合作伙伴共享您的某些个人信息，以提供更好的客户服务和用户体验。我们仅会出于合法、正当、必要的目的共享您的个人信息，并且只会提供服务所必要的个人信息。',
      '（2）在法定情形下的共享。我们可能会根据法律法规规定、诉讼争议解决需要，或按行政、司法机关依法提出的强制性要求，共享您的个人信息。',
      '（3）在获取您同意的情况下共享：获得您的同意后，我们可能与第三方共享您的个人信息；',
      '（4）为提升相关领域的科研能力，促进科技发展水平，我们在确保数据安全与目的正当的前提下，可能会与合作的科研院所、高校等机构使用去标识化或匿名化的数据。',
      '（5）为保障游戏功能的实现与应用的稳定运行，我们需与快手平台共享，并从快手平台处使用您快手账号内的相关信息（如基本账号信息、身份认证信息、设备信息、行为数据、支付交易数据等），以实现账号登录、广告、支付等对应功能及目的。关于快手平台如何收集、使用您的个人信息，您可以参考快手平台的服务协议及隐私政策。',
      '',
      '4. 转移',
      '如我们因合并、分立、解散、被宣告破产需要转移个人信息的，会向您告知接收方的名称或者姓名和联系方式。我们会要求接收方继续履行本隐私政策约定义务。接收方变更原先的处理目的、处理方式的，其将重新向您征求同意。',
      '',
      '5. 公开披露',
      '我们不会主动公开您未自行公开的信息，除非遵循国家法律法规规定或者获得您的同意。',
      '',
      '三、我们如何存储和保护您的个人信息',
      '',
      '1. 存储地点',
      '我们会按照法律法规的规定，将在中国境内运营过程中收集和产生的个人信息存储于中国境内。',
      '',
      '2. 存储期限',
      '我们仅在为实现目的所必需的时间及法律法规所规定的保存期限内保留您的个人信息，超出上述存储期限后，我们会对您的个人信息进行删除或匿名化处理。',
      '',
      '3. 安全保护措施',
      '我们已采取符合业界标准、合理可行的安全防护措施保护您的信息，防止个人信息遭到未经授权访问、公开披露、使用、修改、损坏或丢失，包括数据加密传输、访问权限控制、安全审计等。',
      '',
      '四、您的权利',
      '在您使用我们的游戏期间，您可以通过以下方式行使相关权利，我们会在符合法律法规要求的情形下响应您的请求。',
      '',
      '1. 查询与更正',
      '您可以在游戏内【我的】页面查看您的昵称、头像等账户信息。',
      '如您需要更正您的快手账号信息，您可以通过快手APP-左上角【≡】-【设置】以及APP-【我】更正您的快手昵称等账号信息。',
      '',
      '2. 删除',
      '您可以通过本政策公示的联系方式向我们提出删除您个人信息的请求。',
      '',
      '3. 撤回同意',
      '您可以通过快手APP设置页面关闭相应权限，即视为撤回对相应信息收集的同意。',
      '',
      '4. 注销账号',
      '您可以通过快手APP左上角【≡】-【设置】-【账号与安全】-【注销账号】注销您的快手账号，注销后我们将在合理期限内删除您的个人信息或进行匿名化处理；因适用的法律和安全技术限制必须留存的，我们将停止除存储和采取必要的安全保护措施之外的处理。',
      '请注意，当您撤回同意或删除信息后，我们可能无法继续为您提供相应的游戏功能和服务。',
      '',
      '五、未成年人保护',
      '我们非常重视对未成年人个人信息的保护。我们的游戏不面向未满14周岁的未成年人。如果您是未满14周岁的未成年人，请勿使用我们的游戏或向我们提供个人信息。',
      '如果我们发现在未获得监护人同意的情况下收集了未满14周岁未成年人的个人信息，我们将尽快删除相关信息。',
      '',
      '六、本政策的更新',
      '我们可能适时修订本政策。当政策条款发生变更时，我们会在游戏内或以其他适当方式向您展示变更后的政策。对于重大变更，我们会以更为显著的方式通知您。',
      '',
      '七、如何联系我们',
      '如果您对本政策有任何疑问、意见或建议，可以通过【ksxyxpt@kuaishou.com】与我们联系。',
      '我们将尽快审核所涉问题，并在验证您的身份后及时予以回复。一般情况下，我们将在十五个工作日内回复您的请求。'
    ]
  };

  /** ⭐ v1.0.35 绘制协议浮层（完整版·可滚动·自动折行）*/
  Welcome.drawAgreement = function(ctx, VW, VH, state){
    var ag = Welcome._agreement;
    if (!ag) return;
    // 半透明遮罩
    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    ctx.fillRect(0, 0, VW, VH);
    // 卡片（稍大以容纳完整文本）
    var w = VW*0.88, h = VH*0.78;
    var x = (VW-w)/2, y = (VH-h)/2;
    // 卡片底
    ctx.fillStyle = '#fbf3e6';
    Welcome._roundRect(ctx, x, y, w, h, 14);
    ctx.fill();
    ctx.strokeStyle = '#c8380f'; ctx.lineWidth = 2;
    Welcome._roundRect(ctx, x, y, w, h, 14);
    ctx.stroke();
    // 标题
    ctx.fillStyle = '#c8380f';
    ctx.font = 'bold 18px -apple-system,PingFang SC,sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('《' + ag.label + '》', VW/2, y + 28);
    // 分割线
    ctx.strokeStyle = 'rgba(200,56,15,0.3)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x+14, y+50); ctx.lineTo(x+w-14, y+50); ctx.stroke();
    // ─── 正文区域 ───
    var textX = x + 16;
    var textW = w - 36;   // 右侧留 20px 给滚动条
    var textTop = y + 60;
    var textH = h - 100;  // 顶部 60 + 底部 40（留给关闭按钮区）
    var lineH = 18;
    var fontSize = 12;
    // 自动折行：将段落数组拆成单行数组
    var paragraphs = Welcome._agreementText[ag.label] || ['暂无内容'];
    ctx.font = fontSize + 'px -apple-system,PingFang SC,sans-serif';
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    var allLines = [];
    paragraphs.forEach(function(p){
      if (!p) { allLines.push(''); return; }
      var wrapped = Welcome._wrapLine(p, textW, ctx);
      wrapped.forEach(function(wl){ allLines.push(wl); });
    });
    var totalTextH = allLines.length * lineH;
    ag.maxScroll = Math.max(0, totalTextH - textH);
    // 限制滚动范围
    if (ag.scrollY == null) ag.scrollY = 0;
    if (ag.scrollY < 0) ag.scrollY = 0;
    if (ag.scrollY > ag.maxScroll) ag.scrollY = ag.maxScroll;
    // 裁剪正文区域
    ctx.save();
    ctx.beginPath();
    ctx.rect(textX, textTop, textW + 4, textH);
    ctx.clip();
    // 带滚动偏移绘制
    ctx.fillStyle = '#3a2418';
    var drawY = textTop - ag.scrollY;
    allLines.forEach(function(line, i){
      var lineY = drawY + i * lineH;
      if (lineY + lineH > textTop - lineH && lineY < textTop + textH + lineH) {
        ctx.fillText(line, textX, lineY);
      }
    });
    ctx.restore();
    // 滚动指示条（仅在可滚动时显示）
    if (ag.maxScroll > 0) {
      var indicatorH = Math.max(28, textH * (textH / totalTextH));
      var indicatorY = textTop + (textH - indicatorH) * (ag.scrollY / ag.maxScroll);
      var indicatorX = x + w - 10;
      ctx.fillStyle = 'rgba(200,56,15,0.22)';
      Welcome._roundRect(ctx, indicatorX, indicatorY, 4, indicatorH, 2);
      ctx.fill();
    }
    // ─── 右上角关闭 X ───
    var closeSize = 28;
    var cx = x + w - closeSize - 6;
    var cy = y + 6;
    ctx.fillStyle = '#c8380f';
    ctx.beginPath(); ctx.arc(cx + closeSize/2, cy + closeSize/2, closeSize/2 - 4, 0, Math.PI*2); ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(cx + closeSize/2 - 6, cy + closeSize/2 - 6);
    ctx.lineTo(cx + closeSize/2 + 6, cy + closeSize/2 + 6);
    ctx.moveTo(cx + closeSize/2 + 6, cy + closeSize/2 - 6);
    ctx.lineTo(cx + closeSize/2 - 6, cy + closeSize/2 + 6);
    ctx.stroke();
    // 点击区（priority 高→低）
    // ① 关闭按钮（最高优先级）
    state.tapAreas.push({
      x: cx, y: cy, w: closeSize, h: closeSize, priority: 999,
      onTap: function(){ Welcome._agreement = null; }
    });
    // ② 卡片体（吞掉点击，防止穿透到遮罩关闭）
    state.tapAreas.push({
      x: x, y: y, w: w, h: h, priority: 950,
      onTap: function(){} // 吞掉点击
    });
    // ③ 全屏遮罩（点卡片外部关闭）
    state.tapAreas.push({
      x: 0, y: 0, w: VW, h: VH, priority: 900,
      onTap: function(){ Welcome._agreement = null; }
    });
  };

  /** ⭐ v1.0.35 隐私政策浮层滚动处理（由 main.js touchmove 路由调用）*/
  Welcome.handleAgreementMove = function(cx, cy){
    var ag = Welcome._agreement;
    if (!ag) return;
    if (ag._touchY == null) { ag._touchY = cy; return; }
    var dy = ag._touchY - cy;
    ag._touchY = cy;
    ag.scrollY = Math.max(0, Math.min(ag.maxScroll || 0, (ag.scrollY || 0) + dy));
  };

  /** ⭐ v1.0.35 中文自动折行（按 measureText 逐字拆行）*/
  Welcome._wrapLine = function(text, maxW, ctx){
    if (!text) return [''];
    var lines = [];
    var cur = '';
    for (var i = 0; i < text.length; i++){
      var test = cur + text[i];
      if (ctx.measureText(test).width > maxW && cur){
        lines.push(cur);
        cur = text[i];
      } else {
        cur = test;
      }
    }
    if (cur) lines.push(cur);
    return lines.length ? lines : [''];
  };
  Welcome._roundRect = function(ctx, x, y, w, h, r){
    r = Math.min(r, w/2, h/2);
    ctx.beginPath();
    ctx.moveTo(x+r, y);
    ctx.arcTo(x+w, y, x+w, y+h, r);
    ctx.arcTo(x+w, y+h, x, y+h, r);
    ctx.arcTo(x, y+h, x, y, r);
    ctx.arcTo(x, y, x+w, y, r);
    ctx.closePath();
  };

  // ═════ 工具：圆角矩形 ═════
  function roundRect(ctx, x, y, w, h, r){
    r = Math.min(r, w/2, h/2);
    ctx.beginPath();
    ctx.moveTo(x+r, y);
    ctx.arcTo(x+w, y, x+w, y+h, r);
    ctx.arcTo(x+w, y+h, x, y+h, r);
    ctx.arcTo(x, y+h, x, y, r);
    ctx.arcTo(x, y, x+w, y, r);
    ctx.closePath();
  }
})();
