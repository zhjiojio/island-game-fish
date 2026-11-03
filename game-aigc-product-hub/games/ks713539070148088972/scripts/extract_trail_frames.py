#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
一次性脚本：把 assets/meinv/effect 下的 Spine 拖尾骨骼动画（skeleton.png + skeleton.atlas）
按 libgdx TextureAtlas 打包规则解包成 8 张独立的、方向已还原的透明 PNG 序列帧，
输出到 assets/meinv/effect/frames/trail_00.png ~ trail_07.png（统一 50x200 画布，锚点一致），
供渲染引擎按普通贴图帧动画方式使用（无需运行时解析 Spine 骨骼/atlas）。

用法：python3 scripts/extract_trail_frames.py
"""
import os
import re
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
EFFECT_DIR = os.path.join(ROOT, 'assets', 'meinv', 'effect')
ATLAS_PATH = os.path.join(EFFECT_DIR, 'skeleton.atlas')
PNG_PATH = os.path.join(EFFECT_DIR, 'skeleton.png')
OUT_DIR = os.path.join(EFFECT_DIR, 'frames')


def parse_atlas(path):
    with open(path, 'r', encoding='utf-8') as f:
        lines = [l.rstrip('\n') for l in f]

    regions = []
    i = 0
    # 跳过 page header（图名/size/format/filter/repeat）直到第一个不含冒号的裸名字行
    while i < len(lines) and (lines[i].strip() == '' or ':' in lines[i] or i == 0):
        if lines[i].strip() and ':' not in lines[i] and not lines[i].startswith('skeleton'):
            break
        i += 1

    i = 0
    # 简化处理：跳过前 5 行 page 头信息（空行/png名/size/format/filter/repeat）
    # 用更鲁棒方式：逐行找 region 名（不含冒号且非空的行）
    while i < len(lines):
        line = lines[i]
        if line.strip() == '' or ':' in line:
            i += 1
            continue
        if line.strip() in ('skeleton.png',):
            i += 1
            continue
        name = line.strip()
        region = {'name': name}
        i += 1
        while i < len(lines) and ':' in lines[i]:
            key, val = lines[i].split(':', 1)
            key = key.strip()
            val = val.strip()
            if key in ('xy', 'size', 'orig', 'offset'):
                nums = [int(x.strip()) for x in val.split(',')]
                region[key] = nums
            elif key == 'rotate':
                region[key] = (val == 'true')
            elif key == 'index':
                region[key] = int(val)
            i += 1
        regions.append(region)
    return regions


def main():
    regions = parse_atlas(ATLAS_PATH)
    sheet = Image.open(PNG_PATH).convert('RGBA')
    os.makedirs(OUT_DIR, exist_ok=True)

    manifest = []
    for r in regions:
        name = r['name']
        rotate = r.get('rotate', False)
        x, y = r['xy']
        size_w, size_h = r['size']
        orig_w, orig_h = r['orig']
        off_x, off_y = r['offset']

        # 打包矩形：rotate=true 时物理占位的宽高与 size 互换
        packed_w, packed_h = (size_h, size_w) if rotate else (size_w, size_h)
        box = (x, y, x + packed_w, y + packed_h)
        piece = sheet.crop(box)
        if rotate:
            # atlas 打包时做了 90° 顺时针旋转存储，这里逆向转回（270° CCW == 90° CW 还原）
            piece = piece.transpose(Image.ROTATE_270)
        # 还原后应为 size_w x size_h
        if piece.size != (size_w, size_h):
            piece = piece.resize((size_w, size_h))

        canvas = Image.new('RGBA', (orig_w, orig_h), (0, 0, 0, 0))
        # offset 是 spine 惯例：相对 orig 左下角、y 向上；转换为图像左上角坐标系
        dest_x = off_x
        dest_y = orig_h - off_y - size_h
        canvas.paste(piece, (dest_x, dest_y), piece)

        out_name = 'trail_%02d.png' % int(re.search(r'\d+', name).group())
        out_path = os.path.join(OUT_DIR, out_name)
        canvas.save(out_path)
        manifest.append(out_name)
        print('wrote', out_path, 'from region', name, 'rotate=', rotate)

    print('anchor (root bone in local px, origin at box top-left):', (orig_w / 2.0, orig_h / 2.0))
    print('frames:', manifest)


if __name__ == '__main__':
    main()
