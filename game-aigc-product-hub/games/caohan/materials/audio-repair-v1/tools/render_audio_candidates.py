import pathlib,json,subprocess,sys,numpy as np,soundfile as sf
B=pathlib.Path(__file__).resolve().parents[1];rows=json.loads((B/'scripts/audio-timeline.json').read_text());SR=44100
for r in rows:
 vid=r['videoId'];stem=B/'stems/htdemucs'/(vid+'.original')/'no_vocals.wav';out=B/'audio'/(vid+'.repaired.wav');voiceout=B/'audio'/(vid+'.dialogue-only.wav')
 if out.exists() or not stem.exists():continue
 if r['issues']:print(vid,'blocked_timeline',flush=True);continue
 original,sr=sf.read(B/'audio'/(vid+'.original.wav'),always_2d=True);bed,br=sf.read(stem,always_2d=True);assert sr==br==SR
 N=len(original);bed=np.pad(bed,((0,max(0,N-len(bed))),(0,0)))[:N];mask=np.zeros(N)
 for l in r['retainOriginalVoice']:
  a=max(0,int(l['start']*SR));z=min(N,int(l['end']*SR));mask[a:z]=1
  fade=min(int(.015*SR),(z-a)//2)
  if fade:mask[a:a+fade]=np.linspace(0,1,fade);mask[z-fade:z]=np.linspace(1,0,fade)
 # Original audio is retained verbatim during verified character lines, not resynthesized.
 mixed=bed*(1-mask[:,None])+original*mask[:,None];dialogue=(original-bed)*mask[:,None]
 sf.write(voiceout,dialogue,SR,subtype='PCM_16')
 for l in r['newVoice']:
  norm=B/'audio'/(l['lineId']+'.normalized.wav')
  if not norm.exists():subprocess.run(['ffmpeg','-v','error','-y','-i',l['audioFile'],'-af','loudnorm=I=-18:TP=-2:LRA=9','-ar',str(SR),'-ac','2',str(norm)],check=True)
  voice,vs=sf.read(norm,always_2d=True);assert vs==SR;a=int(l['start']*SR);z=min(N,a+len(voice));assert z-a>=len(voice)-1000
  mixed[a:z]*=.5;mixed[a:z]+=voice[:z-a]
 peak=np.max(np.abs(mixed))
 if peak>.96:mixed*=.96/peak
 sf.write(out,mixed,SR,subtype='PCM_24');meta={'videoId':vid,'voiceWindows':r['retainOriginalVoice'],'newVoice':r['newVoice'],'durationSec':N/SR,'status':'audio_candidate_pending_listening','peakBeforeHeadroom':float(peak)}
 (B/'review'/(vid+'.mix.json')).write_text(json.dumps(meta,ensure_ascii=False,indent=2)+'\n');print(vid,'audio_candidate',flush=True)
