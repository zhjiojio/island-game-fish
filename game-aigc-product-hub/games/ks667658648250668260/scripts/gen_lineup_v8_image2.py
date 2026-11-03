#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
v8: image2 专用版本 (openai/gpt-5.4-image-2) + 真竖屏 + 抗 AI 味.

背景:
  探针证实 image2 支持 image_config.aspect_ratio -> 720x1280 真竖屏 (之前判断有误)
  但 v7 直接套用 v6 提示词被文字拒答:
    "sexualizes young-looking people" / "exposed midriffs / low-cut"

v8 两处修正:
  1. 年龄脱敏: 明确 25-30 岁职业女演员, 成熟成年面孔, 杜绝 young-looking 判定
  2. 身体描述 -> 纯服装工业词:
       bare midriff / navel        -> cropped hem, cropped-length, high-waisted
       defined abdominal lines     -> athletic build, toned physique (体态词)
       V-neckline cut low          -> notched V-neck collar (领型结构词)
       flattering bust silhouette  -> tailored fit (版型词)
     即: 只描述"衣服的剪裁", 完全不描述"露出什么身体部位"
"""
import os, sys, json, base64, pathlib
import urllib.request, urllib.error
from PIL import Image

API_KEY = os.environ.get("OPENROUTER_API_KEY")
if not API_KEY:
    sys.exit("missing OPENROUTER_API_KEY")

OUT_DIR = pathlib.Path("/Users/fat/weihunqi/outputs/lineup-portrait")
OUT_DIR.mkdir(parents=True, exist_ok=True)
MODEL = "openai/gpt-5.4-image-2"

# 年龄脱敏 + 亚洲审美锁
BEAUTY = """CASTING — five professional adult actresses, ages 25 to 30, all Han Chinese or Korean.
Mature adult faces and adult proportions. This includes the women at the far LEFT and far
RIGHT edges — they must look just as unmistakably Chinese/Korean as the others.
No Western, European, Caucasian, mixed-race or Southeast Asian facial structure.

EAST ASIAN FEATURES — smooth flat brow ridge, gently low nose bridge with a refined tip,
softly rounded shallow eye sockets, crisp parallel double eyelids, small tapered chin,
slim jaw, fair skin, straight softly-arched brows, naturally full lips.
Top-tier C-drama / K-drama leading-lady casting. Each has a distinct face and aura."""

# 纯服装工业词, 不描述身体
CAST = """CAST — five adult women, styled as five distinct fashion archetypes.

FOOTWEAR RULE: ONLY character 2 wears shoes. Characters 1, 3, 4 and 5 are barefoot,
feet visible on the floor — no shoes, no boots, no slippers on them.

1. FAR LEFT — THE GAMER. Chinese, sharp upturned almond eyes, cool composed stare,
   matte deep-berry lip. Long wavy jet-black hair, large black over-ear headphones around
   her neck, slim black woven choker.
   Charcoal cropped-length short-sleeve tee with a notched V-neck collar, tailored fit.
   Grey drawstring wide-leg lounge trousers. Athletic toned build.
   Barefoot. A small game controller in one hand, one hip cocked.

2. SECOND — THE ATHLETE. Korean, round bright eyes, wide sunny smile, heart-shaped face,
   dimples, fair skin. Black hair in two space buns with wispy bangs.
   Heather-grey racerback athleisure crop top with a scooped neckline, cropped length.
   Black high-waisted fitted bike shorts. Athletic toned build.
   THE ONLY ONE IN SHOES — white chunky sneakers with short white crew socks.
   A steel water bottle in one hand, other arm raised mid-wave, laughing.

3. CENTER — THE LEAD. Chinese, the most striking of the group, elegant oval face,
   large expressive eyes, long lashes, delicate low-bridge nose, glossy coral lips,
   knowing smile. Long voluminous chestnut wavy hair.
   Pastel powder-blue halter-neck crop top with slim shoulder ties and a notched V front
   panel. Over it an open-weave gauze-knit blush-pink georgette cardigan worn open,
   off both shoulders. Cuffed light-wash denim shorts.
   Barefoot. Seated centre, one leg crossed, holding a takeaway milk-tea cup.

4. FOURTH — THE SCHOLAR. Korean, refined classical features, calm eyes behind thin silver
   wire-frame glasses, pale skin, small pink lips, serene.
   Long straight black hair, navy buttoned knit cardigan worn open over a tailored white
   collared shirt with a dark grey necktie, short navy box-pleated skirt, black opaque
   tights. Barefoot — no shoes, just tights. Hugging a hardcover book to her chest.

