#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
# .git/hooks/pre-push · 老铁眼真尖 · push 前守门（第二把锁）
#
# 只在推送到 dev 分支时激活。检查：
#   1. games/ks658651445853447417/package/js/main.js BUILD_VER 存在
#   2. index.html ?v= 版本号一致
#   3. 无 stash + 无冲突标记
#
# 若失败 → 阻止 push（exit 1）
# 若想强推 → PRE_PUSH_BYPASS=1 git push ...
# ═══════════════════════════════════════════════════════════════════════════
set -e
[ "${PRE_PUSH_BYPASS:-}" = "1" ] && exit 0

REPO_ROOT="$(git rev-parse --show-toplevel)"
LAOTIE="$REPO_ROOT/games/ks658651445853447417"
[ ! -d "$LAOTIE" ] && exit 0  # 不是这个仓，跳过

# 只在 push 到 dev 时守门
while read -r local_ref local_sha remote_ref remote_sha; do
  [[ "$remote_ref" != *"refs/heads/dev" ]] && continue

  # 检查此次 push 是否触及 laotie 目录
  CHANGED_FILES=$(git diff --name-only "$remote_sha" "$local_sha" 2>/dev/null | grep "games/ks658651445853447417/" || true)
  [ -z "$CHANGED_FILES" ] && continue

  echo "═══ pre-push 守门（laotie） ═══"

  # ① stash 检查
  STASH=$(git stash list | wc -l | tr -d ' ')
  if [ "$STASH" -gt 0 ]; then
    echo "🚫 stash 非空 ($STASH 条)，禁止 push 到 dev（避免 v1.0.97 事故重演）"
    git stash list
    echo ""
    echo "解决：先 git stash pop 或 drop"
    echo "紧急绕过：PRE_PUSH_BYPASS=1 git push ..."
    exit 1
  fi

  # ② 冲突标记
  if grep -rln "^<<<<<<< \|^>>>>>>> " "$LAOTIE/package/" 2>/dev/null | grep -q .; then
    echo "🚫 检测到合并冲突标记："
    grep -rln "^<<<<<<< \|^>>>>>>> " "$LAOTIE/package/"
    exit 1
  fi

  # ③ 版本号三件套
  VER=$(grep -oE "BUILD_VER = 'v[0-9]+\.[0-9]+\.[0-9]+'" "$LAOTIE/package/js/main.js" | head -1 | grep -oE "[0-9]+\.[0-9]+\.[0-9]+")
  if [ -z "$VER" ]; then
    echo "🚫 package/js/main.js 里找不到 BUILD_VER"
    exit 1
  fi
  MARKER=$(grep -oE "\[MARKER v[0-9]+\]" "$LAOTIE/package/js/main.js" | head -1)
  if [ -z "$MARKER" ]; then
    echo "🚫 找不到 [MARKER vNN]"
    exit 1
  fi
  V_COUNT=$(grep -oE "\?v=[0-9]+" "$LAOTIE/package/index.html" | sort -u | wc -l | tr -d ' ')
  if [ "$V_COUNT" -gt 1 ]; then
    echo "🚫 index.html 里存在多个不同的 ?v= 值（应统一）："
    grep -oE "\?v=[0-9]+" "$LAOTIE/package/index.html" | sort -u
    exit 1
  fi

  echo "✅ pre-push 守门通过: v$VER / $MARKER"
done

exit 0
