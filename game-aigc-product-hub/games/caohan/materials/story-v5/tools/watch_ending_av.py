import pathlib,json,time,sys,subprocess,concurrent.futures
B=pathlib.Path(__file__).resolve().parents[1];attempted=set();active={};start=time.monotonic()
def review(t):
 pid=t['partId'];r=subprocess.run([sys.executable,str(B/'tools/review_av.py'),pid],cwd=B,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True);print(pid,'av_ready' if r.returncode==0 else 'av_error '+r.stderr[-180:].replace('\n',' '),flush=True)
with concurrent.futures.ThreadPoolExecutor(max_workers=2) as ex:
 while time.monotonic()-start<14000:
  ts=[t for t in json.loads((B/'scripts/full-tasks.json').read_text()) if t['videoId'].startswith('ending_')]
  for f in list(active):
   if f.done():f.result();del active[f]
  for t in ts:
   pid=t['partId']
   if pid in attempted or (B/'review'/(pid+'.av-review.json')).exists() or not pathlib.Path(t['output']).exists():continue
   if len(active)>=2:break
   attempted.add(pid);active[ex.submit(review,t)]=pid
  if not active and all(t['partId'] in attempted or (B/'review'/(t['partId']+'.av-review.json')).exists() for t in ts):break
  time.sleep(15)
