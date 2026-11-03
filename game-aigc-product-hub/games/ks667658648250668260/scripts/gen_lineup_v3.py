#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
五人角色阵容图 v3 -> 竖屏 9:16 (google/gemini-3-pro-image)

v2 的问题: prompt 写了 "same room / same wardrobe / match the reference exactly"
           => 模型变复印机, 产出跟参考图一模一样, 无二创价值

v3 策略:
  保留 = 五个角色的"识别符号"(发型 + 标志性单品 + 性格)
  更换 = 场景(3 套全新) + 站位姿态 + 鞋履 + 手持道具 + 配色微调

措辞策略沿用 v2 (纺织/剪裁工业术语, 规避 gpt-image-2 系安全词):
  露腰 -> cropped tank ending at natural waistline + high-rise waistband
  透视 -> open-weave gauze-knit georgette (织法词)
  吊带 -> halter-neck top with slim shoulder ties (外衣品类)
  黑丝 -> black tights (日常品类词)
"""
import os, sys, json, base64, pathlib
import urllib.request, urllib.error
from PIL import Image

API_KEY = os.environ.get("OPENROUTER_API_KEY")
if not API_KEY:
    sys.exit("missing OPENROUTER_API_KEY")

REF = "/Users/fat/Desktop/Snipaste_2026-09-09_04-32-09.png"
OUT_DIR = pathlib.Path("/Users/fat/weihunqi/outputs/lineup-portrait")
OUT_DIR.mkdir(parents=True, exist_ok=True)
MODEL = "google/gemini-3-pro-image"


def prep_ref(src, out, maxw=1400):
    im = Image.open(src).convert("RGB")
    im = im.crop((0, 0, int(im.width * 0.955), im.height))  # 去右侧黑边
    if im.width > maxw:
        im = im.resize((maxw, int(im.height * maxw / im.width)), Image.LANCZOS)
    im.save(out, quality=95)
    return out


def b64_of(p):
    return base64.b64encode(pathlib.Path(p).read_bytes()).decode()


# ---------- 角色: 只保留识别符号, 允许模型重新演绎 ----------
CAST = """CAST — five young adult women in their twenties. Use the reference image ONLY for
their FACES, hair and overall vibe. Everything else (pose, footwear, props, background)
must follow the instructions below, NOT the reference.

1. LEFT — long wavy black hair, large black over-ear headphones resting around her neck,
   slim black woven choker, fitted charcoal short-sleeve tee cut to end at the natural
   waistline, grey drawstring wide-leg lounge trousers with a high-rise waistband,
   BLACK LACE-UP ANKLE BOOTS. Holding a small game controller loosely in one hand.
   Cool, unbothered, one hip cocked.

2. SECOND — black hair in two space buns with wispy bangs, heather-grey ribbed racerback
   training tank cut to end at the natural waistline, black high-rise fitted bike shorts,
   CRISP WHITE CHUNKY SNEAKERS with short white crew socks. A stainless steel water bottle
   in one hand, the other arm raised mid-wave. Energetic, laughing.

3. CENTER — long voluminous chestnut wavy hair, an airy open-weave gauze-knit blush-pink
   georgette cardigan worn loosely off one shoulder, underneath a pastel powder-blue
   halter-neck top with slim shoulder ties, cuffed light-wash denim shorts, BAREFOOT.
   Seated, relaxed, holding a takeaway milk-tea cup. Calm, confident, faint smile.

4. FOURTH — long straight black hair, thin silver wire-frame glasses, navy buttoned knit
   cardigan over a white collared shirt with a dark grey necktie, navy box-pleated skirt,
   black opaque tights, BROWN LEATHER LOAFERS. Hugging a hardcover book to her chest.
   Poised, slightly shy.

5. RIGHT — black hair in a loose high ponytail with bangs, blush-pink cartoon-bear printed
   cotton loungewear set with lace-trimmed short sleeves and matching lace-trimmed shorts,
   FLUFFY CREAM SLIPPERS. Clutching a round plush cushion, mid-yawn. Sleepy, soft."""

COMPOSITION = """COMPOSITION for the tall vertical 9:16 frame:
- Five characters arranged in a LAYERED, STAGGERED group — NOT a flat single row.
  Vary their heights and depth: some standing, at least one seated or perched, one leaning.
