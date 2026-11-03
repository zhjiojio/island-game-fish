#!/usr/bin/env python3
"""OpenRouter 生图/改图调用器。

读取 make_images 契约格式的请求 JSON（prompt / references / aspectRatio 等），
走 OpenRouter chat completions 的图像模态返回图片并落盘。
"""
import base64
import json
import os
import sys
import urllib.error
import urllib.request

ENDPOINT = "https://openrouter.ai/api/v1/chat/completions"
MODEL = "openai/gpt-image-2"


def main() -> int:
    if len(sys.argv) < 3:
        print("usage: or_image_gen.py <request.json> <output.png>")
        return 2
    req = json.load(open(sys.argv[1], encoding="utf-8"))
    out = sys.argv[2]
    key = os.environ.get("OPENROUTER_API_KEY")
    if not key:
        print("missing OPENROUTER_API_KEY")
        return 2

    content = [{"type": "text", "text": req["prompt"]}]
    for path in req.get("references", []):
        b64 = base64.b64encode(open(path, "rb").read()).decode()
        content.append({
            "type": "image_url",
            "image_url": {"url": "data:image/jpeg;base64," + b64},
        })

    payload = {
        "model": os.environ.get("OR_IMAGE_MODEL", MODEL),
        "messages": [{"role": "user", "content": content}],
        "modalities": ["image", "text"],
    }
    aspect = req.get("aspectRatio")
    if aspect:
        # OpenRouter 透传生图配置；chat 通道默认出方图，必须显式声明比例
        payload["image_config"] = {"aspect_ratio": aspect}
    request = urllib.request.Request(
        ENDPOINT,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Authorization": "Bearer " + key, "Content-Type": "application/json"},
        method="POST",
    )
    try:
        body = json.load(urllib.request.urlopen(request, timeout=900))
    except urllib.error.HTTPError as exc:
        print("HTTP", exc.code, exc.read().decode("utf-8", "replace")[:900])
        return 1

    message = body["choices"][0]["message"]
    images = message.get("images") or []
    if not images:
        print("NO_IMAGE:", json.dumps(message, ensure_ascii=False)[:900])
        return 3

    url = images[0]["image_url"]["url"]
    if url.startswith("data:"):
        data = base64.b64decode(url.split(",", 1)[1])
    else:
        data = urllib.request.urlopen(url, timeout=600).read()
    with open(out, "wb") as fh:
        fh.write(data)
    print("OK", out, len(data))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
