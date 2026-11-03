import pathlib,json,sys,subprocess,time
B=pathlib.Path(__file__).resolve().parents[1];WF=B.parent.parent.parents[2]/'game-aigc-workflow';jobs=json.loads((B/'scripts/full-image-retry-tasks.json').read_text())+json.loads((B/'scripts/full-image-tasks.json').read_text())
for t in jobs:
 out=pathlib.Path(t['output']);pid=t['partId']
 if out.exists():continue
 for attempt in range(2):
  r=subprocess.run([sys.executable,'-m','tools.make_images',t['request'],'--output',str(out)],cwd=WF,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
  if r.returncode==0:
   try:a=json.loads(r.stdout.strip().splitlines()[-1])
   except Exception:a={'path':str(out),'status':'generated'}
   (B/'review'/(pid+'.images-generation.json')).write_text(json.dumps(a,ensure_ascii=False,indent=2)+'\n');print(pid,'generated',flush=True);break
  (B/'review'/(pid+'.images-error.txt')).write_text(r.stderr[-2000:]);print(pid,'failed',r.stderr[-180:].replace('\n',' '),flush=True)
  if '429' not in r.stderr:break
  if attempt==1:raise RuntimeError('Repeated image rate limit; batch paused, no further image requests')
  time.sleep(60)
 time.sleep(10)
