#!/usr/bin/env python3
"""
角色一致性 QA 工具 - 「未婚妻」剧游专用
========================================
对每个视频抽取首帧 + 中间帧，与角色参考图做感知哈希 + 直方图对比，
输出 QA 报告到 scripts/qa_report.json 和终端摘要。

用法:
  python scripts/qa_consistency.py                    # 检查所有视频
  python scripts/qa_consistency.py --shot e3s1 e3s2   # 只检查指定 shot
  python scripts/qa_consistency.py --ep 3             # 只检查第 3 集
  python scripts/qa_consistency.py --threshold 0.55   # 自定义相似度门槛（0~1，默认 0.5）

输出:
  scripts/qa_report.json   - 详细机器可读报告
  终端 - 通过/失败摘要，FAIL 的 shot 会高亮

依赖（无需 GPU）:
  pip install opencv-python-headless imagehash pillow tqdm
"""

import argparse
import json
import os
import re
import sys
from pathlib import Path

# ---- 依赖检测 ----
try:
    import cv2
    import imagehash
    from PIL import Image
    import numpy as np
except ImportError as e:
    print(f"[ERROR] 缺少依赖: {e}")
    print("  请先安装: pip install opencv-python-headless imagehash pillow")
    sys.exit(1)

try:
    from tqdm import tqdm
    HAS_TQDM = True
except ImportError:
    HAS_TQDM = False

# ---- 路径配置 ----
ROOT = Path(__file__).parent.parent
VIDEOS_DIR = ROOT / "scripts/subtitles/videos"
AVATARS_DIR = ROOT / "avatars"
QA_REPORT = ROOT / "scripts/qa_report.json"

# 角色参考图映射（可扩充）
CHARACTER_REFS = {
    "wanr":   AVATARS_DIR / "wanr-avatar-v2.png",      # 婉儿（女主）
    "aotian": AVATARS_DIR / "aotian-avatar-v2.png",    # 傲天（男主）
    "wangpo": AVATARS_DIR / "wangpo.png",               # 王婆
    "laohan": AVATARS_DIR / "laohan.png",               # 老汉
    "zhao":   AVATARS_DIR / "zhao.png",                 # 赵员外
}

# 出现频率最高的主角用于比对
PRIMARY_CHARS = ["wanr", "aotian"]

# ---- 工具函数 ----

def extract_frames(video_path: Path, n_frames: int = 3) -> list:
    """从视频中均匀抽取 n 帧，返回 BGR numpy 数组列表"""
    cap = cv2.VideoCapture(str(video_path))
    if not cap.isOpened():
        return []

    total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    if total <= 0:
        cap.release()
        return []

    # 抽取位置：25%、50%、75% 处，避免首尾黑帧
    positions = [max(1, int(total * p)) for p in [0.25, 0.5, 0.75]][:n_frames]
    frames = []
    for pos in positions:
        cap.set(cv2.CAP_PROP_POS_FRAMES, pos)
        ret, frame = cap.read()
        if ret:
            frames.append(frame)
    cap.release()
    return frames


def load_ref_image(path: Path) -> np.ndarray | None:
    """加载参考图，缩放到统一大小"""
    if not path.exists():
        return None
    img = cv2.imread(str(path))
    if img is None:
        return None
    return cv2.resize(img, (256, 256))


def phash_similarity(img1: np.ndarray, img2: np.ndarray) -> float:
    """感知哈希相似度（0~1，越高越像）"""
    pil1 = Image.fromarray(cv2.cvtColor(img1, cv2.COLOR_BGR2RGB))
    pil2 = Image.fromarray(cv2.cvtColor(img2, cv2.COLOR_BGR2RGB))
    h1 = imagehash.phash(pil1)
    h2 = imagehash.phash(pil2)
    max_bits = len(h1.hash.flatten())
    distance = h1 - h2
    return 1.0 - distance / max_bits


def hist_similarity(img1: np.ndarray, img2: np.ndarray) -> float:
    """HSV 直方图相似度（颜色分布）"""
    hsv1 = cv2.cvtColor(img1, cv2.COLOR_BGR2HSV)
    hsv2 = cv2.cvtColor(img2, cv2.COLOR_BGR2HSV)
    h1 = cv2.calcHist([hsv1], [0, 1], None, [50, 60], [0, 180, 0, 256])
    h2 = cv2.calcHist([hsv2], [0, 1], None, [50, 60], [0, 180, 0, 256])
    cv2.normalize(h1, h1, 0, 1, cv2.NORM_MINMAX)
    cv2.normalize(h2, h2, 0, 1, cv2.NORM_MINMAX)
    return cv2.compareHist(h1, h2, cv2.HISTCMP_CORREL)


def score_frame(frame: np.ndarray, ref: np.ndarray) -> float:
    """综合相似度 = 0.6*phash + 0.4*hist_corr（都映射到 0~1）"""
    frame_resized = cv2.resize(frame, (256, 256))
    phash = phash_similarity(frame_resized, ref)
    hist = hist_similarity(frame_resized, ref)
    hist_norm = (hist + 1) / 2  # corr 范围 -1~1，映射到 0~1
    return 0.6 * phash + 0.4 * hist_norm


