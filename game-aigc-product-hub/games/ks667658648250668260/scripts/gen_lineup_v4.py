#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
五人角色阵容图 v4 -> 竖屏 9:16 (google/gemini-3-pro-image)

v3 的问题: prompt 写了 "Use the reference image ONLY for their FACES"
           => 模型把参考图五张脸原样复制, 颜值被参考图锁死

v4 策略:
  不再传参考图 (纯文生图), 改为逐人书写"高颜值面部设定"
  保留 = 五人的人设符号(发型/标志单品/性格/鞋/道具)
  升级 = 面部按顶级选角标准重新生成, 五人脸型气质互不重复
  修正 = 5 号统一为蕾丝短裤睡衣套装(v3_arcade 曾跑成长裤)
"""
import os, sys, json, base64, pathlib
import urllib.request, urllib.error
from PIL import Image

API_KEY = os.environ.get("OPENROUTER_API_KEY")
if not API_KEY:
    sys.exit("missing OPENROUTER_API_KEY")

OUT_DIR = pathlib.Path("/Users/fat/weihunqi/outputs/lineup-portrait")
OUT_DIR.mkdir(parents=True, exist_ok=True)
MODEL = "google/gemini-3-pro-image"

# ---------- 全局颜值基线 ----------
BEAUTY = """FACES — this is a top-tier casting key visual. All five are strikingly beautiful
young adult actresses in their twenties, magazine-cover level looks, but each with a
DISTINCT face shape and aura so they never look like sisters or clones.
Universal quality bar for every face: flawless luminous skin with realistic pore texture,
high clean cheekbones, refined slim nose bridge, well-defined double eyelids,
long natural lashes, bright catchlights in the eyes, softly sculpted jawline,
naturally full lips, delicate symmetric features, subtle tasteful makeup.
Photographed with beauty-dish soft light on the face."""

# ---------- 角色: 人设符号 + 逐人面部设定 ----------
CAST = """CAST — five young adult women in their twenties.

1. LEFT — THE GAMER. Face: sharp cat-like upturned almond eyes, cool aloof stare,
   narrow oval face, sharp chin, straight brows, matte deep-berry lip. Striking and edgy.
   Long wavy jet-black hair, large black over-ear headphones resting around her neck,
   slim black woven choker, fitted charcoal short-sleeve tee cut to end at the natural
   waistline, grey drawstring wide-leg lounge trousers with a high-rise waistband,
   BLACK LACE-UP ANKLE BOOTS. A small game controller loose in one hand, one hip cocked.

2. SECOND — THE ATHLETE. Face: round bright doe eyes, wide sunny smile with straight
   white teeth, small heart-shaped face, cute rounded nose tip, dimples, sun-kissed glow,
   fresh minimal makeup. Radiantly cheerful and healthy.
   Black hair in two space buns with wispy bangs, heather-grey ribbed racerback training
   tank cut to end at the natural waistline, black high-rise fitted bike shorts,
   CRISP WHITE CHUNKY SNEAKERS with short white crew socks.
   A stainless steel water bottle in one hand, the other arm raised mid-wave, laughing.

3. CENTER — THE LEAD. Face: the most beautiful of the group, elegant oval face,
   large expressive slightly downturned puppy eyes, long lashes, exquisite delicate nose,
   soft glossy coral lips, faint knowing smile, luminous dewy skin, effortless charisma.
   Long voluminous chestnut wavy hair. An airy open-weave gauze-knit blush-pink georgette
   cardigan worn loosely off one shoulder, underneath a pastel powder-blue halter-neck top
   with slim shoulder ties, cuffed light-wash denim shorts, BAREFOOT.
   Seated centre, relaxed, holding a takeaway milk-tea cup.

4. FOURTH — THE SCHOLAR. Face: refined classical beauty, calm phoenix eyes behind thin
   silver wire-frame glasses, long straight nose, pale porcelain skin, small pink lips,
   serene composed expression, quietly gorgeous.
   Long straight black hair, navy buttoned knit cardigan over a white collared shirt with
   a dark grey necktie, navy box-pleated skirt, black opaque tights,
   BROWN LEATHER LOAFERS. Hugging a hardcover book to her chest.

5. RIGHT — THE SLEEPYHEAD. Face: baby-faced sweetheart, big round drowsy eyes half-closed,
   soft rounded cheeks, tiny button nose, plush pouty lips, rosy flush, adorably pretty.
   Black hair in a loose messy high ponytail with bangs.
   Blush-pink cartoon-bear printed cotton loungewear set — lace-trimmed short sleeves and
   MATCHING LACE-TRIMMED SHORTS (a shorts set, definitely NOT long pyjama trousers),
   FLUFFY CREAM SLIPPERS. Clutching a round plush cushion, mid-yawn."""

COMPOSITION = """COMPOSITION for the tall vertical 9:16 frame:
- Five characters arranged in a LAYERED, STAGGERED group — NOT a flat single row.
  Vary their heights and depth: some standing, at least one seated or perched, one leaning.
- Everyone's FULL BODY visible from head to footwear. Footwear must be clearly readable.
- Faces are the focus: render every face large enough to read clearly, sharp and in focus.
- Fill the entire tall frame edge to edge. No black bars, no letterboxing.
- Keep clean negative space in the upper portion of the frame for a title.
- All five heads fully inside the frame with headroom. No cropped heads."""

STYLE = """STYLE — photorealistic cinematic film still, 85mm portrait lens look for flattering
facial rendering, shallow depth of field, subtle film grain, natural realistic skin texture
with visible fine pores, editorial ensemble key art, high-fashion lookbook quality,
professional beauty retouching.

Absolutely no text, no letters, no logos, no watermark, no signage anywhere in the image.

Avoid: deformed hands, extra fingers, extra limbs, merged faces, distorted eyes,
asymmetric eyes, plastic over-smoothed waxy skin, uncanny doll face, identical faces,
duplicate person, cropped head, missing feet, black bars, square crop, landscape crop."""

SCENES = {
    "v4_rooftop": """SCENE — a city rooftop terrace at golden hour. Warm low sun raking across
from the left, long soft shadows on weathered concrete. Behind them a low parapet wall,
string lights strung overhead, potted plants, and a hazy out-of-focus skyline of
apartment blocks. Warm amber and dusty-teal palette, gentle lens flare.""",

    "v4_arcade": """SCENE — a neon-lit retro arcade at night. Rows of glowing cabinet screens
recede into the background, magenta and cyan neon signage reflecting off a glossy dark
floor, faint haze in the air. Cool cyan key light with warm magenta rim light,
high-contrast moody cyberpunk palette.""",

    "v4_cafe": """SCENE — a bright airy loft cafe on a rainy afternoon. Tall industrial windows
with rain streaks behind them, soft diffused daylight, exposed brick wall, warm wooden
counter, hanging pendant lamps, a few green plants. Clean natural palette,
soft even lighting, gentle contrast.""",
}


def build_prompt(scene_txt):
    return f"""Create a VERTICAL 9:16 portrait character-lineup key visual for a fashion-themed
ensemble drama. Original characters, original scene.

{BEAUTY}

{CAST}

{scene_txt}

{COMPOSITION}

{STYLE}"""


def call(tag, prompt, aspect="9:16"):
    body = {
        "model": MODEL,
        "messages": [{"role": "user", "content": [{"type": "text", "text": prompt}]}],
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
    only = sys.argv[1] if len(sys.argv) > 1 else None
    for tag, scene in SCENES.items():
        if only and only not in tag:
            continue
        call(tag, build_prompt(scene))
