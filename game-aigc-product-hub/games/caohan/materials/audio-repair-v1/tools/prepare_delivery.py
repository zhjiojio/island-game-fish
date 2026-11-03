"""Stage verified sound-repair revision; preserve the previous handoff."""
import pathlib,json,shutil,datetime
B=pathlib.Path(__file__).resolve().parents[1];G=B.parent.parent;D=G/'downstream';I=D/'internal'
def read(p):return json.loads(p.read_text())
def write(p,x):p.parent.mkdir(parents=True,exist_ok=True);p.write_text(json.dumps(x,ensure_ascii=False,indent=2)+'\n')
tech=read(B/'review/final-media-verification.json');sound=read(B/'scripts/sound-script-v1.json');vad=read(B/'review/speech-residue-vad.json');assert tech['count']==69 and tech['unchangedPictureCount']==62;assert not any(x['unexplainedSegments'] for x in vad)
archive=I/'history/before-audio-repair-v1'
for name in ['game-config.json','README.md']:
 dest=archive/name
 if not dest.exists():dest.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(D/name,dest)
for name in ['media-upload-manifest.json','media-cdn-manifest.json','reports/cdn-upload-receipt.json','reports/cdn-verification.json','reports/delivery-verification.json']:
 dest=archive/name
 if not dest.exists():dest.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(I/name,dest)
old={x['videoId']:x for x in read(archive/'media-upload-manifest.json')};sr={x['videoId']:x for x in sound['videos']};rows=[]
extra={
'ep03_scene_00_video_01':'ep03_scene_00_video_01.boundary-review.second-review.json',
'ep03_branch_counterattack_video_01':'ep03_branch_counterattack_video_01.boundary-review.second-review.json',
'ep07_branch_truth_video_01':'ep07_branch_truth_video_01.boundary-review.second-review.json',
'ep07_branch_counterattack_video_01':'ep07_branch_counterattack_video_01.boundary-review.second-review.json',
'ep02_branch_conditional_video_01':'ep02_branch_conditional_video_01.boundary-review.second-review.json',
'ep11_branch_conditional_video_01':'ep11_branch_conditional_video_01.nonspeech-verify.second-review.json',
'ep04_branch_conditional_video_01':'ep04_branch_conditional_video_01.dialogue-retake.final-audio.second-review.json',
'ending_boss':'ending_boss.final-audio.second-review.json',
'ending_crane':'ending_crane.boundary-review.second-review.json',
'ep02_branch_counterattack_video_01':'ep02_branch_counterattack_video_01.mix-voxtral.json',
'ep06_scene_00_video_01':'ep06_scene_00_video_01.mix-voxtral.json',
'ep09_scene_00_video_01':'ep09_scene_00_video_01.mix-voxtral.json'}
for t in tech['videos']:
 vid=t['videoId'];review=extra.get(vid,vid+'.mix-transcript.json');assert (B/'review'/review).exists(),review
 r=dict(old[vid]);r.update({k:t[k] for k in ['sourcePath','durationSec','bytes','sha256','pictureMode','audioMode']});r.update(revision='audio-repair-v1',originalSourcePath=sr[vid]['originalVideo'],originalSha256=sr[vid]['originalSha256'],spokenLines=sr[vid]['spokenLines'],status='sound_revision_reviewed',audioReview='review/'+review,technicalReview='review/final-media-verification.json',uploadPath='assets/video/'+vid+'.'+t['sha256'][:12]+'.mp4');r.pop('url',None);rows.append(r)
write(B/'manifest.json',rows)
stage=I/'.cdn-stage';previous=I/'.cdn-stage-before-audio-repair-v1'
if stage.exists() and not previous.exists():stage.rename(previous)
for r in rows:
 target=stage/r['uploadPath'];target.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(r['sourcePath'],target)
assert len(list((stage/'assets/video').glob('*.mp4')))==69
write(I/'media-upload-manifest.json',rows)
write(B/'review/review-decisions.json',{'revision':'audio-repair-v1','videoCount':69,'policy':'visual directions silent; retain correct role speech; offscreen narration uses a separate system TTS voice','evidenceLimit':'Speech transcription and selected frame inspection, not a guarantee of phoneme-perfect lips or artifact-free separation. Model transcripts may omit short words; cross-reviews and original-waveform boundaries resolve discrepancies.','decisions':['Restored names and final pronoun omitted by fuzzy ASR boundaries in three videos.','ep02 conditional retains original dismissive chuckle; no requirement to pronounce written laughter as words.','ep09 conditional 好 confirmed after extending onset.','Four no-speech ASR false positives rejected using independent Voxtral and VAD.','ending_boss actual role sentence confirmed by second final-file review.','ending_crane new narration source transcribes 塔吊顶端; full-mix ASR abbreviated it; MC 谁反对 confirmed. Machine/horn background is intended.','ep04 conditional native retake includes only two heroine quotes; original hotel reference preserved; 14 frame inspection supports correct speaking intervals.','Seven silent picture repair parts reviewed and six composites checked at seams. streamer p01 first pass rejected; second pass selected.'],'finalMedia':tech,'audioReviewByVideo':{r['videoId']:r['audioReview'] for r in rows}})
for name in ['sound-script-v1.json','sound-script-v1.md']:
 dest=I/'sound-production'/name;dest.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(B/'scripts'/name,dest)
print('Staged',len(rows),'files',round(sum(r['bytes'] for r in rows)/1024**2,1),'MiB')
