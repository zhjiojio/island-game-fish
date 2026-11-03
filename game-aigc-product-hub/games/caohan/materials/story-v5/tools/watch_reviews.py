"""Continuously prepare technical/frame/audio evidence; never mark videos approved."""
import pathlib,json,time,subprocess,sys,hashlib
B=pathlib.Path(__file__).resolve().parents[1];attempted={};start=time.monotonic()
while time.monotonic()-start<18000:
 tasks=json.loads((B/'scripts/full-tasks.json').read_text());pending=[]
 for t in tasks:
  p=pathlib.Path(t['output']);pid=t['partId']
  if not p.exists():continue
  digest=hashlib.sha256(p.read_bytes()).hexdigest();key=(pid,digest)
  if (B/'review'/(pid+'.audio-review.json')).exists() and (B/'review'/(pid+'.technical.json')).exists():continue
  if attempted.get(key,0)>=2:continue
  attempted[key]=attempted.get(key,0)+1;pending.append(t)
 if pending:
  f=B/'review/auto-review-tasks.json';f.write_text(json.dumps(pending,ensure_ascii=False,indent=2)+'\n')
  subprocess.run([sys.executable,str(B/'tools/review_pilot.py'),str(f)],cwd=B)
 if all(pathlib.Path(t['output']).exists() for t in tasks) and not pending:break
 time.sleep(15)
