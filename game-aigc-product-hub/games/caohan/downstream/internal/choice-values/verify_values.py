import copy,hashlib,json,pathlib
I=pathlib.Path(__file__).resolve().parent;D=I.parents[1];G=D.parent
load=lambda p:json.loads(p.read_text());base=load(I/'game-config.before-values.json');c=load(I/'game-config.candidate.json');s=load(I/'option-values.json');source=load(G/'output/逃婚后我花千万雇了工地糙汉.v5.json')
assert c['valueDefinitions']==s['valueDefinitions'];keys={'favor','wisdom','courage'};assert {x['id'] for x in c['valueDefinitions']}==keys
original={(n['id'],o['id']):o for n in source['nodes'].values() for o in n.get('options',[])};authored={(x['choiceId'],x['optionId']):x for x in s['options']};assert len(original)==len(authored)==44 and set(original)==set(authored)
for k,o in authored.items():
 assert o['text']==original[k]['text'];assert set(o['value'])==keys
 assert all(type(v) is int and -2<=v<=2 for v in o['value'].values())
covered=set();clickable=0;locked=0;adchoices=0
for n in c['nodes']:
 for x in n['components']:
  match=[k for k in authored if x['componentId'].endswith('__'+k[0]+'_'+k[1])]
  if match and x['componentType']=='button1':
   k=match[0];assert x['value']==authored[k]['value'];covered.add(k);clickable+=1
   if x['unlockType']=='ad':adchoices+=1
  else:
   assert x['value'] is None,'Non-choice/locked component changes score'
   if match:locked+=1
assert covered==set(authored)
# Strip only the authorized value additions: everything else must remain byte-equivalent as data.
stripped=copy.deepcopy(c);stripped['valueDefinitions']=base['valueDefinitions'];stripped['meta']['configUpdatedAt']=base['meta']['configUpdatedAt']
for n in stripped['nodes']:
 for x in n['components']:x['value']=None
assert stripped==base,'Unrequested graph/media/UI changes'
assert len(c['nodes'])==78 and len({n['video']['url'] for n in c['nodes']})==69
report={'status':'passed','definitions':3,'uniqueOptions':44,'clickableOptionComponents':clickable,'lockedOptionComponentsWithoutValues':locked,'adChoiceComponents':adchoices,'mediaGraphAndEndingConditionsUnchanged':True,'nonChoiceComponentsWithoutValues':True,'settlementRuntimeTest':'not_run_requires_engine','configSha256':hashlib.sha256((I/'game-config.candidate.json').read_bytes()).hexdigest()}
(I/'verification.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n');print(json.dumps(report,ensure_ascii=False))
