import json,pathlib,re,hashlib
B=pathlib.Path(__file__).resolve().parents[1];G=B.parents[1]
S=json.loads(next((G/'output').glob('*.v4.json')).read_text())
NARRATION={
'ep02_branch_emotion':'这里没有信号，救援车也找不到她。',
'ep08_branch_truth':'那样的反应和身手，绝不是普通工人该有的。',
'ep08_branch_conditional':'他们刚回国的儿子，是个很厉害的人。',
'ep09_branch_truth':'她决定动用那张花旗黑卡。',
'ep10_branch_conditional':'这场偶遇，早已落进了别人的眼里。',
'ep11_scene_00':'她联系的人，是律师。',
}
ENDING={
'ending_loop':['每次逃婚，她都会回到最初那个夜晚。'],
'ending_streamer':['那场意外直播，让她成了连麦鉴渣的主播。','榜一大哥只留下一句话：下播，吃饭。'],
'ending_cow':['所有线索，竟然都指向了最初那杯牛奶。'],
'ending_terrace':['这一次，贺星冉没有动手。','他终于尝到了坠落的滋味。'],
'ending_reality_show':['婚约变成了恋综，决定权交给了观众。','而观众的选择是：让她独自出道。'],
'ending_empire':['她收购了许家、工地和婚庆公司。','这一次，逃婚也成了她的生意。'],
'ending_future':['原来，陈劲来自未来。','派他回来救她的，正是未来的她自己。'],
'ending_boss':['她买下了整个工地。'],
'ending_crane':['他们真的把婚礼办在了塔吊顶端。'],
'ending_worker':['许邵泽破产了。','他的新工作，是在陈劲的工地搬砖。'],
'ending_romance':[],
'ending_independent':['她拒绝了旧婚约，也没有急着走进下一段关系。','这一次，她先选择自己。'],
'ending_revenge':['证据全部公开，许家的谎言再也藏不住了。'],
'ending_regret':['她赢下了清算，却松开了那只伸向她的手。'],
}
ENDING_DIALOGUE={
'ending_loop':[('许邵泽','分手吧')],
'ending_boss':[('贺星冉','这次我雇的不是保镖，是合伙人。')],
'ending_romance':[('陈劲','回家吧。')],
'ending_crane':[('司仪','谁反对？')],
}
def clean(t):return re.sub(r'（[^）]*）|\([^)]*\)','',t).strip('"「」')
rows=[]
for folder in ['story-v4','story-v4-endings']:
 m=json.loads((G/'materials'/folder/'manifest.json').read_text())
 for v in m['videos']:
  nid=v.get('endingId') or v['videoId'].removesuffix('_video_01');n=S['nodes'][nid]
  raw=[{'sourceShotId':sh['id'],**l} for x in n.get('videos',[]) for sh in x['shots'] for l in sh.get('dialogue',[])]
  speech=[]
  for l in raw:
   if l['speaker']=='旁白' or not re.search(r'[\u4e00-\u9fffA-Za-z0-9]',l['text']):continue
   text=clean(l['text']);speech.append({'kind':'vocal_action' if '咳咳' in text else 'dialogue','speaker':l['speaker'],'text':text,'sourceShotId':l['sourceShotId'],'source':'original-character-line','lipSync':'on_screen','preferredRepair':'retain_original_voice_if_correct'})
  if nid=='ep04_branch_conditional':speech.append({'kind':'dialogue','speaker':'贺星冉','text':'你先洗澡，我在床上等你','source':'reclassified-quoted-dialogue','lipSync':'on_screen','preferredRepair':'check_original_voice_and_mouth'})
  if nid=='ep07_branch_conditional':speech.append({'kind':'dialogue','speaker':'周伯','text':'小伙子，初来乍到，有些规矩得跟你说清楚。','source':'reclassified-quoted-dialogue','lipSync':'off_screen','preferredRepair':'new_offscreen_voice'})
  for speaker,text in ENDING_DIALOGUE.get(nid,[]):speech.append({'kind':'dialogue','speaker':speaker,'text':text,'source':'ending-quoted-dialogue' if speaker!='司仪' else 'ending-indirect-speech-to-dialogue','lipSync':'off_screen' if speaker=='司仪' else 'on_screen','preferredRepair':'retain_original_voice_if_correct' if speaker!='司仪' else 'new_offscreen_voice'})
  for text in (ENDING.get(nid,[]) if n['type']=='ending' else ([NARRATION[nid]] if nid in NARRATION else [])):
   speech.append({'kind':'narration','speaker':'画外叙述者','text':text,'source':'editorial-sound-script','lipSync':'none','preferredRepair':'new_offscreen_voice'})
  for i,l in enumerate(speech,1):l['lineId']=v['videoId']+f'__l{i:02d}'
  row={'videoId':v['videoId'],'nodeId':nid,'title':n['title'],'originalVideo':str((G/'materials'/folder/v['path']).resolve()),'originalSha256':v['sha256'],'durationSec':v['durationSec'],'sourceParts':v['parts'],'sourceFolder':folder,'originalLines':raw,'spokenLines':speech,'visualOnly':[l for l in raw if l['speaker']=='旁白'],'reviewStatus':'sound_script_reviewed','picturePolicy':'preserve_original_frames_except_confirmed_mouth_error','stageDirectionsMustNotBeSpoken':True}
  assert hashlib.sha256(pathlib.Path(row['originalVideo']).read_bytes()).hexdigest()==row['originalSha256']
  rows.append(row)
(B/'scripts/sound-script-v1.json').write_text(json.dumps({'sourceSha256':hashlib.sha256(next((G/'output').glob('*.v4.json')).read_bytes()).hexdigest(),'videoCount':len(rows),'videos':rows},ensure_ascii=False,indent=2)+'\n')
text=['# 全片声音修订表','画面指令不发声；原角色对白保留；引号内角色台词纠正归属。以下为声音脚本；最终成片状态与文件哈希以 manifest.json 和 review/delivery-verification.json 为准。','']
for r in rows:
 text+=['## '+r['videoId']+' · '+r['title']]+[f'- {l["kind"]} / {l["speaker"]}：{l["text"]}' for l in r['spokenLines']]
 if not r['spokenLines']:text+=['- 无语言对白；保留环境音、配乐及合理的非语言反应。']
 text+=['']
(B/'scripts/sound-script-v1.md').write_text('\n'.join(text));print('Reviewed scripts:',len(rows),'videos;',sum(len(r['spokenLines']) for r in rows),'sound lines;',sum(not r['spokenLines'] for r in rows),'without verbal speech')
