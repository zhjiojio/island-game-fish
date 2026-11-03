#!/usr/bin/env node
// Validate the runnable package against exact-version audio transcript sources.
'use strict';
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert/strict');
const root=path.resolve(__dirname,'../..'),context={};context.window=context;
for(const file of ['story.js','subtitles.js'])vm.runInNewContext(fs.readFileSync(path.join(root,'package/js',file),'utf8'),context);
const records=new Map();
for(const file of fs.readdirSync(path.join(root,'content/subtitles/verified')).filter(f=>f.endsWith('.json'))){
 const record=JSON.parse(fs.readFileSync(path.join(root,'content/subtitles/verified',file),'utf8'));
 records.set(record.url,record);
}
const normalize=t=>t.replace(/[\p{P}\p{Z}\s]/gu,'');
const live=[...new Set(Object.values(context.STORY.nodes).filter(n=>n.media?.kind==='video').map(n=>n.media.file))];
const reviews=[];let speech=0,segments=0,characters=0;const skipped=[];
for(const url of live){
 const source=records.get(url),data=context.SUBTITLES.get(url);
 if(!source&&!data){skipped.push(path.basename(url));continue;}
 assert(source,`missing source ${url}`);assert(data,`missing package entry ${url}`);
 assert.equal(data.sha256,source.sha256,`source version mismatch ${url}`);
 assert.equal(data.status,source.status);assert.equal(data.d,source.duration);
 assert.equal(normalize(data.s.map(s=>s[2]).join('')),normalize(source.transcript),`stale generated transcript ${url}`);
 if(source.status==='partial_review'||source.status==='unclear_audio'){assert(source.audioReview?.note);reviews.push(path.basename(url));}
 if(data.s.length)speech++;
 let previous=0;
 for(const [start,end,text,chars] of data.s){
  assert(start>=previous && end>=start && end<=data.d,`bad cue time ${url}`);assert.equal(chars.length,text.length);
  let charPrevious=start;
  for(let i=0;i<chars.length;i++){
   const [s,e,ch]=chars[i];assert(Number.isFinite(s)&&Number.isFinite(e)&&s>=charPrevious&&e>=s&&e<=end,`bad character time ${url}:${i}`);
   assert.equal(ch,text[i]);charPrevious=e;characters++;
  }
  previous=end;segments++;
 }
 assert.equal(context.SUBTITLES.get(url.replace(/\.mp4$/,'_unreviewed.mp4')),null);
}
// Self-tests pinned to live keys (updated after the .c -> .hd 720p re-encode).
assert(context.SUBTITLES.keyFromUrl('https://example.test/e3s1.hd.mp4?cache=1#play')==='e3s1.hd');
assert.equal(context.SUBTITLES.get('https://example.test/e3s3_v2.hd.mp4').s.length,0);
assert(context.SUBTITLES.get('https://example.test/e3s1.hd.mp4').s.some(s=>s[2].includes('你怎么对我这么好')));
const checked=live.length-skipped.length;
console.log(`PASS subtitles: ${checked}/${live.length} exact video records; ${speech} with captions; ${segments} cues; ${characters} aligned characters.`);
if(skipped.length)console.log(`WARN no ASR source, skipped (${skipped.length}): ${skipped.join(', ')}`);
if(reviews.length)console.log(`Audio listening review (${reviews.length}): ${reviews.join(', ')}`);
