#!/usr/bin/env node
/**
 * enforce-orchestrator.js · PreToolUse hook
 * ----------------------------------------------------
 * 在 execute_command / write_to_file / replace_in_file 前拦截：
 *   1) 若命令是 ksmg upload / ksmg preview / git push（AIGC 项目内）
 *   2) 或写入路径在 games/ksXXX/ 下的关键文件
 * 校验：
 *   - 本会话是否已经调用过 aigc-minigame-orchestrator subagent（读 session marker）
 *   - Skill 仓库 ~/.codeflicker/skills/ 是否 clean 且 up-to-date
 * 任一失败 → 退出码 2 阻断，并给出补救提示。
 *
 * Hook 输入（stdin JSON）: { tool_name, tool_input, session_id, cwd, ... }
 * Hook 输出: 退出码 0 放行；2 阻断（stderr 内容会作为反馈）；1 记录警告不阻断。
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

const SKILL_REPO = path.join(os.homedir(), '.codeflicker/skills');
const SESSION_MARKER_DIR = path.join(os.homedir(), '.codeflicker/kwaipilot-hooks/aigc-minigame/.session-markers');
const REGISTRY_PATH = path.join(os.homedir(), '.codeflicker/remote-personal-skills/agw-work-mode/aigc-minigame-registry.json');

function readStdin() {
  try { return JSON.parse(fs.readFileSync(0, 'utf8') || '{}'); } catch { return {}; }
}
function safeReadRegistry() {
  try { return JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf8')); } catch { return null; }
}
function sh(cmd, cwd) {
  try {
    return { code: 0, out: execSync(cmd, { cwd, encoding: 'utf8', stdio: ['ignore','pipe','pipe'] }).trim() };
  } catch (e) {
    return { code: e.status || 1, out: (e.stdout || '') + (e.stderr || '') };
  }
}

function isAigcContext(cwd, cmd, input, registry) {
  if (!registry) return { hit: false };
  const text = `${cwd || ''} ${cmd || ''} ${JSON.stringify(input || {})}`;
  const appid = (text.match(/ks[0-9]{18,20}/) || [])[0];
  if (appid) {
    return {
      hit: true,
      appid,
      project: registry.projects[appid] || null,
      is_guest: !registry.projects[appid],
    };
  }
  const kw = (registry.trigger_keywords || []).find((k) =>
    text.toLowerCase().includes(k.toLowerCase())
  );
  if (kw) return { hit: true, appid: null, project: null, is_guest: false, kw };
  return { hit: false };
}

function isSensitiveCommand(cmd) {
  if (!cmd) return null;
  // 仅当"实际执行的命令入口"是 ksmg upload/preview 或 git push 时才拦截。
  // 即：以 && / ; / || 分段后，段内的第一个「非 cd 的可执行 token」必须是 ksmg 或 git push。
  // 这样能排除：git commit -m "...ksmg upload..."、node -e "...ksmg..."、echo "ksmg upload"、heredoc 传入等场景。
  const segments = cmd.split(/&&|\|\||;/);
  for (const rawSeg of segments) {
    const seg = rawSeg.trim();
    if (!seg) continue;
    // 去掉前置 cd xxx（不含 && 已经在上面切了）—— 但同段内不会再有 cd && 结构，直接去 env 前缀
    const withoutEnv = seg.replace(/^([A-Z_]+=\S+\s+)+/, '');
    // 匹配 ksmg upload（正式提审，严格）/ ksmg preview（本地扫码，宽松）
    if (/^ksmg\s+upload\b/.test(withoutEnv)) return 'ksmg-upload';
    if (/^ksmg\s+preview\b/.test(withoutEnv)) return 'ksmg-preview';
    // 匹配 git push（第一个 token 是 git，第二个是 push）
    if (/^git\s+push\b/.test(withoutEnv)) return 'git-push';
  }
  return null;
}
function isSensitiveWrite(toolName, toolInput) {
  if (!/^(write_to_file|replace_in_file|multi_replace_in_file)$/.test(toolName || '')) return null;
  const p = (toolInput && (toolInput.path || toolInput.target_file || '')) || '';
  if (!/games\/ks[0-9]{18,20}\//.test(p)) return null;
  if (/(game\.js|levels?-?config\.json|project\.config\.json|game\.json)$/.test(p)) return 'critical-file';
  return 'game-file';
}

function orchestratorRan(sessionId) {
  if (!sessionId) return false;
  try {
    const marker = path.join(SESSION_MARKER_DIR, `${sessionId}.orchestrator`);
    return fs.existsSync(marker);
  } catch { return false; }
}

function checkSkillRepo() {
  if (!fs.existsSync(path.join(SKILL_REPO, '.git'))) {
    return { ok: false, reason: 'skill-repo-not-git', hint: `${SKILL_REPO} 尚未初始化为 git 仓库。运行首次同步。` };
  }
  const status = sh('git status --porcelain', SKILL_REPO);
  if (status.out.trim()) {
    return { ok: false, reason: 'skill-repo-dirty', hint: `Skill 仓库有未提交变更:\n${status.out}\n\n请先: cd ~/.codeflicker/skills && git add -A && git commit -m "sync: skill update" && git push` };
  }
  const fetch = sh('git fetch --dry-run 2>&1', SKILL_REPO);
  const behind = sh('git rev-list --count HEAD..@{u} 2>/dev/null', SKILL_REPO);
  if (behind.code === 0 && parseInt(behind.out || '0') > 0) {
    return { ok: false, reason: 'skill-repo-behind', hint: `Skill 仓库落后远端 ${behind.out} 个 commit，先 cd ~/.codeflicker/skills && git pull` };
  }
  const ahead = sh('git rev-list --count @{u}..HEAD 2>/dev/null', SKILL_REPO);
  if (ahead.code === 0 && parseInt(ahead.out || '0') > 0) {
    return { ok: false, reason: 'skill-repo-ahead', hint: `Skill 仓库有 ${ahead.out} 个未 push 的 commit，先 cd ~/.codeflicker/skills && git push` };
  }
  return { ok: true };
}

function block(msg) {
  process.stderr.write('\n🛑 [aigc-minigame · enforce-orchestrator] 拦截\n');
  process.stderr.write(msg + '\n');
  process.exit(2);
}

function main() {
  const input = readStdin();
  const toolName = input.tool_name || '';
  const toolInput = input.tool_input || {};
  const sessionId = input.session_id || '';
  const cwd = input.cwd || toolInput.cwd || process.cwd();
  const cmd = toolInput.command || '';
  const registry = safeReadRegistry();

  const ctx = isAigcContext(cwd, cmd, toolInput, registry);
  if (!ctx.hit) { process.exit(0); return; }

  // 探测敏感动作
  const sensCmd = isSensitiveCommand(cmd);
  const sensWrite = isSensitiveWrite(toolName, toolInput);
  if (!sensCmd && !sensWrite) { process.exit(0); return; }

  // 校验 1: 是否走过 orchestrator
  if (!orchestratorRan(sessionId)) {
    return block([
      `敏感操作: ${sensCmd || sensWrite}`,
      `AppID: ${ctx.appid || '(未知)'}   项目: ${ctx.project ? ctx.project.name : (ctx.is_guest ? '游客模式' : '关键词命中')}`,
      '',
      '本会话尚未调用 aigc-minigame-orchestrator subagent。',
      '请先执行:',
      '',
      '  use_subagent({',
      '    subagent_name: "aigc-minigame-orchestrator",',
      '    task: "<原始用户任务>",',
      '    reason: "AIGC 小游戏任务强制走编排入口"',
      '  })',
      '',
      '收到 verdict 后，再重试当前操作。',
    ].join('\n'));
  }

  // 校验 2: Skill 仓库 clean 且 up-to-date（严格模式）
  // preview 是本地扫码调试，不涉及云端一致性，豁免该校验（orchestrator 已标为 warning）
  if (sensCmd === 'ksmg-preview') { process.exit(0); return; }
  const skill = checkSkillRepo();
  if (!skill.ok) {
    return block([
      `敏感操作: ${sensCmd || sensWrite}`,
      `Skill 仓库检查失败: ${skill.reason}`,
      '',
      skill.hint,
      '',
      '【严格模式】Skill 未同步云端时禁止 build/upload/push，避免云端滞后。',
    ].join('\n'));
  }

  process.exit(0);
}

try { main(); } catch (e) {
  process.stderr.write(`[aigc-enforce] ${e.message}\n`);
  // 出错时不阻断，避免炸掉正常流程
  process.exit(0);
}
