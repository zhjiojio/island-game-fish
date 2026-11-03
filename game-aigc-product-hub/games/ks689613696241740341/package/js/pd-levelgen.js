/**
 * 快来帮帮我 · 程序化关卡生成系统 v1
 * ═══════════════════════════════════════════════════════════════════
 * 【设计核心 · 架构反转】
 *
 * 旧数据流：图案 → 豆数 → 车容量 → 难度        （图案决定难度 → 图案一换难度就飘）
 * 新数据流：关卡号 → 难度契约 → 反向约束图案生成  （难度是契约，图案是自由变量）
 *
 * 于是达成用户诉求：
 *   「难度是固定的，但每次的图案不一样，解法很多」
 *
 * 难度由 DIFFICULTY(n) 锁死的 4 个数：S(冗余) / C(色数) / N(豆数) / slots(车位)
 * 图案只能在【不影响难度】的两个维度上自由变化：
 *   ① 轮廓形状 —— 6 种裙型 × 随机参数（豆数被精确压回契约值 N）
 *   ② 配色分布 —— 5 种上色模式（每色配额由契约 C 均分，只是"长在哪"随机）
 *
 * 因此：同一关卡号，1000 个 seed → 1000 张不同的图，但 S/C/N 完全一致。
 * ═══════════════════════════════════════════════════════════════════
 * 语法：ES5 ONLY（project.config.json setting.es6 = false）
 */
