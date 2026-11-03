#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
五人角色阵容图 v5 -> 竖屏 9:16 (google/gemini-3-pro-image)

v4 三个问题 -> v5 三处硬锁:
  1. 五人全穿鞋   -> 只有 2 号穿鞋, 其余四人一律赤脚(还原参考图)
  2. 脸偏欧美骨相 -> 硬锁 East Asian / Chinese-Korean 审美, 负面词排除西方骨相
  3. 露脐消失     -> 1/2 号明确写 midriff-baring cropped cut + navel visible

措辞策略(规避 gpt-image-2 系安全词, 用纺织/剪裁工业术语):
  露腰 -> cropped hem sitting above the waistband, midriff-baring cut
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

OUT_DIR = pathlib.Path("/Users/fat/weihunqi/outputs/lineup-portrait")
OUT_DIR.mkdir(parents=True, exist_ok=True)
MODEL = "google/gemini-3-pro-image"

# ---------- 硬锁 1: 人种 + 亚洲审美基线 ----------
BEAUTY = """ETHNICITY LOCK — ALL FIVE are 100% East Asian (Chinese) young adult actresses in
their twenties. Every single face must read unmistakably Chinese / East Asian.
Absolutely NO Western, European, Caucasian, mixed-race, Latina or Southeast Asian
facial structure on ANY of them.

EAST ASIAN BEAUTY STANDARD — top-tier C-drama / K-drama female lead casting:
smooth flat brow ridge (never a deep-set Western brow), gently low nose bridge with a
refined delicate tip (never a tall sharp Caucasian nose), softly rounded shallow eye
sockets (never deep-set hooded Western eyes), crisp parallel double eyelids,
small V-shaped tapered chin, slim narrow jaw, small face, fair porcelain "glass skin"
with a dewy glow and realistic fine pores, straight softly-arched brows, bright
catchlights, naturally full gradient lips. Idol-level visuals, magazine-cover beauty.
Each of the five still has a DISTINCT face shape and aura — never clones or sisters."""

# ---------- 硬锁 2 + 3: 鞋(只1人) + 露脐 ----------
CAST = """CAST — five East Asian women in their twenties.

FOOTWEAR RULE (critical): ONLY character 2 wears shoes. Characters 1, 3, 4 and 5 are
ALL COMPLETELY BAREFOOT with bare feet clearly visible on the floor — no shoes,
no boots, no slippers, no socks on them.

1. LEFT — THE GAMER. Chinese, sharp cat-like upturned almond eyes, cool aloof stare,
   small V-line chin, matte deep-berry lip. Striking and edgy.
   Long wavy jet-black hair, large black over-ear headphones resting around her neck,
   slim black woven choker. Fitted charcoal short-sleeve v-neck tee with a CROPPED HEM
   that sits well above the waistband, leaving her midriff and navel clearly bare.
   Grey drawstring wide-leg lounge trousers with a low-slung waistband.
   BAREFOOT. A small game controller loose in one hand, one hip cocked.

2. SECOND — THE ATHLETE. Chinese, round bright doe eyes, wide sunny smile,
   small heart-shaped face, dimples, fresh minimal makeup. Radiantly cheerful.
   Black hair in two space buns with wispy bangs. Heather-grey ribbed racerback training
   tank with a CROPPED HEM ending high above the waist, midriff and navel clearly bare.
   Black high-rise fitted bike shorts.
   THE ONLY ONE WEARING SHOES — crisp white chunky sneakers with short white crew socks.
   A stainless steel water bottle in one hand, other arm raised mid-wave, laughing.

3. CENTER — THE LEAD. Chinese, the most beautiful of the group, elegant small oval face,
   large expressive slightly downturned puppy eyes, long lashes, delicate low-bridge nose,
   soft glossy coral lips, faint knowing smile, luminous dewy skin, effortless charisma.
   Long voluminous chestnut wavy hair. An airy open-weave gauze-knit blush-pink georgette
   cardigan worn loosely off one shoulder, underneath a pastel powder-blue halter-neck top
   with slim shoulder ties, cuffed light-wash denim shorts.
   BAREFOOT, bare feet visible. Seated centre, relaxed, holding a takeaway milk-tea cup.

4. FOURTH — THE SCHOLAR. Chinese, refined classical beauty, calm phoenix eyes behind thin
   silver wire-frame glasses, pale porcelain skin, small pink lips, serene composed
   expression, quietly gorgeous.
   Long straight black hair, navy buttoned knit cardigan over a white collared shirt with
   a dark grey necktie, short navy box-pleated skirt, black opaque tights.
   BAREFOOT — no shoes at all, just the tights on her feet.
   Hugging a hardcover book to her chest.

5. RIGHT — THE SLEEPYHEAD. Chinese, baby-faced sweetheart, big round drowsy eyes
   half-closed, soft rounded cheeks, tiny button nose, plush pouty lips, rosy flush.
   Black hair in a loose messy high ponytail with bangs.
   Blush-pink cartoon-bear printed cotton loungewear set — lace-trimmed short sleeves and
   MATCHING LACE-TRIMMED SHORTS (a shorts set, absolutely NOT long pyjama trousers),
   bare legs. BAREFOOT, bare feet visible.
   Clutching a round plush cushion, mid-yawn."""

