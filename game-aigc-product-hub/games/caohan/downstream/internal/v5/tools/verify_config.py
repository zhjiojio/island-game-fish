import collections,hashlib,json,pathlib
I=pathlib.Path(__file__).resolve().parents[1];G=I.parents[2]
load=lambda p:json.loads(p.read_text())
s=load(G/'output/逃婚后我花千万雇了工地糙汉.v5.json');c=load(I/'game-config.candidate.json');r=load(I/'reports/export-report.json');t=load(G/'refer/game-config(3).json');media=load(I/'media-cdn-manifest.json')
nodes={n['nodeId']:n for n in c['nodes']};assert len(nodes)==len(c['nodes']);mapping=r['nodeMap'];ms={m['videoId']:m for m in media}
# Compare all field paths with the supplied sample, aggregating array alternatives.
def shape(v,path='',result=None):
 result=set() if result is None else result
 if isinstance(v,dict):
  for k,x in v.items():result.add(path+'.'+k);shape(x,path+'.'+k,result)
 elif isinstance(v,list):
  for x in v:shape(x,path+'[]',result)
 return result
extra=shape(c)-shape(t);assert not extra,sorted(extra)
assert c['meta']['version']==t['meta']['version'];assert c['globalSettings']['debugMode'] is False
component_ids=[]
for nid,n in nodes.items():
 m=ms[mapping[nid]['videoId']];assert n['video']['url']==m['url'];assert n['video']['duration']==m['durationSec'];assert n['video']['muted'] is False
 for x in n['components']:
  component_ids.append(x['componentId']);assert x['showTime'] is None and x['endTime'] is None
  assert x['nextNodeId'] is None or x['nextNodeId'] in nodes
  if x['unlockType']=='ad':assert x['adConfig']['failNextNodeId']==nid
assert len(set(component_ids))==len(component_ids)
# Walk source and runtime together with full path flags, independent of compiler memoization.
queue=collections.deque([(s['startNodeId'],frozenset(s.get('initialFlags',[])),frozenset(),c['entryNodeId'])]);seen=set();endings=set();runtime_seen=set();choices=0;locked=0
while queue:
 source_id,flags,tags,rid=queue.popleft();key=(source_id,flags,tags,rid)
 if key in seen:continue
 seen.add(key);runtime_seen.add(rid);n=s['nodes'][source_id];rn=nodes[rid];assert mapping[rid]['sourceNodeId']==source_id
 if n['type']=='ending':
  assert set(n['unlock'].get('requiredFlags',[]))<=flags;assert set(n['unlock'].get('requiredEndingTags',[]))<=tags
  assert rn['sceneType']=='end' and rn['components'][-1]['unlockType']=='restart';endings.add(source_id);continue
 nxt=s['nodes'][n['next']]
 if nxt['type']=='choice':
  choices+=1
  for o in nxt['options']:
   x=next(x for x in rn['components'] if x['componentId']==rid+'__'+nxt['id']+'_'+o['id']);a=o['access'];allowed=a['mode']!='condition' or a['condition']['flag'] in flags
   if not allowed:
    assert x['componentType']=='text2' and x['nextNodeId'] is None;locked+=1;continue
   assert x['componentType']=='button1' and x['content']['buttonText']==o['text']
   assert (x['unlockType']=='ad')==(a['mode']=='rewarded_ad')
   ch=o.get('changes',{});newflags=set(flags);newtags=set(tags)
   if ch.get('importantFlag'):newflags.add(ch['importantFlag']['id'])
   newtags.update(ch.get('addEndingTags',[]));queue.append((o['next'],frozenset(newflags),frozenset(newtags),x['nextNodeId']))
 elif nxt['type']=='ad_gate':
  x=next(x for x in rn['components'] if x['unlockType']=='ad');queue.append((nxt['unlock']['next'],flags,tags,x['nextNodeId']))
 else:raise AssertionError(nxt['type'])
assert runtime_seen==set(nodes)
assert len(endings)==14 and len(ms)==69 and len({m['videoId'] for m in mapping.values()})==69
report=dict(status='passed',runtimeNodes=len(nodes),uniqueVideos=len(ms),endings=len(endings),sourceRuntimeStatesChecked=len(seen),choiceStatesChecked=choices,lockedOptionStatesChecked=locked,unknownFieldPaths=[],configSha256=hashlib.sha256((I/'game-config.candidate.json').read_bytes()).hexdigest(),sourceSha256=hashlib.sha256((G/'output/逃婚后我花千万雇了工地糙汉.v5.json').read_bytes()).hexdigest(),templateSha256=hashlib.sha256((G/'refer/game-config(3).json').read_bytes()).hexdigest(),engineOrDeviceTest='not_run',adIds='engineering_required')
(I/'reports/config-verification.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n');print(json.dumps(report,ensure_ascii=False))
