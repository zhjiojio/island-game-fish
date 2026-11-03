#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
EP05 首页横版 banner 生成器（方案二 · AIGC）
主题：房倒屋塌，如何致富？—— 土坯屋塌了，他却给她跺出一座金屋
参考帧：package/images/lastframes/n5_fix_b_grand.jpg（点石成屋·金光豪宅·傲天婉儿）

流程：以金屋参考帧做 image-edit 输入 -> 16:9 横版生成 -> 本地裁剪 768x320。
"""
import os, sys, json, base64, pathlib
import urllib.request, urllib.error
from PIL import Image

API_KEY = os.environ.get("OPENROUTER_API_KEY")
if not API_KEY:
    sys.exit("missing OPENROUTER_API_KEY")

MODEL = "google/gemini-3-pro-image"
ROOT = pathlib.Path(__file__).resolve().parent.parent
REF = ROOT / "package/images/lastframes/n5_fix_b_grand.jpg"
OUT_DIR = ROOT / "work/ep05_banner"
OUT_DIR.mkdir(parents=True, exist_ok=True)

PROMPT = """Cinematic wide landscape key-art banner for a Chinese period drama chapter titled
"房倒屋塌，如何致富" (how to get rich after the house collapses).

Preserve the two characters exactly from the reference image: a young Chinese man in a
coarse grey linen hanfu robe with a waist sash (the male lead), and beside/behind him a
young Chinese woman in a matching grey linen outfit with a warm astonished expression.
Keep their faces, hairstyles, clothing identity and the live-action cinematic medium.

Recompose into a HORIZONTAL wide 16:9 cinematic frame: the couple standing together
inside a breathtaking golden-lit grand marble palace hall, tall crystalline glowing
columns on both sides, warm divine golden sunlight streaming through huge arched windows,
opulent gold-and-white baroque interior, magical "stone-turned-to-mansion" fantasy glow.
Sense of miraculous newfound fortune, awe and warmth.

Composition: leave clean negative space in the upper area for later Chinese title text.
Rich warm golden palette, soft god-rays, luxurious but tasteful.

Absolutely no text, no letters, no logos, no watermark, no signage, no modern objects.
Confident elegant tone, full-coverage clothing, family-friendly, cinematic film still."""


def call(tag, prompt, ref_path, aspect="16:9"):
    ref_b64 = base64.b64encode(pathlib.Path(ref_path).read_bytes()).decode()
    body = {
        "model": MODEL,
        "messages": [{"role": "user", "content": [
            {"type": "text", "text": prompt},
            {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{ref_b64}"}},
        ]}],
        "modalities": ["image", "text"],
        "image_config": {"aspect_ratio": aspect},
    }
    req = urllib.request.Request(
        "https://openrouter.ai/api/v1/chat/completions",
        data=json.dumps(body).encode(),
        headers={"Authorization": f"Bearer {API_KEY}", "Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=900) as r:
            data = json.load(r)
    except urllib.error.HTTPError as e:
        print(f"[{tag}] HTTP {e.code} :: {e.read().decode()[:600]}", flush=True)
        return None

    msg = data["choices"][0]["message"]
    imgs = msg.get("images") or []
    if not imgs:
        print(f"[{tag}] NO IMAGE :: {str(msg.get('content'))[:300]}", flush=True)
        return None

    b64 = imgs[0]["image_url"]["url"].split(",", 1)[1]
    p = OUT_DIR / f"{tag}_src.png"
    p.write_bytes(base64.b64decode(b64))
    im = Image.open(p)
    print(f"[{tag}] src {im.size} | {p.stat().st_size/1024:.0f} KB -> {p}", flush=True)

    # 本地中心裁剪到 768x320 (2.4:1)
    TW, TH = 768, 320
    src = im.convert("RGB")
    sw, sh = src.size
    target_ratio = TW / TH
    src_ratio = sw / sh
    if src_ratio > target_ratio:
        # 太宽 -> 按高缩放后裁宽
        nh = TH
        nw = round(sw * TH / sh)
    else:
        nw = TW
        nh = round(sh * TW / sw)
    src = src.resize((nw, nh), Image.LANCZOS)
    left = (nw - TW) // 2
    top = int((nh - TH) * 0.30)  # 略偏上，保留人物+上方留白
    top = max(0, min(top, nh - TH))
    crop = src.crop((left, top, left + TW, top + TH))
    outp = OUT_DIR / f"{tag}_768x320.jpg"
    crop.save(outp, "JPEG", quality=88, optimize=True)
    print(f"[{tag}] banner {crop.size} | {outp.stat().st_size/1024:.0f} KB -> {outp}", flush=True)
    return outp


if __name__ == "__main__":
    tag = sys.argv[1] if len(sys.argv) > 1 else "ep05_v1"
    call(tag, PROMPT, REF)
