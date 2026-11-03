import pathlib,json,torch,whisper,sys
B=pathlib.Path(__file__).resolve().parents[1];torch.set_num_threads(4);m=whisper.load_model('small',device='cpu');rows=json.loads((B/'scripts/sound-script-v1.json').read_text())['videos']
rows=sorted(rows,key=lambda r:(r['videoId']!='ep01_branch_truth_video_01',r['durationSec']))
for r in rows:
 if not any(l['preferredRepair'] in ['retain_original_voice_if_correct','check_original_voice_and_mouth'] for l in r['spokenLines']):continue
 out=B/'review'/(r['videoId']+'.original-alignment.json')
 if out.exists():continue
 result=m.transcribe(str(B/'audio'/(r['videoId']+'.original.wav')),language='zh',fp16=False,word_timestamps=True,temperature=0,condition_on_previous_text=False,verbose=None)
 out.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n');print(r['videoId'],result['text'],flush=True)
