#!/usr/bin/env node
// Validates authoritative image references AND runtime fallback maps; no filename guessing.
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert/strict');
const root=path.resolve(__dirname,'../..'),pkg=path.join(root,'package'),refs=new Map();
const context={window:{}};vm.runInNewContext(fs.readFileSync(path.join(pkg,'js/registry.js'),'utf8'),context);
const reg=context.window.WEIHUNQI_REGISTRY,meta=JSON.parse(fs.readFileSync(path.join(root,'content/meta.json')));
function add(src,ref){if(typeof src!=='string'||!src)return;src=reg.IMAGE_ALIASES[src]||src;(refs.get(src)||refs.set(src,[]).get(src)).push(ref);}
let videos=0,choices=0;
for(const file of fs.readdirSync(path.join(root,'content/episodes')).filter(n=>n.endsWith('.json'))){
 const nodes=JSON.parse(fs.readFileSync(path.join(root,'content/episodes',file)));
 for(const [id,n] of Object.entries(nodes)){
  const m=n.media;
  if(m&&m.kind==='video'){videos++;assert.equal(m.poster,reg.VIDEO_POSTERS[m.file],id);assert(m.poster,id);add(m.poster,id+':video-poster');}
  if(m&&m.kind==='image')add(m.file,id+':image');
  if(!m&&(n.type==='choice'||n.stay)){choices++;add(reg.NODE_POSTERS[id]||meta.meta.homeBackground,id+':resume-background');}
 }
}
for(const [video,poster] of Object.entries(reg.VIDEO_POSTERS))add(poster,video);
for(const [id,poster] of Object.entries(reg.NODE_POSTERS))add(poster,id+':runtime-fallback');
for(const ch of meta.meta.homeChapters)add(ch.poster,ch.id+':home');
add(meta.meta.homeBackground,'home-background');add(meta.meta.homeTitleArt,'home-title');
assert(videos>0&&choices>0&&refs.size>0,'empty audit is not a successful audit');
let local=0,remote=0;
for(const [src,where] of refs){
 if(/^https?:\/\//.test(src)){remote++;continue;}
 const file=path.resolve(pkg,src);assert(file.startsWith(pkg+path.sep),'outside package '+src);
 assert(fs.existsSync(file)&&fs.statSync(file).size>0,'missing image '+src+' '+where.join(','));
 const b=fs.readFileSync(file);assert((b[0]===255&&b[1]===216)||b.subarray(1,4).toString()==='PNG'||b.subarray(0,4).toString()==='RIFF','invalid image signature '+src);local++;
}
console.log(`PASS image manifest: ${videos} video nodes, ${Object.keys(reg.VIDEO_POSTERS).length} unique video posters, ${choices} choice/stay resume backgrounds, ${local} local images; ${remote} remote URLs require network audit`);
if(process.argv[2])fs.writeFileSync(process.argv[2],JSON.stringify(Object.fromEntries(refs),null,2));
