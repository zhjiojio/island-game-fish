import copy,hashlib,json,pathlib
I=pathlib.Path(__file__).resolve().parents[1];D=I.parents[1];G=D.parent
load=lambda p:json.loads(p.read_text())
c=load(I/'game-config.candidate.json');old=load(D/'internal/history/before-template4/game-config.json');template=load(G/'refer/game-config(4).json')
def shape(v,p='',out=None):
 out=set() if out is None else out
 if isinstance(v,dict):
  for k,x in v.items():out.add(p+'.'+k);shape(x,p+'.'+k,out)
 elif isinstance(v,list):
  for x in v:shape(x,p+'[]',out)
 return out
assert not shape(c)-shape(template),sorted(shape(c)-shape(template))
ns={n['nodeId']:n for n in c['nodes']};os={n['nodeId']:n for n in old['nodes']};assert len(ns)==78 and set(ns)==set(os)
ids=[];components={x['componentType'] for n in template['nodes'] for x in n['components']};unlocks={x['unlockType'] for n in template['nodes'] for x in n['components']}
for nid,n in ns.items():
 assert n['video']==os[nid]['video'] and n['nodeIconUrl']==os[nid]['nodeIconUrl']
 if n['sceneType']!='end':
  cc=copy.deepcopy(n['components']);oc=copy.deepcopy(os[nid]['components'])
  for x in cc+oc:x.pop('position',None)
  assert cc==oc,'Playback/choice logic changed '+nid
 for x in n['components']:
  ids.append(x['componentId']);assert x['componentType'] in components and x['unlockType'] in unlocks
  assert x['nextNodeId'] is None or x['nextNodeId'] in ns
  assert x['showTime'] is None and x['endTime'] is None
  if x['unlockType']=='ad':assert x['adConfig']['failNextNodeId']==nid
  if x.get('position'):
   assert x['position']['width']==360 and x['position']['x'] is None
   assert 0<=x['position']['y']<=715
assert len(ids)==len(set(ids))
assert c['entryNodeId']==old['entryNodeId'];assert c['valueDefinitions']==old['valueDefinitions']
assert c['homepage']['image']==old['homepage']['image'];assert c['homepage']['copyright']==''
assert c['homepage']['hotspots']==template['homepage']['hotspots'];assert len(c['homepage']['loadingHints'])==3
initial=c['preload']['initialNodes'];assert len(set(initial))==len(initial)<=5 and initial[0]==c['entryNodeId'];assert set(initial)<=set(ns)
assert set(initial[1:])=={x['nextNodeId'] for x in ns[c['entryNodeId']]['components'] if x['nextNodeId']}
endings=[n for n in ns.values() if n['sceneType']=='end'];assert len(endings)==14
be=[]
for n in endings:
 assert len(n['components'])==1;dialog=n['components'][0];assert dialog['position'] is None
 assert dialog['content']['text']==os[n['nodeId']]['components'][0]['content']['text']
 if dialog['componentType']=='endingDialog_be':
  be.append(n['nodeId']);assert dialog['unlockType']=='ad';assert dialog['nextNodeId']=='ep11_scene_00__v2'
  # The same condition-enabled variant can enter the consequence that leads to this ending.
  choice=ns[dialog['nextNodeId']];assert any(x['nextNodeId']=='ep11_branch_conditional' for x in choice['components'])
  assert any(x['nextNodeId']==n['nodeId'] for x in ns['ep11_branch_conditional']['components'])
 else:assert dialog['componentType']=='endingDialog_he' and dialog['unlockType']=='share' and dialog['nextNodeId'] is None
assert be==['ending_regret']
seen=set();queue=[c['entryNodeId']]
while queue:
 nid=queue.pop()
 if nid in seen:continue
 seen.add(nid);queue.extend(x['nextNodeId'] for x in ns[nid]['components'] if x['nextNodeId'])
assert seen==set(ns)
report={'status':'passed','runtimeNodes':len(ns),'uniqueVideos':len({n['video']['url'] for n in ns.values()}),'endings':len(endings),'mediaAndNonEndingLogicUnchanged':True,'templateFieldPathsValid':True,'allNodesReachable':True,'badEndingRetry':'ep11_scene_00__v2','preloadInitialNodes':initial,'configSha256':hashlib.sha256((I/'game-config.candidate.json').read_bytes()).hexdigest(),'engineDeviceTest':'not_run'}
(I/'reports/config-verification.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n');print(json.dumps(report,ensure_ascii=False))
