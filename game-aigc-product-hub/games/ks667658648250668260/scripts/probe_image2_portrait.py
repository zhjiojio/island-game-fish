#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
探针: 穷举 openai/gpt-5.4-image-2 在 OpenRouter 上的竖屏参数写法.
目标: 找到能让 image2 输出 9:16 竖图的那一种.
每种写法只跑一张小图, 打印 HTTP 码 + 实际输出尺寸.
"""
import os, sys, json, base64, pathlib, io
import urllib.request, urllib.error
from PIL import Image

API_KEY = os.environ.get("OPENROUTER_API_KEY")
if not API_KEY:
    sys.exit("missing OPENROUTER_API_KEY")

OUT = pathlib.Path("/Users/fat/weihunqi/outputs/probe")
OUT.mkdir(parents=True, exist_ok=True)
MODEL = "openai/gpt-5.4-image-2"
P = "A vertical full-body photo of one young Chinese woman standing in a loft cafe, 9:16 tall portrait format."

# 各种可能的竖屏参数写法
VARIANTS = {
    "a_image_config_ar":      {"image_config": {"aspect_ratio": "9:16"}},
    "b_image_config_size":    {"image_config": {"size": "1024x1792"}},
    "c_top_size":             {"size": "1024x1792"},
    "d_top_aspect":           {"aspect_ratio": "9:16"},
    "e_provider_size":        {"provider": {"order": ["openai"]}, "size": "1024x1792"},
    "f_extra_body_size":      {"extra_body": {"size": "1024x1792"}},
    "g_modalities_only":      {},
    "h_image_config_both":    {"image_config": {"aspect_ratio": "9:16", "size": "1024x1792"}},
    "i_quality_size":         {"image_config": {"size": "1024x1792", "quality": "high"}},
}


def probe(tag, extra):
    body = {
        "model": MODEL,
        "messages": [{"role": "user", "content": [{"type": "text", "text": P}]}],
        "modalities": ["image", "text"],
    }
    body.update(extra)
    req = urllib.request.Request(
        "https://openrouter.ai/api/v1/chat/completions",
        data=json.dumps(body).encode(),
        headers={"Authorization": f"Bearer {API_KEY}",
                 "Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=600) as r:
            data = json.load(r)
    except urllib.error.HTTPError as e:
        print(f"[{tag}] HTTP {e.code} :: {e.read().decode()[:220]}", flush=True)
        return
    except Exception as e:
        print(f"[{tag}] ERR {e}", flush=True)
        return

    msg = data["choices"][0]["message"]
    imgs = msg.get("images") or []
    if not imgs:
        print(f"[{tag}] NO IMAGE :: {str(msg.get('content'))[:150]}", flush=True)
        return
    raw = base64.b64decode(imgs[0]["image_url"]["url"].split(",", 1)[1])
    im = Image.open(io.BytesIO(raw))
    w, h = im.size
    verdict = "*** PORTRAIT ***" if h > w else "square/landscape"
    (OUT / f"{tag}.png").write_bytes(raw)
    print(f"[{tag}] {w}x{h}  {verdict}", flush=True)


if __name__ == "__main__":
    only = sys.argv[1] if len(sys.argv) > 1 else None
    for tag, extra in VARIANTS.items():
        if only and not tag.startswith(only):
            continue
        probe(tag, extra)
