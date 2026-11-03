#!/usr/bin/env python3
"""替换 editor 和 levels.js 里 lv11/lv20 的 props（天津→太原，长沙→郑州）"""
import re

# lv11 太原 5 物件
LV11_NEW = [
    ("taoyuan_cuzhuang", "老陈醋坛", "🫙"),
    ("daoxiao_mian", "刀削面碗", "🍜"),
    ("pingyao_niurou", "平遥牛肉罐", "🥩"),
    ("jinshang_piaohao", "晋商票号招牌", "🪧"),
    ("guoyou_rou", "过油肉盘", "🍖"),
]
# lv20 郑州 7 物件
LV20_NEW = [
    ("hui_mian", "烩面大碗", "🍜"),
    ("hujia_hutulu", "胡辣汤桶", "🥣"),
    ("shaolin_gunzi", "少林棍纪念品", "🥢"),
    ("huanghe_shitou", "黄河奇石", "🪨"),
    ("zhengzhou_erqi", "二七塔模型", "🗼"),
    ("kaifeng_guantang", "灌汤包蒸屉", "🥟"),
    ("henan_yuju", "豫剧脸谱", "🎭"),
]
# lv11 旧 props（要删）
LV11_OLD_IDS = ["nirenzhang", "yangliuqing_nianhua", "tianjin_mahua", "fengzheng", "erhu"]
LV20_OLD_IDS = ["chou_doufu_hei", "tanghuaoshaokao", "wenheyou_pai", "xiaolongxia_pen", "malatang", "lu_dan", "huogongdian_hu"]

GRID_8 = [(4, 8), (28, 6), (52, 4), (78, 12),
          (2, 82), (26, 78), (52, 84), (80, 76)]

def gen_odds(new_list, diff_sz):
    lines = []
    for i, (pid, zh, emoji) in enumerate(new_list):
        gx, gy = GRID_8[i % 8]
        x = gx + (i * 3) % 5
        y = gy + (i * 2) % 4
        w = round(diff_sz + (i % 3) * 0.5, 1)
        h = round(diff_sz + ((i+1) % 3) * 0.5, 1)
        lines.append(f"    {{prop:'{pid}', x:{x:5.1f}, y:{y:5.1f}, w:{w:5.1f}, h:{h:5.1f}, tag:'{zh}'}}")
    return ",\n".join(lines)

def gen_odds_levels(new_list, diff_sz, indent=8):
    lines = []
    sp = " " * indent
    for i, (pid, zh, emoji) in enumerate(new_list):
        gx, gy = GRID_8[i % 8]
        x = gx + (i * 3) % 5
        y = gy + (i * 2) % 4
        w = round(diff_sz + (i % 3) * 0.5, 1)
        h = round(diff_sz + ((i+1) % 3) * 0.5, 1)
        lines.append(f"{sp}{{prop:'{pid}', x:{x:5.1f}, y:{y:5.1f}, w:{w:5.1f}, h:{h:5.1f}, tag:'{zh}'}}")
    return ",\n".join(lines)

# ═════════ EDITOR ═════════
EDITOR = "/Users/fat/Desktop/laotie-editor/src/editor-legacy.js"
e = open(EDITOR).read()

# lv11 in EXIST_S3
lv11_new_block = f"  11: [\n{gen_odds(LV11_NEW, 5.0)}\n  ]"
lv11_pat = re.compile(r"  11: \[\n(?:    \{prop:'(?:" + "|".join(LV11_OLD_IDS) + r")'[^\n]*\n?){5}\n?  \]", re.DOTALL)
if lv11_pat.search(e):
    e = lv11_pat.sub(lv11_new_block, e)
    print("✅ editor EXIST_S3[11] 替换为太原")
else:
    # fallback: 找 11: [ 到 匹配的 ] 
    m = re.search(r"(  11: \[)\n(.+?)\n(  \])", e, re.DOTALL)
    if m:
        e = e.replace(m.group(0), lv11_new_block)
        print("✅ editor EXIST_S3[11] 替换（fallback）")
    else:
        print("❌ EXIST_S3[11] 未找到")

