#!/usr/bin/env python3
"""批量 ASR EP05 缺字幕视频 -> content/subtitles/verified/*.json
- FunASR paraformer-zh 拿真实字符时间轴
- 无语音的自动标 status=no_speech
"""
import json, subprocess, re, hashlib
from pathlib import Path
from funasr import AutoModel

COMP = Path("/Users/fat/weihunqi/work/ep05_videos/compressed")
VERIFIED = Path("/Users/fat/weihunqi/content/subtitles/verified")
CDN = "https://p5-ad.adkwai.com/udata/pkg/KS-GAME/AIGC-SoGame/ks667658648250668260/"

# 缺字幕的 26 个（已有 n5s3 / n5_fix_b_grand 跳过）
NAMES = ["n5_biz_a","n5_biz_b","n5_biz_c","n5_bridge","n5_drink_a","n5_drink_b",
"n5_drink_c","n5_drink_peak","n5_fix_a","n5_fix_b","n5_fix_c","n5_rub_a","n5_rub_a2",
"n5_rub_b","n5_rub_b2","n5_rub_c","n5s0a","n5s0b","n5s1","n5s2","n5s4","n5s5","n5s6",
"n5s7","n5s8","n5s8b"]

def dur(p):
    return float(subprocess.run(["ffprobe","-v","error","-show_entries","format=duration",
        "-of","default=noprint_wrappers=1:nokey=1",str(p)],capture_output=True,text=True).stdout.strip() or 0)

def sha(p):
    return hashlib.sha256(p.read_bytes()).hexdigest()

m = AutoModel(model="paraformer-zh", vad_model="fsmn-vad", punc_model="ct-punc", disable_update=True)

for name in NAMES:
    vp = COMP / f"{name}.mp4"
    if not vp.exists():
        print(f"SKIP-MISSING {name}"); continue
    wav = Path(f"/tmp/asr_{name}.wav")
    subprocess.run(["ffmpeg","-y","-i",str(vp),"-vn","-ac","1","-ar","16000","-f","wav",str(wav)],
                   check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    res = m.generate(input=str(wav))
    r = res[0] if res else {}
    text = r.get("text","") or ""
    ts = r.get("timestamp",[]) or []
    raw = re.sub(r"[^\u4e00-\u9fff]","",text)
    chars = []
    for i,ch in enumerate(raw):
        if i < len(ts):
            chars.append([round(ts[i][0]/1000,3), round(ts[i][1]/1000,3), ch])
    d = round(dur(vp),3)
    status = "speech" if raw else "no_speech"
    data = {
        "schemaVersion":1,
        "url": CDN + f"{name}.mp4",
        "sha256": sha(vp),
        "duration": d,
        "nodes": [],
        "status": status,
        "transcript": text if raw else "",
        "rawText": raw,
        "asrChars": chars,
        "timingEngine": "asr-anchor(funasr-paraformer)",
        "reviewMethod": "batch ASR auto (needs human proof-read for punctuation/speaker)."
    }
    (VERIFIED / f"{name}.json").write_text(json.dumps(data,ensure_ascii=False,indent=1),encoding="utf-8")
    print(f"[{status}] {name}: {text[:40]}",flush=True)
print("=== BATCH DONE ===")
