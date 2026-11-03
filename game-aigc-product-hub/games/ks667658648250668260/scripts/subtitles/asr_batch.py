#!/usr/bin/env python3
"""
Batch ASR for weihunqi videos.
- Uses FunASR Paraformer-zh with VAD + Punct + word-level timestamps
- Output: one JSON per video in ./output/<name>.json
  {
    "video": "S1.mp4",
    "duration": 10.24,
    "text": "全文...",
    "sentences": [
      {"text": "傲天你回来了", "start": 0.42, "end": 2.18,
       "chars": [{"c":"傲","s":0.42,"e":0.58}, ...]}
    ]
  }
"""
import json, os, sys, subprocess, tempfile, time
from pathlib import Path

ROOT = Path(__file__).parent
VIDEO_DIR = ROOT / "videos"
OUT_DIR = ROOT / "output"
OUT_DIR.mkdir(exist_ok=True)

# lazy import to give a nicer error if not installed
try:
    from funasr import AutoModel
except ImportError:
    print("FunASR not installed. Run: pip install funasr modelscope torch torchaudio")
    sys.exit(1)


def extract_audio(video_path: Path, wav_path: Path):
    """Extract 16k mono wav via ffmpeg."""
    if wav_path.exists():
        return
    subprocess.run(
        ["ffmpeg", "-y", "-i", str(video_path),
         "-vn", "-ac", "1", "-ar", "16000",
         "-f", "wav", str(wav_path)],
        check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )


def get_duration(video_path: Path) -> float:
    r = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration",
         "-of", "default=noprint_wrappers=1:nokey=1", str(video_path)],
        capture_output=True, text=True,
    )
    try:
        return float(r.stdout.strip())
    except Exception:
        return 0.0


def build_model():
    print("[init] loading FunASR models (first run downloads ~1GB)...")
    return AutoModel(
        model="paraformer-zh",
        vad_model="fsmn-vad",
        punc_model="ct-punc",
        # word-level timestamps use the "timestamp" model built into paraformer-zh
        disable_update=True,
    )


def transcribe(model, wav_path: Path):
    """Return list of sentence dicts with char-level timestamps."""
    res = model.generate(input=str(wav_path))
    # FunASR returns list of dicts with keys: text, timestamp (list of [start_ms, end_ms] per char)
    if not res:
        return {"text": "", "sentences": []}
    r = res[0]
    text = r.get("text", "")
    ts = r.get("timestamp", [])  # per-char [start_ms, end_ms]

    # Strip spaces & punctuation from text but keep original for output.
    # We align char timestamps against the "raw" (non-punct) chars, then insert
    # punctuation back into sentences by splitting on 。！？，,.!?;
    import re
    # chars that received a timestamp (paraformer skips punct in timestamp)
    # build a per-char list
    chars_out = []
    ts_idx = 0
    for ch in text:
        if re.match(r"[\u4e00-\u9fff a-zA-Z0-9]", ch):
            if ts_idx < len(ts):
                s_ms, e_ms = ts[ts_idx]
                chars_out.append({"c": ch, "s": round(s_ms / 1000, 3), "e": round(e_ms / 1000, 3)})
                ts_idx += 1
            else:
                chars_out.append({"c": ch, "s": None, "e": None})
        else:
            # punctuation — assign it to previous char's end
            prev_e = chars_out[-1]["e"] if chars_out and chars_out[-1]["e"] is not None else None
            chars_out.append({"c": ch, "s": prev_e, "e": prev_e})

    # split into sentences by punctuation
    sentences = []
    cur_chars = []
    for c in chars_out:
        cur_chars.append(c)
        if c["c"] in "。！？!?…":
            _flush(sentences, cur_chars)
            cur_chars = []
    if cur_chars:
        _flush(sentences, cur_chars)

    return {"text": text, "sentences": sentences}


def _flush(sentences, cur_chars):
    if not cur_chars:
        return
    text = "".join(c["c"] for c in cur_chars).strip()
    if not text:
        return
    timed = [c for c in cur_chars if c["s"] is not None]
    if not timed:
        return
    sentences.append({
        "text": text,
        "start": timed[0]["s"],
        "end": timed[-1]["e"],
        "chars": cur_chars,
    })


def main():
    videos = sorted([p for p in VIDEO_DIR.glob("*.mp4")])
    if not videos:
        print(f"No videos in {VIDEO_DIR}. Run download.sh first.")
        sys.exit(1)

    print(f"[info] found {len(videos)} videos")
    model = build_model()

    ok, fail = 0, 0
    for i, vp in enumerate(videos, 1):
        name = vp.stem
        out_json = OUT_DIR / f"{name}.json"
        if out_json.exists():
            print(f"[{i}/{len(videos)}] skip {name} (already done)")
            ok += 1
            continue
        print(f"[{i}/{len(videos)}] {name}")
        try:
            with tempfile.TemporaryDirectory() as td:
                wav = Path(td) / f"{name}.wav"
                extract_audio(vp, wav)
                dur = get_duration(vp)
                result = transcribe(model, wav)
                result["video"] = vp.name
                result["duration"] = round(dur, 3)
                out_json.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
            print(f"    -> {out_json.name}  ({len(result['sentences'])} sentences)")
            ok += 1
        except Exception as e:
            print(f"    !! FAIL: {e}")
            fail += 1

    print(f"\nDone. ok={ok} fail={fail}   output in {OUT_DIR}")


if __name__ == "__main__":
    main()
