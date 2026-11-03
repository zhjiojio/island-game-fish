"""Record an explicitly reviewed corrected frame; optionally schedule a native retry."""
import pathlib,json,hashlib,sys,copy
B=pathlib.Path(__file__).resolve().parents[1]
def read(p,default=[]):return json.loads((B/p).read_text()) if (B/p).exists() else default
def write(p,v):
 target=B/p;tmp=target.with_suffix(target.suffix+'.tmp');tmp.write_text(json.dumps(v,ensure_ascii=False,indent=2)+'\n');tmp.replace(target)
tasks=read('scripts/full-tasks.json');ds=read('review/full-keyframe-decisions.json');history=read('review/full-task-history.json');frame_history=read('review/full-keyframe-history.json');jobs={x['basePartId']:x for x in read('scripts/full-image-retry-tasks.json')};overrides=read('scripts/full-video-overrides.json',{})
for pid in sys.argv[1:]:
 t=next(t for t in tasks if t['partId']==pid);job=jobs[pid];frame=pathlib.Path(job['output']);assert frame.exists();h=hashlib.sha256(frame.read_bytes()).hexdigest();history.append(copy.deepcopy(t));oldpid=t['partId'];newpid=pid
 if pathlib.Path(t['output']).exists():
  root=pid.split('.r')[0];revision=2
  while (B/'requests'/(root+f'.r{revision}.json')).exists():revision+=1
  newpid=root+f'.r{revision}'
 original_request=pathlib.Path(t['request']);r=json.loads(original_request.read_text());r['image']=str(frame);r['durationSec']=t['durationSec']
 if pid in overrides:r['prompt']=overrides[pid]
 rp=B/'requests'/(newpid+'.json')
 if newpid==oldpid:
  backup=B/'requests'/(oldpid+'.before-frame-r2.json')
  if not backup.exists():backup.write_text(original_request.read_text())
 rp.write_text(json.dumps(r,ensure_ascii=False,indent=2)+'\n');t.update(partId=newpid,request=str(rp),requestSha256=hashlib.sha256(rp.read_bytes()).hexdigest(),keyframe=str(frame),output=str(B/'video'/(newpid+'.mp4')),jobFile=str(B/'.cache/media-jobs'/(newpid+'.json')),frameRevision='r2')
 for d in ds:
  if d['partId']==newpid:frame_history.append(d)
 ds=[d for d in ds if d['partId']!=newpid];ds.append({'partId':newpid,'sha256':h,'status':'approved_for_generation','evidence':'keyframes/'+frame.name,'decision':'已人工查看r2修正图，服装、指定人物身份与静态起始位置通过；仅此SHA允许进入原生生成。'})
write('review/full-task-history.json',history);write('review/full-keyframe-history.json',frame_history);write('scripts/full-tasks.json',tasks);write('review/full-keyframe-decisions.json',ds);print('Accepted corrected frames:',sys.argv[1:])
