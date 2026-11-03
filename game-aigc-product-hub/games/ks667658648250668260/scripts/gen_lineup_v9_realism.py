#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
v9 = v6 提示词(Gemini 能过审的露度措辞) + v8 的 REALISM 抗 AI 味段

背景:
  v6  Gemini: 内容全中(深V/马甲线/露腰/亚洲脸/只1人穿鞋), 但"塑料感/AI味"重
  v7/v8 image2: 尺寸能竖屏(image_config.aspect_ratio), 但内容被文字拒答
  => 结论: 内容走 Gemini, 真实感靠 REALISM 提示词补

本轮唯一变量: 在 v6 基础上追加 REALISM 段, 其余完全不动.
"""
import os, sys, json, base64, pathlib
import urllib.request, urllib.error
from PIL import Image

sys.path.insert(0, str(pathlib.Path(__file__).parent))
from gen_lineup_v6 import build_prompt, SCENES, OUT_DIR

API_KEY = os.environ.get("OPENROUTER_API_KEY")
if not API_KEY:
    sys.exit("missing OPENROUTER_API_KEY")

MODEL = "google/gemini-3-pro-image"

# 抗 AI 味: 用"真实摄影缺陷"压掉磨皮塑料感
REALISM = """

PHOTOGRAPHIC REALISM — CRITICAL. This must look like a REAL UNRETOUCHED PHOTOGRAPH shot on
a real camera, NOT a rendered, illustrated, CGI or AI-generated image.
Real human skin with clearly visible pores and natural texture unevenness across the face,
faint natural blemishes and a few small freckles, natural under-eye tone and slight
shadows, subtle T-zone shine, fine vellus facial hair catching the light, real flyaway
baby hairs escaping around the hairline, slightly imperfect asymmetric natural
expressions, slightly uneven eyes, natural lip texture with fine vertical lines,
believable everyday body proportions rather than idealised ones.
Shot on a Sony A7 IV with a 50mm f/1.8 lens at f/2.8, available light only, mild lens
vignetting, natural chromatic aberration at the edges, authentic unmodified colour
science, slight handheld imperfection.
NO beauty filter, NO skin smoothing, NO airbrushing, NO digital retouching,
NO plastic CGI sheen, NO wax-doll skin, NO uniform flawless complexion.
Candid documentary photography feel, like a real behind-the-scenes press photo."""


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
    prompt = build_prompt(SCENES[f"v6_{which}"]) + REALISM
    call(f"v9_real_{which}", prompt)
