import pathlib,json,sys,subprocess
from urllib.request import Request,urlopen
b=pathlib.Path('/Users/kwaibear/Documents/AIGCGame/game-aigc-product-hub/games/caohan/materials/story-v5');sys.path.insert(0,'/Users/kwaibear/Documents/AIGCGame/game-aigc-workflow')
from tools.inspect_audio.voice import build_detection_payload,CHAT_URL
from tools.config.credentials import get_credential
for pid in sys.argv[1:]:
 f=b/'review'/(pid+'.wav');subprocess.run(['ffmpeg','-v','error','-y','-i',str(b/'video'/(pid+'.mp4')),'-vn','-ar','16000','-ac','1','-c:a','pcm_s16le',str(f)],check=True)
 p=build_detection_payload(f.read_bytes(),model='openai/gpt-audio',audio_format='wav');p.pop('response_format',None);p['messages'][0]['content'][0]['text']='Transcribe every spoken Chinese word in this audio, exactly as heard. Return only the verbatim Chinese transcript. Do not paraphrase.'
 with urlopen(Request(CHAT_URL,data=json.dumps(p).encode(),headers={'Authorization':'Bearer '+get_credential('OPENROUTER_API_KEY'),'Content-Type':'application/json'}),timeout=150) as r:d=json.loads(r.read())
 s=d['choices'][0]['message']['content'];(b/'review'/(pid+'.wav-crosscheck.txt')).write_text(s);print(pid,s,flush=True)
