#!/usr/bin/env node
/**
 * hub-repo-init.js · SessionStart hook
 * ----------------------------------------------------
 * 会话启动时（典型触发场景：用户进入 /agw-work-mode）：
 *  1) 检查 ~/work/minigame/game-aigc-product-hub 是否存在（即本 Hub 仓库本地副本）
 *  2) 不存在 → 后台异步 git clone 到该目录（本仓库含大量媒体素材，体积可达 GB 级，
 *     同步 clone 会把会话启动卡住几分钟，因此不阻塞当前会话）
 *  3) clone 进行中 → 提示用户稍后重开会话即可；clone 失败 → 输出警告 + 手动克隆命令
 *
 * 全程不阻断会话，只做自动初始化 + 提示。
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');

const HUB_DIR = path.join(os.homedir(), 'work/minigame/game-aigc-product-hub');
const HUB_PARENT_DIR = path.dirname(HUB_DIR);
const HUB_REPO_URL = 'git@git.corp.kuaishou.com:kwai-game/game-aigc/game-aigc-product-hub.git';
const MANUAL_CLONE_CMD = `git clone ${HUB_REPO_URL} \\\n  ${HUB_DIR}`;

const LOCK_FILE = path.join(HUB_PARENT_DIR, '.game-aigc-product-hub.clone.lock');
const LOG_FILE = path.join(HUB_PARENT_DIR, '.game-aigc-product-hub.clone.log');

function emit(lines) {
  if (!lines.length) return;
  const out = {
    hookSpecificOutput: {
      hookEventName: 'SessionStart',
      additionalContext: lines.join('\n'),
    },
  };
  process.stdout.write(JSON.stringify(out));
}

function pidAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function readLockPid() {
  try {
    const raw = fs.readFileSync(LOCK_FILE, 'utf8').trim();
    const pid = parseInt(raw, 10);
    return Number.isFinite(pid) ? pid : null;
  } catch {
    return null;
  }
}

function startCloneInBackground() {
  fs.mkdirSync(HUB_PARENT_DIR, { recursive: true });
  const logFd = fs.openSync(LOG_FILE, 'a');

  // 包一层 shell：clone 成功/失败后都清理 lock 文件，避免需要额外守护进程。
  const wrapped = [
    `echo "[hub-repo-init] $(date '+%Y-%m-%d %H:%M:%S') 开始 clone -> ${HUB_DIR}"`,
    `git clone "${HUB_REPO_URL}" "${HUB_DIR}"`,
    `code=$?`,
    `if [ $code -eq 0 ]; then echo "[hub-repo-init] ✅ clone 成功"; else echo "[hub-repo-init] ❌ clone 失败，exit=$code，请手动执行: git clone ${HUB_REPO_URL} ${HUB_DIR}"; fi`,
    `rm -f "${LOCK_FILE}"`,
    `exit $code`,
  ].join(' && ');

  const child = spawn('/bin/sh', ['-c', wrapped], {
    cwd: HUB_PARENT_DIR,
    stdio: ['ignore', logFd, logFd],
    detached: true,
  });
  fs.writeFileSync(LOCK_FILE, String(child.pid));
  child.unref();
  fs.closeSync(logFd);
}

function main() {
  const lines = [];
  const alreadyExists = fs.existsSync(path.join(HUB_DIR, '.git'));

  if (alreadyExists) {
    // Hub 仓库已存在，无需处理；静默退出，避免每次会话启动都刷屏。
    process.exit(0);
    return;
  }

  const lockPid = readLockPid();
  if (lockPid && pidAlive(lockPid)) {
    lines.push('[hub-repo-init] ⏳ Hub 仓库正在后台 clone 中（上次会话已触发），本次会话先正常开始。');
    lines.push(`  完成后可直接使用：${HUB_DIR}`);
    lines.push(`  进度日志：${LOG_FILE}`);
    emit(lines);
    process.exit(0);
    return;
  }

  // lock 文件残留但进程已不存在（例如上次异常退出），清理后重新触发。
  if (lockPid) {
    try { fs.unlinkSync(LOCK_FILE); } catch {}
  }

  lines.push('[hub-repo-init] ⚠️ 未检测到 Hub 仓库本地副本，已在后台开始 clone（仓库含媒体素材，体积较大，不阻塞当前会话）。');
  lines.push(`  目标路径: ${HUB_DIR}`);
  lines.push(`  进度日志: ${LOG_FILE}`);
  lines.push('  若长时间未完成或失败，可手动执行：');
  lines.push(`  ${MANUAL_CLONE_CMD}`);

  try {
    startCloneInBackground();
  } catch (e) {
    lines.push(`[hub-repo-init] ❌ 后台 clone 启动失败: ${e.message}`);
    lines.push('  请手动执行：');
    lines.push(`  ${MANUAL_CLONE_CMD}`);
  }

  emit(lines);
  process.exit(0);
}

try {
  main();
} catch (e) {
  process.stderr.write(`[hub-repo-init] ${e.message}\n`);
  process.exit(0);
}
