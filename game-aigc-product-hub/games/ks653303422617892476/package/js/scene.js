/**
 * scene.js — 换装匹配关卡数据层
 *
 * 职责：
 *   1. 定义每个关卡的所有「问题」（场景 + 4 套衣服选项 + 正确答案索引）
 *   2. 程序化绘制：场景背景、人物立绘占位、衣服预览叠加、选项卡缩略图
 *   3. 预留 imageProvider 接口，接入真实立绘图片时直接替换
 *
 * 数据结构：
 *   Level  { id, name, questions: Question[] }
 *   Question {
 *     dialog     : string          — 人物对话
 *     options    : Outfit[4]       — 4 套衣服
 *     answer     : 0~3             — 正确答案索引
 *     sceneKey   : string          — 场景背景标识
 *     characterKey: string         — 人物标识
 *   }
 *   Outfit {
 *     label   : string             — 衣服名称
 *     color   : string             — 主色（程序化绘制用）
 *     accent  : string             — 辅色
 *     type    : 'apron'|'dress'|'casual'|'formal'|'sportswear'|...
 *   }
 *
 * 图片接口（imageProvider）：
 *   M3.Scene.setImageProvider({
 *     getCharacter : function(levelId, qIdx) { return HTMLImageElement; },
 *     getOutfitOverlay : function(levelId, qIdx, optionIdx) { return HTMLImageElement; },
 *     getScene     : function(sceneKey) { return HTMLImageElement; },
 *     getOutfitThumb : function(levelId, qIdx, optionIdx) { return HTMLImageElement; },
 *   });
 */
