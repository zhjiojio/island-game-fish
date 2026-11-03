import pathlib,json,sys,concurrent.futures,re
from urllib.request import Request,urlopen
B=pathlib.Path(__file__).resolve().parents[1];sys.path.insert(0,'/Users/kwaibear/Documents/AIGCGame/game-aigc-workflow')
from tools.inspect_audio.voice import build_detection_payload,CHAT_URL
from tools.config.credentials import get_credential
key=get_credential('OPENROUTER_API_KEY')
def run(f):
 out=B/'review'/(f.stem+'.tts-review.json')
 if out.exists():return
 payload=build_detection_payload(f.read_bytes(),model=(sys.argv[1] if len(sys.argv)>1 else 'openai/gpt-audio'),audio_format='mp3');payload.pop('response_format',None);payload['messages'][0]['content'][0]['text']='请独立逐字转写实际听到的中文人声，不补全听不见的字。同时评价是否有吞字、异常断句、金属音或明显不自然。只返回JSON：{"transcript":"实际听见的原文","voice":"声线描述","issues":[],"uncertain":""}。'
 req=Request(CHAT_URL,data=json.dumps(payload).encode(),headers={'Authorization':'Bearer '+key,'Content-Type':'application/json'})
 try:
  with urlopen(req,timeout=150) as r:body=json.loads(r.read())
  text=body['choices'][0]['message']['content'];result=json.loads(re.sub(r'^```(?:json)?\s*|\s*```$','',text.strip()));result['reviewModel']=payload['model'];out.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n');print(f.stem,result,flush=True)
 except Exception as e:print(f.stem,'review_error',type(e).__name__,flush=True)
with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:list(pool.map(run,sorted((B/'audio').glob('*__l*.mp3'))))
