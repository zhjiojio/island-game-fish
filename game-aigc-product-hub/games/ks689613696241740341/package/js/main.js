(function () {
  var M3 = window.M3 = window.M3 || {};
  // ── 版本锚点 ────────────────────────────────────────────────────────────
  // 【为什么必须有】扫码预览时最常见的误判是「改动没生效」，但真实原因往往是
  // 手机端命中了旧包缓存。没有锚点就只能靠猜；有了锚点，一看 console 就能确认
  // 「进包的到底是哪一版」。每次改代码：PATCH+1、MARKER 描述换成本轮改了什么。
  M3.BUILD_VER = 'v0.5.10';
  // 【MARKER v0510】2026-09-04 —— 卡顿四连修 + 资源泄漏治理（在 v0.5.9 基线上）
  //
  // 【1 · suck 单飞去抖】8 处 setTimeout(suck) 收敛为 queueSuck 单飞合并；
  //   watchdog 90ms 泵兑底，最坏延迟 ≤90ms ≪ perCar 110ms 放行闸门。
  // 【2 · 桶索引】S.bucket[color] 静止豆按原序，suck/anyMovable/isZombie/
  //   fieldBeanCount/doRefreshShuffle 从「每次全量扫 620 豆」变只扫该色；
  //   top/occ 缓存到豆 gone 才失效；colorAlive O(1) 替代 releaseAdBoostedCars
  //   的 rest 全量扫描。行为与旧写法完全同序，难度口径不变。
  // 【3 · 画布复用】立绘 sharp/tiny/blur + bgCache 四张常驻复用，不再每关
  //   mkCanvas 丢弃给 GC（原生 canvas 内存回收异步，连打多关内存爬升）。
  // 【4 · 低端机动态画质】benchmarkLevel 0~14 封 dpr 1.5，填充率省 ~44%。
  // 【5 · 生命周期】接 onHide/onShow（切后台停 BGM/语音/视频 + 清挂起 suck，
  //   回前台恢复 BGM）+ onMemoryWarning 丢可重建缓存。修复 isZombie 漏判
  //   onWay 误标僵尸车；删 trail/sfxWin 死代码。
  //
  // ══ 以下为 MARKER v059（2026-08-31）历史记录 ══
  // 【1 · 看广告角标「变形」】查证 ad_tag.png 原生 56x40（比例 1.400），代码也传 56x40
  //   —— 比例没错，不是拉伸。真因是【太大 + 挂在按钮外】：旧位置 x=skX+skS-44、y=skY-12，
  //   角标右缘越过圆形按钮右沿 12px、大半悬在空白处。修法：等比缩到 42x30（同为 1.400，
  //   绝不变形），内收贴到按钮右上角。
  //
  // 【2 · 主页/跳过 文字与按钮偏移】两处独立问题，都量化确认后才改：
  //   (a) 整排偏移：旧 homeX=60、跳过右缘=700 → 左边距 60、右边距 50，差 10px。而同屏
  //       标题(180/180)、卡片(62/62)、继续游戏(175/175) 全严格对称，唯独这排偏左。
  //       三按钮总宽 612、间隙 16 → 边距 (750-612-32)/2 = 53 → homeX=53/reX=205/skX=561。
  //   (b) 文字出界：旧 y = 顶边+S-6 距按钮底边仅 6px，而 textBaseline=middle，26px 字的
  //       下半截(13px)会越过圆形下沿。改 S-20，字心上移 14px。
  //   命中区无需改：inCircle/inRect 全由 LY 推导，随按钮自动跟随（已 grep 复核）。
  //
  // 【3 · 难度：修漏而非拧参数】基线 5/10 达标。先写 tools/diag-easy.js 量【实际落地】的
  //   三轴值，找到三个真漏洞：
  //   (a) 关2 单色占比 62%（达标关 31~42%）—— 第三轴闸门条件写的 D.n>=5，关2 不受约束。
  //       一色占六成豆 = 大半车同色 = 随便抓都对。修法：闸门扩到关2，但只卡单色占比、
  //       不卡色数下限（关2 图案普遍只承载 3 色，照关5+ 要求会重试爆炸）。80%→60% 命中。
  //   (b) 关8/9 frontUsable 恒为 1.00（达标的关6=0.00、关10=0.31）—— 每局都走保底档并被
  //       「容忍 fu<=1」放行，难档 100% 降级。标定表写着 0→22%、1→67%，容忍一次白送 45pt。
  //       修法：关8+ 难档只接受 fu=0。
  //   (c) LADDER 难度倒挂：关8 段 d=4.5/4.4，比上一段(4.92)和达标的关3(4.88)都低 —— 关8
  //       竟比关3 宽松。旧注释说「d 该随关递减、靠壳层接手」，但 sh 在 5~18 关恒为 3，
  //       壳层根本没接手，只剩 d 在降。修正为 4.80/4.85。
  //
  // 【被实测证伪的假设】（记下来避免重复怀疑）
  //   · 疑「重试耗尽后降级采用最优候选」绕过闸门 → tools/diag-fallback.js 实测 0/12，从未触发。
  //   · 疑 p 公式算小了 → 反解验证关9 需 p=0.80、现公式恰好给 0.80，公式是对的。
  //
  // 【失败的尝试 · 教训】试过 p 微调精修（关6/10 p-=0.18、关9 p+=0.15），结果关9 从 44%
  //   过冲到 11%、关6 纹丝不动。原因：p 到胜率【不是线性的】—— fu 闸门是带重试的拒绝采样，
  //   p 一变重试次数跟着变（关9 从 8.7 飙到 15.4），命中图案分布整体漂移。已回退。
  //   结论：p 只能粗调定档，不能做 ±10pt 精修。
  //
  // 【回测】达标 5/10 → 7/10：关1 100% 关2 60%(命中) 关3 45% 关4 40% 关5 45% 关6 10%(偏难)
  //   关7 30% 关8 42% 关9 44%(偏易) 关10 10%(偏难)。余下三关需第四根轴，不再用 p 硬拧。
  console.log('[快来帮帮我 ' + M3.BUILD_VER + '][MARKER v0510] 卡顿四连修（suck去抖/桶索引/画布复用/低端机dpr）+ 生命周期补齐（onHide/onShow/onMemoryWarning）+ isZombie onWay 修复');
  // ─────────────────────────────────────────────────────────────────────────
  // ─────────────────────────────────────────────────────────────────────────
  // 【快手小游戏环境文件加载】
  // 快手不走 index.html，由根目录 game.js require 本文件，再由此处按序加载依赖。
  // 「快来帮帮我」使用 Canvas 2D 渲染（原生，无引擎），故不初始化 WebGL 上下文。
  // ─────────────────────────────────────────────────────────────────────────
  if (typeof require === 'function') {
    require('./m3-init.js');
    require('../standard/asset-manager.js');
    require('../standard/kwai-event-bus.js');
    require('../standard/subpackage-loader.js');
    require('../standard/cdn-loader.js');
    require('./kwai-ad-config.js');
    require('../api/kwai-login.js');
    require('../api/kwai-ad.js');
    require('../api/kwai-share.js');
    require('../api/kwai-base.js');    // 系统信息 / 生命周期 / 触摸
    require('../api/kwai-render.js');  // 画布 / 离屏画布 / 帧率
    require('../api/kwai-device.js');  // 振动
    require('../api/kwai-storage.js'); // 关卡进度
    // ↓ 游戏文件（按依赖顺序）
    require('./pd-core.js');           // 数据 / 校验 / 求解器
    require('./pd-levelgen.js');       // 程序化关卡生成（难度契约 + 随机图案）
    require('./pd-game.js');           // 渲染 / 交互 / 音效
    require('./pd-home.js');           // 暂停浮层（必须在 pd-game 之后、G.start 之前）
  }

  function boot() {
    if (!window.M3 || !M3.Game || !M3.Game.start) {
      console.error('[快来帮帮我] 游戏模块未就绪');
      return;
    }
    if (window.KwaiRender && KwaiRender.setPreferredFramesPerSecond) {
      try { KwaiRender.setPreferredFramesPerSecond(60); } catch (e) {}
    }
    M3.Game.start();
  }

  if (typeof document !== 'undefined' && document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
