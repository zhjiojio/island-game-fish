/**
 * 快来帮帮我 · 核心数据层
 * 品类：容器调度消除（装车/巴士排队） × 主播换装揭示
 * 依据：pindou-minigame SKILL.md 铁律 1-8 + docs/level-01-prd.md
 * 语法：ES5 ONLY（project.config.json setting.es6 = false）
 */
(function () {
  var M3 = window.M3 = window.M3 || {};
  var PD = M3.PD = {};

  // ── 设计稿 ────────────────────────────────────────────────
  PD.DW = 750;
  PD.DH = 1624;

  // ── 豆子调色盘（参考图：黑色作描边大量使用）───────────────
  // main=顶面  side=侧面(3D 厚度)  dark=被压住时  lite=高光/粒子
  // dark = 同色相加深的暗部（不能变浊！旧值 white→#8A8680 米灰、pink→#8E4E6E 豆沙、
  // cyan→#4E7A88 石板灰，被压住的豆看起来就像第 4/5/6 个颜色 —— 用户看到的「多出一个色」就是这个。
  // 现在统一改成「同色相 + 降亮」，保证一眼能认出还是白/粉/蓝。
  PD.COLORS = {
    black:  { main: '#2B2B33', side: '#15151A', dark: '#1A1A20', lite: '#5A5A66', name: '黑' },
    white:  { main: '#FDFCFA', side: '#D2CEC8', dark: '#BEB9B2', lite: '#FFFFFF', name: '白' },
    pink:   { main: '#FF6FB5', side: '#D64992', dark: '#C24E86', lite: '#FFC2E0', name: '粉' },
    cyan:   { main: '#6FD8F0', side: '#3FA8C8', dark: '#4FA3B8', lite: '#C2F0FA', name: '蓝' },
    red:    { main: '#F04A4A', side: '#C22E2E', dark: '#B83A3A', lite: '#FFB0B0', name: '红' },
    yellow: { main: '#FFD24A', side: '#D9A81E', dark: '#C7A238', lite: '#FFEDB0', name: '黄' },
    green:  { main: '#6ED16E', side: '#3FA44A', dark: '#4F9E56', lite: '#BFEFBF', name: '绿' }
  };
  PD.COLOR_KEYS = ['black', 'white', 'pink', 'cyan', 'red', 'yellow', 'green'];

  // ── 布局（铁律 6 三层分层：Zone A 神圣区 / Zone B 裙子拼豆区 / Zone C UI 浮层）──
  // 立绘按 PORTRAIT 参数缩放平移后，裙子正好落在拼豆区（见 pd-game.js drawPortrait）
  // ══════════════════════════════════════════════════════════════
  //  布局 v2 —— 区域中文名（团队沟通唯一叫法，改代码/提 bug 都用它）
  //  ┌─ 顶栏     hud       0    – 112    6.9%  设置齿轮 · 关卡胶囊
  //  ├─ 拼豆区   art       112  – 848   45.3%  豆阵主体，drawBean 铺格
  //  ├─ 行走道   lane      848  – 944    5.9%  豆子出阵排队，【禁放任何 UI】
  //  ├─ 车位行   slot      944  – 1104   9.9%  6 车位，第 6 位广告解锁
  //  ├─ 离场道   corridor  1104 – 1216   6.9%  满车倒入后转向驶出
  //  ├─ 候选首排 qRow1     1216 – 1344   7.9%  可拖拽
  //  ├─ 候选次排 qRow2     1360 – 1488   7.9%  半透预览，底 22px 被道具栏半遮
  //  └─ 道具栏   tray      1466 – 1624   9.7%  4 个 icon（升级/消除/刷新/速度x2）
  //
  //  v2 三条决策（用户确认）：
  //   1. 删除独立 speed 行 —— 道具栏已有「速度x2」icon，功能重复。70px 还给拼豆区。
  //   2. 立绘全幅铺底 0–1466 + 模糊遮罩动态显影（默认 70%：blur 2.4px / bright .87）。
  //      候选区【不要底板】，直接透出立绘。
  //   3. 候选次排底部 22px 被道具栏压住 → 半遮，暗示「还有更多车」。
  // ══════════════════════════════════════════════════════════════
  PD.L = {
    hudH: 112,
    // 拼豆区：吃掉旧版 hud→art 之间 138px 空白，34.0% → 45.3%
    // cell 是动态算的（PATTERNS 无 cell 键，走 min(636/cols, stageH/rows)），
    // stageH 552→736 后 sundae(26行) 的 cell 自动 21→28，豆子直接大 33%。
    stageY: 112, stageH: 736,
    cell: 32, beanCX: 375, beanTop: 124,
    // 【行走道 lane 848–944】豆阵底 = 124 + 26×28 = 852，车位顶 = 944。
    // 96px 可用带：6 条平行道 × laneGap 10 塞得下，且与车位行相切不重叠（旧版重叠 20px）。
    laneY: 862,                      // 豆子出阵后的横向通道基线（每辆车 +si*laneGap）
    // 【车位行 slot 944–1104】slotH 160 → 内框 98×140，car atlas 224×320 的 k=0.4375，
    // 宽高同时跑满 → 车 98×140。旧版 slotH 110 时 k 被高度卡死，车只有 63px 宽。
    slotY: 944, slotH: 160, slotW: 108, slotGap: 10,
    // 【离场道 corridor 1104–1216】车先倒进这里再转向横向驶出。
    // 必须独占一条带，转 90° 后车占 140×98，112 够用。
    corridorY: 1104, corridorH: 112,
    // 【候选区 1216–1488】v2：不画底板，直接透出立绘（用户要求）
    qPanelY: 1216,
    // 候选次排 1360–1488，底部 22px 被道具栏（顶 1466）压住 → 半遮，暗示「还有更多车」
    qRow1: 1216, qRow2: 1360, qCarW: 104, qCarH: 128,
    // 【道具栏 tray 1466–1624】唯一不透明面板，z 最高。
    // v2 删掉了独立 speed 行（原 1130–1200，70px）—— 道具栏已有「速度x2」icon，功能重复。
    trayY: 1466,
    // 圆钮：pad12 + 圆104 + gap4 + 文字22 = 142，底 1608 < 1624 不裁切
    btnY: 1530, btnR: 52
  };

  // 立绘适配：把「裙子」这段拉到拼豆区。裁掉顶部留白（用户要求），底部展示完整。
  // 实测归一化锚点：腰线 .387 / 裙摆 .671
  PD.PORTRAIT = { waist: 0.387, hem: 0.671 };

  // 安全区：拖拽不允许出界（跟随 v2 布局：拼豆区顶 112 → 离场道底 1216）
  PD.SAFE = { x0: 66, x1: 684, y0: 124, y1: 1216 };

  // ── 裙子遮罩（拼豆贴合度的根：豆阵形状 = 裙子形状）─────────────
  // poly = 归一化多边形（相对 750×1624 设计稿），由 tools/mask-editor.html 画框导出
  // art  = ASCII 栅格（编辑器精修后导出，优先级高于 poly）
  PD.MASKS = {
    skirt_nuonuo: {
      name: '糯糯的裙子',
      tip: '裙子被拼豆挡住了，帮帮我！',
      // 【v2 同步】此关是唯一硬编码 cell/oy 的（PATTERNS 走动态 fit，这里不走）。
      // 拼豆区上移到 112 后，oy 必须从 262 同步到 124，否则裙子豆阵会悬空 138px。
      // 可用高 = laneY(862) - oy(124) = 738px，16 行 × 32 = 512 ≤ 738 ✅
      cell: 32, ox: 375, oy: 124,
      // 四色。降低白色占比（dotRate 0.34→0.52）—— 白豆 60% 就会导致白车 58%，
      // 队列看起来「全是白车」。四色均衡后才会真的逗用户思考放什么车。
      palette: { base: 'white', dots: ['pink', 'cyan', 'yellow'], dotRate: 0.70, hemRows: 2, hem: 'white' },
      art: [
        '...xxxxxxx...',
        '...xxxxxxx...',
        '....xxxxx....',
        '....xxxxx....',
        '...xxxxxxx...',
        '...xxxxxxx...',
        '..xxxxxxxxx..',
        '..xxxxxxxxx..',
        '.xxxxxxxxxxx.',
        '.xxxxxxxxxxx.',
        'xxxxxxxxxxxxx',
        'xxxxxxxxxxxxx',
        'xxxxxxxxxxxxx',
        '.xxxxxxxxxxx.',
        '..xxxxxxxxx..',
        '....xxxxx....'
      ]
    }
  };

  // 点在多边形内（射线法，ES5）
  function inPoly(x, y, poly) {
    var inside = false, i, j;
    for (i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      var xi = poly[i][0], yi = poly[i][1], xj = poly[j][0], yj = poly[j][1];
      if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) inside = !inside;
    }
    return inside;
  }
  PD.inPoly = inPoly;

  // ── 由遮罩生成豆阵（豆子铺满裙子形状）────────────────────────
  // 支持两种输入：mask.art（ASCII 栅格，编辑器产出，最精确）或 mask.poly（多边形）
  function buildFromMask(maskKey, lvId, targetS, stackCfg) {
    var mk = (typeof maskKey === 'object') ? maskKey : PD.MASKS[maskKey];
    if (!mk) mk = PD.MASKS.skirt_nuonuo;
    var cell = mk.cell || 30;
    var beans = [], id = 0, cnt = {}, r, c;
    var pal = mk.palette || { base: 'white', dots: ['pink'], dotRate: 0.24, hemRows: 2, hem: 'white' };
    var rand = rng(mk.seed || 424242);
    var W, H, grid = [];

    if (mk.art && mk.art.length) {
      // 编辑器导出的 ASCII 栅格：字符即颜色（'.'=空）
      var map = { k: 'black', w: 'white', p: 'pink', c: 'cyan', r: 'red', y: 'yellow', g: 'green', x: null };
      H = mk.art.length; W = 0;
      for (r = 0; r < H; r++) W = Math.max(W, mk.art[r].length);
      for (r = 0; r < H; r++) {
        var row = [];
        for (c = 0; c < W; c++) {
          var ch = mk.art[r].charAt(c);
          // 'x' = 「这里有豆但颜色交给自动上色」，其他字母 = 指定颜色
          row.push(ch === '.' || ch === '' ? null : (map[ch] === undefined ? 'x' : (map[ch] || 'x')));
        }
        grid.push(row);
      }
    } else {
      // 多边形栅格化：把 poly 铺成格子
      var minX = 1, maxX = 0, minY = 1, maxY = 0, i;
      for (i = 0; i < mk.poly.length; i++) {
        if (mk.poly[i][0] < minX) minX = mk.poly[i][0];
        if (mk.poly[i][0] > maxX) maxX = mk.poly[i][0];
        if (mk.poly[i][1] < minY) minY = mk.poly[i][1];
        if (mk.poly[i][1] > maxY) maxY = mk.poly[i][1];
      }
      var pxW = (maxX - minX) * PD.DW, pxH = (maxY - minY) * PD.DH;
      W = Math.max(1, Math.floor(pxW / cell));
      H = Math.max(1, Math.floor(pxH / cell));
      for (r = 0; r < H; r++) {
        var row2 = [];
        for (c = 0; c < W; c++) {
          // 格子中心换算回归一化坐标做命中测试
          var nx = minX + (c + 0.5) / W * (maxX - minX);
          var ny = minY + (r + 0.5) / H * (maxY - minY);
          row2.push(inPoly(nx, ny, mk.poly) ? 'x' : null);
        }
        grid.push(row2);
      }
      mk._bbox = { minX: minX, maxX: maxX, minY: minY, maxY: maxY };
    }

    // 自动上色：底色 + 波点 + 裙摆蕾丝行
    var hemRows = pal.hemRows || 0;
    for (r = 0; r < grid.length; r++) {
      for (c = 0; c < grid[r].length; c++) {
        var v = grid[r][c];
        if (!v) continue;
        var col;
        if (v !== 'x') col = v;                                   // 编辑器指定了颜色
        else if (r >= grid.length - hemRows) col = pal.hem;        // 裙摆蕾丝
        else if (rand() < (pal.dotRate || 0)) col = pal.dots[Math.floor(rand() * pal.dots.length) % pal.dots.length];
        else col = pal.base;
        beans.push({ id: id++, color: col, gx: c - (grid[r].length - 1) / 2, gy: r, layer: 0 });
        cnt[col] = (cnt[col] || 0) + 1;
      }
    }

    applyStack(beans, cnt, stackCfg || { L: 1 });
    var maxL = 0;
    for (r = 0; r < beans.length; r++) if (beans[r].layer > maxL) maxL = beans[r].layer;

    // 舞台锚点：让豆阵正好盖住裙子
    // 优先用编辑器导出的 ox/oy（ASCII 模式最精确），否则用 poly bbox 推算
    var bb = mk._bbox;
    var ox = (mk.ox !== undefined) ? mk.ox : (bb ? (bb.minX + bb.maxX) / 2 * PD.DW : PD.L.beanCX);
    var oy = (mk.oy !== undefined) ? mk.oy : (bb ? bb.minY * PD.DH + cell / 2 : PD.L.beanTop);

    return {
      id: lvId || 1, title: mk.name, tip: mk.tip || '裙子被拼豆挡住了，帮帮我！',
      maskKey: (typeof maskKey === 'string') ? maskKey : 'custom',
      cols: W, rows: H, cell: cell, ox: ox, oy: oy,
      counts: cnt, maxLayer: maxL,
      slots: 6, beans: beans,
      cars: deriveCars(cnt, targetS === undefined ? 0.125 : targetS),
      stars: { three: 0, two: 0 }
    };
  }
  PD.buildFromMask = buildFromMask;

  // ── 像素画图案（参考图灵魂：豆子密集拼出可识别的成品画）────
  // k=黑(描边) w=白 p=粉 c=蓝 r=红 y=黄 g=绿  .=空
  PD.PATTERNS = {
    melon: {
      name: '西瓜小人', tip: '通关？随手的事~',
      art: [
        '..........kk..........',
        '.........kwwk.........',
        '........kwrrwk........',
        '.......krrrrrrk.......',
        '......krrrkrrrrk......',
        '.....krrrrrrrrrrk.....',
        '....krrkrrrrkrrrrk....',
        '...krrrrrrrrrrrrrrk...',
        '..krrrrkrrrrrrkrrrrk..',
        '.krrrrrrrrrrrrrrrrrrk.',
        'krrrkrrrrrrkrrrrrrrrrk',
        'kggggggggggggggggggggk',
        'kwwwwwwwwwwwwwwwwwwwwk',
        '.kkkk..........kkkk...',
        '..krk..........krk....',
        '..krrk.........krrk...',
        '..kkkk.........kkkk...'
      ]
    },
    sundae: {
      name: '梦幻冰淇淋杯', tip: '通关？随手的事~',
      art: [
        '..........kkkkkk......',
        '.......k..krrrrrk.....',
        '......kyk.krrrrwrk....',
        '.....kyyk.krrrrrrk....',
        '....kyykkkkkkkkkkkk...',
        '...kyykwwwwwwwwwwwwk..',
        '..kyykwwwwwwwwwwwwwwk.',
        '.kyykwwwwwrrrrwwwwwwk.',
        'kkkkwwwwwwrrrrrwwwwwwk',
        'kppppwwwwwwwwwwwwwwppk',
        'kpppppppppppppppppppgk',
        'kppppppppppppppppppggk',
        'kppppppppppppppppppggk',
        'kcccccccccccccccccccck',
        'kccccccccyyyycccccccck',
        'kccccccccccccccccccck.',
        '.kcccccccccccccccccck.',
        '..kkccccccccccccccckk.',
        '....kkkcccccccckkk....',
        '.......kkccccckk......',
        '.........kcccck.......',
        '.........kcccck.......',
        '......kkkkcccckkkk....',
        '.....kcccccccccccck...',
        '.....kcccccccccccck...',
        '......kkkkkkkkkkkk....'
      ]
    }
  };

  // 铁律 2：车容量由「该色豆数 ÷ 车数」倒推，绝不手填
  // 目标冗余 targetS（如 0.125），车数按容量上限 30 自动切分
  // capMax = 单车容量上限。【关键难度旋钮，别当成美术参数】
  // 车数 = ceil(该色容量 / capMax)。capMax 越小 → 车越多 → 决策次数越多。
  // 【实测踩坑】capMax 恒为 30 时，第 2 关 4 色 × 26 豆 → 每色只需 1 辆车 →
  // 全场 4 辆车塞进 5 个车位 = 全部同时在场 = 零决策 = "随便点都能赢"。
  // 光调 S 治不了这个病 —— 必须靠 capMax 把车数压到远超车位数。
  // ── 容量随机分配 ────────────────────────────────────────────────
  // 【为什么必须随机】均分（base = floor(need/num)）会让全场车的数字几乎一样，
  // 第 2 关实测 8 辆车容量全是 12 —— 玩家看数字等于没信息，
  // "这辆装得下吗 / 该留哪辆" 的判断消失，策略退化成"随便拖"。
  // 【硬约束】各车容量之和必须仍等于 need —— 这样 S 契约（冗余率）分毫不变，
  // 只是把同样的总座位数在车之间重新分配。难度不变，信息量变多。
  function splitCaps(need, num, capMax, rnd) {
    var caps = [], i, base = Math.floor(need / num), rem = need - base * num;
    for (i = 0; i < num; i++) caps.push(base + (i < rem ? 1 : 0));
    if (num < 2) return caps;
    var lo = Math.max(3, Math.round(base * 0.55));      // 单车下限：太小的车没意义
    var hi = Math.min(capMax, Math.max(base + 1, Math.round(base * 1.5)));
    if (hi <= lo) return caps;
    var step = Math.max(1, Math.floor((hi - lo) / 2));
    // 随机搬运座位：从 a 车挪 d 个到 b 车，总和恒定不变
    for (i = 0; i < num * 5; i++) {
      var a = Math.floor(rnd() * num), b = Math.floor(rnd() * num);
      if (a === b) continue;
      var d = 1 + Math.floor(rnd() * step);
      if (caps[a] - d >= lo && caps[b] + d <= hi) { caps[a] -= d; caps[b] += d; }
    }
    return caps;
  }

  // ── 排队顺序：加权随机，而不是各色轮转 ──────────────────────────
  // 【旧版病因】原来是 for(每个颜色) 取一辆 的严格轮转，于是队列成了
  // white,pink,cyan,yellow,green | white,pink,cyan,yellow,green | …
  // 车位一屏正好 5 个 → 【每一排的颜色完全一致，且和上一排一样】。
  // 后果：玩家一眼看穿下一排是什么，且每排必然每色一辆、不存在"抢同色车位"，
  // 排队规划完全消失。用户原话：「这还有策略么？」
  // 【新版】按剩余量加权随机抽色 → 同屏会出现某色两辆、某色缺席，
  // 才产生"先接哪辆 / 要不要为后面留位"的取舍。
  function shuffleQueue(cars, rnd) {
    var buckets = {}, keys = [], i, out = [], guard = 0;
    for (i = 0; i < cars.length; i++) {
      var c = cars[i].color;
      if (!buckets[c]) { buckets[c] = []; keys.push(c); }
      buckets[c].push(cars[i]);
    }
    while (out.length < cars.length && guard++ < 9999) {
      var pool = [], tot = 0;
      for (i = 0; i < keys.length; i++) {
        var b = buckets[keys[i]];
        if (!b.length) continue;
        // 统计队尾已有几辆连续同色
        var run = 0, j = out.length - 1;
        while (j >= 0 && out[j].color === keys[i]) { run++; j--; }
        // 权重 = 剩余车数（剩得多的优先出，避免同色全堆到队尾变成长龙）
        var w = b.length;
        if (run >= 2) w = 0;         // 已连续 2 辆同色 → 本轮禁出（长龙也是没决策）
        if (w > 0) { pool.push({ k: keys[i], w: w }); tot += w; }
      }
      if (!tot) {                    // 兜底：只剩被禁的颜色，放行以免死循环
        for (i = 0; i < keys.length; i++) {
          if (buckets[keys[i]].length) { out.push(buckets[keys[i]].shift()); break; }
        }
        continue;
      }
      var r = rnd() * tot, acc = 0, pick = pool[0].k;
      for (i = 0; i < pool.length; i++) { acc += pool[i].w; if (r <= acc) { pick = pool[i].k; break; } }
      out.push(buckets[pick].shift());
    }
    return out;
  }

  function deriveCars(cnt, targetS, capMax, seed) {
    var order = PD.COLOR_KEYS, cars = [], k, i;
    if (!capMax || capMax < 4) capMax = 30;
    // 独立随机源（同 seed 必得同一支车队，保证可复现 / 可回归）
    var s = (seed | 0) || 0x9e3779b9; if (s < 0) s = -s;
    function rnd() {
      s ^= s << 13; s |= 0; s ^= s >>> 17; s ^= s << 5; s |= 0;
      return ((s >>> 0) % 100000) / 100000;
    }
    for (k = 0; k < order.length; k++) {
      var col = order[k], n = cnt[col] || 0;
      if (!n) continue;
      var need = Math.ceil(n * (1 + targetS));      // 该色总容量（含冗余）
      var num = Math.max(1, Math.ceil(need / capMax));
      var caps = splitCaps(need, num, capMax, rnd);
      for (i = 0; i < num; i++) cars.push({ color: col, cap: caps[i] });
    }
    return shuffleQueue(cars, rnd);
  }
  PD.deriveCars = deriveCars;

  // ── 确定性伪随机（同一关每次生成完全一致，便于求解器回归）──
  function rng(seed) {
    var s = seed || 1;
    return function () { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
  }

  // ── 铁律 3 关键：遮挡层（L）生成 ─────────────────────────────
  // 之前所有豆都是 layer:0 → isPickable 恒真 → 「被堵住的豆也满天飞进车」。
  // 这里在底层豆之上按比例叠盖豆，制造真实遮挡：上层不清掉，下层碰不到。
  // 约束（铁律 3）：同格 layer 必须从 0 起连续 —— 只在已有底层豆的格子上叠。
  function applyStack(beans, cnt, cfg) {
    var L = cfg && cfg.L ? cfg.L : 1;
    if (L <= 1) return;
    var ratio = cfg.ratio === undefined ? 0.22 : cfg.ratio;
    var rand = rng(cfg.seed || 20260827);
    var id = 0, i;
    for (i = 0; i < beans.length; i++) if (beans[i].id >= id) id = beans[i].id + 1;

    // 可用颜色 = 场上已存在的颜色（保证 deriveCars 一定给它配了车）
    var pool = [];
    for (i = 0; i < PD.COLOR_KEYS.length; i++) if (cnt[PD.COLOR_KEYS[i]]) pool.push(PD.COLOR_KEYS[i]);
    if (!pool.length) return;

    // 只在「底层豆」上叠；每格最多叠到 L-1 层
    var base = beans.slice();
    for (i = 0; i < base.length; i++) {
      var b = base[i];
      if (b.layer !== 0) continue;
      if (rand() > ratio) continue;
      var extra = 1;
      if (L >= 3 && rand() < 0.28) extra = 2;   // 少量 3 层，制造全局规划压力
      for (var k = 1; k <= extra; k++) {
        // 上层刻意选与下层不同的颜色 → 必须先清上层色才能碰下层色（铁律 4）
        var col = pool[Math.floor(rand() * pool.length) % pool.length];
        var guard = 0;
        while (col === b.color && pool.length > 1 && guard++ < 8) col = pool[Math.floor(rand() * pool.length) % pool.length];
        beans.push({ id: id++, color: col, gx: b.gx, gy: b.gy, layer: k });
        cnt[col] = (cnt[col] || 0) + 1;
      }
    }
  }
  PD.applyStack = applyStack;

  function buildLevel(patKey, lvId, targetS, stackCfg) {
    var pat = PD.PATTERNS[patKey] || PD.PATTERNS.melon;
    var art = pat.art, beans = [], id = 0, cnt = {};
    var map = { k: 'black', w: 'white', p: 'pink', c: 'cyan', r: 'red', y: 'yellow', g: 'green' };
    var W = 0, r, c;
    for (r = 0; r < art.length; r++) W = Math.max(W, art[r].length);
    for (r = 0; r < art.length; r++) {
      for (c = 0; c < art[r].length; c++) {
        var col = map[art[r].charAt(c)];
        if (!col) continue;
        beans.push({ id: id++, color: col, gx: c - (W - 1) / 2, gy: r, layer: 0 });
        cnt[col] = (cnt[col] || 0) + 1;
      }
    }

    // 遮挡层（真实可取性的来源）
    applyStack(beans, cnt, stackCfg || PD.STACK[patKey] || { L: 1 });

    // 每格最高层数，供渲染层画厚度阴影
    var maxL = 0;
    for (r = 0; r < beans.length; r++) if (beans[r].layer > maxL) maxL = beans[r].layer;

    return {
      id: lvId || 1, title: pat.name, tip: pat.tip, patKey: patKey || 'melon',
      cols: W, rows: art.length, counts: cnt, maxLayer: maxL,
      slots: 6, beans: beans,
      cars: deriveCars(cnt, targetS === undefined ? 0.125 : targetS),
      stars: { three: 0, two: 0 }   // 由 solveLevel 回写（禁止手填）
    };
  }
  PD.buildLevel = buildLevel;
  // 关卡顺序：先走裙子遮罩关（豆子铺满裙子），再走像素画关
  PD.LEVEL_ORDER = ['skirt_nuonuo', 'melon', 'sundae'];
  // 关卡遮挡曲线：关 1 也要有「可能死」的组合（用户要求：加一点难度）
  //   L2 + ratio .30 → 约三成格子叠第二层，且上层刻意换色
  //   → 想清下层必须先把上层那一色的车调进来，车位规划一旦贪心就会堵
  // 关卡遮挡曲线——【用户铁律】永远只一层，L 恒为 1。
  // 难度绝不靠堆层数，靠「颜色组合 + 用户得想清楚放什么车」。
  PD.STACK = {
    skirt_nuonuo: { L: 1 },
    melon:  { L: 1 },
    sundae: { L: 1 }
  };
  function buildLevel1() { return buildLevel('melon', 1, 0.125); }
  PD.buildLevel1 = buildLevel1;

  // ── 铁律 3：可取性 = Z 轴层叠，O(1) 判定 ──────────────────
  // 头顶（同格更高 layer）无豆即可取。绝不用 XY 平面 BFS 洪水填充。
  function buildTopIndex(beans) {
    var top = {};
    for (var i = 0; i < beans.length; i++) {
      var b = beans[i];
      if (b.gone) continue;
      var k = b.gx + '_' + b.gy;
      if (top[k] === undefined || b.layer > top[k]) top[k] = b.layer;
    }
    return top;
  }
  PD.buildTopIndex = buildTopIndex;

  function isPickable(bean, top) {
    if (bean.gone) return false;
    return top[bean.gx + '_' + bean.gy] === bean.layer;
  }
  PD.isPickable = isPickable;

  // ── 通行占位图：格子里只要还有豆（任意层）就堵路 ──────────────
  function buildOccupancy(beans) {
    var occ = {};
    for (var i = 0; i < beans.length; i++) {
      var b = beans[i];
      if (b.gone) continue;
      occ[b.gx + '_' + b.gy] = (occ[b.gx + '_' + b.gy] || 0) + 1;
    }
    return occ;
  }
  PD.buildOccupancy = buildOccupancy;

  // ── 豆阵边界（用于判定「走到外面」）─────────────────────────
  function buildBounds(beans) {
    var minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
    for (var i = 0; i < beans.length; i++) {
      var b = beans[i];
      if (b.gx < minX) minX = b.gx;
      if (b.gx > maxX) maxX = b.gx;
      if (b.gy < minY) minY = b.gy;
      if (b.gy > maxY) maxY = b.gy;
    }
    return { minX: minX, maxX: maxX, minY: minY, maxY: maxY };
  }
  PD.buildBounds = buildBounds;

  // ── 走路算法 v3【用户校准】────────────────────────────────
  // 用户原话：「如果前面空了 豆人可以走最短路径了啊 我让你走外围是说旁边有人的情况下！」
  // 所以正确模型不是「四方向直线逃逸」，而是标准 BFS 最短路 + 把人当墙：
  //   1. BFS 求「到豆阵下沿出口」的最短路 —— 前面空 → 直着往下走，一步不多绕
  //   2. 所有还没走的豆 = 墙 —— 旁边有人 → 自动贴着人绕开，绝不撞人、绝不穿模
  //   3. 走廊 = 豆阵外扩一圈的空地 —— 内部堵死时才自然绕到外围（这才是「外围」的正确触发条件）
  //   4. 邻居顺序 [下,左,右,上]：BFS 在等长路径中先探到「向下」那条 → 走出来是顺的不是拐的
  //   5. 完全被围死 → 返回 null，必须等前面的人先走（保留排队的秩序感和难度）
  //   6. reserved = 在途豆还没走完的格子，也算墙 → 两个豆不会撞在一起 / 交叉穿过
  // 出口选在豆阵下沿 +1 行：车在下方，从下方出阵天然最短。
  var DIRS = [[0, 1], [-1, 0], [1, 0], [0, -1]];   // 下 / 左 / 右 / 上
  function pathOut(bean, occ, bd, reserved) {
    var x0 = bd.minX - 1, x1 = bd.maxX + 1;
    var y0 = bd.minY - 1, y1 = bd.maxY + 1;
    var goalY = y1;
    if (bean.gy >= goalY) return { cells: [], blockers: 0, dir: [0, 1] };

    var start = { gx: bean.gx, gy: bean.gy, p: null };
    var seen = {};
    seen[bean.gx + '_' + bean.gy] = 1;
    var q = [start], head = 0, found = null, d;
    while (head < q.length) {
      var cur = q[head++];
      if (cur.gy === goalY) { found = cur; break; }
      for (d = 0; d < 4; d++) {
        var nx = cur.gx + DIRS[d][0], ny = cur.gy + DIRS[d][1];
        if (nx < x0 || nx > x1 || ny < y0 || ny > y1) continue;
        var k = nx + '_' + ny;
        if (seen[k]) continue;
        if (occ[k]) continue;                       // 还没走的豆 = 墙（不撞人 / 不穿模）
        if (reserved && reserved[k]) continue;       // 在途豆的剩余路径 = 墙（不撞正在走的人）
        seen[k] = 1;
        q.push({ gx: nx, gy: ny, p: cur });
      }
    }
    if (!found) return null;                        // 被围死 → 排队等前面的先走

    var cells = [], n = found;
    while (n && n !== start) { cells.push({ gx: n.gx, gy: n.gy }); n = n.p; }
    cells.reverse();
    return { cells: cells, blockers: 0, dir: [0, 1] };
  }
  PD.pathOut = pathOut;

  // ── 【性能核心】可达性灌水 buildReach —— 把 N 次 BFS 压成 1 次 ────────
  // 【为什么必须有】旧写法里 anyMovable/suck/isZombie 都是「对每颗豆调一次
  //  pathOut」。pathOut 自己是一次 BFS，最坏要铺满整个网格 → 单次判定复杂度
  //  O(N × 网格)。实测 532 豆 26×30 网格时 anyMovable 一次要 17.8ms（桌面 Node，
  //  手机上 ×5~10 = 90~180ms），而 watchdog 每帧都调它 → 直接吃掉整个帧预算，
  //  这就是用户说的「特别卡」。
  //
  // 【数学等价改写】pathOut 是无向 BFS（豆=墙、空格可走），所以
  //   「豆 b 能走到下沿出口」 ⟺ 「b 的某个 4-邻空格，与下沿出口空格连通」。
  // 于是只需从下沿那一行的空格【反向灌一次水】，标出所有「与出口连通的空格」，
  // 之后每颗豆只要查 4 个邻格 = O(1)。总复杂度从 O(N × 网格) 降到 O(网格)。
  // 结论完全等价，不是近似 —— 无向图连通性双向一致。
  //
  // 【为什么用 Uint8Array 而不是字符串 key 对象】原来所有格子索引都是
  //  `gx + '_' + gy` 字符串拼接：每次查询都要建临时字符串 + 哈希，
  //  在每帧几万次调用下光 GC 就压垮帧率。平铺数组是纯下标寻址，零分配。
  //  网格最大 32×38=1216 字节，内存代价可以忽略。
  function buildReach(occ, bd, reserved) {
    var x0 = bd.minX - 1, x1 = bd.maxX + 1;
    var y0 = bd.minY - 1, y1 = bd.maxY + 1;
    var W = x1 - x0 + 1, H = y1 - y0 + 1;
    var arr = new Uint8Array(W * H);
    // 队列用 Int32Array 当环形栈：避免 Array#push/shift 的动态扩容与装箱
    var q = new Int32Array(W * H), qn = 0, head = 0, x, y, k;
    // 起点集 = 下沿外那一行（y1）的所有空格。豆阵外一圈天然是空的，必非空集。
    for (x = x0; x <= x1; x++) {
      k = x + '_' + y1;
      if (occ[k]) continue;
      if (reserved && reserved[k]) continue;
      var idx = (y1 - y0) * W + (x - x0);
      if (arr[idx]) continue;
      arr[idx] = 1; q[qn++] = idx;
    }
    while (head < qn) {
      var cu = q[head++];
      var cx = cu % W + x0, cy = (cu - cu % W) / W + y0;
      for (var d = 0; d < 4; d++) {
        var nx = cx + DIRS[d][0], ny = cy + DIRS[d][1];
        if (nx < x0 || nx > x1 || ny < y0 || ny > y1) continue;
        var ni = (ny - y0) * W + (nx - x0);
        if (arr[ni]) continue;
        k = nx + '_' + ny;
        if (occ[k]) continue;                        // 未走的豆 = 墙（与 pathOut 同口径）
        if (reserved && reserved[k]) continue;       // 在途豆当前格 = 墙（同口径）
        arr[ni] = 1; q[qn++] = ni;
      }
    }
    return { arr: arr, W: W, H: H, x0: x0, y0: y0, x1: x1, y1: y1 };
  }
  PD.buildReach = buildReach;

  // O(1) 版「这颗豆现在能不能走」——与 canWalk 结论完全一致，只是不返回路径。
  // 用法：热路径（每帧的死局判定、派豆前的候选筛选）全部走这个；
  //       真正要派豆时再对【已确认可走】的那一颗调一次 pathOut 取具体路径。
  // 于是每帧最多只跑 1 次灌水 + 若干次 O(1) 查表，BFS 只在真派豆时跑 1 次。
  function canWalkFast(bean, top, reach) {
    if (bean.gone) return false;
    if (top[bean.gx + '_' + bean.gy] !== bean.layer) return false;   // 铁律 3：头顶无豆
    if (bean.gy >= reach.y1) return true;
    var W = reach.W, a = reach.arr;
    for (var d = 0; d < 4; d++) {
      var nx = bean.gx + DIRS[d][0], ny = bean.gy + DIRS[d][1];
      if (nx < reach.x0 || nx > reach.x1 || ny < reach.y0 || ny > reach.y1) continue;
      if (a[(ny - reach.y0) * W + (nx - reach.x0)]) return true;
    }
    return false;
  }
  PD.canWalkFast = canWalkFast;

  // ── 【难度核心】卡口值 gateValue —— 这颗豆走掉会「漏出」多少东西 ────────
  // 【用户原话】「一些无关紧要、不是核心卡口的地方的豆子应该先上车，然后那些一旦
  //   放了就漏出其他颜色的卡扣的豆子应该最后放出来（这样也能增加难度）」
  //
  // 【定义】豆 b 的卡口值 = b 离场后，会有多少颗【原本走不出去】的豆变成能走。
  //   b 自己现在可走 ⟹ b 所在格与出口连通 ⟹ b 走后该格变空且仍连通
  //   ⟹ b 的每个 4-邻豆立刻获得一个通往出口的邻空格 ⟹ 全部变为可走。
  //   于是只需数「b 的 4-邻里，当前走不出去的豆有几颗」= O(4)，无需任何 BFS。
  //
  // 返回 { beans: 新解锁豆数, colors: 新解锁的颜色种类数 }
  //   colors 单独计数是因为「漏出一个【新颜色】」的后果远大于「多漏几颗同色豆」——
  //   新颜色意味着队列里那一色的车突然从「空转」变成「能干活」，直接改变全局决策。
  //
  // 【怎么用】派豆时按 gateValue 升序取：非卡口豆先走（无风险的先清），
  //   卡口豆压到最后（把「一放就连锁」的时刻推迟）→ 玩家必须自己判断何时拆卡口。
  function gateValue(bean, beans, top, reach, byCell) {
    var out = { beans: 0, colors: 0 }, seen = null, d;
    for (d = 0; d < 4; d++) {
      var nx = bean.gx + DIRS[d][0], ny = bean.gy + DIRS[d][1];
      var lst = byCell[nx + '_' + ny];
      if (!lst) continue;
      for (var i = 0; i < lst.length; i++) {
        var nb = lst[i];
        if (nb.gone || nb === bean) continue;
        // 只统计「现在走不了、b 走掉后就能走」的邻居。已经能走的不算解锁。
        if (canWalkFast(nb, top, reach)) continue;
        // 头顶被压着的豆不会因为侧邻离场而解锁（那是 Z 轴问题，与卡口无关）
        if (top[nb.gx + '_' + nb.gy] !== nb.layer) continue;
        out.beans++;
        if (!seen) seen = {};
        if (!seen[nb.color]) { seen[nb.color] = 1; out.colors++; }
      }
    }
    return out;
  }
  PD.gateValue = gateValue;

  // 格子 → 豆列表 索引。gateValue 每次要查 4 个邻格里有哪些豆，
  // 没有这张表就得线性扫全场 → O(N) 变 O(N²)。建一次给整轮复用。
  function buildCellIndex(beans) {
    var m = {}, i;
    for (i = 0; i < beans.length; i++) {
      var b = beans[i];
      if (b.gone) continue;
      var k = b.gx + '_' + b.gy;
      if (!m[k]) m[k] = [];
      m[k].push(b);
    }
    return m;
  }
  PD.buildCellIndex = buildCellIndex;

  // 能不能现在就走：头顶无豆（Z 轴，铁律 3）+ 存在一条不碰任何人的最短路
  function canWalk(bean, top, occ, bd, reserved) {
    if (!isPickable(bean, top)) return null;
    return pathOut(bean, occ, bd, reserved);
  }
  PD.canWalk = canWalk;

  // ── 参数 1：冗余率按颜色取 min（不取全局和）────────────────
  function colorStats(lv) {
    var beanN = {}, carCap = {}, i, k;
    for (i = 0; i < PD.COLOR_KEYS.length; i++) { beanN[PD.COLOR_KEYS[i]] = 0; carCap[PD.COLOR_KEYS[i]] = 0; }
    for (i = 0; i < lv.beans.length; i++) beanN[lv.beans[i].color]++;
    for (i = 0; i < lv.cars.length; i++) carCap[lv.cars[i].color] += lv.cars[i].cap;
    var out = { per: {}, min: Infinity };
    for (k in beanN) {
      if (!beanN.hasOwnProperty(k) || beanN[k] === 0) continue;
      var s = (carCap[k] - beanN[k]) / beanN[k];
      out.per[k] = s;
      if (s < out.min) out.min = s;
    }
    return out;
  }
  PD.colorStats = colorStats;

  // ── 铁律 5：三条硬校验（上线前置，禁止跳过）────────────────
  function validateLevel(lv) {
    var errs = [], i, k;
    if (!lv.beans.length) errs.push('E1_NO_BEANS');

    var cnt = {}, cap = {};
    for (i = 0; i < lv.beans.length; i++) cnt[lv.beans[i].color] = (cnt[lv.beans[i].color] || 0) + 1;
    for (i = 0; i < lv.cars.length; i++) cap[lv.cars[i].color] = (cap[lv.cars[i].color] || 0) + lv.cars[i].cap;

    for (k in cnt) {
      if (!cnt.hasOwnProperty(k)) continue;
      if (!cap[k]) errs.push('E2_COLOR_NO_CAR:' + k);
      else if (cap[k] < cnt[k]) errs.push('E3_NEG_REDUNDANCY:' + k);   // 负冗余数学上不可通关
    }

    // E4 层叠连续性：同格 layer 必须从 0 开始且无悬空
    var byCell = {};
    for (i = 0; i < lv.beans.length; i++) {
      var b = lv.beans[i], ck = b.gx + '_' + b.gy;
      (byCell[ck] = byCell[ck] || []).push(b.layer);
    }
    for (k in byCell) {
      if (!byCell.hasOwnProperty(k)) continue;
      var ls = byCell[k].slice().sort(function (a, b2) { return a - b2; });
      for (i = 0; i < ls.length; i++) {
        if (ls[i] !== i) { errs.push('E4_LAYER_GAP:' + k); break; }
      }
    }
    if (lv.slots > 6 || lv.slots < 1) errs.push('E6_SLOTS_RANGE');

    return errs;
  }
  PD.validateLevel = validateLevel;

  // ══════════════════════════════════════════════════════════════════
  // 【口径单一真值源】simulateRuntime —— 真机规则的唯一权威实现
  // ══════════════════════════════════════════════════════════════════
  // 【为什么必须存在这个函数 · 全项目最贵的一条经验】
  //
  // 历史上「真机规则」被重复实现了四遍：
  //   pd-core/solveLevel、pd-game 运行时、tools/validate-levels/simRuntime、
  //   tools/winrate/playOnce、pd-levelgen/refPlay（其实是五遍）
  // 每次改规则都要同步改五处，漏一处就产生【假绿灯】——
  // 已知坑 10 的事故正是这样来的：求解器全绿，真机 200 局 112 局死局。
  //
  // 现在把真机规则收拢到这一个函数，其余调用方只准调它、不准自己重写。
  // tools/bench/parity-audit.js 会静态检查「有没有人又偷偷重写了一遍」。
  //
  // 【它与 solveLevel 的分工 —— 这是理解本文件的关键】
  //   solveLevel      = 完美先知【上界】：可从整个队列任意挑车、自动绕开干扰车、
  //                     车位可随时压缩。它回答的问题是
  //                     「这张图案的颜色依赖结构，在最理想操作下有解吗」。
  //                     ⚠️ 它【不是】真机预测器，peakSlots 恒接近 1 是正常的
  //                     （先知从不提前占位），拿它当难度依据必然偏乐观。
  //   simulateRuntime = 真机口径【实测】：只能取队列前 4 格、车位固定 5 个、
  //                     ghost 占死不放行、车位满了只能花广告额度清。
  //                     ⚠️ 一切红线判据、胜率、三星阈值都必须用它。
  //
  // 【正确的单向蕴含关系（parity-audit 的判据）】
  //   solveLevel 判不可解  ⟹  运行时必然不可解     （上界成立，必须满足）
  //   solveLevel 判可解    ⇏  运行时可解           （先知比人强，落差是正常难度）
  // 所以审计要查的是【蕴含有没有被违反】，而不是两者数字是否相等。
  //
  // opt: { slots: 可用车位数(默认5), queueHead: 可取格数(默认4),
  //        clearBudget: 广告清车额度(默认4), autoRelease: 该色清空即放行(默认false),
  //        pick: 挑车策略 'best'(老手·默认) | 'first'(随手·贪心) }
  // 返回 { ok, remain, why, zPeak, sPeak, carMoves, clears }
  function simulateRuntime(lv, opt) {
    opt = opt || {};
    var usable = opt.slots || 5;
    var qHead = opt.queueHead || 4;
    var budget = opt.clearBudget === undefined ? 4 : opt.clearBudget;
    // autoRelease 默认 false —— 用户铁律「车只能靠装满或广告权益离场」。
    // 保留这个开关只为做对照实验（量化多给一条通道会让判定乐观多少），
    // 生产判据【永远不许传 true】。
    var autoRelease = !!opt.autoRelease;
    var beans = [], i, s;
    for (i = 0; i < lv.beans.length; i++) {
      beans.push({ color: lv.beans[i].color, gx: lv.beans[i].gx, gy: lv.beans[i].gy,
                   layer: lv.beans[i].layer, gone: false });
    }
    var bd = buildBounds(beans);
    // 候选区模型：前 qHead 格可取，qHead~2*qHead 格是第二排预览，其余在待发池
    var qn = qHead * 2, q8 = [], pend = [];
    for (i = 0; i < qn; i++) q8.push(null);
    for (i = 0; i < lv.cars.length; i++) { if (i < qn) q8[i] = lv.cars[i]; else pend.push(lv.cars[i]); }
    var slots = [];
    for (i = 0; i < usable; i++) slots.push(null);
    var remain = beans.length, guard = 0, zPeak = 0, sPeak = 0, carMoves = 0, clears = 0;
    // 【第 6 车位】真机默认锁着，看一次激励视频永久解锁（S.slot6Locked）。
    // maxSlots 只在【车位占满且无车可清】的绝境里才启用 —— 与玩家行为一致：
    // 没人会在开局就花广告买第 6 个位，都是卡死了才买。
    var maxSlots = opt.maxSlots === undefined ? 6 : opt.maxSlots;
    var slot6Used = false;

    function movable(b, top, occ) {
      return isPickable(b, top) && !!pathOut(b, occ, bd, null);
    }
    // 取走第 qi 格的车，并让第二排竖直升上来、待发池补第二排（与 pd-game 同动效语义）
    function take(qi) {
      var c = q8[qi]; q8[qi] = null;
      if (qi < qHead && q8[qi + qHead]) {
        q8[qi] = q8[qi + qHead]; q8[qi + qHead] = null;
        if (pend.length) q8[qi + qHead] = pend.shift();
      }
      return c;
    }

    while (remain > 0 && guard++ < 100000) {
      var top = buildTopIndex(beans), occ = buildOccupancy(beans), did = false;
      // ① 在场的车尽量装豆
      for (s = 0; s < usable; s++) {
        var car = slots[s];
        if (!car || car.left <= 0) continue;
        for (i = 0; i < beans.length; i++) {
          var b = beans[i];
          if (b.gone || b.color !== car.color || !movable(b, top, occ)) continue;
          b.gone = true; car.left--; remain--; did = true;
          top = buildTopIndex(beans); occ = buildOccupancy(beans);
          if (car.left === 0) break;
        }
        if (car.left === 0) slots[s] = null;      // 规则 A：装满即离场
      }
      // ② 统计僵尸车（该色场上已无豆但车还占着位）
      var rest = {}, zn = 0;
      for (i = 0; i < beans.length; i++) if (!beans[i].gone) rest[beans[i].color] = 1;
      // 僵尸车统计只算【真车】：ghost 天生就是僵尸，算进去会让红线永久爆红、
      // 失去信号意义。ghost 造成的真实伤害由「车位占满 → 不可解」负责捕捉。
      for (s = 0; s < usable; s++) if (slots[s] && slots[s].decoy !== 1 && !rest[slots[s].color]) zn++;
      if (zn > zPeak) zPeak = zn;
      if (autoRelease) {
        for (s = 0; s < usable; s++) {
          if (slots[s] && slots[s].decoy !== 1 && !rest[slots[s].color]) { slots[s] = null; did = true; }
        }
      }
      var used = 0;
      for (s = 0; s < usable; s++) if (slots[s]) used++;
      if (used > sPeak) sPeak = used;
      if (did) continue;
      // ③ 找空位
      var fi = -1;
      for (i = 0; i < usable; i++) if (!slots[i]) { fi = i; break; }
      if (fi < 0) {
        // 【车位占满】玩家的官方出路 = 「消除」道具（激励视频），优先清 ghost。
        // 这正是变现闭环：失败压力 → 看广告 → 继续。所以判据必须是
        // 【带广告额度也过不了】才算不可解，否则会把所有有难度的关卡误判为 bug。
        if (clears >= budget) {
          return { ok: false, remain: remain, zPeak: zPeak, sPeak: sPeak,
                   clears: clears, carMoves: carMoves, why: '车位占满且广告额度用完' };
        }
        // ══ 【口径对齐 · 2026-08-31 · 第四次口径分裂事故】═══════════════════
        // 【旧代码的错误】兜底是 `if (tgt < 0) tgt = 0;` —— 前两类都没有时
        //   硬清 0 号位那辆【真车】，它的剩余容量凭空蒸发。
        // 【为什么这是错的】运行时 pd-game.js/clearTarget 根本不会这么干：
        //   ① 它有第三类候选「清掉后该色容量仍 >= 该色豆数」（用 colorCapacity 推演）
        //   ② 三类都没有时【返回 -1】→ useClear 在【拉广告之前】就拒绝
        //   ③ 真清了还有 ensureColorCapacity 兜底补一辆车
        //   运行时早就修过这个 bug，注释原文：「玩家看了 30 秒广告，
        //   把自己的关卡打成了必死局」。而模拟器把这个已修复的 bug 又实现了一遍。
        // 【造成的假象】S=0 时任何一次 clear 都制造单色负冗余 → 关卡数学上必死
        //   → 实测「凡 clears>0 的关全灭」→ 我据此得出「S=0 与广告变现数学冲突」
        //   这个【P0 级错误结论】，差点去改 LADDER 的 S 契约（而 S=0 是为修
        //   「车没装满就离场」刻意锁死的，改回去等于让旧病复发）。
        // 【教训】审计工具自身也必须接受口径审计。它错报的方向是「更悲观」，
        //   而悲观的假红灯最具欺骗性 —— 它看起来像是「我们发现了严重问题」。
        var tgt = -1;
        // ① ghost 干扰车：场上根本没这个颜色，纯占位，清它零代价
        for (s = 0; s < usable; s++) if (slots[s] && slots[s].decoy === 1) { tgt = s; break; }
        // ② 该色场上已无豆：任务已完成，清它同样零代价
        if (tgt < 0) for (s = 0; s < usable; s++) if (slots[s] && !rest[slots[s].color]) { tgt = s; break; }
        // ③ 清掉后该色总容量仍 >= 该色场上豆数 → 有代价但不制造负冗余。
        //    优先清 left 最小的（损失容量最少）。口径同 pd-game.js/clearTarget。
        if (tgt < 0) {
          var minLeft = 1e9, cc, need2, capLeft, j;
          for (s = 0; s < usable; s++) {
            cc = slots[s]; if (!cc || cc.left <= 0) continue;
            // 该色场上剩余豆数
            need2 = 0;
            for (i = 0; i < beans.length; i++) if (!beans[i].gone && beans[i].color === cc.color) need2++;
            // 除这辆外，该色还剩多少容量（其余车位 + 队列 + 待发池）
            capLeft = 0;
            for (j = 0; j < usable; j++) if (j !== s && slots[j] && slots[j].color === cc.color) capLeft += slots[j].left;
            for (j = 0; j < q8.length; j++) if (q8[j] && q8[j].color === cc.color) capLeft += q8[j].cap;
            for (j = 0; j < pend.length; j++) if (pend[j].color === cc.color) capLeft += pend[j].cap;
            if (capLeft < need2) continue;              // 会造成负冗余 → 不能清
            if (cc.left < minLeft) { minLeft = cc.left; tgt = s; }
          }
        }
        if (tgt < 0) {
        // 三类都没有 → 运行时的「消除」道具会拒绝。但玩家【还有一条官方出路】：
        // ══ 【第 6 车位 · 看广告解锁】pd-game.js: S.slot6Locked ═════════════
        // 【为什么必须建模】这是「车位占满」这个死因的【正面解法】，也是本作
        //   最核心的变现闭环之一（rewardAd('slot6')）。模拟器写死 usable=5、
        //   完全不知道有第 6 个位，于是把「玩家看个广告就能继续」的局面
        //   一律判成死局 —— 这会系统性高估死局率，并且高估的正是【最该变现
        //   的那批局面】，等于用错误数据否定自己的商业模式。
        // 【只能开一次】与运行时一致：解锁后永久可用，不重复消耗。
          if (!slot6Used && usable < maxSlots) {
            slot6Used = true; usable++; slots.push(null); clears++;
            continue;
          }
          return { ok: false, remain: remain, zPeak: zPeak, sPeak: sPeak,
                   clears: clears, carMoves: carMoves, why: '车位占满且无零代价可清车' };
        }
        slots[tgt] = null; clears++; continue;
      }
      // ④ 从队列【前 qHead 格】挑一辆现在就能干活的车
      // 【为什么要区分 pick 策略 · 这是玩家水平的唯一载体】
      // 广告额度、车位数这些【资源】参数刻画不出玩家水平差异 —— 实测把
      // clearBudget 从 4 调到 0，胜率一模一样（Cliff = 0.0），因为死局的主因
      // 是「队列已空」，那条路径根本不消耗额度。资源不是瓶颈，【决策】才是。
      //   'first' = 随手玩家：前 4 格里第一辆能用的就拖（贪心、不看后果）
      //   'best'  = 老手：挑「能装最多可动豆」的那辆（少占位、少空转）
      // 两者跑同一个模拟器，只差这一个挑车规则 —— 这样胜率落差就只来自
      // 决策质量本身，不掺入任何实现差异，Cliff 才是可信的策略深度度量。
      var pickMode = opt.pick || 'best';
      var need = {};
      for (i = 0; i < beans.length; i++) if (movable(beans[i], top, occ)) {
        need[beans[i].color] = (need[beans[i].color] || 0) + 1;
      }
      var best = -1;
      if (pickMode === 'first') {
        for (i = 0; i < qHead; i++) if (q8[i] && need[q8[i].color]) { best = i; break; }
      } else {
        var bs = 0;
        for (i = 0; i < qHead; i++) {
          if (!q8[i]) continue;
          // 匹配度 = min(该色当前可动豆数, 车容量)：装不满的车会变成僵尸占位
          var sc = Math.min(need[q8[i].color] || 0, q8[i].cap);
          if (sc > bs) { bs = sc; best = i; }
        }
        if (bs <= 0) best = -1;
      }
      if (best < 0) {
        // 前 qHead 格全是干扰车/暂时用不上的车时，这【不叫不可解】——
        // 真实玩家可以主动拖一辆没用的车进车位把队列往前推（代价是少一个车位）。
        // 参照认真玩的人：优先牺牲【场上真有这个颜色】的车（迟早用得上），
        // 只有全是 ghost 时才被迫吃一辆 ghost。
        var sac = -1, sacCap = 1e9, sacReal = false, qc;
        for (i = 0; i < qHead; i++) {
          qc = q8[i]; if (!qc) continue;
          var real = !!rest[qc.color];
          if (real && !sacReal) { sacReal = true; sacCap = qc.cap; sac = i; continue; }
          if (real === sacReal && qc.cap < sacCap) { sacCap = qc.cap; sac = i; }
        }
        if (sac < 0) {
          return { ok: false, remain: remain, zPeak: zPeak, sPeak: sPeak,
                   clears: clears, carMoves: carMoves, why: '队列已空' };
        }
        // ══ 【换车道具 · 看广告】pd-game.js: doRefreshShuffle ══════════════
        // 【为什么必须建模】上面那段「被迫牺牲一辆车」描述的正是「前 4 格全是
        //   现在用不上的车」。而真机对这个局面有专门的解药：换车道具会把
        //   【此刻真能干活的车】定向排到前排（rank: 能打开新战线=2 > 已有同色在干=1
        //   > ghost/无可取豆=0）。不建模它，模拟器就会在【玩家看个广告就能继续】
        //   的局面里选择「牺牲一个车位硬吞一辆废车」—— 那是【比真实玩家更差】的
        //   打法，于是把自己一步步推进车位占满的死局，再把这个自残结果
        //   当成「关卡设计有问题」报出来。
        // 【额度共享】与清车共用 budget —— 两者都是激励视频，真实玩家的广告
        //   忍受度是一个总量，不是每个道具各一份。
        if (clears < budget) {
          // 把队列里【现在就能装到豆】的车重排到前 qHead 格，口径同 doRefreshShuffle。
          var all = [], k;
          for (k = 0; k < q8.length; k++) if (q8[k]) all.push(q8[k]);
          for (k = 0; k < pend.length; k++) all.push(pend[k]);
          var onDuty = {};
          for (k = 0; k < usable; k++) if (slots[k] && slots[k].left > 0) onDuty[slots[k].color] = 1;
          var improved = false;
          for (k = 0; k < all.length; k++) {
            if (all[k].decoy === 1) { all[k]._rk = 0; continue; }
            if (!need[all[k].color]) { all[k]._rk = 0; continue; }
            all[k]._rk = onDuty[all[k].color] ? 1 : 2;
            improved = true;                       // 至少有一辆真能干活
          }
          if (improved) {
            all.sort(function (x, y) { return (y._rk - x._rk) || (y.cap - x.cap); });
            for (k = 0; k < q8.length; k++) q8[k] = k < all.length ? all[k] : null;
            pend.length = 0;
            for (k = q8.length; k < all.length; k++) pend.push(all[k]);
            for (k = 0; k < all.length; k++) delete all[k]._rk;
            clears++;
            continue;                              // 重新跑一轮，现在前排有能用的车了
          }
        }
        best = sac;
      }
      var pk = take(best);
      slots[fi] = { color: pk.color, cap: pk.cap, left: pk.cap, decoy: pk.decoy || 0 };
      carMoves++;
    }
    return { ok: remain === 0, remain: remain, zPeak: zPeak, sPeak: sPeak,
             clears: clears, carMoves: carMoves };
  }
  PD.simulateRuntime = simulateRuntime;

  // ── 可解性求解器 v2【完美先知上界 · 不是真机预测器】──────────
  // ⚠️ 读之前先看上面 simulateRuntime 的分工说明：
  //    本函数是【上界】，peakSlots 恒接近 1 属于设计内行为，
  //    任何红线/胜率/三星判据都必须改用 PD.simulateRuntime。
  //
  // 【v1 三处口径失真，已全部修掉】
  //  ① 只判 isPickable(Z轴)，没判 pathOut(XY 走路) —— 而运行时 canWalk 是两者 AND。
  //     → v1 的 solvable/minMoves 全部偏乐观，不能当难度依据。现在 opt.walk 打开走路判定。
  //  ② slots 写死用 lv.slots(=6)，但运行时第 6 车位默认锁着，实际只有 5。
  //     → 现在由 opt.slots 传入真实可用车位数。
  //  ③ minMoves 混算了「装豆次数 + 调车次数」，而运行时 S.moves 只在拖车时 ++。
  //     → 现在额外产出 carMoves（纯调车次数），三星阈值必须用它。
  //
  // 【v2 仍保留的三处「先知特权」—— 这是它作为上界的定义，不是 bug】
  //  ⓐ 可从整个 queue 任意位置挑车（运行时只能取前 4 格）
  //  ⓑ 于是能自动绕开所有 ghost 干扰车（运行时前 4 格全是 ghost 时必须硬吃一辆）
  //  ⓒ 车位随时压缩（运行时车位是固定物理槽）
  // 这三条使 peakSlots 恒接近 1、solvable 恒偏乐观。
  // ⚠️ 所以【绝对不要】用本函数的 peakSlots 去校验「车位峰值 ≤ 6」那条铁律，
  //    也不要用它的 solvable 当上线门禁的唯一判据 —— 要用 PD.simulateRuntime。
  //
  // 另新增 zombiePeak：同时存在的「该色已清空但车未走」的车数峰值。
  // 这是死局的真正预测指标 —— zombiePeak >= 可用车位 = 必死局。
  //
  // 产出：{ solvable, carMoves, minMoves, peakSlots, zombiePeak, stuckRemain }
  function solveLevel(lv, opt) {
    opt = opt || {};
    var maxSlots = opt.slots || lv.slots || 6;
    var useWalk = !!opt.walk;
    var beans = [], i;
    for (i = 0; i < lv.beans.length; i++) {
      beans.push({ id: lv.beans[i].id, color: lv.beans[i].color, gx: lv.beans[i].gx, gy: lv.beans[i].gy, layer: lv.beans[i].layer, gone: false });
    }
    var bd = buildBounds(beans);
    var queue = lv.cars.slice();
    var slots = [], moves = 0, carMoves = 0, peak = 0, zPeak = 0, guard = 0;
    var remain = beans.length;

    // 运行时同口径的可动性判定：Z 轴可取 且 XY 有路走得出豆阵
    function movable(b, top, occ) {
      if (!isPickable(b, top)) return false;
      if (!useWalk) return true;
      return !!pathOut(b, occ, bd, null);
    }

    while (remain > 0 && guard++ < 200000) {
      var top = buildTopIndex(beans);
      var occ = useWalk ? buildOccupancy(beans) : null;

      // 统计各色可动豆数，优先放「可动豆最多」的颜色车（贪心）
      var need = {};
      for (i = 0; i < beans.length; i++) {
        if (movable(beans[i], top, occ)) need[beans[i].color] = (need[beans[i].color] || 0) + 1;
      }

      // 先尽量装车
      var did = false;
      for (var s = 0; s < slots.length; s++) {
        var car = slots[s];
        if (!car || car.left <= 0) continue;
        for (i = 0; i < beans.length; i++) {
          var b = beans[i];
          if (b.gone || b.color !== car.color) continue;
          if (!movable(b, top, occ)) continue;
          b.gone = true; car.left--; remain--; moves++; did = true;
          top = buildTopIndex(beans);
          if (useWalk) occ = buildOccupancy(beans);
          if (car.left === 0) break;
        }
        if (car.left === 0) slots[s] = null;
      }

      // ── 僵尸车统计【不再自动放行 · 与运行时同口径】──────────────────
      // 【为什么改】用户铁律：车只能靠「装满」或「广告权益」离场。运行时已删掉
      // 「该色清空 → 未装满也开走」这条通道（根因是 deriveCars 的冗余率 S，现已归零：
      // 每色总容量 === 豆数 → 每辆车都刚好装满 → 规则 A 覆盖 100% 的正常离场）。
      // 求解器若还保留自动放行，就会比运行时更宽松 → 报「可解」但真机上卡死，
      // 这正是历史注释里说过的「求解器绿灯是假的」。所以这里只统计不放行。
      var restColor = {};
      for (i = 0; i < beans.length; i++) if (!beans[i].gone) restColor[beans[i].color] = 1;
      var zn = 0;
      for (s = 0; s < slots.length; s++) {
        if (slots[s] && !restColor[slots[s].color]) zn++;   // 仅计数：占着位，等广告拖走
      }
      if (zn > zPeak) zPeak = zn;
      // 压缩车位
      var ns = [];
      for (i = 0; i < slots.length; i++) if (slots[i]) ns.push(slots[i]);
      slots = ns;
      if (slots.length > peak) peak = slots.length;

      if (did) continue;

      // 装不动了 → 从队列补车（选可动豆最多的颜色）
      if (slots.length >= maxSlots || !queue.length) {
        return { solvable: false, carMoves: carMoves, minMoves: moves, peakSlots: peak, zombiePeak: zPeak, stuckRemain: remain };
      }
      var best = -1, bestScore = -1;
      for (i = 0; i < queue.length; i++) {
        var sc = need[queue[i].color] || 0;
        if (sc > bestScore) { bestScore = sc; best = i; }
      }
      if (bestScore <= 0) {
        // 没有任何可动豆匹配队列中任何车 → 真死局
        return { solvable: false, carMoves: carMoves, minMoves: moves, peakSlots: peak, zombiePeak: zPeak, stuckRemain: remain };
      }
      var pick = queue.splice(best, 1)[0];
      slots.push({ color: pick.color, cap: pick.cap, left: pick.cap });
      moves++; carMoves++;
      if (slots.length > peak) peak = slots.length;
    }
    return { solvable: remain === 0, carMoves: carMoves, minMoves: moves, peakSlots: peak, zombiePeak: zPeak, stuckRemain: remain };
  }
  PD.solveLevel = solveLevel;
})();
