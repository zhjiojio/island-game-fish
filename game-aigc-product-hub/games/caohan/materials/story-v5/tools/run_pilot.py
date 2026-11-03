import pathlib,json,subprocess,concurrent.futures,hashlib,time,sys
B=pathlib.Path(__file__).resolve().parents[1];WF=B.parent.parent.parents[2]/'game-aigc-workflow';tasks=json.loads((B/'scripts/pilot-tasks.json').read_text())
def run(t):
 p=pathlib.Path(t['request']);assert hashlib.sha256(p.read_bytes()).hexdigest()==t['requestSha256'];out=pathlib.Path(t['output']);job=pathlib.Path(t['jobFile']);job.parent.mkdir(parents=True,exist_ok=True)
 if out.exists():print(t['partId'],'existing_candidate',flush=True);return
 for attempt in range(3):
  result=subprocess.run([sys.executable,'-m','tools.make_videos',str(p),'--job-file',str(job),'--output',str(out),'--timeout','1500','--poll-interval','15'],cwd=WF,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
  if result.returncode==0:
   try:r=json.loads(result.stdout.strip().splitlines()[-1])
   except Exception:r={'status':'generated'}
   (B/'review'/(t['partId']+'.generation.json')).write_text(json.dumps(r,ensure_ascii=False,indent=2)+'\n');print(t['partId'],'generated',flush=True);return
  message=result.stderr[-1500:];(B/'review'/(t['partId']+'.generation-error.txt')).write_text(message)
  print(t['partId'],'generation_failed',message[-200:].replace('\n',' '),flush=True)
  if job.exists() and json.loads(job.read_text()).get('status')=='failed':return
  if attempt<2:time.sleep(25)
with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:list(pool.map(run,tasks))
