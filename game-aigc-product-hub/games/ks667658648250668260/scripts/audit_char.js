#!/usr/bin/env node
// scripts/audit_char.js
// 扫 story.js 所有节点，报告 char/speaker 不匹配
// 规则：
//   1. char 必须是 CHAR_KEYS 之一（否则报 UNKNOWN_CHAR）
//   2. speaker 前缀应该和 char 匹配（否则报 MISMATCH）
//   3. text 里首句 "XX说：" 或 "XX：" 前缀应该和 char 一致（否则报 TEXT_MISMATCH）

var path = require('path');
var fs = require('fs');
global.window = global;
var storyCode = fs.readFileSync(path.resolve(__dirname, '../js/story.js'), 'utf8');
eval(storyCode);
var NODES = (window.STORY && window.STORY.nodes) || {};

// charInfo 已定义 key（从 main-v42.js 提取）
var CHAR_KEYS = ['aotian','wanerh','waner','narrator','system','vendor','zhao','shopwoman','laohan','wangpo','villager','fuzhuren','dreammj'];

// speaker 前缀 → 期望 char
var SPEAKER_TO_CHAR = [
  { re: /^傲天/, char: 'aotian' },
  { re: /^(沈婉儿|婉儿|嫂子)/, char: 'wanerh' },
  { re: /^(旁白|说书人|说书大爷)/, char: 'narrator' },
  { re: /^(粮贩|贩子|收粮)/, char: 'vendor' },
  { re: /^赵铁牛/, char: 'zhao' },
  { re: /^(布铺老板娘|老板娘)/, char: 'shopwoman' },
  { re: /^李老憨/, char: 'laohan' },
  { re: /^王婆/, char: 'wangpo' },
  { re: /^(村民|老李头|张大爷|大爷|大娘)/, char: 'villager' },
  { re: /^(副主任|马副乡长)/, char: 'fuzhuren' },
  { re: /^系统/, char: 'system' }
];

// text 首行明确说话人标记 → 期望 char（只匹配 "XX：" 或 "XX说：" 这种强标记）
var TEXT_HINT_TO_CHAR = [
  { re: /^(沈婉儿|婉儿)[（(]?[^）)]{0,10}[）)]?[:：]/, char: 'wanerh', hint: '婉儿：直述' },
  { re: /^(老板娘|布铺老板娘)[（(]?[^）)]{0,10}[）)]?[:：]/, char: 'shopwoman', hint: '老板娘：直述' },
  { re: /^(赵铁牛)[（(]?[^）)]{0,10}[）)]?[:：]/, char: 'zhao', hint: '赵铁牛：直述' },
  { re: /^(粮贩子)[（(]?[^）)]{0,10}[）)]?[:：]/, char: 'vendor', hint: '粮贩子：直述' },
  { re: /^(李老憨)[（(]?[^）)]{0,10}[）)]?[:：]/, char: 'laohan', hint: '李老憨：直述' },
  { re: /^(王婆)[（(]?[^）)]{0,10}[）)]?[:：]/, char: 'wangpo', hint: '王婆：直述' },
  { re: /^(村民|大爷|大娘)[（(]?[^）)]{0,10}[）)]?[:：]/, char: 'villager', hint: '村民：直述' },
  { re: /^(副主任|马副乡长)[（(]?[^）)]{0,10}[）)]?[:：]/, char: 'fuzhuren', hint: '副主任：直述' }
];

var issues = { unknown_char:[], missing_char:[], speaker_char_mismatch:[], text_hint_mismatch:[] };

for (var id in NODES) {
  var n = NODES[id];
  if (!n) continue;
  if (n.type === 'meta') continue;

  var ch = n.char;
  var sp = n.speaker || '';
  var tx = n.text || '';

  // Rule 1: char 未定义（choice 节点、纯图节点可能没有 char，跳过）
  if (!ch) {
    // 但如果有 text 且不是 choice/system 节点，应该提示
    if (tx && n.type !== 'choice' && !n.stay) {
      issues.missing_char.push({ id: id, sp: sp, txPreview: tx.slice(0, 40) });
    }
    continue;
  }

  // Rule 2: char 必须在合法清单
  if (CHAR_KEYS.indexOf(ch) < 0) {
    issues.unknown_char.push({ id: id, char: ch, sp: sp });
    continue;
  }

  // Rule 3: speaker 前缀 vs char
  if (sp) {
    for (var i = 0; i < SPEAKER_TO_CHAR.length; i++) {
      var rule = SPEAKER_TO_CHAR[i];
      if (rule.re.test(sp)) {
        var expect = rule.char;
        // waner / wanerh 视为等价
        var chNorm = (ch === 'waner') ? 'wanerh' : ch;
        var expNorm = (expect === 'waner') ? 'wanerh' : expect;
        if (chNorm !== expNorm) {
          issues.speaker_char_mismatch.push({ id: id, char: ch, speaker: sp, expected: expect });
        }
        break;
      }
    }
  }

  // Rule 4: text 特征词 vs char（仅在 char=aotian 且 speaker 无明确其他角色时触发，避免 narrator 描写婉儿的误报）
  if (tx && tx.length > 4 && ch === 'aotian') {
    // 检查 speaker 是否已指向其他非 aotian 角色（如"粮贩子"、"赵铁牛"）
    var speakerHasOtherRole = false;
    for (var si = 0; si < SPEAKER_TO_CHAR.length; si++) {
      if (SPEAKER_TO_CHAR[si].re.test(sp) && SPEAKER_TO_CHAR[si].char !== 'aotian') {
        speakerHasOtherRole = true; break;
      }
    }
    if (!speakerHasOtherRole) {
      for (var j = 0; j < TEXT_HINT_TO_CHAR.length; j++) {
        var h = TEXT_HINT_TO_CHAR[j];
        if (h.re.test(tx.slice(0, 60))) {
          issues.text_hint_mismatch.push({ id: id, char: ch, hint: h.hint, expected: h.char, txPreview: tx.slice(0, 50) });
          break;
        }
      }
    }
  }
}

function print(title, arr) {
  console.log('\n=== ' + title + ' (' + arr.length + ') ===');
  arr.forEach(function(x){
    console.log('  ' + JSON.stringify(x));
  });
}

print('UNKNOWN_CHAR (char 不在 charInfo)', issues.unknown_char);
print('MISSING_CHAR (有 text 但无 char)', issues.missing_char);
print('SPEAKER_CHAR_MISMATCH (speaker 前缀和 char 不匹配)', issues.speaker_char_mismatch);
print('TEXT_HINT_MISMATCH (text 特征词和 char 不匹配)', issues.text_hint_mismatch);

var total = issues.unknown_char.length + issues.speaker_char_mismatch.length + issues.text_hint_mismatch.length;
console.log('\n---\n总计致命问题：' + total + '（missing_char 是提示不算致命）');
process.exit(total > 0 ? 1 : 0);