(function () {
  var M3 = window.M3 = window.M3 || {};
  M3.Scene = M3.Scene || {};

  // ── 图片素材接口（占位） ──────────────────────────────────────────────────
  var _imageProvider = null;
  M3.Scene.setImageProvider = function (p) { _imageProvider = p; };

  // ─────────────────────────────────────────────────────────────────────────
  // 程序化绘图工具
  // ─────────────────────────────────────────────────────────────────────────

  function roundRect(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y,     x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x,     y + h, r);
    ctx.arcTo(x,     y + h, x,     y,     r);
    ctx.arcTo(x,     y,     x + w, y,     r);
    ctx.closePath();
  }

  /** 绘制厨房场景背景 */
  function drawSceneKitchen(ctx, x, y, w, h) {
    // 背景墙
    var wallGrad = ctx.createLinearGradient(x, y, x, y + h * 0.65);
    wallGrad.addColorStop(0, '#e8e0d0');
    wallGrad.addColorStop(1, '#d4c8b0');
    ctx.fillStyle = wallGrad;
    ctx.fillRect(x, y, w, h);

    // 地板
    ctx.fillStyle = '#c0a870';
    ctx.fillRect(x, y + h * 0.65, w, h * 0.35);
    // 地板砖缝
    ctx.strokeStyle = '#b09060';
    ctx.lineWidth = 1;
    for (var i = 0; i <= 6; i++) {
      ctx.beginPath();
      ctx.moveTo(x + i * w / 6, y + h * 0.65);
      ctx.lineTo(x + i * w / 6, y + h);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(x, y + h * 0.80);
    ctx.lineTo(x + w, y + h * 0.80);
    ctx.stroke();

    // 橱柜（上方，深色）
    ctx.fillStyle = '#3a2a18';
    ctx.fillRect(x, y, w, h * 0.10);
    // 橱柜门缝
    ctx.strokeStyle = '#5a4028';
    ctx.lineWidth = 2;
    for (var c = 0; c < 4; c++) {
      roundRect(ctx, x + c * w / 4 + 4, y + 4, w / 4 - 8, h * 0.10 - 8, 3);
      ctx.stroke();
    }

    // 烤箱（中间大块）
    ctx.fillStyle = '#2a2a2a';
    roundRect(ctx, x + w * 0.15, y + h * 0.25, w * 0.70, h * 0.35, 4);
    ctx.fill();
    // 烤箱玻璃
    ctx.fillStyle = '#1a3a5a';
    roundRect(ctx, x + w * 0.18, y + h * 0.27, w * 0.64, h * 0.30, 3);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    roundRect(ctx, x + w * 0.18, y + h * 0.27, w * 0.64, h * 0.08, 3);
    ctx.fill();

    // 操作台
    ctx.fillStyle = '#f0e8d8';
    ctx.fillRect(x, y + h * 0.60, w, h * 0.06);
    // 台面高光
    ctx.fillStyle = 'rgba(255,255,255,0.30)';
    ctx.fillRect(x, y + h * 0.60, w, h * 0.015);

    // 烘焙道具（烤盘 + 甜甜圈轮廓）
    ctx.fillStyle = '#8a7060';
    ctx.fillRect(x + w * 0.05, y + h * 0.57, w * 0.42, h * 0.04);
    // 甜甜圈
    for (var d = 0; d < 3; d++) {
      ctx.fillStyle = ['#d4703a', '#e89060', '#c45030'][d];
      ctx.beginPath();
      ctx.arc(x + w * (0.10 + d * 0.14), y + h * 0.56, h * 0.025, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#f8e0c0';
      ctx.beginPath();
      ctx.arc(x + w * (0.10 + d * 0.14), y + h * 0.56, h * 0.010, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  /** 绘制客厅场景 */
  function drawSceneLiving(ctx, x, y, w, h) {
    // 暖色背景
    ctx.fillStyle = '#f0e0c8';
    ctx.fillRect(x, y, w, h);
    // 地板
    ctx.fillStyle = '#c8a870';
    ctx.fillRect(x, y + h * 0.68, w, h * 0.32);
    // 沙发
    ctx.fillStyle = '#8b5030';
    roundRect(ctx, x + w * 0.1, y + h * 0.55, w * 0.80, h * 0.16, 8);
    ctx.fill();
    ctx.fillStyle = '#a06040';
    roundRect(ctx, x + w * 0.12, y + h * 0.47, w * 0.76, h * 0.10, 6);
    ctx.fill();
    // 背景窗
    ctx.fillStyle = '#b8d8f8';
    roundRect(ctx, x + w * 0.30, y + h * 0.08, w * 0.40, h * 0.28, 4);
    ctx.fill();
    ctx.strokeStyle = '#8a7060';
    ctx.lineWidth = 3;
    roundRect(ctx, x + w * 0.30, y + h * 0.08, w * 0.40, h * 0.28, 4);
    ctx.stroke();
  }

  /** 绘制人物身体（站姿占位，接入真实图片后替换） */
  function drawCharacter(ctx, x, y, w, h, outfit) {
    var cx   = x + w / 2;
    // 身体比例
    var headR = h * 0.082;
    var headY = y + h * 0.06;
    var bodyTop = headY + headR * 2;
    var bodyH   = h * 0.30;
    var bodyW   = w * 0.36;
    var legH    = h * 0.28;
    var footY   = y + h * 0.98;

    // ── 腿 ──────────────────────────────────────────────────────────────
    ctx.fillStyle = outfit ? outfit.legColor || '#f5c898' : '#f5c898';
    ctx.fillRect(cx - bodyW * 0.38, bodyTop + bodyH, bodyW * 0.34, legH);
    ctx.fillRect(cx + bodyW * 0.04, bodyTop + bodyH, bodyW * 0.34, legH);
    // 鞋
    ctx.fillStyle = outfit ? outfit.shoeColor || '#3a2a10' : '#3a2a10';
    ctx.fillRect(cx - bodyW * 0.42, footY - h * 0.04, bodyW * 0.42, h * 0.04);
    ctx.fillRect(cx + bodyW * 0.00, footY - h * 0.04, bodyW * 0.42, h * 0.04);

    // ── 躯干（衣服主色） ─────────────────────────────────────────────────
    var clothColor  = outfit ? outfit.color  : '#e8e8e8';
    var clothAccent = outfit ? outfit.accent : '#c0c0c0';
    ctx.fillStyle = clothColor;
    roundRect(ctx, cx - bodyW / 2, bodyTop, bodyW, bodyH, 6);
    ctx.fill();

    // 衣服细节（根据 type 不同画法）
    var type = outfit ? outfit.type : 'casual';
    if (type === 'apron') {
      // 围裙
      ctx.fillStyle = clothAccent;
      roundRect(ctx, cx - bodyW * 0.30, bodyTop + bodyH * 0.18, bodyW * 0.60, bodyH * 0.72, 4);
      ctx.fill();
      // 围裙带
      ctx.strokeStyle = clothAccent;
      ctx.lineWidth = h * 0.012;
      ctx.beginPath();
      ctx.moveTo(cx - bodyW * 0.28, bodyTop + bodyH * 0.18);
      ctx.lineTo(cx - bodyW * 0.16, bodyTop);
      ctx.moveTo(cx + bodyW * 0.28, bodyTop + bodyH * 0.18);
      ctx.lineTo(cx + bodyW * 0.16, bodyTop);
      ctx.stroke();
    } else if (type === 'formal') {
      // 西装领
      ctx.fillStyle = clothAccent;
      ctx.beginPath();
      ctx.moveTo(cx, bodyTop + bodyH * 0.10);
      ctx.lineTo(cx - bodyW * 0.15, bodyTop);
      ctx.lineTo(cx - bodyW * 0.50, bodyTop + bodyH * 0.28);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(cx, bodyTop + bodyH * 0.10);
      ctx.lineTo(cx + bodyW * 0.15, bodyTop);
      ctx.lineTo(cx + bodyW * 0.50, bodyTop + bodyH * 0.28);
      ctx.closePath();
      ctx.fill();
    } else if (type === 'sportswear') {
      // 运动条纹
      ctx.fillStyle = clothAccent;
      ctx.fillRect(cx - bodyW * 0.50, bodyTop + bodyH * 0.20, bodyW * 0.12, bodyH * 0.70);
      ctx.fillRect(cx + bodyW * 0.38, bodyTop + bodyH * 0.20, bodyW * 0.12, bodyH * 0.70);
    } else if (type === 'dress') {
      // 裙摆（延伸到腿）
      ctx.fillStyle = clothColor;
      ctx.beginPath();
      ctx.moveTo(cx - bodyW * 0.52, bodyTop + bodyH);
      ctx.lineTo(cx + bodyW * 0.52, bodyTop + bodyH);
      ctx.lineTo(cx + bodyW * 0.72, bodyTop + bodyH + legH * 0.55);
      ctx.lineTo(cx - bodyW * 0.72, bodyTop + bodyH + legH * 0.55);
      ctx.closePath();
      ctx.fill();
    }

    // ── 手臂 ─────────────────────────────────────────────────────────────
    ctx.fillStyle = '#f5c898';
    // 左臂
    ctx.beginPath();
    ctx.ellipse(cx - bodyW * 0.62, bodyTop + bodyH * 0.35, bodyW * 0.12, bodyH * 0.38, -0.2, 0, Math.PI * 2);
    ctx.fill();
    // 右臂（拿物）
    ctx.beginPath();
    ctx.ellipse(cx + bodyW * 0.62, bodyTop + bodyH * 0.30, bodyW * 0.12, bodyH * 0.36, 0.2, 0, Math.PI * 2);
    ctx.fill();

    // 右手草莓烘焙手套（厨房场景特有）
    if (type === 'apron' || !outfit) {
      ctx.fillStyle = '#d04040';
      ctx.beginPath();
      ctx.ellipse(cx + bodyW * 0.68, bodyTop + bodyH * 0.08, bodyW * 0.22, bodyH * 0.22, 0.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#f8d8d8';
      for (var s = 0; s < 6; s++) {
        var sa = s / 6 * Math.PI * 2;
        ctx.beginPath();
        ctx.arc(cx + bodyW * 0.68 + Math.cos(sa) * bodyW * 0.14, bodyTop + bodyH * 0.08 + Math.sin(sa) * bodyH * 0.14, h * 0.012, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // ── 头部 ─────────────────────────────────────────────────────────────
    ctx.fillStyle = '#f5c898';
    ctx.beginPath();
    ctx.arc(cx, headY, headR, 0, Math.PI * 2);
    ctx.fill();
    // 头发（长发）
    ctx.fillStyle = '#2a1a0a';
    ctx.beginPath();
    ctx.arc(cx, headY, headR, Math.PI, 0);
    ctx.fill();
    // 长发两侧
    ctx.beginPath();
    ctx.moveTo(cx - headR, headY);
    ctx.quadraticCurveTo(cx - headR * 1.8, headY + headR * 3, cx - headR * 0.8, bodyTop + bodyH * 0.6);
    ctx.lineTo(cx - headR * 0.4, bodyTop + bodyH * 0.5);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(cx + headR, headY);
    ctx.quadraticCurveTo(cx + headR * 1.8, headY + headR * 3, cx + headR * 0.8, bodyTop + bodyH * 0.6);
    ctx.lineTo(cx + headR * 0.4, bodyTop + bodyH * 0.5);
    ctx.closePath();
    ctx.fill();
    // 猫耳（装饰）
    ctx.fillStyle = '#2a1a0a';
    ctx.beginPath();
    ctx.moveTo(cx - headR * 0.4, headY - headR * 0.8);
    ctx.lineTo(cx - headR * 0.9, headY - headR * 1.8);
    ctx.lineTo(cx - headR * 0.1, headY - headR * 1.2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(cx + headR * 0.4, headY - headR * 0.8);
    ctx.lineTo(cx + headR * 0.9, headY - headR * 1.8);
    ctx.lineTo(cx + headR * 0.1, headY - headR * 1.2);
    ctx.fill();
    // 脸
    ctx.fillStyle = '#e8a8a8';
    ctx.beginPath();
    ctx.arc(cx - headR * 0.45, headY + headR * 0.25, headR * 0.22, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx + headR * 0.45, headY + headR * 0.25, headR * 0.22, 0, Math.PI * 2);
    ctx.fill();
    // 眼睛
    ctx.fillStyle = '#1a0a00';
    ctx.beginPath();
    ctx.ellipse(cx - headR * 0.32, headY - headR * 0.05, headR * 0.14, headR * 0.10, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(cx + headR * 0.32, headY - headR * 0.05, headR * 0.14, headR * 0.10, 0, 0, Math.PI * 2);
    ctx.fill();
    // 眼睛高光
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(cx - headR * 0.26, headY - headR * 0.10, headR * 0.05, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx + headR * 0.36, headY - headR * 0.10, headR * 0.05, 0, Math.PI * 2);
    ctx.fill();
    // 嘴
    ctx.strokeStyle = '#b06070';
    ctx.lineWidth = h * 0.006;
    ctx.beginPath();
    ctx.arc(cx, headY + headR * 0.35, headR * 0.22, 0.2, Math.PI - 0.2);
    ctx.stroke();
    // 项链
    ctx.strokeStyle = '#d4d4d4';
    ctx.lineWidth = h * 0.005;
    ctx.beginPath();
    ctx.arc(cx, bodyTop + headR * 0.4, bodyW * 0.22, 0.1, Math.PI - 0.1);
    ctx.stroke();
  }

  /** 绘制衣服选项卡缩略图 */
  function drawOutfitThumb(ctx, x, y, w, h, outfit, selected, answered) {
    ctx.save();
    // 卡片底色
    ctx.fillStyle = selected ? 'rgba(255,230,100,0.5)' : 'rgba(255,255,255,0.6)';
    roundRect(ctx, x, y, w, h, 8);
    ctx.fill();

    // 虚线边框（参考视频中的绿色虚线框）
    ctx.setLineDash([5, 4]);
    ctx.strokeStyle = selected ? '#e8c020' : '#80c080';
    ctx.lineWidth = 2;
    roundRect(ctx, x, y, w, h, 8);
    ctx.stroke();
    ctx.setLineDash([]);

    // 衣服简图（小尺寸）
    var cx = x + w / 2;
    var cy = y + h / 2;
    var type = outfit.type;

    ctx.fillStyle = outfit.color;
    if (type === 'apron') {
      // 围裙形状
      ctx.beginPath();
      ctx.moveTo(cx - w * 0.25, cy - h * 0.35);
      ctx.lineTo(cx + w * 0.25, cy - h * 0.35);
      ctx.lineTo(cx + w * 0.32, cy + h * 0.38);
      ctx.lineTo(cx - w * 0.32, cy + h * 0.38);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = outfit.accent;
      ctx.beginPath();
      ctx.moveTo(cx - w * 0.16, cy - h * 0.10);
      ctx.lineTo(cx + w * 0.16, cy - h * 0.10);
      ctx.lineTo(cx + w * 0.20, cy + h * 0.34);
      ctx.lineTo(cx - w * 0.20, cy + h * 0.34);
      ctx.closePath();
      ctx.fill();
      // 围裙带
      ctx.strokeStyle = outfit.accent;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(cx - w * 0.16, cy - h * 0.10);
      ctx.lineTo(cx - w * 0.10, cy - h * 0.38);
      ctx.moveTo(cx + w * 0.16, cy - h * 0.10);
      ctx.lineTo(cx + w * 0.10, cy - h * 0.38);
      ctx.stroke();
    } else if (type === 'dress') {
      // 连衣裙
      ctx.beginPath();
      ctx.moveTo(cx - w * 0.18, cy - h * 0.38);
      ctx.lineTo(cx + w * 0.18, cy - h * 0.38);
      ctx.lineTo(cx + w * 0.14, cy - h * 0.05);
      ctx.lineTo(cx + w * 0.34, cy + h * 0.38);
      ctx.lineTo(cx - w * 0.34, cy + h * 0.38);
      ctx.lineTo(cx - w * 0.14, cy - h * 0.05);
      ctx.closePath();
      ctx.fill();
    } else if (type === 'formal') {
      // 职业装
      ctx.fillRect(cx - w * 0.22, cy - h * 0.38, w * 0.44, h * 0.76);
      ctx.fillStyle = outfit.accent;
      // 领子
      ctx.beginPath();
      ctx.moveTo(cx, cy - h * 0.28);
      ctx.lineTo(cx - w * 0.10, cy - h * 0.38);
      ctx.lineTo(cx - w * 0.22, cy - h * 0.12);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(cx, cy - h * 0.28);
      ctx.lineTo(cx + w * 0.10, cy - h * 0.38);
      ctx.lineTo(cx + w * 0.22, cy - h * 0.12);
      ctx.closePath();
      ctx.fill();
    } else if (type === 'sportswear') {
      // 运动服
      ctx.fillRect(cx - w * 0.22, cy - h * 0.38, w * 0.44, h * 0.76);
      ctx.fillStyle = outfit.accent;
      ctx.fillRect(cx - w * 0.22, cy - h * 0.38, w * 0.09, h * 0.76);
      ctx.fillRect(cx + w * 0.13, cy - h * 0.38, w * 0.09, h * 0.76);
    } else {
      // casual / 其他
      ctx.beginPath();
      ctx.moveTo(cx - w * 0.20, cy - h * 0.38);
      ctx.lineTo(cx + w * 0.20, cy - h * 0.38);
      ctx.lineTo(cx + w * 0.20, cy - h * 0.12);
      ctx.lineTo(cx + w * 0.30, cy - h * 0.12);
      ctx.lineTo(cx + w * 0.22, cy + h * 0.38);
      ctx.lineTo(cx - w * 0.22, cy + h * 0.38);
      ctx.lineTo(cx - w * 0.30, cy - h * 0.12);
      ctx.lineTo(cx - w * 0.20, cy - h * 0.12);
      ctx.closePath();
      ctx.fill();
    }

    // 选中高亮边框
    if (selected) {
      ctx.strokeStyle = '#e8a020';
      ctx.lineWidth = 3;
      ctx.setLineDash([]);
      roundRect(ctx, x + 1, y + 1, w - 2, h - 2, 7);
      ctx.stroke();
    }

    // 衣服名称
    ctx.fillStyle = '#3a2a10';
    ctx.font = 'bold ' + Math.floor(h * 0.13) + 'px sans-serif';
    ctx.textAlign   = 'center';
    ctx.textBaseline= 'bottom';
    ctx.fillText(outfit.label, cx, y + h - 4);

    ctx.restore();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 关卡数据 —— 主题一「职业换装」
  //
  // 依据《多主题找茬游戏玩法策划》§6 设计，四个阶段递进：
  //   阶段1 看场景选整套  → 场景直接给出答案，无惩罚教学
  //   阶段2 场景相近的职业 → 同一场景内区分近似职业，开始看细节
  //   阶段3 台词判断职业   → 背景不再暴露答案，靠台词推断
  //   阶段4 服装相似排干扰 → 选项外观接近，靠功能性区分
  //   Boss  限时职业派对   → 综合验证
  //
  // 字段说明：
  //   Level.stage      : 阶段标识，供 HUD / 结算展示
  //   Level.noPenalty  : true = 答错不扣时间（教学关，见策划 §6.2）
  //   Question.task    : 当前任务，一句话说明玩家要做什么
  //   Question.dialog  : 角色台词（阶段3 起承担线索作用）
  //   Question.hint    : 答错时给出的解释性短提示（见策划 §4.4）
  //   Outfit.pro       : 职业标识，接入真实立绘时按此取图
  //   Outfit.type      : 复用现有程序化绘制类型，不新增绘制代码
  // ─────────────────────────────────────────────────────────────────────────

  // ── 常用服装库（复用以降低数据重复）──────────────────────────────────────
  var W = {
    chef:      { label: '厨师服',   pro: 'chef',      type: 'apron',      color: '#f8f6f0', accent: '#d0c8b8', legColor: '#f0ece0', shoeColor: '#2a2a2a' },
    nurse:     { label: '护士服',   pro: 'nurse',     type: 'dress',      color: '#f2f8fc', accent: '#4aa3d8', legColor: '#f5c898', shoeColor: '#f0f0f0' },
    doctor:    { label: '白大褂',   pro: 'doctor',    type: 'formal',     color: '#fbfbfb', accent: '#88a8c0', legColor: '#e8eaee', shoeColor: '#3a3a3a' },
    surgeon:   { label: '手术服',   pro: 'surgeon',   type: 'apron',      color: '#4fa89b', accent: '#2f7d72', legColor: '#4fa89b', shoeColor: '#e8f0ee' },
    flight:    { label: '空乘制服', pro: 'flight',    type: 'formal',     color: '#1f3a6e', accent: '#c9a227', legColor: '#1f3a6e', shoeColor: '#14172a' },
    cheer:     { label: '啦啦队服', pro: 'cheer',     type: 'sportswear', color: '#e83060', accent: '#ffd23f', legColor: '#f5c898', shoeColor: '#f0f0f0' },
    player:    { label: '球衣',     pro: 'player',    type: 'sportswear', color: '#f0821e', accent: '#2a2a2a', legColor: '#f5c898', shoeColor: '#e8e8e8' },
    referee:   { label: '裁判服',   pro: 'referee',   type: 'sportswear', color: '#2a2a2a', legColor: '#3a3a3a', accent: '#f8f8f8', shoeColor: '#1a1a1a' },
    coach:     { label: '教练夹克', pro: 'coach',     type: 'sportswear', color: '#2f4858', accent: '#7fb069', legColor: '#2f4858', shoeColor: '#1a1a1a' },
    office:    { label: '通勤职业装', pro: 'office',  type: 'formal',     color: '#3a3f5c', accent: '#e8e4f0', legColor: '#3a3f5c', shoeColor: '#14141c' },
    lab:       { label: '实验白袍', pro: 'lab',       type: 'formal',     color: '#f4f6f8', accent: '#6aa8c8', legColor: '#e0e4e8', shoeColor: '#3a3a3a' },
    // ── 常见干扰项（明显不适合工作场景）──
    gown:      { label: '晚礼服',   pro: 'gown',      type: 'dress',      color: '#8e2f5a', accent: '#d4a5c0', legColor: '#f5c898', shoeColor: '#5a1f3a' },
    wedding:   { label: '婚纱',     pro: 'wedding',   type: 'dress',      color: '#fdfdfd', accent: '#efe6d8', legColor: '#f5c898', shoeColor: '#f4ece0' },
    pajama:    { label: '睡衣',     pro: 'pajama',    type: 'casual',     color: '#f6c9d8', accent: '#e8a0bc', legColor: '#f6c9d8', shoeColor: '#f0d8e0' },
    swim:      { label: '泳装',     pro: 'swim',      type: 'dress',      color: '#12b0c8', accent: '#0a8ea0', legColor: '#f5c898', shoeColor: '#f5c898' },
    ski:       { label: '滑雪服',   pro: 'ski',       type: 'sportswear', color: '#d84b2a', accent: '#f8f4e8', legColor: '#3a3a4a', shoeColor: '#2a2a2a' },
    hoodie:    { label: '休闲卫衣', pro: 'hoodie',    type: 'casual',     color: '#8a9a5b', accent: '#c8d0a8', legColor: '#5a6a8a', shoeColor: '#e8e8e8' },
    heels:     { label: '晚宴长裙', pro: 'heels',     type: 'dress',      color: '#2a2a4a', accent: '#c9a227', legColor: '#f5c898', shoeColor: '#1a1a2a' },
  };

  function o(base, over) {
    var r = {};
    for (var k in base) if (base.hasOwnProperty(k)) r[k] = base[k];
    if (over) for (var k2 in over) if (over.hasOwnProperty(k2)) r[k2] = over[k2];
    return r;
  }

  var LEVELS = [

    // ═══════════════════════════════════════════════════════════════════════
    // 关卡 1 —— 阶段1：看场景选整套（无惩罚教学）
    // 策划 §6.2「此阶段主要用于无文字或少文字教学，前几关即使选错也不扣时间」
    // ═══════════════════════════════════════════════════════════════════════
    {
      id:        'job_1',
      name:      '一眼认职业',
      stage:     '看场景选整套',
      noPenalty: true,
      timeLimit: 0,          // 0 = 教学关不计时
      questions: [
        {
          sceneKey: 'kitchen',
          task:     '她要在后厨备餐',
          dialog:   '订单来啦，我马上开始做！',
          answer:   1,
          hint:     '后厨要能防油防烫，还得把头发收起来。',
          options: [ W.gown, W.chef, W.swim, W.ski ],
        },
        {
          sceneKey: 'hospital',
          task:     '她要去病房查看病人',
          dialog:   '3 号床该量体温了。',
          answer:   2,
          hint:     '病房里要方便走动、干净好清洗。',
          options: [ W.wedding, W.ski, W.nurse, W.gown ],
        },
        {
          sceneKey: 'cabin',
          task:     '她要在客舱迎接乘客',
          dialog:   '欢迎登机，请这边走。',
          answer:   0,
          hint:     '客舱服务需要统一制服和丝巾，方便乘客识别。',
          options: [ W.flight, W.pajama, W.swim, W.hoodie ],
        },
        {
          sceneKey: 'gym',
          task:     '她要在篮球赛中场表演',
          dialog:   '中场休息，该我们上场啦！',
          answer:   3,
          hint:     '表演要活动幅度大，衣服得轻便又显眼。',
          options: [ W.pajama, W.office, W.wedding, W.cheer ],
        },
      ],
    },
  ];

  // ─────────────────────────────────────────────────────────────────────────
  // 公开接口
  // ─────────────────────────────────────────────────────────────────────────

  M3.Scene.levelCount = LEVELS.length;

  M3.Scene.getLevel = function (idx) {
    return LEVELS[((idx % LEVELS.length) + LEVELS.length) % LEVELS.length];
  };

  /**
   * 绘制完整游戏画面（场景 + 人物 + 当前预览衣服）
   * @param {CanvasRenderingContext2D} ctx
   * @param {object} rect      sceneArea 矩形 {x,y,w,h}
   * @param {object} level     关卡对象
   * @param {number} qIdx      当前题目索引
   * @param {number} previewOptIdx  正在预览的衣服选项索引（-1=未选）
   */
  M3.Scene.drawScene = function (ctx, rect, level, qIdx, previewOptIdx) {
    if (!level || !level.questions) return;
    var q   = level.questions[qIdx % level.questions.length];
    var x   = rect.x, y = rect.y, w = rect.w, h = rect.h;

    // 1. 场景背景
    ctx.save();
    roundRect(ctx, x, y, w, h, 0);
    ctx.clip();
    if (q.sceneKey === 'kitchen') {
      drawSceneKitchen(ctx, x, y, w, h);
    } else {
      drawSceneLiving(ctx, x, y, w, h);
    }
    ctx.restore();

    // 2. 人物立绘
    var outfit = (previewOptIdx >= 0) ? q.options[previewOptIdx] : null;
    // 默认白色连衣裙（接入图片前的初始状态）
    if (!outfit) {
      outfit = { type: 'dress', color: '#f8f8f8', accent: '#e0e0e0', legColor: '#f5c898', shoeColor: '#8a7060' };
    }
    var charW = Math.min(w * 0.70, h * 0.58);
    var charH = h * 0.92;
    var charX = x + (w - charW) / 2;
    var charY = y + h - charH;
    drawCharacter(ctx, charX, charY, charW, charH, outfit);

    // 3. 点击提示光圈（人物胸口）
    var pulseR = charW * 0.12;
    var pulseX = charX + charW / 2 + charW * 0.15;
    var pulseY = charY + charH * 0.28;
    ctx.save();
    ctx.beginPath();
    ctx.arc(pulseX, pulseY, pulseR, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,220,50,0.25)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,200,30,0.80)';
    ctx.lineWidth = 3;
    ctx.stroke();
    // 内圆
    ctx.beginPath();
    ctx.arc(pulseX, pulseY, pulseR * 0.5, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,200,30,0.35)';
    ctx.fill();
    ctx.restore();
  };

  /**
   * 绘制单张衣服选项卡
   */
  M3.Scene.drawOutfitCard = function (ctx, rect, level, qIdx, optionIdx, selected, answered) {
    if (!level || !level.questions) return;
    var q = level.questions[qIdx % level.questions.length];
    drawOutfitThumb(ctx, rect.x, rect.y, rect.w, rect.h, q.options[optionIdx], selected, answered);
  };

  /**
   * 对话框绘制
   */
  M3.Scene.drawDialog = function (ctx, rect, level, qIdx) {
    if (!level || !level.questions) return;
    var q    = level.questions[qIdx % level.questions.length];
    var text = q.dialog;
    var x = rect.x + rect.w * 0.02;
    var y = rect.y + rect.h * 0.06;
    var w = rect.w * 0.55;
    var h = rect.h * 0.14;

    ctx.save();
    // 气泡背景
    roundRect(ctx, x, y, w, h, 10);
    ctx.fillStyle = 'rgba(255,255,255,0.88)';
    ctx.shadowColor = 'rgba(0,0,0,0.18)';
    ctx.shadowBlur  = 8;
    ctx.fill();
    ctx.shadowColor = 'transparent';
    // 气泡尖角（右侧）
    ctx.beginPath();
    ctx.moveTo(x + w, y + h * 0.3);
    ctx.lineTo(x + w + 12, y + h * 0.5);
    ctx.lineTo(x + w, y + h * 0.65);
    ctx.fillStyle = 'rgba(255,255,255,0.88)';
    ctx.fill();
    // 文字（自动换行）
    ctx.fillStyle = '#3a2a10';
    ctx.font = Math.floor(h * 0.20) + 'px sans-serif';
    ctx.textAlign   = 'left';
    ctx.textBaseline= 'middle';
    var maxW = w - 16;
    var lineH = h * 0.32;
    var words = text.split('');
    var line = '', lines = [];
    for (var i = 0; i < words.length; i++) {
      var test = line + words[i];
      if (ctx.measureText(test).width > maxW && line.length > 0) {
        lines.push(line);
        line = words[i];
      } else {
        line = test;
      }
    }
    lines.push(line);
    var totalH = lines.length * lineH;
    var startY = y + (h - totalH) / 2 + lineH / 2;
    lines.forEach(function (l, li) {
      ctx.fillText(l, x + 8, startY + li * lineH);
    });
    ctx.restore();
  };

  /**
   * 正确/错误结果动画覆盖层
   * @param {boolean} correct  true=正确，false=错误
   * @param {number}  alpha    0~1 动画进度
   */
  M3.Scene.drawResultOverlay = function (ctx, rect, correct, alpha) {
    if (alpha <= 0) return;
    var cx = rect.x + rect.w * 0.72;
    var cy = rect.y + rect.h * 0.70;
    var r  = rect.w * 0.16;
    ctx.save();
    ctx.globalAlpha = Math.min(1, alpha);
    // 圆形背景
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = correct ? 'rgba(30,200,80,0.90)' : 'rgba(220,40,40,0.85)';
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = r * 0.10;
    ctx.stroke();
    // 图标
    ctx.strokeStyle = '#fff';
    ctx.lineWidth   = r * 0.14;
    ctx.lineCap     = 'round';
    ctx.lineJoin    = 'round';
    if (correct) {
      ctx.beginPath();
      ctx.moveTo(cx - r * 0.45, cy);
      ctx.lineTo(cx - r * 0.10, cy + r * 0.38);
      ctx.lineTo(cx + r * 0.48, cy - r * 0.32);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.moveTo(cx - r * 0.42, cy - r * 0.42);
      ctx.lineTo(cx + r * 0.42, cy + r * 0.42);
      ctx.moveTo(cx + r * 0.42, cy - r * 0.42);
      ctx.lineTo(cx - r * 0.42, cy + r * 0.42);
      ctx.stroke();
    }
    ctx.restore();
  };

  /**
   * 命中检测：点击坐标是否在某个选项卡内
   * @param {number} tx, ty     点击逻辑坐标
   * @param {Array}  cards      M3.Layout.optionCards
   * @return {number}           选项索引（0-3），未命中返回 -1
   */
  M3.Scene.hitOption = function (tx, ty, cards) {
    for (var i = 0; i < cards.length; i++) {
      var c = cards[i];
      if (tx >= c.x && tx <= c.x + c.w && ty >= c.y && ty <= c.y + c.h) {
        return i;
      }
    }
    return -1;
  };

})();
