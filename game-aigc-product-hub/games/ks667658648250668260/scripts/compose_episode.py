#!/usr/bin/env python3
"""
多镜头合成工具 - 「未婚妻」剧游专用
=====================================
把一集（或任意 shot 列表）的多个 mp4 拼接成完整过场视频，
可选混入 BGM + 烧字幕（从 ASR json 读取）。

用法:
  # 合成第 3 集（e3s1~e3s7），输出 scripts/compose_output/ep03.mp4
  python scripts/compose_episode.py --ep 3

  # 合成指定 shot 列表
  python scripts/compose_episode.py --shots e3s1 e3s2 e3s3_v2 --out /tmp/ep3_test.mp4

  # 合成 + 加 BGM（循环淡入淡出）
  python scripts/compose_episode.py --ep 3 --bgm assets/audio/bgm.mp3

  # 合成 + 烧字幕（从 ASR json 读取）
  python scripts/compose_episode.py --ep 3 --subtitles

  # 全功能
  python scripts/compose_episode.py --ep 3 --bgm assets/audio/bgm.mp3 --subtitles

依赖（本机 ffmpeg 即可，无需 GPU）:
  brew install ffmpeg
  pip install tqdm
"""

import argparse
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

# ---- 路径配置 ----
ROOT = Path(__file__).parent.parent
VIDEOS_DIR = ROOT / "scripts/subtitles/videos"
SUBTITLES_DIR = ROOT / "scripts/subtitles/output"
OUTPUT_DIR = ROOT / "scripts/compose_output"


# ---- 工具函数 ----

def check_ffmpeg():
    if shutil.which("ffmpeg") is None:
        print("[ERROR] 未找到 ffmpeg，请先安装: brew install ffmpeg")
        sys.exit(1)


def get_video_duration(path: Path) -> float:
    """用 ffprobe 获取视频时长（秒）"""
    cmd = [
        "ffprobe", "-v", "error",
        "-show_entries", "format=duration",
        "-of", "default=noprint_wrappers=1:nokey=1",
        str(path)
    ]
    try:
        out = subprocess.check_output(cmd, stderr=subprocess.DEVNULL)
        return float(out.strip())
    except Exception:
        return 0.0


def collect_shots_for_ep(ep: int) -> list:
    """收集某集的所有 shot，按 s 编号排序，_v2 版本优先"""
    all_mp4 = list(VIDEOS_DIR.glob("*.mp4"))
    shots = {}
    for p in all_mp4:
        m = re.match(rf"e{ep}s(\d+)(_v\d+)?$", p.stem)
        if m:
            idx = int(m.group(1))
            ver = m.group(2) or ""
            if idx not in shots or ver:
                shots[idx] = p
    return [shots[k] for k in sorted(shots.keys())]


def load_subtitle_json(shot_name: str) -> list:
    """加载单个 shot 的 ASR 字幕 json，返回 sentences 列表"""
    base = re.sub(r"_v\d+$", "", shot_name)
    for name in [shot_name, base]:
        p = SUBTITLES_DIR / f"{name}.json"
        if p.exists():
            data = json.loads(p.read_text(encoding="utf-8"))
            return data.get("sentences", [])
    return []


