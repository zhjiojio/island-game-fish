import pathlib,json
B=pathlib.Path(__file__).resolve().parents[1];S=B/'../../output/逃婚后我花千万雇了工地糙汉.v5.json';s=json.loads(S.read_text());a=['# v5 无解说声音与表演稿','','69 条全量制作已获用户授权。此稿从当前 v5 JSON 生成；实际成片审核状态见 ../review/full-delivery.json。','新增对白属于无解说改编；声音仅限人物对白、实际录音/电话和场景声。运镜与动作不发声。','']
for n in s['nodes'].values():
 for v in n.get('videos',[]):
  a+=['## '+v['id']+' '+v.get('title',''),'']
  for sh in v['shots']:
   a+=['镜头 '+str(sh['order'])+' · '+str(sh['durationSec'])+' 秒',sh['visual']['videoPrompt'],'']
   a+=['- '+d['speaker']+'（'+d['delivery']+'）：'+d['text'] for d in sh['dialogue']] or ['- 无语言；仅场景声和合理非语言反应。']
   a+=['']
(B/'scripts/story-v5-review.md').write_text('\n'.join(a)+'\n')
