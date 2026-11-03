const fs = require('fs'), path = require('path'), assert = require('assert/strict');
const {chromium} = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const root = path.resolve(__dirname, '../..'), pkg = path.join(root, 'package');
const out = process.argv[2] || '/tmp/weihunqi-first-entry';
fs.mkdirSync(out, {recursive: true});
const checkpoint = (curId, extra = {}) => ({ver:1, chapterLayout:3, curId, ep:'EP01', stats:{wei:12,qing:34,liang:56}, visitedNodes:{[curId]:true}, savedAt:100, ...extra});
const adapterMock = `
window.__videos=[];window.__events=[];window.__autoPlay=false;
wx.clearStorageSync=()=>localStorage.clear();
wx.createVideo=config=>{
 const callbacks={},v={...config,dead:false,plays:0,currentTime:0,duration:15};
 ['Play','Ended','Error','TimeUpdate','Pause','Canplay'].forEach(k=>v['on'+k]=fn=>callbacks[k]=fn);
 v.emit=(name,data)=>callbacks[name]&&callbacks[name](data);
 v.play=()=>{v.plays++;if(__autoPlay)queueMicrotask(()=>{if(!v.dead)v.emit('Play');});};
 v.pause=()=>{};v.seek=t=>{v.currentTime=t;};v.destroy=()=>{v.dead=true;};
 __videos.push(v);if(config.autoplay)setTimeout(v.play,0);return v;
};
window.ks=Object.assign({},wx,{env:{USER_DATA_PATH:'/test'},getFileSystemManager:()=>({}),
 onHide:()=>{},onShow:()=>{},reportScene:p=>{__events.push(p);p.success&&p.success({status:'SUCCESS'});}});
`;
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 const results=[];
 async function fixture(seed={},width=393){
  const page=await browser.newPage({viewport:{width,height:width===320?568:852}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(seed=>{if(!sessionStorage.getItem('__seeded')){for(const [k,v] of Object.entries(seed))localStorage.setItem(k,typeof v==='string'?v:JSON.stringify(v));sessionStorage.setItem('__seeded','1');}},seed);
  await page.route('**/*',async route=>{
   const url=new URL(route.request().url());if(url.hostname!=='127.0.0.1')return route.abort();
   const name=url.pathname==='/'?'index.html':url.pathname.slice(1),file=path.join(pkg,name);
   if(name==='js/preview-adapter.js')return route.fulfill({contentType:'application/javascript',body:fs.readFileSync(file,'utf8')+adapterMock});
   if(name==='js/main.js')return route.fulfill({contentType:'application/javascript',body:fs.readFileSync(file,'utf8').replace('  loop();',`  global.__flow={home:chapterHome,showHome:showChapterHome,choose:choose,next:next,restart:restart,render:render,ctrl:handleCtrl,enter:enterHomeChapter};\n  loop();`)});
   if(fs.existsSync(file)&&fs.statSync(file).isFile())return route.fulfill({path:file});
   return route.abort();
  });
  await page.goto('http://127.0.0.1:8766/?first-entry-test');await page.waitForFunction(()=>window.__flow);
  return {page,errors};
 }
 async function fresh(page){
  await page.waitForFunction(()=>__videos.length>0&&__videos[0].plays>0);
  assert.equal(await page.evaluate(()=>state.splash.active),false);
  assert.equal(await page.evaluate(()=>state.curId),'op1');
  assert.equal(await page.evaluate(()=>__videos[0].autoplay),true);
  assert.equal(await page.evaluate(()=>state.hasPlayedStory),false);
  assert.equal(await page.evaluate(()=>__events.some(e=>/^card_view:/.test((e.dimension||{}).event_key))),false,'no chapter cards flashed');
 }
 async function finish(f,label){assert.deepEqual(f.errors,[],label);results.push(label);await f.page.close();}
 try{
  for(const width of [393,320]){
   const f=await fixture({},width),p=f.page;await fresh(p);
   await p.screenshot({path:path.join(out,`first-loading-${width}.png`)});
   await p.reload();await p.waitForFunction(()=>window.__flow);await fresh(p);
   // Native playback is delayed: only a real onPlay changes returning status.
   await p.evaluate(()=>state.video.emit('Play'));
   assert.equal(await p.evaluate(()=>state.hasPlayedStory),true);
   const firstPlaySave=await p.evaluate(()=>{const s=KwaiStorage.getSync('weihunqi_save_v1');return typeof s==='string'?JSON.parse(s):s;});
   assert.equal(firstPlaySave.hasPlayedStory,true);
   await p.evaluate(()=>__flow.render());
   const zones=await p.evaluate(()=>state.hitZones.filter(z=>/^ctrl:(log|eye)$/.test(z.action)));
   assert.equal(zones.length,2);
   const [log,eye]=['ctrl:log','ctrl:eye'].map(a=>zones.find(z=>z.action===a));
   assert(log.x>=0&&log.x+log.w<=eye.x,'chapter target does not overlap eye');
   // Show the actual poster beneath the controls while the test video is mocked.
   await p.evaluate(async()=>{const im=new Image();im.src=STORY.nodes.op1.media.poster;im.style='position:absolute;inset:0;width:100%;height:100%;object-fit:cover;z-index:1';document.getElementById('game').prepend(im);try{await im.decode();}catch(_){}__flow.render();});
   await p.screenshot({path:path.join(out,`chapter-button-${width}.png`)});
   await p.mouse.click(log.x+log.w/2,log.y+log.h/2);
   assert.equal(await p.evaluate(()=>state.splash.active),true,'chapter plaque opens chapter selection');
   await p.reload();await p.waitForFunction(()=>window.__flow);
   assert.equal(await p.evaluate(()=>state.splash.active),true);
   assert.equal(await p.evaluate(()=>__videos.length),0,'returner does not autoplay');
   await p.screenshot({path:path.join(out,`returning-home-${width}.png`)});
   await p.evaluate(()=>__flow.home.select('EP01'));assert.equal(await p.evaluate(()=>state.curId),'op1');
   // Cache reset is the same fresh path and clears stale tutorial values/unlocks.
   await p.evaluate(()=>{KwaiStorage.setSync('weihunqi_chapter_unlocks_v1',JSON.stringify({EP02:true}));KwaiStorage.setSync('weihunqi_ad_unlocks_v1',JSON.stringify({'f_dance_react#1':1}));KwaiStorage.setSync('weihunqi_tutorial_seen','1');Achievements._debugState().onClearCache();});
   assert.equal(await p.evaluate(()=>state.curId),'op1');
   assert.equal(await p.evaluate(()=>state.splash.active),false);
   assert.equal(await p.evaluate(()=>state.hasPlayedStory),false);
   assert.equal(await p.evaluate(()=>state.ui.tutorialSeen),false);
   assert.equal(await p.evaluate(()=>__flow.home.isUnlocked('EP02')),false);
   await p.reload();await p.waitForFunction(()=>window.__flow);await fresh(p);
   await finish(f,`${width}px: fresh autoplay, loading exit, playback return, chapter button, cache reset`);
  }
  for(const [label,seed] of [
   ['login/tutorial only',{'weihunqi_tutorial_seen':'1','weihunqi_chapter_guide_seen':'1','weihunqi_chapter_unlocks_v1':{EP02:true}}],
   ['corrupt save',{'weihunqi_save_v1':'{broken'}],
   ['deleted node',{'weihunqi_save_v1':checkpoint('no_such_node')}],
   ['explicit unplayed with visitedNodes',{'weihunqi_save_v1':checkpoint('op1',{hasPlayedStory:false})}],
  ]){const f=await fixture(seed);await fresh(f.page);await finish(f,label);}
  for(const [label,seed,target] of [
   ['legacy valid save',{'weihunqi_save_v1':checkpoint('f_s2')},'f_s2'],
   ['legacy op1 save',{'weihunqi_save_v1':checkpoint('op1')},'op1'],
   ['latest legacy per-chapter save',{'weihunqi_save_v1':checkpoint('op1'), 'weihunqi_chapter_progress_v1':{EP01:checkpoint('f_s2',{savedAt:200})}},'f_s2'],
   ['old chapter boundary migration',{'weihunqi_save_v1':checkpoint('s9',{chapterLayout:1})},'s9']
  ]){const f=await fixture(seed),p=f.page;assert.equal(await p.evaluate(()=>state.splash.active),true);assert.equal(await p.evaluate(()=>__videos.length),0);await p.evaluate(target=>__flow.home.select(STORY.nodes[target].ep),target);assert.equal(await p.evaluate(()=>state.curId),target);assert.equal(await p.evaluate(()=>state.stats.wei),12);await finish(f,label);}
  const f=await fixture();await fresh(f.page);await f.page.evaluate(()=>{state.curId='f_s2';__flow.render();});assert.equal(await f.page.evaluate(()=>state.hasPlayedStory),true);await f.page.reload();await f.page.waitForFunction(()=>window.__flow);assert.equal(await f.page.evaluate(()=>state.splash.active),true);await finish(f,'visible choice counts as play');
  fs.writeFileSync(path.join(out,'first-entry-results.json'),JSON.stringify(results,null,2));console.log('PASS',results);
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
