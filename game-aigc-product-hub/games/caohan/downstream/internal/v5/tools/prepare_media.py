import concurrent.futures,hashlib,json,pathlib,shutil,subprocess
I=pathlib.Path(__file__).resolve().parents[1];G=I.parents[2];B=G/'materials/story-v5'
items=json.loads((B/'review/full-delivery.json').read_text());assert len(items)==69
stage=I/'.cdn-stage/assets';stage.mkdir(parents=True,exist_ok=True)
def one(x):
 p=pathlib.Path(x['path']);assert hashlib.sha256(p.read_bytes()).hexdigest()==x['sha256']
 name=x['videoId']+'.v5.'+x['sha256'][:12];v=stage/(name+'.mp4')
 if not v.exists():shutil.copy2(p,v)
 frames=[]
 for kind,at in [('first',0),('end',max(0,x['durationSec']-.12))]:
  q=stage/(name+'.'+kind+'.jpg')
  if not q.exists():subprocess.run(['ffmpeg','-v','error','-y','-ss',str(at),'-i',str(p),'-frames:v','1','-q:v','3',str(q)],check=True)
  frames.append(str(q))
 return dict(videoId=x['videoId'],sha256=x['sha256'],durationSec=x['durationSec'],videoFile=str(v),firstFrameFile=frames[0],endFrameFile=frames[1])
with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:result=list(pool.map(one,items))
(I/'media-upload-manifest.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
print('Prepared',len(result),'videos and',2*len(result),'frames')
