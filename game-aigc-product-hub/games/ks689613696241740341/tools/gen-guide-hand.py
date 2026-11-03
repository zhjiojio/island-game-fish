# -*- coding: utf-8 -*-
"""新手引导手势 GIF → 雪碧图（横向单行）+ 帧清单。

【为什么必须拆成雪碧图】快手小游戏的 canvas 用 ks.createImage() 加载 GIF
只会解出**第一帧**静态图，动不起来。想动只有两条路：
  ① 拆成多张 PNG 逐帧 drawImage（文件数爆炸、加载请求多）
  ② 拆成一张横向雪碧图，drawImage 时按帧号裁 sx（1 个请求，本脚本走这条）

【为什么要 trim 到统一画布】GIF 各帧的 bbox 不一样（PIL 的 GIF 差分帧），
逐帧各自 crop 会导致播放时手掌跳动。这里统一按「全局 alpha 并集 bbox」裁，
所有帧共用同一坐标系，播放才稳。

用法：python3 tools/gen-guide-hand.py <in.gif>
产物：package/assets/ui/guide/hand-sprite.png + hand-sprite.json
"""
import json
import os
import subprocess
import sys

from PIL import Image

OUT = 'package/assets/ui/guide'
TARGET_H = 132          # 设计坐标系(750x1624)下手势高度；宽度按原比例推
PNGQUANT = '/opt/homebrew/bin/pngquant'


def main():
    src = sys.argv[1] if len(sys.argv) > 1 else None
    if not src or not os.path.exists(src):
        print('用法: python3 tools/gen-guide-hand.py <in.gif>')
        return 1

    im = Image.open(src)
    n = getattr(im, 'n_frames', 1)

    # ── 1) 全部帧转 RGBA 并求 alpha 并集 bbox ──────────────────────────
    # 【踩坑·手掌被抠空】第一版写「全图凡是接近白的像素就置透明」，结果这只手
    # 掌本体就是白的 → 手心被整片抠掉，只剩描边和米色阴影，成了个空心轮廓。
    # 正解：只从画布【外缘】做 flood fill 往里洗，碰到描边就停 ——
    # 被描边包住的内部白色永远安全。
    frames, union = [], None
    for i in range(n):
        im.seek(i)
        f = im.convert('RGBA')
        w, h = f.size
        px = f.load()

        def bgish(c):
            # 背景判定放宽到 232：GIF 量化会让纯白底出现 235~255 的抖动
            return c[3] > 0 and c[0] > 232 and c[1] > 232 and c[2] > 232

        seen = [False] * (w * h)
        stack = []
        for x in range(w):
            stack.append((x, 0)); stack.append((x, h - 1))
        for y in range(h):
            stack.append((0, y)); stack.append((w - 1, y))
        while stack:
            x, y = stack.pop()
            if x < 0 or y < 0 or x >= w or y >= h:
                continue
            k = y * w + x
            if seen[k]:
                continue
            seen[k] = True
            if not bgish(px[x, y]):
                continue                       # 撞到描边 → 这条路到此为止
            c = px[x, y]
            px[x, y] = (c[0], c[1], c[2], 0)
            stack.append((x + 1, y)); stack.append((x - 1, y))
            stack.append((x, y + 1)); stack.append((x, y - 1))

        frames.append(f)
        bb = f.getbbox()
        if bb:
            union = bb if union is None else (
                min(union[0], bb[0]), min(union[1], bb[1]),
                max(union[2], bb[2]), max(union[3], bb[3]))
    if union is None:
        print('全帧皆空，GIF 可能不是透明/白底素材')
        return 1

    cw, ch = union[2] - union[0], union[3] - union[1]
    # 按目标高度等比缩放
    fh = TARGET_H
    fw = max(1, int(round(cw * fh / float(ch))))

    # ── 2) 横向拼成一行 ───────────────────────────────────────────────
    sheet = Image.new('RGBA', (fw * n, fh), (0, 0, 0, 0))
    for i, f in enumerate(frames):
        c = f.crop(union).resize((fw, fh), Image.LANCZOS)
        sheet.alpha_composite(c, (i * fw, 0))

    os.makedirs(OUT, exist_ok=True)
    png = os.path.join(OUT, 'hand-sprite.png')
    sheet.save(png)
    if os.path.exists(PNGQUANT):
        subprocess.call([PNGQUANT, '--force', '--quality', '65-92',
                         '--output', png, png])

    # ── 3) 帧清单：代码按它取帧，不要在代码里硬编码数字 ────────────────
    # GIF 原始帧延时（ms）取众数；PIL 的 duration 有时为 0，兜底 60ms。
    durs = []
    for i in range(n):
        im.seek(i)
        durs.append(im.info.get('duration') or 0)
    dur = max(set(durs), key=durs.count) or 60

    meta = {
        'file': 'assets/ui/guide/hand-sprite.png',
        'frames': n,
        'frameW': fw,
        'frameH': fh,
        'durationMs': dur,
        'note': ('横向单行雪碧图。第 i 帧 = drawImage(img, i*frameW, 0, frameW, frameH, '
                 'dx, dy, dw, dh)。指尖锚点约在帧的 (0.30w, 0.16h) 处，'
                 '把它对齐到目标点即可。')
    }
    with open(os.path.join(OUT, 'hand-sprite.json'), 'w') as fp:
        json.dump(meta, fp, ensure_ascii=False, indent=2)

    print('%s  %d 帧  单帧 %dx%d  总图 %dx%d  %d B  延时 %dms'
          % (png, n, fw, fh, fw * n, fh, os.path.getsize(png), dur))
    return 0


if __name__ == '__main__':
    sys.exit(main())
