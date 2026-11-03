const fs=require('fs'),vm=require('vm'),path=require('path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../..');
function fixture(mode='ok') {
 let now=100000,bypass=false;const calls=[],timers=[],hide=[],show=[],intervals=[];
 const g={console,Date:{now:()=>now},Math,setTimeout:f=>timers.push(f),setInterval:f=>intervals.push(f),
  ks:{onHide:f=>hide.push(f),onShow:f=>show.push(f)},AdminAdControl:{isBypassed:()=>bypass}};
 g.window=g;g.KwaiDataAnalysis={reportScene:p=>{calls.push(p);if(mode==='ok')p.success({});else if(mode==='fail')p.fail({});return true;}};
 vm.createContext(g);for(const f of ['telemetry-manifest.js','telemetry.js'])vm.runInContext(fs.readFileSync(path.join(root,'package/js',f),'utf8'),g);
 return {g,T:g.Telemetry,M:g.TelemetryManifest,calls,timers,hide:()=>hide.forEach(f=>f()),show:()=>show.forEach(f=>f()),advance:n=>now+=n,heartbeat:()=>intervals.forEach(f=>f()),bypass:v=>bypass=v};
}
const find=(f,k)=>f.calls.filter(p=>p.dimension.event_key===k);
const deltas=f=>f.calls.filter(p=>p.metric.delta_ms).reduce((s,p)=>s+Number(p.metric.delta_ms),0);
const f=fixture(), {T,M}=f;
const storyNodes={};for(const file of fs.readdirSync(path.join(root,'content/episodes')).filter(f=>f.endsWith('.json')))Object.assign(storyNodes,JSON.parse(fs.readFileSync(path.join(root,'content/episodes',file))));
assert.deepEqual(Object.keys(M.nodeInfo).sort(),Object.keys(storyNodes).sort());
assert.deepEqual(Object.keys(M.optionInfo).sort(),Object.values(storyNodes).flatMap(n=>(n.options||[]).map(o=>o.id)).sort());
const cfg=JSON.parse(fs.readFileSync(path.join(root,'content/telemetry-scenes.json')));
assert.equal(new Set(Object.values(cfg.records).map(r=>r.id)).size,Object.keys(cfg.records).length);
assert.equal(M.byKey['node_view:f_s2'],9000);assert.equal(M.byKey['option_click:f_s2_opt_0'],9100);
// v97.2 · 退役键基线从 48 更新为 1131。48 是 v90.17 时代的数字；v91.1 已把章节收敛到
//   EP01–EP05，下架的 EP06–EP09 共 300 个 node_view / 660 个 option_* / 112 个 first_*
//   / 48 个章节事件在此之后一直是「剧本已删但字典未落盘」的漂移状态，本次首次执行
//   --allocate 才把 retired 状态真正写入。ID 全部永久保留、不回收、禁止复活（见 telemetry-v93.md §6）。
assert.equal(Object.values(cfg.records).filter(r=>r.status==='retired').length,1131);
// 退役键绝不能重新出现在 manifest 里（复活检测）
for (const [k,v] of Object.entries(cfg.records)) if (v.status==='retired') assert.equal(M.byKey[k],undefined);
// v97.2 · 拖拽解锁互动漏斗四件套必须在册且 active
for (const k of ['drag_unlock_arm','drag_unlock_try','drag_unlock_fail','drag_unlock_ok','ad_pass_skip','be_interstitial_try','be_interstitial_close']) {
  assert.equal(cfg.records[k].status,'active'); assert(M.byKey[k]);
}
assert.equal(M.nodeInfo.f_s6.ep,'EP02');
assert.equal(M.nodeInfo.s6b.ep,'EP01');
for (const key of ['node_view:f1','node_view:f_e2s1_wait','option_click:f1_opt_0']) { assert.equal(cfg.records[key].status,'retired'); assert.equal(M.byKey[key],undefined); }
for(const [id,o]of Object.entries(M.optionInfo))for(const e of ['option_view','option_click','option_commit'])assert(M.byKey[e+':'+id]);
T.event('card_view:EP01',{chapter_id:'EP01'});T.event('card_click:EP01',{chapter_id:'EP01'});
T.onChapterEnter('EP01','chapter_home');const boot=T.diagnostics().bootId;
const nodes={f_s2:{ep:'EP01',type:'choice',options:[{id:'f_s2_opt_0'},{id:'f_s2_opt_1',ad:true}]}};
const s={curId:'f_s2',_activeChapter:'EP01',splash:{active:false},ui:{},hitZones:[{action:'choose:0',y:20,h:50},{action:'choose:1',y:1100,h:50}]};
const render=()=>T.onRenderTick(s,id=>nodes[id],{height:852});
render();assert.equal(find(f,'option_view:f_s2_opt_0').length,1);assert.equal(find(f,'option_view:f_s2_opt_1').length,0);
f.advance(15000);f.hide();assert.equal(deltas(f),15000);f.advance(60000);f.heartbeat();f.show();render();f.advance(5000);T.sceneFlush('check');assert.equal(deltas(f),20000);
s.adLoading={active:true};render();f.advance(9000);render();assert.equal(deltas(f),20000);s.adLoading=null;render();
T.onChoiceClick('f_s2','EP01',0,nodes.f_s2.options[0]);T.onChoiceCommit('f_s2','EP01',0,nodes.f_s2.options[0]);
T.onChoiceClick('f_s2','EP01',1,nodes.f_s2.options[1]);T.onChoiceClick('f_s2','EP01',0,nodes.f_s2.options[0]);
assert.equal(find(f,'node_first_choice:f_s2').length,1);assert.equal(find(f,'node_first_choice:f_s2')[0].dimension.option_id,'f_s2_opt_0');
assert.equal(find(f,'option_click:f_s2_opt_1').length,1);assert.equal(find(f,'option_commit:f_s2_opt_1').length,0);
assert.equal(find(f,'option_click:f_s2_opt_1')[0].dimension.requires_ad,'1');
T.onChapterEnter('EP02','transition');assert.equal(T.diagnostics().bootId,boot);
s._activeChapter='EP02';render();f.advance(3000);f.hide();f.advance(90000);f.show();render();T.sceneFlush('again');assert.equal(deltas(f),23000);
assert.equal(find(f,'duration_slot:2')[0].dimension.chapter_id,'EP02');
s._privacyOpen=true;render();f.advance(4000);render();s._privacyOpen=false;
s.curId='img';nodes.img={ep:'EP02',media:{kind:'image'}};s.mediaImg={};s.mediaImgKey='new';s._telemetryImageReadyKey='old';render();f.advance(4000);render();assert.equal(deltas(f),23000);
s.curId='f_s2';render();f.advance(30000);f.heartbeat();T.sceneFlush('same_time');assert.equal(deltas(f),53000);
for(let i=0;i<260;i++){render();f.advance(10);T.sceneFlush('cap');}
assert.equal(T.diagnostics().durationSlots,256);assert.equal(find(f,'duration_exhausted').length,1);
assert.equal(new Set(f.calls.map(p=>p.sceneId)).size,f.calls.length);
for(const p of f.calls){assert(Buffer.byteLength(JSON.stringify(p.dimension))<=1024);assert(Buffer.byteLength(JSON.stringify(p.metric))<=1024);assert(Object.values(p.dimension).every(v=>typeof v==='string'&&v.length));}
const fail=fixture('fail');while(fail.timers.length)fail.timers.shift()();assert.equal(fail.calls.filter(p=>p.sceneId===8001).length,2);assert.equal(fail.T.diagnostics().reports[8001].status,'failed');
const ambiguous=fixture('unknown');ambiguous.T.scene(8001);assert.equal(ambiguous.calls.length,1);assert.equal(ambiguous.timers.length,0);
const admin=fixture();admin.bypass(true);admin.T.onChoiceClick('f_s2','EP01',1,nodes.f_s2.options[1]);assert.equal(find(admin,'option_click:f_s2_opt_1')[0].dimension.requires_ad,'0');assert.equal(find(admin,'option_click:f_s2_opt_1')[0].dimension.admin_bypass,'1');
console.log('PASS: manifest coverage/retirement, once-per-boot, visible options, first intent vs commit, foreground deltas, repeated hide/show, chapter attribution, loading exclusion, slot cap, retries and payloads');
