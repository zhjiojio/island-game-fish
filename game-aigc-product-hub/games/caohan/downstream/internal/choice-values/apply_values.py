"""Apply authored option feedback without changing transitions or media."""
import copy,datetime,hashlib,json,pathlib
I=pathlib.Path(__file__).resolve().parent;D=I.parents[1]
load=lambda p:json.loads(p.read_text())
base=load(I/'game-config.before-values.json');scores=load(I/'option-values.json');c=copy.deepcopy(base);c['valueDefinitions']=scores['valueDefinitions'];c['meta']['configUpdatedAt']=datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=8))).isoformat();matches={};count=0
for n in c['nodes']:
 for x in n['components']:
  found=[o for o in scores['options'] if x['componentId'].endswith('__'+o['choiceId']+'_'+o['optionId'])]
  if not found:continue
  assert len(found)==1;o=found[0]
  if x['componentType']=='button1' and x['nextNodeId']:
   assert x['content']['buttonText']==o['text'];x['value']=copy.deepcopy(o['value']);matches[(o['choiceId'],o['optionId'])]=True;count+=1
  else:assert x['componentType']=='text2' and x['nextNodeId'] is None and x['value'] is None
assert len(matches)==44
(I/'game-config.candidate.json').write_text(json.dumps(c,ensure_ascii=False,indent=2)+'\n')
print('Applied',len(matches),'unique options to',count,'clickable components')
