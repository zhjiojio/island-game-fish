#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
五人角色阵容图 -> 竖屏 9:16
双通道:
  A) google/gemini-3-pro-image  (支持 image_config.aspect_ratio=9:16, 真竖屏)
  B) openai/gpt-5.4-image-2     (仅 1024x1024, 作为对照)

措辞策略: 用纺织/剪裁工业术语描述"衣服", 不描述"身体裸露"
  露腰  -> cropped tank ending at natural waistline + high-rise waistband
  透视  -> open-weave gauze-knit georgette (织法词, 非"能看穿")
  吊带  -> halter-neck top with slim shoulder ties (外衣品类, 非内衣品类)
  黑丝  -> black tights (日常品类词)
"""
import os, sys, json, base64, time, pathlib
import urllib.request
from PIL import Image

API_KEY = os.environ.get("OPENROUTER_API_KEY")
if not API_KEY:
    sys.exit("missing OPENROUTER_API_KEY")

REF = "/Users/fat/Desktop/Snipaste_2026-09-09_04-32-09.png"
OUT_DIR = pathlib.Path("/Users/fat/weihunqi/outputs/lineup-portrait")
OUT_DIR.mkdir(parents=True, exist_ok=True)


def prep_ref(src, out, maxw=1400):
    im = Image.open(src).convert("RGB")
    im = im.crop((0, 0, int(im.width * 0.955), im.height))  # 去右侧黑边
    if im.width > maxw:
        im = im.resize((maxw, int(im.height * maxw / im.width)), Image.LANCZOS)
    im.save(out, quality=95)
    return out


def b64_of(p):
    return base64.b64encode(pathlib.Path(p).read_bytes()).decode()


PROMPT = """Recreate the supplied reference photo as a VERTICAL 9:16 portrait character-lineup key visual for a fashion-themed ensemble drama. Keep the same five characters, same faces, same hairstyles, same wardrobe, same left-to-right order, same room.

WARDROBE (match the reference exactly, described in garment-construction terms):

1. FAR LEFT — long wavy black hair, large black over-ear headphones worn on the head, slim black woven choker, fitted black short-sleeve v-neck tee cut to end at the natural waistline, grey drawstring wide-leg lounge trousers with a high-rise waistband, cool composed look.

2. SECOND — black hair in two space buns with wispy bangs, heather-grey ribbed racerback training tank cut to end at the natural waistline, black high-rise fitted bike shorts, athletic toned build, wide-eyed startled look.

3. CENTER — long voluminous chestnut wavy hair, an airy open-weave gauze-knit blush-pink georgette cardigan worn loosely off one shoulder, underneath a pastel powder-blue halter-neck top with slim shoulder ties, arms folded across the front, cuffed light-wash denim shorts, calm confident gaze.

4. FOURTH — long straight black hair, thin silver wire-frame glasses, navy buttoned knit cardigan over a white collared shirt with a dark grey necktie, navy box-pleated skirt, black opaque tights, poised startled look.

5. FAR RIGHT — black hair in a loose high ponytail with bangs, blush-pink cartoon-bear printed cotton loungewear set, lace-trimmed short sleeves and matching lace-trimmed shorts, soft sleepy look.

COMPOSITION for the tall vertical frame:
- All five standing shoulder to shoulder in one row, facing the camera, full-length from head to feet.
- Fill the entire tall 9:16 frame edge to edge. No black bars, no letterboxing.
- Because the frame is tall, show the dim ceiling and upper wall above the group as clean negative space for a title, and the wooden floor below their feet.
- All five heads fully inside the frame with headroom. No cropped heads, no faces cut at the edges.

SCENE — dim warm-toned interior lounge, dark textured brown-olive walls, dark leather sofa at the left, polished dark wood floor, a closed dark door in the background, moody low-key cinematic lighting, deep warm shadows.

STYLE — photorealistic cinematic film still, 35mm equivalent, shallow depth of field, subtle film grain, natural realistic skin texture, editorial ensemble key art, high-fashion lookbook quality.

Absolutely no text, no letters, no logos, no watermark, no signage anywhere in the image.

Avoid: deformed hands, extra fingers, extra limbs, merged faces, distorted eyes, plastic over-smoothed skin, duplicate person, cropped head, black bars, square crop, landscape crop."""


def call(model, ref_path, tag, aspect=None):
    content = [
        {"type": "text", "text": PROMPT},
        {"type": "image_url",
         "image_url": {"url": f"data:image/png;base64,{b64_of(ref_path)}"}},
    ]
    body = {
        "model": model,
        "messages": [{"role": "user", "content": content}],
        "modalities": ["image", "text"],
    }
    if aspect:
        body["image_config"] = {"aspect_ratio": aspect}

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
        print(f"[{tag}] HTTP {e.code}: {e.read().decode()[:700]}")
        return None

    msg = data["choices"][0]["message"]
    imgs = msg.get("images") or []
    if not imgs:
        print(f"[{tag}] NO IMAGE. text={str(msg.get('content'))[:300]}")
        return None

    b64 = imgs[0]["image_url"]["url"].split(",", 1)[1]
    p = OUT_DIR / f"{tag}.png"
    p.write_bytes(base64.b64decode(b64))
    im = Image.open(p)
    ok = "PORTRAIT-OK" if im.size[1] > im.size[0] else "!! NOT PORTRAIT"
    print(f"[{tag}] {im.size} {ok} | {p.stat().st_size/1024:.0f} KB -> {p}")
    return p


if __name__ == "__main__":
    ref = prep_ref(REF, OUT_DIR / "_ref_clean.png")
    print(f"ref -> {ref} {Image.open(ref).size}")
    call("google/gemini-3-pro-image", ref, "v2_gemini_9x16", aspect="9:16")
