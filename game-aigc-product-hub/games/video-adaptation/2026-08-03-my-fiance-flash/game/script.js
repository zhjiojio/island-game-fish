// SCRIPT · 妹子01 苏小雨 F1-F30 完整线 + HE/GE/NE/BE 四结局
// 主题词「等待 13 年」· 主线锚点：F5 童年录音带 / F10 阳台夜风 / F15 老同学挑衅 / F20 樱花树下 / F25 求婚彩排
window.SCRIPT = {
  entry: 'f1',
  totalFrames: 30,
  anchors: [5, 10, 15, 20, 25],
  endings: {
    HE: { min: 170, needAnchors: 5, title: 'HE · 真心结局', sub: '海边落日婚纱 · 双人回眸', cg: 'ending-he', line: '你终于回来啦……这次不走了对吗' },
    GE: { min: 130, title: 'GE · 平淡结局', sub: '出租屋合影 · 领结婚证', cg: 'ending-ge', line: '只要在一起，什么形式都好' },
    NE: { min: 80,  title: 'NE · 错过结局', sub: '街角错身 · 她拎菜路过', cg: 'ending-ne', line: '啊……好久不见' },
    BE: { min: 0,   title: 'BE · 反目结局', sub: '她连夜搬走 · 空荡老宅', cg: 'ending-be', line: '本来我可以等你一辈子的' },
  },
  nodes: {
    // ═══════ 第一幕：F1-F8 相遇 → 破冰 → 冲突 → 修复 ═══════
    f1: {
      scene: 'f1', voice: 'voice-f1', talkingVideo: 'f1-final',
      text: '你，你终于回来啦。饭快凉了呀。',
      env: '夕阳照进老宅玄关，她拎着白色木饭盒站在门口，围裙系错了两次，眼眶有点红',
      choices: [
        { kind: 'A', text: '"13 年没回过家……你一直在这里等我？"', favor: 12, next: 'f2', reaction: '她红着眼睛："不算等，就顺路。"她伸手替你拎行李。' },
        { kind: 'B', text: '"呀，快递员小姐姐好可爱"', favor: 3,  next: 'f2', reaction: '她愣一下笑："你还是这么会玩。"' },
        { kind: 'C', text: '"谁？请问有事？"', favor: -2, taboo: 1, next: 'f2', reaction: '她笑容凝固半秒："啊……送错了，抱歉。"' },
      ]
    },
    f2: {
      scene: 'f2', voice: 'voice-f2', talkingVideo: 'f2-final',
      text: '我等了一个多小时，你手是不是很冷？',
      env: '她把保温饭盒递过来，指尖冰凉，白毛衣袖口有个小面粉印',
      choices: [
        { kind: 'A', text: '"手好凉，进来说话吧，我给你倒热水"', favor: 10, next: 'f3', reaction: '她跟着进屋，围裙悄悄取下叠好。' },
        { kind: 'B', text: '"我看看你今天做了什么"',           favor: 4,  next: 'f3', reaction: '她赶紧打开饭盒："是你 6 岁最爱的糖醋排骨。"' },
        { kind: 'C', text: '"放着吧，我自己热"',                favor: 0,  taboo: 1, next: 'f3', reaction: '她低声："哦……那我先回家了。"' },
      ]
    },
    f3: {
      scene: 'f3', voice: 'voice-f3', talkingVideo: 'f3-final',
      text: '味道有变吗？我记得你说过要甜一点、姜少一点。',
      env: '客厅木餐桌，暖黄灯光，她眼镜片反着光',
      choices: [
        { kind: 'A', text: '"跟小时候一样香。谢谢你还记得。"', favor: 12, next: 'f4', reaction: '她眼睛亮起来，把碗又推近一点。' },
        { kind: 'B', text: '"厨神小雨认证！差点吃到舌头"',      favor: 5,  next: 'f4', reaction: '她"讨厌啦你"，脸红。' },
        { kind: 'C', text: '"嗯，还行。"',                     favor: -1, taboo: 1, next: 'f4', reaction: '她默默低头："以后我少做点。"' },
      ]
    },
    f4: {
      scene: 'f4', voice: 'voice-f4', talkingVideo: 'f4-final',
      text: '你先去楼上休息吧，二楼东边那间我打扫过了，和你走之前一样。',
      env: '饭后厨房，她袖口卷起洗碗，泡沫沾了下巴',
      choices: [
        { kind: 'A', text: '"我来洗，你去坐。你今天走了太多路。"', favor: 10, next: 'f5', reaction: '她"欸——"没抢过，眼睛里全是笑。' },
        { kind: 'B', text: '"那我们洗碗 PK，输的洗一周"',       favor: 5,  next: 'f5', reaction: '她"好——你敢吗！"泡沫大战。' },
        { kind: 'C', text: '"你继续吧，我先睡了"',              favor: 1,  next: 'f5', reaction: '她背影僵一下："好，晚安。"' },
      ]
    },
    f5: {
      scene: 'f5', anchor: 1, voice: 'voice-f5', talkingVideo: 'f5-final',
      text: '这个……这个别听了，扔了扔了……',
      env: '★ 阁楼翻到磁带「1998·雨雨教弟弟走路」，她抱着毛巾站在门口头发湿的',
      choices: [
        { kind: 'A', anchor: 1, text: '"原来你从 5 岁就在扶我。雨姐姐，这次换我扶你。"', favor: 15, next: 'f6', reaction: '她眼泪一下掉下来，从口袋掏出铁皮盒 —— 468 封 13 年没寄的信。HE 锚点 1 ✅' },
        { kind: 'B', text: '"哈哈幼稚死了，快 20 年前的东西还留着！"', favor: 2,  next: 'f6', reaction: '她"你——！"追着打你。' },
        { kind: 'C', text: '"有必要留这种东西吗？丢了吧。"',           favor: -3, taboo: 1, next: 'f6', reaction: '她愣住，把磁带收进围裙口袋："……好。"' },
      ]
    },
    f6: {
      scene: 'f6', ad: true, voice: 'voice-f6', talkingVideo: 'f6-final',
      text: '你，你不要偷看哦。我要换成家里的睡衣了。',
      env: '📺 广告卡点 A · 换居家服',
      choices: [
        { kind: 'A', text: '📺 观看广告 · 解锁 CG「粉色棉睡衣立绘」', favor: 5, next: 'f7', ad: true, reaction: '她穿粉色棉睡衣走下楼，抱枕挡在胸前。CG 已解锁 ✨' },
        { kind: 'B', text: '📺 观看广告 · 解锁 CG「粉色棉睡衣立绘」', favor: 5, next: 'f7', ad: true, reaction: '她穿粉色棉睡衣走下楼，抱枕挡在胸前。CG 已解锁 ✨' },
        { kind: 'C', text: '"不用换，就这样吧"',                     favor: -2, taboo: 1, next: 'f7', reaction: '她坚持进屋换了，出来时刻意穿了长袖。' },
      ]
    },
    f7: {
      scene: 'f7', voice: 'voice-f7', talkingVideo: 'f7-final',
      text: '我今天学的新菜——',
      env: '她端出一大盘水煮鱼，红油一片',
      choices: [
        { kind: 'A', text: '"对不起小雨，我这些年不吃辣了。我该早点告诉你。"', favor: 8, next: 'f8', reaction: '她放下筷子："是我没问你……我去重做一份清蒸的。"' },
        { kind: 'B', text: '"我吃！男人怎么能怕辣！"',                       favor: 4, next: 'f8', reaction: '她慌张给你倒牛奶："你悠着点……"' },
        { kind: 'C', text: '"你不知道我不吃辣？你也太不用心了。"',            favor: -5, taboo: 1, next: 'f8', reaction: '她眼眶红了："对不起……我不知道。"' },
      ]
    },
    f8: {
      scene: 'f8', voice: 'voice-f8', talkingVideo: 'f8-final',
      text: '你先吃吧，我不饿。',
      env: '她把新做的清蒸鱼端上来，眼睛还是红的',
      choices: [
        { kind: 'A', text: '拉住她的手："对不起，是我说话重了。你留下来一起吃。"', favor: 12, next: 'f9', reaction: '她"嗯"了一声，坐下时眼泪还是掉。' },
        { kind: 'B', text: '摸摸她头："没事没事。"',                            favor: 6,  next: 'f9', reaction: '她笑着打你手："讨厌。"' },
        { kind: 'C', text: '"以后注意就好，不用哭。"',                          favor: 0,  next: 'f9', reaction: '她"嗯"，一夜没说话。' },
      ]
    },
    // ═══════ 第二幕：F9-F15 外出 → 秘密 → 触碰 → 情敌 → 锚点3 ═══════
    f9: {
      scene: 'f9', voice: 'voice-f9', talkingVideo: 'f9-final',
      text: '是，我未婚夫。',
      env: '周末菜市场，摊主大叔调侃"这是你男人？"',
      choices: [
        { kind: 'A', text: '主动握住她的手："对，这是我未来老婆。"', favor: 8, next: 'f10', reaction: '大叔"哎哟给你打八折！"她把脸埋进袋子里笑。' },
        { kind: 'B', text: '学她的样子红着脸"嗯我是她男人"（浮夸）', favor: 5, next: 'f10', reaction: '她笑得直不起腰。' },
        { kind: 'C', text: '全程玩手机，装没听见',                  favor: -2, taboo: 1, next: 'f10', reaction: '她声音低下去："回去吧。"' },
      ]
    },
    f10: {
      scene: 'f10', anchor: 2, voice: 'voice-f10', talkingVideo: 'f10-final',
      text: '你走的那 13 年，我每天都想，你会不会突然回来敲我家门。后来我就每天做两份饭。',
      env: '★ 夜里 11 点，阳台竹椅，两杯温牛奶',
      choices: [
        { kind: 'A', anchor: 2, text: '"这 13 年你等我的每一天，我用余生一天一天还你。"', favor: 15, next: 'f11', reaction: '她眼泪断了线，一头栽到你肩膀上。HE 锚点 2 ✅' },
        { kind: 'B', text: '"对不起呀笨蛋，害你等这么久。"', favor: 6,  next: 'f11', reaction: '她锤你一下："你才笨蛋。"' },
        { kind: 'C', text: '"别煽情啦，睡觉去。"',           favor: -4, taboo: 1, next: 'f11', reaction: '她愣住："……哦，晚安。"起身走了。' },
      ]
    },
    f11: {
      scene: 'f11', talkingVideo: 'f11-final', voice: 'voice-f11',
      text: '当时我妈问我为什么，我说 "我要在这里等他回来"。她还笑我傻。',
      env: '她翻出高考志愿表复印件，本可以填北京师范，她选了云澜师专',
      choices: [
        { kind: 'A', text: '把她抱进怀里："我不该走那么久。"', favor: 12, next: 'f12', reaction: '她在你怀里哭了很久。' },
        { kind: 'B', text: '"所以你等我等了这么久，值得吗？"', favor: 5,  next: 'f12', reaction: '她"废话，我从 4 岁就等你了。"' },
        { kind: 'C', text: '沉默不语',                       favor: 0,  next: 'f12', reaction: '她收起表格："我先睡了。"' },
      ]
    },
    f12: {
      scene: 'f12', ad: true, talkingVideo: 'f12-final', voice: 'voice-f12',
      text: '你……你别看我，头发还没吹干。',
      env: '📺 广告卡点 B · 粉色棉质睡衣 · 湿发抱抱枕',
      choices: [
        { kind: 'A', text: '📺 观看广告 · 解锁 CG「湿发睡衣依偎」', favor: 5, next: 'f13', ad: true, reaction: '她把头靠到你肩膀上。CG 已解锁 ✨' },
        { kind: 'B', text: '📺 观看广告 · 解锁 CG「湿发睡衣依偎」', favor: 5, next: 'f13', ad: true, reaction: '她把头靠到你肩膀上。CG 已解锁 ✨' },
        { kind: 'C', text: '"太晚了睡吧"',                        favor: -1, taboo: 1, next: 'f13', reaction: '她"嗯"，回房间。' },
      ]
    },
    f13: {
      scene: 'f13', talkingVideo: 'f13-final', voice: 'voice-f13',
      text: '我心跳好快……你别听。',
      env: '沙发上她把头靠过来，你的手放在她肩膀上',
      choices: [
        { kind: 'A', text: '手轻轻放到她肩膀，抱紧一点',   favor: 10, next: 'f14', reaction: '她把眼睛闭上："这样真好。"' },
        { kind: 'B', text: '"累了？躺一下。"',              favor: 4,  next: 'f14', reaction: '她"嗯……"就靠着睡着了。' },
        { kind: 'C', text: '挪开一点距离',                  favor: -3, taboo: 1, next: 'f14', reaction: '她"哦……"坐直。' },
      ]
    },
    f14: {
      scene: 'f14', talkingVideo: 'f14-final', voice: 'voice-f14',
      text: '（老同学）"我大学同学……听说她要结婚，我送最后一次。"',
      env: '幼儿园放学后，高高帅帅的男同学捧着 99 朵玫瑰',
      choices: [
        { kind: 'A', text: '接过花："谢谢你替她挡这些年，剩下的我来。"', favor: 12, next: 'f15', reaction: '男生笑："你比我强，好好待她。"' },
        { kind: 'B', text: '"哦这是你朋友？介绍一下呗"',                 favor: 3,  next: 'f15', reaction: '尴尬三方对话。' },
        { kind: 'C', text: '转身走开"你们自己聊"',                       favor: -5, taboo: 1, next: 'f15', reaction: '她追出来："你干嘛啊。"' },
      ]
    },
    f15: {
      scene: 'f15', anchor: 3, talkingVideo: 'f15-final', voice: 'voice-f15',
      text: '（老同学冷笑）你配得上她吗？她这 13 年一直在等你。',
      env: '★ 老同学临走时的挑衅',
      choices: [
        { kind: 'A', anchor: 3, text: '"我配不上，所以我用余生补她的每一天。"', favor: 15, next: 'f16', reaction: '老同学愣住，她泪如雨下。HE 锚点 3 ✅' },
        { kind: 'B', text: '"关你屁事"',   favor: 2,  next: 'f16', reaction: '差点动手，她挡在中间。' },
        { kind: 'C', text: '一言不发离开', favor: -6, taboo: 1, next: 'f16', reaction: '她默默把花插进花瓶。' },
      ]
    },
    // ═══════ 第三幕：F16-F20 照顾 → 相册 → 广告C → 雨夜 → 锚点4 ═══════
    f16: {
      scene: 'f16', talkingVideo: 'f16-final', voice: 'voice-f16',
      text: '我没事……你不用管。',
      env: '她夜里高烧 39℃，你摸她额头烫得像发面',
      choices: [
        { kind: 'A', text: '通宵陪 · 敷冰袋 · 一夜没睡', favor: 12, next: 'f17', reaction: '天亮她烧退，看你的眼睛全是心疼。' },
        { kind: 'B', text: '打车送医院',                 favor: 8,  next: 'f17', reaction: '医院走廊你抱着她。' },
        { kind: 'C', text: '"多喝水睡吧，明天就好"',      favor: -4, taboo: 1, next: 'f17', reaction: '早上她自己爬起来做早饭。' },
      ]
    },
    f17: {
      scene: 'f17', talkingVideo: 'f17-final', voice: 'voice-f17',
      text: '原来叔叔真的知道……',
      env: '她病好后从阁楼翻出鞋盒，里面是父亲们 1998 年的娃娃亲信',
      choices: [
        { kind: 'A', text: '一起把信按年份排开来读', favor: 10, next: 'f18', reaction: '你们读到深夜。' },
        { kind: 'B', text: '"都过去了，看这些干嘛"', favor: 3,  next: 'f18', reaction: '她默默收起来。' },
        { kind: 'C', text: '"别翻了，尊重死者"',    favor: -3, taboo: 1, next: 'f18', reaction: '她"……好"。' },
      ]
    },
    f18: {
      scene: 'f18', ad: true, talkingVideo: 'f18-final', voice: 'voice-f18',
      text: '帮我拿一下毛巾……好冷。',
      env: '📺 广告卡点 C · 暴雨天湿发浴袍',
      choices: [
        { kind: 'A', text: '📺 观看广告 · 解锁 CG「浴袍湿发依偎」', favor: 5, next: 'f19', ad: true, reaction: '你把浴巾裹她身上，抱她坐膝盖烘干。CG 已解锁 ✨' },
        { kind: 'B', text: '📺 观看广告 · 解锁 CG「浴袍湿发依偎」', favor: 5, next: 'f19', ad: true, reaction: '你把浴巾裹她身上，抱她坐膝盖烘干。CG 已解锁 ✨' },
        { kind: 'C', text: '转身走开"你自己弄"',                    favor: -3, taboo: 1, next: 'f19', reaction: '她"哦……"抓了毛巾自己擦。' },
      ]
    },
    f19: {
      scene: 'f19', talkingVideo: 'f19-final', voice: 'voice-f19',
      text: '你走得慢点……伞不够大。',
      env: '晚上停电，你摸黑找蜡烛，她跑来送伞',
      choices: [
        { kind: 'A', text: '把她整个包进怀里："这样就够了。"', favor: 12, next: 'f20', reaction: '她把脸埋在你胸口。' },
        { kind: 'B', text: '"早说我来接你"',                   favor: 5,  next: 'f20', reaction: '她"我就是想给你送伞嘛。"' },
        { kind: 'C', text: '"你自己不会带伞出门？"',            favor: -5, taboo: 1, next: 'f20', reaction: '她默默走开。' },
      ]
    },
    f20: {
      scene: 'f20', anchor: 4, talkingVideo: 'f20-final', voice: 'voice-f20',
      text: '你想说什么？',
      env: '★ 老宅后院樱花树下，粉色花瓣落满肩膀',
      choices: [
        { kind: 'A', anchor: 4, text: '"小雨，我想和你——一起看每年的樱花，一直看下去。"', favor: 15, next: 'f21', reaction: '她眼睛突然亮起来，一朵樱花落在她睫毛。HE 锚点 4 ✅' },
        { kind: 'B', text: '"呃……走吧走吧，晚饭好了。"', favor: 2,  next: 'f21', reaction: '她笑一下："嗯。"' },
        { kind: 'C', text: '"你想说啥？"',                favor: -3, taboo: 1, next: 'f21', reaction: '她"没啥没啥"，转身走了。' },
      ]
    },
    // ═══════ 第四幕：F21-F25 分别 → 重逢 → 广告D → 家庭 → 锚点5 ═══════
    f21: {
      scene: 'f21', talkingVideo: 'f21-final', voice: 'voice-f21',
      text: '这个是备用的……你在飞机上吃。',
      env: '公司通知你去东京出差 3 天，她给你打包三份保温饭盒',
      choices: [
        { kind: 'A', text: '每天视频，早晚各一次', favor: 10, next: 'f22', reaction: '她视频里对你笑得像 5 岁那年。' },
        { kind: 'B', text: '每天一句"晚安小雨"',   favor: 5,  next: 'f22', reaction: '她"嗯嗯"。' },
        { kind: 'C', text: '忙工作，3 天不主动联系', favor: -4, taboo: 1, next: 'f22', reaction: '第三天她哭着打过来："你活着吗。"' },
      ]
    },
    f22: {
      scene: 'f22', talkingVideo: 'f22-final', voice: 'voice-f22',
      text: '（举着 A4 纸）欢迎回家小弟弟。',
      env: '你走出机场，她红着脸举着牌子',
      choices: [
        { kind: 'A', text: '冲过去把她抱起来转圈',       favor: 12, next: 'f23', reaction: '她"啊啊你放我下来啦！"' },
        { kind: 'B', text: '拍下来发朋友圈"我媳妇"',      favor: 5,  next: 'f23', reaction: '她红着脸打你。' },
        { kind: 'C', text: '"别丢人啦，走了走了"',        favor: -3, taboo: 1, next: 'f23', reaction: '她把纸慢慢收起来。' },
      ]
    },
    f23: {
      scene: 'f23', ad: true, talkingVideo: 'f23-final', voice: 'voice-f23',
      text: '你……你干嘛。',
      env: '📺 广告卡点 D · 接你回家的路上，红灯，两人脸靠得很近',
      choices: [
        { kind: 'A', text: '📺 观看广告 · 解锁 CG「车内欲吻」', favor: 5, next: 'f24', ad: true, reaction: '绿灯前一秒你偏头亲了她额头。CG 已解锁 ✨' },
        { kind: 'B', text: '📺 观看广告 · 解锁 CG「车内欲吻」', favor: 5, next: 'f24', ad: true, reaction: '绿灯前一秒你偏头亲了她额头。CG 已解锁 ✨' },
        { kind: 'C', text: '转过脸"没什么，绿灯了"',            favor: -3, taboo: 1, next: 'f24', reaction: '她默默把手放回方向盘。' },
      ]
    },
    f24: {
      scene: 'f24', talkingVideo: 'f24-final', voice: 'voice-f24',
      text: '（她妈）什么时候把婚事办了？',
      env: '她父母来老宅吃饭',
      choices: [
        { kind: 'A', text: '"阿姨，越快越好，我不能再让小雨等了。"', favor: 12, next: 'f25', reaction: '她妈红着眼睛敬你一杯。' },
        { kind: 'B', text: '"尊重小雨的意见"',                     favor: 6,  next: 'f25', reaction: '她妈"这孩子懂事"。' },
        { kind: 'C', text: '"阿姨，我们还年轻……"',                 favor: -4, taboo: 1, next: 'f25', reaction: '她妈笑容淡了一点。' },
      ]
    },
    f25: {
      scene: 'f25', anchor: 5, talkingVideo: 'f25-final', voice: 'voice-f25',
      text: '哎哎导演你演过头了……',
      env: '★ 她以为你在拍短视频配合演"求婚戏"，你单膝跪下拿出真戒指盒',
      choices: [
        { kind: 'A', anchor: 5, text: '打开盒子："小雨，这不是彩排。嫁给我。"', favor: 15, next: 'f26', reaction: '她整个人愣住，眼泪掉下来，重重点头"嗯嗯嗯"。HE 锚点 5 ✅' },
        { kind: 'B', text: '假装继续演"彩排彩排~"', favor: 3,  next: 'f26', reaction: '她"你怎么突然认真起来了。"' },
        { kind: 'C', text: '关上盒子"过家家啦"',    favor: -5, taboo: 1, next: 'f26', reaction: '她笑容一顿："哦……好。"' },
      ]
    },
    // ═══════ 终章：F26-F30 危机 → 抉择 → 广告E → 告白 → 结局 ═══════
    f26: {
      scene: 'f26', talkingVideo: 'f26-final', voice: 'voice-f26',
      text: '（她坐客厅哭）……',
      env: '老同学在朋友圈散布"苏小雨有过孩子"的谣言',
      choices: [
        { kind: 'A', text: '"我陪你去起诉他，谁散布我们都告到底。"', favor: 12, next: 'f27', reaction: '律师函当天就发出。' },
        { kind: 'B', text: '抱住她"我信你"',                        favor: 6,  next: 'f27', reaction: '她"谢谢……"' },
        { kind: 'C', text: '"……真的假的？给我说清楚"',              favor: -8, taboo: 1, next: 'f27', reaction: '她整个人僵住："你居然怀疑我。"' },
      ]
    },
    f27: {
      scene: 'f27', talkingVideo: 'f27-final', voice: 'voice-f27',
      text: '你还要我吗？',
      env: '她哭着问',
      choices: [
        { kind: 'A', text: '抱她："这辈子。"', favor: 12, next: 'f28', reaction: '她眼泪笑着流下来。' },
        { kind: 'B', text: '"傻瓜。"',        favor: 5,  next: 'f28', reaction: '她锤你一下。' },
        { kind: 'C', text: '犹豫 3 秒才回答', favor: -4, taboo: 1, next: 'f28', reaction: '她感觉到了。' },
      ]
    },
    f28: {
      scene: 'f28', ad: true, talkingVideo: 'f28-final', voice: 'voice-f28',
      text: '好看吗？我妈说这条最像我。',
      env: '📺 广告卡点 E · 婚纱店试衣间，她穿白色缎面吊带婚纱转出来',
      choices: [
        { kind: 'A', text: '📺 观看广告 · 解锁 CG「婚纱转圈」', favor: 5, next: 'f29', ad: true, reaction: '你说"新娘，我们家里见"。CG 已解锁 ✨' },
        { kind: 'B', text: '📺 观看广告 · 解锁 CG「婚纱转圈」', favor: 5, next: 'f29', ad: true, reaction: '你说"新娘，我们家里见"。CG 已解锁 ✨' },
        { kind: 'C', text: '"赶时间，就这条吧"',              favor: -5, taboo: 1, next: 'f29', reaction: '她笑容淡了一点。' },
      ]
    },
    f29: {
      scene: 'f29', talkingVideo: 'f29-final', voice: 'voice-f29',
      text: '（望着夜色）……',
      env: '婚礼前夜，阳台上她穿白色睡衣，你从后面抱住她',
      choices: [
        { kind: 'A', text: '"我爱你 · 从 3 岁到 90 岁 · 一天不落。"', favor: 12, next: 'f30', reaction: '她转过身，眼泪笑着流。' },
        { kind: 'B', text: '"别哭啦傻瓜。"',                        favor: 5,  next: 'f30', reaction: '她笑着推你"讨厌"。' },
        { kind: 'C', text: '"早点睡，明天要拜堂。"',                 favor: -3, taboo: 1, next: 'f30', reaction: '她"嗯"，回房间。' },
      ]
    },
    f30: {
      scene: 'f30', talkingVideo: 'f30-final', voice: 'voice-f30',
      text: '……',
      env: '★ 结局判定',
      isEndingGate: true,
      choices: [
        { kind: 'A', text: '继续 ▶ 见证结局', favor: 0, next: 'ending', reaction: '故事到这里……' },
      ]
    }
  }
};