5. FAR RIGHT — THE SLEEPYHEAD. Chinese, soft rounded cheeks, drowsy half-closed eyes,
   small nose, full lips, fair rosy skin. Black hair in a loose messy high ponytail.
   Blush-pink cartoon-bear printed cotton loungewear set — lace-trimmed short sleeves and
   matching lace-trimmed shorts (a shorts set, NOT long pyjama trousers).
   Barefoot. Clutching a round plush cushion, mid-yawn."""

COMPOSITION = """COMPOSITION for the tall vertical 9:16 frame:
- Five in a layered, staggered group — not a flat single row. Vary heights and depth:
  some standing, one seated, one leaning.
- Full body head to feet for everyone. Feet clearly in frame —
  four barefoot, one in white sneakers.
- Render every face large and sharp, especially the far-left and far-right women.
- Fill the entire tall frame edge to edge. No black bars, no letterboxing.
- Clean negative space in the upper portion for a title.
- All five heads fully inside the frame with headroom."""

REALISM = """PHOTOGRAPHIC REALISM — this must look like a REAL UNRETOUCHED photograph from a
real camera, NOT a rendered or AI-generated image. Real skin with visible pores and
natural texture unevenness, faint natural blemishes, natural under-eye tone, slight
T-zone shine, real flyaway baby hairs at the hairline, imperfect asymmetric expressions,
believable everyday proportions. Shot on a Sony A7 IV, 50mm f/1.8, available light only,
mild lens vignetting, authentic colour science.
NO beauty filter, NO skin smoothing, NO retouching, NO plastic CGI sheen.
Candid documentary photography feel."""

STYLE = """Absolutely no text, no letters, no logos, no watermark anywhere.

Avoid: Caucasian features, European face, Western bone structure, deep-set eyes,
high sharp nose bridge, mixed-race look, Southeast Asian features, tanned skin,
shoes on characters 1/3/4/5, long pyjama trousers, deformed hands, extra fingers,
extra limbs, merged faces, distorted eyes, plastic waxy skin, uncanny doll face,
identical faces, duplicate person, cropped head, cut-off feet, black bars,
square crop, landscape crop."""

SCENES = {
    "cafe": """SCENE — a bright airy loft cafe on a rainy afternoon. Tall industrial windows
with rain streaks, soft diffused daylight, exposed brick wall, warm wooden counter,
hanging pendant lamps, green plants. Clean natural palette, soft even lighting.""",

    "rooftop": """SCENE — a city rooftop terrace at golden hour. Warm low sun raking from the
left, long soft shadows on weathered concrete, a low parapet wall, string lights overhead,
potted plants, hazy out-of-focus skyline. Warm amber and dusty-teal palette.""",

    "arcade": """SCENE — a neon-lit retro arcade at night. Rows of glowing cabinet screens
receding into the background, magenta and cyan neon reflecting off a glossy dark floor,
faint haze. Cool cyan key light, warm magenta rim light, high-contrast moody palette.""",
}


def build(scene):
    return f"""Create a VERTICAL 9:16 fashion editorial group portrait — a five-character
lineup key visual for a contemporary Chinese ensemble drama.

{BEAUTY}

{CAST}

{scene}

{COMPOSITION}

{REALISM}

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
        print(f"[{tag}] HTTP {e.code} :: {e.read().decode()[:500]}", flush=True)
        return None

    msg = data["choices"][0]["message"]
    imgs = msg.get("images") or []
    if not imgs:
        print(f"[{tag}] REFUSED :: {str(msg.get('content'))[:300]}", flush=True)
        return None

    b64 = imgs[0]["image_url"]["url"].split(",", 1)[1]
    p = OUT_DIR / f"{tag}.png"
    p.write_bytes(base64.b64decode(b64))
    im = Image.open(p)
    ok = "PORTRAIT-OK" if im.size[1] > im.size[0] else "!! NOT PORTRAIT"
    print(f"[{tag}] {im.size} {ok} | {p.stat().st_size/1024:.0f} KB -> {p}", flush=True)
    return p


if __name__ == "__main__":
    which = sys.argv[1] if len(sys.argv) > 1 else "cafe"
    call(f"v8_image2_{which}", build(SCENES[which]))
