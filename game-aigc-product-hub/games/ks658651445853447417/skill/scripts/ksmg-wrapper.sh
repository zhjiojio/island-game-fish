#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
# ksmg-wrapper.sh · 老铁眼真尖 · ksmg 命令级强制拦截
#
# 目的：让 `ksmg upload ./package` 这种"裸调用"在 laotie 目录下**物理上无法执行**。
#      任何绕过 subagent 或 AI 直接跑 ksmg 的行为，都会被这个 shell function 挡下。
#
# 安装：在 ~/.zshrc 末尾加一行 `source <这个文件的绝对路径>`
#      或者跑 install-team-guard.sh 自动装
# ═══════════════════════════════════════════════════════════════════════════

LAOTIE_APPID="ks658651445853447417"
LAOTIE_GAME_DIR="/Users/fat/Desktop/aiminigame/game-aigc-product-hub/games/${LAOTIE_APPID}"
KSMG_REAL="/usr/local/bin/ksmg"

ksmg() {
  local pwd_now="$(pwd)"
  local args="$*"
  local cmd="${1:-}"

  # 只在 laotie game 目录 + upload/preview 子命令 时拦截
  local in_laotie=false
  if [[ "$pwd_now" == *"${LAOTIE_APPID}"* ]] || [[ "$args" == *"${LAOTIE_APPID}"* ]]; then
    in_laotie=true
  fi

  if $in_laotie && [[ "$cmd" == "upload" || "$cmd" == "preview" ]]; then
    # 拦截条件命中！
    echo ""
    echo "🚫🚫🚫 【老铁眼真尖 build 守门】 🚫🚫🚫"
    echo ""
    echo "❌ 禁止裸调用: ksmg $args"
    echo ""
    echo "✅ 请使用："
    echo "   cd $LAOTIE_GAME_DIR"
    echo "   bash skill/scripts/ksmg-preview-safe.sh $cmd \"<version>\" \"<changelog>\""
    echo ""
    echo "或让 AI 帮你走: 直接说「build v1.0.XX」，AI 会自动调 laotie-build-guard subagent"
    echo ""
    echo "如果你确实想紧急绕过（不推荐！），跑："
    echo "   KSMG_FORCE_BYPASS=1 $KSMG_REAL $args"
    echo ""
    return 1
  fi

  # 明确绕过（应急）
  if [ "${KSMG_FORCE_BYPASS:-}" = "1" ]; then
    echo "⚠️  KSMG_FORCE_BYPASS=1 已启用，直接透传（本次不生成 build 报告，请自行负责）"
  fi

  # 其它场景透传
  "$KSMG_REAL" "$@"
}

# zsh 里 function 已经在当前 shell 定义好，无需 export
