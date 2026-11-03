#!/usr/bin/env python3
"""
全量下载所有视频到 scripts/subtitles/videos/
映射: content/subtitles/<KEY>.json → node_id → episodes/*.json media.file URL
"""
import json
import pathlib
import subprocess
import sys

ROOT = pathlib.Path(__file__).parent.parent.parent  # /Users/fat/weihunqi
VIDEO_DIR = pathlib.Path(__file__).parent / "videos"
VIDEO_DIR.mkdir(exist_ok=True)

EP_DIR = ROOT / "content" / "episodes"
SUB_DIR = ROOT / "content" / "subtitles"

# 1. 从 episodes 里建 node_id -> video_url 字典
node_to_url = {}
for f in sorted(EP_DIR.glob("*.json")):
    try:
        ep = json.loads(f.read_text())
        nodes = ep.get("nodes", ep)
        for node_id, node in nodes.items():
            if not isinstance(node, dict):
                continue
            m = node.get("media", {})
            if isinstance(m, dict) and m.get("kind") == "video":
                url = m.get("file", "")
                if url and url.startswith("http"):
                    node_to_url[node_id] = url
    except Exception as e:
        print(f"ERR parsing {f}: {e}")

print(f"Found {len(node_to_url)} video nodes in episodes")

# 2. 从 content/subtitles 里建 subtitle_key -> node_id -> url
subtitle_map = {}  # key -> (node_id, url)
for f in sorted(SUB_DIR.glob("*.json")):
    try:
        o = json.loads(f.read_text())
        node_id = o.get("node", "")
        # 尝试直接匹配
        url = node_to_url.get(node_id, "")
        # 有些节点用大写存在 episodes 里
        if not url:
            url = node_to_url.get(node_id.lower(), "")
        if not url:
            url = node_to_url.get(node_id.upper(), "")
        subtitle_map[f.stem] = (node_id, url)
    except Exception as e:
        print(f"ERR {f}: {e}")

# 手动补充 S1-S10 的映射（episodes 里 key 是 s1 小写）
# 也检查 local_* 系列有没有对应
print(f"\nSubtitle key -> node_id -> URL mapping:")
missing = []
for key, (node_id, url) in sorted(subtitle_map.items()):
    status = "✓" if url else "✗ MISSING"
    print(f"  {status} {key} ({node_id}) -> {url[:70] if url else '(no url)'}")
    if not url:
        missing.append((key, node_id))

if missing:
    print(f"\nNo URL found for {len(missing)} subtitle keys:")
    for k, n in missing:
        print(f"  {k} ({n})")

# 3. 下载视频
print(f"\n{'='*60}")
print("Downloading videos...")
total = 0
skipped = 0
failed = []

for key, (node_id, url) in sorted(subtitle_map.items()):
    if not url:
        print(f"  SKIP (no URL): {key}")
        skipped += 1
        continue

    out = VIDEO_DIR / f"{key}.mp4"
    if out.exists() and out.stat().st_size > 1000:
        print(f"  EXIST: {key}.mp4 ({out.stat().st_size//1024}KB)")
        skipped += 1
        continue

    print(f"  DL {key}.mp4 <- {url[:60]}...")
    try:
        result = subprocess.run(
            ["curl", "-L", "-f", "-o", str(out), "--retry", "3", "--retry-delay", "2", url],
            capture_output=True, text=True, timeout=120
        )
        if result.returncode == 0 and out.exists() and out.stat().st_size > 1000:
            print(f"    OK: {out.stat().st_size//1024}KB")
            total += 1
        else:
            print(f"    FAIL: rc={result.returncode} stderr={result.stderr[:100]}")
            failed.append(key)
            if out.exists():
                out.unlink()
    except subprocess.TimeoutExpired:
        print(f"    TIMEOUT: {key}")
        failed.append(key)

print(f"\n{'='*60}")
print(f"Downloaded: {total}, Skipped: {skipped}, Failed: {len(failed)}")
if failed:
    print(f"Failed: {failed}")

print(f"\nVideos in {VIDEO_DIR}:")
for p in sorted(VIDEO_DIR.glob("*.mp4")):
    print(f"  {p.name} ({p.stat().st_size//1024}KB)")
