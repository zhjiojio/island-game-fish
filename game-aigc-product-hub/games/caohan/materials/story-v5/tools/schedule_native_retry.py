import pathlib,json,hashlib,sys,copy
B=pathlib.Path(__file__).resolve().parents[1];pid,prompt_file=sys.argv[1:3]
def read(p):return json.loads((B/p).read_text())
def write(p,d):
 f=B/p;tmp=f.with_suffix('.tmp');tmp.write_text(json.dumps(d,ensure_ascii=False,indent=2)+'\n');tmp.replace(f)
ts=read('scripts/full-tasks.json');t=next(x for x in ts if x['partId']==pid);hist=read('review/full-task-history.json');hist.append(copy.deepcopy(t));root=pid.split('.r')[0];n=2
while (B/'requests'/(root+f'.r{n}.json')).exists():n+=1
new=root+f'.r{n}';r=json.loads(pathlib.Path(t['request']).read_text());r['prompt']=pathlib.Path(prompt_file).read_text()
if len(sys.argv)>3:r['durationSec']=int(sys.argv[3])
rp=B/'requests'/(new+'.json');rp.write_text(json.dumps(r,ensure_ascii=False,indent=2)+'\n');t.update(partId=new,request=str(rp),requestSha256=hashlib.sha256(rp.read_bytes()).hexdigest(),output=str(B/'video'/(new+'.mp4')),jobFile=str(B/'.cache/media-jobs'/(new+'.json')),durationSec=r['durationSec']);ds=read('review/full-keyframe-decisions.json');d=copy.deepcopy(next(x for x in ds if x['partId']==pid));assert d['sha256']==hashlib.sha256(pathlib.Path(t['keyframe']).read_bytes()).hexdigest();d['partId']=new;ds.append(d);write('scripts/full-tasks.json',ts);write('review/full-task-history.json',hist);write('review/full-keyframe-decisions.json',ds);print(new)
