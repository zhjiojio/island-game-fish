import pathlib,json,torch,whisper,sys
B=pathlib.Path(__file__).resolve().parents[1];torch.set_num_threads(4);m=whisper.load_model('small',device='cpu');ids=sys.argv[1:] or [r['videoId'] for r in json.loads((B/'scripts/audio-timeline.json').read_text())]
for vid in ids:
 out=B/'review'/(vid+'.mix-whisper.json')
 if out.exists():continue
 r=m.transcribe(str(B/'audio'/(vid+'.repaired.wav')),language='zh',fp16=False,temperature=0,condition_on_previous_text=False,verbose=None)
 out.write_text(json.dumps(r,ensure_ascii=False,indent=2)+'\n');print(vid,r['text'],flush=True)
