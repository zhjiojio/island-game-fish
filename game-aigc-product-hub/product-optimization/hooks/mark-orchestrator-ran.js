#!/usr/bin/env node
/**
 * mark-orchestrator-ran.js · PostToolUse hook (on use_subagent)
 * ----------------------------------------------------
 * 当 use_subagent 调用完成、且 subagent 是 aigc-minigame-orchestrator 时，
 * 写一个 session-scoped marker 文件，让 enforce-orchestrator.js 知道"已走过编排"。
 *
 * Hook 输入（stdin JSON）: { tool_name, tool_input, tool_response, session_id, ... }
 */
const fs = require('fs');
const path = require('path');
const os = require('os');

const MARKER_DIR = path.join(os.homedir(), '.codeflicker/kwaipilot-hooks/aigc-minigame/.session-markers');

function readStdin() {
  try { return JSON.parse(fs.readFileSync(0, 'utf8') || '{}'); } catch { return {}; }
}

function main() {
  const input = readStdin();
  const toolName = input.tool_name || '';
  if (toolName !== 'use_subagent') { process.exit(0); return; }
  const sub = (input.tool_input && input.tool_input.subagent_name) || '';
  if (sub !== 'aigc-minigame-orchestrator') { process.exit(0); return; }
  const sessionId = input.session_id || 'unknown';
  try {
    fs.mkdirSync(MARKER_DIR, { recursive: true });
    fs.writeFileSync(path.join(MARKER_DIR, `${sessionId}.orchestrator`), String(Date.now()));
  } catch (e) {
    process.stderr.write(`[aigc-mark-orch] ${e.message}\n`);
  }
  process.exit(0);
}

try { main(); } catch { process.exit(0); }
