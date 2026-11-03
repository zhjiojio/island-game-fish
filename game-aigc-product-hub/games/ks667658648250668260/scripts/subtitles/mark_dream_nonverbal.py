#!/usr/bin/env python3
"""把白日梦分支舞蹈视频的 ASR 记录改判为 nonverbal。

这三支素材只有背景音乐，没有台词。Paraformer 会把歌声硬识别成
「One伟大伟大…」「嗯」之类的乱码，直接上屏会污染画面，因此清空
transcript/asrChars 并改判 nonverbal（build_subtitles_js.py 允许该
状态 transcript 为空，运行时不渲染字幕）。

用法: python3 scripts/subtitles/mark_dream_nonverbal.py
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
VERIFIED = ROOT / 'content/subtitles/verified'
TARGETS = ['dream_yujie.v1', 'dream_xinggan.v1', 'dream_zhixing.v1']
NOTE = ('Dance-only reference footage: background music without dialogue. '
        'Paraformer hallucinated lyrics, so transcript is intentionally empty.')

for name in TARGETS:
    path = VERIFIED / f'{name}.json'
    record = json.loads(path.read_text(encoding='utf-8'))
    record['status'] = 'nonverbal'
    record['transcript'] = ''
    record['rawText'] = ''
    record['asrChars'] = []
    record['crossCheckText'] = ''
    record['reviewMethod'] = NOTE
    path.write_text(json.dumps(record, ensure_ascii=False, indent=1), encoding='utf-8')
    print(name, '->', record['status'])
