#!/usr/bin/env node
/**
 * session-start-check.js · SessionStart hook (also usable as UserPromptSubmit first-turn)
 * ----------------------------------------------------
 * 会话启动时：
 *  1) 检查 ~/.codeflicker/skills 是否 git 仓库 + 是否 up-to-date
 *  2) 若 behind → 自动 pull（用户可关闭）
 *  3) 若 dirty → 输出 warning，让用户知道
 *
 * 不阻断会话，只做提示 + 自动 pull。
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

const SKILL_REPO = path.join(os.homedir(), '.codeflicker/skills');

function sh(cmd, cwd) {
  try { return { code: 0, out: execSync(cmd, { cwd, encoding: 'utf8', stdio: ['ignore','pipe','pipe'] }).trim() }; }
  catch (e) { return { code: e.status || 1, out: (e.stdout || '') + (e.stderr || '') }; }
}

function main() {
  const lines = [];
  if (!fs.existsSync(path.join(SKILL_REPO, '.git'))) {
    lines.push('[aigc-skill-check] ⚠️ ~/.codeflicker/skills 尚未初始化为 git 仓库。');
    lines.push('运行以下命令绑定「产品优化版」仓库（GitLab 建仓后填 URL）：');
    lines.push('  cd ~/.codeflicker/skills && git init && git remote add origin <gitlab-url> && git add -A && git commit -m "init" && git push -u origin main');
  } else {
    const status = sh('git status --porcelain', SKILL_REPO);
    if (status.out.trim()) {
      lines.push('[aigc-skill-check] ⚠️ Skill 仓库有未提交变更:');
      lines.push(status.out.split('\n').slice(0, 10).map((l) => '  ' + l).join('\n'));
    }
    const fetch = sh('git fetch --quiet 2>&1', SKILL_REPO);
    const behind = sh('git rev-list --count HEAD..@{u} 2>/dev/null', SKILL_REPO);
    if (behind.code === 0 && parseInt(behind.out || '0') > 0) {
      lines.push(`[aigc-skill-check] 落后远端 ${behind.out} 个 commit，尝试自动 pull...`);
      const pull = sh('git pull --ff-only 2>&1', SKILL_REPO);
      if (pull.code === 0) lines.push('[aigc-skill-check] ✅ pull 成功');
      else lines.push(`[aigc-skill-check] ❌ pull 失败: ${pull.out.slice(0,200)}`);
    }
  }

  if (lines.length) {
    const out = {
      hookSpecificOutput: {
        hookEventName: 'SessionStart',
        additionalContext: lines.join('\n'),
      },
    };
    process.stdout.write(JSON.stringify(out));
  }
  process.exit(0);
}

try { main(); } catch (e) { process.stderr.write(`[aigc-skill-check] ${e.message}\n`); process.exit(0); }
