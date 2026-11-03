#!/usr/bin/env node
/**
 * detect-context.js  ·  UserPromptSubmit hook
 * ----------------------------------------------------
 * 探测用户 prompt / cwd 是否命中 AIGC 小游戏任务。
 * 命中则注入 <system-reminder>，强制主 Agent 先走 aigc-minigame-orchestrator subagent。
 *
 * Hook 输入（stdin JSON）: { user_message, cwd, session_id, ... }
 * Hook 输出: 若命中，stdout 打印 additionalContext JSON；不命中则静默退出 0。
 */
const fs = require('fs');
const path = require('path');
const os = require('os');

const REGISTRY_PATH = path.join(
  os.homedir(),
  '.codeflicker/remote-personal-skills/agw-work-mode/aigc-minigame-registry.json'
);

function safeReadRegistry() {
  try {
    return JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf8'));
  } catch (e) {
    return null;
  }
}

function readStdin() {
  try {
    const raw = fs.readFileSync(0, 'utf8');
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function detect(userMsg, cwd, registry) {
  if (!registry) return null;
  const text = `${userMsg || ''} ${cwd || ''}`;

  // 1) 路径命中：games/ksXXX/
  const appidFromPath = (cwd || '').match(/ks[0-9]{18,20}/);
  const appidFromText = (userMsg || '').match(/ks[0-9]{18,20}/);
  const appid = (appidFromPath || appidFromText || [])[0];

  // 2) 关键词命中
  const kwHit = (registry.trigger_keywords || []).find(
    (k) => text.toLowerCase().includes(k.toLowerCase())
  );

  // 3) path_patterns 命中
  const pathHit = (registry.path_patterns || []).find((pat) => {
    try { return new RegExp(pat).test(cwd || ''); } catch { return false; }
  });

  if (!appid && !kwHit && !pathHit) return null;

  const project = appid ? registry.projects[appid] : null;
  const isGuest = !!appid && !project;

  return {
    appid: appid || null,
    project_name: project ? project.name : null,
    is_guest_mode: isGuest,
    hit_reason: appid ? 'appid' : kwHit ? `keyword:${kwHit}` : `path:${pathHit}`,
  };
}

function buildReminder(hit) {
  const lines = [];
  lines.push('<system-reminder priority="critical">');
  lines.push('检测到 AIGC 小游戏任务。');
  if (hit.project_name) lines.push(`项目: ${hit.project_name} (AppID: ${hit.appid})`);
  else if (hit.appid) lines.push(`AppID: ${hit.appid} (未注册，将进入游客模式)`);
  else lines.push(`命中原因: ${hit.hit_reason}`);
  lines.push('');
  lines.push('【强制流程】必须先调用 use_subagent 走 aigc-minigame-orchestrator，禁止直接：');
  lines.push('  - 直接 use_skill 加载项目 skill');
  lines.push('  - 直接 execute_command 跑 ksmg upload / ksmg preview');
  lines.push('  - 直接 write_to_file / replace_in_file 修改 games/ksXXX/ 下业务文件');
  lines.push('');
  lines.push('正确姿势:');
  lines.push('  use_subagent(');
  lines.push('    subagent_name="aigc-minigame-orchestrator",');
  lines.push('    task="<原始用户任务>",');
  lines.push('    reason="AIGC 小游戏任务强制走编排入口"');
  lines.push('  )');
  lines.push('');
  lines.push('orchestrator 返回 verdict 后，按 load_sequence 加载 skill，按 category 执行；');
  lines.push('每一步会有 PreToolUse hook 兜底守门。');
  lines.push('</system-reminder>');
  return lines.join('\n');
}

function main() {
  const input = readStdin();
  const userMsg = input.user_message || input.prompt || input.message || '';
  const cwd = input.cwd || process.cwd();
  const registry = safeReadRegistry();
  const hit = detect(userMsg, cwd, registry);
  if (!hit) { process.exit(0); return; }

  const reminder = buildReminder(hit);
  // MyFlicker/CodeFlicker hook 约定：往 stdout 打印会作为 additionalContext 注入
  const out = {
    hookSpecificOutput: {
      hookEventName: 'UserPromptSubmit',
      additionalContext: reminder,
    },
    aigc_minigame_context: hit,
  };
  process.stdout.write(JSON.stringify(out));
  process.exit(0);
}

try { main(); } catch (e) {
  // 探测失败不阻断用户
  process.stderr.write(`[aigc-detect-context] ${e.message}\n`);
  process.exit(0);
}
