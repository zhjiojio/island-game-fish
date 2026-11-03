# -*- coding: utf-8 -*-
"""弹窗道具图标生成（升级 / 清空 / 速度x2）—— 风格对齐已有 icon_refresh.png。

【风格基准】读现有 icon_refresh.png 得出：
  扁平厚实矢量 / 双色饱和配色 / 白色四角星点缀 / 无白描边 / 440x440 @2x / 透明底

【为什么还是要键控】image2 网关没有透明背景参数（tools/make_images/contract.py
的 normalize_request 只接受 task/prompt/references/resolution/aspectRatio/
quality/outputFormat），所以只能生成在纯色键上再本地抠。

【aspectRatio 只能用 1:1 / 3:2 / 2:3 / 16:9】gpt-image-2 要求宽高都能被 16
整除，写 4:3 会被换算成 1365x1024 直接 400（已实测踩过）。图标都是方的，用 1:1。

用法：python3 tools/gen-popup-icons.py [name ...]   不带参数=全出
"""
import json
import os
import subprocess
import sys

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
OUT = os.path.join(ROOT, 'package/assets/ui/popup')
# 【不放 /tmp】/tmp 会被系统清理进程回收，长跑中途原图连带消失，白烧配额。
RAW = os.path.join(os.path.expanduser('~'), '.cache', 'pdicon_raw')
AGW = '/Users/fat/.codeflicker/remote-personal-skills/agw-work-mode'
PNGQUANT = '/opt/homebrew/bin/pngquant'
SIZE = 440                      # 与 icon_refresh.png 一致（@2x，视觉 220）

BASE = (
    ' Flat chunky vector game icon, mobile casual game item icon style. '
    'Bold simple silhouette with thick rounded shapes, two-tone saturated flat colors, '
    'subtle flat shading only, plus two small white four-point sparkle stars as accents. '
    'Absolutely flat design: NO outline stroke, NO gradient mesh, NO 3D bevel, '
    'NO drop shadow, NO glow, NO blur, NO halo, NO dark rim of any kind. '
    'Single centered icon filling about 80 percent of the frame. '
    'no text, no letters, no numbers, no watermark, no background scenery. '
    'The icon edge must be a crisp hard clean cut directly against the flat background. '
    'Flat pure magenta #FF00FF background, completely uniform, no shading on the background.'
)

E = {
    # 升级 = 车容量翻倍。用「向上的厚实双层箭头」表达提升，避免出现数字（模型画字必糊）
    'icon_upgrade': (
        'A bold chunky upward pointing arrow made of two stacked thick chevrons, '
        'the upper chevron bright lime green and the lower chevron deep teal blue, '
        'suggesting an upgrade or level up.'
    ),
    # 清空 = 把占死车位的僵尸车整辆清走。用「厚实扫帚 + 清扫弧线」，语义最直白
    'icon_clear': (
        'A bold chunky cartoon broom sweeping, the handle warm orange and the '
        'brush head bright cyan blue, with a short curved sweeping motion arc.'
    ),
    # 速度x2 = 全程倍速。用「双层右向快进箭头 + 速度线」，不写数字
    'icon_speed': (
        'A bold chunky double right pointing fast forward arrow, the front triangle '
        'hot pink and the back triangle golden yellow, with two short horizontal '
        'speed motion lines behind it.'
    ),
}


def gen_raw(name, prompt):
    """调 image2 出原图（缓存命中就跳过，避免重复烧配额）"""
    os.makedirs(RAW, exist_ok=True)
    dst = os.path.join(RAW, name + '.png')
    if os.path.exists(dst) and os.path.getsize(dst) > 10000:
        return dst
    req = os.path.join(RAW, name + '.json')
    with open(req, 'w') as f:
        json.dump({
            'task': 'generate',
            'prompt': prompt + BASE,
            'resolution': '1K',
            'aspectRatio': '1:1',
            'quality': 'high',
            'outputFormat': 'png',
        }, f, ensure_ascii=False)
    print('  出图 %s ...' % name)
    r = subprocess.run(
        [sys.executable, '-m', 'tools.make_images', req, '--output', dst],
        cwd=AGW, capture_output=True, text=True)
    if r.returncode != 0 or not os.path.exists(dst):
        raise RuntimeError('image2 失败: ' + (r.stderr or r.stdout)[-400:])
    return dst


def key_out(src, dst):
    """品红键控 + 灰投影清理 + 裁切 + 缩放到 SIZE"""
    im = Image.open(src).convert('RGBA')
    w, h = im.size
    px = im.load()

    def is_bg(c):
        # 【按色族而非精确值】投影溢色会产生大量品红的深浅变体，
        # 只匹配纯值会留一圈脏边。
        r, g, b = c[0], c[1], c[2]
        return r > g + 34 and b > g + 34 and abs(r - b) < 52

    # 灰投影：模型无视 prompt 照样画。它不在品红色族里，靠「低饱和 + 中等亮度」抓。
    # 阈值同 gen-home-assets.py：靠饱和度区分投影(sat≈8)与设计用的浅色(sat>26)。
    LUM_MIN, LUM_MAX, SAT_MAX = 100, 232, 26

    def is_halo(c):
        r, g, b = c[0], c[1], c[2]
        lum = (r * 299 + g * 587 + b * 114) // 1000
        return (max(r, g, b) - min(r, g, b)) <= SAT_MAX and LUM_MIN <= lum <= LUM_MAX

    def ok(c):
        return is_bg(c) or is_halo(c)

    # 边缘 flood fill：只从画布外缘往里洗，图标【内部】的同色像素永远安全
    seen = bytearray(w * h)
    st = []
    for x in range(w):
        st.append((x, 0)); st.append((x, h - 1))
    for y in range(h):
        st.append((0, y)); st.append((w - 1, y))
    while st:
        x, y = st.pop()
        if x < 0 or y < 0 or x >= w or y >= h:
            continue
        k = y * w + x
        if seen[k]:
            continue
        seen[k] = 1
        c = px[x, y]
        if c[3] == 0 or not ok(c):
            continue
        px[x, y] = (c[0], c[1], c[2], 0)
        st.append((x + 1, y)); st.append((x - 1, y))
        st.append((x, y + 1)); st.append((x, y - 1))

    bb = im.getbbox()
    if bb:
        im = im.crop(bb)
    # 等比缩放后居中贴到正方形画布，保证三个图标视觉大小一致
    iw, ih = im.size
    s = float(SIZE) / max(iw, ih)
    im = im.resize((max(1, int(iw * s)), max(1, int(ih * s))), Image.LANCZOS)
    cv = Image.new('RGBA', (SIZE, SIZE), (0, 0, 0, 0))
    cv.alpha_composite(im, ((SIZE - im.size[0]) // 2, (SIZE - im.size[1]) // 2))
    cv.save(dst)
    if os.path.exists(PNGQUANT):
        subprocess.call([PNGQUANT, '--force', '--quality', '65-92',
                         '--output', dst, dst])


def main():
    want = sys.argv[1:] or sorted(E.keys())
    os.makedirs(OUT, exist_ok=True)
    for name in want:
        if name not in E:
            print('  跳过未知 %s' % name)
            continue
        try:
            raw = gen_raw(name, E[name])
            dst = os.path.join(OUT, name + '.png')
            key_out(raw, dst)
            print('  %-14s %dx%d -> %6d B' % (name, SIZE, SIZE, os.path.getsize(dst)))
        except Exception as ex:
            print('  [FAIL] %s : %s' % (name, ex))
    return 0


if __name__ == '__main__':
    sys.exit(main())
