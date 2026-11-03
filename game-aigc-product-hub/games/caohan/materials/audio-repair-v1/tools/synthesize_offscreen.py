import pathlib,json,sys,concurrent.futures,time
B=pathlib.Path(__file__).resolve().parents[1];WF=pathlib.Path('/Users/kwaibear/Documents/AIGCGame/game-aigc-workflow');sys.path.insert(0,str(WF))
from tools.voice_clone.contract import load_provider_env
from tools.voice_clone.cli import post_json,atomic_write
from tools.voice_clone.providers.minimax import build_tts_payload,decode_tts_response
E=pathlib.Path('/Users/kwaibear/Documents/AIGCGame/ks658369973696011353/.secrets/voice-providers.env');key=load_provider_env(E)['MINIMAX_API_KEY']
D=json.loads((B/'scripts/sound-script-v1.json').read_text());lines=[l for r in D['videos'] for l in r['spokenLines'] if l['preferredRepair']=='new_offscreen_voice']
def run(l):
 out=B/'audio'/ (l['lineId']+'.mp3');voice='female-chengshu' if l['kind']=='narration' else ('Chinese (Mandarin)_Reliable_Executive' if l['speaker']=='周伯' else 'male-qn-jingying');meta={'lineId':l['lineId'],'provider':'minimax','voiceId':voice,'voiceType':'system-tts-not-cloned','model':'speech-2.8-hd','text':l['text'],'status':'generated_pending_audio_review'}
 if not out.exists():
  payload=build_tts_payload(voice,l['text'],'neutral','speech-2.8-hd')
  for attempt in range(8):
   try:
    body=post_json('https://api.minimaxi.com/v1/t2a_v2',payload,key);atomic_write(out,decode_tts_response(body));break
   except Exception as e:
    if 'rate limit' not in str(e).lower() or attempt==7:raise
    print(l['lineId'],'rate_limited_waiting',flush=True);time.sleep(30)
  time.sleep(12)
 (B/'requests'/(l['lineId']+'.tts.json')).write_text(json.dumps(meta,ensure_ascii=False,indent=2)+'\n');print(l['lineId'],'generated',flush=True)
with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:list(pool.map(run,lines))
