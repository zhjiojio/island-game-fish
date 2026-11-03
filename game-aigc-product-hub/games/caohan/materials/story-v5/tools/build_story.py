"""Serialize authored, reviewed scene decisions; never derive speech from prose."""
import pathlib,json,copy,hashlib,re,math,sys
B=pathlib.Path(__file__).resolve().parents[1];G=B.parent.parent;S=next((G/'output').glob('*.v4.json'));s=json.loads(S.read_text());auth=json.loads((B/'scripts/authored-scenes.json').read_text());names={'hexingran':'贺星冉','chenjin':'陈劲','xushaoze':'许邵泽','muyao':'沐瑶','heming':'贺铭','hemu':'贺母','zhoubo':'周伯','officiant':'司仪','host':'节目主持人','pursuer':'许家眼线'}
for cid,name in names.items():
 s['characters'].setdefault(cid,{'name':name,'role':'supporting','appearanceAnchor':'沿用已批准人物参考；未有参考的出镜角色须先建立人物图','voiceAnchor':'符合年龄与身份的普通话自然声线','wardrobeByEpisode':{'default':'沿用所处场景服装'}})
 ref=G/'materials/story-v4/characters'/('许邵泽执行者A-角色设定.png' if cid=='xushaoze' else name+'-角色设定.png')
 if ref.exists():s['characters'][cid]['referenceImage']=str(ref.resolve())
