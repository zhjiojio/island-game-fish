// scripts/upload-be-audio.js · 上传 BE 说书人 mp3 到 CDN audio/be/
// 用法: node scripts/upload-be-audio.js work/be_audio/a.mp3 work/be_audio/b.mp3 ...
const path = require('path');
const MOD = '/Users/fat/weihunqi/node_modules/@kcdn/multi-upload';
const Upload = require(MOD);

const files = process.argv.slice(2).map(f => path.resolve(f));
if (!files.length) { console.error('no files'); process.exit(1); }

const up = new Upload({
  pid: 'KS-GAME',
  token: '14_da7d82d193d14fc536c0a1ce0cc0c2e9',
  cdnDir: 'AIGC-SoGame/ks712131693858878897/audio/be',
  files,
  uid: 'lihui26',
  allowRewrite: 'true',
});

up.start().then(r => {
  console.log('UPLOAD RESULT:', JSON.stringify(r, null, 2));
}).catch(e => {
  console.error('UPLOAD ERR:', e && (e.stack || e.message || e));
  process.exit(1);
});
