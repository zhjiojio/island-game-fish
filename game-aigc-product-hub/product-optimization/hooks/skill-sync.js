#!/usr/bin/env node
/**
 * skill-sync.js · PostToolUse hook
 * ----------------------------------------------------
 * 当有文件写入路径落在 ~/.codeflicker/skills/ 或 ~/.codeflicker/remote-personal-skills/ 下时:
 *   - 自动 git add -A + commit + push（在 ~/.codeflicker/skills/ 仓库内）
 *   - push 失败不阻断当前任务，但在下次 enforce-orchestrator 时会阻断敏感操作
 *
 * 设计：本 hook 只处理 ~/.codeflicker/skills/ 目录（这是我们要绑定 GitLab 的仓库）。
 * remote-personal-skills/ 由 CodeFlicker 自己管理，本 hook 不动它。
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

const SKILL_REPO = path.join(os.homedir(), '.codeflicker/skills');

function readStdin() {
  try { return JSON.parse(fs.readFileSync(0, 'utf8') || '{}'); } catch { return {}; }
}
function sh(cmd, cwd) {
  try {
    return { code: 0, out: execSync(cmd, { cwd, encoding: 'utf8', stdio: ['ignore','pipe','pipe'] }).trim() };
  } catch (e) {
    return { code: e.status || 1, out: (e.stdout || '') + '\n' + (e.stderr || '') };
  }
}

function pathTouchedSkillRepo(input) {
  const inputPath = input.tool_input && (input.tool_input.path || input.tool_input.target_file);
  if (!inputPath) return false;
  const abs = path.isAbsolute(inputPath) ? inputPath : path.resolve(input.cwd || process.cwd(), inputPath);
  return abs.startsWith(SKILL_REPO + path.sep) || abs === SKILL_REPO;
}

function main() {
  const input = readStdin();
  if (!pathTouchedSkillRepo(input)) { process.exit(0); return; }
  if (!fs.existsSync(path.join(SKILL_REPO, '.git'))) {
    process.stderr.write('[aigc-skill-sync] ~/.codeflicker/skills 还未初始化为 git 仓库，跳过同步\n');
    process.exit(0);
    return;
  }

  const status = sh('git status --porcelain', SKILL_REPO);
  if (!status.out.trim()) { process.exit(0); return; }

  const add = sh('git add -A', SKILL_REPO);
  if (add.code !== 0) {
    process.stderr.write(`[aigc-skill-sync] add 失败: ${add.out}\n`);
    process.exit(0);
    return;
  }
  const msg = `auto: skill sync from codeflicker session ${new Date().toISOString().slice(0,19)}`;
  const commit = sh(`git commit -m ${JSON.stringify(msg)}`, SKILL_REPO);
  if (commit.code !== 0) {
    process.stderr.write(`[aigc-skill-sync] commit skipped: ${commit.out.slice(0,200)}\n`);
    process.exit(0);
    return;
  }
  const push = sh('git push 2>&1', SKILL_REPO);
  if (push.code !== 0) {
    process.stderr.write(`[aigc-skill-sync] ⚠️ push 失败（不阻断当前任务，但下次 build 前必须手动 push）:\n${push.out.slice(0,300)}\n`);
  } else {
    process.stderr.write(`[aigc-skill-sync] ✅ skill 变更已 push 到远端\n`);
  }
  process.exit(0);
}

try { main(); } catch (e) {
  process.stderr.write(`[aigc-skill-sync] ${e.message}\n`);
  process.exit(0);
}
