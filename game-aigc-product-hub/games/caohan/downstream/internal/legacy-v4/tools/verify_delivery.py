import json,pathlib,hashlib,urllib.request,concurrent.futures,time
I=pathlib.Path(__file__).resolve().parents[1]
D=I.parent
def write(name,data):(I/'reports'/name).write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n')
def verify(v):
 last=None
 for attempt in range(3):
  try:
   h=hashlib.sha256();size=0
   with urllib.request.urlopen(v['url'],timeout=60) as r:
    status=r.status;ctype=r.headers.get('Content-Type')
    while chunk:=r.read(1024*1024):h.update(chunk);size+=len(chunk)
   assert size==v['bytes'] and h.hexdigest()==v['sha256']
   req=urllib.request.Request(v['url'],headers={'Range':'bytes=0-1023'})
   with urllib.request.urlopen(req,timeout=30) as r:
    rs=r.status;cr=r.headers.get('Content-Range');sample=r.read(1024)
   assert rs==206 and cr==f'bytes 0-1023/{size}' and len(sample)==1024
   return {'videoId':v['videoId'],'httpStatus':status,'contentType':ctype,'bytes':size,'sha256':h.hexdigest(),'rangeStatus':rs,'contentRange':cr,'verified':True}
  except Exception as e:last=str(e);time.sleep(1)
 return {'videoId':v['videoId'],'verified':False,'error':last}
def graph():
 c=json.loads((D/'game-config.json').read_text());nodes={n['nodeId']:n for n in c['nodes']};todo=[(c['entryNodeId'],frozenset(c['initialState']['flags']),frozenset(),[])];seen=set();endings={};locked=0;transitions=0
 while todo:
  nid,flags,tags,trace=todo.pop();key=(nid,flags,tags)
  if key in seen:continue
  seen.add(key);n=nodes[nid]
  if n['sceneType']=='end':
   u=n['ending']['unlock'];assert set(u['requiredFlags'])<=flags and set(u['requiredEndingTags'])<=tags
   endings.setdefault(nid,trace+[nid]);continue
  for b in n['components']:
   if not b['nextNodeId']:continue
   cond=b.get('condition')
   if cond and cond['flag'] not in flags:locked+=1;continue
   ch=b.get('changes',{});nf=set(flags);nt=set(tags)
   if ch.get('importantFlag'):nf.add(ch['importantFlag']['id'])
   nt.update(ch.get('addEndingTags',[]));transitions+=1
   todo.append((b['nextNodeId'],frozenset(nf),frozenset(nt),trace+[b['componentId']]))
 assert len(endings)==14
 report={'statesExplored':len(seen),'allowedTransitions':transitions,'lockedTransitionsRejected':locked,'reachableEndings':len(endings),'examplePaths':endings,'verified':True}
 write('graph-verification.json',report);print('Graph:',len(seen),'states;',len(endings),'endings reachable',flush=True)
if __name__=='__main__':
 graph();m=json.loads((I/'media-cdn-manifest.json').read_text());rows=[]
 with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
  for r in pool.map(verify,m):
   rows.append(r);print('CDN',len(rows),'/',len(m),r['videoId'],r['verified'],flush=True);write('cdn-verification.json',{'count':len(rows),'expected':len(m),'allVerified':len(rows)==len(m) and all(x['verified'] for x in rows),'videos':rows})
 assert all(x['verified'] for x in rows)
