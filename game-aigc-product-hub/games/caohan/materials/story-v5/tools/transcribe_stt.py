"""Blind dedicated STT; no expected script is sent to recognizer."""
import pathlib,json,sys,base64,subprocess
from urllib.request import Request,urlopen
B=pathlib.Path(__file__).resolve().parents[1];sys.path.insert(0,str(B.parent.parent.parents[2]/'game-aigc-workflow'))
from tools.config.credentials import get_credential
pid=sys.argv[1];model=sys.argv[2] if len(sys.argv)>2 else 'openai/whisper-large-v3';f=B/'review'/(pid+'.mp3')
if not f.exists():subprocess.run(['ffmpeg','-v','error','-y','-i',str(B/'video'/(pid+'.mp4')),'-vn','-ar','24000','-ac','1',str(f)],check=True)
p={'model':model,'input_audio':{'data':base64.b64encode(f.read_bytes()).decode(),'format':'mp3'},'language':'zh','temperature':0}
with urlopen(Request('https://openrouter.ai/api/v1/audio/transcriptions',data=json.dumps(p).encode(),headers={'Authorization':'Bearer '+get_credential('OPENROUTER_API_KEY'),'Content-Type':'application/json'}),timeout=150) as r:d=json.load(r)
(B/'review'/(pid+'.stt-'+model.split('/')[-1]+'.json')).write_text(json.dumps(d,ensure_ascii=False,indent=2)+'\n');print(pid,model,d.get('text'),flush=True)
