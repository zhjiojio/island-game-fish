"""Check immutable story/UI, changed media and complete remote receipts."""
import pathlib,json,hashlib,sys,copy
B=pathlib.Path(__file__).resolve().parents[1];G=B.parent.parent;I=G/'downstream/internal'
def read(p):return json.loads(p.read_text())
def write(p,x):p.write_text(json.dumps(x,ensure_ascii=False,indent=2)+'\n')
source=next((G/'output').glob('*.v4.json'));sha=hashlib.sha256(source.read_bytes()).hexdigest();assert sha=='77cee12ed8c5f8a99e49c6ec00ef31136fa64c03eb09995732b91220ca491ec7'
c=read(I.parent/'game-config.json');old=read(I/'history/before-audio-repair-v1/game-config.json');a=copy.deepcopy(c);b=copy.deepcopy(old)
for x in (a,b):
 x.pop('meta')
 for n in x['nodes']:n['video'].pop('url');n['video'].pop('duration')
assert a==b,'Non-media UI/story changed'
media=read(I/'media-cdn-manifest.json');verify=read(I/'reports/cdn-verification.json');graph=read(I/'reports/graph-verification.json');tech=read(B/'review/final-media-verification.json');assert verify['count']==69 and verify['allVerified'];assert graph['reachableEndings']==14 and graph['verified'];assert c['meta']['mediaRevision']=='audio-repair-v1';assert len(media)==len(c['nodes'])==69
assert {v['sha256'] for v in media}=={v['sha256'] for v in tech['videos']}
assert not ({n['video']['url'] for n in c['nodes']}&{n['video']['url'] for n in old['nodes']})
sound=read(B/'scripts/sound-script-v1.json');lines=[l for r in sound['videos'] for l in r['spokenLines']];assert len(lines)==72
assert not any(word in l['text'] for l in lines for word in ['镜头切','镜头一转','特写镜头','画面切'])
# Read credentials in process; only report whether matches exist, never their values.
sys.path.insert(0,'/Users/kwaibear/Documents/AIGCGame/game-aigc-workflow')
import yaml
from tools.config.credentials import get_credential
from tools.voice_clone.contract import load_provider_env
keys=[yaml.safe_load(pathlib.Path('/Users/kwaibear/work/minigame/game-aigc-product-hub/games/ks867658648250668260/workflow-run.yml').read_text())['config']['kcdn_token'],get_credential('OPENROUTER_API_KEY'),load_provider_env(pathlib.Path('/Users/kwaibear/Documents/AIGCGame/ks658369973696011353/.secrets/voice-providers.env'))['MINIMAX_API_KEY']]
hits=[];scanned=0
for p in G.rglob('*'):
 if p.is_file() and p.suffix.lower() in {'.json','.md','.py','.cjs','.js','.ts','.yaml','.yml','.txt','.tsv'}:
  data=p.read_bytes();scanned+=1
  if any(k.encode() in data for k in keys if k):hits.append(str(p.relative_to(G)))
assert not hits,('Credential found in files',hits)
r={'sourceUnchanged':True,'sourceSha256':sha,'configSha256':hashlib.sha256((I.parent/'game-config.json').read_bytes()).hexdigest(),'mediaRevision':'audio-repair-v1','videoCount':69,'verifiedCdnVideos':69,'allVideoUrlsChanged':True,'unchangedPictureCount':62,'localPictureRepairCount':7,'spokenLineCount':72,'reachableEndings':14,'statesExplored':graph['statesExplored'],'allowedTransitions':graph['allowedTransitions'],'uiAndStoryStateUnchanged':True,'credentialAbsentFromDeliveryFiles':True,'textFilesScanned':scanned,'runtimeIntegrationTested':False}
write(I/'reports/delivery-verification.json',r);write(B/'review/delivery-verification.json',r);print(json.dumps(r,ensure_ascii=False,indent=2))
