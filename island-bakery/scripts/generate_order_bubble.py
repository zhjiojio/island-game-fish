#!/usr/bin/env python3
"""生成与设计稿一致的顾客订单羊皮气泡（角钉 + 左下双尾）。"""
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[2]
W, H = 400, 124
OUTS = [
    ROOT / "island-bakery/package/res/Image/ui/order-bubble.png",
    ROOT / "assets/ui/order-bubble.png",
    ROOT / "assets/界面/弹窗与气泡/顾客订单气泡.png",
]


def main() -> None:
    im = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    pad = 10
    body = (pad, pad, W - pad, H - pad - 14)
    fill = (238, 226, 198, 255)
    stroke = (108, 78, 48, 255)
    d.rounded_rectangle(body, radius=22, fill=fill, outline=stroke, width=4)
    # 手绘感内框
    d.rounded_rectangle(
        (body[0] + 5, body[1] + 5, body[2] - 5, body[3] - 5),
        radius=18,
        outline=(160, 125, 82, 180),
        width=2,
    )
    # 四角钉
    rivet = (72, 54, 38, 255)
    for rx, ry in ((24, 22), (W - 24, 22), (24, H - 36), (W - 24, H - 36)):
        d.ellipse((rx - 5, ry - 5, rx + 5, ry + 5), fill=rivet)
        d.ellipse((rx - 2, ry - 2, rx + 2, ry + 2), fill=(90, 62, 38, 255))
    # 左下双尾指向顾客
    tip_y = body[3] + 2
    d.polygon([(52, tip_y), (68, tip_y), (44, H - 6)], fill=fill, outline=stroke)
    d.polygon([(36, tip_y), (48, tip_y), (28, H - 4)], fill=fill, outline=stroke)
    im = im.filter(ImageFilter.GaussianBlur(radius=0.4))
    # 重新描边保持清晰
    im2 = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    im2 = Image.alpha_composite(im2, im)
    arr = np.array(im2)
    fringe = (arr[:, :, :3].min(axis=2) >= 250) & (arr[:, :, 3] > 0)
    arr[fringe, 3] = 0
    im2 = Image.fromarray(arr)
    for p in OUTS:
        p.parent.mkdir(parents=True, exist_ok=True)
        im2.save(p, optimize=True)
    print("wrote", len(OUTS), "files", W, H)


if __name__ == "__main__":
    main()
