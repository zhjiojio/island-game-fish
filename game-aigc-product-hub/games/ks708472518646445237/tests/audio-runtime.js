const assert=require('assert');
global.window=global;
const made=[];
global.M3={
  Config:{SOUNDSCAPE:{opening:{bgm:'bgm.mp3',ambient:null}}},
  Loader:{createAudio(src){const a={src,volume:1,loop:false,played:0,play(){this.played++;},stop(){},destroy(){},onEnded(fn){this.ended=fn;},onError(fn){this.failed=fn;}};made.push(a);return a;}}
};
require('../package/js/tb-audio');
M3.Audio.enter('opening');
assert.equal(made.length,1);
assert.equal(made[0].loop,true);assert.equal(made[0].volume,.23);
let done=false;M3.Audio.play('voice.mp3',()=>done=true);
assert.equal(made[0].volume,.07);
made[1].ended();
assert.equal(done,true);assert.equal(made[0].volume,.23);
M3.Audio.foley('tap.wav');assert.equal(made[2].volume,.8);
M3.Audio.stopAll();
console.log('audio runtime passed');
