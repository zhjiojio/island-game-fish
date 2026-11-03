"""Verify actual final files; originals immutable, copied-picture packets identical."""
import pathlib,json,subprocess,hashlib,concurrent.futures
B=pathlib.Path(__file__).resolve().parents[1]
D=json.loads((B/'scripts/sound-script-v1.json').read_text())
changed={a['partId'].split('__p')[0] for a in json.loads((B/'review/picture-repair-approvals.json').read_text())}|{'ep04_branch_conditional_video_01'}
def vh(p):return subprocess.check_output(['ffmpeg','-v','error','-i',str(p),'-map','0:v:0','-c:v','copy','-f','hash','-hash','sha256','-']).decode().strip()
def verify(r):
 vid=r['videoId'];p=B/'video'/(vid+'.mp4');old=pathlib.Path(r['originalVideo']);assert hashlib.sha256(old.read_bytes()).hexdigest()==r['originalSha256'],vid+' original changed'
 q=json.loads(subprocess.check_output(['ffprobe','-v','error','-show_streams','-show_format','-of','json',str(p)]));v=next(s for s in q['streams'] if s['codec_type']=='video');a=next(s for s in q['streams'] if s['codec_type']=='audio');duration=float(q['format']['duration']);assert abs(duration-r['durationSec'])<.15,(vid,duration,r['durationSec']);assert v['height']>v['width']>=1080, (vid,v['width'],v['height']);assert a['codec_name']=='aac'
 subprocess.run(['ffmpeg','-v','error','-xerror','-threads','2','-i',str(p),'-f','null','-'],check=True,stdout=subprocess.DEVNULL)
 same=vh(p)==vh(old);assert same==(vid not in changed),(vid,same)
 out={'videoId':vid,'sourcePath':str(p),'durationSec':duration,'bytes':p.stat().st_size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'originalSha256':r['originalSha256'],'originalUnchanged':True,'picturePacketsIdentical':same,'pictureMode':'original_video_stream_copy' if same else 'local_shot_repair','audioMode':'native_dialogue_retake' if vid=='ep04_branch_conditional_video_01' else 'retained_role_voice_plus_new_offscreen_mix','videoCodec':v['codec_name'],'audioCodec':a['codec_name'],'width':v['width'],'height':v['height'],'decodePassed':True}
 print(vid,'verified',flush=True);return out
with concurrent.futures.ThreadPoolExecutor(max_workers=2) as ex:rows=list(ex.map(verify,D['videos']))
assert len(rows)==69
report={'count':69,'originalsUnchanged':True,'decodePassed':True,'unchangedPictureCount':sum(x['picturePacketsIdentical'] for x in rows),'localPictureRepairCount':len(changed),'videos':rows}
(B/'review/final-media-verification.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n');print('FINAL',report['count'],report['unchangedPictureCount'],report['localPictureRepairCount'])
