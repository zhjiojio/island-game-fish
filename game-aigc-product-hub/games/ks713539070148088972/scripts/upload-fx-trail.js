#!/usr/bin/env node
/**
 * 专用：把 assets/meinv/fx/ 光尾序列帧（24 帧）上传到 CDN
 * 用法：node scripts/upload-fx-trail.js [kcdn_token]
 *
 * 直接调 @kcdn/multi-upload，允许覆盖同名文件（替换旧版帧图）。
 */
const path = require('path');
const fs   = require('fs');

const APPID = 'ks713539070148088972';
const CDN_DIR = `AIGC-SoGame/${APPID}`;
const PID   = 'KS-GAME';

const cliArgs = process.argv.slice(2);
let token = cliArgs.find(arg => !arg.startsWith('--')) || process.env.KCDN_TOKEN;
if (!token) {
  console.error('❌ 未找到 KCDN token（第一个参数或 KCDN_TOKEN）');
  process.exit(1);
}

const ROOT = path.resolve(__dirname, '..');
const FX_DIR = path.join(ROOT, 'assets/meinv/fx');
const files = fs.readdirSync(FX_DIR)
  .filter(f => /^fx_trail_\d+\.png$/.test(f))
  .sort()
  .map(f => path.join(FX_DIR, f));
if (files.length === 0) {
  console.error('❌ 未找到 fx_trail_*.png 文件');
  process.exit(1);
}

const Upload = require('/Users/wangzhuofan/.nvm/versions/node/v20.20.2/lib/node_modules/@kcdn/multi-upload');

async function main() {
  // 脱敏：避免 token 落入终端日志
  const originalLog = console.log;
  console.log = (...args) => originalLog(...args.map(value =>
    typeof value === 'string' ? value.replace(/("token"\s*:\s*")[^"]+("?)/g, '$1***REDACTED***$2') : value
  ));
  const upload = new Upload({
    pid:   PID,
    token: token,
    cdnDir: CDN_DIR,
    files: files,
    uid: 'wangzhuofan',
    allowRewrite: true,
  });

  console.log(`⬆️  上传 ${files.length} 个文件 → ${CDN_DIR}/`);
  const urls = await upload.start();
  console.log('');
  console.log('✅ 上传成功！CDN URL：');
  urls.forEach(u => console.log(`   ${u}`));
}

main().catch(e => {
  console.error('❌ 上传失败：', e.message);
  process.exit(1);
});
