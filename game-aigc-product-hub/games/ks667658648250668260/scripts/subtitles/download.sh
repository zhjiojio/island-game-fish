#!/usr/bin/env bash
# Download all CDN videos to scripts/subtitles/videos/
set -e
cd "$(dirname "$0")"
mkdir -p videos
while IFS= read -r url; do
  [ -z "$url" ] && continue
  # keep last two path segments as filename (avoid video/e2s1.mp4 clashing with e2s1.mp4)
  fname=$(echo "$url" | awk -F 'ks712131693858878897/' '{print $2}' | tr '/' '_')
  out="videos/$fname"
  if [ -f "$out" ]; then
    echo "[skip] $fname"
    continue
  fi
  echo "[dl]   $fname"
  curl -sSL --fail "$url" -o "$out" || echo "  !! failed: $url"
done < video_urls.txt

# also link local ones
for f in /Users/fat/weihunqi/subpkg-videos/*.mp4 /Users/fat/weihunqi/assets/videos/*.mp4 /Users/fat/weihunqi/assets/bridge/k_bridge.mp4; do
  [ -f "$f" ] || continue
  base=$(basename "$f")
  # prefix with local_ to avoid overwrite of CDN version with same name
  target="videos/local_$base"
  [ -f "$target" ] || cp "$f" "$target"
done

echo "Done. Videos in ./videos/"
ls -lh videos/ | tail -50
