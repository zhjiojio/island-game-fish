import pathlib,json,sys
from PIL import Image,ImageDraw
B=pathlib.Path(__file__).resolve().parents[1];tasks=json.loads((B/'scripts/full-tasks.json').read_text());ds={x['partId']:x for x in json.loads((B/'review/full-keyframe-decisions.json').read_text())};pending=[t for t in tasks if pathlib.Path(t['keyframe']).exists() and t['partId'] not in ds][:8];sheet=Image.new('RGB',(1600,1500),'white');d=ImageDraw.Draw(sheet)
for j,t in enumerate(pending):
 im=Image.open(t['keyframe']);im.thumbnail((392,690));x=j%4*400;y=j//4*750;sheet.paste(im,(x,y+40));d.text((x,y+2),t['partId'].replace('_video_01',''),fill='black')
p=B/'review'/(sys.argv[1]+'.jpg');sheet.save(p);(p.with_suffix('.json')).write_text(json.dumps([t['partId'] for t in pending],indent=2)+'\n');print([t['partId'] for t in pending])
