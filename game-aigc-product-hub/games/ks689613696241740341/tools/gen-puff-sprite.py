#!/usr/bin/env python3
# 白底星芒 GIF → 透明 PNG 序列帧雪碧图
#
# 【为什么必须抠】源 GIF 无 alpha 通道（实测 79524 px 全 alpha=255），
# 白色是实心白底。直接 drawImage 到游戏里就是一块白方块。
#
# 【抠图算法：luminance key + unpremultiply】
#   源图是「黄星芒 over 白底」的合成结果：C_obs = C_fg*a + 255*(1-a)
#   白底 min(R,G,B)=255，黄星 min=B≈60 → 用 a = 1 - min/255 反推不透明度
#   再解上面的方程还原前景真色 C_fg = (C_obs - 255*(1-a)) / a
#   → 抗锯齿边缘不会残留白边，星芒是纯饱和黄
import subprocess, struct, zlib, os, sys

SRC = '/Users/fat/Desktop/cfca7edd371e503c36b71349f8842215.gif'
N, SW = 8, 282          # 源：8 帧 282×282
CW = 120                # 目标单帧边长
OUT = '/tmp/pdgif/puff_keyed.png'

def raw(path, w, h):
    p = subprocess.run(['ffmpeg', '-v', 'error', '-i', path,
                        '-f', 'rawvideo', '-pix_fmt', 'rgba', '-'],
                       capture_output=True, check=True)
    return bytearray(p.stdout)

# 先抽帧并缩放（lanczos 缩放在【抠图前】做会把白底混进边缘，
# 所以顺序必须是：原尺寸抠图 → 再缩放。这里让 ffmpeg 只做抽帧不缩放。）
os.makedirs('/tmp/pdgif/kf', exist_ok=True)
subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', SRC, '-vsync', '0',
                '/tmp/pdgif/kf/k%02d.png'], check=True)

def key_frame(buf, w, h):
    """白底 → 透明 + unpremultiply 还原前景色"""
    for i in range(0, len(buf), 4):
        r, g, b = buf[i], buf[i + 1], buf[i + 2]
        m = r if r < g else g
        if b < m: m = b
        a = 255 - m                       # 白底(min=255)→0；黄星(min≈60)→195
        if a <= 2:                        # 纯白 / 极淡噪点 → 全透明
            buf[i] = buf[i + 1] = buf[i + 2] = buf[i + 3] = 0
            continue
        # 提纯：把 alpha 往上推一档，让星芒实心而不是半透
        a2 = a * 100 // 72
        if a2 > 255: a2 = 255
        af = a2 / 255.0
        for k in range(3):
            c = (buf[i + k] - 255 * (1 - af)) / af    # unpremultiply over white
            buf[i + k] = 0 if c < 0 else (255 if c > 255 else int(c))
        buf[i + 3] = a2
    return buf

def box_scale(buf, w, h, tw):
    """alpha 加权 box 降采样。必须【按 alpha 加权】平均 RGB ——
    否则透明像素的 RGB(0,0,0) 会把星芒边缘拉黑，出现黑边。"""
    f = w // tw
    out = bytearray(tw * tw * 4)
    for y in range(tw):
        for x in range(tw):
            sr = sg = sb = sa = 0
            for dy in range(f):
                row = (y * f + dy) * w
                for dx in range(f):
                    j = (row + x * f + dx) * 4
                    a = buf[j + 3]
                    sr += buf[j] * a; sg += buf[j + 1] * a; sb += buf[j + 2] * a
                    sa += a
            o = (y * tw + x) * 4
            if sa:
                out[o] = sr // sa; out[o + 1] = sg // sa; out[o + 2] = sb // sa
            out[o + 3] = sa // (f * f)
    return out

# 逐帧抠图 + 缩放，横排拼成雪碧图
sheet = bytearray(CW * N * CW * 4)
for n in range(N):
    fp = '/tmp/pdgif/kf/k%02d.png' % (n + 1)
    b = key_frame(raw(fp, SW, SW), SW, SW)
    # 282 不能被 120 整除 → 先补到 240（2×120）再 box 降采样
    # 做法：中心裁 240×240（星芒都在中心区，四周是空白）
    off = (SW - 240) // 2
    crop = bytearray(240 * 240 * 4)
    for y in range(240):
        s = ((y + off) * SW + off) * 4
        crop[y * 240 * 4:(y + 1) * 240 * 4] = b[s:s + 240 * 4]
    small = box_scale(crop, 240, 240, CW)
    for y in range(CW):
        d = (y * (CW * N) + n * CW) * 4
        sheet[d:d + CW * 4] = small[y * CW * 4:(y + 1) * CW * 4]

# 写 PNG（RGBA8，无滤波）
W, H = CW * N, CW
rows = b''.join(b'\x00' + bytes(sheet[y * W * 4:(y + 1) * W * 4]) for y in range(H))
def chunk(t, d):
    c = t + d
    return struct.pack('>I', len(d)) + c + struct.pack('>I', zlib.crc32(c) & 0xffffffff)
png = (b'\x89PNG\r\n\x1a\n'
       + chunk(b'IHDR', struct.pack('>IIBBBBB', W, H, 8, 6, 0, 0, 0))
       + chunk(b'IDAT', zlib.compress(rows, 9))
       + chunk(b'IEND', b''))
open(OUT, 'wb').write(png)

# 自检：四角必须全透明，且必须存在不透明像素
def a_at(x, y): return sheet[(y * W + x) * 4 + 3]
opaque = sum(1 for i in range(3, len(sheet), 4) if sheet[i] > 200)
print('size', W, 'x', H, os.path.getsize(OUT), 'bytes')
print('corner alpha', a_at(0, 0), a_at(W - 1, 0), a_at(0, H - 1), a_at(W - 1, H - 1))
print('opaque px (a>200)', opaque)
assert a_at(0, 0) == 0, '左上角未透明 → 抠图失败'
assert opaque > 200, '几乎没有实心像素 → 抠图过头了'
print('OK')
