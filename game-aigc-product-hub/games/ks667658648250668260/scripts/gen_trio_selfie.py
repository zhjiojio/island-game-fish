#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
三人自拍首帧图生成（竖屏 9:16）
Provider: OpenRouter -> openai/gpt-5.4-image-2 (gpt-image-2)
合规改写：
  - 不写 cleavage / low-cut / see-through / lingerie / bare shoulders
  - 三层遮盖：外搭 + 内搭 + 描述闭合
  - 不写 school uniform，改 navy cardigan / white shirt / necktie
  - 统一 young adult women, in their twenties
"""
import os, sys, json, base64, time, pathlib
import urllib.request

API_KEY = os.environ.get("OPENROUTER_API_KEY")
if not API_KEY:
    sys.exit("missing OPENROUTER_API_KEY")

MODEL = "openai/gpt-5.4-image-2"
OUT_DIR = pathlib.Path("/Users/fat/weihunqi/outputs/trio-selfie")
OUT_DIR.mkdir(parents=True, exist_ok=True)

PROMPT = """Cinematic vertical portrait photograph, 9:16 portrait orientation, selfie point-of-view.

Three young adult women, in their twenties, East Asian, standing close together shoulder to shoulder inside a dim warm-toned indoor room. Shot from a slightly low angle as if the camera is held by an outstretched arm entering the frame from the right edge. Natural friendly group-photo energy, all three looking directly into the lens with warm composed smiles.

LEFT WOMAN: long straight black hair, thin gold-rimmed round eyeglasses, wearing a navy cardigan over a white collared shirt with a dark grey necktie, buttoned neatly to the collar, calm gentle half-smile, leaning slightly toward the camera.

CENTER WOMAN: short black hair with blunt bangs and soft loose side strands, wearing an oversized pastel-pink cartoon-print cotton tee with lace-trimmed short sleeves and a high round neckline, a small silver pendant necklace, shy soft expression, standing slightly further back.

RIGHT WOMAN: long voluminous chestnut wavy hair, wearing a light-pink chiffon long-sleeve blouse layered over a pastel mint inner top, fully covered neckline, relaxed confident warm gaze, tilting her head toward the lens.

Lighting: a single warm tungsten strip light along the upper wall creating a bright specular streak, strong falloff into deep warm-brown shadows, low-key cinematic mood, soft skin highlights.

Camera: 35mm equivalent, shallow depth of field, subtle film grain, natural realistic skin texture, photorealistic editorial photography.

Composition rules: vertical 9:16 frame, all three faces fully inside the frame in the upper-middle third, generous headroom above the heads, no cropped heads, no cut-off faces.

Absolutely no text, no letters, no logos, no watermark, no signage in the image.

Negative: deformed hands, extra fingers, extra arms, merged faces, distorted eyes, plastic over-smoothed skin, duplicate person, cropped head, harsh direct flash, revealing clothing, suggestive pose."""


def gen(idx: int):
    body = {
        "model": MODEL,
        "messages": [{"role": "user", "content": PROMPT}],
        "modalities": ["image", "text"],
    }
    req = urllib.request.Request(
        "https://openrouter.ai/api/v1/chat/completions",
        data=json.dumps(body).encode(),
        headers={
            "Authorization": f"Bearer {API_KEY}",
            "Content-Type": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=600) as r:
            data = json.load(r)
    except urllib.error.HTTPError as e:
        print(f"[{idx}] HTTP {e.code}: {e.read().decode()[:800]}")
        return None

    msg = data["choices"][0]["message"]
    imgs = msg.get("images") or []
    if not imgs:
        print(f"[{idx}] no image returned. text={str(msg.get('content'))[:300]}")
        return None

    url = imgs[0]["image_url"]["url"]
    b64 = url.split(",", 1)[1]
    p = OUT_DIR / f"trio_selfie_v{idx}.png"
    p.write_bytes(base64.b64decode(b64))
    print(f"[{idx}] OK -> {p} ({p.stat().st_size/1024:.0f} KB)")
    return p


if __name__ == "__main__":
    n = int(sys.argv[1]) if len(sys.argv) > 1 else 1
    for i in range(1, n + 1):
        gen(i)
        time.sleep(1)
