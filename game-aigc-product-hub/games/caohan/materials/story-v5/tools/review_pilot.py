import pathlib,json,subprocess,sys,concurrent.futures,re,hashlib,cv2,shutil
from PIL import Image,ImageDraw
from urllib.request import Request,urlopen
B=pathlib.Path(__file__).resolve().parents[1];WF=B.parent.parent.parents[2]/'game-aigc-workflow';sys.path.insert(0,str(WF))
from tools.inspect_audio.voice import build_detection_payload,CHAT_URL
from tools.config.credentials import get_credential
T=json.loads((pathlib.Path(sys.argv[1]) if len(sys.argv)>1 else B/'scripts/pilot-tasks.json').read_text())
def run(t):
 p=pathlib.Path(t['output']);pid=t['partId']
 if not p.exists():return
 cached=B/'review'/(pid+'.technical.json')
 digest=hashlib.sha256(p.read_bytes()).hexdigest()
 previous=json.loads(cached.read_text()).get('sha256') if cached.exists() else None
 if previous and previous!=digest:
  archive=B/'review/history'/pid/previous[:16];archive.mkdir(parents=True,exist_ok=True)
  for suffix in ('.technical.json','.frames.jpg','.audio-review.json','.mp3'):
   old=B/'review'/(pid+suffix)
   if old.exists():shutil.move(str(old),str(archive/old.name))
 if cached.exists() and (B/'review'/(pid+'.frames.jpg')).exists() and (B/'review'/(pid+'.audio-review.json')).exists() and json.loads(cached.read_text()).get('sha256')==hashlib.sha256(p.read_bytes()).hexdigest():return
 q=json.loads(subprocess.check_output(['ffprobe','-v','error','-show_streams','-show_format','-of','json',str(p)]));d=float(q['format']['duration']);audio=any(x['codec_type']=='audio' for x in q['streams']);tech={'partId':pid,'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'durationSec':d,'hasAudio':audio,'expectedDurationSec':t['durationSec']};assert abs(d-t['durationSec'])<.15 and audio;subprocess.run(['ffmpeg','-v','error','-xerror','-i',str(p),'-f','null','-'],check=True)
 (B/'review'/(pid+'.technical.json')).write_text(json.dumps(tech,indent=2)+'\n')
 sheet=Image.new('RGB',(1600,420),'white');draw=ImageDraw.Draw(sheet);cap=cv2.VideoCapture(str(p))
 for j in range(8):
  ts=min(d-.1,(j+.3)*d/8);cap.set(cv2.CAP_PROP_POS_MSEC,ts*1000);ok,a=cap.read()
  if ok:
   im=Image.fromarray(cv2.cvtColor(a,cv2.COLOR_BGR2RGB));im.thumbnail((196,370));sheet.paste(im,(j*200,25));draw.text((j*200,3),f'{ts:.1f}s',fill='black')
 sheet.save(B/'review'/(pid+'.frames.jpg'))
 out=B/'review'/(pid+'.audio-review.json')
 if out.exists():return
 f=B/'review'/(pid+'.wav');subprocess.run(['ffmpeg','-v','error','-y','-i',str(p),'-vn','-ar','16000','-ac','1','-c:a','pcm_s16le',str(f)],check=True)
 payload=build_detection_payload(f.read_bytes(),model='openai/gpt-audio',audio_format='wav');payload.pop('response_format',None);payload['messages'][0]['content'][0]['text']='Transcribe every spoken Chinese word in this audio exactly as heard, with no paraphrasing. Return JSON with transcript (string), utterances (speaker and text), nonverbal (sound events), issues, uncertain. Use female/male for speakers only when audible. Do not invent words.'
 try:
  with urlopen(Request(CHAT_URL,data=json.dumps(payload).encode(),headers={'Authorization':'Bearer '+get_credential('OPENROUTER_API_KEY'),'Content-Type':'application/json'}),timeout=150) as r:body=json.loads(r.read())
  raw=body['choices'][0]['message']['content']
  match=re.search(r'\{.*\}',raw,re.S)
  parsed=json.loads(match.group(0)) if match else None
  if not isinstance(parsed,dict) or not isinstance(parsed.get('transcript'),str):
   (B/'review'/(pid+'.audio-review-invalid.txt')).write_text(raw)
   raise ValueError('Audio service returned no valid transcript object')
  out.write_text(json.dumps(parsed,ensure_ascii=False,indent=2)+'\n');print(pid,parsed,flush=True)
 except Exception as e:
  print(pid,'review_error',type(e).__name__,flush=True)
  try:
   q=subprocess.run([sys.executable,str(B/'tools/transcribe_stt.py'),pid,'qwen/qwen3-asr-1.7b'],cwd=B,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
   sp=B/'review'/(pid+'.stt-qwen3-asr-1.7b.json')
   if q.returncode==0 and sp.exists():
    result=json.loads(sp.read_text());assert isinstance(result.get('text'),str)
    out.write_text(json.dumps({'transcript':result['text'],'utterances':[],'nonverbal':None,'issues':[],'uncertain':'Dedicated STT fallback: speaker identity and nonverbal sounds require separate review.','provenance':sp.name},ensure_ascii=False,indent=2)+'\n');print(pid,'stt_fallback',result['text'],flush=True)
  except Exception as fallback_error:print(pid,'stt_fallback_error',type(fallback_error).__name__,flush=True)
with concurrent.futures.ThreadPoolExecutor(max_workers=2) as ex:list(ex.map(run,T))
