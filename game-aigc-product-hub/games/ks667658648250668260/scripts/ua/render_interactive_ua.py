#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
买量素材 · 视频内嵌「真实互动按钮」渲染器
=========================================
思路：PIL 逐帧生成 RGBA overlay（透明底）→ ffmpeg overlay 滤镜压到视频上 → h264 输出。
overlay 里包含一整套「让人以为能点」的视觉语言：
  1. 选项卡片带阴影 + 空心金描边（对齐项目 UI 铁律 10）
  2. 卡片逐个弹入（overshoot 缓动），不是齐刷刷出现
  3. 拟真手指光标滑入 → 悬停 → 按下（卡片 scale 0.96 + 高亮）
  4. 点击 ripple 水波扩散
  5. 数值飞行粒子（从卡片飞向右上胶囊）+ 胶囊脉冲（对齐铁律 10 的数值飞行动画）
  6. 顶部钩子字幕（大字压屏 + 描边）
  7. 尾帧 CTA 按钮呼吸脉冲

用法：
  python3 render_interactive_ua.py --config configs/D_choice.json
"""

import argparse
import json
import math
import os
import shutil
import subprocess
import sys

from PIL import Image, ImageDraw, ImageFont

# ---------------------------------------------------------------- 字体
FONT_CANDIDATES = [
    "/System/Library/Fonts/Hiragino Sans GB.ttc",
    "/System/Library/Fonts/STHeiti Medium.ttc",
    "/System/Library/Fonts/Supplemental/Songti.ttc",
]


def load_font(size, bold=True):
    for p in FONT_CANDIDATES:
        if os.path.exists(p):
            try:
                # Hiragino Sans GB 的 index 1 是 W6(粗)，0 是 W3(细)
                idx = 1 if (bold and "Hiragino" in p) else 0
                return ImageFont.truetype(p, size, index=idx)
            except Exception:
                try:
                    return ImageFont.truetype(p, size)
                except Exception:
                    continue
    return ImageFont.load_default()


# ---------------------------------------------------------------- 缓动
def clamp(v, lo=0.0, hi=1.0):
    return max(lo, min(hi, v))


def ease_out_cubic(t):
    t = clamp(t)
    return 1 - (1 - t) ** 3


def ease_out_back(t, s=1.70158):
    """overshoot 弹入，卡片出现的关键手感"""
    t = clamp(t)
    t -= 1
    return t * t * ((s + 1) * t + s) + 1


def ease_in_out(t):
    t = clamp(t)
    return 0.5 - 0.5 * math.cos(math.pi * t)


# ---------------------------------------------------------------- 绘制基元
def rounded_rect(draw, box, r, fill=None, outline=None, width=2):
    draw.rounded_rectangle(box, radius=r, fill=fill, outline=outline, width=width)


def text_center(draw, cx, cy, txt, font, fill, stroke=0, stroke_fill=(0, 0, 0, 220)):
    l, t, r, b = draw.textbbox((0, 0), txt, font=font, stroke_width=stroke)
    draw.text(
        (cx - (r - l) / 2 - l, cy - (b - t) / 2 - t),
        txt, font=font, fill=fill,
        stroke_width=stroke, stroke_fill=stroke_fill,
    )


def text_w(draw, txt, font, stroke=0):
    l, t, r, b = draw.textbbox((0, 0), txt, font=font, stroke_width=stroke)
    return r - l


def soft_shadow_card(base, box, r, blur_pad=18, alpha=150):
    """给卡片画一层柔和投影，让按钮有'浮在视频上'的物理感"""
    from PIL import ImageFilter
    x0, y0, x1, y1 = box
    pad = blur_pad * 2
    lay = Image.new("RGBA", (int(x1 - x0 + pad * 2), int(y1 - y0 + pad * 2)), (0, 0, 0, 0))
    d = ImageDraw.Draw(lay)
    d.rounded_rectangle([pad, pad + 6, lay.width - pad, lay.height - pad + 6],
                        radius=r, fill=(0, 0, 0, alpha))
    lay = lay.filter(ImageFilter.GaussianBlur(blur_pad * 0.7))
    base.alpha_composite(lay, (int(x0 - pad), int(y0 - pad)))


def draw_finger(img, x, y, scale=1.0, pressed=False):
    """拟真手指光标：白色圆环 + 内实心点 + 按下时收缩加光晕"""
    d = ImageDraw.Draw(img)
    R = int(30 * scale)
    if pressed:
        R = int(R * 0.82)
        for i in range(4):
            rr = R + 10 + i * 9
            a = int(70 - i * 16)
            d.ellipse([x - rr, y - rr, x + rr, y + rr], outline=(255, 236, 190, a), width=3)
    d.ellipse([x - R, y - R, x + R, y + R], fill=(255, 255, 255, 60),
              outline=(255, 255, 255, 235), width=4)
    r2 = int(R * 0.42)
    d.ellipse([x - r2, y - r2, x + r2, y + r2], fill=(255, 255, 255, 245))


def draw_ripple(img, x, y, t):
    """点击水波：t 为 0~1 生命周期"""
    if t <= 0 or t >= 1:
        return
    d = ImageDraw.Draw(img)
    for k, delay in enumerate((0.0, 0.16, 0.32)):
        tt = (t - delay) / (1 - delay) if t > delay else -1
        if tt <= 0 or tt >= 1:
            continue
        rr = int(24 + ease_out_cubic(tt) * 190)
        a = int(200 * (1 - tt) ** 1.6)
        if a <= 2:
            continue
        d.ellipse([x - rr, y - rr, x + rr, y + rr],
                  outline=(255, 226, 160, a), width=max(2, 7 - k * 2))


# ---------------------------------------------------------------- 组件
def draw_hook_title(img, W, cfg, t_local, fade=1.0):
    """顶部钩子大字：从上滑入 → 常驻 → CTA 阶段淡出"""
    if not cfg.get("hook") or fade <= 0.01:
        return
    prog = ease_out_cubic(t_local / 0.5) if t_local < 0.5 else 1.0
    if prog <= 0:
        return
    d = ImageDraw.Draw(img)
    txt = cfg["hook"]
    # 自适应字号：保证压条不超过屏宽 88%，避免被裁
    fs = int(W * 0.088)
    while fs > int(W * 0.052):
        f = load_font(fs)
        if text_w(d, txt, f, stroke=6) + 68 <= W * 0.88:
            break
        fs -= 4
    f = load_font(fs)
    y = int(W * 0.155) + int((1 - prog) * -70)
    a = int(255 * prog * fade)
    tw = text_w(d, txt, f, stroke=6)
    bh = int(fs * 1.62)
    rounded_rect(d, [W / 2 - tw / 2 - 34, y - bh / 2, W / 2 + tw / 2 + 34, y + bh / 2],
                 18, fill=(10, 6, 3, int(150 * prog * fade)))
    text_center(d, W / 2, y, txt, f, (255, 238, 194, a), stroke=6)


def draw_stat_capsules(img, W, stats, pulse):
    """右上三数值胶囊（对齐铁律 10 尺寸/配色），pulse: {idx: 0~1}"""
    d = ImageDraw.Draw(img)
    f = load_font(int(W * 0.036))
    pw, ph = int(W * 0.335), int(W * 0.077)
    sx = W - pw - int(W * 0.035)
    sy = int(W * 0.40)
    for i, (label, val, color) in enumerate(stats):
        p = pulse.get(i, 0.0)
        s = 1.0 + 0.25 * math.sin(math.pi * p) if p > 0 else 1.0
        cw, ch = pw * s, ph * s
        cx, cy = sx + pw / 2, sy + i * (ph + int(W * 0.026)) + ph / 2
        box = [cx - cw / 2, cy - ch / 2, cx + cw / 2, cy + ch / 2]
        oc = color if p > 0 else (230, 190, 110, 205)
        rounded_rect(d, box, int(ch / 2), fill=(16, 9, 4, 205), outline=oc,
                     width=3 if p > 0 else 2)
        dr = int(ch * 0.16)
        d.ellipse([box[0] + ch * 0.30 - dr, cy - dr, box[0] + ch * 0.30 + dr, cy + dr], fill=color)
        d.text((box[0] + ch * 0.62, cy - ch * 0.30), label, font=f, fill=(255, 245, 220, 240))
        vs = str(val)
        d.text((box[2] - ch * 0.34 - text_w(d, vs, f), cy - ch * 0.30), vs,
               font=f, fill=color)
    return sx + pw / 2, sy


def draw_option_cards(img, W, H, options, t, sc):
    """
    选项卡片组。返回每张卡片中心点（供手指定位）。
    sc: 场景参数 dict —— card_in_at / card_stagger / hover_idx / press_prog
    """
    d = ImageDraw.Draw(img)
    f = load_font(int(W * 0.049))
    n = len(options)
    cw = int(W * 0.855)
    chh = int(W * 0.132)
    gap = int(W * 0.036)
    bottom = H - int(W * 0.30)
    total = n * chh + (n - 1) * gap
    top = bottom - total
    centers = []
    for i, label in enumerate(options):
        appear = sc["card_in_at"] + i * sc["card_stagger"]
        p = ease_out_back((t - appear) / 0.42) if t >= appear else 0.0
        if p <= 0.001:
            centers.append(None)
            continue
        p = clamp(p, 0, 1.06)
        cy = top + i * (chh + gap) + chh / 2
        cy += (1 - clamp(p)) * 46          # 从下方托上来
        is_hot = (sc.get("hover_idx") == i)
        press = sc.get("press_prog", 0.0) if is_hot else 0.0
        s = (1.0 - 0.045 * math.sin(math.pi * press)) * min(p, 1.04)
        w, h = cw * s, chh * s
        box = [W / 2 - w / 2, cy - h / 2, W / 2 + w / 2, cy + h / 2]
        centers.append((W / 2, cy))
        soft_shadow_card(img, box, int(h * 0.30), alpha=int(140 * clamp(p)))
        d = ImageDraw.Draw(img)
        # 悬停/按下时底色提亮 + 金描边加粗（"可点"的核心信号）
        base_a = int((150 if not is_hot else 210) * clamp(p))
        fill = (28, 15, 6, base_a) if not is_hot else (86, 52, 14, base_a)
        # 悬停卡片外圈加一层金色光晕，强化"这个是被选中的"
        if is_hot:
            gl = int(120 + 70 * math.sin(math.pi * clamp(press)))
            for k in range(3):
                gb = [box[0] - 4 - k * 6, box[1] - 4 - k * 6, box[2] + 4 + k * 6, box[3] + 4 + k * 6]
                rounded_rect(d, gb, int(h * 0.32), outline=(255, 214, 130, max(0, gl - k * 38)), width=3)
        rounded_rect(d, box, int(h * 0.30), fill=fill,
                     outline=(255, 214, 140, int(245 * clamp(p))) if is_hot
                     else (230, 190, 110, int(175 * clamp(p))),
                     width=5 if is_hot else 3)
        inner = [box[0] + 5, box[1] + 5, box[2] - 5, box[3] - 5]
        rounded_rect(d, inner, int(h * 0.26), outline=(255, 226, 150, int(80 * clamp(p))), width=2)
        col = (255, 246, 214, int(255 * clamp(p))) if is_hot else (255, 238, 194, int(240 * clamp(p)))
        text_center(d, W / 2, cy, label, f, col, stroke=3)
    return centers


def draw_toast(img, W, H, txt, t_local, color):
    """数值变化 toast（对齐铁律 10：淡入→上浮→淡出）"""
    if t_local < 0 or t_local > 1.35:
        return
    p = t_local / 1.35
    a = int(255 * (ease_out_cubic(p / 0.22) if p < 0.22 else clamp((1 - p) / 0.34)))
    if a <= 3:
        return
    d = ImageDraw.Draw(img)
    f = load_font(int(W * 0.062))
    y = H * 0.415 - ease_out_cubic(p) * 52
    tw = text_w(d, txt, f, stroke=5)
    bh = int(W * 0.115)
    rounded_rect(d, [W / 2 - tw / 2 - 32, y - bh / 2, W / 2 + tw / 2 + 32, y + bh / 2],
                 int(bh / 2), fill=(14, 8, 3, int(a * 0.80)), outline=color, width=3)
    text_center(d, W / 2, y, txt, f, color, stroke=4)


def draw_fly_particle(img, W, src, dst, txt, t, color):
    """数值飞行粒子：贝塞尔弧线 + easeOutCubic"""
    if t <= 0 or t >= 1:
        return
    p = ease_out_cubic(t)
    mx, my = (src[0] + dst[0]) / 2 - W * 0.16, min(src[1], dst[1]) - W * 0.14
    x = (1 - p) ** 2 * src[0] + 2 * (1 - p) * p * mx + p ** 2 * dst[0]
    y = (1 - p) ** 2 * src[1] + 2 * (1 - p) * p * my + p ** 2 * dst[1]
    d = ImageDraw.Draw(img)
    a = int(255 * clamp((1 - t) / 0.3 + 0.35, 0, 1))
    R = int(W * 0.052)
    for i in range(3):  # 拖尾
        rr = R + i * 7
        d.ellipse([x - rr, y - rr, x + rr, y + rr], fill=(color[0], color[1], color[2], int(a * 0.10)))
    d.ellipse([x - R, y - R, x + R, y + R], fill=(color[0], color[1], color[2], a),
              outline=(255, 255, 255, int(a * 0.85)), width=3)
    text_center(d, x, y, txt, load_font(int(W * 0.036)), (255, 255, 255, a), stroke=2)


def draw_cta(img, W, H, cfg, t_local):
    """尾帧 CTA：弹入 + 呼吸脉冲 + 副文案"""
    if t_local < 0:
        return
    p = ease_out_back(t_local / 0.45) if t_local < 0.45 else 1.0
    breathe = 1.0 + 0.035 * math.sin(t_local * 5.0)
    s = clamp(p, 0, 1.06) * breathe
    d = ImageDraw.Draw(img)
    f = load_font(int(W * 0.062))
    w, h = W * 0.72 * s, W * 0.152 * s
    cy = H - int(W * 0.40)
    box = [W / 2 - w / 2, cy - h / 2, W / 2 + w / 2, cy + h / 2]
    soft_shadow_card(img, box, int(h / 2), alpha=170)
    d = ImageDraw.Draw(img)
    glow = int(70 + 45 * math.sin(t_local * 5.0))
    for i in range(3):
        gb = [box[0] - 6 - i * 7, box[1] - 6 - i * 7, box[2] + 6 + i * 7, box[3] + 6 + i * 7]
        rounded_rect(d, gb, int(h / 2), outline=(255, 214, 130, max(0, glow - i * 22)), width=3)
    rounded_rect(d, box, int(h / 2), fill=(214, 168, 74, 246))
    text_center(d, W / 2, cy, cfg["cta"], f, (36, 20, 6, 255))
    if cfg.get("cta_sub"):
        fs = load_font(int(W * 0.042), bold=False)
        text_center(d, W / 2, cy + h * 0.86, cfg["cta_sub"], fs, (255, 240, 205, 235), stroke=4)


# ---------------------------------------------------------------- 时间线
def build_timeline(cfg, dur):
    """把配置翻译成一条可查询的时间线"""
    tl = cfg.get("timeline", {})
    return {
        "hook_at": tl.get("hook_at", 0.25),
        "card_in_at": tl.get("card_in_at", 2.6),
        "card_stagger": tl.get("card_stagger", 0.16),
        "finger_in_at": tl.get("finger_in_at", 4.3),
        "press_at": tl.get("press_at", 5.5),
        "release_at": tl.get("release_at", 5.78),
        "fly_at": tl.get("fly_at", 5.85),
        "cta_at": tl.get("cta_at", dur - 3.1),
        "target_idx": tl.get("target_idx", 1),
    }


def render_frame(t, W, H, cfg, T, fonts_warm=None):
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))

    # 顶部钩子（CTA 阶段淡出让位）
    if t >= T["hook_at"]:
        fade = clamp(1 - (t - T["cta_at"]) / 0.45) if t >= T["cta_at"] else 1.0
        draw_hook_title(img, W, cfg, t - T["hook_at"], fade=fade)

    # 手指状态
    hover_idx = None
    press_prog = 0.0
    if t >= T["finger_in_at"] - 0.05:
        hover_idx = T["target_idx"]
    if T["press_at"] <= t < T["release_at"]:
        press_prog = clamp((t - T["press_at"]) / max(0.001, T["release_at"] - T["press_at"]))
    elif t >= T["release_at"]:
        press_prog = clamp(1 - (t - T["release_at"]) / 0.18)

    sc = {
        "card_in_at": T["card_in_at"],
        "card_stagger": T["card_stagger"],
        "hover_idx": hover_idx,
        "press_prog": press_prog,
    }

    # CTA 阶段隐去选项卡，避免画面打架
    centers = []
    if t < T["cta_at"] - 0.15:
        centers = draw_option_cards(img, W, H, cfg["options"], t, sc)

    # 数值胶囊（含命中脉冲 + 命中后数值真的变）
    pulse = {}
    hit_i = cfg.get("hit_stat_idx", 0)
    fly_end = T["fly_at"] + 0.85
    stats = []
    for i, s in enumerate(cfg["stats"]):
        val = s[1]
        # 关键：粒子命中那一刻，数值真的跳到新值（不变就露馅）
        if i == hit_i and t >= fly_end:
            val = val + int(cfg.get("hit_delta_num", 12))
        stats.append((s[0], val, tuple(s[2])))
    if fly_end <= t < fly_end + 0.5:
        pulse[hit_i] = clamp((t - fly_end) / 0.5)
    cap_x, cap_y = draw_stat_capsules(img, W, stats, pulse)

    # ripple
    if t >= T["press_at"]:
        rt = (t - T["press_at"]) / 0.72
        tgt = centers[T["target_idx"]] if (centers and T["target_idx"] < len(centers)
                                           and centers[T["target_idx"]]) else (W / 2, H * 0.66)
        draw_ripple(img, tgt[0] + W * 0.235, tgt[1] + W * 0.038, rt)

    # 数值飞行 + toast
    if t >= T["fly_at"]:
        ph = int(W * 0.077)
        dst = (cap_x, cap_y + hit_i * (ph + int(W * 0.026)) + ph / 2)
        src = (W / 2, H * 0.66)
        if centers and T["target_idx"] < len(centers) and centers[T["target_idx"]]:
            src = centers[T["target_idx"]]
        color = tuple(cfg["stats"][hit_i][2])
        draw_fly_particle(img, W, src, dst, cfg.get("hit_delta", "+12"),
                          (t - T["fly_at"]) / 0.85, color)
        draw_toast(img, W, H, cfg.get("toast", "嫂子好感 +12"), t - T["fly_at"], color)

    # 手指（画在最上层）
    if t >= T["finger_in_at"]:
        tgt = centers[T["target_idx"]] if (centers and T["target_idx"] < len(centers)
                                           and centers[T["target_idx"]]) else (W / 2, H * 0.66)
        p = ease_in_out(clamp((t - T["finger_in_at"]) / 0.75))
        # 落点偏卡片右下，避免遮住按钮文字
        ax, ay = tgt[0] + W * 0.235, tgt[1] + W * 0.038
        fx = W * 0.94 * (1 - p) + ax * p
        fy = H * 0.94 * (1 - p) + ay * p
        if t < T["cta_at"] - 0.4:
            draw_finger(img, fx, fy, 1.0, pressed=press_prog > 0.25)

    # CTA
    if t >= T["cta_at"]:
        draw_cta(img, W, H, cfg, t - T["cta_at"])

    return img


# ---------------------------------------------------------------- 主流程
def probe(path):
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-select_streams", "v:0",
         "-show_entries", "stream=width,height,r_frame_rate",
         "-show_entries", "format=duration", "-of", "json", path],
        capture_output=True, text=True, check=True).stdout
    j = json.loads(out)
    st = j["streams"][0]
    num, den = st["r_frame_rate"].split("/")
    return int(st["width"]), int(st["height"]), float(num) / float(den), float(j["format"]["duration"])


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--config", required=True)
    ap.add_argument("--fps", type=int, default=0, help="overlay 渲染帧率，默认取源视频")
    ap.add_argument("--out", default="")
    ap.add_argument("--keep-frames", action="store_true")
    args = ap.parse_args()

    cfg = json.load(open(args.config, encoding="utf-8"))
    src = cfg["source"]
    if not os.path.exists(src):
        sys.exit(f"[ERR] 源视频不存在: {src}")

    sw, sh, sfps, sdur = probe(src)
    # 统一到 1080x1920 竖屏投放规格
    W, H = cfg.get("width", 1080), cfg.get("height", 1920)
    fps = args.fps or int(round(sfps))
    dur = min(cfg.get("duration", sdur), sdur)
    T = build_timeline(cfg, dur)

    name = cfg.get("name", os.path.splitext(os.path.basename(args.config))[0])
    fdir = os.path.join("/tmp/ua_frames", name)
    shutil.rmtree(fdir, ignore_errors=True)
    os.makedirs(fdir, exist_ok=True)

    total = int(dur * fps)
    print(f"[render] {name}  src={sw}x{sh}@{sfps:.0f}  out={W}x{H}@{fps}  {dur:.2f}s  frames={total}")
    for i in range(total):
        t = i / fps
        render_frame(t, W, H, cfg, T).save(os.path.join(fdir, f"f_{i:05d}.png"))
        if i % 40 == 0:
            print(f"  .. {i}/{total}", flush=True)

    outdir = cfg.get("outdir", "/Users/fat/weihunqi/build-ua")
    os.makedirs(outdir, exist_ok=True)
    out = args.out or os.path.join(outdir, f"{name}.mp4")

    # 源视频先按 1080x1920 做 cover 裁切，再叠 overlay
    vf = (f"[0:v]scale={W}:{H}:force_original_aspect_ratio=increase,"
          f"crop={W}:{H},fps={fps},format=yuv420p[bg];"
          f"[bg][1:v]overlay=0:0:format=auto,format=yuv420p[v]")
    cmd = [
        "ffmpeg", "-y", "-hide_banner", "-loglevel", "error",
        "-t", f"{dur}", "-i", src,
        "-framerate", str(fps), "-i", os.path.join(fdir, "f_%05d.png"),
        "-filter_complex", vf, "-map", "[v]",
    ]
    # 有音轨就带上（买量素材前 3 秒声音也是钩子）
    has_audio = subprocess.run(
        ["ffprobe", "-v", "error", "-select_streams", "a", "-show_entries",
         "stream=codec_type", "-of", "csv=p=0", src],
        capture_output=True, text=True).stdout.strip()
    if has_audio:
        cmd += ["-map", "0:a:0", "-c:a", "aac", "-b:a", "128k", "-shortest"]
    cmd += [
        "-c:v", "libx264", "-crf", "21", "-preset", "medium",
        "-profile:v", "high", "-level", "4.0", "-pix_fmt", "yuv420p",
        "-movflags", "+faststart", out,
    ]
    subprocess.run(cmd, check=True)

    if not args.keep_frames:
        shutil.rmtree(fdir, ignore_errors=True)
    sz = os.path.getsize(out) / 1024 / 1024
    print(f"[done] {out}  {sz:.2f} MB")
    return out


if __name__ == "__main__":
    main()