def qa_video(video_path: Path, threshold: float) -> dict:
    """对单个视频执行 QA，返回结果字典"""
    shot_name = video_path.stem

    frames = extract_frames(video_path, n_frames=3)
    if not frames:
        return {
            "shot": shot_name,
            "status": "ERROR",
            "reason": "无法读取视频帧",
            "scores": {},
        }

    scores = {}
    for char_name in PRIMARY_CHARS:
        ref = load_ref_image(CHARACTER_REFS[char_name])
        if ref is None:
            continue
        frame_scores = [score_frame(f, ref) for f in frames]
        scores[char_name] = round(max(frame_scores), 3)  # 取最高帧的分

    # 判断：任意主角相似度超过 threshold 则认为角色出现且一致
    max_score = max(scores.values()) if scores else 0
    status = "PASS" if max_score >= threshold else "WARN"

    return {
        "shot": shot_name,
        "status": status,
        "max_score": round(max_score, 3),
        "threshold": threshold,
        "scores": scores,
    }


def parse_ep_from_name(name: str) -> int | None:
    """从文件名解析集数，e3s1 → 3"""
    m = re.match(r"e(\d+)s", name)
    return int(m.group(1)) if m else None


# ---- 主流程 ----

def main():
    parser = argparse.ArgumentParser(description="角色一致性 QA 工具")
    parser.add_argument("--shot", nargs="+", help="指定 shot 名，如 e3s1 e3s2")
    parser.add_argument("--ep", type=int, help="只检查指定集数（如 --ep 3）")
    parser.add_argument("--threshold", type=float, default=0.50,
                        help="相似度门槛 0~1，低于此值标记为 WARN（默认 0.50）")
    parser.add_argument("--output", default=str(QA_REPORT),
                        help="报告输出路径（默认 scripts/qa_report.json）")
    args = parser.parse_args()

    # 收集待检视频
    all_videos = sorted(VIDEOS_DIR.glob("*.mp4"))
    if args.shot:
        names = set(args.shot)
        videos = [v for v in all_videos if v.stem in names]
        not_found = names - {v.stem for v in videos}
        if not_found:
            print(f"[WARN] 未找到以下 shot: {not_found}")
    elif args.ep:
        prefix = f"e{args.ep}s"
        videos = [v for v in all_videos if v.stem.startswith(prefix)]
    else:
        videos = all_videos

    if not videos:
        print("[ERROR] 没有找到匹配的视频文件")
        sys.exit(1)

    print(f"\n🎬 开始角色一致性 QA — 共 {len(videos)} 个 shot，门槛={args.threshold}")
    print(f"   参考图: {', '.join(CHARACTER_REFS.keys())}")
    print("-" * 60)

    results = []
    iterator = tqdm(videos, desc="QA") if HAS_TQDM else videos
    for video_path in iterator:
        result = qa_video(video_path, args.threshold)
        results.append(result)
        if not HAS_TQDM:
            icon = "✅" if result["status"] == "PASS" else ("❌" if result["status"] == "ERROR" else "⚠️ ")
            scores_str = "  ".join(f"{k}={v}" for k, v in result["scores"].items())
            print(f"  {icon} {result['shot']:20s} max={result.get('max_score', 0):.3f}  [{scores_str}]")

    # 输出报告
    report = {
        "total": len(results),
        "pass": sum(1 for r in results if r["status"] == "PASS"),
        "warn": sum(1 for r in results if r["status"] == "WARN"),
        "error": sum(1 for r in results if r["status"] == "ERROR"),
        "threshold": args.threshold,
        "results": results,
    }
    out_path = Path(args.output)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(report, ensure_ascii=False, indent=2))

    # 终端摘要
    print("\n" + "=" * 60)
    print(f"📊 QA 总结:")
    print(f"   PASS  ✅  {report['pass']}")
    print(f"   WARN  ⚠️   {report['warn']}  ← 角色相似度低，建议人工确认")
    print(f"   ERROR ❌  {report['error']}")
    print(f"\n   报告已写入: {out_path}")

    warns = [r for r in results if r["status"] == "WARN"]
    if warns:
        print("\n⚠️  需要人工确认的 shot（按相似度升序）:")
        for r in sorted(warns, key=lambda x: x.get("max_score", 0)):
            scores_str = "  ".join(f"{k}={v}" for k, v in r["scores"].items())
            print(f"   {r['shot']:20s}  max={r.get('max_score', 0):.3f}  [{scores_str}]")

    errors = [r for r in results if r["status"] == "ERROR"]
    if errors:
        print("\n❌  读取失败的 shot:")
        for r in errors:
            print(f"   {r['shot']:20s}  {r.get('reason', '')}")

    print()
    return 0 if report["error"] == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
