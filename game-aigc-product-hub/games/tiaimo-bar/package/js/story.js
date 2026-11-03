// js/story.js — 提艾默酒吧剧情数据（对应 SCRIPT.md 的 24 节点）
window.STORY = {
  entry: 'opening',
  // 候选人档案（昵称对齐参考图风格）
  candidates: {
    pijiu:   { key:'pijiu',   name:'兔兔老板娘', tag:'啤酒妹', avatar:'assets/image/avatar-pijiu.png',   video:'assets/video/pijiu-perform.mp4',   poster:'assets/keyframes/pijiu-poster.png' },
    tiaojiu: { key:'tiaojiu', name:'小鹿酒馆',   tag:'调酒师', avatar:'assets/image/avatar-tiaojiu.png', video:'assets/video/tiaojiu-perform.mp4', poster:'assets/keyframes/tiaojiu-poster.png' },
    zhuchang:{ key:'zhuchang',name:'甜心软糖',   tag:'驻唱',   avatar:'assets/image/avatar-zhuchang.png',video:'assets/video/zhuchang-perform.mp4',poster:'assets/keyframes/zhuchang-poster.png' },
    lingwu:  { key:'lingwu',  name:'魅力小野猫', tag:'领舞',   avatar:'assets/image/avatar-lingwu.png',  video:'assets/video/lingwu-perform.mp4',  poster:'assets/keyframes/lingwu-poster.png' }
  },
  gifts: [
    { id:'rose',   name:'玫瑰',   cost:1,    vote:100,   icon:'🌹' },
    { id:'balloon',name:'告白气球',cost:10,   vote:1200,  icon:'🎈' },
    { id:'neon',   name:'火箭',   cost:66,   vote:8000,  icon:'🚀' },
    { id:'cat',    name:'招财猫', cost:88,   vote:12000, icon:'🐱' },
    { id:'arrow',  name:'穿云箭', cost:288,  vote:38000, icon:'🏹' },
    { id:'night',  name:'幸运城堡',cost:2888, vote:300000, icon:'🏰' }
  ],
  nodes: {
    opening: { type:'story', scene:'opening', host:'系统',
      text:'你正在刷直播——卖货的、吃播的划过……画面停在暖光酒吧「提艾默」！屏风后四个剪影在扭动。💫 你获得新老板见面礼 50 星光！星光不够？看 15 秒广告 +10。', next:'intro_host' },
    intro_host: { type:'story', scene:'opening', host:'老板助理',
      text:'各位老板投资人，店长跑路了！别急——四位美女候选人马上出场！1号啤酒妹、2号调酒师、3号驻唱、4号领舞。谁星光最多，谁先出来跟老板见面！', next:'voices' },
    voices: { type:'story', scene:'opening', host:'候选人',
      text:'啤酒妹：走一杯来一瓶，你的快乐我的命～｜调酒师：让我第一个面试，让竞争失去悬念！｜驻唱：累了停一停，听我唱歌～｜领舞：屏风是我的紧箍咒，我需要更大的舞台！', next:'choose' },
    choose: { type:'choice', scene:'opening', host:'老板助理',
      text:'各位老板，你要 all in 哪位候选人？你的星光将决定谁当今日店长！',
      choices:[
        { label:'应援啤酒妹 · 纯欲长腿听话有潜力', support:'pijiu',   next:'pijiu_a1' },
        { label:'应援调酒师 · 酷飒有实力适合管人', support:'tiaojiu', next:'tiaojiu_a1' },
        { label:'应援驻唱 · 温柔有故事值得守护',   support:'zhuchang',next:'zhuchang_a1' },
        { label:'应援领舞 · 性感会来事带气氛',     support:'lingwu',  next:'lingwu_a1' }
      ] },

    // ===== 啤酒妹线 =====
    pijiu_a1: { type:'story', scene:'pk', focus:'pijiu', host:'啤酒妹', reward:20, intimacy:'常客老板',
      text:'【第一幕·竞选出场】屏风拉开，啤酒妹长腿甜笑走出："谁说开瓶盖不能是才艺！"张元英转圈开啤酒瓶+啦啦操，结尾咬唇歪头笑。🎁 第一幕达成 +20 星光！', next:'pijiu_a2' },
    pijiu_a2: { type:'story', scene:'pk', focus:'pijiu', host:'啤酒妹', reward:15,
      text:'【第二幕·定制化改造】化妆间选装：兔耳朵！啤酒妹戴上兔耳："嘿嘿人家是兔兔妹了～老板有眼光！" 🎁 第二幕达成 +15 星光。', next:'pijiu_a3' },
    pijiu_a3: { type:'choice', scene:'pk', focus:'pijiu', rival:'lingwu', host:'啤酒妹',
      text:'【第三幕·龙哥出现】"龙哥：我应援领舞。"连刷三束火箭，领舞冲第一，啤酒妹掉第二！她急了："老板…人家刚才还是第一的…" 你怎么回应？',
      choices:[
        { label:'🌌 送提艾默之夜 all-in（500 星光）', giftCost:500, votes:30000, intimacy:'守护大哥', next:'pijiu_final' },
        { label:'📺 看广告攒星光再反击', watchAd:true, votes:6000, next:'pijiu_final' }
      ] },
    pijiu_final: { type:'story', scene:'pk', focus:'pijiu', host:'啤酒妹',
      text:'【第四幕·巅峰对决】积分翻倍，啤酒妹与领舞交替领先！她冲到镜头前（破音）："老板！人家这辈子都不会忘了你！你让人家觉得——笨拙也值得被选！" 10、9、8…', next:'pijiu_end' },
    pijiu_end: { type:'ending', scene:'ending', focus:'pijiu', title:'结局A · 只听你的话',
      text:'啤酒妹当选今日店长，手捧超大花束走向镜头："老板，这束花是给你的。以后人家只听你的话——你让 4 点关门绝不 5 点打烊！"歪头比了个歪歪的爱心。' },

    // ===== 调酒师线 =====
    tiaojiu_a1: { type:'story', scene:'pk', focus:'tiaojiu', host:'调酒师', reward:20, intimacy:'常客老板',
      text:'【第一幕·竞选出场】调酒师包臀职业装、高马尾走出，花式转酒瓶+椅子舞："看好了，这才是本事。" 🎁 第一幕达成 +20 星光！', next:'tiaojiu_a2' },
    tiaojiu_a2: { type:'story', scene:'pk', focus:'tiaojiu', host:'调酒师', reward:15,
      text:'【第二幕·定制化改造】选装皮裙："老板喜欢哪种我就穿哪种——皮裙配我的风格，懂的都懂。"（偷偷照镜）🎁 第二幕达成 +15 星光。', next:'tiaojiu_a3' },
    tiaojiu_a3: { type:'choice', scene:'pk', focus:'tiaojiu', rival:'pijiu', host:'调酒师',
      text:'【第三幕·龙哥出现】龙哥转投啤酒妹狂刷礼物。调酒师不屑："哟，又靠大哥上分？自己站得稳才是真本事。" 你怎么回应？',
      choices:[
        { label:'🌌 送提艾默之夜（500 星光）挺你到底', giftCost:500, votes:30000, intimacy:'守护大哥', next:'tiaojiu_final' },
        { label:'📺 看广告攒星光稳住榜单', watchAd:true, votes:6000, next:'tiaojiu_final' }
      ] },
    tiaojiu_final: { type:'story', scene:'pk', focus:'tiaojiu', host:'调酒师',
      text:'【第四幕·巅峰对决】调酒师全程挑眉微笑，领先时对镜头："老板，你是有眼光的人。今天我让她们看看什么是实力。" 倒计时收尾。', next:'tiaojiu_end' },
    tiaojiu_end: { type:'ending', scene:'ending', focus:'tiaojiu', title:'结局B · 有眼光的老板选我',
      text:'调酒师拿到钥匙转头看镜头："我说过，有眼光的老板选我一定不会错。走着瞧，我会把提艾默做给你看。"嘴角上扬——不是笑，是笃定。' },

    // ===== 驻唱线 =====
    zhuchang_a1: { type:'story', scene:'pk', focus:'zhuchang', host:'驻唱', reward:20, intimacy:'常客老板',
      text:'【第一幕·竞选出场】驻唱浅色短裙、长卷发走出，唱一首拿手情歌，氛围感拉满："谢谢老板…你对我真好。"（眼眶微红）🎁 第一幕达成 +20 星光！', next:'zhuchang_a2' },
    zhuchang_a2: { type:'story', scene:'pk', focus:'zhuchang', host:'驻唱', reward:15,
      text:'【第二幕·定制化改造】选装丝绸睡裙："各位老板想看吗……那要温柔地选哦。"（微红脸）🎁 第二幕达成 +15 星光。', next:'zhuchang_a3' },
    zhuchang_a3: { type:'choice', scene:'pk', focus:'zhuchang', rival:'tiaojiu', host:'驻唱',
      text:'【第三幕·龙哥出现】龙哥力捧调酒师施压。驻唱不急不慢："彩旗惹眼，但一直立着的是红旗。"看了眼你的弹幕微微点头。你怎么回应？',
      choices:[
        { label:'🌌 送提艾默之夜（500 星光）你值得被守护', giftCost:500, votes:30000, intimacy:'守护大哥', next:'zhuchang_final' },
        { label:'📺 看广告攒星光把她的榜守住', watchAd:true, votes:6000, next:'zhuchang_final' }
      ] },
    zhuchang_final: { type:'story', scene:'pk', focus:'zhuchang', host:'驻唱',
      text:'【第四幕·巅峰对决】驻唱以己之短攻人之长，挑战不擅长的椅子舞，全场动容："在你来之前，我差点以为我不行。" 倒计时收尾。', next:'zhuchang_end' },
    zhuchang_end: { type:'ending', scene:'ending', focus:'zhuchang', title:'结局C · 你来了我才有勇气',
      text:'驻唱攥着钥匙（眼眶红）："谢谢你……原来被人坚定应援的感觉是这样的。以后提艾默的灯，我替你守着。"' },

    // ===== 领舞线 =====
    lingwu_a1: { type:'story', scene:'pk', focus:'lingwu', host:'领舞', reward:20, intimacy:'常客老板',
      text:'【第一幕·竞选出场】领舞小吊带短裙、大波浪走出，皮带舞/韩舞热舞，S型扭腰全场尖叫，镜头前飞吻"老板你真好～"🎁 第一幕达成 +20 星光！', next:'lingwu_a2' },
    lingwu_a2: { type:'story', scene:'pk', focus:'lingwu', host:'领舞', reward:15,
      text:'【第二幕·定制化改造】选装女仆装："我可以很乖也可以很坏哦～老板你选哪种？" 🎁 第二幕达成 +15 星光。', next:'lingwu_a3' },
    lingwu_a3: { type:'choice', scene:'pk', focus:'lingwu', rival:'zhuchang', host:'领舞',
      text:'【第三幕·龙哥出现】龙哥转投驻唱说她"值得守护"。领舞嗤之以鼻，转头对镜头："老板，你选我是因为我够真够拼够让你开心，对吧？" 你怎么回应？',
      choices:[
        { label:'🌌 送提艾默之夜（500 星光）舞台给你全场买单', giftCost:500, votes:30000, intimacy:'守护大哥', next:'lingwu_final' },
        { label:'📺 看广告攒星光用火箭连击助攻', watchAd:true, votes:6000, next:'lingwu_final' }
      ] },
    lingwu_final: { type:'story', scene:'pk', focus:'lingwu', host:'领舞',
      text:'【第四幕·巅峰对决】龙哥连刷火箭×5，领舞险被反超；你的关键一击让积分翻倍反超！领舞（媚眼）："老板威武～今晚这店长我拿定了！" 倒计时收尾。', next:'lingwu_end' },
    lingwu_end: { type:'ending', scene:'ending', focus:'lingwu', title:'结局D · 全场我买单',
      text:'领舞坐上老板椅朝镜头飞吻："老板，以后你来提艾默，全场我买单！其他人给我打工～"其他三人在后面翻白眼，调酒师："走着瞧。"' }
  }
};
