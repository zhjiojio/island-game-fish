/**
 * ⭐ 老铁眼真尖 · 语音包配置 v2
 *
 * v0.0.55 变更：
 *   - 每个 clipKey 增加多条随机候选（_a/_b/_c），运行时 Feedback.play(key) 会自动随机挑一条
 *   - 保留旧 clip 字段作 fallback
 *   - 新 clipKey：wrong / final_hit / almost_out（原 pass* 保留兼容）
 */
(function(){
  var M3 = window.M3 = window.M3 || {};
  var BASE = 'assets/audio/voices/';
  var AV   = 'assets/voices/';
  // ⭐ v1.0.96 v3 音色重新合成，cache-buster 升 v4 强破 CDN edge 缓存
  function bust(id, path){ return id === 'liuhaoguaizai' ? path + '?v=v4' : path; }

  // 帮助函数：把 [a,b,c] 展开为 { key_a:..., key_b:..., key_c:... }
  function multi(id, key, letters){
    var out = {};
    letters.forEach(function(L){ out[key+'_'+L] = bust(id, BASE+id+'/'+key+'_'+L+'.mp3'); });
    return out;
  }
  // 5 clipKey × 3 letter 组
  var CLIP_KEYS = ['timeup','greet','wrong','final_hit','almost_out','remaining_1','remaining_2','remaining_3'];
  function buildClips(id){
    var c = {};
    // 旧字段兼容
    c.timeup       = bust(id, BASE+id+'/timeup.mp3');
    c.greet        = bust(id, BASE+id+'/greet.mp3');
    c.scene1_intro = bust(id, BASE+id+'/scene1_intro.mp3');
    c.scene2_intro = bust(id, BASE+id+'/scene2_intro.mp3');
    // ⭐ v1.0.59: hunt 模式（寻找隐藏物）专用 intro，避免复用 scene1_intro 说「找出穿越物」
    c.scene_hunt_intro = bust(id, BASE+id+'/scene_hunt_intro.mp3');
    for (var i=1;i<=6;i++){ c['pass'+(i===1?'':i)] = bust(id, BASE+id+'/pass'+(i===1?'':i)+'.mp3'); }
    // 新 v2 多候选（包含 remaining_1/2/3）
    CLIP_KEYS.forEach(function(k){
      var m = multi(id, k, ['a','b','c']);
      for (var mk in m){ c[mk] = m[mk]; }
    });
    return c;
  }

  // ⭐ v1.3.0 longaotian 特殊处理：pass/pass2-6 在 CDN 上全部 404（无对应文件）
  //   将 pass* 映射到 CDN 上已存在的 final_hit_a/b/c，避免播放时静默
  //   final_hit_* 情绪接近（正向激励），作为 pass 的替代合理
  function buildLongaotianClips(){
    var c = buildClips('longaotian');
    var fallbacks = [BASE+'longaotian/final_hit_a.mp3', BASE+'longaotian/final_hit_b.mp3', BASE+'longaotian/final_hit_c.mp3'];
    for (var i=1; i<=6; i++){
      var key = 'pass' + (i === 1 ? '' : i);
      c[key] = fallbacks[(i - 1) % fallbacks.length];
    }
    return c;
  }

  M3.VOICE_PACKS = [
    { id:'xiaomei',   name:'小美',   desc:'御姐音',  avatar: AV+'xiaomei.jpg',   voice_id:'female-yujie',            clips: buildClips('xiaomei') },
    { id:'xiaoshuai', name:'小帅',   desc:'精英男声',avatar: AV+'xiaoshuai.jpg', voice_id:'male-qn-jingying',        clips: buildClips('xiaoshuai') },
    { id:'kuergou',   name:'酷二狗', desc:'快手知名主播',  avatar: AV+'kuergou.jpg',   voice_id:'kuxiaogou_zhaocha_v1',    clips: buildClips('kuergou'),   hidden:true },
    { id:'lala',      name:'辣辣',   desc:'快手知名主播',  avatar: AV+'lala.jpg',      voice_id:'wangzhelala_doudizhu_v1',clips: buildClips('lala'),      hidden:true },
    { id:'longaotian',name:'龙傲天', desc:'神秘嘉宾',avatar: AV+'longaotian.png',voice_id:'male-qn-badao',          clips: buildLongaotianClips() },
    { id:'liuhaoguaizai',name:'6号乖崽', desc:'专属语音', avatar: AV+'liuhaoguaizai.jpg', voice_id:'liuhaoguaizai_zhaocha_v3', clips: buildClips('liuhaoguaizai') }
  ];
  M3.DEFAULT_VOICE_PACK = 'xiaomei';
  M3.VOICE_MULTI_KEYS = CLIP_KEYS;   // Feedback 侧读这个知道哪些 key 要走随机
})();
