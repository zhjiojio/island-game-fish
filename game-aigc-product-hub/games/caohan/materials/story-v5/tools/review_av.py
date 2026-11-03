"""Independent audiovisual review of the actual native MP4, without expected dialogue."""
import pathlib,json,sys,base64,hashlib,re,subprocess
from urllib.request import Request,urlopen
B=pathlib.Path(__file__).resolve().parents[1];sys.path.insert(0,str(B.parent.parent.parents[2]/'game-aigc-workflow'))
from tools.config.credentials import get_credential
for pid in sys.argv[1:]:
 f=B/'video'/(pid+'.mp4');duration=float(subprocess.check_output(['ffprobe','-v','error','-show_entries','format=duration','-of','default=nw=1:nk=1',str(f)]));p={'model':'google/gemini-2.5-flash','temperature':0,'max_tokens':2000,'messages':[{'role':'user','content':[{'type':'text','text':f'视频实际时长只有{duration:.2f}秒，时间必须在这个范围，禁止描述片外内容。请同时观看并听这段视频，独立审核音画。逐字转写实际中文对白（不补词不规范化称呼），逐句指出声源：画面中谁实际开口、位置/衣服/年龄特征，或手机/场外声音；给大致时段。特别区分真正跟随声音发音和偶尔自然表情张嘴。检查是否有错误人物同步代说、额外旁白/运镜念白/乱码字幕，列可听环境音。不要根据剧情推断未见事件。无法判断请明确。持续背景声合并为一项，不逐帧重复。口型证据用短句描述，不虚构文件名。只返回JSON transcript,utterances[{{startSec,endSec,text,audibleVoice,visibleSpeaker,mouthSyncEvidence}}],nonverbal,issues,uncertain。'},{'type':'video_url','video_url':{'url':'data:video/mp4;base64,'+base64.b64encode(f.read_bytes()).decode()}}]}]}
 with urlopen(Request('https://openrouter.ai/api/v1/chat/completions',data=json.dumps(p).encode(),headers={'Authorization':'Bearer '+get_credential('OPENROUTER_API_KEY'),'Content-Type':'application/json'}),timeout=180) as r:d=json.load(r)
 raw=d['choices'][0]['message']['content'];m=re.search(r'\{.*\}',raw,re.S)
 try:parsed=json.loads(m.group(0)) if m else {'raw':raw}
 except Exception:parsed={'raw':raw}
 result={'partId':pid,'sourceSha256':hashlib.sha256(f.read_bytes()).hexdigest(),'model':p['model'],'review':parsed};(B/'review'/(pid+'.av-review.json')).write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n');print(pid,json.dumps(parsed,ensure_ascii=False),flush=True)
