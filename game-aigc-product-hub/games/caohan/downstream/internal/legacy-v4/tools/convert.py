"""Rebuild the engineering handoff from immutable v4 + actual upload receipt."""
import json,pathlib,hashlib,datetime
I=pathlib.Path(__file__).resolve().parents[1]
D=I.parent
def read(p):return json.loads(p.read_text())
def write(p,d):p.write_text(json.dumps(d,ensure_ascii=False,indent=2)+'\n')
def component(cid,kind='text2',text='',button='',target=None,unlock=None):
 return dict(componentId=cid,componentType=kind,showTime=None,endTime=None,nextNodeId=target,unlockType=unlock,content=dict(roleName='',title='',text=text,buttonText=button,iconUrl=None),value=None)
def ad(c):
 c['adConfig']={'adType':'rewarded','adId':None,'failNextNodeId':None,'failureBehavior':'stay'}
def main():
 source=next((D.parent/'output').glob('*.v4.json'));s=read(source);template=read(I/'game-config.template.json');media=read(I/'media-upload-manifest.json')
 receipt=read(I/'reports/cdn-upload-receipt.json')
 urls={pathlib.Path(x['local']).name:x['cdnUrl'] for x in receipt['files']};assert len(urls)==len(media)==69
 for v in media:v['url']=urls[pathlib.Path(v['uploadPath']).name]
 write(I/'media-cdn-manifest.json',media)
 write(I/'reports/cdn-upload-receipt.json',receipt)
 videos={v['videoId']:v for v in media};nodes=[];mapping={}
 for nid,n in s['nodes'].items():
  if n['type'] not in ('scene','ending'):continue
  vid=n['videos'][0]['id'] if n['type']=='scene' else nid
  v=videos[vid];cs=[]
  out=dict(nodeId=nid,nodeDesc=n.get('dramaticBeat',n.get('description','')),title=n['title'],nodeType='video',sceneType='end' if n['type']=='ending' else ('begin' if nid==s['startNodeId'] else 'game'),video=dict(url=v['url'],preload=nid==s['startNodeId'],loop=False,muted=False,duration=v['durationSec']),image=None,components=cs)
  mapping[nid]={'videoId':vid,'sourceNodeId':nid,'chapterId':n.get('chapterId'),'episodeId':n.get('episodeId')}
  if n['type']=='ending':
   out['ending']={k:n[k] for k in ('id','category','unlock','description','closing','achievement','rarity','isCanonical') if k in n}
   cs.append(component(nid+'_result',text=n['description']+'\n'+n['closing']));cs[-1]['content']['title']=n['title']
   cs.append(component(nid+'_restart','button1',button='重新开始',unlock='restart'))
  else:
   nxt=s['nodes'][n['next']];mapping[nid]['attachedSourceNodeId']=nxt['id']
   if nxt['type']=='choice':
    cs.append(component(nxt['id']+'_prompt',text=nxt['prompt']))
    for o in nxt['options']:
     a=o['access'];c=component(nxt['id']+'_'+o['id'],'button1',text=a.get('coverCopy',''),button=a.get('buttonCopy',o['text']),target=o['next'],unlock='ad' if a['mode']=='rewarded_ad' else None)
     c.update(condition=a.get('condition'),lockedCopy=a.get('lockedCopy'),changes=o.get('changes',{}))
     if c['unlockType']=='ad':ad(c)
     cs.append(c)
   elif nxt['type']=='ad_gate':
    cs.append(component(nxt['id']+'_cover',text=nxt['creative']['coverCopy']))
    c=component(nxt['id']+'_continue','button1',button=nxt['creative']['buttonCopy'],target=nxt['unlock']['next'],unlock='ad');ad(c);cs.append(c)
   else:raise ValueError('Unexpected transition '+nxt['type'])
  nodes.append(out)
 cfg={'_comment':'内容交付配置；工程需实现 caohan-story-state/1.0 扩展，详见 README.md。UI 与广告位由工程配置。','meta':{'version':'2.4.1','gameId':'caohan','gameName':s['meta']['title'],'lang':'zh-CN','description':s['meta']['description'],'configUpdatedAt':datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=8))).isoformat(),'storyVersion':s['meta']['version'],'contentContractVersion':'caohan-story-state/1.0','mediaRevision':media[0].get('revision','original-v4'),'sourceSha256':hashlib.sha256(source.read_bytes()).hexdigest()},'theme':template['theme'],'valueDefinitions':[],'homepage':{'image':None,'hotspots':template['homepage']['hotspots'],'bgm':None},'entryNodeId':s['startNodeId'],'nodes':nodes,'initialState':{'variables':s['variables'],'flags':s.get('initialFlags',[]),'endingTags':[]},'endings':s['endings'],'achievements':s['achievements'],'globalSettings':{'enableAutoSave':True,'enableUnlockPersistence':True,'syncUnlockToServer':False,'debugMode':False},'adConfig':{'rewardedAdId':None,'interstitialAdId':None,'bannerAdId':None}}
 write(D/'game-config.json',cfg);write(I/'source-node-map.json',mapping)
 print('Converted',len(nodes),'video nodes; CDN URLs',len(urls))
if __name__=='__main__':main()
