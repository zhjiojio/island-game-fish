#!/usr/bin/env python3
"""
Vision 识图脚本 - 逐张识别 lv10-29 底图里真实存在的小物件+坐标
输出 real-scenes/scene3-v2/vision-annotations.json
"""
import os, sys, json, base64, time, re, urllib.request, urllib.error
from concurrent.futures import ThreadPoolExecutor, as_completed

BASE = "/Users/fat/Desktop/aiminigame/game-aigc-product-hub/games/ks693835817972937121"
GENERATED_DIR = f"{BASE}/real-scenes/scene3-v2/generated"
OUT = f"{BASE}/real-scenes/scene3-v2/vision-annotations.json"

# 每关期望物件数（对齐难度曲线）
LV_CONF = {}
for lv in range(10, 14): LV_CONF[lv] = 5   # 进阶
for lv in range(14, 19): LV_CONF[lv] = 6   # 困难
for lv in range(19, 25): LV_CONF[lv] = 7   # 地狱
for lv in range(25, 30): LV_CONF[lv] = 8   # 极地狱

# 城市 + 场景，帮助 Vision 上下文识别
CITIES = {
  10: ("北京", "南锣鼓巷"), 11: ("太原", "柳巷步行街"), 12: ("石家庄", "正定古城"),
  13: ("沈阳", "中街清代老街"), 14: ("哈尔滨", "中央大街冰雕"),
  15: ("苏州", "平江路小桥"), 16: ("杭州", "河坊街茶庄"), 17: ("南京", "夫子庙秦淮"),
  18: ("青岛", "八大关洋楼"), 19: ("武汉", "户部巷早点街"), 20: ("郑州", "德化步行街夜市"),
  21: ("厦门", "中山路骑楼"), 22: ("潮州", "牌坊街古城"), 23: ("桂林", "东西巷石板路"),
  24: ("昆明", "官渡古镇"), 25: ("贵阳", "青岩古镇雨天"), 26: ("拉萨", "八廓街转经廊"),
  27: ("兰州", "正宁路夜市"), 28: ("乌鲁木齐", "国际大巴扎"), 29: ("泉州", "西街古刹夕照"),
}

API_KEY = os.environ["OPENROUTER_API_KEY"]
MODEL = "openai/gpt-4o"  # Vision 能力好

def encode_image(path):
    with open(path, "rb") as f:
        return base64.b64encode(f.read()).decode()

def build_prompt(lv, n_items, city, scene):
    return f"""你是一个「找物游戏」的坐标标注助手。这是一张 {city}·{scene} 的现代摄影街景图（原图尺寸约 2048×1152，16:9）。

请仔细观察图片，找出 {n_items} 个【小巧、显眼、易识别】的物件（食物/摊位/招牌/器具/花灯/招牌/小推车/装饰品等，物件占画面 3%-8%），给出每个物件的：
- id: 英文下划线 id（如 tanghulu / hongdenglong）
- zh: 中文物件名（2-6 字）
- emoji: 一个最贴切的 emoji
- x: bbox 左上角 x 百分比（0-100，相对整张图宽度）
- y: bbox 左上角 y 百分比（0-100，相对整张图高度）
- w: bbox 宽度百分比（1-10）
- h: bbox 高度百分比（1-10）

【硬性要求】：
1. 你标的物件必须【真实存在于图中】，不要幻想
2. 物件之间不重叠（bbox 不相交）
3. 分布在画面不同位置（不要挤一堆）
4. 只输出 JSON 数组，别的都不要，不要 markdown ``` 包裹

输出格式示例：
[
  {{"id":"tanghulu","zh":"糖葫芦","emoji":"🍡","x":34.2,"y":58.1,"w":3.5,"h":6.2}},
  ...
]

请输出恰好 {n_items} 个物件的 JSON 数组："""

def call_vision(lv):
    city, scene = CITIES[lv]
    n = LV_CONF[lv]
    path = f"{GENERATED_DIR}/lv{lv}.jpg"
    if not os.path.exists(path):
        return lv, None, f"文件不存在: {path}"
    img_b64 = encode_image(path)
    payload = {
        "model": MODEL,
        "messages": [{
            "role": "user",
            "content": [
                {"type": "text", "text": build_prompt(lv, n, city, scene)},
                {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{img_b64}"}}
            ]
        }],
        "max_tokens": 2000,
        "temperature": 0.2,
    }
    req = urllib.request.Request(
        "https://openrouter.ai/api/v1/chat/completions",
        data=json.dumps(payload).encode(),
        headers={
            "Authorization": f"Bearer {API_KEY}",
            "Content-Type": "application/json",
            "HTTP-Referer": "https://laotie-editor.frontend-cloud.corp.kuaishou.com",
        }
    )
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            body = json.loads(resp.read())
        text = body["choices"][0]["message"]["content"].strip()
        # 剥 markdown 包裹
        text = re.sub(r'^```(?:json)?\s*|\s*```$', '', text, flags=re.MULTILINE).strip()
        m = re.search(r'\[[\s\S]*\]', text)
        if not m:
            return lv, None, f"无 JSON 数组：{text[:200]}"
        arr = json.loads(m.group(0))
        # 校验
        if not isinstance(arr, list) or len(arr) < n - 1:  # 允许少 1 个
            return lv, None, f"数组长度不对：{len(arr)} vs 期望 {n}"
        # 补齐/截断到 n
        arr = arr[:n]
        for it in arr:
            for k in ("id","zh","emoji","x","y","w","h"):
                if k not in it:
                    return lv, None, f"item 缺 {k}: {it}"
        return lv, arr, None
    except urllib.error.HTTPError as e:
        return lv, None, f"HTTP {e.code}: {e.read()[:200]}"
    except Exception as e:
        return lv, None, f"{type(e).__name__}: {e}"

def main():
    lvs = list(range(10, 30))
    results = {}
    errors = {}
    # 并行 4 路
    with ThreadPoolExecutor(max_workers=4) as ex:
        futures = {ex.submit(call_vision, lv): lv for lv in lvs}
        for fut in as_completed(futures):
            lv, arr, err = fut.result()
            if arr:
                results[lv] = arr
                print(f"✅ lv{lv}: {len(arr)} 物件 {[it['zh'] for it in arr]}")
            else:
                errors[lv] = err
                print(f"❌ lv{lv}: {err}")
    # 重试失败的
    if errors:
        print(f"\n=== 重试 {len(errors)} 关 ===")
        for lv in list(errors.keys()):
            _, arr, err = call_vision(lv)
            if arr:
                results[lv] = arr
                del errors[lv]
                print(f"✅ retry lv{lv}: {[it['zh'] for it in arr]}")
            else:
                print(f"❌ retry lv{lv}: {err}")
    out = {"generated_at": time.strftime("%Y-%m-%d %H:%M:%S"), "model": MODEL, "levels": {str(k): results[k] for k in sorted(results)}}
    with open(OUT, "w") as f:
        json.dump(out, f, ensure_ascii=False, indent=2)
    print(f"\n=== 完成 · 成功 {len(results)}/20 · 保存到 {OUT} ===")
    if errors:
        print(f"仍失败：{list(errors.keys())}")
        sys.exit(1)

if __name__ == "__main__":
    main()
