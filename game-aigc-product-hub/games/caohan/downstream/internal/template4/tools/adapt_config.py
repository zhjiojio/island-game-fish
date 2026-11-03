"""Apply the template-4 presentation contract to the verified native-media graph."""
import copy,datetime,hashlib,json,pathlib
I=pathlib.Path(__file__).resolve().parents[1];D=I.parents[1];G=D.parent
load=lambda p:json.loads(p.read_text())
old=load(D/'internal/history/before-template4/game-config.json')
template=load(G/'refer/game-config(4).json');story=load(G/'output/逃婚后我花千万雇了工地糙汉.v5.json')
c=copy.deepcopy(old);nodes={n['nodeId']:n for n in c['nodes']}
c['meta']['version']=template['meta']['version'];c['meta']['configUpdatedAt']=datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=8))).isoformat()
c['theme']=copy.deepcopy(template['theme'])
c['homepage'].update(loadingTitle='正在载入逃婚故事…',loadingHints=[{'prefix':'每一次选择，都通向','highlight':'不同的结局'},{'prefix':'逃离一场婚约，','highlight':'找回自己的方向'},{'prefix':'相信谁、留下谁，','highlight':'由你决定'}],hotspots=copy.deepcopy(template['homepage']['hotspots']),copyright='')
entry=c['entryNodeId'];initial=[entry]
for component in nodes[entry]['components']:
 target=component.get('nextNodeId')
 if target and target not in initial:initial.append(target)
pre=template['preload'];c['preload']={'strategy':pre['strategy'],'lookahead':pre['lookahead'],'initialNodes':initial[:5]}
parents={nid:set() for nid in nodes}
for n in nodes.values():
 for comp in n['components']:
  if comp.get('nextNodeId'):parents[comp['nextNodeId']].add(n['nodeId'])
def previous_choice(nid):
 pending=list(parents[nid]);visited=set();choices=set()
 while pending:
  x=pending.pop()
  if x in visited:continue
  visited.add(x)
  if any('_choice_' in q['componentId'] and q['componentType']=='button1' for q in nodes[x]['components']):choices.add(x)
  else:pending.extend(parents[x])
 if len(choices)!=1:raise ValueError('Ambiguous previous choice; specialize ending before adaptation: '+nid)
 return choices.pop()
endings=[]
for n in c['nodes']:
 if n['sceneType']=='end':
  bad=story['nodes'][n['nodeId']]['category']=='bad'
  base=copy.deepcopy(n['components'][0]);base.update(componentId=n['nodeId']+'__ending_dialog',componentType='endingDialog_be' if bad else 'endingDialog_he',showTime=None,endTime=None,nextNodeId=previous_choice(n['nodeId']) if bad else None,unlockType='ad' if bad else 'share',position=None)
  base['content']['buttonText']='看广告重新选择' if bad else '分享给好友'
  if bad:base['adConfig']={'adType':'rewarded','adId':None,'failNextNodeId':n['nodeId']}
  n['components']=[base]
  endings.append({'nodeId':n['nodeId'],'componentType':base['componentType'],'retryNodeId':base['nextNodeId']})
 else:
  row=0
  for component in n['components']:
   kind=component['componentType']
   if kind is None:continue
   # Locked option descriptions occupy the same choice row as their clickable counterpart.
   option=('_choice_' in component['componentId'] and not component['componentId'].endswith('_prompt'))
   if kind in ('button1','button2') or option:
    component['position']={'x':None,'y':529+62*row,'width':360,'height':None if kind=='text2' else 48};row+=1
   else:component['position']={'x':None,'y':390,'width':360,'height':None}
report={'reference':'refer/game-config(4).json','referenceSha256':hashlib.sha256((G/'refer/game-config(4).json').read_bytes()).hexdigest(),'sourceConfigSha256':hashlib.sha256((D/'internal/history/before-template4/game-config.json').read_bytes()).hexdigest(),'runtimeNodes':len(c['nodes']),'uniqueVideos':len({n['video']['url'] for n in c['nodes']}),'endings':endings,'initialNodes':c['preload']['initialNodes'],'copyright':'not_provided_blank','countdown':'not_used_by_source_story','engineDeviceTest':'not_run'}
(I/'game-config.candidate.json').write_text(json.dumps(c,ensure_ascii=False,indent=2)+'\n');(I/'reports/adaptation.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
print('Adapted',report['runtimeNodes'],'nodes;',report['uniqueVideos'],'videos; endings',len(endings))
