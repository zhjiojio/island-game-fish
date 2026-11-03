"""Compile remaining scene requests. Generation requires separate frame decisions."""
import pathlib,json,sys,hashlib,cv2
B=pathlib.Path(__file__).resolve().parents[1];G=B.parent.parent;WF=G.parents[2]/'game-aigc-workflow';sys.path.insert(0,str(WF/'skills/agw-story2game/scripts'))
from validate import compile_sound_contract,validate_sound_policy
S=G/'output/逃婚后我花千万雇了工地糙汉.v5.json';story=json.loads(S.read_text());assert not validate_sound_policy(story)
pilots={x['videoId'] for x in json.loads((B/'review/pilot-delivery.json').read_text())};base={x['videoId']:x for x in json.loads((B/'references/full-frames.json').read_text())};tasks=[];images=[];contracts=[]
reuse={'ep01_branch_truth_video_01','ep03_branch_truth_video_01','ep05_scene_00_video_01','ep05_branch_truth_video_01','ep05_branch_conditional_video_01','ep06_branch_conditional_video_01','ep11_branch_emotion_video_01','ending_loop','ending_romance','ending_regret'}
for nid,n in story['nodes'].items():
 for v in n.get('videos',[]):
  vid=v['id'];contract=compile_sound_contract(story,vid);contracts.append(contract)
  if vid in pilots:continue
  for j,sh in enumerate(v['shots'],1):
   pid=vid+f'__p{j:02d}';src=base[vid]['keyframe'];out=B/'keyframes'/(pid+'.png');lines=[l for l in contract['spokenWhitelist'] if l['shotId']==sh['id']];refs=[src];cast=[]
   for cid in sh['characters']:
    c=story['characters'][cid];cast.append(c['name'])
    if c.get('referenceImage'):refs.append(c['referenceImage'])
   # Freeze initial state; face sheets constrain identity, source frame constrains costume and lighting.
   prompt='生成一张9:16写实电影短剧首帧，单一画面，没有拼图、标题、字幕或文字标签。参考图1来自旧视频，沿用其人物服装、真实皮肤与电影质感；后续人物设定图只锁定脸型五官与年龄，不照搬设定图排版和白背景。\n'
   prompt+='本镜头地点：'+sh['locationId']+'，'+sh['timeOfDay']+'。画面应准备发生：'+sh['visual']['videoPrompt']+'\n只冻结上述行动即将开始的第一个瞬间，不把行动过程或结局同时画进图，不写任何对白。'
   prompt+='出镜人物：'+('、'.join(cast) if cast else '没有人类人物')+'。未列出的人物请移除。'
   for idx,cid in enumerate([cid for cid in sh['characters'] if story['characters'][cid].get('referenceImage')],2):prompt+=f'参考图{idx}是{story["characters"][cid]["name"]}的脸部身份，必须准确保持。'
   prompt+='陈劲保持黑色或深灰合身T恤与工装裤；许邵泽保持西装或当前场景明确要求的工装，不能与陈劲换脸。女主第1集酒红长裙，第2至4集灰外套白内搭黑裤，第5集白色长袖睡衣与被子完整遮挡，第6集起白色衬衣/外套配黑裤；结局优先采用参考图的结局服装。所有人物是成年人，完整穿衣。手指自然，手机纸张避免任何可辨账号数字。'
   if 'pursuer' in sh['characters']:prompt+='追兵只作远处侧背身、面目不清的黑衣成年男性，不使用任何主角的脸。'
   image_request=B/'requests'/(pid+'.keyframe.json');image_request.write_text(json.dumps({'task':'edit','prompt':prompt,'references':refs,'aspectRatio':'9:16','resolution':'1K','quality':'low'},ensure_ascii=False,indent=2)+'\n')
   if vid in reuse and j==1:
    import shutil
    shutil.copyfile(src,out)
   else:images.append({'partId':pid,'request':str(image_request),'output':str(out),'status':'pending_generation'})
   vp=f"{sh['durationSec']}秒9:16写实电影短剧。严格延续已审核首帧的人物脸型、年龄、服装、位置、场景。表演真实克制，人物先听完再回答。\n只用于画面的导演说明，不朗读：{sh['visual']['videoPrompt']}\n"
   vp+='人物身份：'+ '；'.join(story['characters'][c]['name']+'='+('成年长黑发女性' if c=='hexingran' else '黑T恤肌肉成年男性' if c=='chenjin' else '穿西装的年轻成年男性' if c=='xushaoze' else '灰发老年管家' if c=='zhoubo' else story['characters'][c]['appearanceAnchor']) for c in sh['characters'])+'。这些身份标签不发声。\n'
   vp+='唯一允许说出的语言如下，必须逐字完整保留，不加开场称呼、不加总结、不念角色标签：\n'
   for l in lines:
    who='画面中本人' if l['delivery']=='on_screen' else '通过手机播放的真实人物声音，画面中人只听并闭嘴' if nid in ('ep01_branch_conditional','ep07_branch_counterattack') else '画外真实人物，画中人不替读'
    vp+=f"{max(0,l['startSec']-sh['startSec']):.2f}至{l['endSec']-sh['startSec']:.2f}秒，{l['speaker']}（{who}）说『{l['text']}』。\n"
   if not lines:vp+='没有任何语言对白，所有人保持不说话。\n'
   a=sh['audio'];vp+='同期声音：'+a['ambient']+'；'+'；'.join(a['sfx'])+'。'
   if a['vocalizations']:vp+='仅按动作同步生成自然非语言呼吸、惊呼或咳嗽，不说字词。'
   vp+='环境与必要动作音效清晰但低于人物声；不要配乐、歌声、解说、旁白、内心OS、运镜或动作念白。人物嘴型与本人对白在本次任务同步生成，不让别人代说。说完自然停顿，不添任何语言，不生成字幕水印或账号数字。完整衣着，避免伤口。'
   req=B/'requests'/(pid+'.json');req.write_text(json.dumps({'prompt':vp,'image':str(out),'durationSec':sh['durationSec'],'aspectRatio':'9:16','generateAudio':True},ensure_ascii=False,indent=2)+'\n')
   tasks.append({'partId':pid,'videoId':vid,'nodeId':nid,'shotId':sh['id'],'request':str(req),'requestSha256':hashlib.sha256(req.read_bytes()).hexdigest(),'output':str(B/'video'/(pid+'.mp4')),'jobFile':str(B/'.cache/media-jobs'/(pid+'.json')),'durationSec':sh['durationSec'],'expectedSpeech':lines,'requiredSound':a,'keyframe':str(out),'referenceVideo':base[vid]['referenceVideo'],'reuseSourceFrame':vid in reuse and j==1})
(B/'scripts/full-tasks.json').write_text(json.dumps(tasks,ensure_ascii=False,indent=2)+'\n');(B/'scripts/full-image-tasks.json').write_text(json.dumps(images,ensure_ascii=False,indent=2)+'\n');(B/'scripts/all-sound-contracts.json').write_text(json.dumps(contracts,ensure_ascii=False,indent=2)+'\n')
print('Remaining',len(tasks),'parts;',len(images),'new keyframes;',len(reuse),'source frame reuse candidates')