# lv20 in EXIST_S3
lv20_new_block = f"  20: [\n{gen_odds(LV20_NEW, 4.0)}\n  ]"
m = re.search(r"(  20: \[)\n(.+?)\n(  \])", e, re.DOTALL)
if m:
    e = e.replace(m.group(0), lv20_new_block)
    print("✅ editor EXIST_S3[20] 替换为郑州")

# PROP_META: 删旧 12 个映射，补新 12 个
# 旧 lv11 5 项：泥人张/杨柳青年画/十八街麻花/沙燕风筝/二胡
# 旧 lv20 7 项：黑臭豆腐/糖火烧铁盘/文和友红招牌/小龙虾一盆/麻辣烫竹签/卤蛋一碟/火宫殿油纸包
for old_id in LV11_OLD_IDS + LV20_OLD_IDS:
    e = re.sub(r"\s*" + re.escape(old_id) + r":\{emoji:'[^']*',name:'[^']*'\},?", "", e)
# 补新
new_meta = ",\n".join([f"  {pid}:{{emoji:'{emoji}',name:'{zh}'}}" for pid, zh, emoji in LV11_NEW + LV20_NEW])
# 在 PROP_META 最后 } 前插入
m = re.search(r"(const PROP_META = \{[\s\S]*?)\n\};", e)
if m:
    old = m.group(0)
    new = old.rstrip("\n};") + ",\n" + new_meta + "\n};"
    e = e.replace(old, new)
    print("✅ editor PROP_META 更新 12 项")

open(EDITOR, "w").write(e)

# ═════════ LEVELS.js ═════════
LEVELS = "/Users/fat/Desktop/aiminigame/game-aigc-product-hub/games/ks693835817972937121/package/js/levels.js"
lv = open(LEVELS).read()

# 替换 idx:31（lv=11）关卡
# 找 { idx:31, ... } 结构
def replace_hunt_level(txt, idx, city, scene, difficulty, hs, dur, items, diff_sz, hint_prefix, label, key, penalty):
    lv_num = idx - 20
    new_block = f"""    {{ idx:{idx}, themeId:3, mode:'hunt',
      title:'第{lv_num}关 · {city} · {scene}', scene:'https://p4-ad.adkwai.com/udata/pkg/KS-GAME/AIGC-SoGame/ks693835817972937121/s3_lv{lv_num}.jpg', duration:{dur},
      hint:'{hint_prefix}{city}老街 · 找出 {items} 样地道{city}物件（物件很小很藏）',
      diff:{{ hitScale:{hs}, penalty:{penalty}, bonus:0, label:'{label}', key:'{key}' }},
      odds:[
{gen_odds_levels(LV11_NEW if idx==31 else LV20_NEW, diff_sz)}
      ] }}"""
    pat = re.compile(r"    \{ idx:" + str(idx) + r", themeId:3, mode:'hunt',\n[\s\S]*?      \] \}", re.MULTILINE)
    m = pat.search(txt)
    if m:
        return txt.replace(m.group(0), new_block), True
    return txt, False

lv, ok1 = replace_hunt_level(lv, 31, "太原", "柳巷步行街", "进阶", 1.15, 60, 5, 5.0, "", "进阶", "advanced", 4)
print(f"levels idx:31 太原：{ok1}")
lv, ok2 = replace_hunt_level(lv, 40, "郑州", "德化步行街夜市", "地狱", 0.95, 80, 7, 4.0, "🔥 地狱 · ", "地狱", "hell", 6)
print(f"levels idx:40 郑州：{ok2}")

# M3.PROPS 删旧、加新
for old_id in LV11_OLD_IDS + LV20_OLD_IDS:
    lv = re.sub(r"\s*" + re.escape(old_id) + r":\s*\{[^}]*\},?", "", lv)
new_props_m3 = ",\n".join([f"    {pid}: {{ emoji:'{emoji}', name:'{zh}' }}" for pid, zh, emoji in LV11_NEW + LV20_NEW])
m = re.search(r"(var P = M3\.PROPS = \{[\s\S]*?)\n  \};", lv)
if m:
    old = m.group(0)
    new = old.rstrip("\n  };").rstrip(",") + ",\n" + new_props_m3 + "\n  };"
    lv = lv.replace(old, new)
    print("✅ levels.js M3.PROPS 更新 12 项")

open(LEVELS, "w").write(lv)
print("\n=== 完成 ===")