(function () {
  var M3 = window.M3 = window.M3 || {};
  var PD = M3.PD;
  if (!PD) { console.error('[levelgen] pd-core.js 必须先加载'); return; }

  var LG = PD.LG = {};

  // ── 确定性伪随机（同 seed 必得同一张图，便于回归与分享复现）──────
  function rng(seed) {
    var s = (seed | 0) || 1;
    if (s < 0) s = -s;
    return function () {
      // xorshift32：比 LCG 低位随机性好得多（LCG 低位周期短，会让波点排出条纹）
      s ^= s << 13; s |= 0;
      s ^= s >>> 17;
      s ^= s << 5;  s |= 0;
      return ((s >>> 0) % 100000) / 100000;
    };
  }
  LG.rng = rng;

  // ═══════════════════════════════════════════════════════════════
  // 一.5、造型库 ART（用户要求：多元造型，别只有裙子）
  // ═══════════════════════════════════════════════════════════════
  // 【为什么改成像素画模板而不是参数化轮廓】
  //  旧版 genShape 用「每行宽度 = 函数(纵向进度)」画裙型 —— 数学上只能产出
  //  上下对称、每行连续的"锥形/钟形"，6 个 SHAPES 看起来几乎一样，用户原话「太丑了」。
  //  像素画模板可以画爱心的双峰、西瓜的直边、冰淇淋的球+锥、火炬的火苗，
  //  这些都是参数化函数画不出来的形状。
  //
  // 【为什么允许行内有洞】单层关卡（maxLayer=0）下 isPickable 恒真，
  //  唯一约束是 pathOut（BFS 走到阵外）。豆子是从外向内"剥"的，洞只会让路更好走。
  //  所以不再需要旧版「每行必须连续」的限制 —— 这条限制正是造型丑的根因。
  // ── 图案模板【带真颜色】────────────────────────────────
  // 【根因修正 2026-08-28】旧版 px 只有 '#' 和 '.'（纯轮廓），颜色全靠 paintBeans
  // 随机刷。后果是两个致命问题共同的根：
  //   ① 图丑：西瓜被刷成随机色块，不是西瓜了
  //   ② 没难度：随机刷色 → 外圈混了 4~5 种色 → R（可动色数）=4.13，
  //     而可用车位 5 个 → 随便放都能撞上一种 → 「车位占满且无色可装」永远不发生
  //
  // 对照参考游戏：西瓜 = 黑描边 + 红瓜肉 + 绿瓜皮 + 白籽，外圈全黑 → R=1。
  // 真实像素画的颜色天生成块（黑边一圈、绿皮一条、红肉一大片），
  // 成块就自然产生依赖顺序：外圈不清，里面动不了。
  // 所以「图好看」和「有难度」不冲突，反而是同一件事 —— 不需要任何人为设计的
  // 「同心色环」或「内部黑线分区」，只要用真实像素画自带的颜色。
  //
  // 字母→豆人颜色（与 pd-core 的 COLOR_KEYS 一致，7 色全部可用）：
  //   k=black  w=white  r=red  g=green  p=pink  c=cyan  y=yellow   .=空
  var CH2COL = { k: 'black', w: 'white', r: 'red', g: 'green', p: 'pink', c: 'cyan', y: 'yellow' };
  var ART = [
    // 西瓜：4 色（黑边/红肉/绿皮/白籽）—— 对应参考图关卡1
    { name: 'melon', title: '西瓜', C: 4, px: [
      '......kk......',
      '.....kwwk.....',
      '....krrrrk....',
      '...krrwrrrk...',
      '..krrrrrrrrk..',
      '.krrwrrrrwrrk.',
      'krrrrrrrrrrrrk',
      'kggggggggggggk',
      'kwwwwwwwwwwwwk',
      '.kk........kk.',
      '.kr........rk.',
      '.kk........kk.'] },
    // 冰淇淋：7 色 —— 对应参考图关卡2（它的难度就来自「色数多」）
    { name: 'icecream', title: '冰淇淋', C: 7, px: [
      '...kkrrrkk...',
      '..krrrrrrrk..',
      '.kwwwwwwwwwk.',
      '.kwwrrrrrwwk.',
      '.kwwwwwwwwwk.',
      'kpppppppppppk',
      'kppppppppppgk',
      'kcccccccccck.',
      '.kccyyyyccck.',
      '..kcccccck...',
      '...kkcckk....',
      '.....kk......'] },
    // 爱心：3 色（教学用，最简）
    { name: 'heart', title: '爱心', C: 3, px: [
      '.kkk...kkk.',
      'kpppkkkpppk',
      'kppwppppppk',
      'kpppppppppk',
      '.kppppppppk',
      '..kpppppppk',
      '...kpppppk.',
      '....kppppk.',
      '.....kppk..',
      '......kk...'] },
    // 鲜花：5 色
    { name: 'flower', title: '鲜花', C: 5, px: [
      '...kkppkk...',
      '..kpppppppk.',
      '.kppppppppk.',
      'kppppyyppppk',
      'kpppyyyypppk',
      'kppppyyppppk',
      '.kppppppppk.',
      '..kkgggkk...',
      '....kgk.....',
      '...kggggk...',
      '..kgggggk...',
      '...kkggkk...'] },
    // 星星：3 色
    { name: 'star', title: '星星', C: 3, px: [
      '.....kk.....',
      '....kyyk....',
      '....kyyk....',
      'kkkkyyyykkkk',
      'kyyyyyyyyyyk',
      '.kyyyyyyyyk.',
      '..kyyyyyyk..',
      '..kkywwykk..',
      '.kk...kk.kk.',
      'kk.....kk.kk'] },
    // 蚏菇：4 色
    { name: 'mushroom', title: '蚏菇', C: 4, px: [
      '...kkrrkk...',
      '..krrrrrrk..',
      '.krrwrrwrrk.',
      'krrrrrrrrrrk',
      'krwrrrrrrwrk',
      'kkkkkkkkkkkk',
      '...kwwwwk...',
      '...kwwwwk...',
      '...kwppwk...',
      '...kwwwwk...',
      '..kwwwwwwk..',
      '..kkkkkkkk..'] },
    // 钻石：4 色
    { name: 'diamond', title: '钻石', C: 4, px: [
      '..kkkkkkkk..',
      '.kccwwwwcck.',
      'kcccwwwwccck',
      'kkcccccccckk',
      '.kkcccccckk.',
      '..kkcccckk..',
      '...kkcckk...',
      '....kkkk....',
      '.....kk.....'] },
    // 月亮：3 色
    { name: 'moon', title: '月亮', C: 3, px: [
      '...kkkk.....',
      '..kyyyyk....',
      '.kyyyyyyk...',
      'kyyyykkyyk..',
      'kyyyk..kyyk.',
      'kyyyk...kyk.',
      'kyyyk...kyk.',
      'kyyyyk.kyyk.',
      '.kyyyykkyyk.',
      '..kyyyyyyk..',
      '...kkyyyk...',
      '.....kkk....'] },
    // 圣诞树：4 色
    { name: 'tree', title: '圣诞树', C: 4, px: [
      '.....kk.....',
      '....kyyk....',
      '....kggk....',
      '...kggggk...',
      '..kggrgggk..',
      '.kgggggggk..',
      'kgggrggggggk',
      '.kgggggggk..',
      'kggggrgggggk',
      '.kkggggggkk.',
      '....kwwk....',
      '....kwwk....'] },
    // 气球：4 色
    { name: 'balloon', title: '气球', C: 4, px: [
      '...kkppkk...',
      '..kpppppppk.',
      '.kppwppppppk',
      'kppwpppppppk',
      'kppppppppppk',
      'kppppppppppk',
      '.kppppppppk.',
      '..kppppppk..',
      '...kkppkk...',
      '....kck.....',
      '.....kc.....',
      '.....ck.....'] },
    // 棒棒糖：5 色
    { name: 'lolli', title: '棒棒糖', C: 5, px: [
      '...kkkkkk...',
      '..kpppcccck.',
      '.kppyyyyccck',
      'kppyyggyycck',
      'kpyyggggyyck',
      'kpyyggggyyck',
      'kppyyggyycck',
      '.kppyyyyccck',
      '..kpppcccck.',
      '...kkkkkk...',
      '.....kwk....',
      '.....kwk....'] },
    // 皮卡丘米风（黄圆脸）：4 色
    { name: 'chick', title: '小鸡', C: 4, px: [
      '...kkkkkk...',
      '..kyyyyyyk..',
      '.kyyyyyyyyk.',
      'kyykyyyykyyk',
      'kyykyyyykyyk',
      'kyyyyyyyyyyk',
      'kyyyyrryyyyk',
      '.kyyyyyyyyk.',
      '..kyyyyyyk..',
      '...kkkkkk...',
      '...kw..wk...',
      '..kww..wwk..'] },
    // 房子：5 色
    { name: 'house', title: '小屋', C: 5, px: [
      '.....kk.....',
      '....krrk....',
      '...krrrrk...',
      '..krrrrrrk..',
      '.krrrrrrrrk.',
      'krrrrrrrrrrk',
      'kkkkkkkkkkkk',
      'kwwcwwwwcwwk',
      'kwwcwwwwcwwk',
      'kwwwwwwwwwwk',
      'kwwwwyywwwwk',
      'kkkkkkkkkkkk'] },
    // 鱼：5 色
    { name: 'fish', title: '小鱼', C: 5, px: [
      '....kkkk....',
      '..kkccccckk.',
      '.kcccccccck.',
      'kccwkccccck.',
      'kcccccccccck',
      'kcccccccccck',
      'kccyyyycccck',
      '.kcccccccck.',
      '..kkcccckk..',
      '....kkkk.k..',
      '.........kk.',
      '..........k.'] }
  ];
  LG.ART = ART;
  // 供 genLevel 成功产出后登记【真正用上的那张图】，避开重试噪声。
  LG._markArtUsed = function (name) { if (name) _markUsed(name); };

  // ── 网格硬上限【按真实布局重算，2026-08 修正】──────────────────
  // 【旧值 26×30 / N=196 是错的】那是按 cell=32 算的遗留值。豆子缩到 60% 后
  // pd-game.js:415 的 cell 上限已经是 20，实际可用空间是：
  //   maxW = 618                                  → 列上限 618/20 = 30
  //   maxH = laneY(862) − stageY(112) − 30 = 720   → 行上限 720/20 = 36
  // → 网格容量 30×36 = 1080 格，旧的 196 豆只用掉 18%。
  // 【为什么必须放开】剥离深度 maxDepth 决定「洋葱壳能不能真的围住内层」：
  //   N=196 → 15×20 网格 → maxDepth 8（图形是薄片，第一层就吃掉大半格子）
  //   N=400 → 26×26 网格 → maxDepth 11
  //   N=500 → 26×26 网格 → maxDepth 13   ← 足以切出 3~4 层纯色壳 + 实心内芯
  // 图形有了厚度，pathOut 才真的走不出来，「依赖关系陷阱」才成立。
  var COL_MAX = 30, ROW_MAX = 36;

  // 最近邻重采样：把模板缩放到 s 倍
  // 【颜色管线修正】旧版 g[r][c] 只存 true/false，把 art 自带的颜色丢弃了。
  // 现在 g[r][c] 存颜色字符（'k'/'r'/'g'…）或 null，全程不丢色。
  // 注意：颜色字符是 truthy、null 是 falsy，所以所有 if (g[r][c]) 的判断仍然成立。
  function sampleArt(px, s) {
    var h0 = px.length, w0 = px[0].length;
    var h = Math.max(3, Math.min(ROW_MAX, Math.round(h0 * s)));
    var w = Math.max(3, Math.min(COL_MAX, Math.round(w0 * s)));
    var g = [], cnt = 0, r, c;
    for (r = 0; r < h; r++) {
      var row = [];
      for (c = 0; c < w; c++) {
        var ch = px[Math.min(h0 - 1, Math.floor(r * h0 / h))]
                 .charAt(Math.min(w0 - 1, Math.floor(c * w0 / w)));
        var col = CH2COL[ch] ? ch : null;      // 保留颜色字符，非色字符（'.'）为空
        row.push(col); if (col) cnt++;
      }
      g.push(row);
    }
    return { g: g, rows: h, cols: w, count: cnt };
  }

  // 数某格的 8 邻域已填数（用于"从最松散的边缘开始削"，保持轮廓完整）
  function nb(g, rows, cols, r, c) {
    var n = 0, dr, dc;
    for (dr = -1; dr <= 1; dr++) for (dc = -1; dc <= 1; dc++) {
      if (!dr && !dc) continue;
      var rr = r + dr, cc = c + dc;
      if (rr >= 0 && rr < rows && cc >= 0 && cc < cols && g[rr][cc]) n++;
    }
    return n;
  }

  // 豆数闸门（造型版）：削 = 侵蚀最松散的边缘格；补 = 贴在邻居最多的空格
  // 这样轮廓只会"胖一点/瘦一点"，不会像旧版那样被撑成矩形砖块。
  function gateN(S, targetN, rand) {
    var g = S.g, rows = S.rows, cols = S.cols, guard = 0, r, c;
    while (S.count > targetN && guard++ < 8000) {
      var cand = [], minN = 9;
      for (r = 0; r < rows; r++) for (c = 0; c < cols; c++) {
        if (!g[r][c]) continue;
        var k = nb(g, rows, cols, r, c);
        if (k < minN) { minN = k; cand = [[r, c]]; }
        else if (k === minN) cand.push([r, c]);
      }
      if (!cand.length) break;
      var p = cand[Math.floor(rand() * cand.length)];
      g[p[0]][p[1]] = null; S.count--;      // 【颜色管线】置空用 null，不用 false
    }
    guard = 0;
    while (S.count < targetN && guard++ < 8000) {
      var cand2 = [], maxN = 0;
      for (r = 0; r < rows; r++) for (c = 0; c < cols; c++) {
        if (g[r][c]) continue;
        var k2 = nb(g, rows, cols, r, c);
        if (k2 > maxN) { maxN = k2; cand2 = [[r, c]]; }
        else if (k2 === maxN) cand2.push([r, c]);
      }
      if (!cand2.length || maxN === 0) break;
      var p2 = cand2[Math.floor(rand() * cand2.length)];
      // 【颜色管线】补格子时必须给颜色，否则会出现 true 污染颜色场。
      // 取 8 邻域里出现最多的色 → 补出来的格子融入周围色块，不破坏图案。
      g[p2[0]][p2[1]] = domCol(g, rows, cols, p2[0], p2[1]); S.count++;
    }
    return S;
  }

  // 【颜色管线】取某格 8 邻域中出现最多的颜色（用于补格子时融入周围色块）
  function domCol(g, rows, cols, r, c) {
    var tally = {}, best = null, bestN = 0, dr, dc;
    for (dr = -1; dr <= 1; dr++) for (dc = -1; dc <= 1; dc++) {
      if (!dr && !dc) continue;
      var rr = r + dr, cc = c + dc;
      if (rr < 0 || rr >= rows || cc < 0 || cc >= cols) continue;
      var v = g[rr][cc];
      if (!v) continue;
      tally[v] = (tally[v] || 0) + 1;
      if (tally[v] > bestN) { bestN = tally[v]; best = v; }
    }
    return best || 'k';                    // 邻域全空（理论上不会）→ 兑成黑边
  }

  // 裁掉四周空行空列（bounds 计算要求无空行）
  function crop(S) {
    var r, c, r0 = -1, r1 = -1, c0 = 1e9, c1 = -1;
    for (r = 0; r < S.rows; r++) for (c = 0; c < S.cols; c++) if (S.g[r][c]) {
      if (r0 < 0) r0 = r; r1 = r;
      if (c < c0) c0 = c; if (c > c1) c1 = c;
    }
    if (r0 < 0) return S;
    var out = [];
    for (r = r0; r <= r1; r++) {
      var row = [];
      for (c = c0; c <= c1; c++) row.push(S.g[r][c]);
      out.push(row);
    }
    return { g: out, rows: out.length, cols: (c1 - c0 + 1), count: S.count };
  }

  // 镜像 / 转置变体：14 个模板 × 4 种朝向 = 56 种视觉，把重复率压下去。
  // 【为什么需要】120 局只有 14 个模板 → 鸽笼原理下重复率必然 ~6%（实测 5.8%），
  // 靠加模板成本高，而几何变换是零成本的，且玩家观感上确实是"另一个图"。
  function orient(px, mode) {
    var h = px.length, w = px[0].length, out = [], r, c, row;
    if (mode === 1) {                       // 左右镜像
      for (r = 0; r < h; r++) { row = ''; for (c = w - 1; c >= 0; c--) row += px[r].charAt(c); out.push(row); }
    } else if (mode === 2) {                 // 转置（顺时针 90°）
      for (c = 0; c < w; c++) { row = ''; for (r = h - 1; r >= 0; r--) row += px[r].charAt(c); out.push(row); }
    } else if (mode === 3) {                 // 逆时针 90°
      for (c = w - 1; c >= 0; c--) { row = ''; for (r = 0; r < h; r++) row += px[r].charAt(c); out.push(row); }
    } else {
      for (r = 0; r < h; r++) out.push(px[r]);
    }
    return out;
  }

  // 造型主入口：挑模板 → 二分缩放到接近 targetN → 精确闸门 → 裁剪
  // 【难度分级选图】wantC = 本关想要的色数（来自 LADDER 的 D.C）。
  // 参考游戏关卡1=西瓜4色、关卡2=冰淇淋7色 —— 难度靠「换更复杂的画」，
  // 不是把西瓜刷成7色。所以这里按色数筛图，色数就是难度旋钮。
  // 筛不到就放宽 ±1，再不行才全库随机（保证永远有图可出）。
  // ══ 【图案多样性 · 关卡间去重轮转】═══════════════════════════════
  // 【为什么需要它】pickArtByC 按色数精确筛图，而 wantC 在 20 关里绝大多数是 5，
  //   于是候选池恒为 {flower, lolli, house, fish}；再叠加 gateN 豆数闸门淘汰，
  //   实测 60 局里 lolli 独占 53 局（88%）—— 玩家连打十几关看到的是同一张图。
  // 【为什么"加大随机"治不好】每次 genLevel 都用独立 seed 的 rand()，
  //   它没有跨关记忆，无法知道"上一关已经出过 lolli"。独立同分布的随机
  //   本来就会撞车，这不是随机性不够，是【缺少跨关状态】。
  //   （这正是"同一假设连续两次改参数都无效时该怀疑假设本身"的实例。）
  // 【做法】按色数分桶，桶内维护一个洗过的轮转序列：同色数的图案在
  //   用完一轮之前不重复。既保住"色数=难度旋钮"的契约，又把多样性拉满。
  var _artCycle = {};        // wantC -> { list: [...], i: 0 }
  // 【全局最近使用记忆】轮转器按 wantC 分桶，跨桶时两个桶各自的"下一张"
  // 可能是同一张图 → 相邻关撞车（实测相邻关同图率 16.7%）。
  // 桶内轮转解决"长期分布均匀"，这条记忆解决"短期不要连着重复"——
  // 两个不同的问题，需要两个机制，不能指望一个把两件事都做了。
  var _recent = [];
  // 【窗口必须自适应候选池 · 不能写死】实测序列显示关6+ 的候选池实质只有
  // 2~3 张（house/diamond 来回循环），窗口写死 3 时"最近 3 关都用过"恒真，
  // 回退分支 hit=st.i 每次都触发 → 记忆完全失效，V10 反而从 16.7% 涨到 26.3%。
  // 【这是第 5 次改参数无效】说明写死常量本身就是错的假设。
  // 正解：窗口 = min(池子-1, 3) —— 池子只有 2 张时窗口 1（至少不连着重复），
  // 池子充裕时才用 3。让机制在自己能生效的范围内工作，而不是许下做不到的承诺。
  var RECENT_N = 3;
  function _isRecent(name, lim) {
    var from = Math.max(0, _recent.length - lim);
    for (var r = from; r < _recent.length; r++) if (_recent[r] === name) return true;
    return false;
  }
  function _markUsed(name) {
    _recent.push(name);
    while (_recent.length > RECENT_N) _recent.shift();
  }
  function nextArtOfC(rand, pool, wantC) {
    var key = 'c' + wantC + '_' + pool.length;
    var st = _artCycle[key];
    if (!st || st.i >= st.list.length) {
      // Fisher-Yates 洗牌：保证一轮内每张图恰好出现一次，轮与轮之间顺序不同
      var arr = pool.slice(), i, j, t;
      for (i = arr.length - 1; i > 0; i--) {
        j = Math.floor(rand() * (i + 1)) % (i + 1);
        t = arr[i]; arr[i] = arr[j]; arr[j] = t;
      }
      // 跨轮衔接：新一轮的第一张不要和上一轮的最后一张相同，避免"连着两关同图"
      if (st && st.list.length && arr.length > 1 && arr[0].name === st.list[st.list.length - 1].name) {
        t = arr[0]; arr[0] = arr[1]; arr[1] = t;
      }
      st = _artCycle[key] = { list: arr, i: 0 };
    }
    // 窗口按【本桶实际可选张数】收缩，保证约束永远是可满足的
    var lim = Math.max(1, Math.min(RECENT_N, st.list.length - 1));
    var probe = st.i, n = st.list.length, hit = -1, c;
    for (c = 0; c < n; c++) {
      var idx = probe + c;
      if (idx >= n) break;                          // 不跨轮找，避免打乱轮转公平性
      if (!_isRecent(st.list[idx].name, lim)) { hit = idx; break; }
    }
    if (hit < 0) hit = st.i;
    // 把命中的那张换到当前位置（保持"一轮内每张恰好一次"的不变量）
    if (hit !== st.i) { var tmp = st.list[st.i]; st.list[st.i] = st.list[hit]; st.list[hit] = tmp; }
    var got = st.list[st.i++];
    // ⚠️【不在这里登记】。genLevel 每次重试都会调 pickArtByC，前 N-1 次的选择
    // 全部被丢弃。若在此登记，_recent 记住的是【被淘汰的图】而不是
    // 【实际产出的图】—— 记忆全是噪声，机制永远不会生效。
    // 这正是我连续六次改参数（池子/方向/阈值/窗口）都纹丝不动的真正原因：
    // 【时点错了，不在任何参数里】。登记改到 genLevel 成功返回前。
    return got;
  }
  function pickArtByC(rand, wantC, lvNo) {
    var i, pool = [];
    // 【第一关固定西瓜】对齐参考图关卡1：黑边+红肉+绿皮+白籽，4 色、cap 33。
    // 第一印象决定玩家留存，不能随机抽到小鸡或小鱼。
    if (lvNo === 1) {
      for (i = 0; i < ART.length; i++) if (ART[i].name === 'melon') return ART[i];
    }
    for (i = 0; i < ART.length; i++) if (ART[i].C === wantC) pool.push(ART[i]);
    // 【放宽到 ±1 / ±2 是常态不是兜底】精确同色数的图往往只有 3~4 张，
    // 池子太小必然重复。±色数对难度的影响远小于"连打十关同一张图"对体验的伤害
    // —— 而且真正的难度旋钮是 deriveCars 的 cap/车数，不是图案色数本身。
    // 【为什么阈值要到 8】ART 只有 14 张，且 gateN（豆数闸门）会淘汰掉大半，
    //   候选池 5 张时实测仍有 78% 落在同一张图上。必须让【进入轮转的候选】
    //   远多于【实际能过闸门的张数】，轮转才有意义。
    for (var w = 1; w <= 2 && pool.length < 8; w++) {
      for (i = 0; i < ART.length; i++) {
        if (Math.abs(ART[i].C - wantC) === w) pool.push(ART[i]);
      }
    }
    if (!pool.length) pool = ART;
    return nextArtOfC(rand, pool, wantC);
  }

  function genArt(seed, targetN, wantC, lvNo) {
    var rand = rng(seed ^ 0x1f2e3d4c);
    var a = wantC ? pickArtByC(rand, wantC, lvNo)
                  : ART[Math.floor(rand() * ART.length) % ART.length];
    // 【朝向修正 2026-08-28】旧版允许 4 种朝向（含 90°/270° 转置）。
    // 纯轮廓时代无所谓（爱心转了还是爱心），但现在是真实像素画：
    // 转置会让小鸡躺着、冰淇淋倒过来、西瓜横过来 —— 图立刻变丑，
    // 而用户的要求是「豆子拼出来的图像好看」。
    // 所以带色图案只允许 0=原样 / 1=左右镜像（镜像后仍然是正立的）。
    var om = Math.floor(rand() * 2) % 2;
    var basePx = orient(a.px, om);
    // 扫描缩放系数，取填充数最接近 targetN 的那档（步长细 → 闸门只需微调几格）
    var best = null, bestD = 1e9, s;
    for (s = 0.5; s <= 3.2; s += 0.05) {
      var t = sampleArt(basePx, s);
      if (t.rows > ROW_MAX || t.cols > COL_MAX) break;
      var d = Math.abs(t.count - targetN);
      if (d < bestD) { bestD = d; best = t; }
    }
    if (!best) return null;
    var S2 = crop(gateN(best, targetN, rand));
    if (S2.count !== targetN) return null;          // 闸门没达标 → 让 genLevel 换 seed 重试
    return { grid: S2.g, rows: S2.rows, cols: S2.cols, count: S2.count,
             kind: a.name + (om ? '_' + om : ''), title: a.title };
  }
  LG.genArt = genArt;
  function ri(rand, a, b) { return a + Math.floor(rand() * (b - a + 1)); }   // [a,b] 整数
  function pick(rand, arr) { return arr[Math.floor(rand() * arr.length) % arr.length]; }

  // ═══════════════════════════════════════════════════════════════
  // 一、难度契约 DIFFICULTY(n)
  // ═══════════════════════════════════════════════════════════════
  // 这是整个系统唯一的难度真值来源。图案生成器只能读它，不能改它。
  //
  // 曲线依据 docs/reference-games-teardown.md 第二节「数值设计三参数」：
  //   S: 1-5 关 +25%→18% / 6-15 +15%→12% / 16-30 +10%→6% / 30+ +5%→2%
  //   C: 色数是【真实难度旋钮】—— 色数 ≥ 可用车位时才有车位压力
  //   N: 豆数只控时长不控难度（已知坑 9），所以增长要慢，40 关封顶
  //
  // ⚠️ 车位压力铁律：可用车位 = 5（第 6 位默认锁定，看广告解锁）。
  //    僵尸车峰值必须 < 可用车位，否则必死局。已实现「该色清空即放行」后
  //    僵尸车峰值恒为 1~2，所以色数可以放开到 7。
  //
  // ⚠️⚠️ 豆数 N 的物理上限【2026-08 重算：旧注释是 cell=32 时代的，已废】
  //    【旧结论（错）】cell 32 → 16 行×17 列 = 272 格 → N 上限 196
  //    【新事实】豆子已缩到 60%，pd-game.js:415 的 cell 上限是 20：
  //      maxW = 618                                 → 列上限 618/20 = 30
  //      maxH = laneY(862) − stageY(112) − 30 = 720  → 行上限 720/20 = 36
  //      → 网格容量 30×36 = 1080 格，旧的 196 豆只用掉 18%
  //    【为何必须抬】豆数 → 图形厚度 → 剥离深度 maxDepth，而 maxDepth 直接
  //    决定「洋葱壳能不能真的围死内层」（= 依赖关系陷阱能不能成立）：
  //      N=196 → 15×20 网格 → maxDepth  8（薄片，depth0 就吃掉大半格子，壳围不住）
  //      N=400 → 22×30 网格 → maxDepth 11
  //      N=500 → 26×30 网格 → maxDepth 13  ← 能切出 3~4 层纯色壳 + 实心内芯
  //    【旧记录的“N=340 会变矩形砖块”为何不再成立】那是因为当时 COL/ROW_MAX
  //    卡在 26×30、而 N 又推到 340 → 填充率被逗到 ~0.44 以上且网格无法再长，
  //    削补闸门只能把轮廓撞成满格。现在网格上限同步抬到 30×36，
  //    N=620 对应填充率仅 ≈0.57，轮廓自由度反而比以前宽松。
  // ⚠️⚠️⚠️ 难度阶梯 v2【用户实测反馈后重制】
  //  【旧版病因】1-5 关 S=25%→18%、色数只有 3-4、capMax 恒 30 →
  //   第 2 关 4 色 × 26 豆 = 每色只需 1 辆车 → 全场 4 辆车塞进 5 车位 →
  //   所有车同时在场、永远不用等位 → 【零决策，随便点都能赢】。
  //   第 6 关同理（5 色 5 车 vs 5 车位）。用户原话：「完全没有复杂性，肯定不行」。
  //
  //  【本质认知】难度 ≠ S。真正制造决策的是「车数 / 可用车位」这个比值：
  //     车数 <= 车位数  → 所有车摊开摆着，无需换手，零决策  ← 旧版 1~6 关的状态
  //     车数 >> 车位数  → 必须挑车、必须留位、必须排顺序，才有博弈
  //   所以新版把 capMax 从恒定 30 压到 8~16 → 车数直接翻 2~4 倍。
  //
  //  【新曲线】只有第 1 关是真教学（3 色 / S=20% / 车数≈6）；
  //   第 2 关立刻上强度（4 色 / S=12% / capMax=14 → 车数≈9，是车位的 1.8 倍）。
  //  【v3 · 胜率驱动】用户要求：只看数学概率。新增 d1→d2 = 干扰车数量。
  //  ⚠️ 关键认知（用实测证明的）：S / 色数 / capMax / 车位数 全部只影响观感，
  //     对胜率的影响是 0 —— 扫描 4~7 色 × 3~5 车位 × S 2%~15% × capMax 10~48，
  //     随手乱拖的胜率【全部 100%】，最优解与瞎点的步数方差【恒为 0】。
  //     根因：车队由豆子反推（Σcap(色) ≥ 豆数），且该色清空即自动放行 →
  //     任何时刻都存在可推进动作，且没有任何动作造成不可逆损失 → 数学上不可能输。
  //  所以【唯一能制造失败概率的旋钮就是干扰车】：它的颜色场上根本没有，
  //  永远装不满、永远不会被自动放行，只能占着车位 → 车位耗尽 = 死局。
  //  用户明确选择「不能手动赶车」，出路只有「消除」道具（激励视频）→ 广告位由此成立。
  //  ⚠️⚠️⚠️⚠️ 【用户校准 · 干扰车的真正定义】────────────────────────
  //  用户原话：「干扰车也不是说场上就完全没有，只不过他如果过早的放上去，
  //  可能就浪费了一个坑位，他是有关联关系的，比如在某些颜色移除后才出现！」
  //
  //  所以陷阱的本质不是【颜色不存在】，而是【颜色此刻拿不出来】：
  //  它的豆被外圈豆围住，pathOut 走不出去 → 车装不进豆 → 白占坑位，
  //  必须等围住它的颜色被清空后才解锁。这叫【依赖关系陷阱】。
  //
  //  实现载体 = 洋葱壳上色（paintShell）：把豆阵按剥离深度切成
  //  纯色壳 0 → 纯色壳 1 → 芯，形成 A→B→芯 的解锁链。
  //  于是「颜色在场上真实存在、车也是真车」，但顺序错了就要付代价 ——
  //  这比 ghost（场上完全没有的色）自然得多，也不会让玩家觉得是 bug。
  //  sh1→sh2 = 壳层数（0 = 不锁，纯教学）。
  // ⚠️⚠️⚠️⚠️⚠️ 【S 归零 · 用户铁律：车只有装满或看广告才能走】───────────
  //  用户原话：「那些车都没装满 你咋就让他们跑了？？？车跑的逻辑 only 装满
  //  或者看广告获得的权益」。
  //  【根因不在 pd-game 的离场规则，而在这里】deriveCars 按 need=ceil(n*(1+S))
  //  分配容量 → 每色总容量必然【严格大于】该色豆数（实测每色恒余 3 个座）。
  //  于是每种颜色的最后一辆车在数学上【永远装不满】，规则 A（装满离场）永不触发，
  //  只能靠规则 B（该色清空就放走没装满的车）兜底 —— 那条规则正是用户看到的
  //  「没装满就跑了」。所以删规则 B 是治症状：删了车永久占位、必死局。
  //  【真正的修法】把冗余归零：每色总容量 === 该色豆数 → 每辆车都刚好装满，
  //  规则 A 覆盖 100% 的正常离场，规则 B 退化成只服务「看广告升级扩容」的车。
  //  【为什么可以安全归零】S 从来不是难度旋钮 —— 本文件下方已实测记录：
  //  S 2%~15% 全扫过，胜率恒 100%、步数方差恒 0。真正的胜率旋钮是干扰车和洋葱壳，
  //  两者都不依赖 S。且 validateLevel 只禁止负冗余（cap<cnt），等号完全合法。
  var LADDER = [
    // n0 | s1→s2 单色冗余（已锁 0，见上）| c1→c2 色数 | n1→n2 豆数 | cap1→cap2 容量上限 | d1→d2 干扰车 | sh1→sh2 壳层
    // 第 1 关 = 教学：不锁色、不放干扰车 → 目标 90% 通过率
    // 【cap 修正 2026-08-28】参考图关卡1：西瓜 400+ 豆、只有 4 色、cap=33/33/33/34/34/33。
    //  我们原来是 180 豆 4 色、cap=14 → 清一片要 3 辆车 → 车位周转慢 → 玩家觉得「磨」。
    //  用户抱怨「第一关豆子太多」的真因是 cap 太小而不是 N 太大（人家第一关豆更多）。
    //  「简单」= 清得快，不等于豆少。
    //  注意 cap 受「每色豆数」制约：deriveCars 按色切车，某色只有 45 颗时
    //  再大的 capMax 也切不出 33 的车 —— 而真实像素画颜色天生不均匀
    //  （西瓜红肉占一半、黑边占1/4），红色 180 颗就能切出 33 的大车。
    //  所以 N 要够大、色数要够少，cap 才吃得满。
    { n0: 1,  s1: 0, s2: 0, c1: 4, c2: 4, n1: 360, n2: 380, cap1: 33, cap2: 30, d1: 0, d2: 0, sh1: 0, sh2: 0, tag: '教学' },
    // ── 第 2 关起：洋葱壳 + ghost 混用【用户选定方案 A】────────────────
    // 分工：壳负责制造「看得懂的依赖顺序」（真色被围住，早放就空转占位），
    //       ghost 负责制造「不可挽回的代价」（永久僵尸，只能靠广告清）。
    // 【d 值为何是小数】可用车位=5 → ghost 数量在 4→5 之间是悬崖：
    // 实测第 2 关普通玩家 ghost=4 → 79%，ghost=5 → 31%。目标值落在悬崖中段，
    // 只能靠伯努利取整（见 difficulty/genLevel 注释）混合两档才能命中。
    // 【为何高关的 d 反而不能更大】实测：d≈4.7 时第2关 50%、第12关 23%、第25关 5%。
    // 同一个 d 在高关就已经更致命了 —— 因为高关壳层更厚（sh 3~4）、色数更多、
    // 车数更多，陷阱叠加效应很强。所以 d 必须随关卡【递减】，用壳层接手难度，
    // 否则 25 关以后会直接崩到 5% 以下 = 不可玩。
    // ⚠️【2026-08-29 · 死法单一修正】用户：「难度好像也不是特别难，还是比较单一的问题」
    // 【实测】修好 ghost 稳定性后，失败原因 71% 都是「干扰车堵死车位」——
    //   ghost 变成唯一死因，玩家只需要学会一件事（避开干扰车）就能通关。
    // 【根因】第 2~4 关 sh 恒为 2、cap 恒为 13 —— 另外两根难度轴根本没动过。
    // 【修法】d 小幅降（把权重从 ghost 拿走），同时 sh 2→3、cap 13→12：
    //   · sh（洋葱壳层数）↑ → 颜色依赖链变深 → “色被围住取不到”的死法变多
    //   · cap（单车容量）↓ → 车数变多 → 决策密度上升、车位周转更紧
    // 【d 的回调】初次把 d 降到 4.60 后实测 3~7 关普通玩家胜率全部飙到 50~83%（目标 30%）
    //   —— 降太多了。壳层从 2→3 带来的难度增量，远不够补偿少半辆 ghost 的损失。
    //   回调到 4.85（只比原值低一点点）：保住总难度，同时靠 sh=3 把“色被围住”
    //   这条死法的占比拉上来 —— 目标是【总难度不降、死法变多】，而不是变简单。
    { n0: 2,  s1: 0, s2: 0, c1: 5, c2: 5, n1: 380, n2: 404, cap1: 13, cap2: 12, d1: 4.85, d2: 4.88, sh1: 2, sh2: 3, tag: '进阶' },
    // ── 【区分度修正】原来 2~7 关是同一段且段内参数几乎不动（色数恒5/壳恒2/cap恒13），
    //  实测前 10 关明细：第 3~10 关的色数、壳层、cap、开局锁色全部一样，只有豆数在爬
    //  → 那只是「关卡变长」不是「变难」，玩家会觉得打了 8 关一模一样。
    //  所以在 5~7 关插一段过渡：色数 5→6、壳层 2→3、cap 13→12 同时推进，
    //  让「新增一种颜色」和「多一层依赖壳」这两件事在前 10 关里就能被感知到。
    // 【为何色数封顶 6 而不是 7】injectDecoys 要求至少留 1 个【场上没有】的颜色当 ghost
    //  （见该函数 pool 为空即 return）。COLOR_ORDER 共 7 色，上场 7 色 = ghost 机制彻底失效
    //  = 胜率立刻回到 100%。所以 6 是硬上限，区分度只能靠 cap/壳层/d 三轴。
    // 【同步上面的口径】上一段已把 sh 推到 3、cap 降到 12，这一段就从 3/12 接着往上走，
    // 否则会出现「第5关壳层反而比第4关浅」的难度倒挂。
    // 【3~5 关专项 · 用户「第四关难度不够」】实测这三关普通玩家 50%（目标 30%）。
    // 【为什么单独拆一段】原来 2~4 是一段、5~7 是一段，段内用线性插值。
    //   第 2 关已经压到 33%（偏难），但同段的第 4 关却有 50% —— 因为插值只让
    //   d 从 4.85 爬到 4.88，几乎没变化。想单独压 3~5 关，就必须给它自己一段。
    // 【压的是 cap 而不是 d】d 已经贴着 5（可用车位上限），再加就会出现
    //   「5 个位子全是 ghost」的必死局。改压 cap：13→11 让车数增加约 18%，
    //   队列更长 → 要看的车更多 → 决策密度上升，且这是【可规避】的难度
    //   （认真看就能选对），符合本项目"陷阱而非判死"的设计原则。
    { n0: 3,  s1: 0, s2: 0, c1: 5, c2: 5, n1: 404, n2: 416, cap1: 12, cap2: 11, d1: 4.88, d2: 4.92, sh1: 3, sh2: 3, tag: '进阶+' },
    // 【为何段末不再让 d 大幅回落】旧值 d2=4.60 让第 7 关（该段末尾）普通玩家
    //   胜率飙到 83%。原意是"高关靠壳层接手、d 该递减"，但壳层在 5~7 段是恒定的
    //   sh=3，根本没有接手 —— 于是只剩 d 在降，难度就实打实地掉下去了。
    //   真正需要 d 递减的是 18 关以后（那时 sh 会到 3~4 且色数更多）。
    // 【关 5~7 压 cap · 2026-08-31】实测关5=65%、关7=55%（目标 40%/34%）。
    //   这一段 d 已经贴到 4.92（再高就是 5 个位子全 ghost 的必死局），
    //   第二轴也已收紧到 fu=0（降级路径实测 0/12 从未命中，闸门是真生效的）。
    //   剩下唯一没动过的就是 cap：11→10 → 车数约 +10%，队列更长、车位周转更紧。
    //   选 cap 而不是再动 d：cap 是【可规避】的难度（认真看就能选对），
    //   符合本项目「陷阱而非判死」的设计原则。
    // 【cap 定为 10/10 · 回测取舍】试过 11→10 渐变，关5 立刻回弹到 65%（目标40%）。
    //   实测对照：cap=10/10 时关5=45%(OK)、关7=30%(OK)；cap=11→10 时关5=65%(偏易)。
    //   关5 是本段的痛点，必须吃满 cap=10。代价是关6 偏难（25%，目标35%），
    //   但「偏难 10pt」远好于「偏易 25pt」—— 偏易等于白送关，偏难玩家还能重试。
    { n0: 5,  s1: 0, s2: 0, c1: 5, c2: 6, n1: 416, n2: 452, cap1: 10, cap2: 10, d1: 4.92, d2: 4.90, sh1: 3, sh2: 3, tag: '提速' },
    // ⚠️【难度倒挂修正 · 2026-08-31】旧值 d1:4.5 d2:4.4 —— 比上一段（4.92/4.90）
    //   和达标的关 3（4.88）都【低】，等于关 8 比关 3 更宽松 → 实测关8=53%、关9=67%
    //   （目标 32%/31%）。这是典型的难度倒挂，不是参数不够狠。
    // 【旧值为何存在】上方注释写着「d 必须随关卡递减，用壳层接手难度」。
    //   但实测 sh 在 5~18 关【恒为 3】—— 壳层根本没接手，于是只剩 d 在降，
    //   难度就实打实地掉下去了。这个错在关 7 上已经犯过一次（见上方注释），
    //   当时只修了 5~7 段，没顺手把 8+ 段一起修 —— 现在补上。
    //   真正需要 d 递减的是 18 关以后（那时 sh 会到 3~4 且车数更多）。
    // 【关10 偏难修正】关10 实测 10%（目标 29%）。关10 在本段内插值位置非常靠前
    //   （n0=8、下一段 n0=18 → 关10 只走了 2/10 的进度），本应接近 cap1=11，
    //   却因为 d1 已提到 4.88 而双重叠加。把段首 d1 从 4.88 降到 4.80：
    //   关10 得到缓解，而关8/9（靠后面的 fu 严格门取胜）不受影响。
    { n0: 8,  s1: 0, s2: 0, c1: 6, c2: 6, n1: 464, n2: 500, cap1: 11, cap2: 10, d1: 4.80, d2: 4.85, sh1: 3, sh2: 3, tag: '主力' },
    { n0: 18, s1: 0, s2: 0, c1: 6, c2: 6, n1: 500, n2: 560, cap1: 11, cap2: 10, d1: 4.2, d2: 4.0, sh1: 3, sh2: 3, tag: '硬核' },
    { n0: 32, s1: 0, s2: 0, c1: 6, c2: 6, n1: 560, n2: 620, cap1: 10, cap2: 9,  d1: 4.0, d2: 4.0, sh1: 3, sh2: 4, tag: '极限' }
  ];
  var LADDER_END = 45;   // 45 关后进入「无限模式」：难度锁定极限档，图案继续随机
  // 豆数硬上限【2026-08 修正：196 → 620】
  // 旧值 196 是按 cell=32 的老布局算的（填充率 0.72 × 272 格）。豆子缩 60% 后
  // 真实容量是 30×36=1080 格，实测 N=500 时网格 26×30、占 600×520px（限 618×720）、
  // 剥离深度 13 层 —— 这才是「洋葱壳能围死内层」所需的厚度。
  // 620 是留了余量的安全值（对应填充率 ≈0.57，图案轮廓仍有充分自由度）。
  var N_HARD_MAX = 620;

  // ── 配色出场顺序（用户铁律：前期不许出黑）────────────────────────
  // 【为什么必须重排】PD.COLOR_KEYS = ['black','white','pink',...]，
  // 而 genLevel 用 COLOR_KEYS.slice(0, C) 取色 → 第 1 关 C=3 就必然拿到 black，
  // 黑色不是"偶尔出现"，而是【每关必出且第一个出】。黑豆/黑车在深色立绘上看不清。
  // 所以这里定义独立的出场顺序：亮色优先，black 排到最后（≥7 色才出现，即 18 关后）。
  var COLOR_ORDER = ['pink', 'cyan', 'yellow', 'white', 'green', 'red', 'black'];

  function lerp(a, b, t) { return a + (b - a) * t; }

  function difficulty(n) {
    if (n < 1) n = 1;
    // 45 关之后：难度完全锁在极限档（S=2% 已是铁律下限，再降就 <0 = 不可通关）。
    // 豆数也不再增长 —— 已到物理上限，且加豆只会挤死图案自由度。
    // 无限关的新鲜感【全部由图案随机化提供】，这正是本次重构的核心价值。
    var loopExtra = 0;
    if (n > LADDER_END) { loopExtra = n - LADDER_END; n = LADDER_END; }

    var seg = LADDER[0], i;
    for (i = LADDER.length - 1; i >= 0; i--) { if (n >= LADDER[i].n0) { seg = LADDER[i]; break; } }
    var segEnd = (i + 1 < LADDER.length) ? LADDER[i + 1].n0 - 1 : LADDER_END;
    var t = (segEnd > seg.n0) ? (n - seg.n0) / (segEnd - seg.n0) : 0;
    if (t < 0) t = 0; if (t > 1) t = 1;

    var S = lerp(seg.s1, seg.s2, t);
    var C = Math.round(lerp(seg.c1, seg.c2, t));
    var N = Math.round(lerp(seg.n1, seg.n2, t));
    var cap = Math.round(lerp(seg.cap1, seg.cap2, t));
    var decoy = lerp(seg.d1, seg.d2, t);          // 【不取整】小数部分交给 genLevel 按 seed 概率取整
    var shellK = Math.round(lerp(seg.sh1 || 0, seg.sh2 || 0, t));
    if (N > N_HARD_MAX) N = N_HARD_MAX;

    return {
      n: n + loopExtra,
      seg: seg.tag,
      S: Math.round(S * 1000) / 1000,     // 单色冗余率
      C: C,                                // 色数（车位压力来源）
      N: N,                                // 豆数（控时长，不控难度）
      slots: 6,                            // 车位总数
      usable: 5,                           // 默认可用（第 6 位广告解锁）
      capMax: cap,                         // 单车容量上限 → 决定车数 → 决定决策密度
      decoy: decoy,                        // ghost 干扰车数量【可为小数】—— 主胜率旋钮
      // 【为何必须允许小数】可用车位 = 5，所以 ghost 数量在 4→5 之间是一道悬崖：
      //   实测（第2关普通玩家）ghost=4 → 75~83%，ghost=5 → 31%。
      // 整数旋钮根本跑不到中间值，想要 40% 就必须让一部分局只放 4 辆。
      // 所以这里保留小数，genLevel 里按 seed 做伯努利取整 ——
      // 同 seed 仍必得同一张图（可复现），但多局统计上能稳定命中目标胜率。
      shellK: shellK                       // 洋葱壳层数 → 【主胜率旋钮】颜色依赖链深度
    };
  }
  LG.difficulty = difficulty;

  // ═══════════════════════════════════════════════════════════════
  // 二、随机轮廓生成器 genShape(seed, targetN)
  // ═══════════════════════════════════════════════════════════════
  // 产出一个 grid（二维数组，true=有豆），豆数【精确等于】targetN。
  //
  // 6 种裙型 × 随机参数（腰宽/摆宽/收腰位/摆型/对称扰动）→ 轮廓千变万化。
  // 但最后一步一定会把豆数削/补到 targetN —— 这是"难度恒定"的关键闸门。
  //
  // 所有裙型都保证：① 左右大体对称（美观）② 上窄下宽（是裙子不是方块）
  //                ③ 每行连续无孔洞（豆人走得出来，避免 pathOut 判死）
  var SHAPES = ['aline', 'bell', 'mermaid', 'tulip', 'tiered', 'puff'];

  // 归一化半宽函数：输入 v∈[0,1]（0=腰 1=摆），输出半宽比例∈[0,1]
  function widthFn(kind, p) {
    switch (kind) {
      case 'aline':                                    // A 字裙：线性外扩
        return function (v) { return p.w0 + (1 - p.w0) * Math.pow(v, p.k); };
      case 'bell':                                     // 钟形裙：先缓后急
        return function (v) { return p.w0 + (1 - p.w0) * (1 - Math.cos(v * Math.PI / 2)); };
      case 'mermaid':                                  // 鱼尾裙：收腰后突然外放
        return function (v) {
          var t = v < p.br ? v / p.br * 0.30 : 0.30 + (v - p.br) / (1 - p.br) * 0.70;
          return p.w0 + (1 - p.w0) * t;
        };
      case 'tulip':                                    // 郁金香：中段最宽，摆口回收
        return function (v) { return p.w0 + (1 - p.w0) * Math.sin(v * Math.PI * 0.86); };
      case 'tiered':                                   // 蛋糕裙：阶梯式外扩
        return function (v) {
          var st = Math.floor(v * p.tiers) / Math.max(1, p.tiers - 1);
          return p.w0 + (1 - p.w0) * Math.min(1, st);
        };
      default:                                         // puff 蓬蓬裙：整体饱满
        return function (v) { return p.w0 + (1 - p.w0) * Math.pow(v, 0.55); };
    }
  }

  function genShape(seed, targetN) {
    var rand = rng(seed);
    var kind = pick(rand, SHAPES);
    var p = {
      w0:    0.26 + rand() * 0.26,          // 腰部半宽比（0.26~0.52）
      k:     0.62 + rand() * 0.95,          // A 字外扩指数
      br:    0.36 + rand() * 0.24,          // 鱼尾收腰位
      tiers: ri(rand, 3, 5),                // 蛋糕裙层数
      wob:   rand() * 0.055                 // 逐行轮廓扰动（破除"完美对称"的呆板感）
    };
    var wf = widthFn(kind, p);

    // 行列数：先按目标豆数估个方形规模，再由削补闸门收敛
    // 面积利用率经验值 ≈ 0.62（裙形不是矩形），所以 rows ≈ sqrt(N/0.62/ratio)
    var ratio = 0.72 + rand() * 0.52;        // 宽高比（0.72~1.24）：有的裙修长有的短蓬
    var rows = Math.max(8, Math.round(Math.sqrt(targetN / 0.62 / ratio)));
    var cols = Math.max(7, Math.round(rows * ratio));
    // 舞台硬约束【与 COL_MAX/ROW_MAX 同步修正】：cell 上限 20 下最多 36 行 × 30 列
    if (cols > COL_MAX) cols = COL_MAX;
    if (rows > ROW_MAX) rows = ROW_MAX;

    var half = (cols - 1) / 2;
    var grid = [], r, c, cnt = 0;
    for (r = 0; r < rows; r++) {
      var v = rows > 1 ? r / (rows - 1) : 1;
      var hw = wf(v) * half;
      // 扰动：让轮廓有手作感，但两侧用同一个扰动值 → 保持对称
      hw += (rand() - 0.5) * 2 * p.wob * half;
      if (hw < 0.6) hw = 0.6;                // 每行至少 2 格，避免出现宽度 1 的"针"
      var row = [];
      for (c = 0; c < cols; c++) {
        // 连续区间填充 —— 保证每行无孔洞（豆人走得出去）
        var on = Math.abs(c - half) <= hw + 0.001;
        row.push(on);
        if (on) cnt++;
      }
      grid.push(row);
    }

    // ── 豆数闸门：精确削/补到 targetN（这是"难度恒定"的核心）──
    // 削：从最上面几行的两端开始拿（视觉上是"肩线收窄"，最不破坏裙型）
    // 补：从最下面几行的两端开始加（视觉上是"裙摆外放"）
    var guard = 0;
    while (cnt > targetN && guard++ < 5000) {
      var done = false;
      for (r = 0; r < rows && !done; r++) {
        for (c = 0; c < cols && !done; c++) {
          // 从上往下、由外向内摘：只摘"行内最边缘"那颗，保持行连续
          var lc = c, rc2 = cols - 1 - c;
          if (grid[r][lc] && rowCount(grid[r]) > 2) { grid[r][lc] = false; cnt--; done = true; }
          else if (grid[r][rc2] && rowCount(grid[r]) > 2) { grid[r][rc2] = false; cnt--; done = true; }
        }
      }
      if (!done) break;
    }
    guard = 0;
    while (cnt < targetN && guard++ < 5000) {
      var done2 = false;
      for (r = rows - 1; r >= 0 && !done2; r--) {
        for (c = 0; c < cols && !done2; c++) {
          // 从下往上、由内向外贴：只在已有豆的紧邻位置加，保持行连续
          if (!grid[r][c]) {
            var adj = (c > 0 && grid[r][c - 1]) || (c < cols - 1 && grid[r][c + 1]);
            if (adj) { grid[r][c] = true; cnt++; done2 = true; }
          }
        }
      }
      if (!done2) {
        // 所有行都满了 → 加一行（贴在裙摆下方，宽度同倒数第二行）
        if (rows >= ROW_MAX) break;
        var nr = [];
        for (c = 0; c < cols; c++) nr.push(grid[rows - 1][c]);
        grid.push(nr); rows++;
        cnt += rowCount(nr);
        if (cnt > targetN) {   // 加多了就地削回来
          for (c = 0; c < cols && cnt > targetN; c++) {
            if (grid[rows - 1][c]) { grid[rows - 1][c] = false; cnt--; }
          }
        }
      }
    }

    // 清理：删掉被削空的行（避免出现空行导致 bounds 计算异常）
    var out = [];
    for (r = 0; r < grid.length; r++) if (rowCount(grid[r]) > 0) out.push(grid[r]);

    return { grid: out, rows: out.length, cols: cols, count: cnt, kind: kind };
  }
  function rowCount(row) { var n = 0, i; for (i = 0; i < row.length; i++) if (row[i]) n++; return n; }
  LG.genShape = genShape;

  // ═══════════════════════════════════════════════════════════════
  // 三、上色器 paintBeans(grid, colors, seed)
  // ═══════════════════════════════════════════════════════════════
  // 5 种配色模式，每种都做到「每色配额几乎均分」——
  // 这一点极其关键：配额均分 → 每色车数接近 → 队列决策密度高（解法多）。
  // 若某色只有 3 颗豆，它的车容量就只有 4，那辆车几乎瞬间就走，等于没有决策。
  //
  // 模式差异只影响「同色豆长在哪」，不影响「每色有多少颗」→ 难度不变，观感全变。
  var PAINT_MODES = ['voronoi', 'hband', 'vband', 'ring', 'dots'];

  // ═══════════════════════════════════════════════════════════════
  // 三.0、剥离深度 peelDepth —— 「谁被谁锁住」的唯一真值
  // ═══════════════════════════════════════════════════════════════
  // 【为什么必须有这个函数】用户校准：干扰车不是「场上没这个颜色」，
  // 而是「这个颜色此刻拿不出来 —— 它被外圈的豆围住了」。过早把它放进车位
  // 就白占一个坑，必须等围住它的颜色被清掉才解锁。这是【依赖关系陷阱】。
  //
  // 【运行时规则回顾】pathOut 是 BFS，把所有未走的豆当墙 → 一颗豆能出阵
  // 的充要条件是「它旁边有空格，且空格连通到阵外」。所以开局只有【最外一圈】
  // 能动，剥掉一圈后下一圈才暴露 —— 这就是天然的洋葱层。
  //
  // depth 定义：与阵外空地 4-连通相邻的格子 = 0 层，剥掉 0 层后新暴露的 = 1 层……
  // 于是 depth 严格等于「这颗豆最早可能被取走的轮次」，是 pathOut 的静态等价物。
  function peelDepth(grid, rows, cols) {
    var d = [], r, c, alive = [], n = 0;
    for (r = 0; r < rows; r++) {
      var dr = [], ar = [];
      for (c = 0; c < cols; c++) { dr.push(-1); ar.push(!!grid[r][c]); if (grid[r][c]) n++; }
      d.push(dr); alive.push(ar);
    }
    // 阵外一圈视为空 → 用 (r<0||r>=rows||c<0||c>=cols) 判定为「空」
    function isHole(rr, cc) {
      if (rr < 0 || rr >= rows || cc < 0 || cc >= cols) return true;
      return !alive[rr][cc];
    }
    var layer = 0, left = n, guard = 0;
    while (left > 0 && guard++ < 4000) {
      var peel = [];
      for (r = 0; r < rows; r++) for (c = 0; c < cols; c++) {
        if (!alive[r][c]) continue;
        // 4-邻域有空 → 本轮可剥（与 pathOut 的「旁边有空格」完全同口径）
        if (isHole(r - 1, c) || isHole(r + 1, c) || isHole(r, c - 1) || isHole(r, c + 1)) peel.push([r, c]);
      }
      if (!peel.length) break;                 // 理论上不会发生（实心图形必有外沿）
      for (var i = 0; i < peel.length; i++) {
        d[peel[i][0]][peel[i][1]] = layer;
        alive[peel[i][0]][peel[i][1]] = false;
        left--;
      }
      layer++;
    }
    // 兜底：孤立到剥不掉的（不该出现）按最深处理
    for (r = 0; r < rows; r++) for (c = 0; c < cols; c++) if (grid[r][c] && d[r][c] < 0) d[r][c] = layer;
    return { d: d, maxDepth: layer };
  }
  LG.peelDepth = peelDepth;

  // ═══════════════════════════════════════════════════════════════
  // 三.1、洋葱壳上色 paintShell —— 制造「颜色依赖链」
  // ═══════════════════════════════════════════════════════════════
  // 【产出结构】把豆阵按 peelDepth 切成 shellK+1 段：
  //   壳 0（最外，depth 小）→ 纯色 A          ← 开局只有 A 能取
  //   壳 1               → 纯色 B          ← 剥完 A 才解锁
  //   ...
  //   芯（最深的一段）    → 剩下的颜色随机混  ← 最后才动得了
  //
  // 【于是形成依赖链】A → B → C → 芯。玩家在 A 还没剥完时若把 B/C 的车
  // 拖进车位，那辆车一颗豆都装不进去（pathOut 全 false）→ 死占一个坑，
  // 直到外壳剥完才开始工作。坑位有限（5 个），占多了就是死局。
  //
  // 【为什么不改动难度契约】每色配额仍然由 quota 均分逻辑锁死 → 豆数 N、
  // 色数 C、冗余 S 全部不变，只改「同色豆长在哪一圈」。难度契约零影响，
  // 但胜负结构从「无陷阱单调消耗」变成「有序依赖 + 可犯错」。
  function paintShell(shape, colors, rand, cfg) {
    var grid = shape.grid, rows = shape.rows, cols = shape.cols, C = colors.length;
    var pd = peelDepth(grid, rows, cols);
    if (pd.maxDepth < 2) return null;             // 太薄的图形分不出壳 → 回落常规模式

    var cells = [], r, c;
    for (r = 0; r < rows; r++) for (c = 0; c < cols; c++) if (grid[r][c]) {
      cells.push({ r: r, c: c, d: pd.d[r][c] });
    }
    var total = cells.length;
    // 按深度从外到内排序（同深度随机打散，避免同一圈总是从左上开始）
    cells.sort(function (a, b) { return a.d - b.d || (rand() - 0.5); });

    // 壳层数：受限于色数（至少给「芯」留 1 色）与图形厚度
    // 【注意】maxDepth 随图形形状波动（爱心 4 层、月亮 6 层…），所以同一个
    // shellK 契约在不同图案上会被夹到不同的实际层数 —— 这是允许的：
    // 难度由「有几个色被锁」决定，而 K 达到 2 就已经形成依赖链。
    var K = Math.min(cfg.shellK, C - 1, pd.maxDepth - 1);
    if (K < 1) return null;

    // 每色配额均分（与常规模式完全一致 → 难度契约不变）
    var quota = [], base = Math.floor(total / C), rem = total - base * C, i;
    for (i = 0; i < C; i++) quota.push(base + (i < rem ? 1 : 0));

    // 壳的颜色顺序：随机挑 K 个色当壳，其余归芯
    var idx = [];
    for (i = 0; i < C; i++) idx.push(i);
    for (i = idx.length - 1; i > 0; i--) { var j = Math.floor(rand() * (i + 1)); var t = idx[i]; idx[i] = idx[j]; idx[j] = t; }
    var shellCols = idx.slice(0, K), coreCols = idx.slice(K);

    // ── 逐格分配：外层依次吃满每个壳色的配额，剩下的给芯 ──
    var beans = [], cnt = {}, used = [], p = 0;
    for (i = 0; i < C; i++) used.push(0);
    var half = (cols - 1) / 2;

    function emit(cell, k) {
      used[k]++;
      var col = colors[k];
      beans.push({ id: 0, color: col, gx: cell.c - half, gy: cell.r, layer: 0 });
      cnt[col] = (cnt[col] || 0) + 1;
    }

    // 壳：严格按深度顺序吃满配额 → 保证每层壳是【纯色连续包围】
    for (var s = 0; s < shellCols.length; s++) {
      var k = shellCols[s];
      while (used[k] < quota[k] && p < total) emit(cells[p++], k);
    }
    // 芯：剩余格子在 coreCols 里按配额随机分（芯内部无需有序，混着才自然）
    while (p < total) {
      var pool = [];
      for (i = 0; i < coreCols.length; i++) if (used[coreCols[i]] < quota[coreCols[i]]) pool.push(coreCols[i]);
      if (!pool.length) {                          // 芯色配额用尽 → 顺延到任意还有配额的色
        for (i = 0; i < C; i++) if (used[i] < quota[i]) pool.push(i);
      }
      if (!pool.length) break;
      emit(cells[p++], pool[Math.floor(rand() * pool.length) % pool.length]);
    }

    beans.sort(function (a, b) { return a.gy - b.gy || a.gx - b.gx; });
    for (i = 0; i < beans.length; i++) beans[i].id = i;
    return { beans: beans, counts: cnt, mode: 'shell' + K, shellK: K };
  }
  LG.paintShell = paintShell;

  function paintBeans(shape, colors, seed, lockCfg) {
    var rand = rng(seed ^ 0x5bd1e995);
    var mode = pick(rand, PAINT_MODES);
    var grid = shape.grid, rows = shape.rows, cols = shape.cols;
    var C = colors.length;
    // ── 【图案自带色模式】最高优先级 ─────────────────────────
    // 【根因修正 2026-08-28】旧版把 art 自带颜色丢掉、改成「每色配额均分 + 随机
    // 挑 K 个色当壳」，同时造成两个致命问题：
    //   ① 图丑：西瓜被刷成随机色块，不是西瓜
    //   ② 没难度：外圈混了 4~5 种色（实测 R=4.13），而可用车位 5 个
    //     → 随便放都能撞上一种 → 用户要的「车位占满且无色可装」永远不发生
    // 真实像素画的颜色天生成块（黑边一圈、绿皮一条、红肉一大片），
    // 成块就自然产生依赖顺序：外圈不清，里面动不了 → R 降到 1~2。
    // 所以「图好看」和「有难度」是同一件事，不需要任何人为设计的颜色分布。
    if (grid.length && typeof grid[0][0] !== 'boolean') {
      var abeans = [], acnt = {}, ar, ac, aid = 0;
      var ahalf = (cols - 1) / 2;
      // ① 先统计各色格数，找出「碎色」
      var raw = {};
      for (ar = 0; ar < rows; ar++) for (ac = 0; ac < cols; ac++) {
        var ch0 = grid[ar][ac];
        if (ch0 && CH2COL[ch0]) raw[ch0] = (raw[ch0] || 0) + 1;
      }
      // 【碎色合并】缩放采样会把细节（小鸡的红嘴、冰淇淋的绿叶）压成 6 颗豆，
      // deriveCars 就给它配一辆 cap 6 的小破车 —— 那正是白占坑位的僵尸车来源。
      // 参考图里每种颜色都是有意义的整块，没有碎色。
      // 阈值 = capMax 的一半：低于此值的色一律并入「格数最多的色」，
      // 保证每色都能切出至少半车，同时颜色块仍然成片（视觉不受影响，因为
      // 被并掉的本来就只有几格）。
      // ══ 【碎色合并的方向 · 2026-08-31 修正】═══════════════════════════
      // 旧做法：碎色一律并入【格数最多的色】(dom)。这有两个叠加副作用，
      // 同时把难度契约的两根轴都推坏了：
      //   ① 色数 -1（本来能承载 5 色的图变成 4 色）→ 撞 rcN >= C-1
      //   ② dom 变得更大 → 最大单色占比升高 → 撞 _maxShare <= 0.45
      // 实测后果：14 张 ART 里只有 icecream / lolli 能同时过两轴，
      //   于是 60 局里 lolli 独占 88%（玩家连打十几关看到同一张图）。
      // 【新做法】并入【格数最少的合格色】—— 同样消除了"半车小破车"，
      //   但把质量填到最瘦的那一色上，反而【压低】最大单色占比，
      //   而且不再无谓地牺牲色数。视觉上碎色本来只有几格，并到哪一色都看不出。
      // 【方向的取舍 · 实测数据】
      //   并入 dom（旧）：V5 重复率 55%、V9 回落 1/60  —— 多样性差但生成稳
      //   并入 sink（新）：V5 重复率 25%、V9 回落 12/60 —— 多样性好但重试爆炸
      //   两者都不可接受，因为它们是同一个跷跷板的两端。
      // 【正解：不做二选一，而是让"色数够不够"来决定方向】
      //   合并前先算：若并入 sink，色数会不会掉到契约下限以下？
      //   · 不会 → 用 sink（压低单色占比，多样性最优）
      //   · 会   → 用 dom（保住生成成功率，宁可这一张图重复）
      //   这样两根轴各自只在自己真正吃紧时让步，不再互相牺牲。
      var MERGE_MIN = 14, dom = null, domN = 0, kk;
      for (kk in raw) if (raw[kk] > domN) { domN = raw[kk]; dom = kk; }
      var sink = null, sinkN = 1e9, bigN = 0;
      for (kk in raw) {
        if (raw[kk] >= MERGE_MIN) {
          bigN++;                                        // 合格色个数 = 合并后的色数
          if (raw[kk] < sinkN) { sinkN = raw[kk]; sink = kk; }
        }
      }
      // 合并后色数 bigN 与方向无关；方向只影响【最大单色占比】。
      // 所以 sink 方向永远不会更差 —— 除了一种情况：sink 就是 dom（只有一个合格色）。
      // 此时两者等价，用哪个都一样。真正让 V9 变差的不是方向，而是
      // 【占比降低后 cand 更容易通过第三轴 → 但前两轴(openColors/frontUsable)
      //  的区间是按旧分布标定的，分布一变就集体错位】。
      // 于是这里保守处理：只在【合格色 >= 4】时启用 sink 方向 ——
      // 色数充裕的图案（house/icecream/lolli/flower）本来就是多样性的主力，
      // 让它们受益；色数本就吃紧的图不动，避免牵连生成成功率。
      var into = (bigN >= 4 && sink) ? sink : dom;
      var remap = {};
      for (kk in raw) if (raw[kk] < MERGE_MIN && kk !== into) remap[kk] = into;
      // ② 逐格产豆（应用碎色重映射）
      for (ar = 0; ar < rows; ar++) for (ac = 0; ac < cols; ac++) {
        var ch = grid[ar][ac];
        if (!ch) continue;
        if (remap[ch]) ch = remap[ch];
        var acol = CH2COL[ch];
        if (!acol) continue;
        abeans.push({ id: aid++, color: acol, gx: ac - ahalf, gy: ar, layer: 0 });
        acnt[acol] = (acnt[acol] || 0) + 1;
      }
      return { beans: abeans, counts: acnt, mode: 'art' };
    }
    // ── 洋葱壳模式（仅旧纯轮廓图形回落用）─────────────────────────
    // lockCfg.shellK = 要造几层「纯色壳」。壳内的颜色开局全部取不出来 →
    // 队列里那些颜色的车如果被提前拖进车位，就白占坑位，直到壳被剥完才解锁。
    // 这正是用户要的：「某些颜色移除后，才出现」。
    if (lockCfg && lockCfg.shellK > 0) {
      var res = paintShell(shape, colors, rand, lockCfg);
      if (res) return res;
    }

    // 收集所有格子坐标
    var cells = [], r, c;
    for (r = 0; r < rows; r++) for (c = 0; c < cols; c++) if (grid[r][c]) cells.push({ r: r, c: c });
    var total = cells.length;

    // 每色目标配额：均分 + 余数分给前几色
    var quota = [], base = Math.floor(total / C), rem = total - base * C, i;
    for (i = 0; i < C; i++) quota.push(base + (i < rem ? 1 : 0));

    // ① 先按模式算出每格的「倾向色」（score 越小越倾向该色）
    var seeds = [], half = (cols - 1) / 2;
    if (mode === 'voronoi') {
      // 色块状分布：C 个随机种子点，就近归属 → 像撞色拼接的设计感裙子
      for (i = 0; i < C; i++) seeds.push({ r: rand() * rows, c: rand() * cols });
    }
    var bandOff = rand() * C;                     // 条纹相位随机
    var bandW = (mode === 'hband' ? rows : cols) / (C * (0.7 + rand() * 0.9));
    var ringStep = Math.max(rows, cols) / (C * (0.8 + rand() * 0.8));

    function prefOf(cell) {
      var d, k, bestK = 0, bestD = 1e9;
      if (mode === 'voronoi') {
        for (k = 0; k < C; k++) {
          var dr = cell.r - seeds[k].r, dc = cell.c - seeds[k].c;
          d = dr * dr + dc * dc;
          if (d < bestD) { bestD = d; bestK = k; }
        }
        return bestK;
      }
      if (mode === 'hband') return Math.floor(cell.r / bandW + bandOff) % C;         // 横向色条
      if (mode === 'vband') return Math.floor(cell.c / bandW + bandOff) % C;         // 竖向色条
      if (mode === 'ring') {                                                          // 同心环
        var rr2 = Math.abs(cell.c - half) + Math.abs(cell.r - rows * 0.5);
        return Math.floor(rr2 / ringStep + bandOff) % C;
      }
      return Math.floor(rand() * C) % C;                                              // dots 纯随机波点
    }

    // ② 按倾向排队分配，配额满了就顺延到下一个还有配额的色
    //    → 既保留了模式的视觉特征，又严格锁死每色数量
    var order = cells.slice();
    // 稳定打散，避免总是从左上角开始填导致某色总在左上
    for (i = order.length - 1; i > 0; i--) {
      var j = Math.floor(rand() * (i + 1));
      var t = order[i]; order[i] = order[j]; order[j] = t;
    }
    var beans = [], id = 0, cnt = {}, used = [];
    for (i = 0; i < C; i++) used.push(0);
    var half2 = (cols - 1) / 2;
    for (i = 0; i < order.length; i++) {
      var cell = order[i];
      var k0 = prefOf(cell), k = k0, tries = 0;
      while (used[k] >= quota[k] && tries++ < C) k = (k + 1) % C;
      used[k]++;
      var col = colors[k];
      beans.push({ id: id++, color: col, gx: cell.c - half2, gy: cell.r, layer: 0 });
      cnt[col] = (cnt[col] || 0) + 1;
    }
    // id 按行序重排（渲染/求解遍历顺序更符合直觉，也让 depthOf 排序稳定）
    beans.sort(function (a, b) { return a.gy - b.gy || a.gx - b.gx; });
    for (i = 0; i < beans.length; i++) beans[i].id = i;

    return { beans: beans, counts: cnt, mode: mode };
  }
  LG.paintBeans = paintBeans;

  // ═══════════════════════════════════════════════════════════════
  // 三.5、干扰车注入 injectDecoys —— 唯一的失败引擎
  // ═══════════════════════════════════════════════════════════════
  // 【为什么这是唯一手段】实测：色数/车位/S/capMax/上色方式 全部扫过，
  //   随手乱拖胜率恒为 100%，最优解与瞎点步数方差恒为 0。
  //   因为 deriveCars 从豆子反推车队 → 每色容量必然 ≥ 豆数、队列必然有货、
  //   该色清空即自动放行 → 不存在"不可逆的错误操作" → 数学上不可能输。
  //
  // 【干扰车为什么能破这个不变式】它的颜色【场上一颗豆都没有】：
  //   ① 永远装不满 → 规则 A（装满离场）永不触发
  //   ② 它的颜色从来不"从有变无" → releaseEmptyColorCars 也不会放它走
  //      （注意：这条必须在 pd-game 里显式排除 decoy，否则 !rest[color] 恒真 → 秒放走 = 白做）
  //   ③ 于是它永久占据一个车位。塞进 5 个 → 车位归零 → 死局
  //   玩家唯一出路 = 「消除」道具（激励视频）→ 这就是广告位的来源。
  //
  // 【视觉铁律】干扰车不做任何标记，和普通车长得一模一样（用户否决了警示带/问号）。
  //   标出来的陷阱不是陷阱 —— 玩家只会条件反射避开，观察成本归零。
  //   唯一的辨别方式 = 自己去看阵里到底有没有这个颜色的豆、还剩多少。
  //
  // 【两种干扰车】对应用户原话「厂商没有对应的豆子 或者很少」：
  //   A. ghost  场上【完全没有】这个颜色 → 永远装不满、永远不自动放行 → 硬占位，只能靠「消除」
  //   B. greedy 颜色是真的，但容量【远大于】该色剩余豆数 → 装几颗就卡住，
  //             要等该色彻底清空才走 → 软占位（可恢复，但期间少一个车位）
  //   B 是可挽回的压力，A 是必须付代价的死结 —— 两者混用才有"认真看"的价值。
  // 【实测剂量曲线】ghost 数量 vs 普通玩家胜率（第5关难度、60局）：
  //   2个→98%  3个→98%  4个→90%  5个→40%  6个→35%  8个→8%
  //   → 悬崖在 4~6 之间（因为可用车位=5，要堵死必须凑足 5 辆）。
  // 【为何成簇插入而不是均匀打散】实测：打散时老手胜率(47%)反而低于普通(60%)，
  //   因为孤立的 ghost 随时出现，技术无法规避；而成簇时老手 58% > 普通 40%，
  //   因为成簇是【可预见的难关】，看得出来就能提前留车位 → 技术才有回报。
  //   这是「陷阱」与「随机坐死」的分界线。
  // 【为何去掉 greedy】大容量真色车会把该色一口吸完然后被自动放行，
  //   它实际上在【帮】玩家清场，对胜率是正收益 → 不能当难度旋钮。
  // 【簇长 · 2026-08-29 从 3 降到 2】
  // 【实测证据】tools/probe-ghost.js：关8 有 4/10 局 ghost 归零。追踪发现
  //   injectDecoys 每次都正常塞进去了，是 refPlay 连「允许用广告位」都过不去 →
  //   注入被整体撤销 → 难度清零。根因不在剂量，在【排布形状】：
  //   RUN=3 时三辆 ghost 连成一簇，玩家连抓 3 个必死（可用车位只有 5 个），
  //   贪心参考玩家一头撞进去就再没位子了。
  // 【为什么 2 更好】
  //   · 可解性：连抓 2 个 ghost 还剩 3 个位子周转，refPlay 能活下来 →
  //     注入不再被撤销 → ghost 数量稳定，不会忽 5 忽 0。
  //   · 难度反而更高：同样 5 辆 ghost，从「2 簇」变成「3 簇」，
  //     队列里出现陷阱的【位置更多】，玩家要观察的点位从 2 处升到 3 处。
  //     集中一坨反而好躲（看到一片就整体避开），打散才真的要逐辆核对。
  var DECOY_RUN = 2;   // 单簇上限：≥可用车位(5)必然无解；3 会让贪心玩家直接堵死

  // ── 参照玩家模拟（与 tools/validate-levels.js 的 simRuntime 同口径）──────
  // 【为什么不能用 solveLevel 兜底】solveLevel 只挑"当前有可取豆"的车，
  // 它会自动绕开所有干扰车 → 永远报可解，等于没校验。
  // 真实玩家在前 4 格全是干扰车时必须硬吃一辆，这才是压力来源。
  // 这里模拟一个【不看广告】的认真玩家：能过 → 说明关卡本身公平；
  // 过不了 → 这套干扰车排布是死结，必须换排布。
  function refPlay(lv, usable) {
    var beans = lv.beans.map(function (b) {
      return { color: b.color, gx: b.gx, gy: b.gy, layer: b.layer, gone: false };
    });
    var bd = PD.buildBounds(beans);
    var q8 = [null, null, null, null, null, null, null, null], pend = [], i;
    for (i = 0; i < lv.cars.length; i++) { if (i < 8) q8[i] = lv.cars[i]; else pend.push(lv.cars[i]); }
    var slots = [], s; for (s = 0; s < usable; s++) slots.push(null);
    var remain = beans.length, guard = 0;
    function take(qi) {
      var c = q8[qi]; q8[qi] = null;
      if (qi < 4 && q8[qi + 4]) { q8[qi] = q8[qi + 4]; q8[qi + 4] = null; if (pend.length) q8[qi + 4] = pend.shift(); }
      return c;
    }
    while (remain > 0 && guard++ < 60000) {
      var top = PD.buildTopIndex(beans), occ = PD.buildOccupancy(beans), did = false;
      for (s = 0; s < usable; s++) {
        var car = slots[s];
        if (!car || car.left <= 0) continue;
        for (i = 0; i < beans.length; i++) {
          var b = beans[i];
          if (b.gone || b.color !== car.color) continue;
          if (!PD.isPickable(b, top) || !PD.pathOut(b, occ, bd, null)) continue;
          b.gone = true; car.left--; remain--; did = true;
          top = PD.buildTopIndex(beans); occ = PD.buildOccupancy(beans);
          if (car.left === 0) break;
        }
        if (car.left === 0) slots[s] = null;
      }
      // 【与运行时同口径】不再有「该色清空 → 未装满也放行」这条通道。
      // S 已归零（每色总容量 === 豆数）→ 每辆车都刚好装满，规则 A 足够。
      // 若这里保留自动放行，refPlay 会比真机宽松 → 放过实际上会卡死的排布。
      if (did) continue;
      if (remain === 0) break;
      var fi = -1;
      for (s = 0; s < usable; s++) if (!slots[s]) { fi = s; break; }
      if (fi < 0) return false;                      // 车位堵死且不许看广告 → 这套排布不合格
      var need = {};
      for (i = 0; i < beans.length; i++) {
        var b2 = beans[i];
        if (!b2.gone && PD.isPickable(b2, top) && PD.pathOut(b2, occ, bd, null)) need[b2.color] = 1;
      }
      var best = -1;
      for (i = 0; i < 4; i++) if (q8[i] && need[q8[i].color]) { best = i; break; }
      if (best < 0) {
        // 【必须在这里重算 rest】牺牲一个车位时要优先牺牲「真色车」而不是干扰车 ——
        // 干扰车塞进去就再也出不来（只能靠广告清），真色车至少还能装豆。
        // 原来 rest 是在上方「自动放行」那段里算的，那段已按用户铁律删除，
        // 所以必须就地重算，否则这里引用的是未定义变量（严格模式下直接抛错）。
        var rest = {};
        for (i = 0; i < beans.length; i++) if (!beans[i].gone) rest[beans[i].color] = 1;
        var sac = -1, sacCap = 1e9, sacReal = false;
        for (i = 0; i < 4; i++) {
          if (!q8[i]) continue;
          var real = !!rest[q8[i].color];
          if (real && !sacReal) { sacReal = true; sacCap = q8[i].cap; sac = i; continue; }
          if (real === sacReal && q8[i].cap < sacCap) { sacCap = q8[i].cap; sac = i; }
        }
        if (sac < 0) return false;
        best = sac;
      }
      var pk = take(best);
      slots[fi] = { color: pk.color, cap: pk.cap, left: pk.cap, decoy: pk.decoy || 0 };
    }
    return remain === 0;
  }

  function injectDecoys(cars, fieldColors, counts, num, seed) {

    if (!num || num < 1) return cars;
    var s = (seed | 0) || 0x2545f491; if (s < 0) s = -s;
    function rnd() { s ^= s << 13; s |= 0; s ^= s >>> 17; s ^= s << 5; s |= 0; return ((s >>> 0) % 100000) / 100000; }
    var onField = {}, i;
    for (i = 0; i < fieldColors.length; i++) onField[fieldColors[i]] = 1;
    var pool = [];
    for (i = 0; i < COLOR_ORDER.length; i++) if (!onField[COLOR_ORDER[i]]) pool.push(COLOR_ORDER[i]);
    if (!pool.length) return cars;                 // 7 色全上场 → 无干扰色可用（32 关后）
    var out = cars.slice(), placed = 0, guard = 0;
    while (placed < num && guard++ < 40) {
      var run = Math.min(DECOY_RUN, num - placed);
      var blk = [], j;
      for (j = 0; j < run; j++) {
        blk.push({ color: pool[Math.floor(rnd() * pool.length)],
                   cap: 6 + Math.floor(rnd() * 8), decoy: 1 });
      }
      // 不放前 2 格：开局就摆脸上 → 玩家条件反射避开，观察成本归零 = 白做。
      // 放第 3 格之后 → 得往队列深处看才能发现，正是「不认真看就找不到对应的车」。
      var lo = Math.min(2, out.length);
      var pos = lo + Math.floor(rnd() * Math.max(1, out.length - lo));
      out.splice.apply(out, [pos, 0].concat(blk));
      placed += run;
    }
    return out;
  }
  LG.injectDecoys = injectDecoys;

  // ═══════════════════════════════════════════════════════════════
  // 四、关卡主入口 genLevel(n, seed)
  // ═══════════════════════════════════════════════════════════════
  // 流程：契约 → 图案 → 上色 → 倒推车 → 运行时口径校验 → 不达标换 seed 重试
  // 保证交付的关卡 100% 可解（铁律：solvable !== true 禁止上线）
  var TITLES = ['蓬蓬纱裙', '波点连衣裙', '鱼尾晚礼服', '蛋糕层叠裙', '郁金香短裙', '钟形舞会裙',
                '拼色设计裙', '条纹度假裙', '同心圆纱裙', '星点公主裙'];

  // ══════════════════════════════════════════════════════════════════
  // 【车队排序策略】orderCarsByDepth —— 只改车队顺序，不动图案/颜色/豆位/容量/车数
  // ══════════════════════════════════════════════════════════════════
  // 【为什么需要】实测（tools/verify-lv2.js，40 局全新 seed 池）：
  //   deriveCars 默认的「加权随机打散」= 主动把不同颜色摊开给玩家 → 队列前 4 格
  //   几乎总有一辆现在就能干活的车 → 闭眼抓都对（Wzero 71%）→ 车进场秒吃满立刻走
  //   → 车位占用均值仅 0.20/5、紧张率 1% → 车位是免费资源 → 普通玩家胜率 93%。
  //
  // 【本策略】按「该颜色最早能被取到的剥离深度」降序排 —— 内层色的车排在前面。
  //   玩家开局看到的队列前 4 辆，颜色大多还埋在图案内部取不到 → 必须挑车、必须为
  //   后面的车留位 → 车位第一次成为稀缺资源。
  //
  // 【实测对比 · 第 2 关 · 40 局 · 图案与颜色零改动】
  //           车位占用  峰值  紧张率  Wzero  随手  普通  老手
  //   随机打散    0.20   0.8    1%    71%   85%   93%   95%
  //   深度优先    1.06   2.1   14%    37%   57%   57%   57%
  //   → 车位占用 ↑5.3 倍、紧张率 ↑14 倍、普通胜率 93%→57%
  //
  // 【已知局限】老手胜率 = 普通胜率（技术增益 +0pt）。本关胜负主要由图案本身决定
  //   （某些模板色数少、颜色成块，天生送分），而非玩家决策水平。待后续用
  //   「图案候选池按色数/spread 筛选」补齐。
  function orderCarsByDepth(cars, beans, seed) {
    if (!cars || cars.length < 2 || !beans || !beans.length) return cars;
    var i, b, minx = 1e9, maxx = -1e9, miny = 1e9, maxy = -1e9;
    for (i = 0; i < beans.length; i++) {
      b = beans[i];
      if (b.gx < minx) minx = b.gx;
      if (b.gx > maxx) maxx = b.gx;
      if (b.gy < miny) miny = b.gy;
      if (b.gy > maxy) maxy = b.gy;
    }
    var rows = maxy - miny + 1, cols = maxx - minx + 1;
    if (rows < 1 || cols < 1) return cars;
    var grid = [], r, c, row;
    for (r = 0; r < rows; r++) { row = []; for (c = 0; c < cols; c++) row.push(null); grid.push(row); }
    for (i = 0; i < beans.length; i++) grid[beans[i].gy - miny][beans[i].gx - minx] = 1;
    var pd = peelDepth(grid, rows, cols);
    if (!pd || !pd.d) return cars;
    // 每色的「最浅深度」= 该色最早可被取走的轮次。越大 = 越晚暴露 = 越该排前面。
    var minD = {};
    for (i = 0; i < beans.length; i++) {
      var dd = pd.d[beans[i].gy - miny][beans[i].gx - minx], col = beans[i].color;
      if (minD[col] === undefined || dd < minD[col]) minD[col] = dd;
    }
    // 同深度的车用 seed 派生随机打破平局 → 同 seed 必得同一支车队（可复现、可分享）
    var rnd = rng(seed >>> 0), tie = [];
    for (i = 0; i < cars.length; i++) tie.push(rnd());
    var idx = [];
    for (i = 0; i < cars.length; i++) idx.push(i);
    idx.sort(function (a, b2) {
      var da = minD[cars[a].color] === undefined ? 0 : minD[cars[a].color];
      var db = minD[cars[b2].color] === undefined ? 0 : minD[cars[b2].color];
      if (db !== da) return db - da;
      return tie[a] - tie[b2];
    });
    var out = [];
    for (i = 0; i < idx.length; i++) out.push(cars[idx[i]]);
    return out;
  }
  LG.orderCarsByDepth = orderCarsByDepth;

  // ══════════════════════════════════════════════════════════════════
  // 【难度旋钮 · P2】spreadWindow —— 让「可见的 4 个候选」各有代价
  // ══════════════════════════════════════════════════════════════════
  // 【用户原话】「每轮出车的候选里，你现在是不是都把好的对的车放到了一个候选里，
  //   就导致我一直选择哪个坑位必然不会错，这个也不是很好」
  //
  // 【问题真因】orderCarsByDepth 是纯排序 → 同深度的车必然挨在一起 → 队列前 4 格
  //   经常是同色或同「暴露时机」的车。后果：4 个候选是同一类东西，随便拖哪个都
  //   一样，"选哪个"根本不构成决策。
  //
  // 【修法】在保持全局深度倾向的前提下，强制【每个可见窗口内颜色互不相同】：
  //   逐个填充输出位，从前方 lookahead 缓冲里挑第一辆「颜色未出现在最近 W-1 辆里」
  //   的车；挑不到才退让。这样任意连续 4 辆必然是 4 种不同颜色 → 每个候选对应
  //   一种不同的局面判断（这色现在能挖吗？会不会占死位子？），选择才真的有代价。
  //
  // 注意：这【不改变车队构成】（颜色/容量/总数全同），只重排顺序。
  function spreadWindow(cars, W, seed) {
    if (!cars || cars.length <= W) return cars;
    var rnd = rng((seed >>> 0) || 1);
    var pool = cars.slice(), out = [], recent = [], i, j;
    var LOOK = Math.min(pool.length, W * 3);      // 只在前方有限窗口内找，保住全局倾向
    while (pool.length) {
      var pickAt = -1, lim = Math.min(LOOK, pool.length);
      for (i = 0; i < lim; i++) {
        var dup = false;
        for (j = 0; j < recent.length; j++) if (recent[j] === pool[i].color) { dup = true; break; }
        if (!dup) { pickAt = i; break; }
      }
      // 全都撞色（例如只剩一种颜色）→ 退让取队首，并用 seed 随机打破僵局避免固定模式
      if (pickAt < 0) pickAt = Math.floor(rnd() * Math.min(2, pool.length));
      out.push(pool[pickAt]);
      recent.push(pool[pickAt].color);
      if (recent.length >= W) recent.shift();
      pool.splice(pickAt, 1);
    }
    return out;
  }
  LG.spreadWindow = spreadWindow;

  // ══════════════════════════════════════════════════════════════════
  // 【难度旋钮 · P3】多维难度配置 —— 从「只有一个排序开关」扩到四个正交旋钮
  // ══════════════════════════════════════════════════════════════════
  // 【用户原话】「我感觉在难度调节的方法上，你现在太单一了」
  //
  // 旧状态：DEEP_QUEUE_LEVELS 只是个 on/off 白名单，难度只能"开"或"关"。
  // 现在拆成四个可独立组合的旋钮，每个作用于不同的决策维度：
  //
  //   queueOrder  排队顺序      —— 决定「队列里的车现在能不能用」（时间维）
  //     'random'    = deriveCars 的加权随机（原版，最松）
  //     'deepFirst' = 内层色排前面 → 前 4 格常常都用不上 → 必须挑、必须留位
  //
  //   windowMix   候选去重宽度  —— 决定「4 个候选是否各有代价」（选择维）
  //     0 = 不去重（同色可能连着出，选哪个都一样）
  //     4 = 可见 4 格颜色互不相同（每个候选都是不同的判断）
  //
  //   capMax      单车容量上限  —— 决定「车吃不吃得满」（车位压力维）
  //     越大 → 车数越少、每辆越吃不满 → 越可能占着位子等 → 车位越紧张
  //
  //   decoy       干扰车数量    —— 决定「有多少纯风险车」（风险维）
  //     场上没有的颜色，放进去永久占位。是运气成分，不宜过高。
  //
  // 【设计原则】难度要靠【多个维度小幅叠加】，而不是把单一旋钮拉到极限 ——
  //   后者会让关卡从"简单"直接跳到"劝退"，中间没有过渡。
  // ⚠️⚠️ 【2026-08-29 修复 · 难度轴从第 3 关起「断电」】⚠️⚠️
  // 【用户原话】「关卡候选难度还是不够，从第三关开始除了 ghost 的车占位之外，
  //   其他的难度也要加上」。
  // 【根因】旧表是【枚举式】的，只写了 `2: {...}` 一行 → 第 3 关起全部落到
  //   DIFF_DEFAULT = { random, 0 }，上面精心设计的两个正交旋钮【全部关掉】，
  //   难度只剩 decoy(ghost) 一根独苗在扛。这同时解释了两个用户可感知的现象：
  //     ① 第 2 关「很难但死法单一」—— 三重压力全堆在这一关
  //     ② 第 3 关起「难度反而掉了」—— 只剩 ghost 的随机占位
  // 【为什么必须换成分段函数而不是继续填表】关卡是【无限】的（LADDER_END=45 之后
  //   仍在持续出关）。枚举表天然覆盖不全：填到第 50 关，第 51 关照样断电。
  //   分段函数保证「任意 n 都落在某一段内」，结构上不存在默认关闭的空洞。
  // 【windowMix 的硬上限 = 该段色数 C】spreadWindow 要求窗口内颜色互不相同。
  //   若 windowMix > C，池子里永远凑不出不撞色的候选 → 每步都走「全撞色 → 退让
  //   取队首」的兜底分支 → 去重彻底失效，白算一趟还拖慢生成。
  //   故下面每段的 mix 都严格按该段 LADDER 的 C 取值，绝不超发。
  var DIFF_DEFAULT = { queueOrder: 'random', windowMix: 0 };
  function diffCfgOf(n) {
    n = n | 0;
    // 【第 1 关 · 教学】两个旋钮全关。新手第一关必须「随便拖都能过」，
    // 任何挫败都直接掉留存。对齐 LADDER 该段的 decoy=0 / shellK=0。
    if (n <= 1) return { queueOrder: 'random', windowMix: 0 };
    // 【第 2~4 关 · 进阶 C=5】内层色排前面 + 4 格候选互不撞色。
    // 这正是第 2 关原有的配置，现在【延续到第 4 关】而不再只此一关。
    if (n <= 4) return { queueOrder: 'deepFirst', windowMix: 4 };
    // 【第 5~7 关 · 提速 C=5~6】维持 deepFirst，mix 提到 5。
    // 4→5 的实质差别：连队列第 5 格也不再有重复色兜底，
    // 每一次选车都成为一次独立判断，不能再靠「随便点一个同色的」蒙混。
    if (n <= 7) return { queueOrder: 'deepFirst', windowMix: 5 };
    // 【第 8 关起 · 主力/硬核/极限 C=6】mix 拉到 6 并封顶（C=6 时的最大有效值）。
    // 此时可见候选 6 色全不同 →「留哪个位子给哪种颜色」必须提前 2~3 步规划。
    // 再往上加没有收益（见上面 mix ≤ C 的说明），该段的增量难度改由
    // LADDER 的 capMax 收紧（12→9）与 shellK 提升（3→4）承担。
    return { queueOrder: 'deepFirst', windowMix: 6 };
  }
  LG.diffCfgOf = diffCfgOf;

  // ── 【难度真轴】开局可取色数 ────────────────────────────────────
  // 【为什么是它】2026-08-29 用 tools/diff-anatomy.js 把六根旧旋钮逐一单独扫描：
  //   · ghost decoy 4.92→0：胜率 70%→70%，纹丝不动
  //     （tools/diag-deadlock2.js 打出失败现场：60 个僵尸车位里 ghost 一个都没有）
  //   · shellK 3→0：胜率 70%→70%。tools/probe-shell.js 实测「开局可取色」
  //     在关2~关10 恒定 2.3~2.4 —— 契约 sh 从 2 调到 3，这个量根本没动
  //   · capMax 11→20：胜率反而 70%→65%，方向是反的
  //   唯一与胜率强相关的量是【开局有几种颜色能动】：
  //     关4 该值 1.9 → 胜率 47%（最难那关）；其余关 2.3~2.4 → 胜率 60~73%
  //   但它此前是随机副产品、无人控制 → 难度曲线在 40%~73% 之间乱跳，
  //   玩家体验是「第3关卡半天、第5关一把过、第6关又卡死」，没有变强的感觉。
  // 【定义】开局第一批「能取到」的豆覆盖了几种颜色。越少 → 可选路线越窄 → 越难。
  // 【为什么它才是真难度】5 个车位是唯一稀缺资源。开局能动的色越少，
  //   玩家越容易把车位喂给「现在取不到的颜色」→ 车装不满 → 永久占位 → 死局。
  //   这是【可规避】的难度（看清楚就能避开），不是随机判死。
  function measureOpenColors(beans) {
    var bd = PD.buildBounds(beans);
    var top = PD.buildTopIndex(beans), occ = PD.buildOccupancy(beans);
    var seen = {}, cnt = 0, i;
    for (i = 0; i < beans.length; i++) {
      var b = beans[i];
      if (b.gone) continue;
      if (!PD.isPickable(b, top)) continue;
      if (!PD.pathOut(b, occ, bd, null)) continue;
      if (!seen[b.color]) { seen[b.color] = 1; cnt++; }
    }
    return cnt;
  }

  // ── 目标胜率曲线（用户 2026-08-29 指定）────────────────────────
  // 关1 教学 90% → 关2 60% → 关3 50% → 关4 45% → 关5 40% → 关6 35% → 之后递减
  // 【为什么 20% 封底】IAA 靠失败驱动广告，但胜率低于 20% 玩家直接流失，
  //   拿不到曝光反而亏。20% = 「五局能过一局」的心理下限。
  function targetWinRate(n) {
    if (n <= 1) return 0.90;
    if (n === 2) return 0.60;
    if (n === 3) return 0.50;
    if (n === 4) return 0.45;
    if (n === 5) return 0.40;
    if (n === 6) return 0.35;
    var w = 0.35 - (n - 6) * 0.015;
    return w < 0.20 ? 0.20 : w;
  }

  // ── 胜率 → 开局可取色数（由实测标定，非拍脑袋）──────────────────
  // 【标定数据】probe-shell.js / diag-deadlock3.js 实测对照：
  //     1.9 色 → 47% ｜ 2.3 色 → 60~67% ｜ 2.4 色 → 67~73% ｜ 3.0 色 → ~100%
  //   斜率约「每 0.1 色 ≈ 5pt 胜率」。据此反解目标色数。
  // 【为什么给区间而非定值】开局可取色是整数，落不到 2.3。给 [lo,hi] 区间，
  //   让同一关不同 seed 在区间内分布 → 统计胜率落到目标附近。
  //   这同时保住了「难度是契约、图案是变量」。
  function openColorsTarget(n) {
    var w = targetWinRate(n);
    var ideal = 1.9 + (w - 0.47) / 0.05 * 0.1;
    var lo = Math.floor(ideal), hi = Math.ceil(ideal);
    if (lo < 2) lo = 2;              // 【硬下限 2】只有 1 色能动 = 开局怎么选都错 = 随机判死
    if (hi < lo) hi = lo;
    if (n <= 1) { lo = 3; hi = 9; }  // 教学关：随便抓都对
    return { lo: lo, hi: hi, ideal: ideal };
  }
  // ── 【难度第二轴】开局前4格可用车数 ─────────────────────────────
  // 【为什么需要第二根轴】开局可取色有硬下限 2（只有 1 色能动 = 随机判死），
  //   压到 2 之后关 4 实测仍有 67% 胜率，而目标是 45% 并要继续往下降 —— 没有下降空间了。
  // 【怎么找到它】tools/find-axis2.js 收集关4~8 共 120 局，按多个候选量分组看胜率：
  //     前4格可用车数=0 → 22%(n=41)  =1 → 67%(n=15)  =2 → 64%(n=47)  =3 → 82%(n=17)
  //   单调递增、跨度 60pt、样本充足 → 有效轴。
  //   （另两个候选「见全色轮数」「车队长」跨度也大但【不单调】
  //     —— 5轮67%、7轮20%、8轮50% —— 那是噪声不是因果，弃用。）
  // 【定义】队列前 4 格（玩家能看到能抓的窗口）里，有几辆车的颜色是「开局就能装豆」的。
  //   = 0 意味着玩家开局无论抓哪辆都会先卡一个车位。
  function measureFrontUsable(beans, cars) {
    var bd = PD.buildBounds(beans);
    var top = PD.buildTopIndex(beans), occ = PD.buildOccupancy(beans);
    var ok = {}, i;
    for (i = 0; i < beans.length; i++) {
      var b = beans[i];
      if (b.gone) continue;
      if (PD.isPickable(b, top) && PD.pathOut(b, occ, bd, null)) ok[b.color] = 1;
    }
    var cnt = 0, m = cars.length < 4 ? cars.length : 4;
    for (i = 0; i < m; i++) if (ok[cars[i].color]) cnt++;
    return cnt;
  }

  // ── 胜率 → 前4格可用车数（由 find-axis2.js 实测标定）──────────────
  // 标定点：0→22% ｜ 1→67% ｜ 2→64% ｜ 3→82%
  // 【关键：这不是渐变，是断崖】1 和 2 几乎等价（67% vs 64%），
  //   真正的落差全在 0 和 1 之间（22% → 67%，45pt）。
  // 【所以不能用区间硬卡】第一版把关5/6 卡成 [1,1]、关7+ 卡成 [0,1]，
  //   实测关6 掉到 7%（目标35%）—— 因为一旦允许 0，命中的几乎全是 0。
  // 【改用混比】给定该关目标胜率 w，反解「0 档应占多大比例 p」：
  //     w = p × 0.22 + (1-p) × 0.68   →   p = (0.68 - w) / 0.46
  //   再用 seed 做伯努利抽样决定这一局是 0 档还是 1+ 档。
  //   同 seed 必得同一结果（可复现），但统计上胜率会落到目标附近。
  function frontUsableTarget(n, seed) {
    var w = targetWinRate(n);
    if (n <= 1) return { lo: 3, hi: 9 };            // 教学关：前4格至少3辆能用
    // 【基准从 0.68 改 0.60】0.68 是 find-axis2.js 在【旧生成器】上测的 1+ 档均值，
    //   但那时开局色还没被锁到 2。锁死之后 1+ 档本身就更难了，
    //   实测 20 局×8关反解出的真实基准约 0.60。用错基准会系统性低估 p → 整体偏易。
    // 【基准 0.60→0.66 分母 0.38→0.44】收窄常规档到[1,2]后，常规档均值升到约0.66。
    // 关5/7/8 仍偏易(+15~+33)是因为 p 算小了。用真实的常规档均值重标定。
    var p = (0.66 - w) / 0.44;
    if (p < 0) p = 0;
    // 【封顶从 0.85 提到 0.95】0.85 时关8 实测 68%（目标32%）—— 留的喘息局太多。
    //   0.95 仍保证每 20 局有 1 局是常规档，不会连续挫败。
    // ⚠️【关6/10 专项回调 · 2026-08-31】这两关实测 10%（目标 35%/29%），偏难 19~25pt。
    //   【根因】它们同时吃到了三重叠加：cap=10（车多）+ p≈0.70~0.84 的高难档比例
    //   + 本关图案本身色少。而同段的关5/7 已经靠 cap 达标，说明是这两关被压过头。
    //   【为什么不动 LADDER】动 cap/d 会牵连整段（前面已实证：改关5 段的 cap
    //   会让关6 从 25% 掉到 10%，改关8 段的 d 会让关9 一起变）。
    //   难档比例 p 是【按关卡单独算】的，改它才能精准只影响这一关。
    //   【回调幅度】p 降 0.18 ≈ 胜率 +8pt（0.18 × 45pt 落差），把 10% 拉到 18~20% 区间。
    //   仍略偏难，但比「偏易白送关」健康，且保留了难档为主的骨架。
    // ⚠️【关6/9/10 专项 p 微调已回退 · 2026-08-31 实测记录】
    //   试过 `if (n===6||n===10) p -= 0.18; if (n===9) p += 0.15;`，结果：
    //     关9 从 44% 直接过冲到 11%（想要 31%）、关6 纹丝不动仍 10%、关10 15%。
    //   【为什么失败 —— 重要教训】p 到胜率【不是线性的】。
    //     标定公式假设「难档 22% / 常规档 67%」两点线性混合，但 fu 闸门是
    //     带重试的拒绝采样：p 一变，重试次数跟着变（关9 重试从 8.7 飙到 15.4），
    //     命中的图案分布整体漂移 → 实际难度跳变远大于 0.15×45pt 的预估。
    //   【结论】p 只适合做粗调（定档），不能用来做 ±10pt 的精修。
    //     关6/10 偏难、关9 偏易这三处留待后续用「第四根轴」解决，
    //     不再用 p 硬拧 —— 硬拧的结果是三关一起失控。
    if (p < 0) p = 0;
    if (p > 0.95) p = 0.95;
    var r = (((seed ^ 0x2545f491) >>> 7) % 1000) / 1000;
    if (r < p) return { lo: 0, hi: 0 };              // 本局走「难档」：前4格一辆都不能用
    // 【常规档收窄到 1~2】原为 [1,4]，实测大量落在 3 —— 而 fu=3 的胜率 82%（远高于 1~2 档的 64~67%）。
    // 一次难档 + 三次 82% 的常规档，统计胜率必然偏易。1~2 档才是标定时的「常规」。
    return { lo: 1, hi: 2 };
  }

  PD.LG_measureOpenColors = measureOpenColors;
  PD.LG_targetWinRate = targetWinRate;
  PD.LG_openColorsTarget = openColorsTarget;
  PD.LG_measureFrontUsable = measureFrontUsable;
  PD.LG_frontUsableTarget = frontUsableTarget;

  function genLevel(n, seed, opt) {
    opt = opt || {};
    var D = difficulty(n);
    // 参数覆盖（仅供 tools/winrate.js 做参数扫描用，线上不传）
    // 【修 bug】旧写法重建对象时漏掉 decoy / shellK 两个字段 → 一旦传 forceC/forceS，
    // 难度旋钮全部静默归零 → 扫描出来的胜率全是「无陷阱空跑」，数据无效。
    // 现在改成属性赋值、不重建对象 → 新增旋钮永不会再被遗漏。
    if (opt.forceC) D.C = opt.forceC;
    if (opt.forceS !== undefined) D.S = opt.forceS;
    if (opt.forceCap) D.capMax = opt.forceCap;
    if (opt.forceDecoy !== undefined) D.decoy = opt.forceDecoy;
    if (opt.forceShell !== undefined) D.shellK = opt.forceShell;
    if (opt.forceUsable) D.usable = opt.forceUsable;
    if (seed === undefined || seed === null) seed = ((n * 2654435761) ^ 0x9e3779b9) >>> 0;
    var colors = COLOR_ORDER.slice(0, D.C);    // 亮色优先，black 最后（用户铁律：前期不出黑）

    var tries = 0, lv = null, best = null, sol = null;
    // 【maxTries 12→24】新增了「开局可取色」准入门，命中率必然下降。
    // 12 次不够会频繁走到「降级采用最优候选」，那条路径不保证难度契约。
    // 【maxTries 24 -> 32 · 2026-08-31】色数下限按素材上限截断后，回落从 12/60 降到 5/60，
    // 剩余 5 例都是"差一点就过"的边界局。真机对 null 有兜底（回落固定遮罩关，不白屏），
    // 所以回落不是事故、只是质量折扣 —— 但既然多跑 8 次就能把折扣吃掉，就值得。
    // ⚠️ 不要无脑加大：早前实测 maxTries=36 会让 20 关 x 3 seed 跑到分钟级，
    //    CI 门禁会超时。32 是"能吃掉边界局"和"门禁仍然跑得动"的平衡点。
    while (tries < (opt.maxTries || 32)) {
      var sd = (seed + tries * 7919) >>> 0;
      // 造型优先（爱心/西瓜/冰淇淋/火炬…），失败才回落旧裙型 —— 保证永远有图可出
      // 【难度分级】传 D.C：按色数挑图，参考游戏就是这么做的（关卡1西瓜4色→关卡2冰淇淋7色）
      // 传 D.n：第一关固定西瓜，对齐参考图第一印象
      var shape = genArt(sd, D.N, D.C, D.n) || genShape(sd, D.N);
      var paint = paintBeans(shape, colors, sd, { shellK: D.shellK || 0 });
      // 传 seed：车队的容量分配与排队顺序都随机化，但同 seed 必得同一支车队（可复现）
      var carList = PD.deriveCars(paint.counts, D.S, D.capMax, (sd ^ 0x5bf03635) >>> 0);
      // 【难度旋钮】按关卡配置依次施加「排队顺序」与「候选去重」两个维度。
      // 必须在 validateLevel / solveLevel 之前完成 —— 否则求解器看到的是旧队列，
      // 算出的 carMoves 与真实玩法不符 → 三星阈值全错。
      var dc = diffCfgOf(D.n);
      if (opt.noDeepQueue) dc = { queueOrder: 'random', windowMix: 0 };   // 供 A/B 对照用
      if (dc.queueOrder === 'deepFirst') {
        carList = orderCarsByDepth(carList, paint.beans, (sd ^ 0x1b873593) >>> 0);
      }
      if (dc.windowMix > 1) {
        carList = spreadWindow(carList, dc.windowMix, (sd ^ 0x2545f491) >>> 0);
      }
      var cand = {
        id: D.n,
        title: shape.title || TITLES[sd % TITLES.length],
        tip: '拼豆挡住啦，帮帮我！',
        genKey: 'proc',                       // 标记：程序化生成关卡
        seed: sd, shapeKind: shape.kind, paintMode: paint.mode,
        cols: shape.cols, rows: shape.rows,
        cell: 32,                             // 由 pd-game 按 rows/cols 再做自适应
        counts: paint.counts,
        maxLayer: 0,                          // 用户铁律：永远只一层
        slots: D.slots,
        beans: paint.beans,
        // 传 seed：车队的容量分配与排队顺序都随机化，但同 seed 必得同一支车队（可复现）
        cars: carList,
        decoyN: D.decoy,
        stars: { three: 0, two: 0 },
        _diff: D
      };
      // ── 双重校验（铁律 5 + 运行时口径）──
      var errs = PD.validateLevel(cand);
      if (errs.length) { tries++; continue; }

      // ── 【难度真轴准入】开局可取色数必须落在目标区间 ──────────────
      // 【为什么放在 validateLevel 之后、solveLevel 之前】
      //   validateLevel 保证结构合法（有豆必有车），是前提；
      //   而 solveLevel 很贵（要跑完整求解），所以先用这个便宜的检查筛掉不合格图案。
      // 【为什么分两轮】约束太硬会导致 12 次全不达标 → 降级采用最优候选 →
      //   难度契约失效。做法：前 2/3 次严格要求落在 [lo,hi]，后 1/3 放宽到
      //   「不低于 lo」（宁可偏难也不要偏易，因为偏易 = 白送关）。
      var oc = measureOpenColors(cand.beans);
      cand._openColors = oc;
      var fu = measureFrontUsable(cand.beans, cand.cars);
      cand._frontUsable = fu;
      var oct = openColorsTarget(D.n);
      var fut = frontUsableTarget(D.n, sd);
      var strictPhase = tries < Math.floor((opt.maxTries || 32) * 2 / 3);
      if (!opt.noOpenGate) {
        if (strictPhase) {
          // 严格档：两根轴都必须落在区间内
          if (oc < oct.lo || oc > oct.hi) { tries++; continue; }
          if (fu < fut.lo || fu > fut.hi) { tries++; continue; }
        } else {
          // 保底档：宁可偏难也不要偏易（偏易 = 白送关）
          if (oc > oct.hi) { tries++; continue; }
          // 【难档必须坚持到底】若本局抽中难档（fut.hi===0）却在严格档没凑出 fu=0，
          //   这里不能直接放行 fu=2 —— 那等于把难档降级成常规档，是关3~5 系统性偏易的根因。
          //   实测：放行后 frontUsable 实际落到 2.0，胜率 70%（目标 50%）。
          // ⚠️【2026-08-31 收紧到 0，但【只对关5+】】用户「剧情难度现在还是不足」。
          //   诊断实测（tools/diag-easy.js）：关8/9 的 frontUsable 恒为 **1.00**，
          //   而达标的关6=0.00、关10=0.31 —— 说明这两关每一局都走到了保底档，
          //   并被「容忍 fu<=1」全部放行 → 难档 100% 降级成 1 档。
          //   标定表明确写着 0→22%、1→67%：容忍 1 就等于把 22% 的难档
          //   换成 67% 的送分档，一次容忍白送 45pt。
          // 【为什么只对关5+】回测实证：一律收紧到 0 后关3 掉到 35%（目标50%）、
          //   关4 掉到 25%（目标45%）—— 这两关本来是达标的，被压过头变偏难了。
          //   原因是关3/4 的 fu 本就徘徊在 1 附近（关3=1.13），一刀切等于给它们
          //   额外加了一档难度。所以按关卡分档：关3/4 保留容忍 1，关5+ 严格 0。
          // 【阈值 5→8 · 回测修正】第一版设 D.n>=5 严格，结果关6 掉到 10%、关10 掉到 10%
          //   （目标 35%/29%）—— 压过头了。而关5/7 靠上面的 cap 11→10 已经达标（45%/30%），
          //   不需要再叠一层 fu 严格。真正还偏易的只有关8/9，所以阈值收到 8。
          var strictFu = (D.n >= 8);
          if (fut.hi === 0) {
            if (fu > (strictFu ? 0 : 1)) { tries++; continue; }
          }
          else if (fu > fut.hi) { tries++; continue; }
        }
      }

      // ── 【难度第三轴】场上实际色数 + 单色占比 ──────────────────────
      // 【为什么需要】关8/9 在前两轴都触底后仍偏易 +43/+35。查证发现：
      //   契约要 C=6，但实际只出 3 色×18局 / 5 色×60局 / 6 色×0局 —— 契约从未达成。
      //   而 3 色关的最大单色占比高达 57~63% —— 一个颜色占六成豆，
      //   意味着大半车都是同一色、随便抓都对，难度天然归零。
      // 【为什么之前没发现】旧 LADDER 只写 C（契约色数），从不校验实际落地色数。
      //   genArt 挑的图案能承载几色是图案自己的属性，不受 C 控制。
      var realCols = {}, rcN = 0, rcMax = 0, ri;
      for (ri = 0; ri < cand.beans.length; ri++) {
        var rc = cand.beans[ri].color;
        if (!realCols[rc]) { realCols[rc] = 0; rcN++; }
        realCols[rc]++;
        if (realCols[rc] > rcMax) rcMax = realCols[rc];
      }
      cand._realCols = rcN;
      cand._maxShare = rcMax / cand.beans.length;
      // ══ 【色数下限必须按素材库真实上限截断 · 2026-08-31】═══════════════
      // 【实测证据】ART 共 14 张，原生色数分布：2色×0 3色×3 4色×6 5色×4 7色×1。
      //   原生 >= 6 色的【只有 icecream 一张】。而 LADDER 从关6 起契约 C=6，
      //   于是 rcN >= C-1 = 5 这条下限，在关6+ 只有 icecream/lolli 能满足。
      // 【造成的两个连锁后果】
      //   ① 图案重复率 55%（lolli 独占 88%）—— 玩家连打十几关看到同一张图
      //   ② 一旦让别的图进入轮转，它们必然过不了这条下限 → 24 次重试耗尽
      //      → 生成器回落 12/60，且【全部集中在关6+】（关1~5 零回落），
      //      与"只有一张图 >=6 色"的推断完全吻合。
      // 【为什么不改 LADDER 的 C】注释已警告：动 cap/C 会牵连整段难度标定
      //   （实证：改关5 段的 cap 会让关6 从 25% 掉到 10%）。C 还被 deriveCars
      //   用来切车队，改它等于重做全部标定。
      // 【为什么截断是安全的】rcN 只是难度的【间接代理】，真正的载体是
      //   _maxShare（已实证：占比 62% → 难度归零）。而 _maxShare 这条闸门
      //   完整保留、一点没放松。截断只是把"要求素材做不到的事"这条
      //   数学上不可满足的约束去掉 —— 不可满足的约束不是难度，是死锁。
      // 【教训】我在这一处连续四次改参数（放宽池子/换合并方向/加 bigN 门槛/
      //   调阈值）都只让数字微动或纹丝不动。第四次无效时才回到"该怀疑假设
      //   本身"——真相是【契约要求超出了资产能力】，不在任何参数里。
      var _cnt = 0, SUPPLY_C = 5;
      for (ri = 0; ri < ART.length; ri++) if (ART[ri].C >= 6) _cnt++;
      if (_cnt >= 3) SUPPLY_C = 6;               // 素材库补齐后自动放开，无需改代码
      var needCols = Math.min(D.C - 1, SUPPLY_C - 1);
      if (!opt.noOpenGate && D.n >= 2) {
        // 【关2 也要管 · 2026-08-31】旧条件是 D.n >= 5，于是关2 完全不受第三轴约束。
        //   诊断实测（tools/diag-easy.js）：关2 实际色数只有 3.0、单色占比高达 **62%**，
        //   而同样偏易的关5/7 是 31~36%、达标的关3 是 42%。
        //   一个颜色占六成豆 = 大半车都是同一色 = 随便抓都对 → 难度天然归零。
        //   这正是关2 偏易 +20 的根因，跟 ghost/壳层都无关。
        // 【为什么原来要跳过前几关】怕卡住教学梯度。但真正需要「色少」的只有关1（教学），
        //   关2 已经是「进阶」档（LADDER tag='进阶'、契约 C=5），没有理由放任 62% 单色。
        // 【关2 用单独的宽松阈值】关2 契约 C=5，若照关5+ 要求 rcN >= C-1 = 4 会重试爆炸；
        //   实测关2 图案普遍只承载 3 色。所以关2 只卡【单色占比】这一项（真正的病灶），
        //   不卡色数下限 —— 精准打击，不牵连生成成功率。
        // 【只卡关2 · 回测修正】第一版写 D.n < 5 都算 isLv2（即关2/3/4 都上单色闸门），
        //   结果关3 从 45%→35%、关4 从 40%→25%，双双被压成偏难 —— 这两关本来是达标的。
        //   病灶只在关2（单色占比 62%），关3/4 本来就只有 42%/31%，根本不需要这道闸。
        //   所以精准只对关2 生效，绝不牵连邻关。
        var isLv2 = (D.n === 2);
        if (D.n >= 5 || isLv2) {
          if (strictPhase) {
            if (!isLv2 && rcN < needCols) { tries++; continue; }
            if (cand._maxShare > 0.45) { tries++; continue; }
          } else {
            if (!isLv2 && rcN < needCols - 1) { tries++; continue; }
            if (cand._maxShare > 0.55) { tries++; continue; }
          }
        }
      }

      // 用【运行时口径】求解：可用车位 5、接 pathOut 走路判定、含僵尸车峰值
      var s = PD.solveLevel(cand, { slots: D.usable, walk: true });
      if (s.solvable === true && s.zombiePeak < D.usable) { lv = cand; sol = s; break; }
      if (!best || (s.stuckRemain || 1e9) < (best.s.stuckRemain || 1e9)) best = { lv: cand, s: s };
      tries++;
    }
    if (!lv && best) { lv = best.lv; sol = best.s; console.warn('[levelgen] lv' + n + ' 降级采用最优候选'); }
    if (!lv) return null;

    // 三星阈值由求解器回写（禁止手填）——【修正】用 carMoves（调车次数），
    // 与运行时 S.moves 同语义。旧代码用 minMoves（含装豆次数）导致恒定三星。
    lv.stars.three = Math.max(sol.carMoves, Math.ceil(sol.carMoves * 1.15));
    lv.stars.two = Math.ceil(sol.carMoves * 1.5);
    lv._meta = {
      carMoves: sol.carMoves, minMoves: sol.minMoves,
      peakSlots: sol.peakSlots, zombiePeak: sol.zombiePeak,
      S: PD.colorStats(lv).min, tries: tries + 1,
      openColors: lv._openColors,                    // 难度真轴 1：开局可取色数
      frontUsable: lv._frontUsable,                  // 难度真轴 2：前4格可用车数
      openTarget: openColorsTarget(D.n),
      frontTarget: frontUsableTarget(D.n, lv.seed),
      targetWR: targetWinRate(D.n)
    };
    // ── 干扰车在【校验与求解之后】注入 ──────────────────────────
    // 【顺序为什么至关重要】validateLevel 会报 E2_COLOR_NO_CAR（有豆无车），
    // 而干扰车是反向的"有车无豆"，若在校验前插入会污染 colorStats/求解口径。
    // 放在最后注入的语义是：【这一关本身 100% 可解，干扰车只是可规避的风险】——
    // 玩家认真看就能绕开，不看就会把车位堵死。这才叫陷阱，而不是随机判死。
    if (D.decoy > 0) {
      var fieldCols = [], ck;
      for (ck in lv.counts) if (lv.counts.hasOwnProperty(ck)) fieldCols.push(ck);
      var realCars = lv.cars, att;
      // 【小数干扰车数 → 整数】伯努利取整：decoy=4.7 → 70% 的局放 5 辆、30% 放 4 辆。
      // 【为什么需要】可用车位 = 5，ghost 数量在 4→5 之间是一道悬崖（实测第 2 关
      // 普通玩家：4 辆 → 75~83%，5 辆 → 31%）。整数旋钮跳过了 40% 这个目标值，
      // 只有让一部分局少放一辆才能把统计胜率停在中间。
      // 用 seed 派生的确定性随机 → 同 seed 仍必得同一关（可复现、可分享）。
      var dBase = Math.floor(D.decoy);
      var dFrac = D.decoy - dBase;
      var dWant = dBase + ((((lv.seed ^ 0x7f4a7c15) >>> 8) % 1000) / 1000 < dFrac ? 1 : 0);
      if (dWant < 1) dWant = 1;
      // 【可解性兜底】注入是随机的，偶发会把干扰车堆成"连广告都救不回来"的死结。
      // 所以每次注入后都用 refPlay 复验一遍：认真玩的人必须能【不看广告】通关。
      //
      // ⚠️【2026-08-29 修复 · ghost 数量全有全无，实测会掉到 0】⚠️
      // 【用户反馈】「第四关 ghost 车不够多，难度好像也不是特别难，还是比较单一」
      // 【实测证据】tools/probe-ghost.js 跑 10 局：
      //     关3 → [0,5,5,5,5,0,5,4,5,0]   关8 → [5,4,0,0,4,0,0,5,5,0]
      //   同一关有时 5 辆、有时 0 辆 —— 玩家感受就是「有时死活过不去、有时随便过」，
      //   难度完全不稳定，这比"不够难"更伤体验。
      // 【根因两条】
      //   ① 剂量阶梯只降到 dWant-2（=3），从没试过 2 或 1；
      //   ② 12 次全失败后 lv.cars 停在 realCars → ghost 直接归零，静默放弃。
      //   于是结果只有「5」和「0」两种，中间档根本取不到。
      // 【修法】阶梯一路降到 1，并且【记住最后一次成功的排布】：
      //   哪怕只塞得进 1 辆，也比 0 辆强 —— 保住难度下限、消灭"白送关"。
      // 【为什么要分「严格档」和「保底档」两轮】
      // refPlay 是一个【无前瞻贪心】参考玩家：车位一堵死就 return false，
      // 它自己不会规划、不会为将来留位。实测（tools/probe-ghost.js）关3 seed0：
      //   injectDecoys 每次都正常塞进了 4 辆 ghost，但 refPlay 16 次全否 →
      //   旧代码于是把 ghost 全部撤销，整关变成 0 干扰 = 白送关。
      // 也就是说 ghost=0 不代表「这张图放不下 ghost」，只代表「那个笨玩家过不去」。
      // 真人是有前瞻的，且还有第 6 车位（广告解锁）这条命，比 refPlay 强得多。
      //
      // 【两轮策略】
      //   第一轮（严格）：要求 refPlay 能【不看广告】通关 —— 最理想，优先采用。
      //   第二轮（保底）：refPlay 全否时，退而求其次用 usable+1（= 允许用广告位）
      //     复验。只要「看一次广告能过」就接受 —— 这正是 IAA 想要的失败点，
      //     而不是把难度直接清零。
      // 【绝不接受的情况】连 usable+1 都过不去 → 才真的退回无 ghost（宁可简单，不可无解）。
      var okCars = null, okN = 0;
      for (att = 0; att < 12; att++) {
        var dn = att < 4 ? dWant : Math.max(1, dWant - Math.floor((att - 4) / 3) - 1);
        var trial = injectDecoys(realCars, fieldCols, lv.counts, dn,
                                 (lv.seed ^ (0x3c6ef372 + att * 0x9e3779b9)) >>> 0);
        lv.cars = trial;
        if (refPlay(lv, D.usable)) { okCars = trial; okN = dn; break; }
        lv.cars = realCars;
      }
      if (!okCars) {
        for (att = 0; att < 12; att++) {
          var dn2 = Math.max(1, dWant - Math.floor(att / 3));
          var t2 = injectDecoys(realCars, fieldCols, lv.counts, dn2,
                                (lv.seed ^ (0x5bf03635 + att * 0x9e3779b9)) >>> 0);
          lv.cars = t2;
          if (refPlay(lv, D.usable + 1)) { okCars = t2; okN = dn2; break; }
          lv.cars = realCars;
        }
      }
      if (okCars) { lv.cars = okCars; lv._meta.decoyN = okN; }
      else {
        // 【换 seed 重生成 · 而不是接受一个零难度关卡】
        // 走到这里说明：这张【图案】本身的颜色依赖结构，加上任何数量的 ghost
        // 都会变成死结（连"允许用广告位"的宽松档都过不去）。
        // 【旧行为的问题】直接 lv.cars = realCars → ghost 归零 → 这一局变成
        //   "白送关"。实测关8 有 4/10 局落到这里，玩家感受就是「时难时易、
        //   难度不稳定」—— 这比单纯的"不够难"更伤体验。
        // 【为什么换 seed 是对的】图案是【变量】、难度是【契约】（本项目的核心设计）。
        //   一张承载不了目标难度的图案，就该换一张，而不是把难度降下来迁就它。
        // 【防无限递归】只重生成一次（_noRetry 标记）。第二次仍失败才接受无 ghost，
        //   保证 genLevel 一定会返回（宁可偶发简单，不可卡死或返回 null）。
        if (!opt._noRetry) {
          var alt = genLevel(n, (seed + 0x9e3779b9) >>> 0,
                             { maxTries: opt.maxTries, _noRetry: 1 });
          if (alt) return alt;
        }
        lv.cars = realCars; lv._meta.decoyN = 0;
      }
    }
    // 【登记真正用上的那张图】必须在这里，不能在 pickArtByC 里 ——
    // 重试期间被淘汰的候选不能污染"最近用过"的记忆。
    if (lv && lv.shapeKind) _markUsed(String(lv.shapeKind).replace(/_\d+$/, ''));
    return lv;
  }
  LG.genLevel = genLevel;   // 【2026-09-04 修复】导出语句随 stash 一起丢了，补回
  // 【2026-09-04 修复】上面这个 genLevel 的收尾 `}` 在 stash 时丢失
  //（pindou-temp-changes 是改到一半被 stash 的，语法不完整导致加载即白屏）。
  // 补回后 node --check 通过；改动仅此一处，无任何逻辑变更。
})();