def _fmt_srt_time(sec: float) -> str:
    """SRT 时间格式 HH:MM:SS,mmm"""
    h = int(sec // 3600)
    m = int((sec % 3600) // 60)
    s = int(sec % 60)
    ms = int((sec % 1) * 1000)
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"


def build_srt_subtitle(shots: list, time_offsets: list) -> str:
    """生成 SRT 格式字幕（不依赖 libass，mp4 mov_text 轨道通用）"""
    entries = []
    for shot_path, offset in zip(shots, time_offsets):
        sentences = load_subtitle_json(shot_path.stem)
        for sent in sentences:
            start = offset + sent.get("start", 0)
            end = offset + sent.get("end", start + 2)
            text = sent.get("text", "")
            entries.append((start, end, text))
    entries.sort(key=lambda x: x[0])
    lines = []
    for i, (start, end, text) in enumerate(entries, 1):
        lines.append(str(i))
        lines.append(f"{_fmt_srt_time(start)} --> {_fmt_srt_time(end)}")
        lines.append(text)
        lines.append("")
    return "\n".join(lines)


def compose(
    shots: list,
    output_path: Path,
    bgm_path=None,
    burn_subtitles: bool = False,
    bgm_volume: float = 0.25,
):
    """核心合成函数"""
    check_ffmpeg()
    output_path.parent.mkdir(parents=True, exist_ok=True)

    print(f"\n🎬 合成开始 — {len(shots)} 个 shot → {output_path.name}")
    for i, s in enumerate(shots):
        dur = get_video_duration(s)
        print(f"  [{i+1:2d}] {s.stem:25s}  {dur:.1f}s")

    with tempfile.TemporaryDirectory() as tmpdir:
        tmp = Path(tmpdir)

        # concat 列表
        concat_list = tmp / "concat.txt"
        with open(concat_list, "w") as f:
            for s in shots:
                f.write(f"file '{s.resolve()}'\n")

        # 计算时间偏移（用于字幕）
        time_offsets = []
        t = 0.0
        for s in shots:
            time_offsets.append(t)
            t += get_video_duration(s)
        total_dur = t
        print(f"\n  总时长: {total_dur:.1f}s  ({total_dur/60:.1f} min)")

        # Step 1: 无损拼接
        concat_mp4 = tmp / "concat_raw.mp4"
        print("  [1/3] 拼接视频...")
        subprocess.run(
            ["ffmpeg", "-y", "-f", "concat", "-safe", "0",
             "-i", str(concat_list), "-c", "copy", str(concat_mp4)],
            check=True, capture_output=True
        )

        # Step 2: 混 BGM
        if bgm_path and Path(bgm_path).exists():
            bgm_path = Path(bgm_path)
            mix_mp4 = tmp / "mix_bgm.mp4"
            bgm_fade_start = max(0, total_dur - 3)
            print(f"  [2/3] 混入 BGM ({bgm_path.name}, 音量={bgm_volume})...")
            subprocess.run([
                "ffmpeg", "-y",
                "-i", str(concat_mp4),
                "-stream_loop", "-1", "-i", str(bgm_path),
                "-filter_complex",
                (f"[1:a]volume={bgm_volume},afade=t=out:st={bgm_fade_start}:d=3[bgm];"
                 "[0:a][bgm]amix=inputs=2:duration=first:dropout_transition=3[aout]"),
                "-map", "0:v", "-map", "[aout]",
                "-c:v", "copy", "-c:a", "aac", "-b:a", "128k",
                "-t", str(total_dur), str(mix_mp4)
            ], check=True, capture_output=True)
            current_input = mix_mp4
        else:
            if bgm_path:
                print(f"  [2/3] BGM 文件不存在，跳过: {bgm_path}")
            current_input = concat_mp4

        # Step 3: 烧字幕（用 SRT 软字幕嵌入，不依赖 libass）
        if burn_subtitles:
            has_subs = any(load_subtitle_json(s.stem) for s in shots)
            if has_subs:
                # 生成 SRT 格式字幕（drawtext/ass 需要 libass，SRT 软字幕更通用）
                srt_content = build_srt_subtitle(shots, time_offsets)
                srt_file = Path("/tmp/weihunqi_subs.srt")
                srt_file.write_text(srt_content, encoding="utf-8")
                sub_out = Path("/tmp/weihunqi_with_subs.mp4")

                print("  [3/3] 嵌入字幕（SRT 软字幕轨）...")
                result = subprocess.run([
                    "ffmpeg", "-y",
                    "-i", str(current_input),
                    "-i", str(srt_file),
                    "-c:v", "copy", "-c:a", "copy",
                    "-c:s", "mov_text",
                    "-map", "0:v", "-map", "0:a", "-map", "1:s",
                    "-metadata:s:s:0", "language=chi",
                    str(sub_out)
                ], capture_output=True)

                if result.returncode == 0:
                    shutil.copy(str(sub_out), str(output_path))
                    print("  ✅ 字幕已嵌入（软字幕，播放时可开关）")
                else:
                    print("  [WARN] 字幕嵌入失败，输出无字幕版本")
                    shutil.copy(str(current_input), str(output_path))
            else:
                print("  [3/3] 未找到字幕 json，跳过烧字幕")
                shutil.copy(str(current_input), str(output_path))
        else:
            shutil.copy(str(current_input), str(output_path))

    size_mb = output_path.stat().st_size / 1024 / 1024
    print(f"\n✅ 合成完成: {output_path}")
    print(f"   文件大小: {size_mb:.1f} MB  时长: {total_dur:.1f}s")


# ---- 主流程 ----

def main():
    parser = argparse.ArgumentParser(description="多镜头合成工具")
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--ep", type=int, help="合成指定集数（如 --ep 3）")
    group.add_argument("--shots", nargs="+", help="指定 shot 名列表（如 e3s1 e3s2 e3s3_v2）")

    parser.add_argument("--out", help="输出路径（默认 scripts/compose_output/ep<N>.mp4）")
    parser.add_argument("--bgm", help="BGM 文件路径（mp3/aac）")
    parser.add_argument("--bgm-volume", type=float, default=0.25,
                        help="BGM 相对音量 0~1（默认 0.25，不盖过对话）")
    parser.add_argument("--subtitles", action="store_true",
                        help="烧录字幕（从 scripts/subtitles/output/*.json 读取）")
    args = parser.parse_args()

    if args.ep:
        shots = collect_shots_for_ep(args.ep)
        if not shots:
            print(f"[ERROR] 第 {args.ep} 集没有找到任何 shot (e{args.ep}sX.mp4)")
            sys.exit(1)
        default_out = OUTPUT_DIR / f"ep{args.ep:02d}.mp4"
    else:
        shots = []
        for name in args.shots:
            candidates = list(VIDEOS_DIR.glob(f"{name}.mp4"))
            if not candidates:
                print(f"[WARN] 未找到 shot: {name}")
            else:
                shots.append(candidates[0])
        if not shots:
            print("[ERROR] 没有找到任何有效的 shot 文件")
            sys.exit(1)
        default_out = OUTPUT_DIR / "custom_compose.mp4"

    output_path = Path(args.out) if args.out else default_out
    bgm_path = Path(args.bgm) if args.bgm else None

    compose(
        shots=shots,
        output_path=output_path,
        bgm_path=bgm_path,
        burn_subtitles=args.subtitles,
        bgm_volume=args.bgm_volume,
    )


if __name__ == "__main__":
    main()
