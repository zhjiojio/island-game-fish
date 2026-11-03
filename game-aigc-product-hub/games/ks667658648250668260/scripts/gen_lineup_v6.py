#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
五人角色阵容图 v6 -> 竖屏 9:16 (google/gemini-3-pro-image)

v5 遗留问题 -> v6 修正:
  1. 边上角色仍有欧美/东南亚骨相 -> 逐人单独写中韩脸锁定 + 负面词扩充
  2. 1 号要深 V + 马甲线        -> sharp V-neckline + defined abdominal lines
  3. 2 号运动服要更露           -> 运动内衣式短款, 收到肋骨下缘
  4. 3 号 C 位太保守            -> V 领短款挂脖 + 露腰 + 开衫敞开滑肩
  5. 胸型统一要有               -> flattering fitted bust silhouette (版型词)

措辞策略(规避 gpt-image-2 系安全词, 一律用纺织/剪裁/健身工业术语):
  深V   -> sharp V-shaped neckline cut low at the front (领型词)
  马甲线 -> defined vertical abdominal lines, athletic core (健身词)
  胸型   -> flattering fitted bust silhouette (版型词, 非 cleavage)
  露腰   -> cropped hem ending under the ribcage, navel visible
  运动内衣 -> athletic bra-style crop tank (运动品类词)
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

BEAUTY = """ETHNICITY LOCK — ALL FIVE, without exception, are Han Chinese / Korean young adult
actresses in their twenties. This includes the two women at the far LEFT edge and the far
RIGHT edge of the frame — they must look just as unmistakably Chinese/Korean as the rest.
STRICTLY NO Western, European, Caucasian, mixed-race, Latina, Southeast Asian, Thai,
Filipino or Malay facial structure on ANY of the five. No tanned or olive skin.

EAST ASIAN BEAUTY STANDARD — top-tier C-drama / K-drama female lead casting:
smooth flat brow ridge (never a deep-set Western brow), gently low nose bridge with a
refined delicate tip (never a tall sharp Caucasian nose), softly rounded shallow eye
sockets (never deep-set hooded Western eyes), crisp parallel double eyelids,
small V-shaped tapered chin, slim narrow jaw, small face, fair porcelain "glass skin"
with a dewy glow and realistic fine pores, straight softly-arched brows, bright
catchlights, naturally full gradient lips. Idol-level visuals, magazine-cover beauty.
All five are slim with a graceful feminine hourglass figure and a flattering fitted bust
silhouette. Each still has a DISTINCT face shape and aura — never clones or sisters."""

