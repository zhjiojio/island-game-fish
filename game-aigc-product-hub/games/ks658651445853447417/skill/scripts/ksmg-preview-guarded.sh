#!/usr/bin/env bash
# =============================================================================
# ksmg-preview-guarded.sh —— ksmg-preview 前置门禁包装器
# =============================================================================
# 用法：
#   bash skill/scripts/ksmg-preview-guarded.sh upload ./package "1.0.97" "changelog"
#   bash skill/scripts/ksmg-preview-guarded.sh preview ./package "1.0.97"
#
# 做的事：
#   1. 先跑 laotie-check.sh（无 --skip-cdn，跑完整版）
#   2. 全绿才允许调 ~/.codeflicker/remote-personal-skills/agw-work-mode/scripts/ksmg-preview.sh
#   3. upload 成功后主动提醒 git commit + push
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILL_DIR="$(dirname "$SCRIPT_DIR")"
CHECKER="$SKILL_DIR/scripts/laotie-check.sh"
KSMG_UPSTREAM="${KSMG_UPSTREAM_SCRIPT:-$HOME/.codeflicker/remote-personal-skills/agw-work-mode/scripts/ksmg-preview.sh}"

MODE="${1:-help}"

if [ "$MODE" = "help" ] || [ -z "$MODE" ]; then
  echo "用法："
  echo "  $0 preview ./package 1.0.97"
  echo "  $0 upload  ./package 1.0.97 'changelog msg'"
  exit 0
fi

echo "════ [Guard] 运行 laotie-check 上线前 12 项校验 ════"
bash "$CHECKER"
RC=$?
if [ $RC -ne 0 ]; then
  echo ""
  echo "❌ 校验未通过，禁止 $MODE"
  echo "   紧急绕过：SKIP_LAOTIE_CHECK=1 $0 $@ （强烈不推荐）"
  [ "${SKIP_LAOTIE_CHECK:-0}" = "1" ] || exit 1
fi

echo ""
echo "════ [Guard] 校验通过，调用 ksmg-preview ($MODE) ════"
if [ ! -f "$KSMG_UPSTREAM" ]; then
  echo "❌ 找不到上游脚本 $KSMG_UPSTREAM"
  echo "   请设置环境变量 KSMG_UPSTREAM_SCRIPT=你的 ksmg-preview.sh 路径"
  exit 2
fi

bash "$KSMG_UPSTREAM" "$@"
UPLOAD_RC=$?

# upload 成功后强制提醒 git 同步
if [ "$MODE" = "upload" ] && [ $UPLOAD_RC -eq 0 ]; then
  echo ""
  echo "════ [Guard] upload 成功 · 铁律提醒 ════"
  echo "🚨 必须紧接着 git commit + push，否则源码 SoT 会漂移！"
  echo ""
  echo "  cd $(git -C "$SKILL_DIR" rev-parse --show-toplevel)"
  echo "  git add games/ks658651445853447417"
  echo "  git commit -m 'feat(laotie-zhaocha): v${3:-XXX} 上线'"
  echo "  git push origin \$(git branch --show-current)"
  echo ""
fi

exit $UPLOAD_RC
