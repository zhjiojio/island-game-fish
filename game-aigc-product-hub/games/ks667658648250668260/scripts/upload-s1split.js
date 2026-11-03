// scripts/upload-s1split.js · 上传 S1 拆分片段 + 白日梦分支舞蹈视频到本项目 CDN 根目录
// 用法: node scripts/upload-s1split.js work/s1split/S1a.dream.mp4 ...
const path = require('path');
const Upload = require('/Users/fat/weihunqi/node_modules/@kcdn/multi-upload');

const files = process.argv.slice(2).map(f => path.resolve(f));
if (!files.length) { console.error('no files'); process.exit(1); }

const up = new Upload({
  pid: 'KS-GAME',
  token: '14_da7d82d193d14fc536c0a1ce0cc0c2e9',
  cdnDir: 'AIGC-SoGame/ks667658648250668260',
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
