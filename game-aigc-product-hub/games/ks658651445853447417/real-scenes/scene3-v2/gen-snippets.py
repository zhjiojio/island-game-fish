#!/usr/bin/env python3
"""从 cities-20.json 生成 20 关的骨架代码片段。
输出四段:
  1. SCENE_META[3].levels 追加项（editor-legacy.js）
  2. EXIST_S3 追加项 lv:10..29（editor-legacy.js）
  3. PROP_META 追加项（editor-legacy.js）
  4. M3.PROPS 追加项（levels.js）
  5. LEVELS 追加 20 条 hunt 关卡（levels.js）
坐标使用「均匀 AI 预标」：把画面分 4 列 × 2 行的 8 格网络，每关 items 数量对应挑格，物件小尺寸 3-5%。
"""
import json, sys, os
os.chdir(os.path.dirname(__file__))
d = json.load(open("cities-20.json"))
cities = d["cities"]

# ═════════ 1. SCENE_META[3].levels 新增 20 项 ═════════
scene_meta = []
for c in cities:
    lv, city, scene, items, dur, hs = c["lv"], c["city"], c["scene"], c["items"], c["duration"], c["hitScale"]
    label_map = {"进阶":"进阶", "困难":"困难", "地狱":"地狱", "极地狱":"极地狱"}
    hell = c["difficulty"] in ("地狱", "极地狱")
    hint_prefix = {"进阶":"", "困难":"🔥 困难 · ", "地狱":"🔥 地狱 · ", "极地狱":"🔥🔥 极地狱 · "}[c["difficulty"]]
    title = f"第{lv}关 · {city} · {scene}"
    hint = f"{hint_prefix}{city}老街 · 找出 {items} 样地道{city}物件（物件很小很藏）"
    hell_str = "true" if hell else "false"
    scene_meta.append(
        f"      {{lv:{lv:<2}, title:'{title}', duration:{dur}, hint:'{hint}', calibrated:false, hell:{hell_str}}}"
    )

# ═════════ 2. EXIST_S3 新增 lv:10..29 默认坐标 ═════════
# 8 格网络（4 列 × 2 行，避开中心）
# 尺寸随难度递减：进阶 5%，困难 4%，地狱/极地狱 3-4%
GRID_8 = [
    (4, 8),   (28, 6),  (52, 4),  (78, 12),   # 上排 4 格（贴顶）
    (2, 82),  (26, 78), (52, 84), (80, 76),   # 下排 4 格（贴底）
]
GRID_10 = GRID_8 + [(38, 42), (60, 44)]  # 中间加 2 格

def default_size(diff):
    return {"进阶":5.0, "困难":4.5, "地狱":4.0, "极地狱":3.5}[diff]

exist_s3 = []
for c in cities:
    lv, items, diff = c["lv"], c["items"], c["difficulty"]
    sz = default_size(diff)
    props = c["props"]
    grid = GRID_10 if items > 8 else GRID_8
    lines = []
    for i, p in enumerate(props):
        gx, gy = grid[i % len(grid)]
        # 略微扰动避免完全对齐
        x = gx + (i * 3) % 5
        y = gy + (i * 2) % 4
        w = round(sz + (i % 3) * 0.5, 1)
        h = round(sz + ((i+1) % 3) * 0.5, 1)
        lines.append(f"    {{prop:'{p['id']}', x:{x:5.1f}, y:{y:5.1f}, w:{w:5.1f}, h:{h:5.1f}, tag:'{p['zh']}'}}")
    exist_s3.append(f"  {lv}: [\n" + ",\n".join(lines) + "\n  ]")

# ═════════ 3. PROP_META 新增映射（editor）═════════
prop_meta = []
prop_seen = set()
for c in cities:
    for p in c["props"]:
        if p["id"] in prop_seen: continue
        prop_seen.add(p["id"])
        prop_meta.append(f"  {p['id']}:{{emoji:'{p['emoji']}',name:'{p['zh']}'}}")

# ═════════ 4. M3.PROPS 新增（levels.js）═════════
m3_props = []
for c in cities:
    for p in c["props"]:
        m3_props.append(f"    {p['id']}: {{ emoji:'{p['emoji']}', name:'{p['zh']}' }}")
# 去重
m3_props = list(dict.fromkeys(m3_props))

