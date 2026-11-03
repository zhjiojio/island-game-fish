// js/tb-story.js — 剧本数据（自漫改版 story.js 抽取，改造为 Canvas 引擎契约）
// 玩法结构保持不变：四位候选人 / 星光应援 / 实时排名 / 换装 / 小游戏 / 终局 PK / 加冕
(function () {
  var M3 = window.M3;

  // ─── 候选人 ─────────────────────────────────────────────────
  var C = {
    pijiu:    { name: '啤酒妹·佳琪',   short: '佳琪', avatar: 'media/live/avatar-pijiu-v2.png',    color: '#ff7aa2' },
    tiaojiu:  { name: '调酒师·妮蔻',   short: '妮蔻', avatar: 'media/live/avatar-tiaojiu-v2.png',  color: '#8b5cf6' },
    zhuchang: { name: '驻唱歌手·可可', short: '可可', avatar: 'media/live/avatar-zhuchang-v2.png', color: '#22d3ee' },
    lingwu:   { name: '领舞·泡泡',     short: '泡泡', avatar: 'media/live/avatar-lingwu-v2.png',   color: '#fbbf24' }
  };

  // ─── 礼物 ───────────────────────────────────────────────────
  var GIFTS = [
    { id: 'flower',       name: '应援花',     cost: 1,   votes: 1,     icon: '🌹', foley: 'assets/audio/foley/gift-flower.wav' },
    { id: 'cheers',       name: '干杯',       cost: 3,   votes: 10,    icon: '🍻', foley: 'assets/audio/foley/gift-cheers.wav' },
    { id: 'firework',     name: '霓虹烟花',   cost: 20,  votes: 300,   icon: '🎆', foley: 'assets/audio/foley/gift-firework.wav' },
    { id: 'galaxy',       name: '星河闪耀',   cost: 100, votes: 2880,  icon: '✨', foley: 'assets/audio/foley/gift-galaxy.wav' },
    { id: 'tiaimo-night', name: '提艾默之夜', cost: 500, votes: 30000, icon: '🌌', foley: 'assets/audio/foley/gift-night.wav' }
  ];

  // ─── 弹幕池 ─────────────────────────────────────────────────
  // v1.0.8 昵称对齐真实候选人（啤酒妹·佳琪 / 调酒师·妮蔻 / 驻唱歌手·可可 / 领舞·泡泡）
  // 已剔除旧版误伤"支持兔兔"等错位文案
  var CHAT = [
    // 候选人向 · 啤酒妹佳琪
    ['大白兔奶糖',   '佳琪笑起来太甜了吧！'],
    ['三杯不倒',     '啤酒妹开瓶花活我给满分'],
    ['风继续吹',     '佳琪转圈那一下我心动了'],
    ['夜市小霸王',   '这是佳琪吗？我的DNA动了'],
    // 候选人向 · 调酒师妮蔻
    ['夜色微醺',     '妮蔻调酒的手法太稳了'],
    ['威士忌加冰',   '调酒师的眼神会杀人'],
    ['不吃香菜',     '妮蔻姐御姐范拉满'],
    ['马蒂尼女士',   '妮蔻推荐一款晚安酒吧？'],
    // 候选人向 · 驻唱可可
    ['一杯就倒',     '可可的声音好苏啊'],
    ['深夜电台',     '驻唱那首歌我循环 100 遍'],
    ['月光咖啡',     '可可站上去气场就来了'],
    ['半糖去冰',     '可可这唱腔谁顶得住'],
    // 候选人向 · 领舞泡泡
    ['蹦迪永动机',   '泡泡这段太顶了！'],
    ['南三环夜猫',   '领舞泡泡直接封神'],
    ['凌晨三点半',   '泡泡的腰是液态的吧'],
    ['野生舞担',     '泡泡舞台燃到爆'],
    // 通用直播间氛围
    ['清风徐来',     '这才是提艾默直播间的样子'],
    ['酒酿小圆子',   '排名太刺激了'],
    ['老铁666',      '给你们打 call'],
    ['提艾默常客',   '今晚必须蹲到结果'],
    ['潜水的老板',   '看完就下单包夜局'],
    ['金主小张',     '预算已备，四位都要考虑'],
    ['南街酒鬼',     '老板出手真大方'],
    ['吧台常驻',     '四个都想要，选哪个是难题'],
    ['刚下班的',     '来晚了？现在排名第几'],
    ['熬夜冠军',     '这场我陪到最后'],
    ['雪茄小酒',     '兄弟们冲！送礼刷起来'],
    ['凌晨老板',     '给我妮蔻上大礼'],
    ['东三环金主',   '给可可送星河闪耀！']
  ];

  // ─── 换装数据 ───────────────────────────────────────────────
  var beerOutfit = {
    accessory: [
      { label: '兔耳朵', gift: 'cheers',   count: 10, media: 'assets/keyframes/shot-15-beer-rabbit-ears-v1.png', resultText: '老板们为啤酒妹选择了——兔耳朵！', responseText: '嘿嘿，人家是兔兔妹了～老板们有眼光！', responseAudio:'assets/audio/shot-15/beer-result-rabbit.mp3' },
      { label: '猫耳朵', gift: 'firework', count: 1,  media: 'assets/keyframes/shot-15-beer-cat-ears-v1.png',    resultText: '老板们为啤酒妹选择了——猫耳朵！', responseText: '喵～老板真的选了人家最喜欢的猫耳朵，好开心呀！', responseAudio:'assets/audio/shot-15/beer-result-cat.mp3' },
      { label: '毛项圈', gift: 'galaxy',   count: 1,  media: 'assets/keyframes/shot-15-beer-fur-collar-v1.png',  resultText: '老板们为啤酒妹选择了——毛项圈！', responseText: '毛茸茸的好舒服，老板选得这么贵气，人家一定好好表现！', responseAudio:'assets/audio/shot-15/beer-result-collar.mp3' }
    ],
    clothes: [
      { label: '旗袍短裙',       media: 'assets/keyframes/shot-15-beer-qipao-v1.png', responseText:'旗袍短裙穿好了，老板喜欢人家这一身吗？' },
      { label: '蕾丝裙',         media: 'assets/keyframes/shot-15-beer-lace-v1.png', responseText:'蕾丝裙穿好了，这次人家听老板的。' },
      { label: '牛仔热裤+白衬衣', media: 'assets/keyframes/shot-15-beer-denim-v1.png', responseText:'牛仔热裤配白衬衣，老板的眼光果然最懂人家。' }
    ],
    prop: [
      { label: '鲜玫瑰花', media: 'assets/keyframes/shot-15-beer-rose-v1.png', responseText:'玫瑰花也拿好了，完整造型请老板过目。' },
      { label: '腰铃',     media: 'assets/keyframes/shot-15-beer-bells-v1.png', responseText:'腰铃戴好了，完整造型请老板过目。' }
    ]
  };

  function tryOns(id, items) {
    return items.map(function (it) {
      var who = id === 'bartender' ? '妮蔻' : id === 'singer' ? '可可' : '泡泡';
      return { label: it[0], media: 'assets/keyframes/shot-16-' + id + '-' + it[1] + '-v1.png', responseText: who + '已经换上「' + it[0] + '」，选择已加入定装。' };
    });
  }
  var otherOutfits = {
    tiaojiu: {
      accessory: tryOns('bartender', [['及膝黑丝', 'knee-socks'], ['皮质束腰', 'corset'], ['皮质铆钉项圈', 'studded-collar']]),
      clothes:   tryOns('bartender', [['修身短旗袍', 'qipao'], ['百褶裙+紧身T', 'pleated'], ['紧身皮裙', 'leather-dress']]),
      prop:      tryOns('bartender', [['吧椅', 'bar-stool'], ['皮鞭', 'whip']])
    },
    zhuchang: {
      accessory: tryOns('singer', [['渔网袜', 'fishnets'], ['黑蕾丝手套', 'lace-gloves'], ['蕾丝项圈', 'lace-collar']]),
      clothes:   tryOns('singer', [['长款旗袍高开叉', 'long-qipao'], ['黄金战袍', 'gold-dress'], ['丝绸睡裙', 'silk-dress']]),
      prop:      tryOns('singer', [['毛毛扇', 'feather-fan'], ['麦克风支架', 'mic-stand']])
    },
    lingwu: {
      accessory: tryOns('dancer', [['腿环', 'leg-strap'], ['黑丝', 'black-tights'], ['白蕾丝手套', 'white-gloves']]),
      clothes:   tryOns('dancer', [['开衩短旗袍', 'short-qipao'], ['女仆装', 'maid'], ['紧身白衬衣', 'white-shirt']]),
      prop:      tryOns('dancer', [['皮带', 'belt'], ['拐杖', 'cane']])
    }
  };
  var ALL_OUTFITS = {
    pijiu: beerOutfit, tiaojiu: otherOutfits.tiaojiu,
    zhuchang: otherOutfits.zhuchang, lingwu: otherOutfits.lingwu
  };

  // ─── shot 构造器 ────────────────────────────────────────────
  // act/title/text 用于 Canvas HUD 文案；video/poster 走 CDN；
  // voices 为顺序播报的人声；ui 决定交互形态。
  var S = {};
  function shot(id, act, title, text, next, extra) {
    var o = { id: id, act: act, title: title, text: text, next: next };
    if (extra) for (var k in extra) o[k] = extra[k];
    S[id] = o;
    return o;
  }
  var V = 'assets/video/', K = 'assets/keyframes/', A = 'assets/audio/';

  // ═══ 开场 ═══
  // v1.0.3 移除 shot-01 独立封面页（原 enter-live cover），改为直接由 splash 主按钮
  // 进入 shot-02 展示直播间开场。shot-01 的入场 UI 已由 splash 页承担。
  shot('shot-02', '开场', '提艾默直播间', '各位老板投资人，不好了不好了，咱们提艾默酒吧店长跑路了！四个美女候选人马上出场。', 'shot-03', {
    video: V + 'shot-02-opening-v3.mp4', poster: K + 'shot-02-curtain-realistic-v1.png',
    voices: [{ who: '老板助理', audio: A + 'host/shot-02.mp3', text: '各位老板投资人，不好了不好了，咱们提艾默酒吧店长跑路了！先不着急生气，四个美女候选人马上出场。' }]
  });

  shot('shot-03', '开场', '老板席已就位', '见面礼到账：50 星光。接下来每次选择，都会改变四位候选人的实时排名。', 'shot-04', {
    rewardStars: 50, ui: { type: 'confirm', label: '开始选店长' }
  });

  // v1.0.15：剪影展示改为「4 等分点击热区」—— 老板点谁，谁就从屏风后走出来。
  //   options 顺序对齐从左到右：啤酒妹（shot-05）→ 调酒师（shot-07）→ 驻唱（shot-08）→ 领舞（shot-09）
  //   engine 在收到 'silhouette:<idx>' action 时读取 options[idx].next 并 enter()
  //   voices：本地媒体 media/host/shot-04.mp3（minimax voice_id=tiaimo_host_v2 克隆自 shot-02 老板助理音色）
  shot('shot-04', '第一幕', '剪影展示', '从左到右：啤酒妹、调酒师、驻唱、领舞。老板想先见谁？点谁，她就先从屏风后走出来。', 'shot-05', {
    voices: [{ who: '老板助理', audio: 'media/host/shot-04.mp3', text: '老板们，四位候选人已经在屏风后就位。从左到右分别是啤酒妹佳琪、调酒师妮蔻、驻唱可可、领舞泡泡。老板点哪一位，哪一位就从屏风后走出来跟你见面！' }],
    ui: { type: 'silhouette-pick', prompt: '点击选择先见谁', options: [
      { label: '啤酒妹',  next: 'shot-05', cid: 'pijiu' },
      { label: '调酒师',  next: 'shot-07', cid: 'tiaojiu' },
      { label: '驻唱',    next: 'shot-08', cid: 'zhuchang' },
      { label: '领舞',    next: 'shot-09', cid: 'lingwu' }
    ] }
  });

  // ═══ 第一幕 · 候选人介绍 ═══
  shot('shot-05', '第一幕', '啤酒妹介绍', '校花颜值，卖啤酒靠腿；转圈、开瓶花活，她的专业实力等老板检验。', 'shot-06', {
    video: V + 'shot-05-beer-girl-full-v1-web.mp4', poster: K + 'shot-05-beer-girl-v1-crop.png', focus: 'pijiu', previewMs: 11000
  });

  shot('shot-06', '第一幕', '第一次应援', '给啤酒妹暖场，还是先观察其他候选人？', null, {
    ui: { type: 'branch', options: [
      { label: '干杯 ×10（30 星光）',  next: 'shot-06a', gift: 'cheers',   count: 10, to: 'pijiu' },
      { label: '霓虹烟花（20 星光）',  next: 'shot-06a', gift: 'firework', count: 1,  to: 'pijiu' },
      { label: '星河闪耀（100 星光）', next: 'shot-06c', gift: 'galaxy',   count: 1,  to: 'pijiu' },
      { label: '先观察一下',           next: 'shot-06d' }
    ] }
  });
  shot('shot-06a', '第一幕', '干杯暖场', '谢谢老板给啤酒妹送干杯！她的剪影明显蹦了一下：谢谢老板！', 'shot-07', { focus: 'pijiu', intimacy: 10, ui: { type: 'continue' } });
  shot('shot-06c', '第一幕', '星河闪耀', '嚯！星河闪耀！老板出手不凡！啤酒妹差点从屏风后蹦出来。', 'shot-07', { focus: 'pijiu', intimacy: 200, ui: { type: 'continue' } });
  shot('shot-06d', '第一幕', '继续观察', '其他老板仍在应援，你支持的候选人可能被抢先。', 'shot-07', { ui: { type: 'continue' } });

  shot('shot-07', '第一幕', '调酒师介绍', '她不是高冷，是有个性、有态度、很会吵架。老板看好这个类型，就用星光应援她。', 'shot-08', {
    video: V + 'shot-07-bartender-full-v1-web.mp4', poster: K + 'shot-07a-bartender-flair-v1.png', focus: 'tiaojiu', previewMs: 11000,
    ui: { type: 'branch', prompt: '给调酒师暖场，还是看下一位？', options: [{label:'干杯 ×10（30 星光）',next:'shot-08',gift:'cheers',count:10,to:'tiaojiu'},{label:'霓虹烟花（20 星光）',next:'shot-08',gift:'firework',to:'tiaojiu'},{label:'星河闪耀（100 星光）',next:'shot-08',gift:'galaxy',to:'tiaojiu'},{label:'看下一位',next:'shot-08'}] }
  });
  shot('shot-08', '第一幕', '驻唱介绍', '成熟懂人情世故，唱的是故事和白月光。她做店长，闹事的人看见她也消火。', 'shot-09', {
    video: V + 'shot-08-singer-full-v1-web.mp4', poster: K + 'shot-08a-singer-mic-v1.png', focus: 'zhuchang', previewMs: 11000,
    ui: { type: 'branch', prompt: '给驻唱暖场，还是看下一位？', options: [{label:'干杯 ×10（30 星光）',next:'shot-09',gift:'cheers',count:10,to:'zhuchang'},{label:'霓虹烟花（20 星光）',next:'shot-09',gift:'firework',to:'zhuchang'},{label:'星河闪耀（100 星光）',next:'shot-09',gift:'galaxy',to:'zhuchang'},{label:'看下一位',next:'shot-09'}] }
  });
  shot('shot-09', '第一幕', '领舞介绍', '她在屏风后可劲蛄蛹，火辣、太能、太会。想给她机会就应援一下。', 'shot-10', {
    video: V + 'shot-09-dancer-full-v1-web.mp4', poster: K + 'shot-09a-dancer-backlight-v1.png', focus: 'lingwu', previewMs: 11000,
    ui: { type: 'branch', prompt: '给领舞暖场，还是进入最终选择？', options: [{label:'干杯 ×10（30 星光）',next:'shot-10',gift:'cheers',count:10,to:'lingwu'},{label:'霓虹烟花（20 星光）',next:'shot-10',gift:'firework',to:'lingwu'},{label:'星河闪耀（100 星光）',next:'shot-10',gift:'galaxy',to:'lingwu'},{label:'进入最终选择',next:'shot-10'}] }
  });

  // 第一轮已看过完整出场，此处只保留短蒙太奇，避免再次逐人播放口型视频。
  shot('shot-10', '第一幕', '声音钩子', '四位候选人依次亮嗓：撒娇、霸气、温柔、魅惑，各自争取第一个接受面试。', 'shot-11', {
    video: V + 'shot-10-voice-hook-v1-web.mp4', poster: K + 'shot-02-curtain-realistic-v1.png', previewMs: 11000
  });

  // 私藏资料 + all in 选择支持者
  shot('shot-11', '第一幕', '变装方向', '偷偷告诉各位老板，我这里还有关于她们平时兴趣爱好的私藏版资料——一般人我都不告诉！', 'shot-12', {
    poster: K + 'shot-11a-beer-cheer-v1.png',
    voices: [{ who: '老板助理', audio: A + 'shot-11/host-private-files.mp3', text: '偷偷告诉各位老板，我这里还有关于她们平时兴趣爱好的私藏版资料——一般人我都不告诉！' }],
    ui: { type: 'support', prompt: '你要 all in 哪位候选人？', options: [
      { value: 'pijiu',    starCost: 50, label: '50★ 查看啤酒妹私藏资料并 all in' },
      { value: 'tiaojiu',  starCost: 50, label: '50★ 查看调酒师私藏资料并 all in' },
      { value: 'zhuchang', starCost: 50, label: '50★ 查看驻唱私藏资料并 all in' },
      { value: 'lingwu',   starCost: 50, label: '50★ 查看领舞私藏资料并 all in' }
    ] }
  });

  shot('shot-12', '第一幕', '私密资料', '你 all in 的候选人私密资料播放完毕，她会先向你回应。', 'shot-12b', {
    videoBySupport: {pijiu:V+'shot-11a-beer-cheer-v1-web.mp4',tiaojiu:V+'shot-11d-bartender-biker-v1-web.mp4',zhuchang:V+'shot-11c-singer-chef-v1-web.mp4',lingwu:V+'shot-11b-dancer-yoga-v1-web.mp4'}, poster: K + 'shot-02-curtain-realistic-v1.png', crowdTicks: 8, previewMs: 11000,
    voices: [{ bySupport:true, audioBySupport:{pijiu:A+'shot-12/beer-girl.mp3',tiaojiu:A+'shot-12/bartender.mp3',zhuchang:A+'shot-12/singer.mp3',lingwu:A+'shot-12/dancer.mp3'}, textBySupport:{pijiu:'谢谢老板选择我，我会用表现证明你的眼光！',tiaojiu:'老板选了我，就等着看我把场子管好。',zhuchang:'谢谢你愿意听我的故事，我会认真走到最后。',lingwu:'老板懂我！接下来整个舞台都交给我。'} }]
  });

  shot('shot-12b', '第一幕', '私密资料已看完', '你的选择已确认。接下来结算第一轮实时支持度，再邀请榜首候选人正式与老板见面。', 'shot-13', {
    poster: K + 'shot-02-curtain-realistic-v1.png', ui: { type:'confirm', label: '结算第一轮排名' }
  });

  shot('shot-13', '第一幕', '第一名亮相', '倒计时结束！支持度第一的候选人走出屏风，完成专属亮相才艺。', 'shot-14', {
    settle: 'support-first', rewardStars: 20,
    videoBySupport:  { pijiu: V + 'shot-13a-beer-reveal-v1-web.mp4', tiaojiu: V + 'shot-13b-bartender-reveal-v1-web.mp4', zhuchang: V + 'shot-13c-singer-reveal-v1-web.mp4', lingwu: V + 'shot-13d-dancer-reveal-v1-web.mp4' },
    posterBySupport: { pijiu: K + 'shot-13a-beer-reveal-v1.png',     tiaojiu: K + 'shot-13b-bartender-reveal-v1.png',     zhuchang: K + 'shot-13c-singer-reveal-v1.png',     lingwu: K + 'shot-13d-dancer-reveal-v1.png' },
    voices: [
      { who: '老板助理', byLeader: true, audioByLeader: { pijiu: A + 'shot-13/host-intro-pijiu.mp3', tiaojiu: A + 'shot-13/host-intro-tiaojiu.mp3', zhuchang: A + 'shot-13/host-intro-zhuchang.mp3', lingwu: A + 'shot-13/host-intro-lingwu.mp3' },
        textByLeader: { pijiu: '佳琪，恭喜你！请你走出来与各位老板见面！', tiaojiu: '妮蔻，恭喜你！请你走出来与各位老板见面！', zhuchang: '可可，恭喜你！请你走出来与各位老板见面！', lingwu: '泡泡，恭喜你！请你走出来与各位老板见面！' } },
      { byLeader: true, whoByLeader: { pijiu: '佳琪', tiaojiu: '妮蔻', zhuchang: '可可', lingwu: '泡泡' },
        audioByLeader: { pijiu: A + 'shot-13/winner-pijiu.mp3', tiaojiu: A + 'shot-13/winner-tiaojiu.mp3', zhuchang: A + 'shot-13/winner-zhuchang.mp3', lingwu: A + 'shot-13/winner-lingwu.mp3' },
        textByLeader: { pijiu: '谁说开瓶盖不能成为才艺——为了这次面试，我特意学了开瓶盖的舞蹈！', tiaojiu: '管理酒吧，光会说不算本事——摇壶、控场、解决麻烦，我样样都行。', zhuchang: '能听懂每个人的故事，才知道怎么照顾好每一位客人。这首歌送给愿意相信我的你。', lingwu: '酒吧要热闹、要气氛，接下来这支舞，我要把提艾默的场子彻底点燃！' } },
      { who: '老板助理', byLeader: true, audioByLeader: { pijiu: A + 'shot-13/host-outro-pijiu.mp3', tiaojiu: A + 'shot-13/host-outro-tiaojiu.mp3', zhuchang: A + 'shot-13/host-outro-zhuchang.mp3', lingwu: A + 'shot-13/host-outro-lingwu.mp3' },
        textByLeader: { pijiu: '非常用心的表演！为佳琪鼓掌！', tiaojiu: '干净利落！为妮蔻鼓掌！', zhuchang: '唱到心里了！为可可鼓掌！', lingwu: '场子彻底热起来了！为泡泡鼓掌！' } }
    ]
  });

  // ═══ 第二幕 · 化妆间换装 ═══
  shot('shot-14', '第二幕', '进入化妆间', '人靠衣服马靠鞍——我为大家准备了全新的服装套餐，各位老板帮她们做选择！', 'shot-15', {
    video: V + 'shot-14-dressing-room-v1-web.mp4', poster: K + 'shot-14-dressing-room-v1.png',
    voices: [{ who: '老板助理', audio: A + 'shot-14/host-dressing-room.mp3', text: '人靠衣服马靠鞍——要成为优秀的店长，服装选择也得下功夫。各位老板帮她们做选择！' }]
  });

  shot('shot-15', '第二幕', '主推候选人选装', '进入你 all in 候选人的化妆间，完成一套付费定装。', 'shot-16', {
    videoBySupport:{pijiu:V+'shot-15-beer-dressing-room-v1-web.mp4',tiaojiu:V+'shot-16-bartender-base-v1-web.mp4',zhuchang:V+'shot-16-singer-base-v1-web.mp4',lingwu:V+'shot-16-dancer-base-v1-web.mp4'}, posterBySupport:{pijiu:K+'shot-15-beer-base-v1.png',tiaojiu:K+'shot-16-bartender-base-v1.png',zhuchang:K+'shot-16-singer-base-v1.png',lingwu:K+'shot-16-dancer-base-v1.png'},
    outfitPromptAudioByWho:{pijiu:{accessory:A+'shot-15/beer-accessory.mp3',clothes:A+'shot-15/beer-clothes.mp3',prop:A+'shot-15/beer-prop.mp3'},tiaojiu:{accessory:A+'shot-16/bartender.mp3'},zhuchang:{accessory:A+'shot-16/singer.mp3'},lingwu:{accessory:A+'shot-16/dancer.mp3'}},
    outfitPromptTextByWho:{pijiu:{accessory:'这么多装饰都想试，不过猫耳朵真的很可爱……',clothes:'老板想看人家穿什么？旗袍、蕾丝裙和牛仔热裤都可以先选。',prop:'最后再选道具，玫瑰花和腰铃，老板喜欢哪个？'},tiaojiu:{accessory:'先说好，皮裙更配我的风格。老板先从装饰开始选。',clothes:'服装现在选，修身旗袍、百褶裙或紧身皮裙。',prop:'最后选道具，吧椅还是皮鞭。'},zhuchang:{accessory:'我比较喜欢温柔一点的搭配，老板先选装饰吧。',clothes:'服装可以选旗袍、黄金战袍或丝绸睡裙。',prop:'最后是毛毛扇或者麦克风支架。'},lingwu:{accessory:'老板先挑装饰，等会儿再决定整套风格。',clothes:'女仆装、短旗袍和白衬衣，你想先看哪一套？',prop:'最后选皮带或者拐杖，选完就给老板展示。'}},
    ui: { type: 'outfit-dynamic', who: 'support', slots: ['accessory', 'clothes', 'prop'] }
  });

  shot('shot-16', '第二幕', '其余候选人选装', '调酒师、驻唱和领舞依次进入专属化妆间，完成装饰、服装和道具选择。', 'shot-17', {
    video: V + 'shot-16-bartender-base-v1-web.mp4', poster: K + 'shot-16-bartender-base-v1.png',
    videoByWho:  { tiaojiu: V + 'shot-16-bartender-base-v1-web.mp4', zhuchang: V + 'shot-16-singer-base-v1-web.mp4', lingwu: V + 'shot-16-dancer-base-v1-web.mp4' },
    posterByWho: { tiaojiu: K + 'shot-16-bartender-base-v1.png',     zhuchang: K + 'shot-16-singer-base-v1.png',     lingwu: K + 'shot-16-dancer-base-v1.png' },
    voices: [
      { who: '妮蔻', audio: A + 'shot-16/bartender.mp3', text: '老板喜欢哪种我就穿哪种——但说真的，皮裙配我的风格，懂的都懂。' },
      { who: '可可',   audio: A + 'shot-16/singer.mp3',    text: '……丝绸睡裙？各位老板，你们想看我穿睡裙的样子吗？那……要温柔地选哦。' },
      { who: '泡泡',   audio: A + 'shot-16/dancer.mp3',    text: '女仆装？我可以很乖的女仆哦～也可以是很坏的那种～老板你选哪种？' }
    ],
    outfitPromptAudioByWho:{tiaojiu:{accessory:A+'shot-16/bartender.mp3'},zhuchang:{accessory:A+'shot-16/singer.mp3'},lingwu:{accessory:A+'shot-16/dancer.mp3'},pijiu:{accessory:A+'shot-15/beer-accessory.mp3',clothes:A+'shot-15/beer-clothes.mp3',prop:A+'shot-15/beer-prop.mp3'}},
    outfitPromptTextByWho:{tiaojiu:{accessory:'先说好，皮裙更配我的风格。老板先从装饰开始选。',clothes:'服装现在选，修身旗袍、百褶裙或紧身皮裙。',prop:'最后选道具，吧椅还是皮鞭。'},zhuchang:{accessory:'我比较喜欢温柔一点的搭配，老板先选装饰吧。',clothes:'服装可以选旗袍、黄金战袍或丝绸睡裙。',prop:'最后是毛毛扇或者麦克风支架。'},lingwu:{accessory:'老板先挑装饰，等会儿再决定整套风格。',clothes:'女仆装、短旗袍和白衬衣，你想先看哪一套？',prop:'最后选皮带或者拐杖，选完就给老板展示。'},pijiu:{accessory:'先选装饰，猫耳朵、兔耳朵和毛项圈都可以。',clothes:'再选服装，老板喜欢哪一套？',prop:'最后选道具。'}},
    ui: { type: 'outfit-hub', candidates: ['pijiu','tiaojiu', 'zhuchang', 'lingwu'], slots: ['accessory', 'clothes', 'prop'] }
  });

  shot('shot-17', '第二幕', '换装后展示', '上工的服装穿好了！各位老板过目！四位候选人穿着老板们选定的装备站成一排。', 'shot-18', {
    video: V + 'shot-17-outfit-lineup-v1-web.mp4', poster: K + 'shot-17-outfit-lineup-v1.png', rewardStars: 15, outfitReveal: true,
    voices: [
      { who: '老板助理', audio: A + 'shot-17/host.mp3',      text: '上工的服装穿好了！各位老板过目！' },
      { who: '佳琪',   audio: A + 'shot-17/beer-girl.mp3', text: '老板有眼光！穿出了老板要的美，喜欢我就继续应援我哟～' },
      { who: '妮蔻',   audio: A + 'shot-17/bartender.mp3', text: '穿什么不重要，有本事的人穿什么都镇得住场。' },
      { who: '可可',     audio: A + 'shot-17/singer.mp3',    text: '谢谢老板帮我选的……感觉很漂亮。喜欢我的话……可以应援我。' },
      { who: '泡泡',     audio: A + 'shot-17/dancer.mp3',    text: '老板选的果然最懂我～看我穿这身跳舞更带劲！' }
    ]
  });

  // ═══ 第三幕 · 龙哥对抗 ═══
  shot('shot-18', '第三幕', '龙哥出现', '弹幕区突然刷屏——龙哥选择了另一位候选人应援。', 'shot-19', {
    video: V + 'shot-18-longge-arrival-v1-web.mp4', poster: K + 'shot-18-longge-arrival-v1.png', settle: 'rival',
    chat: ['龙哥来了！！', '大哥现身了', '这下有好戏了']
  });

  shot('shot-19', '第三幕', '龙哥出手', '龙哥连点三束星河闪耀！对手支持度瞬间飙升。你的回应——', null, {
    video: V + 'shot-19-galaxy-surge-v1-web.mp4', poster: K + 'shot-19-galaxy-surge-v1.png',
    rivalSurge: { gift: 'galaxy', count: 3 },
    voices: [
      { who: '老板助理', byRival: true, audioByRival: { pijiu: A + 'shot-19/host-pijiu.mp3', tiaojiu: A + 'shot-19/host-tiaojiu.mp3', zhuchang: A + 'shot-19/host-zhuchang.mp3', lingwu: A + 'shot-19/host-lingwu.mp3' } },
      { byRival: true, whoLabel: '对手', audioByRival: { pijiu: A + 'shot-19/rival-pijiu.mp3', tiaojiu: A + 'shot-19/rival-tiaojiu.mp3', zhuchang: A + 'shot-19/rival-zhuchang.mp3', lingwu: A + 'shot-19/rival-lingwu.mp3' },
        textByRival: { pijiu: '人家靠的是魅力！老板愿意给人家应援也是人家的本事！', tiaojiu: '温柔能管住谁？靠脸吃饭能撑几天？', zhuchang: '我不是装可怜……我只是真实的自己。', lingwu: '谢谢龙哥～果然有实力的老板最懂我！' } },
      { bySupport: true, whoLabel: '你的候选人', audioBySupport: { pijiu: A + 'shot-19/support-pijiu.mp3', tiaojiu: A + 'shot-19/support-tiaojiu.mp3', zhuchang: A + 'shot-19/support-zhuchang.mp3', lingwu: A + 'shot-19/support-lingwu.mp3' },
        textBySupport: { pijiu: '老板……人家刚才还是第一的……', tiaojiu: '哟，又靠大哥上分了？自己站得稳才是真本事。', zhuchang: '彩旗惹眼，但一直立在那里的是红旗。我就是提艾默的红旗。', lingwu: '装可怜卖惨这招还挺好用哈？' } }
    ],
    // 按钮文案严格对齐 Figma 497:25283：主标题 11px/500 + 副标题 8px/600 #FFDC90
    ui: { type: 'branch', prompt: '你的回应：', options: [
      { label: '这榜我守了', sub: '星河闪耀 100星光', next: 'shot-20a', gift: 'galaxy',       count: 1, toSupport: true },
      { label: '各凭本事',   sub: '暂不下场',        next: 'shot-21' },
      { label: '星光不够',   sub: '看广告再战',      next: 'shot-20c', requiresAd: true },
      { label: '不能怂',     sub: '提艾默之夜 500星光', next: 'shot-20d', gift: 'tiaimo-night', count: 1, toSupport: true }
    ] }
  });

  shot('shot-20a', '第三幕', '星河反击', '你的星河闪耀炸开，龙哥紧接着再刷一束，排名拉锯战开始。', 'shot-21', {
    video: V + 'shot-20a-galaxy-counter-v1-web.mp4', poster: K + 'shot-20a-galaxy-counter-v1.png', intimacy: 200,
    rivalSurge: { gift: 'galaxy', count: 1 },
    voices: [{ bySupport: true, whoLabel: '你的候选人', audioBySupport: { pijiu: A + 'shot-20a/support-pijiu.mp3', tiaojiu: A + 'shot-20a/support-tiaojiu.mp3', zhuchang: A + 'shot-20a/support-zhuchang.mp3', lingwu: A + 'shot-20a/support-lingwu.mp3' },
      textBySupport: { pijiu: '谢谢老板！！你还在！！人家就知道你不会不管我！', tiaojiu: '老板，你是有眼光的人。我让她们看看什么是实力。', zhuchang: '温柔不是软弱，是力量。谢谢你还愿意站在我身边。', lingwu: '老板，你选我是因为我够真、够拼，对吧？' } }],
    chat: ['两个大哥杠上了', '这才是直播间该有的', '龙哥被顶回去了？']
  });

  shot('shot-20c', '第三幕', '星光补给', '可自愿观看一次完整激励视频，获得 300 星光追赶包；不看广告也能继续对局。', 'shot-21', {
    video: V + 'shot-20c-return-live-v1-web.mp4', poster: K + 'shot-20c-return-live-v1.png',
    voices: [{ who: '老板助理', audio: A + 'shot-20c/host-return.mp3', text: '老板回来了！继续应援啊！' }],
    ui: { type: 'rewarded-ad', reward: 300 }
  });

  shot('shot-20d', '第三幕', '提艾默之夜', '全屏金色星空降临；龙哥也点亮提艾默之夜，双大哥对峙。', 'shot-21', {
    video: V + 'shot-20d-tiaimo-night-v1-web.mp4', poster: K + 'shot-20d-tiaimo-night-v1.png',
    rivalSurge: { gift: 'tiaimo-night', count: 1 },
    voices: [
      { who: '老板助理', bySupport: true, audioBySupport: { pijiu: A + 'shot-20d/host-pijiu.mp3', tiaojiu: A + 'shot-20d/host-tiaojiu.mp3', zhuchang: A + 'shot-20d/host-zhuchang.mp3', lingwu: A + 'shot-20d/host-lingwu.mp3' },
        textBySupport: { pijiu: '提艾默之夜！佳琪的支持度直接起飞！', tiaojiu: '提艾默之夜！妮蔻的支持度直接起飞！', zhuchang: '提艾默之夜！可可的支持度直接起飞！', lingwu: '提艾默之夜！泡泡的支持度直接起飞！' } },
      { bySupport: true, whoLabel: '你的候选人', audioBySupport: { pijiu: A + 'shot-20d/support-pijiu.mp3', tiaojiu: A + 'shot-20d/support-tiaojiu.mp3', zhuchang: A + 'shot-20d/support-zhuchang.mp3', lingwu: A + 'shot-20d/support-lingwu.mp3' },
        textBySupport: { pijiu: '提、提艾默之夜？！老板你是认真的吗？！谢谢谢谢谢谢！！', tiaojiu: '提艾默之夜？老板，有实力。你敢押我，我就敢替你赢到底。', zhuchang: '这么大的礼物……谢谢老板愿意相信我。我会认真走到最后。', lingwu: '老板也太猛了吧！这一整晚的舞台，我都只为你点燃！' } },
      { byRival: true, whoLabel: '对手', audioByRival: { pijiu: A + 'shot-20d/rival-pijiu.mp3', tiaojiu: A + 'shot-20d/rival-tiaojiu.mp3', zhuchang: A + 'shot-20d/rival-zhuchang.mp3', lingwu: A + 'shot-20d/rival-lingwu.mp3' } }
    ],
    broadcast: '🌌 你在提艾默直播间点亮了「提艾默之夜」！',
    chat: ['老板大气！！！', '这谁顶得住', '这肯定是攒了半天的狠人']
  });

  shot('shot-21', '第三幕', '放狠话', '四位候选人依次放狠话，正式进入游戏考核。', 'shot-22', {
    video: V + 'shot-21-threat-lineup-v1-web.mp4', poster: K + 'shot-21-threat-lineup-v1.png',
    voices: [
      { who: '老板助理', audio: A + 'shot-21/host.mp3',      text: '接下来进入考核时间！四位候选人——请放狠话！' },
      { who: '佳琪',   audio: A + 'shot-21/beer-girl.mp3', text: '来都来了那就硬着头皮上吧！我现在要是认怂也太丢人了！' },
      { who: '妮蔻',   audio: A + 'shot-21/bartender.mp3', text: '自己几斤几两都清楚，在竞争店长这件事上，你们最好给我让路。' },
      { who: '可可',     audio: A + 'shot-21/singer.mp3',    text: '路我是不会让别人让的。真厉害就把我赶下去。' },
      { who: '泡泡',     audio: A + 'shot-21/dancer.mp3',    text: '姐妹一场别伤了和气——但是谁要跟我争，可别怪我不客气！' }
    ]
  });

  // ═══ 第三幕 · 四个考核小游戏 ═══
  shot('shot-22', '第三幕', '人型过杆', '老板用星光选择障碍造型，候选人逐一挑战。', 'shot-23', {
    video: V + 'shot-22-human-bar-v1-web.mp4', poster: K + 'shot-22-human-bar-v1.png',
    voices: [{ who: '老板助理', audio: A + 'shot-22/host-intro.mp3', text: '四位候选人依次通过人型障碍！老板们用星光选择障碍造型——' }],
    resultVideoBySupport:{pijiu:V+'shot-05-beer-girl-full-v1-web.mp4',tiaojiu:V+'shot-07-bartender-full-v1-web.mp4',zhuchang:V+'shot-08-singer-full-v1-web.mp4',lingwu:V+'shot-09-dancer-full-v1-web.mp4'},
    resultClip:{startSec:6.5,durationMs:4500},
    ui: { type: 'game-pick', title: '选择障碍造型', options: ['飞吻', 'S 造型', '金鸡独立'], game: 'human-bar' },
    chat: ['这个造型有点难啊', '啤酒妹过了！', '调酒师摔了']
  });

  shot('shot-23', '第三幕', '身材比字母', '从 10 个字母中选出 5 个，候选人依次用身体比出。', 'shot-24', {
    video: V + 'shot-23-body-letter-v1-web.mp4', poster: K + 'shot-23-body-letter-v1.png',
    voices: [{ who: '老板助理', audio: A + 'shot-23/host-intro.mp3', text: '老板们选择字母——候选人用身体比出！' }],
    resultVideoBySupport:{pijiu:V+'shot-05-beer-girl-full-v1-web.mp4',tiaojiu:V+'shot-07-bartender-full-v1-web.mp4',zhuchang:V+'shot-08-singer-full-v1-web.mp4',lingwu:V+'shot-09-dancer-full-v1-web.mp4'},
    resultClip:{startSec:11,durationMs:4500},
    ui: { type: 'game-multi', title: '选 5 个字母', options: ['B', 'M', 'X', 'O', 'L', 'W', 'Z', 'T', 'U', 'F'], pick: 5, game: 'body-letter' },
    chat: ['这身材绝了', '领舞 S 型神了', '啤酒妹腿好长']
  });

  shot('shot-24', '第三幕', '猜拳一字马', '为你 all in 的候选人选择对手。两人脚尖相抵，一字马越下越低。', 'shot-25', {
    video: V + 'shot-24-split-rps-v1-web.mp4', poster: K + 'shot-24-split-rps-v1.png',
    voices: [{ who: '老板助理', audio: A + 'shot-24/host-intro.mp3', text: '猜拳定胜负，输的人前脚顶到对方前脚——直到一字马够不到为止！请为你支持的候选人选择对手！' }],
    resultVideoBySupport:{pijiu:V+'shot-05-beer-girl-full-v1-web.mp4',tiaojiu:V+'shot-07-bartender-full-v1-web.mp4',zhuchang:V+'shot-08-singer-full-v1-web.mp4',lingwu:V+'shot-09-dancer-full-v1-web.mp4'},
    resultClip:{startSec:15.5,durationMs:4300},
    ui: { type: 'game-pick', title: '为你的候选人选择对手', options: ['佳琪', '妮蔻', '可可', '泡泡'], game: 'split-rps' }
  });

  shot('shot-25', '第三幕', '排名与惩罚', '第一名坐老板椅，二三名站旁边，第四名进入拉票惩罚。', 'shot-26', {
    video: V + 'shot-25-ranking-punishment-v1-web.mp4', poster: K + 'shot-25-ranking-punishment-v1.png', settle: 'rank-last',
    voices: [
      { who: '老板助理', audio: A + 'shot-25/host-ranking.mp3', text: '截至目前的排名——第一名坐在老板椅上！第四名……准备拉票！' },
      { byLast: true, whoLabel: '第四名', audioByLast: { pijiu: A + 'shot-25/last-pijiu.mp3', tiaojiu: A + 'shot-25/last-tiaojiu.mp3', zhuchang: A + 'shot-25/last-zhuchang.mp3', lingwu: A + 'shot-25/last-lingwu.mp3' },
        textByLast: { pijiu: '人家不想被惩罚嘛～老板帮帮忙，一朵应援花也行！', tiaojiu: '让我接受惩罚？这个多少有点开玩笑了吧。', zhuchang: '我也许表现得还不够好……谢谢应援我的老板。', lingwu: '是不是我这个动作不够好？老板帮帮我嘛～' } }
    ]
  });

  shot('shot-26', '第三幕', '福利卡与惩罚', '第一名随机抽福利卡；第四名转大转盘执行惩罚。', 'shot-27', {
    video: V + 'shot-26-benefit-punishment-v1-web.mp4', poster: K + 'shot-26-benefit-punishment-v1.png', rewardStars: 40,
    voices: [
      { who: '老板助理', audio: A + 'shot-26/host-benefit.mp3', text: '排名第一的候选人抽取福利卡！' },
      { who: '老板助理', audio: A + 'shot-26/host-wheel.mp3',   text: '第四名——转大转盘！接受惩罚！' }
    ],
    ui: { type: 'game-pick', title: '为第一名抽福利卡', options: ['免罚卡', '替罪羊卡', '双倍积分卡'], game: 'benefit' },
    punishments: ['十个深蹲', '十个高抬腿', '模仿三种小动物']
  });

  // ═══ 第四幕 · 终局 ═══
  shot('shot-27', '第四幕', '最后冲刺', '考核结束。最后两名只有两分钟摆脱第四，四人按各自性格拉票。', 'shot-28', {
    video: V + 'shot-27-final-sprint-v1-web.mp4', poster: K + 'shot-27-final-sprint-v1.png', crowdTicks: 6,
    voices: [
      { who: '老板助理', audio: A + 'shot-27/host-ranking.mp3',    text: '考核环节结束！距离今日店长诞生越来越近了！目前排名——' },
      { who: '老板助理', audio: A + 'shot-27/host-bottom-two.mp3', text: '最后两名的候选人——2 分钟，看能不能摆脱第四名！' },
      { bySupport:true, audioBySupport:{pijiu:A+'shot-27/pijiu.mp3',tiaojiu:A+'shot-27/tiaojiu.mp3',zhuchang:A+'shot-27/zhuchang.mp3',lingwu:A+'shot-27/lingwu.mp3'}, textBySupport:{pijiu:'老板，最后再推我一把！哪怕一朵应援花！',tiaojiu:'最后一轮，我会用实力证明你的选择。',zhuchang:'谢谢你一直在，我会认真唱到最后。',lingwu:'老板，最后的舞台必须是我们的！'} }
    ]
  });

  shot('shot-28', '第四幕', '一二名巅峰对决', '实时前两名进入巅峰对决，积分翻倍，并互相挑战对方擅长的才艺。', 'shot-29', {
    video: V + 'shot-28-finalist-duel-v1-web.mp4', poster: K + 'shot-28-finalist-duel-v1.png', settle: 'top-two', multiplier: 2,
    voices: [
      { who: '老板助理', audio: A + 'shot-28/host-intro.mp3', text: '留在台上的两位是——第一和第二！恭喜进入巅峰对决！积分翻倍！' },
      { byLeader:true, audioByLeader:{pijiu:A+'shot-27/pijiu.mp3',tiaojiu:A+'shot-27/tiaojiu.mp3',zhuchang:A+'shot-28/zhuchang.mp3',lingwu:A+'shot-28/lingwu.mp3'}, textByLeader:{pijiu:'第一名我会守住，最后一轮也不会退。',tiaojiu:'榜首是实力打出来的，我会赢到底。',zhuchang:'我以我所短攻你所长，这一轮我不会退。',lingwu:'第一名的舞台，我会一直点燃到最后。'} },
      { byRival:true, audioByRival:{pijiu:A+'shot-27/pijiu.mp3',tiaojiu:A+'shot-27/tiaojiu.mp3',zhuchang:A+'shot-28/zhuchang.mp3',lingwu:A+'shot-28/lingwu.mp3'}, textByRival:{pijiu:'第二名也能反超，老板看我的。',tiaojiu:'差距不算什么，最后靠实力说话。',zhuchang:'我会认真唱到最后一秒。',lingwu:'第二名只是暂时的，看我翻盘。'} },
      { who: '老板助理', audio: A + 'shot-28/host-outro.mp3', text: '不管两位谁最终成为店长，肯定都是负责的好店长！' }
    ]
  });

  shot('shot-29', '第四幕', '终局冲突', '龙哥连续星河闪耀 ×5。用你整局积累的影响力，替支持的候选人完成最后反击。', null, {
    video: V + 'shot-29-final-conflict-v1-web.mp4', poster: K + 'shot-29-final-conflict-v1.png',
    rivalSurge: { gift: 'galaxy', count: 5 }, settle: 'final-rival',
    chat: ['今晚领舞必须赢。—— 龙哥', '大哥又来了', '老板顶住！'],
    // 按钮文案严格对齐 Figma 497:24541（顺序即设计稿从左到右）
    ui: { type: 'branch', prompt: '你的反击：', options: [
      { label: '星河闪耀 x3',   sub: '300星光',           next: 'shot-29b', gift: 'galaxy',       count: 3, toSupport: true },
      { label: '提艾默之夜',    sub: '500星光',           next: 'shot-29b', gift: 'tiaimo-night', count: 1, toSupport: true },
      { label: '发动老板号召',  sub: '按本局表现折算票数', next: 'shot-29b', action: 'rally' },
      { label: '星光不足',      sub: '看广告补给',        next: 'shot-29c', requiresAd: true }
    ] }
  });

  shot('shot-29b', '第四幕', '终局提艾默之夜', '全屏金色星空降临。积分翻倍下双方交替领先，最后倒数十秒。', 'shot-30', {
    video: V + 'shot-29b-final-night-v1-web.mp4', poster: K + 'shot-29b-final-night-v1.png', multiplier: 2, countdown: 10,
    voices: [
      { who: '老板助理', audio: A + 'shot-29b/host-countdown.mp3', text: '两个人交替领先！最后的倒计时——10、9、8……' },
      { bySupport:true, audioBySupport:{pijiu:A+'shot-29b/pijiu.mp3',tiaojiu:A+'shot-27/tiaojiu.mp3',zhuchang:A+'shot-27/zhuchang.mp3',lingwu:A+'shot-27/lingwu.mp3'}, textBySupport:{pijiu:'老板！人家这辈子都不会忘了你！',tiaojiu:'老板，有你押我，这一局我一定赢到底。',zhuchang:'谢谢你一直站在我身边，我不会辜负你。',lingwu:'老板，最后十秒，让我们一起把场子点燃！'} }
    ]
  });

  shot('shot-29c', '第四幕', '可选星光补给', '仅当你主动选择时观看一次激励广告，获得 300 星光后返回终局。', 'shot-29', {
    poster: K + 'shot-29-final-conflict-v1.png',
    voices: [{ who: '老板助理', audio: A + 'shot-29c/host-return.mp3', text: '老板回来了！补给到账，最后怎么应援由你决定！' }],
    ui: { type: 'rewarded-ad', reward: 300 }
  });

  shot('shot-30', '第四幕', '店长诞生', '倒计时归零，今日店长由实时总榜产生。钥匙、披风、礼花与王座完成加冕。', null, {
    video: V + 'shot-30-coronation-v1-web.mp4', poster: K + 'shot-30-coronation-v1.png',
    type: 'ending', settle: 'champion',
    voices: [
      { who: '老板助理', audio: A + 'shot-30/host-intro.mp3', text: '今日店长已经产生！她就是——' },
      { byLeader:true, audioByLeader:{pijiu:A+'shot-30/pijiu.mp3',tiaojiu:A+'shot-30/tiaojiu.mp3',zhuchang:A+'shot-30/zhuchang.mp3',lingwu:A+'shot-30/lingwu.mp3'}, textByLeader:{pijiu:'老板，这束花是给你的。以后人家只听你的话。',tiaojiu:'我说过，有眼光的老板选我一定不会错。',zhuchang:'谢谢你坚定地应援我，以后提艾默的灯我替你守着。',lingwu:'老板，以后你来提艾默，全场我买单！'} },
      { who: '老板助理', audio: A + 'shot-30/host-outro.mp3', text: '这把钥匙，代表店长对提艾默酒吧的全部掌控——一切交给你了！' }
    ]
  });

  // ─── 结局台词 ───────────────────────────────────────────────
  var ENDINGS = {
    pijiu:    { title: '只听你的话',       text: '老板，这束花是给你的。以后人家只听你的话——你让 4 点关门人家绝不 5 点打烊。有你的应援，人家什么困难都能跨过去！' },
    tiaojiu:  { title: '有眼光的老板选我', text: '我说过，有眼光的老板选我，一定不会错。今天你证明了——你是那个有眼光的人。走着瞧，我会把提艾默做给你看。' },
    zhuchang: { title: '你来了我才有勇气', text: '谢谢你……在你来之前，我差点以为我不行。原来被人坚定应援的感觉——是这样的。以后提艾默的灯，我替你守着。' },
    lingwu:   { title: '全场我买单',       text: '老板，以后你来提艾默，全场我买单。其他人——给我打工！我随时接受你们挑战～' }
  };

  // 每个 shot 的场景音轨归属（用于氛围音切换）
  Object.keys(S).forEach(function (id) {
    var num = parseInt(id.match(/\d+/)[0], 10);
    S[id].scene = num <= 4 ? 'opening' : num <= 17 ? 'showcase' : num <= 26 ? 'pk' : 'finale';
  });

  M3.Story = {
    entry:      'shot-02',
    candidates: C,
    gifts:      GIFTS,
    chat:       CHAT,
    shots:      S,
    endings:    ENDINGS,
    outfits:    ALL_OUTFITS,
    rivalMap:   { pijiu: 'lingwu', tiaojiu: 'pijiu', zhuchang: 'tiaojiu', lingwu: 'zhuchang' }
  };
})();
