const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert/strict');
const root=path.resolve(__dirname,'../..'),meta=JSON.parse(fs.readFileSync(path.join(root,'content/meta.json'))),nodes={};
for(const file of fs.readdirSync(path.join(root,'content/episodes')).filter(n=>n.endsWith('.json')))Object.assign(nodes,JSON.parse(fs.readFileSync(path.join(root,'content/episodes',file))));
const rules=meta.meta.progressMigration;
assert.equal(nodes.s6b.ep,'EP01');assert.equal(nodes.s6b.media.achvId,'skill_land');assert.equal(nodes.s6b.next,'f_s6');assert.equal(meta.meta.homeChapters[1].start,'f_s6');
assert.equal(nodes.f_s6.ep,'EP02');assert.equal(nodes.e2s1.ep,'EP02');assert.equal(nodes.e2s1.next,'e2s2');
let gates=[];const seen=new Set(),queue=[meta.start];
while(queue.length){let id=queue.shift();if(seen.has(id))continue;seen.add(id);const n=nodes[id];if(id.startsWith('BE_')||n.ep==='EP99')continue;for(const dest of [n.next,...(n.options||[]).map(o=>o.next)].filter(Boolean)){if(nodes[dest].ep==='EP02'){gates.push(id+'>'+dest);continue;}queue.push(dest);}}
assert.deepEqual(gates,['s6b>f_s6'],'all non-failure first-chapter paths stop after receiving the skill');
for(const id of Object.keys(rules.redirects))assert(!nodes[id],'removed branch remains: '+id);
for(const id of rules.movedNodeIds)assert.equal(nodes[id].ep,'EP02',id);
function home(){const storage={};const env={window:{},localStorage:{getItem:k=>storage[k],setItem:(k,v)=>storage[k]=v}};vm.runInNewContext(fs.readFileSync(path.join(root,'package/js/chapter-home.js'),'utf8'),env);return env.window.ChapterHome.create({width:393,height:852,chapters:meta.meta.homeChapters,progressMigration:rules});}
{
 const h=home(),d=h.migrateSave({ver:1,curId:'s8',ep:'EP01',stats:{wei:1,qing:2,liang:3}});
 assert.equal(d.curId,'s8');assert.equal(d.ep,'EP02');assert.equal(d.chapterLayout,2);assert(h.isUnlocked('EP02'));assert.equal(d.stats.liang,3);
 const again=h.migrateSave(d);assert.equal(again,d,'migration is idempotent');
}
{
 const h=home();h.migrateSave({ver:1,curId:'s6b',ep:'EP01'});assert(!h.isUnlocked('EP02'),'skill receipt alone never grants the chapter');
 h.migrateSave({ver:1,chapterLayout:2,curId:'s8',ep:'EP01'});assert(!h.isUnlocked('EP02'),'new-layout data never gets legacy entitlement');
}
{
 const h=home();for(const id of Object.keys(rules.redirects)){const d=h.migrateSave({ver:1,curId:id,ep:'EP02'});assert.equal(d.curId,'e2s2');assert.equal(d.ep,'EP02');}assert(!h.isUnlocked('EP02'),'redirect cannot manufacture access');
}
console.log('PASS chapter cut: unique first boundary after skill, second chapter continuity, removed branch redirects, legacy access, new-player gate, idempotent migration');
