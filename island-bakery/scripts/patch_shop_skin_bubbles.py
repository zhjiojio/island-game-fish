#!/usr/bin/env python3
"""从横屏店皮肤抠两个订单气泡，并去掉右上第三只气泡。"""
from __future__ import annotations

from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
SKIN = ROOT / "island-bakery/package/res/Image/ui/ui-skin-shop-land.png"
OUT_BUBBLE = ROOT / "assets/界面/弹窗与气泡/顾客订单气泡-皮肤.png"
PKG_BUBBLE = ROOT / "island-bakery/package/res/Image/ui/order-bubble-skin-land.png"
# 1600×900 设计稿上大致矩形（蓝熊、右下粉猪）；右上气泡用邻域填充去掉
LEFT_BOX = (548, 52, 752, 128)
RIGHT_BOX = (1048, 198, 1248, 274)
REMOVE_BOX = (1048, 52, 1248, 128)


def crop_key_bubble(im: Image.Image, box: tuple[int, int, int, int]) -> Image.Image:
    arr = np.array(im.crop(box).convert("RGBA"))
    lum = arr[:, :, :3].max(axis=2)
    sat = (arr[:, :, :3].max(axis=2) - arr[:, :, :3].min(axis=2)) / (lum + 1e-3)
    paper = (lum > 190) & (sat < 0.18)
    arr[~paper, 3] = 0
    return Image.fromarray(arr)


def inpaint_remove(im: Image.Image, box: tuple[int, int, int, int]) -> Image.Image:
    x0, y0, x1, y1 = box
    w, h = im.size
    arr = np.array(im.convert("RGBA"))
    # 用气泡上下条带的中位色铺盖
    patch_y0 = max(0, y0 - 24)
    patch_y1 = min(h, y1 + 32)
    sample = arr[patch_y0:patch_y1, x0 - 40 : x1 + 40, :3]
    fill = np.median(sample.reshape(-1, 3), axis=0).astype(np.uint8)
    arr[y0:y1, x0:x1, :3] = fill
    arr[y0:y1, x0:x1, 3] = 255
    return Image.fromarray(arr)


def main() -> None:
    im = Image.open(SKIN)
    left = crop_key_bubble(im, LEFT_BOX)
    right = crop_key_bubble(im, RIGHT_BOX)
    # 统一用左泡（略宽）作程序贴图
    tpl = left.convert("RGBA")
    OUT_BUBBLE.parent.mkdir(parents=True, exist_ok=True)
    tpl.save(OUT_BUBBLE, optimize=True)
    tpl.save(PKG_BUBBLE, optimize=True)
    patched = inpaint_remove(im, REMOVE_BOX)
    patched.save(SKIN, optimize=True)
    # 同尺寸也写一份 assets 备份
    backup = ROOT / "assets/界面/全屏皮肤/ui-skin-shop-land.png"
    backup.parent.mkdir(parents=True, exist_ok=True)
    patched.save(backup, optimize=True)
    print("saved bubble template", OUT_BUBBLE)
    print("patched skin", SKIN)


if __name__ == "__main__":
    main()
