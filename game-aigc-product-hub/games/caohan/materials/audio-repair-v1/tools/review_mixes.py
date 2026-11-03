import pathlib,json,sys,concurrent.futures,re,subprocess,time
from urllib.request import Request,urlopen
B=pathlib.Path(__file__).resolve().parents[1];sys.path.insert(0,'/Users/kwaibear/Documents/AIGCGame/game-aigc-workflow')
from tools.inspect_audio.voice import build_detection_payload,CHAT_URL
from tools.config.credentials import get_credential
key=get_credential('OPENROUTER_API_KEY')
def run(f):
 vid=f.name.removesuffix('.repaired.wav');out=B/'review'/(vid+'.mix-transcript.json')
 if out.exists():return
 temp=B/'review'/(vid+'.mix-review.mp3')
 if not temp.exists():subprocess.run(['ffmpeg','-v','error','-y','-i',str(f),'-ar','24000','-ac','1','-b:a','64k',str(temp)],check=True)
 payload=build_detection_payload(temp.read_bytes(),model=(sys.argv[1] if len(sys.argv)>1 else 'openai/gpt-audio'),audio_format='mp3');payload.pop('response_format',None);payload['messages'][0]['content'][0]['text']='独立逐字转写实际听到的全部中文人声。没有语言时 transcript 必须为空，不可根据配乐猜测台词。记录任何残留的低声/幽灵人声、被截断的字、爆音、配乐突变、明显机械音。不要把环境音当人声。只返回JSON：{"transcript":"原文","utterances":[{"speaker":"声线","text":"原文"}],"nonverbal":[],"issues":[],"uncertain":""}。'
 req=Request(CHAT_URL,data=json.dumps(payload).encode(),headers={'Authorization':'Bearer '+key,'Content-Type':'application/json'})
 for attempt in range(3):
  try:
   with urlopen(req,timeout=160) as r:body=json.loads(r.read())
   text=body['choices'][0]['message']['content'];result=json.loads(re.sub(r'^```(?:json)?\s*|\s*```$','',text.strip()));result['reviewModel']=payload['model'];out.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n');print(vid,json.dumps(result,ensure_ascii=False),flush=True);return
  except Exception as e:
   if attempt==2:print(vid,'review_error',type(e).__name__,flush=True)
   else:time.sleep(3)
with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:list(pool.map(run,sorted((B/'audio').glob('*.repaired.wav'))))