s['meta']['version']='5.0.0-draft';s['meta']['generator'].update(skillVersion='5.0.0-diegetic',runId='caohan-v5-native-pilot',validationMode='deterministic+sound-contract+editorial-review')
s['meta']['productionProfile'].update(maxVideoDurationSec=45,soundPolicy={'mode':'diegetic_only'})
s['meta']['revision']={'parentSourceSha256':hashlib.sha256(S.read_bytes()).hexdigest(),'status':'pilot_production_full_batch_pending_review','scope':'69节点原生音画重制；保留图结构与状态，修正选择后果及对白','sourceVideoFolders':['materials/story-v4','materials/story-v4-endings'],'authoredChangesRequireReview':True}
s['meta']['adaptationNotes']+=['v5禁解说旁白与内心OS；对白只来自显式人物清单，画面说明与结局简介不发声。','v4分支有选择/画面错配；v5以实际选项为准改写可拍后果。新增台词和事实在制作清单标记，不宣称原文逐字复刻。']
parts={
 'ep03_branch_counterattack':[
  {'duration':12,'cast':['hexingran','chenjin'],'place':'行驶摩托后座','action':'陈劲驾驶摩托不说话，贺星冉在后座先轻声向他道谢，再把电话贴在耳边对沐瑶说话；保持旧片衣服、座位和人物身份。','lineIndices':[0]},
  {'duration':12,'cast':['muyao'],'place':'沐瑶接电话的另一地点','action':'切到另一地点的沐瑶，她独自接听手机，清楚说明卡片状态。她没有坐在摩托上。贺星冉与陈劲都不出镜。','lineIndices':[1]},
  {'duration':10,'cast':['hexingran','chenjin'],'place':'行驶摩托后座','action':'切回贺星冉在摩托后座。她听完电话停半拍，眼神坚定，再对电话说出决定。陈劲驾驶，嘴闭合不说话。','lineIndices':[2]}],
 'ending_crane':[
  {'duration':5,'cast':['hexingran','chenjin'],'place':'塔吊顶端婚礼平台','action':'保持旧片高空婚礼、夕阳与两位新人站位。司仪在摄像机旁画外发问，新人听后对视，保持自然闭口，不替司仪说话。','lineIndices':[0]},
  {'duration':7,'cast':[],'place':'塔吊下方工程车方阵','action':'切到旧片下方排列的挖掘机方阵，车灯接连亮起，喇叭从一两辆扩成整片欢庆回应。没有任何语言。','lineIndices':[]}]
}
override_file=B/'scripts/full-shot-overrides.json'
if override_file.exists():parts.update(json.loads(override_file.read_text()))
manifest=[];source_text=(G/'input/逃婚糙汉 (1).txt').read_text();changed=[]
def norm(t):return re.sub(r'[^\u4e00-\u9fffA-Za-z0-9]','',t)
for nid,a in auth.items():
 n=s['nodes'][nid];isending=n['type']=='ending';vid=nid if isending else n['videos'][0]['id'];folder='story-v4-endings' if isending else 'story-v4';ref=G/'materials'/folder/'video'/(vid+'.mp4');assert ref.exists()
 groups=parts.get(nid)
 if groups is None:
  dur=max(6,math.ceil(sum(len(norm(l[1]))/3.8+.5 for l in a['lines'])+1.5));dur=10 if nid=='ep01_scene_00' else 14 if nid=='ending_future' else dur
  groups=[{'duration':dur,'cast':a['cast'],'place':a['place'],'action':a['action'],'lineIndices':list(range(len(a['lines'])))}]
 shots=[];offset=0;authored=[]
 for j,g in enumerate(groups,1):
  d=g['duration'];lines=[];selected=[a['lines'][i] for i in g['lineIndices']];required=sum(len(norm(l[1])) for l in selected);cursor=.55
  for i,l in enumerate(selected):
   end=cursor+(d-1.1-.25*max(0,len(selected)-1))*len(norm(l[1]))/max(1,required)
   dl={'speakerId':l[0],'speaker':names[l[0]],'delivery':l[2] if len(l)>2 else 'on_screen','text':l[1],'startSec':round(offset+cursor,2),'endSec':round(offset+end,2),'provenance':'source-retained' if norm(l[1]) in norm(source_text) else 'authored-adaptation'};lines.append(dl)
   if dl['provenance']=='authored-adaptation':authored.append(dl)
   cursor=end+.25
  voc=[]
  for v in a.get('vocalizations',[]):
   text=v['action'];kind='cough' if '咳嗽' in text else 'scream' if '惊呼' in text else 'gasp' if '干呕' in text else 'breath';voc.append({'speakerId':v['speakerId'],'kind':kind})
  ambience='高空风声与远处城市底噪' if '塔吊' in g['place'] or '露台' in g['place'] else '摩托引擎和轻微风声' if '摩托' in g['place'] else '轻微室内底噪' if '电话' in g['place'] else g['place']+'自然环境声'
  sfx=['车队喇叭依次响起，随后齐鸣'] if nid=='ending_crane' and j==2 else ['栏杆断裂和衣料掠过声'] if nid=='ep01_branch_emotion' else []
  if nid=='ending_cow' and j==2:sfx=['奶牛自然哞叫一次']
  if nid=='ending_empire' and j==2:sfx=['铜钟被敲击后的清亮钟声']
  if nid=='ending_worker' and j==2:sfx=['短暂现场鼓掌']
  if nid=='ending_independent' and j==2:sfx=['安全带咔哒、汽车启动和驶离声']
  if nid=='ep01_branch_counterattack':sfx=['杯子在地面碎裂、牛奶溅落声']
  cast=g['cast'];frame='景别：中景；画面人物：'+('、'.join(cast) if cast else '无人物')+'；'+g['place']+'，'+a['time']+'；'+g['action']
  shots.append({'id':vid+f'_shot_{j:02d}','order':j,'durationSec':d,'startSec':offset,'endSec':offset+d,'shotSize':'中景','cameraAngle':'平视','cameraMovement':'遵循参考片主体轴线，随动作轻微跟拍','composition':g['action'],'locationId':nid+'_location_'+str(j) if len(groups)>1 else nid+'_location','timeOfDay':a['time'],'characters':cast,'dialogue':lines,'audio':{'ambient':ambience,'music':'无配乐，以现场声为主','sfx':sfx,'vocalizations':voc},'visual':{'firstFramePrompt':frame,'videoPrompt':g['action'],'negativePrompt':'旁白、解释性念白、字幕水印、额外账号数字、换脸、角色互换、越轴、裸露、血腥伤口'},'assetRefs':[]});offset+=d
 cast=sorted({cid for sh in shots for cid in sh['characters']});v={'id':vid,'order':1,'title':n['title'],'durationSec':offset,'renderMode':'composite' if len(shots)>1 or '到' in a['place'] else 'video_gen','needsLipSync':any(l['delivery']=='on_screen' for sh in shots for l in sh['dialogue']),'continuity':{'locationId':shots[0]['locationId'],'timeOfDay':a['time'],'characterIds':cast,'wardrobe':'优先锁定原参考片人物服装；与新地点不符时单独列入关键帧审核','screenDirection':'锁定参考片轴线与视线方向','startState':shots[0]['composition'],'endState':'完成当前动作后自然停留，为交互或下一镜保留半秒'},'assetRefs':[],'shots':shots,'referenceVideo':{'path':str(ref.resolve()),'sha256':hashlib.sha256(ref.read_bytes()).hexdigest(),'use':'visual_reference_only_do_not_copy_audio'}}
 n['videos']=[v];n['durationSec']=offset
 manifest.append({'videoId':vid,'nodeId':nid,'title':n['title'],'referenceVideo':v['referenceVideo'],'durationSec':offset,'spokenLineCount':sum(len(sh['dialogue']) for sh in shots),'status':'script_draft','authoredDialogue':authored,'authoredNote':a.get('authoredNote'),'visualAction':a['action'],'pilot':nid in ['ep01_scene_00','ep01_branch_emotion','ep03_branch_counterattack','ending_crane','ending_future']})
 if authored or a.get('authoredNote'):changed.append({'nodeId':nid,'lines':authored,'note':a.get('authoredNote')})
assert len(manifest)==69 and len(auth)==69
out=G/'output/逃婚后我花千万雇了工地糙汉.v5.json';out.write_text(json.dumps(s,ensure_ascii=False,indent=2)+'\n');(B/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n');(B/'review/authored-changes.json').write_text(json.dumps(changed,ensure_ascii=False,indent=2)+'\n')
md=['# v5 无解说声音与表演稿','状态：69条分镜草案；5条样片制作，其余待样片与改编项复核。','原图结构保留；新增对白是改编，不冒充原作原句。','']
for r in manifest:
 n=s['nodes'][r['nodeId']];md+=['## '+r['videoId']+' '+r['title'],r['visualAction']]
 for sh in n['videos'][0]['shots']:
  md+=[f"- {l['speaker']}（{l['delivery']}）：{l['text']}" for l in sh['dialogue']]
 if not r['spokenLineCount']:md+=['- 无语言；仅现场声与合理的非语言反应。']
 if r['authoredNote']:md+=['- 待确认改编事实：'+r['authoredNote']]
 md+=['']
(B/'scripts/story-v5-review.md').write_text('\n'.join(md)+'\n');print('Serialized',len(manifest),'nodes',sum(r['spokenLineCount'] for r in manifest),'dialogue lines')
