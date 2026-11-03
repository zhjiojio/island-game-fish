#!/usr/bin/env node
/**
 * 专用：把 build-artifacts/levels-config.json 上传到 CDN
 * 用法：node scripts/upload-levels-json.js [kcdn_token] [--file=build-artifacts/levels-config.json]
 *
 * 直接调 @kcdn/multi-upload，绕开 cdn-upload.js 只认 assets/ 图片音视频的限制
 */
const path = require('path');
const fs   = require('fs');

const APPID = 'ks658651445853447417';
const CDN_DIR = `AIGC-SoGame/${APPID}`; // 与 skill KCDN_PATH_PREFIX 保持一致
const PID   = 'KS-GAME';

function findAgwRoot() {
  const skillsRoot = path.join(process.env.HOME, '.codeflicker/remote-personal-skills');
  if (!fs.existsSync(skillsRoot)) return null;
  const names = fs.readdirSync(skillsRoot)
    .filter(name => name === 'agw-work-mode' || name.startsWith('.temp-agw-work-mode-'))
    .sort()
    .reverse();
  return names.map(name => path.join(skillsRoot, name)).find(dir =>
    fs.existsSync(path.join(dir, 'node_modules/@kcdn/multi-upload'))
  ) || null;
}

const AGW_ROOT = findAgwRoot();

const cliArgs = process.argv.slice(2);
const fileArg = cliArgs.find(arg => arg.startsWith('--file='));
let token = cliArgs.find(arg => !arg.startsWith('--')) || process.env.KCDN_TOKEN;
if (!token) {
  const tokenPath = AGW_ROOT && path.join(AGW_ROOT, 'node_modules/@kcdn/multi-upload/__token.json');
  if (tokenPath && fs.existsSync(tokenPath)) {
    token = JSON.parse(fs.readFileSync(tokenPath, 'utf8'))[PID];
  }
}
if (!token) {
  console.error('❌ 未找到 KCDN token（参数 / KCDN_TOKEN / agw-work-mode token 文件均不可用）');
  process.exit(1);
}

const ROOT    = path.resolve(__dirname, '..');
const JSON_FILE = fileArg
  ? path.resolve(ROOT, fileArg.slice('--file='.length))
  : path.join(ROOT, 'build-artifacts/levels-config.json');
if (!fs.existsSync(JSON_FILE)) {
  console.error('❌ 先跑 node scripts/gen-levels-config.js 生成 JSON');
  process.exit(1);
}

// @kcdn/multi-upload 一般安装在 agw-work-mode 目录下
let Upload;
try {
  Upload = require('@kcdn/multi-upload');
} catch (_) {
  if (!AGW_ROOT) throw new Error('未找到 @kcdn/multi-upload');
  Upload = require(path.join(AGW_ROOT, 'node_modules/@kcdn/multi-upload'));
}

async function main() {
  // @kcdn/multi-upload 会打印完整初始化参数；统一脱敏，避免 token 落入终端日志。
  const originalLog = console.log;
  console.log = (...args) => originalLog(...args.map(value =>
    typeof value === 'string' ? value.replace(/("token"\s*:\s*")[^"]+("?)/g, '$1***REDACTED***$2') : value
  ));
  const upload = new Upload({
    pid:   PID,
    token: token,
    cdnDir: CDN_DIR,
    files: [JSON_FILE],
    uid: 'lihui26',
    allowRewrite: true, // 允许覆盖同名文件（每次上传都用最新版）
  });

  console.log(`⬆️  上传中 → ${CDN_DIR}/levels-config.json`);
  const urls = await upload.start();
  console.log('');
  console.log('✅ 上传成功！CDN URL：');
  urls.forEach((u, i) => console.log(`   [${i + 1}] ${u}`));
  console.log('');
  console.log('👉 在游戏中把 level-loader.js 里 REMOTE_URL 改成上面这个 URL（如域名与预期不同）');
  console.log('👉 开发者后台「服务器域名白名单 · request」记得加对应根域名（如 https://p1-ad.adkwai.com）');
}

main().catch(e => {
  console.error('❌ 上传失败：', e.message);
  process.exit(1);
});
