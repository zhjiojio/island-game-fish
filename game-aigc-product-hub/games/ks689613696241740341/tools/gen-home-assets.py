#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
拼豆小游戏 · 暂停浮层 UI 素材生成（image2 / gpt-image-2）
==========================================================
和 tools/ui-home.py（矢量手绘版）是【互斥的两条路】，本文件是现行方案：
矢量手绘的塑料感太重，改用 image2 出「糖果质感」的休闲游戏 UI 切图。

管线：
  1. 每个元素单独一次 image2 generate，背景强制要求【纯品红 #FF00FF】
     （粉/洋红本体的元素改用【纯绿 #00FF00】，避免和自身颜色撞色）
  2. 本地按【色相族】抠底（不是按精确 RGB）——
     这样连带把「投影染色后的品红」一起抠掉，不会留下深色晕圈
  3. 泛光边缘做 despill + 羽化 1px
  4. 按 alpha bbox 裁切 → 缩放到设计坐标系目标尺寸 → pngquant 压缩

为什么不让模型直接出透明底：gateway 的 generate 没有 background=transparent 参数。

用法：
  python3 tools/gen-home-assets.py            # 全量
  python3 tools/gen-home-assets.py btn_home   # 只重出某几个
"""
import json, os, subprocess, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'package', 'assets', 'ui', 'home')
# 【为什么不放 /tmp】/tmp 会被系统清理进程回收，长跑（14 张 × 30s）中途就没了，
# 已实测踩过：目录连带原图一起消失，脚本重跑等于全部重出，白烧配额。
RAW = os.path.join(os.path.expanduser('~'), '.cache', 'pdhome_raw')
AGW = '/Users/fat/.codeflicker/remote-personal-skills/agw-work-mode'
os.makedirs(OUT, exist_ok=True)
os.makedirs(RAW, exist_ok=True)

# 所有 prompt 共用的风格底座 —— 关键几条：
#   · single element only  → 防止模型画成一整套 UI 面板
#   · no drop shadow on background → 投影一旦落到背景上，抠底后就是脏边；
#     改成「元素自带下沉底座（bottom bevel）」，立体感留在形状内部
#   · no text → 中文全部由 canvas 运行时绘制，切图里不能有字
BASE = (' Chunky glossy candy style mobile casual game UI asset, like Royal Match / '
        'Gardenscapes / Toon Blast interface art. Clean crisp vector-like shapes, smooth '
        'rich gradients, thick pure white outline, soft glossy top highlight, and a slightly '
        'darker solid bottom bevel base for depth INSTEAD of a drop shadow. '
        'Single isolated element only, centered, filling most of the frame. '
        'The element edge must be a crisp hard clean cut directly against the flat background: '
        'absolutely NO drop shadow, NO soft shadow, NO grey shadow, NO glow, NO blur, NO haze, '
        'NO halo and NO dark rim of any kind outside the white outline stroke. '
        'no text, no letters, no numbers, no watermark, no extra decorations, '
        'no other UI elements around it. ')


def bg(key):
    if key == 'g':
        return ('Background must be one completely flat uniform pure green #00FF00 fill, '
                'absolutely nothing else, no gradient, no texture, no vignette.')
    return ('Background must be one completely flat uniform pure magenta #FF00FF fill, '
            'absolutely nothing else, no gradient, no texture, no vignette.')


# name: (prompt主体, aspectRatio, keyColor, 目标宽, 目标高)
E = {
    'pause_title': (
        'A wide horizontal rounded pill-shaped title banner plate, completely empty with no '
        'text. Violet to deep indigo vertical gradient body.',
        '16:9', 'm', 390, 108),

    'pause_card': (
        'A large rounded-rectangle white panel card, empty inside with nothing on it. Pure '
        'soft white body, a thick violet-indigo rounded border frame around it, and a wider '
        'translucent pale lavender outer glow ring hugging that border.',
        # 【均 400 踩坑】gpt-image-2 只吃 1024x1024 / 1536x1024 / 1024x1536，
        # 宽高必须都能被 16 整除。'4:3' 会被换算成 1365x1024 → 400 invalid size。
        # 合法比例只有 1:1 / 3:2 / 2:3 / 16:9，卡片是 626x536（近 7:6）→ 取 1:1 最近。
        '1:1', 'm', 626, 536),

    'row_bg': (
        'A wide horizontal rounded-rectangle list row plate, empty inside. Very light '
        'lavender-white body with a faint pale violet 1px inner border, extremely subtle, '
        'almost flat, minimal depth.',
        '16:9', 'm', 550, 140),

    'btn_close': (
        'A round red close button with a bold white X cross mark in the center. Coral red to '
        'deep red vertical gradient, thick white ring outline.',
        '1:1', 'm', 88, 88),

    'toggle_on': (
        'A horizontal pill-shaped toggle switch in the ON state: mint-green to emerald green '
        'gradient track, a large glossy pure white circular knob sitting at the RIGHT end, '
        'and a small white ring dot marker on the left side of the track.',
        '16:9', 'm', 130, 70),

    'toggle_off': (
        'A horizontal pill-shaped toggle switch in the OFF state: desaturated light grey to '
        'cool grey gradient track, a large glossy pure white circular knob sitting at the '
        'LEFT end, and a small dim grey ring dot marker on the right side of the track.',
        '16:9', 'm', 130, 70),

    'ico_sound': (
        'A single speaker / volume icon drawn as thick rounded line-art strokes only, no fill '
        'inside, deep slate violet color: a rounded rectangular speaker box with a trapezoid '
        'horn on the left and two curved sound arcs radiating to the right.',
        '1:1', 'm', 72, 72),

    'ico_vibrate': (
        'A single vibration icon drawn as thick rounded line-art strokes only, no fill inside, '
        'deep slate violet color: a tall rounded-rectangle phone outline in the middle with a '
        'small solid pill inside it, and two curved vibration arcs on the left side and two '
        'mirrored curved arcs on the right side.',
        '1:1', 'm', 72, 72),

    'ico_music': (
        'A single music note icon, deep slate violet color: two eighth notes joined by a '
        'slanted beam, with solid oval note heads and thick rounded stems.',
        '1:1', 'm', 72, 72),

    'btn_home': (
        'A round amber-gold button with a bold solid white house icon centered on it. The '
        'house has a triangular gable roof and an arched doorway cut out of it showing the '
        'gold behind. Warm yellow to deep orange vertical gradient body, thick white ring.',
        '1:1', 'm', 136, 136),

    'btn_restart': (
        'A wide horizontal rounded pill-shaped push button, completely empty with no text. '
        'Fresh light green to deep grass green vertical gradient body.',
        '16:9', 'm', 340, 126),

    'btn_resume': (
        'A wide horizontal rounded pill-shaped push button, completely empty with no text. '
        'Bright aqua cyan to deep teal vertical gradient body.',
        '16:9', 'm', 400, 126),

    'btn_skip': (
        'A round pink-magenta button with a bold solid white skip-forward icon centered on it '
        '(a right-pointing triangle immediately followed by a vertical bar). Light pink to '
        'deep magenta vertical gradient body, thick white ring.',
        '1:1', 'g', 136, 136),

    'ad_tag': (
        'A small rounded-square green badge with a solid white video camera icon inside it '
        '(a rounded rectangle body plus a small triangular lens pointing right). Bright green '
        'to deep green gradient, thin white outline.',
        '1:1', 'm', 56, 40),
}


# ── 1) 出图 ──────────────────────────────────────────────────
def gen(name):
    body, ar, key, _w, _h = E[name]
    req = {
        'task': 'generate',
        'prompt': body + BASE + bg(key),
        'aspectRatio': ar,
        'resolution': '1K',
        'quality': 'high',
        'outputFormat': 'png',
    }
    rp = os.path.join(RAW, name + '.req.json')
    f = open(rp, 'w')
    json.dump(req, f, ensure_ascii=False)
    f.close()
    dst = os.path.join(RAW, name + '.png')
    r = subprocess.run(['python3', '-m', 'tools.make_images', rp, '--output', dst],
                       cwd=AGW, capture_output=True, text=True)
    if r.returncode != 0:
        print('  [FAIL] %s : %s' % (name, (r.stderr or r.stdout)[-260:]))
        return None
    return dst


# ── 2) 抠底 + 裁切 + 缩放 ────────────────────────────────────
def keyout(src, out, key, tw, th):
    from PIL import Image
    im = Image.open(src).convert('RGBA')
    w, h = im.size
    px = im.load()
    # 【为什么按色相族而不是精确 RGB】背景上必然有元素的染色投影/泛光
    # （深品红 200,0,200 / 亮品红 255,120,255），精确匹配只能抠掉纯色那一档，
    # 剩下的会变成一圈脏边。按「品红族 = R与B都明显高于G、且R≈B」判定，
    # 深浅品红全部命中，白描边(R≈G≈B)和绿/黄/紫元素都不会误伤。
    def is_bg(c):
        r, g, b = c[0], c[1], c[2]
        if key == 'g':
            return g > r + 34 and g > b + 34 and abs(r - b) < 52
        return r > g + 34 and b > g + 34 and abs(r - b) < 52

    # 【灰晕清理 · 实测必须有】prompt 已明确禁投影，但模型仍会画一圈灰投影。
    # 灰投影不是品红族（R≈G≈B）→ is_bg 抓不到 → 抠完留一圈灰边/灰疙瘩。
    # 判据：低饱和 + 亮度处在「比白描边暗、比线稿图标亮」的中间带。
    #   白描边 lum≈245 → 用 lum < LUM_MAX 排除，绝不误伤
    #   深色线稿图标 lum≈70 → 用 lum > LUM_MIN 排除
    # 且只从画布边缘 flood 进来，元素内部的灰（如 toggle_off 灰轨）碰不到。
    # 阈值取值依据（实测）：白描边 lum≈245、深色线稿图标 lum≈70、
    # 模型画的灰投影 lum≈140~215（实测比预估的更亮，上限 205 会漏抠）。
    # 上限提到 232，但必须同时把 SAT_MAX 压到 26：
    #   灰投影是真正的中性灰（sat≈8），pause_card 的淡紫柔光环 sat≈32，
    #   靠【饱和度】而不是亮度去区分两者，才能既抠干投影又保住设计元素。
    LUM_MIN, LUM_MAX, SAT_MAX = 100, 232, 26

    def is_halo(c):
        r, g, b = c[0], c[1], c[2]
        lum = (r * 299 + g * 587 + b * 114) // 1000
        sat = max(r, g, b) - min(r, g, b)
        return sat <= SAT_MAX and LUM_MIN <= lum <= LUM_MAX

    def flood_ok(c):
        return is_bg(c) or is_halo(c)

    # 只从画布四边 flood fill，保证元素【内部】的同色像素不会被误抠
    bgmask = bytearray(w * h)
    stack = []
    for x in range(w):
        stack.append((x, 0)); stack.append((x, h - 1))
    for y in range(h):
        stack.append((0, y)); stack.append((w - 1, y))
    while stack:
        x, y = stack.pop()
        if x < 0 or y < 0 or x >= w or y >= h:
            continue
        i = y * w + x
        if bgmask[i]:
            continue
        if not flood_ok(px[x, y]):
            continue
        bgmask[i] = 1
        stack.append((x + 1, y)); stack.append((x - 1, y))
        stack.append((x, y + 1)); stack.append((x, y - 1))

    # despill：贴边的半透像素带一点键色，直接把键色通道压到另两通道的水平
    for y in range(h):
        for x in range(w):
            if bgmask[y * w + x]:
                px[x, y] = (0, 0, 0, 0)
                continue
            r, g, b, a = px[x, y]
            if key == 'g':
                lim = max(r, b) + 26
                if g > lim:
                    g = lim
            else:
                lim = g + 40
                if r > lim and b > lim:
                    # 只压「R与B同时超标」的品红泛光，不动本来就偏红/偏蓝的元素
                    if abs(r - b) < 52:
                        r = min(r, lim + 18); b = min(b, lim + 18)
            px[x, y] = (r, g, b, a)

    im = im.crop(im.getbbox())
    im = im.resize((tw, th), Image.LANCZOS)
    im.save(out)
    subprocess.call(['pngquant', '--force', '--skip-if-larger', '--quality', '70-94',
                     '-o', out, out],
                    stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    return os.path.getsize(out)


def main():
    names = sys.argv[1:] or sorted(E.keys())
    man_path = os.path.join(OUT, 'home-slices.json')
    man = {'scale': 1, 'source': 'image2/gpt-image-2', 'slices': {}}
    if os.path.exists(man_path):
        try:
            man = json.load(open(man_path))
            man['slices'] = man.get('slices', {})
        except Exception:
            pass
    for n in names:
        if n not in E:
            print('  [SKIP] 未定义: ' + n); continue
        raw = os.path.join(RAW, n + '.png')
        if not os.path.exists(raw):
            print('  出图 %s ...' % n)
            raw = gen(n)
            if not raw:
                continue
        _b, _a, _k, tw, th = E[n]
        dst = os.path.join(OUT, n + '.png')
        sz = keyout(raw, dst, _k, tw, th)
        man['slices'][n] = {'w': tw, 'h': th, 'file': 'assets/ui/home/' + n + '.png'}
        print('  %-14s %4dx%-4d -> %6d B' % (n, tw, th, sz))
    f = open(man_path, 'w')
    json.dump(man, f, indent=2, ensure_ascii=False)
    f.close()
    print('\n清单: %s (%d 个切图)' % (man_path, len(man['slices'])))


if __name__ == '__main__':
    main()
