import pathlib,json,hashlib,collections,subprocess,shutil
B=pathlib.Path(__file__).resolve().parents[1];tasks=json.loads((B/'scripts/pilot-tasks.json').read_text())+json.loads((B/'scripts/full-tasks.json').read_text());ds=json.loads((B/'review/pilot-decisions.json').read_text());f=B/'review/full-video-decisions.json';ds+=json.loads(f.read_text()) if f.exists() else [];dec={x['partId']:x for x in ds};groups=collections.defaultdict(list)
for t in tasks:groups[t['videoId']].append(t)
prior=B/'review/full-delivery.json';old={x['videoId']:x for x in json.loads(prior.read_text())} if prior.exists() else {};pilots={x['videoId']:x for x in json.loads((B/'review/pilot-delivery.json').read_text())};results=[]
for vid,ts in groups.items():
 if any(dec.get(t['partId'],{}).get('status') not in ('approved_for_delivery','approved_pilot_candidate') for t in ts):continue
 part_hashes=[]
 for t in ts:
  h=hashlib.sha256(pathlib.Path(t['output']).read_bytes()).hexdigest();assert h==dec[t['partId']]['sha256'];part_hashes.append(h)
 out=B/'video'/(vid+'.mp4');previous=old.get(vid) or pilots.get(vid)
 valid_existing=out.exists() and previous and hashlib.sha256(out.read_bytes()).hexdigest()==previous['sha256'] and (previous.get('partHashes')==part_hashes or vid in pilots)
 if not valid_existing:
  temp=B/'video'/(vid+'.composing.mp4')
  if len(ts)==1:shutil.copyfile(ts[0]['output'],temp)
  else:
   specs=[]
   for t in ts:
    q=json.loads(subprocess.check_output(['ffprobe','-v','error','-show_streams','-of','json',t['output']]));specs.append([{k:s.get(k) for k in ['codec_type','codec_name','width','height','sample_rate','channels','r_frame_rate']} for s in q['streams']])
   assert all(x==specs[0] for x in specs),'incompatible native streams '+vid
   listing=B/'requests'/(vid+'.full-concat.txt');listing.write_text('\n'.join("file '"+t['output'].replace("'","'\\''")+"'" for t in ts)+'\n')
   subprocess.run(['ffmpeg','-v','error','-y','-f','concat','-safe','0','-i',str(listing),'-map','0:v:0','-map','0:a:0','-c','copy','-movflags','+faststart',str(temp)],check=True)
  subprocess.run(['ffmpeg','-v','error','-xerror','-i',str(temp),'-f','null','-'],check=True)
  if out.exists():out.rename(B/'video'/(vid+'.superseded-'+hashlib.sha256(out.read_bytes()).hexdigest()[:10]+'.mp4'))
  temp.replace(out)
 q=json.loads(subprocess.check_output(['ffprobe','-v','error','-show_streams','-show_format','-of','json',str(out)]));dur=float(q['format']['duration']);assert abs(dur-sum(t['durationSec'] for t in ts))<.35;assert any(x['codec_type']=='audio' for x in q['streams'])
 results.append({'videoId':vid,'path':str(out.resolve()),'sha256':hashlib.sha256(out.read_bytes()).hexdigest(),'durationSec':dur,'bytes':out.stat().st_size,'parts':[t['partId'] for t in ts],'partHashes':part_hashes,'audio':'native_kling_only','status':'approved_pilot_reused' if vid in pilots else 'reviewed_native_final','partDecisions':[dec[t['partId']] for t in ts]})
prior.write_text(json.dumps(results,ensure_ascii=False,indent=2)+'\n');print('Native finals',len(results),'/69')
