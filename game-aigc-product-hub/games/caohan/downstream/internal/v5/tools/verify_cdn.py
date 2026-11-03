import concurrent.futures,hashlib,json,pathlib,time,urllib.request
I=pathlib.Path(__file__).resolve().parents[1]
r=json.loads((I/'reports/cdn-upload-receipt.json').read_text());files=r['files'];assert len(files)==207
urls={pathlib.Path(x['local']).name:x['cdnUrl'] for x in files};assert len(urls)==207
manifest=json.loads((I/'media-upload-manifest.json').read_text())
for x in manifest:
 for filekey,urlkey in [('videoFile','url'),('firstFrameFile','firstFrameUrl'),('endFrameFile','endFrameUrl')]:x[urlkey]=urls[pathlib.Path(x[filekey]).name]
(I/'media-cdn-manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
def verify(x):
 local=pathlib.Path(x['local']);expected=hashlib.sha256(local.read_bytes()).hexdigest()
 for attempt in range(3):
  try:
   req=urllib.request.Request(x['cdnUrl'],headers={'User-Agent':'caohan-media-verification/1'})
   h=hashlib.sha256();size=0
   with urllib.request.urlopen(req,timeout=120) as response:
    assert response.status==200
    while True:
     data=response.read(1024*1024)
     if not data:break
     h.update(data);size+=len(data)
   assert h.hexdigest()==expected and size==local.stat().st_size
   return dict(file=local.name,url=x['cdnUrl'],sha256=expected,bytes=size,status='verified')
  except Exception:
   if attempt==2:raise
   time.sleep(5)
results=[]
with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
 for result in pool.map(verify,files):
  results.append(result)
  if len(results)%25==0:print('Verified',len(results),'/',len(files),flush=True)
(I/'reports/cdn-verification.json').write_text(json.dumps(dict(status='passed',count=len(results),files=results),ensure_ascii=False,indent=2)+'\n')
print('All CDN bytes verified',len(results),flush=True)
