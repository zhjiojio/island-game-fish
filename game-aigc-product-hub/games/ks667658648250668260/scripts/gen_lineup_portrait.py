#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
五人角色阵容图 -> 竖屏 9:16 首帧图
Provider: OpenRouter -> openai/gpt-5.4-image-2
参考图: /Users/fat/Desktop/Snipaste_2026-09-09_04-32-09.png
策略: 把参考图预先 pad 成 9:16 竖屏画布再送进 edit，强制模型输出竖构图
"""
import os, sys, json, base64, io, time, pathlib
import urllib.request
from PIL import Image

API_KEY = os.environ.get("OPENROUTER_API_KEY")
if not API_KEY:
    sys.exit("missing OPENROUTER_API_KEY")

MODEL = "openai/gpt-5.4-image-2"
REF = "/Users/fat/Desktop/Snipaste_2026-09-09_04-32-09.png"
OUT_DIR = pathlib.Path("/Users/fat/weihunqi/outputs/lineup-portrait")
OUT_DIR.mkdir(parents=True, exist_ok=True)


def make_portrait_canvas(src_path, out_path, w=1024, h=1792):
    """把横图放进 9:16 竖画布中部，上下留黑，给模型明确的竖屏画幅信号"""
    im = Image.open(src_path).convert("RGB")
    # 先裁掉右侧黑边
    im = im.crop((0, 0, int(im.width * 0.955), im.height))
    scale = w / im.width
    nh = int(im.height * scale)
    im = im.resize((w, nh), Image.LANCZOS)
    canvas = Image.new("RGB", (w, h), (18, 14, 12))
    canvas.paste(im, (0, (h - nh) // 2))
    canvas.save(out_path)
    return out_path


def b64_of(p):
    return base64.b64encode(pathlib.Path(p).read_bytes()).decode()


PROMPT = """Using the provided reference image as the authoritative source for character identity, redraw this as a VERTICAL 9:16 PORTRAIT character-lineup key visual.

CRITICAL: The output image MUST be a tall vertical portrait frame (9:16), not square, not landscape. Fill the entire tall frame with the scene. Do not leave black bars.

PRESERVE EXACTLY from the reference — same five young adult women, in their twenties, East Asian, same faces, same hairstyles, same outfit colors and silhouettes, same left-to-right order:

1. FAR LEFT: long wavy black hair, black over-ear headphones around her neck area, thin black choker, black short-sleeve tee, grey loose sweatpants, cool composed expression.
2. SECOND: black hair in two space buns with wispy bangs, grey sleeveless athletic tank top with a fitted grey long-line hem reaching the waistband, black knee-length sport shorts, athletic build, alert expression.
3. CENTER: long voluminous chestnut wavy hair, soft pink chiffon long-sleeve open cardigan worn over a pastel mint high-neck fitted inner top, arms folded across her chest, mid-blue denim shorts, confident calm gaze.
4. FOURTH: long straight black hair, thin silver-rimmed glasses, navy buttoned cardigan over a white collared shirt with a dark grey necktie, navy pleated knee-length skirt, opaque black tights, tall dark boots, poised expression.
5. FAR RIGHT: black hair in a messy high ponytail with bangs, pastel-pink cartoon-bear printed cotton pajama top with lace-trimmed sleeves and matching lace-trimmed knee-length pajama pants, soft sleepy expression.

COMPOSITION for the vertical frame:
- Five women standing shoulder to shoulder in a single row, facing the camera directly, three-quarter body framing from head to just below the knees.
- Because the frame is tall, place the group in the lower two-thirds; above them show the dim ceiling and upper wall of the room, giving clean negative space at the top for a title.
- All five heads fully inside the frame with headroom, no cropped heads, no cut-off faces at the edges.

SCENE: dim warm-toned interior lounge, dark textured brown-olive walls, a dark leather sofa on the left, polished dark wood floor, a closed dark door in the background, moody low-key cinematic lighting with warm practical lights, deep shadows.

STYLE: photorealistic cinematic film still, 35mm equivalent, shallow depth of field, subtle film grain, natural realistic skin texture, editorial group key art.

Absolutely no text, no letters, no logos, no watermark, no signage in the image.

Negative: deformed hands, extra fingers, extra limbs, merged faces, distorted eyes, plastic over-smoothed skin, duplicate person, cropped head, black letterbox bars, square crop, landscape crop, revealing clothing, suggestive pose."""


def gen(idx, ref_path):
    body = {
        "model": MODEL,
        "messages": [{
            "role": "user",
            "content": [
                {"type": "text", "text": PROMPT},
                {"type": "image_url",
                 "image_url": {"url": f"data:image/png;base64,{b64_of(ref_path)}"}},
            ],
        }],
        "modalities": ["image", "text"],
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
        print(f"[{idx}] HTTP {e.code}: {e.read().decode()[:900]}")
        return None

    msg = data["choices"][0]["message"]
    imgs = msg.get("images") or []
    if not imgs:
        print(f"[{idx}] no image. text={str(msg.get('content'))[:400]}")
        return None

    b64 = imgs[0]["image_url"]["url"].split(",", 1)[1]
    p = OUT_DIR / f"lineup_portrait_v{idx}.png"
    p.write_bytes(base64.b64decode(b64))
    im = Image.open(p)
    print(f"[{idx}] OK -> {p} | {im.size} | {p.stat().st_size/1024:.0f} KB")
    return p


if __name__ == "__main__":
    canvas = OUT_DIR / "_ref_portrait_canvas.png"
    make_portrait_canvas(REF, canvas)
    print(f"ref canvas -> {canvas} {Image.open(canvas).size}")
    n = int(sys.argv[1]) if len(sys.argv) > 1 else 1
    for i in range(1, n + 1):
        gen(i, canvas)
        time.sleep(1)
