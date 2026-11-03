import pathlib,json,sys,hashlib
B=pathlib.Path(__file__).resolve().parents[1];G=B.parent.parent;WF=G.parents[2]/'game-aigc-workflow';sys.path.insert(0,str(WF/'skills/agw-story2game/scripts'))
from validate import compile_sound_contract,validate_sound_policy
story=json.loads((G/'output/逃婚后我花千万雇了工地糙汉.v5.json').read_text());assert not validate_sound_policy(story)
frames=json.loads((B/'references/pilot-frames.json').read_text());by={r['partId']:r for r in frames};tasks=[]
# Selected source frames were inspected in pilot-keyframes.jpg. No generated frame is auto-approved.
for r in frames:r.update(status='approved_for_pilot',reviewEvidence='review/pilot-keyframes.jpg',reviewNote='人物外观、服装、站位及场景与原片一致；第二帧为坠落中段，样片从此动作继续。')
(B/'references/pilot-frames.json').write_text(json.dumps(frames,ensure_ascii=False,indent=2)+'\n')
for nid in ['ep01_scene_00','ep01_branch_emotion','ep03_branch_counterattack','ending_crane','ending_future']:
 n=story['nodes'][nid];v=n['videos'][0];vid=v['id'];contract=compile_sound_contract(story,vid);(B/'scripts'/(vid+'.sound-contract.json')).write_text(json.dumps(contract,ensure_ascii=False,indent=2)+'\n')
 for j,sh in enumerate(v['shots'],1):
  part=vid+f'__p{j:02d}';fr=by[part];assert hashlib.sha256(pathlib.Path(fr['keyframe']).read_bytes()).hexdigest()==fr['keyframeSha256'];lines=[l for l in contract['spokenWhitelist'] if l['shotId']==sh['id']]
  prompt=f"{sh['durationSec']}秒，9:16写实电影短剧。延续参考首帧的人物身份、脸型、发型、服装、场景、光线和空间轴线，自然表演。\n画面导演说明（不发声）：{sh['visual']['videoPrompt']}\n"
  for cid in sh['characters']:prompt+=f"人物{cid}：{story['characters'][cid]['name']}；{story['characters'][cid].get('voiceAnchor','自然普通话')}。\n"
  prompt+='声音：仅下列带引号文本允许成为语言。人名、情绪、时间和导演说明不发声；对白以外没有解说或内心独白。\n'
  for l in lines:
   pos='画面中本人' if l['delivery']=='on_screen' else '场景内画外人物；画中人只听，不做说话口型' if l['delivery']=='off_screen' else '电话另一端人物'
   start=round(l['startSec']-sh['startSec'],2);end=round(l['endSec']-sh['startSec'],2)
   prompt+=f"{start}—{end}秒，{l['speaker']}（{pos}）自然说：『{l['text']}』。\n"
  if not lines:prompt+='本镜头没有语言对白，任何人物都不说话。\n'
  a=sh['audio'];prompt+=f"同期现场声：{a['ambient']}；"+'；'.join(a['sfx'])+'。'+('允许短促非语言惊呼与呼吸，不说字词。' if a['vocalizations'] else '')+'不加配乐、不加歌声。对白与口型、动作声与动作必须在本次任务同步生成。不要在成片写字幕、人名、标点、水印，不添加账号或数字，不自行增加台词。完整衣着，不展示伤口。'
  req={'prompt':prompt,'image':fr['keyframe'],'durationSec':sh['durationSec'],'aspectRatio':'9:16','generateAudio':True}
  p=B/'requests'/(part+'.json');p.write_text(json.dumps(req,ensure_ascii=False,indent=2)+'\n');tasks.append({'partId':part,'videoId':vid,'shotId':sh['id'],'request':str(p.resolve()),'requestSha256':hashlib.sha256(p.read_bytes()).hexdigest(),'output':str((B/'video'/(part+'.mp4')).resolve()),'jobFile':str((B/'.cache/media-jobs'/(part+'.json')).resolve()),'durationSec':sh['durationSec'],'expectedSpeech':lines,'approvedReference':fr})
(B/'scripts/pilot-tasks.json').write_text(json.dumps(tasks,ensure_ascii=False,indent=2)+'\n');print('Prepared',len(tasks),'parts for5pilots')
