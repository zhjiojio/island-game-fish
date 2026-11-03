#!/usr/bin/env python3
"""Post-process ASR output: fix wrong-recognized names/words (homophone errors).

FunASR 不认识我们的人物名，需要在识别后按字典替换。

改动策略：
- 只在 sentence.text 里做字符串替换
- 逐字 chars 也同步替换（保留时间戳，只替换字符本身）
- 长度不变的替换（1↔1 字）直接改；长度变化的（如 "和珅婉儿"→"沈婉儿"）保留最先出现的时间戳
"""
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
OUT = HERE / "output"

# 字典（长优先短）
FIXES = [
    # 3 字/4 字 → 3 字：合并时间戳
    ("和珅婉儿", "沈婉儿"),
    # 同长度替换
    ("饿死丁", "饿死你"),
    ("奥田",   "傲天"),
    # 一整亩哦，天  →  一整亩，傲天（"哦，天" 3 字 → "，傲天" 3 字）
    ("一整亩哦，天", "一整亩，傲天"),
    # S6：「技能激活」被识别成「竟能激活」/「既能激活」
    ("竟能激活", "技能激活"),
    ("既能激活", "技能激活"),
    # S6：「饿死！叮——技能激活」被识别成「饿死你，竟能激活」
    #     "你，" 是ASR把"！叮——" 识别错的，去掉
    ("饿死你，技能激活", "饿死！技能激活"),
    # S5：原文是「挖野菜。傲天才醒（傲天刚睡醒），不能让他知道」
    #     ASR 识别成「挖野菜傲天才行」—— 少了句号，"醒"识别成"行"
    ("挖野菜傲天才行", "挖野菜。傲天才醒"),
    # ⚠️ 不要动 S4「我是你义兄」！——原剧本就是"义兄"（未过门的嫂子情境下的自称），不是同音错字
    # side05_jazz：「嗯，傲天」被识别成「不是傲天」
    ("不是傲天我跳", "傲天，我跳"),
    # 出门前的兜底：不是傲天 → 傲天问：（保守，不改）
]

def fix_chars(chars, old, new):
    """在 chars 数组里做整段替换，返回新的 chars。若时长差异，合并/拆分处理。"""
    text = ''.join(c.get('c','') for c in chars)
    if old not in text:
        return chars, False
    result = []
    i = 0
    changed = False
    while i < len(chars):
        # 检查是否从 i 开始匹配 old
        seg = ''.join(c.get('c','') for c in chars[i:i+len(old)])
        if seg == old:
            changed = True
            # 取 old 对应的 chars 的起止时间
            span = chars[i:i+len(old)]
            valid = [c for c in span if c.get('s') is not None]
            s0 = valid[0]['s'] if valid else None
            e0 = valid[-1]['e'] if valid else None
            # 均匀分配时间给 new 字符
            if s0 is not None and e0 is not None and len(new) > 0:
                dur = (e0 - s0) / len(new)
                for k, ch in enumerate(new):
                    result.append({
                        'c': ch,
                        's': round(s0 + dur * k, 3),
                        'e': round(s0 + dur * (k+1), 3)
                    })
            else:
                for ch in new:
                    result.append({'c': ch, 's': None, 'e': None})
            i += len(old)
        else:
            result.append(chars[i])
            i += 1
    return result, changed

def process_file(f):
    d = json.loads(f.read_text(encoding='utf-8'))
    changed_any = False
    if 'text' in d:
        new_text = d['text']
        for old, new in FIXES:
            if old in new_text:
                new_text = new_text.replace(old, new)
                changed_any = True
        d['text'] = new_text
    for sent in d.get('sentences', []):
        for old, new in FIXES:
            if old in sent['text']:
                sent['text'] = sent['text'].replace(old, new)
                changed_any = True
        for old, new in FIXES:
            new_chars, c = fix_chars(sent['chars'], old, new)
            if c:
                sent['chars'] = new_chars
                changed_any = True
    if changed_any:
        f.write_text(json.dumps(d, ensure_ascii=False, indent=2), encoding='utf-8')
    return changed_any

if __name__ == '__main__':
    n = 0
    for f in sorted(OUT.glob('*.json')):
        if f.name == '_index.json': continue
        if process_file(f):
            n += 1
            print(f'  fixed: {f.name}')
    print(f'\nDone. {n} files updated.')
