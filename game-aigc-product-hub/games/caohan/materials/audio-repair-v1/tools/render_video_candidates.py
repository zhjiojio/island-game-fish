import pathlib,json,subprocess
B=pathlib.Path(__file__).resolve().parents[1];rows=json.loads((B/'scripts/audio-timeline.json').read_text());picture={r['partId'].split('__p')[0] for r in json.loads((B/'scripts/picture-repair-queue.json').read_text())};picture.add('ep04_branch_conditional_video_01')
for r in rows:
 vid=r['videoId'];out=B/'video'/(vid+'.mp4');a=B/'audio'/(vid+'.repaired.wav')
 if out.exists() or not a.exists() or vid in picture:continue
 subprocess.run(['ffmpeg','-v','error','-y','-i',r['originalVideo'],'-i',str(a),'-map','0:v:0','-map','1:a:0','-c:v','copy','-c:a','aac','-b:a','192k','-movflags','+faststart','-t',str(r['durationSec']),str(out)],check=True)
 print(vid,'video_candidate_original_picture_copied',flush=True)
