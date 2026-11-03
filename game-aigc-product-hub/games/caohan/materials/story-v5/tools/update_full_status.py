import pathlib,json,hashlib,datetime
B=pathlib.Path(__file__).resolve().parents[1]
def read(p,default=[]):return json.loads((B/p).read_text()) if (B/p).exists() else default
tasks=read('scripts/full-tasks.json');images=read('scripts/full-image-tasks.json');frames=read('review/full-keyframe-decisions.json');dec=read('review/full-video-decisions.json');finals=read('review/full-delivery.json');status={'stage':'full_batch_authorized_in_production','updatedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'totalTargetVideos':69,'approvedPilotVideos':5,'remainingBatchVideos':64,'remainingBatchParts':len(tasks),'newPartsGenerated':sum(pathlib.Path(t['output']).exists() for t in tasks),'newPartsReviewed':sum(x['status']=='approved_for_delivery' for x in dec),'finalVideosReady':len(finals),'newKeyframesGenerated':sum(pathlib.Path(t['output']).exists() for t in images),'newKeyframesPlanned':len(images),'keyframeCorrectionsPending':[x['partId'] for x in frames if x['status']=='needs_keyframe_revision'],'videoCorrectionsPending':[x['partId'] for x in dec if x['status'].startswith('rejected')],'deliveryManifest':'review/full-delivery.json'}
current_ids={t['partId'] for t in tasks}
approved_ids={d['partId'] for d in dec if d['status']=='approved_for_delivery'}
status['newPartsReviewed']=sum(t['partId'] in approved_ids for t in tasks)
status['keyframeCorrectionsPending']=[d['partId'] for d in frames if d['partId'] in current_ids and d['status']=='needs_keyframe_revision']
status['videoCorrectionsPending']=[t['partId'] for t in tasks if '.r' in t['partId'] and t['partId'] not in approved_ids]
status['stage']='full_batch_reviewed' if len(finals)==69 else status['stage']
(B/'review/phase-summary.json').write_text(json.dumps(status,ensure_ascii=False,indent=2)+'\n')
text=f'''# v5 原生音画重制

用户已认可五条样片，并授权继续其余 64 条。全量为 55 条主剧情与 14 条结局，共 69 条。

当前已合成 **{len(finals)}/69 条**。剩余批次 {len(tasks)} 个生产片段中，{status['newPartsGenerated']} 个已生成，{status['newPartsReviewed']} 个通过逐段审核。生成不等于通过，实时证据以 [全量交付清单](review/full-delivery.json)、[阶段状态](review/phase-summary.json) 和审核记录为准。

新版声音标准：无解说、无内心 OS、无镜头或动作念白；仅人物真实对白、合理非语言反应与场景声，由 Kling 同次原生生成。旧视频仅提供视觉参考。

[五条已认可样片](pilot-review.md) · [全量分镜草案](scripts/story-v5-review.md) · [v5 剧本 JSON](../../output/逃婚后我花千万雇了工地糙汉.v5.json)

两处原待定事实采用保守改编：旧姓通过不露字的纸条与反应表达，不新增具体姓氏；只展示已保存通话条目，不编造未知录音内容。原图选项/广告文案保持原状，35 处广告首句一致性仍须在工程交付前对齐。

旧 v4 素材、原始剧本与当前 downstream 配置保留。当前工作为 v5 素材生产，尚未切换 CDN 交付。断点恢复使用 tools/run_full.py 与 .cache/media-jobs 里的既有任务；不要重新运行 prepare_full.py 覆盖已审核请求。
'''
(B/'README.md').write_text(text);print(json.dumps({k:status[k] for k in ['finalVideosReady','newPartsGenerated','newPartsReviewed','newKeyframesGenerated']},ensure_ascii=False))
