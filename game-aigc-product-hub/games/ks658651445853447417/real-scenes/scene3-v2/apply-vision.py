#!/usr/bin/env python3
"""
把 vision-annotations.json 反向覆盖：
1. editor SCENE_META[3].levels 里 lv10-29 的 hint（保留 title/duration，只对齐 items 数）
2. editor EXIST_S3 里 lv:10-29
3. editor PROP_META 补新物件
4. levels.js LEVELS 里 idx:30-49 的 odds
5. levels.js M3.PROPS 补新物件
"""
import json, re

BASE = "/Users/fat/Desktop/aiminigame/game-aigc-product-hub/games/ks693835817972937121"
EDITOR = "/Users/fat/Desktop/laotie-editor/src/editor-legacy.js"
LEVELS = f"{BASE}/package/js/levels.js"
ANNOT = f"{BASE}/real-scenes/scene3-v2/vision-annotations.json"

data = json.load(open(ANNOT))
levels_data = data["levels"]  # {"10": [...], ...}

# 去重 & 提取全部物件字典
all_props = {}   # id -> (zh, emoji)
for lv_s, arr in levels_data.items():
    for it in arr:
        pid = re.sub(r'[^a-z0-9_]', '', it["id"].lower())[:30] or f"item_{lv_s}"
        it["id"] = pid  # 规范化
        if pid not in all_props:
            all_props[pid] = (it["zh"], it["emoji"])

print(f"全部去重物件：{len(all_props)} 个")

# ═════════ 生成 EXIST_S3 每关 block ═════════
def gen_exist_block(lv, arr):
    lines = [f"  {lv}: ["]
    parts = []
    for it in arr:
        pid = it["id"]
        # clamp
        x = max(0.5, min(95, float(it["x"])))
        y = max(0.5, min(95, float(it["y"])))
        w = max(1.5, min(10, float(it["w"])))
        h = max(1.5, min(10, float(it["h"])))
        tag = it["zh"]
        parts.append(f"    {{prop:'{pid}', x:{x:5.1f}, y:{y:5.1f}, w:{w:4.1f}, h:{h:4.1f}, tag:'{tag}'}}")
    lines.append(",\n".join(parts))
    lines.append("  ]")
    return "\n".join(lines)

# ═════════ 生成 LEVELS odds ═════════
def gen_odds_levels(arr, indent=8):
    sp = " " * indent
    parts = []
    for it in arr:
        pid = it["id"]
        x = max(0.5, min(95, float(it["x"])))
        y = max(0.5, min(95, float(it["y"])))
        w = max(1.5, min(10, float(it["w"])))
        h = max(1.5, min(10, float(it["h"])))
        tag = it["zh"]
        parts.append(f"{sp}{{prop:'{pid}', x:{x:5.1f}, y:{y:5.1f}, w:{w:4.1f}, h:{h:4.1f}, tag:'{tag}'}}")
    return ",\n".join(parts)

# ═════════ 更新 EDITOR ═════════
e = open(EDITOR).read()

# EXIST_S3 每关
for lv_s in sorted(levels_data.keys(), key=int):
    lv = int(lv_s)
    new_block = gen_exist_block(lv, levels_data[lv_s])
    # 找 "  {lv}: [\n...\n  ]" 结构
    pat = re.compile(r"  " + str(lv) + r": \[\n[\s\S]*?\n  \]", re.MULTILINE)
    m = pat.search(e)
    if m:
        e = e.replace(m.group(0), new_block)
        print(f"✅ editor EXIST_S3[{lv}] 覆盖 {len(levels_data[lv_s])} 物件")
    else:
        print(f"⚠️  editor EXIST_S3[{lv}] 未找到（先插入）")

# PROP_META 全量替换（含所有新老物件）
m = re.search(r"(const PROP_META = \{)([\s\S]*?)(\n\};)", e)
if m:
    existing_block = m.group(2)
    # 提取已有 id 集合
    existing_ids = set(re.findall(r"^\s*([a-z_0-9]+):\s*\{emoji:", existing_block, flags=re.MULTILINE))
    # 补新
    add_lines = []
    for pid, (zh, emoji) in all_props.items():
        if pid not in existing_ids:
            add_lines.append(f"  {pid}:{{emoji:'{emoji}',name:'{zh}'}}")
    if add_lines:
        # 在最后 } 前追加
        insertion = ",\n" + ",\n".join(add_lines)
        e = e[:m.end(2)] + insertion + e[m.end(2):]
        print(f"✅ editor PROP_META 追加 {len(add_lines)} 新物件")

open(EDITOR, "w").write(e)

# ═════════ 更新 LEVELS.JS ═════════
lv = open(LEVELS).read()

# LEVELS 关卡 odds
for lv_s in sorted(levels_data.keys(), key=int):
    lv_num = int(lv_s)
    idx = 20 + lv_num
    new_odds = gen_odds_levels(levels_data[lv_s])
    # 找 { idx:XX, themeId:X, mode:'hunt', ... odds:[ ... ] }
    pat = re.compile(r"(    \{ idx:" + str(idx) + r", themeId:\d, mode:'hunt',[\s\S]*?odds:\[)\n[\s\S]*?(\n\s{6}\] \})", re.MULTILINE)
    m = pat.search(lv)
    if m:
        lv = lv[:m.end(1)] + "\n" + new_odds + m.group(2) + lv[m.end():]
        print(f"✅ levels.js idx:{idx} (lv{lv_num}) odds 覆盖")

# M3.PROPS 全量补
m = re.search(r"(var P = M3\.PROPS = \{)([\s\S]*?)(\n  \};)", lv)
if m:
    existing_block = m.group(2)
    existing_ids = set(re.findall(r"^\s*([a-z_0-9]+):\s*\{", existing_block, flags=re.MULTILINE))
    add_lines = []
    for pid, (zh, emoji) in all_props.items():
        if pid not in existing_ids:
            add_lines.append(f"    {pid}: {{ emoji:'{emoji}', name:'{zh}' }}")
    if add_lines:
        insertion = ",\n" + ",\n".join(add_lines)
        lv = lv[:m.end(2)] + insertion + lv[m.end(2):]
        print(f"✅ levels.js M3.PROPS 追加 {len(add_lines)} 新物件")

open(LEVELS, "w").write(lv)
print("=== 全部完成 ===")
