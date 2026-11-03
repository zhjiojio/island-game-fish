"""Promote only hash-matched reviewed native parts; never use an old soundtrack."""
import pathlib,json,subprocess,hashlib,collections,shutil
B=pathlib.Path(__file__).resolve().parents[1];tasks=json.loads((B/'scripts/pilot-tasks.json').read_text());decisions={r['partId']:r for r in json.loads((B/'review/pilot-decisions.json').read_text())};groups=collections.defaultdict(list);results=[]
for t in tasks:groups[t['videoId']].append(t)
for vid,ts in groups.items():
 if any(t['partId'] not in decisions or decisions[t['partId']]['status']!='approved_pilot_candidate' for t in ts):continue
 for t in ts:assert hashlib.sha256(pathlib.Path(t['output']).read_bytes()).hexdigest()==decisions[t['partId']]['sha256']
 out=B/'video'/(vid+'.mp4');infiles=[pathlib.Path(t['output']) for t in ts]
 if not out.exists():
  if len(ts)==1:shutil.copyfile(infiles[0],out)
  else:
   # Provider outputs must share video/audio stream formats before lossless concat.
   specs=[]
   for p in infiles:
    q=json.loads(subprocess.check_output(['ffprobe','-v','error','-show_streams','-of','json',str(p)]));specs.append([{k:s.get(k) for k in ['codec_type','codec_name','width','height','sample_rate','channels','r_frame_rate']} for s in q['streams']])
   assert all(x==specs[0] for x in specs),'Stream format mismatch: use approved native-audio transcode recipe'
   listing=B/'requests'/(vid+'.concat.txt');listing.write_text('\n'.join("file '"+str(p).replace("'","'\\''")+"'" for p in infiles)+'\n')
   subprocess.run(['ffmpeg','-v','error','-y','-f','concat','-safe','0','-i',str(listing),'-map','0:v:0','-map','0:a:0','-c','copy','-movflags','+faststart',str(out)],check=True)
 q=json.loads(subprocess.check_output(['ffprobe','-v','error','-show_format','-show_streams','-of','json',str(out)]));duration=float(q['format']['duration']);assert abs(duration-sum(t['durationSec'] for t in ts))<.25;subprocess.run(['ffmpeg','-v','error','-xerror','-i',str(out),'-f','null','-'],check=True)
 results.append({'videoId':vid,'path':str(out.resolve()),'sha256':hashlib.sha256(out.read_bytes()).hexdigest(),'durationSec':duration,'bytes':out.stat().st_size,'parts':[t['partId'] for t in ts],'audio':'native_kling_only','status':'pilot_ready_for_user_review','partDecisions':[decisions[t['partId']] for t in ts]})
(B/'review/pilot-delivery.json').write_text(json.dumps(results,ensure_ascii=False,indent=2)+'\n');print('Pilots ready',len(results),'/5')
