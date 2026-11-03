import pathlib,json
B=pathlib.Path(__file__).resolve().parents[1];story=json.loads((B.parent.parent/'output/逃婚后我花千万雇了工地糙汉.v5.json').read_text());by={t['partId']:t for t in json.loads((B/'scripts/full-tasks.json').read_text())};dec=json.loads((B/'review/full-keyframe-decisions.json').read_text());jobs=[]
fixes={
'ep01_branch_counterattack_video_01__p01':'仅将左侧端牛奶杯的年轻男性服装换为黑色西装外套、白衬衫、黑领带。脸、发型、手、杯子、女主及房间全部保持不变。',
'ep02_branch_truth_video_01__p01':'仅将女主酒红礼服换成浅灰色敞开外套、白色内搭、黑色长裤。保持她的脸、手机、手、陈劲及摩托场景不变。',
'ep03_scene_00_video_01__p01':'仅将女主酒红礼服换成浅灰色敞开外套、白色内搭、黑色长裤。保持她的脸、蹲地动作、头盔、陈劲、纸巾与道路场景。',
'ep03_branch_emotion_video_01__p01':'女主仍蹲坐路沿，手轻扯陈劲衣角。只调整陈劲：他必须直立站在女主侧前方，不能蹲着，手握未打开的水瓶，准备听她说话。保持两人的脸与灰外套/黑T恤服装。',
'ep04_scene_00_video_01__p01':'仅修正两点：彻底删除后座的第三个男人，后排应完全空着；女主红裙改为浅灰外套、白内搭、黑长裤。陈劲保持驾驶位，女主保持副驾，两人脸部身份不变。后视镜只能看到道路上远处一辆黑车，不能有任何乘客人脸。',
'ep07_scene_00_video_01__p01':'仅替换客厅中央正面站立、穿黑西装白衬衫黑领带的男人的脸和发型，替换成参考图2中的短发年轻许邵泽。不能使用中年父亲面孔。后排坐在沙发上的父亲与母亲、前景女主和陈劲背影、服装、场景全部保持不变。',
'ep07_branch_emotion_video_01__p01':'仅替换右侧向女主伸手的黑西装男人的脸和发型，换成参考图2中短发年轻许邵泽，不能是中年贺铭。黑西装、白衬衫、黑领带与伸手姿势不变，女主、陈劲与房间完全保留。',
'ep07_branch_counterattack_video_01__p01':'仅替换最左侧黑外套男性：必须变为参考图2中的陈劲脸型、发型、体格，并穿合身黑T恤，不穿外套。保留他身旁女主、黑西装父亲和最右侧许邵泽不变；人物总数仍为四人，原场景与手机保持不变。',
'ep09_branch_truth_video_01__p01':'生成非黑屏的清晰写实电影画面。明亮书桌旁，女主白衬衣白内搭黑裤与陈劲黑T恤对坐，两人侧脸均清楚可见，目光相对，完整合同及附加纸张放在桌上。只有这两个人，没有西装男。参考图2锁定女主，参考图3锁定陈劲。所有文字虚焦。'
}
for d in dec:
 if d['status']!='needs_keyframe_revision':continue
 pid=d['partId'];t=by[pid];refs=[t['keyframe']]
 if pid.startswith('ep07_scene_00') or pid.startswith('ep07_branch_emotion'):refs.append(story['characters']['xushaoze']['referenceImage'])
 if pid.startswith('ep07_branch_counterattack'):refs.append(story['characters']['chenjin']['referenceImage'])
 if pid=='ep09_branch_truth_video_01__p01':refs=[str(B/'keyframes/ep09_branch_truth_video_01__full-source.png'),story['characters']['hexingran']['referenceImage'],story['characters']['chenjin']['referenceImage']]
 req=B/'requests'/(pid+'.keyframe-r2.json');req.write_text(json.dumps({'task':'edit','prompt':'对参考图做精确局部修正，保持9:16写实电影风格，单一画面，无字幕水印，不生成拼图。'+fixes[pid],'references':refs,'aspectRatio':'9:16','resolution':'1K','quality':'low'},ensure_ascii=False,indent=2)+'\n');jobs.append({'partId':pid+'.keyframe-r2','basePartId':pid,'request':str(req),'output':str(B/'keyframes'/(pid+'.keyframe-r2.png'))})
(B/'scripts/full-image-retry-tasks.json').write_text(json.dumps(jobs,ensure_ascii=False,indent=2)+'\n');print('Prepared',len(jobs),'local frame corrections')
