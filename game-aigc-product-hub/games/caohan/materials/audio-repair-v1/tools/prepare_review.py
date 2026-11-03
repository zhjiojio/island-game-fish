import pathlib,json,subprocess,cv2
from PIL import Image,ImageDraw
B=pathlib.Path(__file__).resolve().parents[1];D=json.loads((B/'scripts/sound-script-v1.json').read_text());face=cv2.CascadeClassifier(cv2.data.haarcascades+'haarcascade_frontalface_default.xml')
for start in range(0,len(D['videos']),6):
 batch=D['videos'][start:start+6];sheet=Image.new('RGB',(1200,len(batch)*244),'#eee');draw=ImageDraw.Draw(sheet)
 for row,r in enumerate(batch):
  vid=r['videoId'];wav=B/'audio'/(vid+'.original.wav')
  if not wav.exists():subprocess.run(['ffmpeg','-v','error','-y','-i',r['originalVideo'],'-vn','-ar','44100','-ac','2',str(wav)],check=True)
  cap=cv2.VideoCapture(r['originalVideo']);draw.text((4,row*244+2),vid,fill='black')
  for j in range(6):
   t=r['durationSec']*(j+.5)/6;cap.set(cv2.CAP_PROP_POS_MSEC,t*1000);ok,img=cap.read()
   if not ok:continue
   gray=cv2.cvtColor(img,cv2.COLOR_BGR2GRAY);small=cv2.resize(gray,(270,480));boxes=face.detectMultiScale(small,scaleFactor=1.1,minNeighbors=4,minSize=(14,14))
   if len(boxes):
    x,y,w,h=max(boxes,key=lambda x:x[2]*x[3]);sx=img.shape[1]/270;sy=img.shape[0]/480;x0=max(0,int((x-w*.3)*sx));y0=max(0,int((y-h*.2)*sy));x1=min(img.shape[1],int((x+w*1.3)*sx));y1=min(img.shape[0],int((y+h*1.5)*sy));img=img[y0:y1,x0:x1]
   im=Image.fromarray(cv2.cvtColor(img,cv2.COLOR_BGR2RGB));im.thumbnail((196,202));sheet.paste(im,(j*200,row*244+20));draw.text((j*200+4,row*244+224),f'{t:.1f}s',fill='black')
  cap.release()
 sheet.save(B/'review'/f'mouth-overview-{start//6+1:02d}.jpg',quality=92);print('review sheet',start//6+1,flush=True)
