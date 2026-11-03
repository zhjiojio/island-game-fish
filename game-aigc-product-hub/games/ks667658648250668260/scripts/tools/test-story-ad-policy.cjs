const fs=require('fs'),path=require('path'),assert=require('assert/strict');
const root=path.resolve(__dirname,'../..');
const nodes={};for(const f of fs.readdirSync(path.join(root,'content/episodes')))Object.assign(nodes,JSON.parse(fs.readFileSync(path.join(root,'content/episodes',f))));
const decisions=JSON.parse(fs.readFileSync(path.join(root,'docs/ad-decisions-v9017.json')));
const approved=new Set(decisions.addAds.map(c=>c.optionId));
assert.equal(approved.size,22);
for(const id of decisions.keepOptions)assert(!Object.values(nodes).flatMap(n=>n.options||[]).find(o=>o.id===id).ad);
const expected={EP01:2,EP02:13,EP03:12,EP04:4,EP05:7,EP06:4,EP07:3,EP08:0,EP09:2,EP99:0},counts={};
for(const [id,n] of Object.entries(nodes)){
 assert(!n.ad,`${id} must not block ordinary continue`);
 const opts=n.options||[];
 if(opts.length)assert(opts.some(o=>!o.ad && nodes[o.next]?.ep!=='EP99' && !String(o.next).startsWith('BE_')),`${id} needs a free non-failure exit`);
 for(const o of opts)if(o.ad){
  counts[n.ep]=(counts[n.ep]||0)+1;
  assert(nodes[o.next],`${id}: missing reward target`);
  // User-approved interaction/menu/failure gates are intentional; other ads still deliver video.
  if(!approved.has(o.id)){
   assert.equal(nodes[o.next]?.media?.kind,'video',`${id}: reward must deliver bonus video`);
   assert.equal(nodes[o.next].ep,n.ep,`${id}: bonus stays in chapter`);
  }
  assert.equal(o.adCount||1,1,`${id}: one ad per bonus`);
  const reaction=nodes[nodes[o.next].next];
  assert(!reaction?.ad,`${id}: ordinary continue stays free`);
  for(const opt of reaction?.options||[])if(opt.ad)assert(approved.has(opt.id),`${id}: reaction ads require an explicit user decision`);
 }
}
for(const [ep,count] of Object.entries(expected))assert.equal(counts[ep]||0,count,ep);
assert(nodes.f_saoshi.options.find(o=>o.next==='f_saoshi_dance').ad);
assert(!nodes.f_saoshi.options.find(o=>o.next==='r_f_saoshi_b').ad);
// Count entries reachable in actual play; dormant legacy menus cannot inflate coverage.
const meta=JSON.parse(fs.readFileSync(path.join(root,'content/meta.json'))),reachable=new Set(),queue=[meta.start],reachableCounts={};
while(queue.length){const id=queue.pop();if(reachable.has(id))continue;const n=nodes[id];assert(n,`broken story target: ${id}`);reachable.add(id);for(const dest of [n.next,...(n.options||[]).map(o=>o.next)].filter(Boolean))queue.push(dest);}
for(const id of reachable){const n=nodes[id];reachableCounts[n.ep]=(reachableCounts[n.ep]||0)+(n.options||[]).filter(o=>o.ad).length;}
assert.deepEqual(reachableCounts,{EP01:2,EP02:10,EP03:12,EP04:4,EP05:7,EP06:4,EP07:3,EP08:0,EP09:2,EP99:0});
for(const [parent,gate,back,ep] of [['e6s3','k_side_gate_e6','e6s4','EP06'],['e9s9','k_side_gate_e9','e9s10','EP09']]){
 assert.equal(nodes[parent].next,gate);assert(reachable.has(gate));
 assert.equal(nodes[gate].ep,ep);assert.equal(nodes[gate].options.length,3);
 const opts=nodes[gate].options;assert.equal(opts.filter(o=>o.ad).length,2);
 assert.equal(opts[2].next,back);assert(!opts[2].ad);
 for(const o of opts.slice(0,2)){const video=nodes[o.next];assert(reachable.has(o.next));assert.equal(video.next,back);assert.equal(video.ep,ep);assert.equal(nodes[back].ep,ep);assert(video.media.poster);}
}
for(const change of decisions.addAds){
 const o=nodes[change.nodeId].options[change.index-1];assert.equal(o.id,change.optionId);assert.equal(o.ad,true);assert.equal(o.next,change.next);
 if(change.visibleResponse)assert(nodes[o.next].stay,change.optionId+': paid response cannot auto-skip');
 if(change.rewardVideo){assert.equal(nodes[o.next].media.file,change.rewardVideo);assert.equal(nodes[o.next].next,change.return);assert.equal(nodes[o.next].ep,change.ep);}
}
console.log('PASS: 47 configured / 44 reachable ads, exact 22 user decisions, 3 real encore videos, ordinary continues and free choices retained');