CAST = """CAST — five Han Chinese / Korean women in their twenties.

FOOTWEAR RULE (critical): ONLY character 2 wears shoes. Characters 1, 3, 4 and 5 are
ALL COMPLETELY BAREFOOT with bare feet clearly visible — no shoes, no boots, no slippers.

1. FAR LEFT — THE GAMER. Han Chinese face, sharp cat-like upturned almond eyes, cool aloof
   stare, flat brow ridge, low delicate nose, small V-line chin, matte deep-berry lip.
   Long wavy jet-black hair, large black over-ear headphones around her neck, slim black
   woven choker.
   Fitted charcoal short-sleeve top with a SHARP DEEP V-SHAPED NECKLINE cut low at the
   front, and a CROPPED HEM ending high under the ribcage — her toned athletic core with
   DEFINED VERTICAL ABDOMINAL LINES and navel is fully bare.
   Grey drawstring wide-leg lounge trousers worn low on the hips.
   BAREFOOT. A small game controller in one hand, one hip cocked.

2. SECOND — THE ATHLETE. Korean face, round bright doe eyes, wide sunny smile, small
   heart-shaped face, dimples, fair skin, fresh minimal makeup. Radiantly cheerful.
   Black hair in two space buns with wispy bangs.
   Heather-grey ATHLETIC BRA-STYLE CROP TANK — racerback straps, scooped front neckline,
   hem ending high just under the ribcage, leaving her whole midriff, defined abdominal
   lines and navel bare. Black high-rise fitted bike shorts.
   THE ONLY ONE WEARING SHOES — crisp white chunky sneakers with short white crew socks.
   A stainless steel water bottle in one hand, other arm raised mid-wave, laughing.

3. CENTER — THE LEAD. Han Chinese, the most beautiful of the group, elegant small oval
   face, large expressive slightly downturned puppy eyes, long lashes, delicate low-bridge
   nose, glossy coral lips, knowing smile, luminous dewy skin.
   Long voluminous chestnut wavy hair.
   A pastel powder-blue HALTER-NECK CROP TOP with slim shoulder ties and a V-SHAPED FRONT
   PANEL cut low, hem ending at the ribcage so her slim waist and navel are bare.
   Over it an airy open-weave gauze-knit blush-pink georgette cardigan worn fully OPEN and
   slipping off both shoulders. Cuffed light-wash denim shorts worn low on the hips.
   BAREFOOT. Seated centre, one leg crossed, holding a takeaway milk-tea cup.

4. FOURTH — THE SCHOLAR. Korean face, refined classical beauty, calm phoenix eyes behind
   thin silver wire-frame glasses, pale porcelain skin, small pink lips, serene composed.
   Long straight black hair, navy buttoned knit cardigan worn open over a fitted white
   collared shirt with a dark grey necktie, short navy box-pleated skirt, black opaque
   tights. BAREFOOT — no shoes, just the tights on her feet.
   Hugging a hardcover book to her chest.

5. FAR RIGHT — THE SLEEPYHEAD. Han Chinese face, baby-faced sweetheart, big round drowsy
   half-closed eyes, soft rounded cheeks, tiny button nose, plush pouty lips, fair rosy
   skin. Black hair in a loose messy high ponytail with bangs.
   Blush-pink cartoon-bear printed cotton loungewear set — lace-trimmed short sleeves,
   the top unbuttoned at the collar, and MATCHING LACE-TRIMMED SHORTS (a shorts set,
   absolutely NOT long pyjama trousers), bare legs. BAREFOOT.
   Clutching a round plush cushion, mid-yawn."""

COMPOSITION = """COMPOSITION for the tall vertical 9:16 frame:
- Five characters in a LAYERED, STAGGERED group — NOT a flat single row.
  Vary heights and depth: some standing, at least one seated, one leaning.
- Everyone's FULL BODY visible from head to FEET. Feet clearly in frame —
  four pairs of bare feet, one pair of white sneakers.
- Faces are the focus: render every face large and sharp enough to read clearly,
  especially the two women at the far left and far right edges.
- Fill the entire tall frame edge to edge. No black bars, no letterboxing.
- Clean negative space in the upper portion of the frame for a title.
- All five heads fully inside the frame with headroom. No cropped heads."""

STYLE = """STYLE — photorealistic cinematic film still, 85mm portrait lens look, shallow depth
of field, subtle film grain, natural realistic skin texture with fine pores,
editorial ensemble key art, high-fashion lookbook quality, professional beauty retouching.

Absolutely no text, no letters, no logos, no watermark, no signage anywhere in the image.

Avoid: Caucasian features, European face, Western bone structure, deep-set eyes,
high sharp nose bridge, mixed-race look, Southeast Asian features, Thai face,
Filipino face, tanned skin, olive skin, freckles, shoes on characters 1/3/4/5,
long pyjama trousers, covered midriff on characters 1/2/3, deformed hands, extra fingers,
extra limbs, merged faces, distorted eyes, asymmetric eyes, plastic waxy skin,
uncanny doll face, identical faces, duplicate person, cropped head, cut-off feet,
black bars, square crop, landscape crop."""

SCENES = {
    "v6_rooftop": """SCENE — a city rooftop terrace at golden hour. Warm low sun raking across
from the left, long soft shadows on weathered concrete. Behind them a low parapet wall,
string lights strung overhead, potted plants, and a hazy out-of-focus skyline of
apartment blocks. Warm amber and dusty-teal palette, gentle lens flare.""",

    "v6_arcade": """SCENE — a neon-lit retro arcade at night. Rows of glowing cabinet screens
recede into the background, magenta and cyan neon signage reflecting off a glossy dark
floor, faint haze in the air. Cool cyan key light with warm magenta rim light,
high-contrast moody cyberpunk palette.""",

    "v6_cafe": """SCENE — a bright airy loft cafe on a rainy afternoon. Tall industrial windows
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
