#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
v7: 用 v6 的提示词, 换 openai/gpt-5.4-image-2 (image2) 生成, 主攻"真人感".

关键结论(探针 probe_image2_portrait.py 验证):
  image2 在 OpenRouter 上 **支持** image_config.aspect_ratio -> 720x1280 真竖屏
  不支持 size / 顶层 aspect_ratio (静默 fallback 1024x1024)

同时叠加 REALISM 段: 用真实摄影缺陷描述压掉塑料磨皮感.
"""
import os, sys, json, base64, pathlib
import urllib.request, urllib.error
from PIL import Image

sys.path.insert(0, str(pathlib.Path(__file__).parent))
from gen_lineup_v6 import build_prompt, SCENES, OUT_DIR  # 复用 v6 提示词

API_KEY = os.environ.get("OPENROUTER_API_KEY")
if not API_KEY:
    sys.exit("missing OPENROUTER_API_KEY")

MODEL_IMAGE2 = "openai/gpt-5.4-image-2"

# 抗 AI 味强化段: 用真实摄影缺陷描述压掉塑料感
REALISM = """

PHOTOGRAPHIC REALISM — this must look like a REAL UNRETOUCHED photograph taken on a real
camera, NOT a rendered, illustrated or AI-generated image. Real human skin with clearly
visible pores and natural texture unevenness, faint natural blemishes, natural under-eye
tone, slight T-zone shine, real flyaway baby hairs around the hairline, imperfect
asymmetric natural expressions, slightly uneven eyes, believable everyday body
proportions rather than idealised ones. Shot on a Sony A7 IV with a 50mm f/1.8 lens,
available light only, mild lens vignetting, authentic colour science.
NO beauty filter, NO skin smoothing, NO digital retouching, NO airbrushing,
NO plastic CGI sheen. Candid documentary photography feel."""


def call(tag, prompt, aspect="9:16"):
    body = {
        "model": MODEL_IMAGE2,
        "messages": [{"role": "user", "content": [{"type": "text", "text": prompt}]}],
        "modalities": ["image", "text"],
        "image_config": {"aspect_ratio": aspect},   # ← image2 认这个
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
        print(f"[{tag}] HTTP {e.code} :: {e.read().decode()[:600]}", flush=True)
        return None

    msg = data["choices"][0]["message"]
    imgs = msg.get("images") or []
    if not imgs:
        print(f"[{tag}] NO IMAGE :: {str(msg.get('content'))[:250]}", flush=True)
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
    scene = SCENES[f"v6_{which}"]
    base = build_prompt(scene)
    call(f"v7_image2_{which}", base + REALISM)
