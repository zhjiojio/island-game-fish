import pathlib,sys,json
from urllib.request import Request,urlopen
B=pathlib.Path(__file__).resolve().parents[1];sys.path.insert(0,str(B.parent.parent.parents[2]/'game-aigc-workflow'))
from tools.inspect_audio.voice import build_detection_payload,CHAT_URL
from tools.config.credentials import get_credential
pid=sys.argv[1];f=B/'review'/(pid+'.mp3');payload=build_detection_payload(f.read_bytes(),model='mistralai/voxtral-small-24b-2507',audio_format='mp3');payload.pop('response_format',None);payload['messages'][0]['content'][0]['text']='独立逐字转写全部可听人声，特别保留开头、末尾，不补全听不清的词；没有语言则为空。返回JSON transcript、uncertain。'
with urlopen(Request(CHAT_URL,data=json.dumps(payload).encode(),headers={'Authorization':'Bearer '+get_credential('OPENROUTER_API_KEY'),'Content-Type':'application/json'}),timeout=150) as r:d=json.loads(r.read())
s=d['choices'][0]['message']['content'];(B/'review'/(pid+'.crosscheck.json')).write_text(s);print(s)
