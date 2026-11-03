"""Resume native tasks; never submit without a matching reviewed frame hash."""
import pathlib,json,sys,subprocess,hashlib,concurrent.futures,time
B=pathlib.Path(__file__).resolve().parents[1];WF=B.parent.parent.parents[2]/'game-aigc-workflow';mode=sys.argv[1]
def perform(t):
 pid=t['partId'];out=pathlib.Path(t['output'])
 if out.exists():return pid,'existing'
 if mode=='images':cmd=[sys.executable,'-m','tools.make_images',t['request'],'--output',str(out)]
 else:
  assert hashlib.sha256(pathlib.Path(t['request']).read_bytes()).hexdigest()==t['requestSha256']
  cmd=[sys.executable,'-m','tools.make_videos',t['request'],'--job-file',t['jobFile'],'--output',str(out),'--timeout','1500','--poll-interval','15']
 for attempt in range(3 if mode=='videos' else 1):
  r=subprocess.run(cmd,cwd=WF,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
  if r.returncode==0:
   try:artifact=json.loads(r.stdout.strip().splitlines()[-1])
   except Exception:artifact={'path':str(out),'status':'generated'}
   (B/'review'/(pid+'.'+mode+'-generation.json')).write_text(json.dumps(artifact,ensure_ascii=False,indent=2)+'\n');return pid,'generated'
  (B/'review'/(pid+'.'+mode+'-error.txt')).write_text(r.stderr[-2000:]);print(pid,mode,'attempt_failed',r.stderr[-150:].replace('\n',' '),flush=True)
  if mode=='images':break
  j=pathlib.Path(t['jobFile'])
  if j.exists() and json.loads(j.read_text()).get('status')=='failed':break
  time.sleep(20)
 return pid,'failed'
if mode=='images':
 tasks=json.loads((B/'scripts/full-image-tasks.json').read_text())
 with concurrent.futures.ThreadPoolExecutor(max_workers=2) as ex:
  for pid,status in ex.map(perform,tasks):print(pid,status,flush=True)
else:
 attempted=set();active={};start=time.monotonic()
 with concurrent.futures.ThreadPoolExecutor(max_workers=2) as ex:
  while True:
   tasks=json.loads((B/'scripts/full-tasks.json').read_text());dp=B/'review/full-keyframe-decisions.json';ds={x['partId']:x for x in json.loads(dp.read_text())} if dp.exists() else {}
   for f in list(active):
    if f.done():
     pid,status=f.result();print(pid,status,flush=True);del active[f]
   for t in tasks:
    pid=t['partId']
    if pid in attempted or pathlib.Path(t['output']).exists():continue
    d=ds.get(pid)
    if not d or d['status']!='approved_for_generation':continue
    if hashlib.sha256(pathlib.Path(t['keyframe']).read_bytes()).hexdigest()!=d['sha256']:raise RuntimeError('Reviewed frame changed: '+pid)
    if len(active)>=2:break
    attempted.add(pid);active[ex.submit(perform,t)]=pid;print(pid,'submitted_or_resuming',flush=True)
   if not active and all(pathlib.Path(t['output']).exists() or t['partId'] in attempted for t in tasks):break
   if time.monotonic()-start>18000:raise RuntimeError('Production monitor deadline; resume same task checkpoints')
   time.sleep(5)