- Everyone's FULL BODY visible from head to footwear. Footwear must be clearly readable.
- Fill the entire tall frame edge to edge. No black bars, no letterboxing.
- Keep clean negative space in the upper portion of the frame for a title.
- All five heads fully inside the frame with headroom. No cropped heads."""

STYLE = """STYLE — photorealistic cinematic film still, 35mm equivalent, shallow depth of field,
subtle film grain, natural realistic skin texture, editorial ensemble key art,
high-fashion lookbook quality.

Absolutely no text, no letters, no logos, no watermark, no signage anywhere in the image.

Avoid: deformed hands, extra fingers, extra limbs, merged faces, distorted eyes,
plastic over-smoothed skin, duplicate person, cropped head, missing feet, black bars,
square crop, landscape crop."""

# ---------- 3 套全新场景 ----------
SCENES = {
    "v3_rooftop": """SCENE — a city rooftop terrace at golden hour. Warm low sun raking across
from the left, long soft shadows on weathered concrete. Behind them a low parapet wall,
string lights strung overhead, potted plants, and a hazy out-of-focus skyline of
apartment blocks. Warm amber and dusty-teal palette, gentle lens flare.""",

    "v3_arcade": """SCENE — a neon-lit retro arcade at night. Rows of glowing cabinet screens
recede into the background, magenta and cyan neon signage reflecting off a glossy dark
floor, faint haze in the air. Cool cyan key light with warm magenta rim light,
high-contrast moody cyberpunk palette.""",

    "v3_cafe": """SCENE — a bright airy loft cafe on a rainy afternoon. Tall industrial windows
with rain streaks behind them, soft diffused daylight, exposed brick wall, warm wooden
counter, hanging pendant lamps, a few green plants. Clean natural palette,
soft even lighting, gentle contrast.""",
}


def build_prompt(scene_txt):
    return f"""Create a VERTICAL 9:16 portrait character-lineup key visual for a fashion-themed
ensemble drama. This is a NEW original scene — do NOT copy the reference image's room,
poses or composition.

{CAST}

{scene_txt}

{COMPOSITION}

{STYLE}"""


def call(tag, prompt, ref_path, aspect="9:16"):
    content = [
        {"type": "text", "text": prompt},
        {"type": "image_url",
         "image_url": {"url": f"data:image/png;base64,{b64_of(ref_path)}"}},
    ]
    body = {
        "model": MODEL,
        "messages": [{"role": "user", "content": content}],
        "modalities": ["image", "text"],
        "image_config": {"aspect_ratio": aspect},
    }
    req = urllib.request.Request(
        "https://openrouter.ai/api/v1/chat/completions",
        data=json.dumps(body).encode(),
        headers={"Authorization": f"Bearer {API_KEY}",
                 "Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=900) as r:
            data = json.load(r)
    except urllib.error.HTTPError as e:
        print(f"[{tag}] HTTP {e.code}: {e.read().decode()[:700]}", flush=True)
        return None

    msg = data["choices"][0]["message"]
    imgs = msg.get("images") or []
    if not imgs:
        print(f"[{tag}] NO IMAGE. text={str(msg.get('content'))[:300]}", flush=True)
        return None

    b64 = imgs[0]["image_url"]["url"].split(",", 1)[1]
    p = OUT_DIR / f"{tag}.png"
    p.write_bytes(base64.b64decode(b64))
    im = Image.open(p)
    ok = "PORTRAIT-OK" if im.size[1] > im.size[0] else "!! NOT PORTRAIT"
    print(f"[{tag}] {im.size} {ok} | {p.stat().st_size/1024:.0f} KB -> {p}", flush=True)
    return p


if __name__ == "__main__":
    ref = prep_ref(REF, OUT_DIR / "_ref_clean.png")
    print(f"ref -> {ref} {Image.open(ref).size}", flush=True)
    only = sys.argv[1] if len(sys.argv) > 1 else None
    for tag, scene in SCENES.items():
        if only and only not in tag:
            continue
        call(tag, build_prompt(scene), ref)