# ═════════ 5. LEVELS 追加 20 条（levels.js）═════════
levels_js = []
CDN_BASE = "https://p4-ad.adkwai.com/udata/pkg/KS-GAME/AIGC-SoGame/ks693835817972937121"
label_map = {"进阶":"进阶", "困难":"困难", "地狱":"地狱", "极地狱":"极地狱"}
key_map = {"进阶":"advanced", "困难":"hard", "地狱":"hell", "极地狱":"nightmare"}
penalty_map = {"进阶":4, "困难":5, "地狱":6, "极地狱":7}
hint_prefix_map = {"进阶":"", "困难":"🔥 困难 · ", "地狱":"🔥 地狱 · ", "极地狱":"🔥🔥 极地狱 · "}

for c in cities:
    lv, city, scene, items, dur, hs, diff = c["lv"], c["city"], c["scene"], c["items"], c["duration"], c["hitScale"], c["difficulty"]
    idx = 20 + lv  # 编辑器公式：lv:10→idx:30，lv:29→idx:49
    title = f"第{lv}关 · {city} · {scene}"
    hint = f"{hint_prefix_map[diff]}{city}老街 · 找出 {items} 样地道{city}物件（物件很小很藏）"
    sz = default_size(diff)
    grid = GRID_10 if items > 8 else GRID_8
    odds = []
    for i, p in enumerate(c["props"]):
        gx, gy = grid[i % len(grid)]
        x = gx + (i * 3) % 5
        y = gy + (i * 2) % 4
        w = round(sz + (i % 3) * 0.5, 1)
        h = round(sz + ((i+1) % 3) * 0.5, 1)
        odds.append(f"        {{prop:'{p['id']}', x:{x:5.1f}, y:{y:5.1f}, w:{w:5.1f}, h:{h:5.1f}, tag:'{p['zh']}'}}")
    odds_block = ",\n".join(odds)

    levels_js.append(
f"""    {{ idx:{idx}, themeId:3, mode:'hunt',
      title:'{title}', scene:'{CDN_BASE}/s3_lv{lv}.jpg', duration:{dur},
      hint:'{hint}',
      diff:{{ hitScale:{hs}, penalty:{penalty_map[diff]}, bonus:0, label:'{label_map[diff]}', key:'{key_map[diff]}' }},
      odds:[
{odds_block}
      ] }},""")

# ═════════ 输出到独立 .snippet 文件 ═════════
out_dir = "./snippets"
os.makedirs(out_dir, exist_ok=True)
with open(f"{out_dir}/1-scene_meta.txt","w") as f:
    f.write("      // ═══ v0.3.6 追加 · 20 城市寻物（themeId:3, idx:30-49）═══\n")
    f.write(",\n".join(scene_meta))
    f.write(",")
with open(f"{out_dir}/2-exist_s3.txt","w") as f:
    f.write("  // ═══ v0.3.6 追加 · lv:10..29 · 20 城市寻物默认坐标（AI 预标 3-5%）═══\n")
    f.write(",\n".join(exist_s3))
with open(f"{out_dir}/3-prop_meta.txt","w") as f:
    f.write("  // ═══ v0.3.6 追加 · 20 城市寻物物品映射（约 130 个）═══\n")
    f.write(",\n".join(prop_meta))
    f.write(",")
with open(f"{out_dir}/4-m3_props.txt","w") as f:
    f.write("    // ═══ v0.3.6 追加 · 20 城市寻物物品定义 ═══\n")
    f.write(",\n".join(m3_props))
    f.write(",")
with open(f"{out_dir}/5-levels.txt","w") as f:
    f.write("    // ═══ v0.3.6 追加 · 20 城市寻物（idx:30-49, themeId:3, hunt）═══\n")
    f.write("\n".join(levels_js))

print(f"✅ 20 城骨架已生成到 {out_dir}/")
print(f"   - SCENE_META: {len(scene_meta)} 关")
print(f"   - EXIST_S3:  {len(exist_s3)} 关（含 {sum(c['items'] for c in cities)} 个物品）")
print(f"   - PROP_META: {len(prop_meta)} 个物品映射")
print(f"   - M3.PROPS:  {len(m3_props)} 个（去重后）")
print(f"   - LEVELS:    {len(levels_js)} 关")
