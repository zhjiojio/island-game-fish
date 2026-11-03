import pathlib,json,subprocess,hashlib
B=pathlib.Path(__file__).resolve().parents[1];rows=json.loads((B/'scripts/sound-script-v1.json').read_text())['videos'];ap={x['partId']:x for x in json.loads((B/'review/picture-repair-approvals.json').read_text())};affected={k.split('__p')[0] for k in ap}
for r in rows:
 vid=r['videoId'];out=B/'video'/(vid+'.mp4')
 if vid not in affected or out.exists():continue
 parts=[];pending=False
 for part in r['sourceParts']:
  if part in ap:
   a=ap[part]
   if not a['approved']:pending=True;break
   p=pathlib.Path(a['path']);assert hashlib.sha256(p.read_bytes()).hexdigest()==a['sha256']
  else:p=B.parent/r['sourceFolder']/'segments'/(part+'.mp4')
  parts.append(p)
 if pending:continue
 audio=B/'audio'/(vid+'.repaired.wav');cmd=['ffmpeg','-v','error','-y']
 for p in parts:cmd+=['-i',str(p)]
 cmd+=['-i',str(audio)];filters=[]
 for i in range(len(parts)):filters.append(f'[{i}:v]scale=1080:1920,setsar=1,fps=24,format=yuv420p,setpts=PTS-STARTPTS[v{i}]')
 filters.append(''.join(f'[v{i}]' for i in range(len(parts)))+f'concat=n={len(parts)}:v=1:a=0[v]')
 cmd+=['-filter_complex',';'.join(filters),'-map','[v]','-map',f'{len(parts)}:a:0','-c:v','libx264','-preset','fast','-crf','18','-c:a','aac','-b:a','192k','-t',str(r['durationSec']),'-movflags','+faststart',str(out)]
 subprocess.run(cmd,check=True);print(vid,'composed_picture_repair_candidate',flush=True)