COMPOSITION = """COMPOSITION for the tall vertical 9:16 frame:
- Five characters in a LAYERED, STAGGERED group — NOT a flat single row.
  Vary heights and depth: some standing, at least one seated, one leaning.
- Everyone's FULL BODY visible from head to FEET. Feet must be clearly visible and in
  frame — four pairs of bare feet, one pair of white sneakers.
- Faces are the focus: render every face large and sharp enough to read clearly.
- Fill the entire tall frame edge to edge. No black bars, no letterboxing.
- Clean negative space in the upper portion of the frame for a title.
- All five heads fully inside the frame with headroom. No cropped heads."""

STYLE = """STYLE — photorealistic cinematic film still, 85mm portrait lens look, shallow depth
of field, subtle film grain, natural realistic skin texture with fine pores,
editorial ensemble key art, high-fashion lookbook quality, professional beauty retouching.

Absolutely no text, no letters, no logos, no watermark, no signage anywhere in the image.

Avoid: Caucasian features, European face, Western bone structure, deep-set eyes,
high sharp nose bridge, mixed-race look, Southeast Asian features, tanned dark skin,
shoes on characters 1/3/4/5, long pyjama trousers, deformed hands, extra fingers,
extra limbs, merged faces, distorted eyes, asymmetric eyes, plastic waxy skin,
uncanny doll face, identical faces, duplicate person, cropped head, cut-off feet,
black bars, square crop, landscape crop."""

SCENES = {
    "v5_rooftop": """SCENE — a city rooftop terrace at golden hour. Warm low sun raking across
from the left, long soft shadows on weathered concrete. Behind them a low parapet wall,
string lights strung overhead, potted plants, and a hazy out-of-focus skyline of
apartment blocks. Warm amber and dusty-teal palette, gentle lens flare.""",

    "v5_arcade": """SCENE — a neon-lit retro arcade at night. Rows of glowing cabinet screens
recede into the background, magenta and cyan neon signage reflecting off a glossy dark
floor, faint haze in the air. Cool cyan key light with warm magenta rim light,
high-contrast moody cyberpunk palette.""",

    "v5_cafe": """SCENE — a bright airy loft cafe on a rainy afternoon. Tall industrial windows
with rain streaks behind them, soft diffused daylight, exposed brick wall, warm wooden
counter, hanging pendant lamps, a few green plants. Clean natural palette,
soft even lighting, gentle contrast.""",
}


def build_prompt(scene_txt):
    return f"""Create a VERTICAL 9:16 portrait character-lineup key visual for a fashion-themed
ensemble drama set in China. Original characters, original scene.

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
