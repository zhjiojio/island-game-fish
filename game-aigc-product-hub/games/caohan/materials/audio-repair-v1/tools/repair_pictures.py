import pathlib,json,subprocess,concurrent.futures
B=pathlib.Path(__file__).resolve().parents[1];WF='/Users/kwaibear/Documents/AIGCGame/game-aigc-workflow';rows=json.loads((B/'scripts/picture-repair-queue.json').read_text())
def run(r):
 if pathlib.Path(r['output']).exists():return
 print(r['partId'],'submitted',flush=True)
 p=subprocess.run(['python','-m','tools.make_videos.kling',r['request'],'--output',r['output'],'--job-file',r['jobFile'],'--timeout','1200'],cwd=WF,capture_output=True,text=True)
 print(r['partId'],'generated_pending_review' if p.returncode==0 else 'failed '+p.stderr[-500:],flush=True)
with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:list(pool.map(run,rows))
