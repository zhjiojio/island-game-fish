#!/usr/bin/env node
/**
 * check-scripts-sync.js
 * 检查 index.html 的脚本列表与 main.js 的 require 列表是否一致。
 *
 * 用法：node scripts/check-scripts-sync.js
 */
const fs = require('fs');
const path = require('path');

const PKG = path.join(__dirname, '../package');

// 从 index.html 提取 js/ 开头的脚本（排除 api/ 和 main.js 本身）
const html = fs.readFileSync(path.join(PKG, 'index.html'), 'utf8');
const htmlScripts = [...html.matchAll(/'(js\/[^']+\.js)'/g)]
  .map(m => m[1])
  .filter(s => s !== 'js/main.js' && !s.includes('dev-inspect')); // dev-inspect 仅 H5

// 从 main.js 提取 require('./xxx.js') 的列表
const mainJs = fs.readFileSync(path.join(PKG, 'js/main.js'), 'utf8');
const mainScripts = [...mainJs.matchAll(/require\(['"]\.\/([^'"]+\.js)['"]\)/g)]
  .map(m => 'js/' + m[1]);

const htmlSet = new Set(htmlScripts);
const mainSet = new Set(mainScripts);

const onlyHtml = htmlScripts.filter(s => !mainSet.has(s));
const onlyMain = mainScripts.filter(s => !htmlSet.has(s));

if (onlyHtml.length === 0 && onlyMain.length === 0) {
  console.log('✅ index.html 与 main.js 脚本列表完全一致');
} else {
  if (onlyHtml.length) {
    console.log('⚠️  index.html 有但 main.js 缺少（快手端未加载）:');
    onlyHtml.forEach(s => console.log('   +', s));
  }
  if (onlyMain.length) {
    console.log('⚠️  main.js 有但 index.html 缺少（Web 端未加载）:');
    onlyMain.forEach(s => console.log('   +', s));
  }
  process.exit(1);
}
