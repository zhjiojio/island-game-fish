#!/usr/bin/env python3
"""把 snippets/ 里的骨架代码注入到 editor-legacy.js 和 package/js/levels.js"""
import os, re, sys
os.chdir(os.path.dirname(os.path.abspath(__file__)))

EDITOR = "/Users/fat/Desktop/laotie-editor/src/editor-legacy.js"
LEVELS = "/Users/fat/Desktop/aiminigame/game-aigc-product-hub/games/ks693835817972937121/package/js/levels.js"

def read(p): return open(p).read()
def write(p, s): open(p, "w").write(s)

s1 = open("snippets/1-scene_meta.txt").read().rstrip()
s2 = open("snippets/2-exist_s3.txt").read().rstrip()
s3 = open("snippets/3-prop_meta.txt").read().rstrip()
s4 = open("snippets/4-m3_props.txt").read().rstrip()
s5 = open("snippets/5-levels.txt").read().rstrip()

# ══════ EDITOR ══════
e = read(EDITOR)

# 1) SCENE_META[3].levels：在 lv:9 天津那行后面追加
anchor = "      {lv:9, title:'第9关 · 天津 · 五大道洋楼',     duration:60, hint:'洋楼有轨电车 · 找出 3 样地道天津物件',   calibrated:true, hell:true},"
if "v0.3.6 追加 · 20 城市寻物" in e:
    print("⚠ SCENE_META 已注入过，跳过")
else:
    if anchor not in e:
        print("❌ SCENE_META 锚点未找到"); sys.exit(1)
    e = e.replace(anchor, anchor + "\n" + s1)
    print("✅ SCENE_META 20 项已注入")

# 2) EXIST_S3：找 } 结束前追加。原文以 9: [...] 结尾，追加从 10 开始
# 结构：const EXIST_S3 = { ... 9: [...] };
# 定位到 "  9: [\n...\n  ]\n};"
if "v0.3.6 追加 · lv:10..29" in e:
    print("⚠ EXIST_S3 已注入过，跳过")
else:
    # 找 EXIST_S3 结构结束的 };
    m = re.search(r"const EXIST_S3 = \{[\s\S]*?\n\};", e)
    if not m:
        print("❌ EXIST_S3 未找到"); sys.exit(1)
    old = m.group(0)
    # 在最后的 \n}; 前插入
    new = old[:-3] + ",\n" + s2 + "\n};"
    e = e.replace(old, new)
    print("✅ EXIST_S3 20 关已注入")

# 3) PROP_META：在 const PROP_META 结束的 }; 前追加
if "v0.3.6 追加 · 20 城市寻物物品映射" in e:
    print("⚠ PROP_META 已注入过，跳过")
else:
    m = re.search(r"const PROP_META = \{[\s\S]*?\n\};", e)
    if not m:
        print("❌ PROP_META 未找到"); sys.exit(1)
    old = m.group(0)
    new = old[:-3] + ",\n" + s3 + "\n};"
    e = e.replace(old, new)
    print("✅ PROP_META 132 项已注入")

# 4) bump __EDITOR_SCENE_VER
import datetime
ver = datetime.datetime.now().strftime("%Y%m%d_%H%M")
e = re.sub(r"__EDITOR_SCENE_VER = '[^']*'", f"__EDITOR_SCENE_VER = '{ver}'", e)
print(f"✅ __EDITOR_SCENE_VER = {ver}")

write(EDITOR, e)

# ══════ LEVELS.js ══════
lv = read(LEVELS)

# 5) M3.PROPS：在 M3.PROPS = { ... }; 结构里追加。找 var P = M3.PROPS = { 的 };
if "v0.3.6 追加 · 20 城市寻物物品定义" in lv:
    print("⚠ M3.PROPS 已注入过，跳过")
else:
    m = re.search(r"var P = M3\.PROPS = \{[\s\S]*?\n  \};", lv)
    if not m:
        print("❌ M3.PROPS 未找到"); sys.exit(1)
    old = m.group(0)
    new = old[:-4] + ",\n" + s4 + "\n  };"
    lv = lv.replace(old, new)
    print("✅ M3.PROPS 132 项已注入")

# 6) LEVELS 追加：在 LEVELS 数组的 idx:29 天津那关后追加。找 idx:29 那关的 } ]
if "v0.3.6 追加 · 20 城市寻物" in lv:
    print("⚠ LEVELS 已注入过，跳过")
else:
    # 定位到 M3.LEVELS = [ ... ]; 最后 ]; 前
    # 更稳的做法：直接在 xiangsheng_sign 那关 } 后追加
    anchor2 = "'相声馆招牌'}\n      ] },"
    if anchor2 not in lv:
        # 尝试另一种格式
        anchor2 = "{prop:'xiangsheng_sign', x:0,  y:56.1, w:9, h:11, tag:'相声馆招牌'}"
        if anchor2 not in lv:
            # 更宽松
            m2 = re.search(r"(prop:'xiangsheng_sign'[^\n]*\n\s*\]\s*\})", lv)
            if not m2:
                print("❌ LEVELS 尾锚点未找到"); sys.exit(1)
            old2 = m2.group(0)
            new2 = old2 + ",\n" + s5
            lv = lv.replace(old2, new2)
        else:
            # 找到该行，找到之后 } 的位置
            idx = lv.index(anchor2)
            # 找 anchor2 之后第一个 "] }"
            end_idx = lv.index("] }", idx) + 3
            lv = lv[:end_idx] + ",\n" + s5 + lv[end_idx:]
    else:
        lv = lv.replace(anchor2, anchor2.rstrip(",") + "\n" + s5 + ",")
    print("✅ LEVELS 20 关已注入")

write(LEVELS, lv)
print("\n=== 完成 ===")
