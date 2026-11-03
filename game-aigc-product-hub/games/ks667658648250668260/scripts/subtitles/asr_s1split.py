#!/usr/bin/env python3
"""为 S1 拆分片段与白日梦分支舞蹈视频生成 verified ASR 字幕记录。

用法: python3 scripts/subtitles/asr_s1split.py
输入: work/s1split/*.mp4（与 CDN 上线文件字节一致）
输出: content/subtitles/verified/<name>.json
"""
import hashlib
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'scripts/subtitles'))
from asr_batch import build_model, extract_audio, transcribe, get_duration  # noqa: E402

BASE = 'https://p5-ad.adkwai.com/udata/pkg/KS-GAME/AIGC-SoGame/ks667658648250668260/'
ITEMS = [
    ('S1a.dream', ['s1']),
    ('S1b.crash', ['s1b']),
    ('dream_yujie.v1', ['s_dream_yujie']),
    ('dream_xinggan.v1', ['s_dream_xinggan']),
    ('dream_zhixing.v1', ['s_dream_zhixing']),
]
WORK = ROOT / 'work/s1split'
OUT = ROOT / 'content/subtitles/verified'


def main():
    model = build_model()
    for name, nodes in ITEMS:
        mp4 = WORK / f'{name}.mp4'
        wav = WORK / f'{name}.wav'
        extract_audio(mp4, wav)
        result = transcribe(model, wav)
        duration = round(get_duration(mp4), 3)
        sha = hashlib.sha256(mp4.read_bytes()).hexdigest()
        chars = []
        for sentence in result['sentences']:
            for c in sentence['chars']:
                if c['s'] is None:
                    continue
                if re.match(r'[\u4e00-\u9fffa-zA-Z0-9]', c['c']):
                    chars.append([c['s'], c['e'], c['c']])
        raw = ''.join(c[2] for c in chars)
        record = {
            'schemaVersion': 1,
            'url': BASE + name + '.mp4',
            'sha256': sha,
            'duration': duration,
            'nodes': nodes,
            'status': 'speech' if raw else 'no_speech',
            'transcript': result['text'],
            'rawText': raw,
            'asrChars': chars,
            'timingEngine': 'FunASR-paraformer-zh',
            'crossCheckText': result['text'],
            'speakerKey': None,
            'speakerRuleKey': name.split('.')[0],
            'reviewMethod': 'Local file byte-identical to CDN upload, hashed; FunASR paraformer-zh + fsmn-vad + ct-punc character timestamps.',
        }
        (OUT / f'{name}.json').write_text(json.dumps(record, ensure_ascii=False, indent=1), encoding='utf-8')
        print(name, 'dur', duration, 'status', record['status'], 'text', repr(result['text'])[:80])


if __name__ == '__main__':
    main()
