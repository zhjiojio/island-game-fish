#!/usr/bin/env node
/**
 * inject-skill-dependency.js
 * 给 AIGC 小游戏项目 skill 头部批量注入 skill_dependency 声明块（幂等）。
 */
const fs = require('fs');
const path = require('path');
const os = require('os');

const SKILLS_ROOT = path.join(os.homedir(), '.codeflicker/skills');
const MARKER = '<!-- AIGC-MINIGAME-SKILL-DEPENDENCY -->';
const BLOCK = `${MARKER}
> ⚠️ **SKILL DEPENDENCY · 强制前置**
>
> 本 skill 属于 AIGC 小游戏（快手小游戏）生产流程的一部分，**必须先加载 \`agw-work-mode\`**。
>
> - 若本对话尚未加载 \`agw-work-mode\` 的 \`<skill_content>\`，先调用 \`use_skill("agw-work-mode")\`
> - 若本次任务涉及 build / upload / commit 等敏感动作，**必须先走 \`aigc-minigame-orchestrator\` subagent**
> - 详见云端权威版本：\`git@git.corp.kuaishou.com:kwai-game/game-aigc/game-aigc-product-hub.git\` \`product-optimization/\` 目录
<!-- /AIGC-MINIGAME-SKILL-DEPENDENCY -->
`;

const targets = [
  'laotie-zhaocha-game',
  'laotie-zhaocha-coord-workflow',
  'laotie-zhaocha-scene-image',
  'tiaimo-bar-game',
  'wo-de-weihunqi-interactive-drama',
  'kuaishou-minigame-aigc',
];

function inject(slug) {
  const file = path.join(SKILLS_ROOT, slug, 'SKILL.md');
  if (!fs.existsSync(file)) return console.log(`  ✗ not-found: ${slug}`);
  let content = fs.readFileSync(file, 'utf8');
  if (content.includes(MARKER)) return console.log(`  = already-injected: ${slug}`);

  // 找第一行 H1（以 "# " 开头，非 "## "）
  const lines = content.split('\n');
  let h1Idx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/^#\s+\S/.test(lines[i])) { h1Idx = i; break; }
  }
  if (h1Idx < 0) return console.log(`  ✗ no-H1: ${slug}`);

  // 在 H1 后面插入 block（前面加空行，后面加空行）
  const insertAt = h1Idx + 1;
  const before = lines.slice(0, insertAt);
  const after = lines.slice(insertAt);
  const merged = before.concat(['', BLOCK], after).join('\n');

  fs.writeFileSync(file, merged, 'utf8');
  console.log(`  ✓ injected: ${slug}`);
}

targets.forEach(inject);
console.log('Done.');
