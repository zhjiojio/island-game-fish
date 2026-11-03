#!/usr/bin/env node
/**
 * 法务黑词校验 · 每次 build/preview 前跑一遍
 * 扫描 package/js/**.js 中的中文文案，命中黑词返回 exitCode=1
 *
 * 黑词分类（法务 2026-08-04 评审沉淀）：
 *   L1 品牌硬 logo：苹果/iPhone/AirPods/星巴克/大白兔/特斯拉/天猫精灵/labulu/jellycat/小米/MI-EV/NBA/勒布朗/詹姆斯/梅西
 *   L2 体育知产：NBA/奥运（五环/名称）/CBA
 *   L3 政治敏感：抗战/党刊/东北日报/为人民服务/女知青/供销社
 *   L4 时间/年代不一致：主题"重回80年代" 内不得出现 "90年代"
 *   L5 文案 bug：微梗 (作为多字/多余字)
 *
 * 替代方案（保留辨识度但不触雷）：
 *   詹姆斯/勒布朗 → "03届状元"  梅西 → "阿根廷10号"  奥运 → "五环大赛"
 *   苹果手机 → "触屏智能手机"  星巴克 → "连锁咖啡纸杯"  特斯拉 → "新能源车"
 *   小米 → "国产电车"  东北日报 → "日期头条"  供销社 → "老柜台"
 *   女知青 → "女青年"  为人民服务 → 剔除
 */
const fs = require('fs');
const path = require('path');

const BLACKLIST = [
  // L1 品牌
  { p: /苹果(?!派|醋|树)/g, hint: '品牌 → 触屏智能/水果' },
  { p: /iPhone/gi, hint: 'iPhone → 触屏智能手机' },
  { p: /AirPods/gi, hint: 'AirPods → 无线蓝牙耳机' },
  { p: /星巴克/g, hint: '星巴克 → 连锁咖啡' },
  { p: /大白兔/g, hint: '大白兔 → 老式奶糖' },
  { p: /特斯拉/g, hint: '特斯拉 → 新能源车' },
  { p: /天猫精灵/g, hint: '天猫精灵 → 智能音箱' },
  { p: /labulu/gi, hint: 'labulu → 潮玩公仔' },
  { p: /jellycat/gi, hint: 'jellycat → 毛绒公仔' },
  { p: /小米(?!粥|饭|汤)/g, hint: '小米 → 国产电车/手机' },
  { p: /MI-EV/gi, hint: 'MI-EV → 国产电车车标' },
  // L2 体育
  { p: /NBA/gi, hint: 'NBA → 顶级篮球联赛' },
  { p: /勒布朗/g, hint: '勒布朗 → 03届状元' },
  { p: /詹姆斯/g, hint: '詹姆斯 → 03届状元' },
  { p: /梅西/g, hint: '梅西 → 阿根廷10号' },
  { p: /奥运(?!\S*(五环|大赛))/g, hint: '奥运 → 五环大赛（如已带"五环大赛"则忽略）' },
  // L3 政治
  { p: /抗战/g, hint: '抗战 → 老年代（避政治敏感）' },
  { p: /党刊/g, hint: '党刊 → 老期刊' },
  { p: /东北日报/g, hint: '东北日报 → 日期头条' },
  { p: /为人民服务/g, hint: '为人民服务 → 剔除' },
  { p: /女知青/g, hint: '女知青 → 女青年' },
  { p: /供销社/g, hint: '供销社 → 老柜台' },
  { p: /上海滩/g, hint: '上海滩(剧名) → 老电视剧' },
  { p: /大众电影/g, hint: '大众电影(刊名) → 老杂志' },
  // L4 时间不一致
  { p: /90年代/g, hint: '主题定档 80 年代，不得出现 90 年代' },
  // L5 文案 bug
  { p: /微梗/g, hint: '"微梗"是策划多打的字，删掉' },
];

function scan(file){
  const content = fs.readFileSync(file, 'utf8');
  const hits = [];
  // ⭐ 只扫描"用户可见文案字段"：name/title/hint/subject/short/full/tapeLabel/label 的字符串值
  //   代码里的 key/tag/prop 内部 id（如 iphone:{}、tag:'iphone'）用户看不见，放行
  const VISIBLE_FIELD = /(?:name|title|hint|subject|short|full|tapeLabel|label|desc|text)\s*:\s*['"`]([^'"`\n]{0,200})['"`]/g;
  let fm;
  while ((fm = VISIBLE_FIELD.exec(content)) !== null){
    const val = fm[1];
    const valStart = fm.index + fm[0].indexOf(val);
    BLACKLIST.forEach(({p, hint}) => {
      let m; p.lastIndex = 0;
      while ((m = p.exec(val)) !== null){
        const absPos = valStart + m.index;
        const before = content.slice(0, absPos);
        const line = before.split('\n').length;
        const lineStart = before.lastIndexOf('\n')+1;
        const lineEnd = content.indexOf('\n', absPos);
        const lineText = content.slice(lineStart, lineEnd===-1?content.length:lineEnd).trim();
        hits.push({ file, line, word: m[0], hint, lineText });
        if (!p.global) break;
      }
    });
  }
  return hits;
}

const jsDir = path.join(__dirname, '..', 'package', 'js');
const files = fs.readdirSync(jsDir).filter(f => f.endsWith('.js')).map(f => path.join(jsDir, f));

let total = 0;
files.forEach(f => {
  const hits = scan(f);
  if (hits.length){
    console.log(`\n❌ ${path.relative(process.cwd(), f)}  (${hits.length} hits)`);
    hits.forEach(h => {
      console.log(`   L${h.line}  「${h.word}」  → ${h.hint}`);
      console.log(`         ${h.lineText.slice(0,120)}`);
    });
    total += hits.length;
  }
});

if (total === 0){
  console.log('✅ 法务黑词校验通过：0 个命中');
  process.exit(0);
} else {
  console.log(`\n💀 共 ${total} 处法务风险，请修复后再 build。`);
  process.exit(1);
}
