const fs=require('fs'),vm=require('vm'),assert=require('assert/strict'),path=require('path');
const source=fs.readFileSync(path.join(__dirname,'../../package/js/main.js'),'utf8');
function block(start,end){return source.slice(source.indexOf(start),source.indexOf(end,source.indexOf(start)));}
function harness(){
 let time=0,seq=0,timers=new Map(),images=[],logs=[];
 const c={Date:{now:()=>time},imgCache:{},_curResources:[],_prevResources:[],_persistImages:{},_lastframeCache:{},_releasedLog:[],_releasedTotal:0,state:{},LG:(...x)=>logs.push(x),
 setTimeout:(fn,ms)=>{timers.set(++seq,{fn,at:time+ms});return seq;},clearTimeout:id=>timers.delete(id),_REG:{IMAGE_ALIASES:{}},BUNDLED_IMAGES:{},wx:{createImage:()=>{let im={width:0,height:0,_src:''};Object.defineProperty(im,'src',{get:()=>im._src,set:v=>{im._src=v;if(!v){im.width=im.height=0;if(im.onerror)im.onerror();}}});images.push(im);return im;}}};
 vm.createContext(c);vm.runInContext(block('  function _releasePrevResources','  // 小图持久化缓存')+block('  function _resolveImgSrc','  // v72.3')+block('  // A decoding/network failure','  function roundRect'),c);
 function advance(ms){let end=time+ms;while(true){let next=[...timers].filter(([,v])=>v.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];if(!next)break;time=next[1].at;timers.delete(next[0]);next[1].fn();}time=end;}
 function ok(im=images.at(-1)){im.width=540;im.height=960;im.onload();}
 return {c,images,logs,advance,ok};
}
{
 const h=harness();let result=[];
 h.c.loadImg('a',im=>{result.push(!!im);throw Error('consumer');});h.c.loadImg('a',im=>result.push(!!im));assert.equal(h.images.length,1);h.ok();assert.deepEqual(result,[true,true]);assert.equal(h.c._curResources.length,1);h.c.loadImg('a',()=>{});assert.equal(h.c._curResources.length,1);
}
{
 const h=harness();let calls=0;h.c.loadImg('a',im=>{assert(im);calls++;});let late=h.images[0].onload;h.images[0].onerror();h.advance(350);late();assert.equal(calls,0);h.ok();assert.equal(calls,1);assert.equal(h.images.length,2);
}
{
 const h=harness();let results=[];h.c.loadImg('bad',im=>results.push(!!im));h.images[0].onerror();h.advance(350);h.images[1].onerror();assert.deepEqual(results,[false]);assert(h.c._imageCooling('bad'));h.c.loadImg('bad',im=>results.push(!!im));assert.equal(h.images.length,2);h.advance(30000);assert(h.c._imageRetryDue('bad'));h.c.loadImg('bad',im=>results.push(!!im));h.ok();assert.deepEqual(results,[false,false,true]);assert(!h.c._imageRetryDue('bad'));
}
{
 const h=harness();let results=[];h.c.loadImg('hang',im=>results.push(im));h.advance(16350);assert.deepEqual(results,[null]);assert.equal(h.images.length,2);assert(h.logs.some(x=>x[0]==='IMG-LOAD-FAIL'&&x[2].reason==='timeout'));
}
{
 const h=harness();h.c.loadImg('poster',()=>{});h.ok();const old=h.images[0];h.c._lastframeCache.poster=old;h.c.imgCache.alias=old;h.c._prevResources=h.c._curResources;h.c._curResources=[];h.c._releasePrevResources();assert.equal(old.src,'');assert.equal(Object.keys(h.c.imgCache).length,0);assert.equal(Object.keys(h.c._lastframeCache).length,0);assert.equal(Object.keys(h.c._failedSrcs).length,0);h.c.loadImg('poster',()=>{});h.ok();assert.notEqual(h.images[1],old);assert(h.images[1].width);
}
{
 const h=harness();h.c.loadImg('visible',()=>{});h.ok();h.c.state.mediaImg=h.images[0];h.c._prevResources=h.c._curResources;h.c._curResources=[];h.c._releasePrevResources();assert.equal(h.images[0].width,540);assert.equal(h.c._curResources.length,1);
}
console.log('PASS image loader: dedupe, callback isolation, transient retry, late callbacks, cooldown recovery, timeout, release/revisit, visible-frame protection');
