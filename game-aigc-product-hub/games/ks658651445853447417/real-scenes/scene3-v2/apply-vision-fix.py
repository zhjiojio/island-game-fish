#!/usr/bin/env python3
"""修复版：只在 EXIST_S3 = { ... } 范围内替换 lv10-29 的坐标"""
import json, re

BASE = "/Users/fat/Desktop/aiminigame/game-aigc-product-hub/games/ks693835817972937121"
EDITOR = "/Users/fat/Desktop/laotie-editor/src/editor-legacy.js"
ANNOT = f"{BASE}/real-scenes/scene3-v2/vision-annotations.json"

data = json.load(open(ANNOT))
levels_data = data["levels"]

def gen_exist_block(lv, arr):
    parts = []
    for it in arr:
        pid = re.sub(r'[^a-z0-9_]', '', it["id"].lower())[:30]
        x = max(0.5, min(95, float(it["x"])))
        y = max(0.5, min(95, float(it["y"])))
        w = max(1.5, min(10, float(it["w"])))
        h = max(1.5, min(10, float(it["h"])))
        tag = it["zh"]
        parts.append(f"    {{prop:'{pid}', x:{x:5.1f}, y:{y:5.1f}, w:{w:4.1f}, h:{h:4.1f}, tag:'{tag}'}}")
    return f"  {lv}: [\n" + ",\n".join(parts) + "\n  ]"

e = open(EDITOR).read()

# 定位 EXIST_S3 范围
m = re.search(r"const EXIST_S3 = \{[\s\S]*?\n\};", e)
if not m:
    print("❌ 找不到 EXIST_S3"); exit(1)
s3_start, s3_end = m.start(), m.end()
s3_body = e[s3_start:s3_end]
print(f"EXIST_S3 位于 {s3_start}-{s3_end}, {s3_end-s3_start} 字节")

# 在 EXIST_S3 范围内替换 lv10-29
for lv_s in sorted(levels_data.keys(), key=int):
    lv = int(lv_s)
    new_block = gen_exist_block(lv, levels_data[lv_s])
    # 只在 s3_body 内做替换
    pat = re.compile(r"^  " + str(lv) + r": \[\n[\s\S]*?\n  \]", re.MULTILINE)
    matches = list(pat.finditer(s3_body))
    if not matches:
        print(f"⚠️  EXIST_S3[{lv}] 未找到"); continue
    # 用最后一个匹配（EXIST_S3 里的那个）
    match = matches[-1]
    s3_body = s3_body[:match.start()] + new_block + s3_body[match.end():]
    print(f"✅ EXIST_S3[{lv}] 覆盖 {len(levels_data[lv_s])} 物件 (从 '{levels_data[lv_s][0]['zh']}' 开始)")

# 拼回
e = e[:s3_start] + s3_body + e[s3_end:]
open(EDITOR, "w").write(e)

# 语法校验
import subprocess
r = subprocess.run(["node","--check",EDITOR], capture_output=True, text=True)
print("语法:", "✅" if r.returncode==0 else "❌ "+r.stderr)
