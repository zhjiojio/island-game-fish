#!/usr/bin/env bash
# ---------------------------------------------------------------
# product-optimization · 一键安装到本地 CodeFlicker
# ---------------------------------------------------------------
# 把 hub 仓库内的 config / agents / hooks 同步到本地 ~/.codeflicker/。
# 幂等，重复运行安全。
set -euo pipefail

SRC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CF_HOME="${HOME}/.codeflicker"

echo "==> 目标: ${CF_HOME}"

# 1. Registry → agw-work-mode skill 内
AGW_DIR="${CF_HOME}/remote-personal-skills/agw-work-mode"
if [[ -d "$AGW_DIR" ]]; then
  cp "${SRC_DIR}/config/aigc-minigame-registry.json" "${AGW_DIR}/"
  echo "  ✓ registry → ${AGW_DIR}/aigc-minigame-registry.json"
else
  echo "  ⚠ agw-work-mode skill 未安装（${AGW_DIR} 不存在），跳过 registry。"
fi

# 2. Orchestrator subagent
mkdir -p "${CF_HOME}/agents"
cp "${SRC_DIR}/agents/aigc-minigame-orchestrator.md" "${CF_HOME}/agents/"
echo "  ✓ subagent → ${CF_HOME}/agents/aigc-minigame-orchestrator.md"
# 2.5 Skills（v2026.08.20 新增：把 hub 里的 skill 副本同步到本地 ~/.codeflicker/skills/）
if [[ -d "${SRC_DIR}/skills" ]]; then
  mkdir -p "${CF_HOME}/skills"
  for skill_dir in "${SRC_DIR}/skills"/*/; do
    skill_name=$(basename "$skill_dir")
    mkdir -p "${CF_HOME}/skills/${skill_name}"
    cp "${skill_dir}"SKILL.md "${CF_HOME}/skills/${skill_name}/SKILL.md"
    echo "  ✓ skill → ${CF_HOME}/skills/${skill_name}/SKILL.md"
  done
fi

# 3. Hooks
HOOKS_DIR="${CF_HOME}/kwaipilot-hooks/aigc-minigame"
mkdir -p "$HOOKS_DIR"
cp "${SRC_DIR}/hooks/"*.js "$HOOKS_DIR/"
echo "  ✓ hooks → ${HOOKS_DIR}/"

# 4. settings.json 合并提示（不自动改，避免破坏用户已有配置）
SETTINGS="${CF_HOME}/settings.json"
if [[ -f "$SETTINGS" ]]; then
  if ! grep -q "aigc-minigame/enforce-orchestrator.js" "$SETTINGS"; then
    echo ""
    echo "  ⚠ settings.json 尚未注册 aigc-minigame hooks。"
    echo "    请手动把 ${SRC_DIR}/settings-snippet.json 的 hooks 字段合并到:"
    echo "      $SETTINGS"
    echo "    （或参考项目根 README 的 hook 注册示例）"
  else
    echo "  ✓ settings.json 已包含 aigc-minigame hooks"
  fi
else
  echo "  ⚠ ${SETTINGS} 不存在，请先启用 CodeFlicker 生成基础配置后重跑本脚本。"
fi

echo ""
echo "==> 安装完成。下次会话开始，任何 AIGC 小游戏任务都会强制走 orchestrator。"
