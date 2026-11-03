import pathlib,json,re,difflib,subprocess
B=pathlib.Path(__file__).resolve().parents[1];D=json.loads((B/'scripts/sound-script-v1.json').read_text());OUT=[]
def norm(t):return re.sub(r'[^\u4e00-\u9fff0-9a-z]','',t.lower()).replace('妳','你')
def probe(p):return float(json.loads(subprocess.check_output(['ffprobe','-v','error','-show_entries','format=duration','-of','json',str(p)]))['format']['duration'])
for r in D['videos']:
 retained=[];new=[];issues=[];cursor=0
 alignment=B/'review'/(r['videoId']+'.original-alignment.json');chars=[];time=[]
 if alignment.exists():
  a=json.loads(alignment.read_text())
  for s in a['segments']:
   for w in s.get('words',[]):
    for c in norm(w['word']):chars.append(c);time.append((w['start'],w['end']))
 text=''.join(chars)
 for l in r['spokenLines']:
  if l['preferredRepair'] not in ['retain_original_voice_if_correct','check_original_voice_and_mouth']:continue
  if l['kind']=='vocal_action':retained.append({'lineId':l['lineId'],'speaker':l['speaker'],'text':l['text'],'start':4.7,'end':r['durationSec'],'confidence':'manual_cough_window'});continue
  q=norm(l['text']);pos=text.find(q,cursor)
  if pos>=0:best=(1.,pos,pos+len(q))
  else:
   best=(0.,0,0)
   for i in range(cursor,len(text)):
    for length in range(max(1,len(q)-3),len(q)+4):
     sub=text[i:i+length]
     if len(sub)<max(1,len(q)-3):continue
     score=difflib.SequenceMatcher(None,q,sub,autojunk=False).ratio()
     if score>best[0]:best=(score,i,i+len(sub))
  score,start,end=best
  if score<.73 or not time or end<=start:issues.append({'lineId':l['lineId'],'type':'alignment_uncertain','score':score,'text':l['text']});continue
  cursor=end;s=time[start][0];e=time[end-1][1]
  # Timestamp units can include silence. Never pad across adjacent speech into narration.
  prev=time[start-1][1] if start else 0;following=time[end][0] if end<len(time) else r['durationSec']
  s=max(prev,s-.045);e=min(following,e+.045)
  if r['videoId']=='ep09_branch_conditional_video_01' and l['text']=='好。':s=8.35
  # Audited boundaries: ASR misspells names; fuzzy matching must not discard them.
  overrides={
   'ep03_branch_counterattack_video_01__l01':(3.7,None),
   'ep03_branch_counterattack_video_01__l02':(None,19.06),
   'ep03_branch_counterattack_video_01__l03':(None,28.0),
   'ep07_branch_truth_video_01__l01':(4.65,None),
   'ep07_branch_counterattack_video_01__l01':(4.58,None),
   'ep02_branch_conditional_video_01__l02':(2.15,None),
  }
  if l['lineId'] in overrides:
   os,oe=overrides[l['lineId']];s=s if os is None else os;e=e if oe is None else oe
  retained.append({'lineId':l['lineId'],'speaker':l['speaker'],'text':l['text'],'heard':text[start:end],'start':round(s,3),'end':round(e,3),'alignmentScore':round(score,4)})
 narr_index=0
 for l in r['spokenLines']:
  if l['preferredRepair']!='new_offscreen_voice':continue
  audio=B/'audio'/(l['lineId']+'.mp3')
  if not audio.exists():issues.append({'lineId':l['lineId'],'type':'tts_missing'});continue
  dur=probe(audio);start=.4
  if r['videoId'].startswith('ending_'):
   if l['speaker']=='司仪':start=6.45
   elif l['kind']=='narration':
    if narr_index:start=r['durationSec']/2+.4
    narr_index+=1
  for old in retained:
   if start<old['end'] and start+dur>old['start']:start=old['end']+.25
  if start+dur>r['durationSec']-.1:issues.append({'lineId':l['lineId'],'type':'tts_does_not_fit','start':start,'duration':dur,'videoDuration':r['durationSec']})
  new.append({'lineId':l['lineId'],'speaker':l['speaker'],'kind':l['kind'],'text':l['text'],'audioFile':str(audio),'start':round(start,3),'end':round(start+dur,3)})
 OUT.append({'videoId':r['videoId'],'originalVideo':r['originalVideo'],'durationSec':r['durationSec'],'retainOriginalVoice':retained,'newVoice':new,'issues':issues,'status':'timeline_candidate_needs_listening'})
(B/'scripts/audio-timeline.json').write_text(json.dumps(OUT,ensure_ascii=False,indent=2)+'\n')
print('Timelines',len(OUT),'issues',sum(len(x['issues']) for x in OUT))
for r in OUT:
 for x in r['issues']:print(r['videoId'],x)
