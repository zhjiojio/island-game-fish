import pathlib,json,sys,subprocess
from urllib.request import Request,urlopen
B=pathlib.Path(__file__).resolve().parents[1];sys.path.insert(0,str(B.parent.parent.parents[2]/'game-aigc-workflow'))
from tools.inspect_audio.voice import build_detection_payload,CHAT_URL
from tools.config.credentials import get_credential
for pid in sys.argv[1:]:
 f=B/'review'/(pid+'.mp3')
 if not f.exists(): subprocess.run(['ffmpeg','-v','error','-y','-i',str(B/'video'/(pid+'.mp4')),'-vn','-ar','24000','-ac','1',str(f)],check=True)
 p=build_detection_payload(f.read_bytes(),model='mistralai/voxtral-small-24b-2507',audio_format='mp3');p.pop('response_format',None);p['messages'][0]['content'][0]['text']='Transcribe every actually spoken syllable in Chinese verbatim, without normalizing or expanding forms of address. Also transcribe the first second separately, in pinyin, and count its audible spoken syllables. Return JSON transcript, beginningPinyin, beginningSyllableCount, uncertainty.'
 with urlopen(Request(CHAT_URL,data=json.dumps(p).encode(),headers={'Authorization':'Bearer '+get_credential('OPENROUTER_API_KEY'),'Content-Type':'application/json'}),timeout=150) as r:d=json.loads(r.read())
 s=d['choices'][0]['message']['content'];(B/'review'/(pid+'.syllable-crosscheck.json')).write_text(s);print(pid,s,flush=True)
