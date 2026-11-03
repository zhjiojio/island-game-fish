// js/tb-render.js — 每帧绘制：启动页 / 直播间 / 交互面板 / 结局
(function () {
  var M3 = window.M3;
  var UI = M3.UI, E = M3.Engine, Model = M3.Model, Story = M3.Story, L = M3.Loader;
  var CO = M3.Config.COLOR;
  var ctx = null;

  function bind(c) { ctx = c; }

  var TYPE_SPEED = 42;   // 打字机每字毫秒

  function draw() {
    var st = E.state;
    UI.frame();
    var W = UI.W, H = UI.H;

    // 背景：视频由 underGameView 显示在 canvas 之下，此处必须 clearRect 留出透明
    ctx.clearRect(0, 0, W, H);
    if (!st.video) {
      // 无视频（H5 预览 / 缓冲中）：画海报或渐变兜底
      if (st.poster && st.poster.width) {
        var im = st.poster;
        var s = Math.max(W / im.width, H / im.height);
        try { ctx.drawImage(im, (W - im.width * s) / 2, (H - im.height * s) / 2, im.width * s, im.height * s); } catch (e) {}
      } else {
        ctx.fillStyle = UI.vGradient(0, 0, H, [[0, '#2a1030'], [0.5, '#160a20'], [1, '#08040e']]);
        ctx.fillRect(0, 0, W, H);
      }
    }

    if (st.phase === 'splash') { drawSplash(st); return; }
    if (st.phase === 'ending') { drawEnding(st); return; }
    drawLive(st);
  }

  // ═══ 启动页（登录页）═══
  // 1:1 还原 Figma 442:10725「登录页」，设计画布 414 × 896。
  // 节点清单：
  //   442:10726 image 5840        全屏背景（四位候选人合影）
  //   442:10728 底部蒙版(上)      0,0 414×338 顶部压暗渐变
  //   442:10747 小游戏功能        右上胶囊组（平台原生能力，仅 H5 兜底绘制）
  //   442:10729 image 5844        标题 LOGO「提艾默酒吧·店长争夺战」258×106
  //   442:10730 副标题            四位候选人·你的星光决定谁上位
  //   442:10735/41/38/32          四个竖排姓名牌（调酒师/领舞/驻唱/啤酒妹）
  //   442:10727 底部蒙版(下)      0,524 414×372 底部压暗渐变
  //   442:10744 Group 2090053593  进入直播间按钮 260×64
  //   442:10731 底部文案          今晚谁来当店长由你决定
  var DW = 414, DH = 896;          // 设计画布
  var LOGIN_BG   = 'media/login/bg.png';
  var LOGIN_LOGO = 'media/login/logo.png';
  var PILL_HOME  = 'media/login/pill-home.png';
  var PILL_MORE  = 'media/login/pill-more.png';
  // 入场页（Figma 497:24442）资源
  var ENTER_BG    = 'media/login/enter-bg.png';    // 497:24443 剪影屏风场景
  var ENTER_TITLE = 'media/login/enter-title.png'; // 497:24465 标题切图（方正粗活意不可用）

  // 姓名牌：设计坐标（相对画布左上，画布 y 已归零）
  var NAME_TAGS = [
    { text: '调酒师', x: 30,  y: 448 },
    { text: '领舞',   x: 143, y: 494 },
    { text: '驻唱',   x: 269, y: 494 },
    { text: '啤酒妹', x: 356, y: 448 }
  ];

  // 姓名牌：#190047CC 底 + inset 0 0 18.6px #DF0DFF4D + 白→粉渐变竖排字
  function drawNameTag(str, x, y, s) {
    var w = 28 * s, lh = 20 * s;
    var h = str.length * lh + 16 * s;
    var r = w / 2;

    UI.fillRound(x, y, w, h, r, 'rgba(25,0,71,.80)');   // #190047 @ CC
    ctx.save();
    UI.roundRect(x, y, w, h, r); ctx.clip();
    ctx.strokeStyle = 'rgba(223,13,255,.30)';           // #DF0DFF @ 4D
    ctx.shadowColor = 'rgba(223,13,255,.30)';
    ctx.shadowBlur  = 18.6 * s;
    ctx.lineWidth   = 3 * s;
    UI.roundRect(x + 1.5, y + 1.5, w - 3, h - 3, r); ctx.stroke(); ctx.stroke();
    ctx.restore();

    // linear-gradient(99.97deg, #fff 1.49%, #f0a7ff 98.13%) → 近水平渐变
    var g = ctx.createLinearGradient(x, y, x + w, y + h);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(1, '#f0a7ff');
    var f = '400 ' + Math.round(16 * s) + 'px sans-serif';
    var cx = x + w / 2, y0 = y + (h - str.length * lh) / 2;
    for (var i = 0; i < str.length; i++) {
      UI.text(str[i], cx, y0 + i * lh + lh * 0.78, f, g, 'center');
    }
  }

  // 右上功能胶囊（H5 兜底）：#0000001A 底 + #FFFFFF80 0.5px 描边 + radius 37
  function drawPill(im, x, y, w, h, s) {
    UI.fillRound(x, y, w, h, h / 2, 'rgba(0,0,0,.10)');
    UI.strokeRound(x, y, w, h, h / 2, 'rgba(255,255,255,.50)', 0.5 * s);
    if (im && im.width) { try { ctx.drawImage(im, x, y, w, h); } catch (e) {} }
  }

  // 设计稿通用渐变字：linear-gradient(99.97deg, #fff 1.49%, #f0a7ff 98.13%)
  // 99.97deg 接近垂直向下偏右，落到单行文本上表现为「左上白 → 右下粉」
  function gradText(str, cx, baseY, font, w) {
    ctx.font = font;
    var tw = w || ctx.measureText(str).width;
    var g = ctx.createLinearGradient(cx - tw / 2, baseY - tw * 0.12, cx + tw / 2, baseY + tw * 0.12);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(1, '#f0a7ff');
    UI.text(str, cx, baseY, font, g, 'center');
  }

  // 右上功能胶囊组（真机由快手原生胶囊占位，仅 H5 预览兜底绘制）
  function drawCapsules(W, topY, s) {
    if (L.isKS) return;
    L.loadImage(PILL_HOME, function () {});
    L.loadImage(PILL_MORE, function () {});
    var ph = 34 * s;
    var mw = 78 * s, hw = 48 * s;
    var mx = W - 19 * s - mw, hx = mx - 8 * s - hw;
    drawPill(L.getImage(PILL_HOME), hx, topY, hw, ph, s);
    drawPill(L.getImage(PILL_MORE), mx, topY, mw, ph, s);
  }

  // 顶部/底部压暗蒙版（登录页与入场页共用同一套渐变参数）
  //   顶部 497:24446 / 442:10728  h=338  #0c001dad 0% → #1b003e00 50%
  //   底部 497:24444 / 442:10727  h=372  #1b003e00 0% → #0c001d 47.34%
  function drawScrimTop(W, s, extraTop) {
    var h = 338 * s + (extraTop || 0);
    ctx.fillStyle = UI.vGradient(0, 0, h, [
      [0,   'rgba(12,0,29,.68)'],
      [0.5, 'rgba(27,0,62,0)'],
      [1,   'rgba(27,0,62,0)']
    ]);
    ctx.fillRect(0, 0, W, h);
  }
  function drawScrimBottom(W, H, s) {
    var h = 372 * s, y = H - h;
    ctx.fillStyle = UI.vGradient(0, y, H, [
      [0,      'rgba(27,0,62,0)'],
      [0.4734, '#0c001d'],
      [1,      '#0c001d']
    ]);
    ctx.fillRect(0, y, W, h);
  }

  // 主 CTA 按钮 260×64 radius 34
  //   linear-gradient(93.58deg,#ff0fac 0%,#7118ff 51.44%,#001eff 100%)
  //   + inset 0 0 24.4px #FFFFFF9E（Canvas 无 inset shadow，clip + shadowBlur 模拟并叠呼吸）
  function drawCtaButton(label, W, cy, s, action) {
    var t  = Date.now() / 1000;
    var bw = 260 * s, bh = 64 * s, r = 34 * s;
    var bx = (W - bw) / 2, by = cy;

    var g = ctx.createLinearGradient(bx, by + bh, bx + bw, by);   // 93.58deg ≈ 近水平
    g.addColorStop(0,      '#ff0fac');
    g.addColorStop(0.5144, '#7118ff');
    g.addColorStop(1,      '#001eff');
    ctx.fillStyle = g;
    UI.roundRect(bx, by, bw, bh, r); ctx.fill();

    ctx.save();
    UI.roundRect(bx, by, bw, bh, r); ctx.clip();
    var glow = 0.62 + 0.24 * (0.5 + Math.sin(t * 2.2) * 0.5);     // #FFFFFF9E ≈ .62
    ctx.strokeStyle = 'rgba(255,255,255,' + glow + ')';
    ctx.shadowColor = 'rgba(255,255,255,' + glow + ')';
    ctx.shadowBlur  = 24.4 * s;
    ctx.lineWidth   = 3 * s;
    UI.roundRect(bx + 1.5, by + 1.5, bw - 3, bh - 3, r); ctx.stroke(); ctx.stroke();
    ctx.restore();

    UI.text(label, bx + bw / 2, by + bh / 2 + 7 * s,
            '600 ' + Math.round(20 * s) + 'px sans-serif', '#FFFFFF', 'center');
    UI.push(bx - 10, by - 10, bw + 20, bh + 20, action);
    return by;
  }

  function drawSplash(st) {
    var W = UI.W, H = UI.H;

    // 资源预取（loadImage 内部有缓存，未就绪时走渐变兜底）
    L.loadImage(LOGIN_BG,   function () {});
    L.loadImage(LOGIN_LOGO, function () {});
    L.loadImage(PILL_HOME,  function () {});
    L.loadImage(PILL_MORE,  function () {});

    // ① 背景：cover 铺满。同时得到设计坐标 → 屏幕坐标的映射，
    //    保证 LOGO / 姓名牌始终贴合合影中人物的位置。
    var bs   = Math.max(W / DW, H / DH);           // cover 缩放
    var offX = (W - DW * bs) / 2;
    var offY = (H - DH * bs) / 2;
    function bx_(dx) { return offX + dx * bs; }    // 设计 x → 屏幕 x
    function by_(dy) { return offY + dy * bs; }    // 设计 y → 屏幕 y

    var bg = L.getImage(LOGIN_BG);
    if (bg && bg.width) {
      try { ctx.drawImage(bg, offX, offY, DW * bs, DH * bs); } catch (e) {}
    } else {
      ctx.fillStyle = UI.vGradient(0, 0, H, [[0, '#3a1030'], [0.55, '#1a0a22'], [1, '#08040e']]);
      ctx.fillRect(0, 0, W, H);
    }

    var s = W / DW;   // 屏幕边缘锚定元素的等比缩放

    // ② 442:10728 顶部蒙版 linear-gradient(180deg,#0c001dad 0%,#1b003e00 50%)
    var topH = 338 * s;
    ctx.fillStyle = UI.vGradient(0, 0, topH, [
      [0,   'rgba(12,0,29,.68)'],
      [0.5, 'rgba(27,0,62,0)'],
      [1,   'rgba(27,0,62,0)']
    ]);
    ctx.fillRect(0, 0, W, topH);

    // ③ 442:10727 底部蒙版 linear-gradient(180deg,#1b003e00 0%,#0c001d 47.34%)
    var botH = 372 * s, botY = H - botH;
    ctx.fillStyle = UI.vGradient(0, botY, H, [
      [0,      'rgba(27,0,62,0)'],
      [0.4734, '#0c001d'],
      [1,      '#0c001d']
    ]);
    ctx.fillRect(0, botY, W, botH);

    // ④ 442:10747 小游戏功能胶囊（真机由快手原生胶囊占位，仅 H5 预览绘制）
    if (!L.isKS) {
      var ph = 34 * s, py = UI.TOP + 16 * s;
      var mw = 78 * s, hw = 48 * s;
      var mx = W - 19 * s - mw, hx = mx - 8 * s - hw;
      drawPill(L.getImage(PILL_HOME), hx, py, hw, ph, s);
      drawPill(L.getImage(PILL_MORE), mx, py, mw, ph, s);
    }

    // ⑤ 442:10729 标题 LOGO 258×106 @ (78,128)
    var logo = L.getImage(LOGIN_LOGO);
    var lx = bx_(78), ly = by_(128), lw = 258 * bs, lh2 = 106 * bs;
    if (logo && logo.width) {
      try { ctx.drawImage(logo, lx, ly, lw, lh2); } catch (e) {}
    } else {
      UI.text('提艾默酒吧', lx + lw / 2, ly + 46 * bs, '900 ' + Math.round(34 * bs) + 'px sans-serif', '#fff', 'center');
      UI.text('店长争夺战', lx + lw / 2, ly + 90 * bs, '800 ' + Math.round(24 * bs) + 'px sans-serif', '#f0a7ff', 'center');
    }

    // ⑥ 442:10730 副标题 14px #FFE7FF，设计 top=251、居中于 LOGO 组
    UI.text('四位候选人·你的星光决定谁上位', bx_(206.5), by_(251 + 15),
            '400 ' + Math.round(14 * bs) + 'px sans-serif', '#FFE7FF', 'center');

    // ⑦ 四个竖排姓名牌
    for (var i = 0; i < NAME_TAGS.length; i++) {
      var tg = NAME_TAGS[i];
      drawNameTag(tg.text, bx_(tg.x), by_(tg.y), bs);
    }

    // ⑧ 442:10744 进入直播间按钮 260×64 radius 34
    //    linear-gradient(93.58deg,#ff0fac 0%,#7118ff 51.44%,#001eff 100%) + inset 0 0 24.4px #FFFFFF9E
    var t   = Date.now() / 1000;
    var bw  = 260 * s, bh = 64 * s;
    var bbx = (W - bw) / 2;
    // 设计 top=709 / bottom=773（画布 896）→ 锚定底部
    var bby = H - (DH - 773) * s - bh;
    var bgr = ctx.createLinearGradient(bbx, bby + bh, bbx + bw, bby);  // 93.58deg ≈ 近水平
    bgr.addColorStop(0,      '#ff0fac');
    bgr.addColorStop(0.5144, '#7118ff');
    bgr.addColorStop(1,      '#001eff');
    ctx.fillStyle = bgr;
    UI.roundRect(bbx, bby, bw, bh, 34 * s); ctx.fill();

    // inset 白色高光（Canvas 无 inset shadow，用 clip + shadowBlur 模拟，叠呼吸感）
    ctx.save();
    UI.roundRect(bbx, bby, bw, bh, 34 * s); ctx.clip();
    var glow = 0.62 + 0.24 * (0.5 + Math.sin(t * 2.2) * 0.5);   // #FFFFFF9E ≈ .62
    ctx.strokeStyle = 'rgba(255,255,255,' + glow + ')';
    ctx.shadowColor = 'rgba(255,255,255,' + glow + ')';
    ctx.shadowBlur  = 24.4 * s;
    ctx.lineWidth   = 3 * s;
    UI.roundRect(bbx + 1.5, bby + 1.5, bw - 3, bh - 3, 34 * s); ctx.stroke(); ctx.stroke();
    ctx.restore();

    UI.text('进入直播间', bbx + bw / 2, bby + bh / 2 + 7 * s,
            '600 ' + Math.round(20 * s) + 'px sans-serif', '#FFFFFF', 'center');
    UI.push(bbx - 10, bby - 10, bw + 20, bh + 20, 'splash_start');

    // ⑨ 隐私政策 + 著作权人（v1.0.3 参考老铁眼真尖）
    //    位置：主 CTA 下方 26px；点击《隐私政策》唤起浮层
    var footerY = bby + bh + 26 * s;
    var prefix = '点击按钮代表您已同意';
    var mid    = '《隐私政策》';
    var pfx    = '400 ' + Math.round(11 * s) + 'px sans-serif';
    ctx.font = pfx;
    var prefixW = ctx.measureText(prefix).width;
    var midW    = ctx.measureText(mid).width;
    var totalW  = prefixW + midW;
    var startX  = (W - totalW) / 2;
    // 前缀
    UI.text(prefix, startX, footerY + 11 * s, pfx, 'rgba(255,255,255,.75)');
    // 链接
    var linkX = startX + prefixW;
    UI.text(mid, linkX, footerY + 11 * s, pfx, '#ffdd66');
    // 下划线
    ctx.strokeStyle = '#ffdd66';
    ctx.lineWidth   = 1;
    ctx.beginPath();
    ctx.moveTo(linkX, footerY + 13 * s);
    ctx.lineTo(linkX + midW, footerY + 13 * s);
    ctx.stroke();
    // 点击热区（放大 8px 好点）
    UI.push(linkX - 4, footerY - 6 * s, midW + 8, 24 * s, 'open_privacy');

    // 著作权人小字
    UI.text('著作权人：北京慕远科技有限公司', W / 2, footerY + 30 * s,
            '400 ' + Math.round(10 * s) + 'px sans-serif', 'rgba(255,255,255,.55)', 'center');
    // 版本水印（便于扫码时快速识别当前跑的是哪版）
    UI.text('v1.0.17', W - 12 * s, H - 8 * s,
            '400 ' + Math.round(9 * s) + 'px sans-serif', 'rgba(255,255,255,.35)', 'right');

    // 首屏预取候选人头像（进入直播间后立即要用）
    // 取包内切图（Figma 454:13398~13401），CDN 图已被本地切图取代，不再预拉
    var idl = Object.keys(Story.candidates);
    for (var q = 0; q < idl.length; q++) {
      var av = UI.IM_AV[idl[q]] || Story.candidates[idl[q]].avatar;
      L.loadImage(av, function () {});
    }

    // ⑩ 隐私政策浮层（最顶层，遮罩阻断所有底层交互）
    if (st.showPrivacy) drawPrivacyModal(st, W, H, s);
  }

  // ═══ 隐私政策浮层 · v1.0.15 全文 + 上下滑动 ═══
  // 参考 memory be51ad500b58703f，运营主体北京慕远科技有限公司，生效日期 2026-08-12
  var PRIVACY_LINES = [
    '《提艾默酒吧·店长争夺战 隐私政策》',
    '',
    '生效日期：2026 年 8 月 12 日',
    '',
    '北京慕远科技有限公司（以下简称"我们"）深知个人信息',
    '对您的重要性，并会尽全力保护您的个人信息安全可靠。',
    '我们致力于维持您对我们的信任，恪守以下原则，保护您',
    '的个人信息：权责一致原则、目的明确原则、选择同意原',
    '则、最少够用原则、确保安全原则、主体参与原则、公开',
    '透明原则等。请您在使用本小游戏前仔细阅读并理解本《隐',
    '私政策》。',
    '',
    '一、我们如何收集和使用您的个人信息',
    '在您使用"提艾默酒吧·店长争夺战"小游戏过程中，我们会',
    '基于合法、正当、必要原则，收集下列信息：',
    '1) 快手账号基础信息（openId、昵称、头像），仅用于登录',
    '   小游戏、显示您在游戏内的身份与排行榜位置；',
    '2) 设备信息（机型、操作系统版本、设备性能等级、屏幕',
    '   分辨率、系统语言），仅用于视频/动画的自适应降级、',
    '   崩溃诊断与故障恢复；',
    '3) 游戏行为数据（关卡进度、选择记录、观看激励视频次',
    '   数、送礼记录），仅用于产品优化、数据统计与个性化',
    '   剧情推荐；',
    '4) 日志信息（IP 地址、访问时间、访问页面），仅用于安',
    '   全审计和防作弊。',
    '我们承诺：不会主动收集与游戏功能无关的信息，也不会',
    '要求您授权与游戏无关的敏感权限。',
    '',
    '二、我们如何共享、转让、公开披露您的个人信息',
    '除以下情形外，我们不会与任何第三方共享您的个人信息：',
    '1) 依据法律法规、诉讼争议解决或政府监管的强制性要求；',
    '2) 与快手平台（北京快手科技有限公司）共享，以实现账',
    '   号登录、激励视频广告投放、虚拟礼物打赏、支付结算',
    '   等核心功能。快手平台自身的隐私政策请见快手 App 内',
    '   的公示；',
    '3) 与我们的关联公司或经过安全评估的第三方服务商共享',
    '   （如云服务器、CDN 加速、崩溃监控、数据统计），我',
    '   们会要求这些主体签署严格的保密协议，并对其信息处',
    '   理活动进行监督。',
    '未获取您的明确同意，我们不会将您的个人信息用于向您',
    '定向推送与本小游戏无关的商业广告。',
    '',
    '三、我们如何存储和保护您的个人信息',
    '1) 存储地点：您的个人信息将存储于中华人民共和国境内。',
    '2) 存储期限：我们仅在为您提供服务所必需的时间内保留',
    '   您的个人信息，超过必要期限后将进行匿名化或删除。',
    '3) 安全措施：我们采用符合业界标准的物理、管理和技术',
    '   安全防护措施（数据加密传输、访问控制、安全审计等）',
    '   来降低您的个人信息被毁损、误用、非授权访问、公开',
    '   披露与更改的风险。',
    '4) 事件响应：如发生个人信息泄漏等安全事件，我们将按',
    '   照法律法规要求，及时向您告知事件基本情况、可能的',
    '   影响、已采取或将要采取的处置措施等。',
    '',
    '四、您的权利',
    '您对您的个人信息享有以下权利：',
    '1) 查阅、复制您的个人信息：您可通过本小游戏内的"我的"',
    '   入口查看您的账号、进度、送礼记录等信息；',
    '2) 更正您的个人信息：您可通过快手 App 修改账号昵称、',
    '   头像等；游戏进度类信息如有异议，可联系我们更正；',
    '3) 删除您的个人信息：您可通过快手 App 内的"设置-隐私"',
    '   或本小游戏内的"退出登录"入口撤回授权，我们将在合',
    '   理期限内停止对相应信息的收集和使用，并按法规删除；',
    '4) 撤回授权：您有权随时撤回您此前给予的授权。撤回后',
    '   我们将不再基于该授权处理您的相关个人信息，但不影',
    '   响撤回前基于该授权处理的合法性；',
    '5) 注销账号：您可通过快手 App 的账号注销入口注销您的',
    '   账号，注销后本小游戏内相应数据将被匿名化或删除。',
    '',
    '五、未成年人保护',
    '本小游戏面向成年人。若您为未满 18 周岁的未成年人，',
    '请在您的父母或其他监护人的陪同下阅读本政策并使用本',
    '小游戏。如我们发现您为未成年人，我们会依法删除相关',
    '信息、限制功能使用，并主动联系监护人配合处理。',
    '',
    '六、本隐私政策的变更',
    '我们可能会根据法律法规变化、业务调整或用户反馈修订',
    '本《隐私政策》。任何修订都会以显著方式通知您（如在',
    '游戏内弹出提示、公告等）。您继续使用本小游戏即视为',
    '接受修订后的政策；如您不接受，可停止使用本小游戏。',
    '',
    '七、如何联系我们',
    '如您对本《隐私政策》或您的个人信息处理有任何疑问、',
    '意见、投诉或建议，可通过以下方式联系我们：',
    '  · 邮箱：ksxyxpt@kuaishou.com',
    '  · 通过快手 App 内"提艾默酒吧·店长争夺战"客服入口',
    '一般情况下，我们将在 15 个工作日内回复您的请求。',
    '',
    '著作权人 / 运营主体：北京慕远科技有限公司',
    '生效日期：2026 年 8 月 12 日'
  ];

  function drawPrivacyModal(st, W, H, s) {
    // 全屏黑色蒙层（吃掉所有点击）
    ctx.fillStyle = 'rgba(0,0,0,.72)';
    ctx.fillRect(0, 0, W, H);
    UI.push(0, 0, W, H, 'close_privacy');

    // 面板：居中，宽 90%，高 80%
    var pw = W * 0.9, ph = H * 0.8;
    var px = (W - pw) / 2, py = (H - ph) / 2;
    UI.fillRound(px, py, pw, ph, 16 * s, '#1a0a2e');
    UI.strokeRound(px, py, pw, ph, 16 * s, 'rgba(255,255,255,.15)', 1);

    // 标题条
    var titleH = 44 * s;
    UI.text('隐私政策', px + pw / 2, py + titleH * 0.68,
            '600 ' + Math.round(16 * s) + 'px sans-serif', '#ffffff', 'center');
    // 分隔线
    ctx.strokeStyle = 'rgba(255,255,255,.10)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(px + 16, py + titleH);
    ctx.lineTo(px + pw - 16, py + titleH);
    ctx.stroke();

    // 关闭按钮 32×32 右上
    var cSize = 32 * s, cx = px + pw - cSize - 8, cy = py + 8;
    UI.fillRound(cx, cy, cSize, cSize, cSize / 2, 'rgba(255,255,255,.08)');
    UI.text('×', cx + cSize / 2, cy + cSize / 2 + 8 * s,
            '600 ' + Math.round(22 * s) + 'px sans-serif', '#ffffff', 'center');
    UI.push(cx - 6, cy - 6, cSize + 12, cSize + 12, 'close_privacy');

    // 正文（v1.0.15：支持上下滑动 —— st.privacyScrollY 由 tb-input.js 触发更新）
    var contentClipX = px + 12;
    var contentClipY = py + titleH + 6;
    var contentClipW = pw - 24;
    var contentClipH = ph - titleH - 60 * s;
    ctx.save();
    UI.roundRect(contentClipX, contentClipY, contentClipW, contentClipH, 8);
    ctx.clip();
    var lineH = Math.max(16, 15 * s);
    var fontMain  = '400 ' + Math.round(11 * s) + 'px sans-serif';
    var fontTitle = '600 ' + Math.round(13 * s) + 'px sans-serif';

    // 计算最大滚动范围
    var totalH = PRIVACY_LINES.length * lineH + 24 * s;
    var scrollMax = Math.max(0, totalH - contentClipH);
    var scrollY = st.privacyScrollY || 0;
    if (scrollY < 0) scrollY = 0;
    if (scrollY > scrollMax) scrollY = scrollMax;
    st.privacyScrollY = scrollY;
    // 暴露给 input：滚动范围
    st._privacyScrollMax = scrollMax;
    st._privacyContent = { x: contentClipX, y: contentClipY, w: contentClipW, h: contentClipH };

    var contentTop = py + titleH + 14 * s - scrollY;
    for (var i = 0; i < PRIVACY_LINES.length; i++) {
      var line = PRIVACY_LINES[i];
      var lineY = contentTop + i * lineH;
      // 剔除完全在可见区域之外的行（性能）
      if (lineY < contentClipY - lineH) continue;
      if (lineY > contentClipY + contentClipH + lineH) break;
      var isHead = /^[一二三四五六七八九十]、/.test(line) || /^《.*》$/.test(line);
      UI.text(line, px + 20, lineY,
              isHead ? fontTitle : fontMain,
              isHead ? '#ffdd66' : 'rgba(255,255,255,.85)');
    }
    ctx.restore();

    // 滚动条指示（右侧极简）
    if (scrollMax > 0) {
      var trackX = contentClipX + contentClipW - 3 * s;
      var trackH = contentClipH;
      var thumbH = Math.max(24 * s, trackH * (contentClipH / totalH));
      var thumbY = contentClipY + (trackH - thumbH) * (scrollY / scrollMax);
      ctx.fillStyle = 'rgba(255,255,255,.10)';
      UI.roundRect(trackX, contentClipY, 2 * s, trackH, 1); ctx.fill();
      ctx.fillStyle = 'rgba(255,221,102,.75)';
      UI.roundRect(trackX, thumbY, 2 * s, thumbH, 1); ctx.fill();
    }

    // 底部"我知道了"按钮
    var btnH = 36 * s, btnW = pw - 40, btnX = px + 20, btnY = py + ph - btnH - 12 * s;
    var gr = ctx.createLinearGradient(btnX, btnY, btnX + btnW, btnY + btnH);
    gr.addColorStop(0, '#ff0fac'); gr.addColorStop(1, '#7118ff');
    ctx.fillStyle = gr;
    UI.roundRect(btnX, btnY, btnW, btnH, btnH / 2); ctx.fill();
    UI.text('我知道了', btnX + btnW / 2, btnY + btnH / 2 + 6 * s,
            '600 ' + Math.round(14 * s) + 'px sans-serif', '#ffffff', 'center');
    UI.push(btnX, btnY, btnW, btnH, 'close_privacy');
  }

  // ═══ 直播间主界面 ═══
  function drawLive(st) {
    var W = UI.W, H = UI.H;
    var nd = E.node();
    if (!nd) { drawEnding(st); return; }
    E.ensurePending(nd);

    var rk = Model.ranking();

    // ⓪ 纯净模式：只显示视频；右上角浮一个"眼睛"图标可切回
    if (st.pureMode) {
      drawPureModeToggle(st, true);
      return;
    }

    // ① 顶部主播卡 + 排名榜（Figma 442:9391 / 481:17817）
    //    preLive 时不显示直播间 UI
    var y = UI.TOP + 8;
    if (!nd.preLive) {
      UI.topBar(st.muted);
      // v1.0.8 一键折叠：hudCollapsed 时不画 rankPanel，改画"互动区"胶囊
      if (st.hudCollapsed) {
        y = UI.hudCollapsedPill(0);
      } else {
        y = UI.rankPanel(0, rk, st.pulses, Model.getSupport());
        UI.hudCollapseBtn(y);   // 排名榜右下角"收起"按钮
      }
      // 第三/四幕显示 PK 条：左 = 你 all in 的人，右 = 龙哥的对手
      if (/第三幕|第四幕/.test(nd.act)) {
        y = UI.pkBar(y + 6, rk, Model.getSupport(), Model.getRival()) + 6;
      }
    }

    // ② 幕次标签 → 设计稿右上「小时榜」胶囊 442:9498
    // v1.0.10 移除右上角"XX 幕/XX"胶囊标签（用户反馈无意义，且和纯净按钮/关闭按钮重叠）
    // if (nd.act && !nd.preLive) UI.hourTag(nd.title || nd.act);

    // ③ 交互区（自底向上排布）
    var bottom = H - 12;
    // 定装弹窗为独立弹层（见 ⑥），此处不再排布常态礼物面板
    //   单件定装 st.outfitPreview / 组合定装照 nd.outfitReveal 共用同一弹层外壳
    var modalPreview = !nd.preLive && st.outfitPreview && st.outfitPreview.image;
    var modalReveal  = !nd.preLive && !modalPreview && nd.outfitReveal;
    // 游戏结果同样走弹窗（不再贴图层）：龙哥出手 / 飞吻·S 造型 / 字母 / 猜拳 等
    var modalGameFx  = !nd.preLive && !modalPreview && !modalReveal && !!st.gameFx;
    var modal = modalPreview || modalReveal || modalGameFx;
    if (!nd.preLive && !modal) {
      bottom = UI.dock(Model.getStars(), Model.canWatchAd(), Model.getMultiplier(), st.giftTo);
    }
    var panelTop = modal ? H : drawInteraction(st, nd, bottom);

    // ④ 弹幕：设计稿 11,311 起，位于排名榜下方、交互区上方
    //    hudCollapsed 时同 rankPanel 一起隐藏（用户点"互动区"胶囊可以还原）
    if (!nd.preLive && !modal && !st.hudCollapsed) {
      var dmY = y + 8;
      var dmH = Math.max(0, panelTop - dmY - 12);
      if (dmH > 24) UI.danmu(st.chat, dmY, Math.min(dmH, 108 * (W / DW)));
    }

    // ⑥ 定装弹窗：遮罩 + 图像 + 播报卡 + 双按钮（盖住 HUD）
    if (modalPreview) drawOutfitModal(st);
    else if (modalReveal) drawRevealModal(st);
    else if (modalGameFx) drawGameFxModal(st);

    // ⑦ 送礼特效大图（Figma 442:9693 260×260）：任何时机送礼都要弹，
    //    原先只在 confirm/continue 分支画，常态直播间点礼物看不到。
    if (st.giftFx && !modal) {
      if (!UI.giftFx(st.giftFx, panelTop)) st.giftFx = null;
    }

    // ⑧ 缓冲遮罩
    if (st.videoLoading) UI.loading('缓冲中…');

    // ⑧b 广告加载遮罩（比缓冲更高优先级，覆盖在最顶层）
    if (st.adLoading) UI.loading('广告正在加载中…');

    // ⑨ 广播 / 粒子 / toast（最顶层）
    if (st.broadcast && !UI.broadcast(st.broadcast.msg, st.broadcast.t0)) st.broadcast = null;
    UI.particles(st.particles, st.pulses);
    UI.toast(st.toasts);

    // ⑩ v1.0.9 星光不足弹窗（凌驾于所有 HUD 之上）
    if (st.needStars) drawNeedStarsModal(st, W, H, UI.ds());

    // ⑪ v1.0.10 送礼感谢覆盖层（3~4s）
    if (st.thanksOverlay) drawThanksOverlay(st, W, H, UI.ds());
  }

  // ═══ v1.0.9 星光不足弹窗 ═══
  function drawNeedStarsModal(st, W, H, s) {
    // 全屏黑色蒙层 + 吃掉所有点击（避免穿透到底层礼物按钮）
    ctx.fillStyle = 'rgba(0,0,0,.60)';
    ctx.fillRect(0, 0, W, H);
    UI.push(0, 0, W, H, 'need_stars_cancel');

    var pw = Math.min(300 * s, W * 0.86);
    var ph = 200 * s;
    var px = (W - pw) / 2, py = (H - ph) / 2;
    UI.fillRound(px, py, pw, ph, 16 * s, '#22103a');
    UI.strokeRound(px, py, pw, ph, 16 * s, 'rgba(255,221,102,.35)', 1.4);

    // 星光大 icon
    UI.text('★', px + pw / 2, py + 44 * s,
            '700 ' + Math.round(34 * s) + 'px sans-serif', '#ffdd66', 'center');
    // 标题
    UI.text('剩余星光不足', px + pw / 2, py + 78 * s,
            '600 ' + Math.round(16 * s) + 'px sans-serif', '#ffffff', 'center');
    // 副标题
    var subTxt = st.needStars.cost
      ? '本次消耗需要 ' + st.needStars.cost + ' 星光，可看广告获得星光后再送礼'
      : '可看广告获得星光后再继续';
    UI.text(subTxt, px + pw / 2, py + 104 * s,
            '400 ' + Math.round(11 * s) + 'px sans-serif', 'rgba(255,255,255,.72)', 'center');

    // v1.0.10 布局调整：左=我再想想（弱），右=去看广告（强，主动作）
    // 按钮 1（左）：我再想想（描边弱）
    var bh = 36 * s, bw = (pw - 40 * s - 12 * s) / 2;
    var b1x = px + 20 * s, b2x = b1x + bw + 12 * s, by = py + ph - bh - 18 * s;
    UI.fillRound(b1x, by, bw, bh, bh / 2, 'rgba(255,255,255,.08)');
    UI.strokeRound(b1x, by, bw, bh, bh / 2, 'rgba(255,255,255,.35)', 1);
    UI.text('我再想想', b1x + bw / 2, by + bh / 2 + 5 * s,
            '500 ' + Math.round(13 * s) + 'px sans-serif', '#ffffff', 'center');
    UI.push(b1x, by, bw, bh, 'need_stars_cancel');

    // 按钮 2（右）：去看广告（金渐变强）
    var gr1 = ctx.createLinearGradient(b2x, by, b2x + bw, by + bh);
    gr1.addColorStop(0, '#ff0fac'); gr1.addColorStop(1, '#7118ff');
    ctx.fillStyle = gr1;
    UI.roundRect(b2x, by, bw, bh, bh / 2); ctx.fill();
    UI.text('去看广告 +' + M3.Config.AD_REWARD + '星光',
            b2x + bw / 2, by + bh / 2 + 5 * s,
            '600 ' + Math.round(12 * s) + 'px sans-serif', '#ffffff', 'center');
    UI.push(b2x, by, bw, bh, 'need_stars_watch');
  }

  // ═══ v1.0.11 送礼感谢覆盖层（贴图立绘 + 音色 + 字幕）═══
  // v1.0.15：立绘缩小到 ~30% 尺寸、无边框、左对齐、台词以气泡展示（尾指立绘）
  function drawThanksOverlay(st, W, H, s) {
    var age = Date.now() - st.thanksOverlay.t0;
    if (age > st.thanksOverlay.life) { st.thanksOverlay = null; return; }
    var cand = Story.candidates[st.thanksOverlay.cid];
    if (!cand) { st.thanksOverlay = null; return; }
    var alpha = 1;
    if (age < 240) alpha = age / 240;
    else if (age > st.thanksOverlay.life - 400) alpha = Math.max(0, (st.thanksOverlay.life - age) / 400);
    ctx.save();
    ctx.globalAlpha = alpha;

    // 立绘 30% —— 参照之前满屏立绘 ~340×460，30% ≈ 102×138（此处按屏幕比例算，确保等比）
    var cw = Math.min(120 * s, W * 0.32);
    var ch = cw * 1.35;
    var cx0 = 12 * s;                    // 靠左，距屏左 12 * s
    var cy0 = H * 0.42;                  // 竖直居中偏上，让气泡朝上有余量
    if (cy0 + ch > H - 100 * s) cy0 = H - 100 * s - ch;

    // 载入立绘
    var imgPath = st.thanksOverlay.image || 'media/thanks/thanks-' + st.thanksOverlay.cid + '-v1.png';
    var thanksImg = M3.Loader.getImage(imgPath);
    if (!thanksImg) {
      M3.Loader.loadImage(imgPath, function () {});
      thanksImg = M3.Loader.getImage(cand.avatar);
    }
    // 无边框绘制，只用软阴影使其不与背景糊在一起
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,.55)';
    ctx.shadowBlur = 16 * s;
    ctx.shadowOffsetY = 4 * s;
    UI.roundRect(cx0, cy0, cw, ch, 12 * s);
    ctx.clip();
    if (thanksImg && thanksImg.width) {
      var scale = Math.max(cw / thanksImg.width, ch / thanksImg.height);
      var dw = thanksImg.width * scale, dh = thanksImg.height * scale;
      try { ctx.drawImage(thanksImg, cx0 + (cw - dw) / 2, cy0 + (ch - dh) / 2, dw, dh); } catch (e) {}
    } else {
      ctx.fillStyle = cand.color || '#7118ff';
      ctx.fillRect(cx0, cy0, cw, ch);
    }
    ctx.restore();

    // 气泡：立绘右侧，圆角矩形 + 左侧三角尾指
    var subText = st.thanksOverlay.text || '谢谢老板 ❤';
    var bubbleFont = '600 ' + Math.round(13 * s) + 'px sans-serif';
    ctx.font = bubbleFont;
    var maxBubbleW = W - cx0 - cw - 24 * s - 12 * s;
    if (maxBubbleW < 120) maxBubbleW = W - cx0 - cw - 20 * s;
    var lines = UI.wrap(subText, maxBubbleW - 24 * s, bubbleFont);
    var lh = 18 * s;
    var padX = 14 * s, padY = 10 * s;
    // 名字标签行
    var nameLine = cand.name + ' 说：';
    var nameFont = '700 ' + Math.round(12 * s) + 'px sans-serif';
    var bubbleH = padY * 2 + 16 * s + lines.length * lh;
    // 气泡宽 = 内容行最大宽 + 2 padX
    ctx.font = bubbleFont;
    var maxLineW = 0;
    for (var i = 0; i < lines.length; i++) {
      var lw = ctx.measureText(lines[i]).width;
      if (lw > maxLineW) maxLineW = lw;
    }
    ctx.font = nameFont;
    var nameW = ctx.measureText(nameLine).width;
    var bubbleW = Math.min(maxBubbleW, Math.max(maxLineW, nameW) + padX * 2);
    var bubbleX = cx0 + cw + 12 * s;
    var bubbleY = cy0 + ch * 0.15;
    if (bubbleY + bubbleH > H - 100 * s) bubbleY = H - 100 * s - bubbleH;

    // 气泡底
    UI.fillRound(bubbleX, bubbleY, bubbleW, bubbleH, 14 * s, 'rgba(255,255,255,.96)');
    UI.strokeRound(bubbleX, bubbleY, bubbleW, bubbleH, 14 * s, 'rgba(255,221,102,.85)', Math.max(1, 1.2 * s));
    // 尾指三角（左侧指向立绘）
    var tailY = bubbleY + Math.min(bubbleH - 22 * s, 30 * s);
    ctx.fillStyle = 'rgba(255,255,255,.96)';
    ctx.beginPath();
    ctx.moveTo(bubbleX, tailY);
    ctx.lineTo(bubbleX - 12 * s, tailY + 8 * s);
    ctx.lineTo(bubbleX, tailY + 16 * s);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,221,102,.85)';
    ctx.lineWidth = Math.max(1, 1.2 * s);
    ctx.beginPath();
    ctx.moveTo(bubbleX, tailY);
    ctx.lineTo(bubbleX - 12 * s, tailY + 8 * s);
    ctx.lineTo(bubbleX, tailY + 16 * s);
    ctx.stroke();

    // 气泡文本
    UI.text(nameLine, bubbleX + padX, bubbleY + padY + 10 * s, nameFont, '#a446ff');
    for (var j = 0; j < lines.length; j++) {
      UI.text(lines[j], bubbleX + padX, bubbleY + padY + 16 * s + lh * (j + 0.75),
              bubbleFont, '#22103a');
    }

    ctx.restore();
  }

  // ═══ 纯净模式：右下角浮"退出纯净"胶囊 ═══
  // v1.0.17：不再显示"退出纯净模式"按钮（用户反馈：进入沉浸视频播放模式时不要出现退出按钮）
  //   → 直接整屏可点，任何位置轻点视频即可退出（toggle_pure 铺满全屏透明热区）
  function drawPureModeToggle(st, on) {
    var W = UI.W, H = UI.H;
    // 全屏透明热区：轻点任意位置退出纯净模式
    UI.push(0, 0, W, H, 'toggle_pure');
  }

  // 交互面板：返回面板顶端 Y（供弹幕避让）
  function drawInteraction(st, nd, bottom) {
    var W = UI.W, H = UI.H;
    var ui = nd.ui;

    // 打字机字幕
    var chars = null;
    if (st.caption.text) {
      chars = Math.floor((Date.now() - st.caption.t0) / TYPE_SPEED);
      if (chars > st.caption.text.length) chars = st.caption.text.length;
    }

    if (!ui) {
      // 无交互：仅字幕
      return UI.caption(st.caption.who, st.caption.text, chars, bottom);
    }

    if (ui.type === 'enter-live') {
      // ═══ 入场页：1:1 还原 Figma 497:24442「登录页」（shot-01 入场），设计画布 414×896 ═══
      // 节点清单：
      //   497:24443 Rectangle 265496973  全屏背景（红色剪影屏风场景）
      //   497:24446 底部蒙版(上)  0,0 414×338    #0c001dad → #1b003e00 50%
      //   497:24450 小游戏功能    右上胶囊组（平台原生，H5 兜底）
      //   497:24464 Group 2090053612  标题组 288×70 @ (70,150)
      //     497:24465 今晚谁来当店长？          36px FZCuHuoYi 白→粉渐变，居中
      //     497:24466 提艾默酒吧正在直播…       14px #FFE7FF，左对齐 @ x=74
      //   497:24444 底部蒙版(下)  0,524 414×372  #1b003e00 → #0c001d 47.34%
      //   497:24447 Group 2090053593  进入提艾默直播间按钮 260×64 @ (77,709)
      var es = W / DW;

      // ① 背景 497:24443：无条件绘制。
      //    shot-01 已移除 video（视频走 underGameView 会盖住背景），
      //    因此这里必须每帧铺设计稿场景图，真机与设计稿才一致。
      L.loadImage(ENTER_BG, function () {});
      var ebg = L.getImage(ENTER_BG);
      if (ebg && ebg.width) coverImage(ebg, 0, 0, W, H);
      else { ctx.fillStyle = '#1a0603'; ctx.fillRect(0, 0, W, H); }

      // ② 上下压暗蒙版
      drawScrimTop(W, es);
      drawScrimBottom(W, H, es);

      // ③ 右上功能胶囊（设计 top=59）
      drawCapsules(W, 59 * es, es);

      // ④ 标题组 497:24464
      //    主标题 497:24465：设计字体 FZCuHuoYi-M25S 为方正商业字体，
      //    快手运行时不存在会回落成系统黑体（字形完全不符），故改用预渲染切图，
      //    渐变 linear-gradient(99.97deg,#fff,#f0a7ff) 已烘进图内。
      //    切图按设计 box 288×42 输出 3 倍图，直接贴 (70,150)。
      L.loadImage(ENTER_TITLE, function () {});
      var eti = L.getImage(ENTER_TITLE);
      var tW = 288 * es, tH = 42 * es, tX = 70 * es, tY = 150 * es;
      if (eti && eti.width) {
        try { ctx.drawImage(eti, tX, tY, tW, tH); } catch (e) {}
      } else {
        gradText(nd.title, tX + tW / 2, tY + 34 * es,
                 '400 ' + Math.round(36 * es) + 'px sans-serif');
      }
      //    副标题 497:24466：PingFang SC 14px #FFE7FF，设计 x=74 左对齐、box y=200 h=20
      UI.text(String(nd.text || '').replace(/。$/, ''),
              74 * es, (200 + 15) * es,
              '400 ' + Math.round(14 * es) + 'px sans-serif', '#FFE7FF');

      // ⑤ 进入直播间按钮：设计 top=709 / bottom=773 → 锚定底部
      var ebY = H - (DH - 773) * es - 64 * es;
      drawCtaButton('进入提艾默直播间', W, ebY, es, 'next');
      return ebY - 20;
    }

    if (ui.type === 'silhouette-pick') {
      // v1.0.15：4 等分横向点击热区，每格对应一个候选人；点击后跳到该候选人介绍
      var W2 = UI.W, H2 = UI.H, s2 = UI.ds();
      var opts = ui.options || [];
      var count = opts.length || 4;
      var zoneTop = 130 * s2;                          // 顶栏下方
      var zoneBot = (bottom == null ? H2 - 20 : bottom) - 90 * s2;   // 字幕上方
      if (zoneBot < zoneTop + 100) zoneBot = zoneTop + 100;
      var zoneH = zoneBot - zoneTop;
      var zoneW = W2 / count;
      // 顶部提示条
      var hintY = zoneTop - 24 * s2;
      UI.fillRound(20 * s2, hintY, W2 - 40 * s2, 32 * s2, 16 * s2, 'rgba(20,10,40,.72)');
      UI.strokeRound(20 * s2, hintY, W2 - 40 * s2, 32 * s2, 16 * s2, 'rgba(255,221,102,.65)', Math.max(1, 1.1 * s2));
      UI.text('👆 老板点谁，她就先从屏风后走出来', W2 / 2, hintY + 20 * s2,
              '700 ' + Math.round(13 * s2) + 'px sans-serif', '#ffdd66', 'center');
      // 4 等分：每格半透明分隔线 + 候选人名 + hint
      var COLORS = ['rgba(255,92,190,.30)', 'rgba(120,180,255,.30)', 'rgba(255,221,102,.30)', 'rgba(190,120,255,.30)'];
      for (var qi = 0; qi < count; qi++) {
        var qx = qi * zoneW;
        // 悬浮层：不遮挡视频，只画薄边框 + 顶部小标签
        ctx.strokeStyle = 'rgba(255,255,255,.35)';
        ctx.lineWidth = 1.2;
        ctx.setLineDash([6, 6]);
        ctx.beginPath();
        ctx.moveTo(qx + zoneW, zoneTop);
        ctx.lineTo(qx + zoneW, zoneBot);
        ctx.stroke();
        ctx.setLineDash([]);
        // 顶部候选人名字胶囊
        var lbl = opts[qi].label || ('#' + (qi + 1));
        ctx.font = '700 ' + Math.round(12 * s2) + 'px sans-serif';
        var lw = ctx.measureText(lbl).width;
        var pillW = lw + 20 * s2, pillH = 24 * s2;
        var pillX = qx + (zoneW - pillW) / 2, pillY = zoneTop + 8 * s2;
        UI.fillRound(pillX, pillY, pillW, pillH, pillH / 2, COLORS[qi % 4]);
        UI.strokeRound(pillX, pillY, pillW, pillH, pillH / 2, '#ffffff', Math.max(1, s2));
        UI.text(lbl, pillX + pillW / 2, pillY + pillH * 0.72,
                '700 ' + Math.round(12 * s2) + 'px sans-serif', '#ffffff', 'center');
        // 中间大手指提示
        var fingerY = zoneTop + zoneH / 2;
        UI.text('👆', qx + zoneW / 2, fingerY,
                '700 ' + Math.round(28 * s2) + 'px sans-serif', '#ffffff', 'center');
        UI.text('点她', qx + zoneW / 2, fingerY + 22 * s2,
                '600 ' + Math.round(11 * s2) + 'px sans-serif', 'rgba(255,255,255,.85)', 'center');
        // 热区
        UI.push(qx, zoneTop - 24 * s2, zoneW, zoneH + 24 * s2, 'silhouette:' + qi);
      }
      // 字幕（不带按钮，只显示旁白）
      return UI.caption(st.caption.who, st.caption.text, chars, bottom);
    }

    if (ui.type === 'confirm' || ui.type === 'continue') {
      // ═══ Figma 442:9623：字幕卡 392×96，「点击继续」在卡内右下 ═══
      //   442:9685 卡 12+2×20+[8+24]+12 = 96
      //   442:9687 按钮 78×24 r28 #000@20%
      var cTop = UI.caption(st.caption.who, st.caption.text, chars, bottom, UI.capContinue());
      return cTop;
    }

    if (ui.type === 'support') {
      // ═══ Figma 442:9973：字幕卡 392×152，四选一按钮在卡内 ═══
      //   442:10056 提问行 14px/500 #FBCBFF
      //   442:10040 等 4×(90×48) r12 #790574CC + inset glow，间距 4
      var sOpts = (ui.options || []).map(function (o) {
        var cand = Story.candidates[o.value];
        return {
          label: cand ? cand.short : o.label,
          cost: o.starCost || 0,
          disabled: o.starCost ? !Model.canAfford(o.starCost) : false,
          locked: o.starCost ? !Model.canAfford(o.starCost) : false   // v1.0.13 星光不足触发弹窗
        };
      });
      return UI.caption(st.caption.who, st.caption.text, chars, bottom,
                        UI.capOptions(ui.prompt || null, sOpts, 'support'));
    }

    if (ui.type === 'branch') {
      // ═══ Figma 442:9848：字幕卡内四选一（442:9957/9961/9965/9969）═══
      //   按钮 90×48 r12 #790574CC + inset glow；标签 11px/500 + 价格 8px/600 #FFDC90
      //   剧本 label 把价格写进了文案（如「干杯 ×10（30 星光）」），
      //   设计稿是标签/价格分两行，故剥掉括号段，价格改用 gift 折算值。
      //   若剧本显式给了 sub（对齐 497:25283 / 497:24541 的原文副标题），优先用 sub。
      var opts = (ui.options || []).map(function (o) {
        var cost = 0;
        if (o.gift) { var g = Model.gift(o.gift); cost = g ? g.cost * (o.count || 1) : 0; }
        var afford = cost === 0 || Model.canAfford(cost);
        var label = String(o.label).replace(/（[^）]*）|\([^)]*\)/g, '').trim();
        // 广告补给类选项：次数用完后禁用，避免玩家在补给页与终局间反复循环
        if (o.requiresAd && !Model.canWatchAd()) {
          return { label: label, sub: o.sub || '', cost: 0, disabled: true };
        }
        return { label: label, sub: o.sub || '', cost: cost,
                 disabled: !afford, locked: !afford };
      });
      // 无 ui.prompt 时（如 shot-06），旁白本身就是那句提问，
      // 按 442:9955 呈现为提问行（#FBCBFF）而非白色正文，卡高 100。
      var bBody = ui.prompt ? st.caption.text : null;
      var bPrompt = ui.prompt || (chars == null ? st.caption.text
                                 : String(st.caption.text || '').substring(0, chars));
      return UI.caption(st.caption.who, bBody, chars, bottom,
                        UI.capOptions(bPrompt || null, opts, 'branch'));
    }

    if (ui.type === 'rewarded-ad') {
      // 改为卡内按钮（Figma 497:25283 同规格），不再用悬浮 optionPanel
      var adOpts = [
        { label: '看广告补给', sub: '+' + (ui.reward || 300) + '星光',
          disabled: !Model.canWatchAd() },
        { label: '返回对局',   sub: '不用补给' }
      ];
      var adTop = UI.caption(st.caption.who, st.caption.text, chars, bottom,
                             UI.capOptions('星光补给：', adOpts, 'ad'));
      var zones = UI.hitZones();
      for (var z = 0; z < zones.length; z++) {
        if (zones[z].action === 'ad:0') zones[z].action = 'ad_watch';
        if (zones[z].action === 'ad:1') zones[z].action = 'ad_skip';
      }
      return adTop;
    }

    if (ui.type === 'outfit-hub' && !st.pending) {
      var supportId=Model.getSupport(),roomIds=ui.candidates.filter(function(id){return id!==supportId;}),roomOpts=roomIds.map(function(id){return {label:'解锁 '+Story.candidates[id].short+' 化妆间',sub:M3.Config.OUTFIT_UNLOCK_COST+' 星光 · 可选',disabled:!!st.outfitDone[id]};});
      roomOpts.push({label:'定装完成，给老板展示',sub:'其他候选人可以不选'});
      var hubTop=UI.optionPanel('是否继续解锁其他化妆间？','你 all in 的候选人已经完成定装',roomOpts,'room',bottom),hubZones=UI.hitZones();
      for(var hz=0;hz<hubZones.length;hz++)if(hubZones[hz].action.indexOf('room:')===0){var hi=+hubZones[hz].action.slice(5);hubZones[hz].action=hi<roomIds.length?'room:'+roomIds[hi]:'room:skip';}
      return UI.caption(st.caption.who,st.caption.text,chars,hubTop-6);
    }

    if (ui.type === 'outfit' || ui.type === 'outfit-all' || ui.type === 'outfit-dynamic' || (ui.type === 'outfit-hub' && st.pending)) {
      var p = st.pending;
      if (!p) return UI.caption(st.caption.who, st.caption.text, chars, bottom);
      // 452:13015 弹窗展示中（或三件已选完）→ 弹窗接管交互，此处只留播报卡 452:13094。
      // 否则 nextSlot 已把 slotIdx 前移，会把「下一件」的选项面板画在弹窗底下。
      if (p.slotIdx >= p.slots.length || (st.outfitPreview && st.outfitPreview.image)) {
        return UI.caption(st.caption.who, st.caption.text, chars, bottom);
      }
      var slot = p.slots[p.slotIdx];
      var list = Story.outfits[p.who][slot] || [];
      var cand = Story.candidates[p.who];
      var oOpts = list.map(function (it) {
        var cost = 0;
        if (it.gift) { var g = Model.gift(it.gift); cost = g ? g.cost * (it.count || 1) : 0; }
        cost=(cost||it.cost)?(cost||it.cost)*10:M3.Config.OUTFIT_COST[slot];
        if(p.who!==Model.getSupport())cost=Math.min(M3.Config.STAR_MAX,Math.round(cost*M3.Config.OTHER_ROOM_MULT));
        return { label: it.label, sub: st.outfitSpeaking?'角色回应中…':cost + ' 星光'+(p.who!==Model.getSupport()?' · 其他化妆间加价':''), disabled: st.outfitSpeaking||!Model.canAfford(cost) };
      });
      var title = cand.short + ' · 选' + slotCn(slot);
      var sub = '第 ' + (p.whoIdx + 1) + '/' + p.queue.length + ' 位 · ' + (p.slotIdx + 1) + '/' + p.slots.length + ' 项';
      var t3 = UI.optionPanel(title, sub, oOpts, 'pick', bottom);
      return UI.caption(st.caption.who, st.caption.text, chars, t3 - 6);
    }

    if (ui.type === 'game-pick') {
      if(st.gameResultReady){
        var gameTop=UI.optionPanel('回放结束','本轮结果已计入实时排名',[{label:'继续下一个考核 ▸'}],'game_result',bottom);
        var gameZones=UI.hitZones();
        for(var gz=0;gz<gameZones.length;gz++)if(gameZones[gz].action==='game_result:0')gameZones[gz].action='game_continue';
        return UI.caption(st.caption.who,st.caption.text,chars,gameTop-6);
      }
      var support=Model.getSupport()||Model.ranking()[0].id,ranking=Model.ranking(),last=ranking[ranking.length-1].id;
      var dynamicTitle=ui.title;
      if(ui.game==='split-rps')dynamicTitle='为 '+Story.candidates[support].short+' 选择对手';
      if(ui.game==='benefit')dynamicTitle='第一名 '+Story.candidates[ranking[0].id].short+' 抽福利卡';
      var gOpts = ui.options.map(function (o) { return { label: o, disabled:st.gameLocked||(ui.game==='split-rps'&&o===Story.candidates[support].short), sub:st.gameLocked?'回放中…':ui.game==='benefit'?'第四名 '+Story.candidates[last].short:'' }; });
      // 卡内按钮（Figma 497:25378）：旁白 → 提示行 → 3 按钮，宽度由 capOptions 按个数动算
      return UI.caption(st.caption.who, st.caption.text, chars, bottom,
                        UI.capOptions(dynamicTitle, gOpts, 'pick'));
    }

    if (ui.type === 'game-multi') {
      if(st.gameResultReady){
        var multiTop=UI.optionPanel('回放结束','本轮结果已计入实时排名',[{label:'继续下一个考核 ▸'}],'game_result',bottom);
        var multiZones=UI.hitZones();
        for(var mz=0;mz<multiZones.length;mz++)if(multiZones[mz].action==='game_result:0')multiZones[mz].action='game_continue';
        return UI.caption(st.caption.who,st.caption.text,chars,multiTop-6);
      }
      // 字母格改为字幕卡附加区（Figma 497:24561），与三选一同构
      var pm = st.pending || { picked: [] };
      return UI.caption(st.caption.who, st.caption.text, chars, bottom,
                        UI.capLetters('选择' + ui.pick + '个字母', ui.options,
                                      pm.picked, ui.pick, 'multi'));
    }

    return UI.caption(st.caption.who, st.caption.text, chars, bottom);
  }

  function slotCn(s) { return s === 'accessory' ? '装饰' : s === 'clothes' ? '服装' : '道具'; }

  function outfitItem(id,slot){var picked=Model.getOutfit(id)[slot],list=Story.outfits[id][slot]||[];if(!picked)return null;for(var i=0;i<list.length;i++)if(list[i].label===picked)return list[i];return null;}
  function coverImage(im,x,y,w,h){if(!im||!im.width)return;var s=Math.max(w/im.width,h/im.height),dw=im.width*s,dh=im.height*s;try{ctx.drawImage(im,x+(w-dw)/2,y+(h-dh)/2,dw,dh);}catch(e){}}
  // 定装立绘 / 组合定装照 / 游戏结果均为独立弹层，在 HUD 之上绘制（见 drawLive ⑥）

  // ═══ 游戏结果弹窗 ═══
  //   原实现是贴在图层上的半屏面板（scrim + 手绘框 + emoji），底层礼物面板会透出来。
  //   现改为与定装弹窗同一套逻辑：整屏遮罩 → 底部全黑 → 文案卡 → 继续按钮。
  function drawGameFxModal(st) {
    var fx = st.gameFx, W = UI.W, H = UI.H, ps = W / DW;
    var age = Date.now() - fx.t0;

    // ① 整屏遮罩 + 吞点击
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,.72)'; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#000000'; ctx.fillRect(0, H - 189 * ps, W, 189 * ps);
    ctx.restore();
    UI.push(0, 0, W, H, 'noop');

    // ② 主视觉：入场轻微放大
    var pop = age < 260 ? 0.86 + 0.14 * (age / 260) : 1;
    var icon = fx.game === 'human-bar'
                 ? (fx.label === '飞吻' ? '💋' : fx.label === 'S 造型' ? '〰️' : '🐓')
                 : fx.game === 'body-letter' ? '🔤'
                 : fx.game === 'split-rps'   ? '✊'
                 : fx.game === 'benefit'     ? '🎴'
                 : fx.game === 'rival-surge' ? '🌌' : '✨';
    ctx.save();
    ctx.translate(W / 2, H * 0.40);
    ctx.scale(pop, pop);
    UI.text(icon, 0, 0, '900 ' + Math.round(72 * ps) + 'px sans-serif', '#fff', 'center');
    ctx.restore();
    UI.text(fx.label, W / 2, H * 0.40 + 62 * ps,
            '700 ' + Math.round(22 * ps) + 'px sans-serif', '#FFFFFF', 'center');

    // ③ 继续按钮 + 文案卡（与定装弹窗同规格）
    var sheetTop = UI.continueBtn('继续 ▸', H - 32 * ps);
    var copy = fx.game === 'human-bar'   ? '障碍造型已切换，候选人开始挑战。'
             : fx.game === 'body-letter' ? '字母舞台亮起，候选人按选择依次摆造型。'
             : fx.game === 'split-rps'   ? '猜拳开始，脚尖距离正在推进。'
             : fx.game === 'benefit'     ? '福利归第一名，第四名进入惩罚轮盘。'
             : fx.game === 'rival-surge' ? (fx.detail || '') + '，实时榜已更新。'
             : '本轮结果已计入实时排名。';
    UI.caption('老板助理', copy, null, sheetTop - 38 * ps);
  }

  // ═══ 定装弹窗（Figma 452:12978）═══
  //   独立弹层：遮罩压暗 HUD → 立绘 452:13087 → 播报卡 452:13094 → 双按钮 452:13091/13088
  //   两种用法共用同一外壳：
  //     单件定装 st.outfitPreview      → 一张立绘
  //     组合定装照 nd.outfitReveal     → 三件并排（饰品/服装/道具）
  function outfitModalShell(drawBody, who, line) {
    var W = UI.W, H = UI.H, ps = W / DW;

    // ① 遮罩：整屏压暗聚焦定装照
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,.72)';
    ctx.fillRect(0, 0, W, H);
    // 弹窗区（按钮行上沿以下）铺纯黑：.72 半透明仍会透出底层礼物面板/星光轮廓，
    // 定装态下这块应完全黑掉，只留双按钮。
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, H - 189 * ps, W, 189 * ps);
    ctx.restore();
    // 吞掉遮罩范围内的点击，避免穿透到底层 HUD（如 topBar 静音钮）
    UI.push(0, 0, W, H, 'noop');

    // ② 图像区（设计稿立绘框 83,159 248×442）
    drawBody(ps);

    // ③ 双按钮 452:13091/13088（按钮以下保持全黑，不画常态礼物面板）
    var sheetTop = UI.outfitSheet();

    // ④ 播报卡 452:13094：单行 44 高，底边 669（弹窗顶 707，间距 38）
    UI.caption(who, line, null, sheetTop - 38 * ps);
  }

  // 单件定装：立绘 452:13087  83,159 248×442 r16
  function drawOutfitModal(st) {
    var p = st.outfitPreview;
    outfitModalShell(function (ps) {
      var ix = 83 * ps, iy = 159 * ps, iw = 248 * ps, ih = 442 * ps;
      ctx.save();
      UI.roundRect(ix, iy, iw, ih, 16 * ps);
      ctx.clip();
      coverImage(p.image, ix, iy, iw, ih);
      ctx.restore();
    }, Story.candidates[p.who].short, '已经换上「' + p.label + '」，选择已加入定装。');
  }

  // 组合定装照：三件并排，整体占用与单件立绘同一区域（83..331 → 159..601）
  function drawRevealModal(st) {
    var who = Model.getSupport() || Model.ranking()[0].id;
    var slots = ['accessory', 'clothes', 'prop'], names = ['饰品', '服装', '道具'];
    outfitModalShell(function (ps) {
      // 三格铺满设计稿立绘框宽度：单件 248 太窄，这里放宽到 11..403（与字幕卡同宽）
      var x0 = 11 * ps, totalW = 392 * ps, gap = 8 * ps;
      var cw = (totalW - gap * 2) / 3;
      var iy = 159 * ps, ih = 442 * ps, labelH = 40 * ps;
      for (var i = 0; i < slots.length; i++) {
        var item = outfitItem(who, slots[i]);
        var im = item && L.getImage(item.media);
        if (item && !im) L.loadImage(item.media, function () {});
        var x = x0 + i * (cw + gap);
        UI.fillRound(x, iy, cw, ih, 12 * ps, 'rgba(12,8,20,.88)');
        if (im) {
          ctx.save();
          UI.roundRect(x + 2 * ps, iy + 2 * ps, cw - 4 * ps, ih - labelH, 10 * ps);
          ctx.clip();
          coverImage(im, x + 2 * ps, iy + 2 * ps, cw - 4 * ps, ih - labelH);
          ctx.restore();
        }
        UI.text(names[i], x + cw / 2, iy + ih - 24 * ps,
                '500 ' + Math.round(10 * ps) + 'px sans-serif', CO.sub, 'center');
        UI.text(item ? item.label : '未选择', x + cw / 2, iy + ih - 9 * ps,
                '600 ' + Math.round(11 * ps) + 'px sans-serif', item ? CO.gold : '#777', 'center');
      }
    }, Story.candidates[who].short, '三件装备已组合成完整造型，定装完成。');
  }

  // ═══ 结局：今日店长诞生（Figma 506:30729 / 497:24411 / 497:26830 / 497:26889）═══
  //   四个节点是同一套模板，仅冠军名不同 → 一份实现 + 冠军变量
  //   设计画布 414×896：标题区顶部锚定，台词卡/排行表/双按钮底部锚定
  var IM_ENDING_BG = 'media/live/ending-bg.png';
  function drawEnding(st) {
    var W = UI.W, H = UI.H, s = W / DW;
    // 设计稿底部锚定：ey(896) === H
    function ey(d) { return H - (896 - d) * s; }

    var rk = Model.ranking();
    var champ = rk[0];
    var cand = Story.candidates[champ.id];
    var ed = Story.endings[champ.id] || { title: '今日店长', text: '' };

    // ① 背景 506:30730 整屏铺满（视频结局帧仍在下层保留）
    var bg = L.getImage(IM_ENDING_BG);
    if (!bg) L.loadImage(IM_ENDING_BG, function () {});
    if (bg) coverImage(bg, 0, 0, W, H);
    else if (!st.video) {
      ctx.fillStyle = UI.vGradient(0, 0, H, [[0, '#3a2008'], [0.5, '#1a0f18'], [1, '#08040e']]);
      ctx.fillRect(0, 0, W, H);
    }

    // ② 顶部蒙版 506:30732  0,0 414×271  linear-gradient(180deg,#0c001dad,#1b003e00 50%)
    var tg = ctx.createLinearGradient(0, 0, 0, 271 * s);
    tg.addColorStop(0, 'rgba(12,0,29,.68)');
    tg.addColorStop(0.5, 'rgba(27,0,62,0)');
    ctx.fillStyle = tg; ctx.fillRect(0, 0, W, 271 * s);

    // ③ 底部蒙版 506:30731  0,524 414×372  linear-gradient(180deg,#1b003e00,#0c001db2 47.34%)
    var bgY = ey(524);
    var bgGrad = ctx.createLinearGradient(0, bgY, 0, H);
    bgGrad.addColorStop(0, 'rgba(27,0,62,0)');
    bgGrad.addColorStop(0.4734, 'rgba(12,0,29,.70)');
    bgGrad.addColorStop(1, 'rgba(12,0,29,.70)');
    ctx.fillStyle = bgGrad; ctx.fillRect(0, bgY, W, H - bgY);

    // ④ 标题 506:30754「今日店长诞生」36px/400，渐变文字 99.97deg #fff → #f0a7ff
    //    Canvas 无 backgroundClip:text，用横向渐变直接填充文字
    var tf = '400 ' + Math.round(36 * s) + 'px sans-serif';
    var tGrad = ctx.createLinearGradient(99 * s, 0, 315 * s, 0);
    tGrad.addColorStop(0, '#ffffff');
    tGrad.addColorStop(1, '#f0a7ff');
    ctx.save();
    ctx.font = tf; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = tGrad;
    ctx.fillText('今日店长诞生', W / 2, UI.dTop(130, s) + 30 * s);
    ctx.restore();

    // ⑤ 冠军名 506:30753「驻唱·可可」24px/500 #fff：short + 名
    var given = (cand.name.split('·')[1] || cand.name);
    UI.text(cand.short + '·' + given, W / 2, UI.dTop(179, s) + 24 * s,
            '500 ' + Math.round(24 * s) + 'px sans-serif', '#FFFFFF', 'center');

    // ⑥ 排行表 506:30759  11,570 392×178  #47003FCC r12 + inset glow
    var rpX = 11 * s, rpY = ey(570), rpW = 392 * s, rpH = 178 * s;
    UI.fillRound(rpX, rpY, rpW, rpH, 12 * s, 'rgba(71,0,63,.80)');
    UI.innerGlow(rpX, rpY, rpW, rpH, 12 * s, 'rgba(223,13,255,.30)');
    // 表头 506:30795/96/97：三列中心 66 / 207 / 351，14px/400 #fff @ .8
    var hf = '400 ' + Math.round(14 * s) + 'px sans-serif';
    var CX = [66 * s, 207 * s, 351 * s];
    ctx.globalAlpha = 0.8;
    UI.text('排名', CX[0], ey(588) + 5 * s, hf, '#FFFFFF', 'center');
    UI.text('角色', CX[1], ey(588) + 5 * s, hf, '#FFFFFF', 'center');
    UI.text('票数', CX[2], ey(588) + 5 * s, hf, '#FFFFFF', 'center');
    ctx.globalAlpha = 1;
    // 四行：中心 623 / 657 / 691 / 725（步长 34），配色沿用名次色 RANK_NO_COLOR
    for (var k = 0; k < Math.min(rk.length, 4); k++) {
      var it = rk[k], rcy = ey(623 + k * 34);
      var col = ['#FDEA9C', '#DDECFF', '#F6AD8B', '#FFCEFB'][k];
      // 第一名高亮条 506:30762  12,606 390×34  linear-gradient(90deg,#d0f,#d0f0)
      if (k === 0) {
        var hg = ctx.createLinearGradient(12 * s, 0, 402 * s, 0);
        hg.addColorStop(0, 'rgba(221,0,255,1)');
        hg.addColorStop(1, 'rgba(221,0,255,0)');
        ctx.fillStyle = hg;
        ctx.fillRect(12 * s, rcy - 17 * s, 390 * s, 34 * s);
      }
      UI.text('TOP' + (k + 1), CX[0], rcy + 6 * s,
              '700 ' + Math.round(16 * s) + 'px sans-serif', col, 'center');
      UI.text(Story.candidates[it.id].short, CX[1], rcy + 5 * s,
              '500 ' + Math.round(14 * s) + 'px sans-serif', col, 'center');
      UI.text(String(it.votes), CX[2], rcy + 5 * s,
              '400 ' + Math.round(14 * s) + 'px sans-serif', col, 'center');
    }

    // ⑦ 台词卡 506:30755  11,466 392×92（底边 558）#47003FCC r12 + inset glow
    //    正文行数可能多于设计稿 2 行 → 卡片保持底边不动、向上生长，避免截断台词
    var cf = '400 ' + Math.round(14 * s) + 'px sans-serif';
    var lines = UI.wrap(ed.text, 350 * s, cf);
    var cardH = (12 + 20 + 4) * s + lines.length * 20 * s + 16 * s;
    var cX = 11 * s, cW = 392 * s, cY = ey(558) - cardH;
    UI.fillRound(cX, cY, cW, cardH, 12 * s, 'rgba(71,0,63,.80)');
    UI.innerGlow(cX, cY, cW, cardH, 12 * s, 'rgba(223,13,255,.30)');
    // 首行 506:30757「老板，<结局标题>」14px/500 #FBCBFF
    UI.text('老板，' + ed.title, cX + 16 * s, cY + 12 * s + 14 * s,
            '500 ' + Math.round(14 * s) + 'px sans-serif', '#FBCBFF');
    // 正文 506:30758 14px/400 #fff，行高 20
    for (var i = 0; i < lines.length; i++) {
      UI.text(lines[i], cX + 16 * s, cY + (12 + 20 + 4) * s + (i * 20 + 14) * s, cf, '#FFFFFF');
    }

    // ⑧ 双按钮 y=772 h=64：分享战绩 506:30750 (38,160×64 r47)｜再来一局 506:30747 (216,160×64 r34)
    var byy = ey(772), bh = 64 * s, bw = 160 * s;
    var bf = '600 ' + Math.round(20 * s) + 'px sans-serif';
    UI.fillRound(38 * s, byy, bw, bh, 47 * s, 'rgba(71,0,63,.80)');
    UI.innerGlow(38 * s, byy, bw, bh, 47 * s, 'rgba(223,13,255,.30)');
    UI.text('分享战绩', 38 * s + bw / 2, byy + bh / 2 + 7 * s, bf, '#FFFFFF', 'center');
    UI.push(38 * s, byy, bw, bh, 'share');

    var b2x = 216 * s;
    var g2 = ctx.createLinearGradient(b2x, byy + bh, b2x + bw, byy);
    g2.addColorStop(0, '#ff0fac');
    g2.addColorStop(0.5144, '#7118ff');
    g2.addColorStop(1, '#001eff');
    ctx.fillStyle = g2; UI.roundRect(b2x, byy, bw, bh, 34 * s); ctx.fill();
    UI.innerGlow(b2x, byy, bw, bh, 34 * s, 'rgba(255,255,255,.62)');
    UI.text('再来一局', b2x + bw / 2, byy + bh / 2 + 7 * s, bf, '#FFFFFF', 'center');
    UI.push(b2x, byy, bw, bh, 'restart');

    // 结局屏也可能触发广告 loading（若通过弹窗看广告）
    if (st.adLoading) UI.loading('广告正在加载中…');

    UI.toast(st.toasts);
  }

  M3.Render = { bind: bind, draw: draw };
})();
