import pathlib,json,torch
from silero_vad import load_silero_vad,read_audio,get_speech_timestamps
B=pathlib.Path(__file__).resolve().parents[1];torch.set_num_threads(2);model=load_silero_vad();rows=json.loads((B/'scripts/audio-timeline.json').read_text());out=[]
for r in rows:
 wav=read_audio(str(B/'audio'/(r['videoId']+'.repaired.wav')),sampling_rate=16000)
 ts=get_speech_timestamps(wav,model,sampling_rate=16000,return_seconds=True,threshold=.65,min_speech_duration_ms=180,min_silence_duration_ms=140)
 planned=[(l['start']-.15,l['end']+.15) for l in r['retainOriginalVoice']+r['newVoice']]
 unexplained=[t for t in ts if not any(t['end']>a and t['start']<b for a,b in planned)]
 out.append({'videoId':r['videoId'],'speechSegments':ts,'unexplainedSegments':unexplained,'plannedWindows':planned})
 if unexplained:print(r['videoId'],'unexplained',unexplained,flush=True)
(B/'review/speech-residue-vad.json').write_text(json.dumps(out,ensure_ascii=False,indent=2)+'\n')
print('VAD inspected',len(out),'candidates',flush=True)
