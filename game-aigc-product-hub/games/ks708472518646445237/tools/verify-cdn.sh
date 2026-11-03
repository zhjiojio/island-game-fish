#!/bin/bash
# tools/verify-cdn.sh — 校验剧本引用的每个素材在 CDN 上真实可取
# 双桶策略：新桶白名单命中的走新桶，其他走老桶（与 tb-config.js 保持一致）
BASE_NEW="https://p4-ad.adkwai.com/udata/pkg/KS-GAME/AIGC-SoGame/ks708472518646445237"
BASE_OLD="https://p4-ad.adkwai.com/udata/pkg/KS-GAME/AIGC-SoGame/ks654429322415476022"
LIST="$(dirname "$0")/asset-refs.txt"
[ -f "$LIST" ] || { echo "缺少 $LIST"; exit 1; }
# 新桶白名单（basename）
NEW_BN=" shot-05-beer-girl-full-v1-web.mp4 shot-07-bartender-full-v1-web.mp4 shot-08-singer-full-v1-web.mp4 shot-09-dancer-full-v1-web.mp4 shot-11a-beer-cheer-v1-web.mp4 shot-11b-dancer-yoga-v1-web.mp4 shot-11c-singer-chef-v1-web.mp4 shot-11d-bartender-biker-v1-web.mp4 shot-13a-beer-reveal-v1-web.mp4 shot-13b-bartender-reveal-v1-web.mp4 shot-13c-singer-reveal-v1-web.mp4 shot-13d-dancer-reveal-v1-web.mp4 shot-15-beer-dressing-room-v1-web.mp4 shot-16-bartender-base-v1-web.mp4 shot-16-dancer-base-v1-web.mp4 shot-16-singer-base-v1-web.mp4 shot-21-threat-lineup-v1-web.mp4 shot-22-human-bar-v1-web.mp4 shot-23-body-letter-v1-web.mp4 shot-24-split-rps-v1-web.mp4 shot-27-final-sprint-v1-web.mp4 shot-30-coronation-v1-web.mp4 shot-05-beer-girl-v1-crop.png shot-07a-bartender-flair-v1.png shot-08a-singer-mic-v1.png shot-09a-dancer-backlight-v1.png shot-11a-beer-cheer-v1.png shot-13a-beer-reveal-v1.png shot-13b-bartender-reveal-v1.png shot-13c-singer-reveal-v1.png shot-13d-dancer-reveal-v1.png shot-15-beer-base-v1.png shot-16-bartender-base-v1.png shot-16-dancer-base-v1.png shot-16-singer-base-v1.png shot-21-threat-lineup-v1.png shot-22-human-bar-v1.png shot-23-body-letter-v1.png shot-24-split-rps-v1.png shot-27-final-sprint-v1.png shot-30-coronation-v1.png "
total=0; ok=0; miss=0
: > /tmp/cdn-missing.txt
while IFS= read -r f; do
  [ -z "$f" ] && continue
  total=$((total+1))
  rel="${f#assets/}"
  bn=$(basename "$rel")
  if echo "$NEW_BN" | grep -q " $bn "; then base="$BASE_NEW"; tag="[NEW]"; else base="$BASE_OLD"; tag="[OLD]"; fi
  url="$base/$rel"
  code=$(curl -s -o /dev/null -w "%{http_code}" -r 0-64 --max-time 20 "$url")
  if [ "$code" = "200" ] || [ "$code" = "206" ]; then
    ok=$((ok+1))
  else
    miss=$((miss+1)); echo "$code $tag $f" | tee -a /tmp/cdn-missing.txt
  fi
done < "$LIST"
echo "──────────────────────────────"
echo "总计 $total  可取 $ok  缺失 $miss"
[ "$miss" -eq 0 ] && echo "✅ 全部素材 CDN 可取" || echo "❌ 缺失清单见 /tmp/cdn-missing.txt"
exit $([ "$miss" -eq 0 ] && echo 0 || echo 1)
