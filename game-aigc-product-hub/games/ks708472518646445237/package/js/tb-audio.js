// 提艾默声场：双轨环境音 + 人声顺播 + 自动 duck/restore + 独立 Foley。
(function () {
  var M3 = window.M3;
  var _cur=null,_bgm=null,_ambient=null,_scene='',_muted=false,_run=0;
  var NORMAL={bgm:.23,ambient:.16},DUCK={bgm:.07,ambient:.05};

  function destroy(a){if(!a)return;try{a.stop&&a.stop();}catch(e){}try{a.pause&&a.pause();}catch(e){}try{a.destroy&&a.destroy();}catch(e){}}
  function volume(a,v){if(a)try{a.volume=v;}catch(e){}}
  function stop(){destroy(_cur);_cur=null;}
  function duck(){volume(_bgm,DUCK.bgm);volume(_ambient,DUCK.ambient);}
  function restore(){volume(_bgm,NORMAL.bgm);volume(_ambient,NORMAL.ambient);}
  function makeLoop(file,v){if(!file)return null;var a=M3.Loader.createAudio(file);if(!a)return null;try{a.loop=true;a.volume=v;a.obeyMuteSwitch=false;a.play();}catch(e){}return a;}

  function enter(name){
    if(!name||name===_scene)return;
    _scene=name;destroy(_bgm);destroy(_ambient);_bgm=null;_ambient=null;
    var plan=M3.Config.SOUNDSCAPE&&M3.Config.SOUNDSCAPE[name];
    if(!plan||_muted)return;
    _bgm=makeLoop(plan.bgm,NORMAL.bgm);
    _ambient=makeLoop(plan.ambient,NORMAL.ambient);
  }

  function play(file,done){
    stop();
    if(_muted||!file){done&&done();return;}
    duck();
    var a=M3.Loader.createAudio(file);if(!a){restore();done&&done();return;}
    _cur=a;var fired=false;
    function finish(){if(fired)return;fired=true;if(_cur===a)_cur=null;destroy(a);restore();done&&done();}
    try{if(a.onEnded)a.onEnded(finish);else a.onended=finish;if(a.onError)a.onError(finish);else a.onerror=finish;var p=a.play();if(p&&p.catch)p.catch(finish);}catch(e){finish();}
    setTimeout(finish,30000);
  }

  function sequence(items,onStep,onDone){var token=++_run,i=0;function step(){if(token!==_run)return;if(i>=items.length){restore();onDone&&onDone();return;}var it=items[i++];onStep&&onStep(i-1,it);play(it.audio,step);}step();return token;}
  function isStale(token){return token!==_run;}
  function cancel(){_run++;stop();restore();}
  function setMuted(m){_muted=!!m;if(_muted){stop();destroy(_bgm);destroy(_ambient);_bgm=null;_ambient=null;}else{var old=_scene;_scene='';enter(old);}}
  function isMuted(){return _muted;}
  function foley(file){if(_muted||!file)return;var a=M3.Loader.createAudio(file);if(!a)return;try{a.volume=.8;a.play();setTimeout(function(){destroy(a);},6000);}catch(e){destroy(a);}}
  function stopAll(){cancel();destroy(_bgm);destroy(_ambient);_bgm=null;_ambient=null;_scene='';}

  M3.Audio={play:play,sequence:sequence,cancel:cancel,stop:stop,stopAll:stopAll,enter:enter,duck:duck,restore:restore,isStale:isStale,setMuted:setMuted,isMuted:isMuted,foley:foley};
})();
