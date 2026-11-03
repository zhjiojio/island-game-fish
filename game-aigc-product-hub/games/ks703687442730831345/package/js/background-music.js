(function(r){
  'use strict';
  var M=r.M3, audio=null, started=false, playing=false;
  function muted(){var p=M.Game&&M.Game.profile;return !!(p&&(typeof p.musicEnabled==='boolean'?!p.musicEnabled:p.muted));}
  function create(){
    if(audio)return audio;
    if(M.Platform&&M.Platform.sdk&&M.Platform.sdk.createInnerAudioContext){
      audio=M.Platform.sdk.createInnerAudioContext();audio.src='subpackages/assets-all/assets/audio/background-music.mp3';audio.loop=true;audio.autoplay=false;audio.volume=1;
      audio.onPlay=function(){playing=true;};audio.onPause=function(){playing=false;};audio.onStop=function(){playing=false;};audio.onEnded=function(){playing=false;};audio.onError=function(e){playing=false;console.warn('[MUSIC] playback failed',e);};
    }else if(typeof r.Audio!=='undefined'){
      audio=new r.Audio('subpackages/assets-all/assets/audio/background-music.mp3');audio.loop=true;audio.autoplay=false;audio.preload='auto';audio.volume=0.42;
      audio.onplay=function(){playing=true;};audio.onpause=function(){playing=false;};audio.onended=function(){playing=false;};audio.onerror=function(e){playing=false;console.warn('[MUSIC] playback failed',e);};
    }
    return audio;
  }
  M.BackgroundMusic={init:function(){create();M.BackgroundMusic.play();},play:function(){
    var a=create();started=true;if(!a||muted())return;try{var result=a.play();playing=true;if(result&&result.catch)result.catch(function(e){playing=false;console.warn('[MUSIC] play rejected',e);});}catch(e){playing=false;console.warn('[MUSIC] play failed',e);}
  },pause:function(){if(audio&&audio.pause)try{audio.pause();playing=false;}catch(e){}} ,
  sync:function(){if(!started)return;if(muted()){M.BackgroundMusic.pause();return;}if(!playing)M.BackgroundMusic.play();},
  isStarted:function(){return started;},isPlaying:function(){return playing;}};
  if(typeof document!=='undefined')document.addEventListener('visibilitychange',function(){if(document.hidden)M.BackgroundMusic.pause();else M.BackgroundMusic.sync();});
})(typeof GameGlobal!=='undefined'?GameGlobal:typeof window!=='undefined'?window:global);
