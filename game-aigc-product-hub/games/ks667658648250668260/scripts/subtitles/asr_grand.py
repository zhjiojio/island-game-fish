#!/usr/bin/env python3
"""Single-file ASR for n5_fix_b_grand — get real char timestamps."""
import json, subprocess, sys, re
from pathlib import Path
from funasr import AutoModel

VIDEO = Path("/Users/fat/weihunqi/work/ep05_videos/compressed/n5_fix_b_grand.mp4")
WAV = Path("/tmp/n5_fix_b_grand.wav")
OUT = Path("/Users/fat/weihunqi/scripts/subtitles/output/n5_fix_b_grand.json")

subprocess.run(["ffmpeg","-y","-i",str(VIDEO),"-vn","-ac","1","-ar","16000","-f","wav",str(WAV)],
               check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

m = AutoModel(model="paraformer-zh", vad_model="fsmn-vad", punc_model="ct-punc", disable_update=True)
res = m.generate(input=str(WAV))
r = res[0]
text = r.get("text","")
ts = r.get("timestamp",[])
raw = re.sub(r"[^\u4e00-\u9fff]", "", text)
chars=[]
for i,ch in enumerate(raw):
    if i < len(ts):
        chars.append([round(ts[i][0]/1000,3), round(ts[i][1]/1000,3), ch])
dur = float(subprocess.run(["ffprobe","-v","error","-show_entries","format=duration",
        "-of","default=noprint_wrappers=1:nokey=1",str(VIDEO)],capture_output=True,text=True).stdout.strip())
out={"video":"n5_fix_b_grand.mp4","duration":dur,"text":text,"rawText":raw,"asrChars":chars}
OUT.write_text(json.dumps(out,ensure_ascii=False,indent=1),encoding="utf-8")
print("TEXT:",text)
print("RAW:",raw)
print("CHARS:",json.dumps(chars,ensure_ascii=False))
print("DUR:",dur)
