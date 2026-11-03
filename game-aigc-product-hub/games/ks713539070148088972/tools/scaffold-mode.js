#!/usr/bin/env node
/**
 * tools/scaffold-mode.js — 一键生成新玩法模式骨架
 *
 * 用途：
 *   新增一种玩法（如"拼图找茬""连连看"）时，避免手写 3 处样板改动
 *   （新建 mode 文件 + 注册到 CONFIG.GAMEPLAY_MODES + 挂 <script>/require），
 *   由本脚本自动生成 + 自动插入，只需人工填充 draw() 里的具体绘制逻辑。
 *
 * 用法：
 *   node tools/scaffold-mode.js <modeId> <显示名称> [setupSec]
 *
 * 示例：
 *   node tools/scaffold-mode.js puzzle 拼图找茬 8
 *
 * 会做的事：
 *   1. 生成 js/play/modes/<modeId>.js（继承 BaseMode 的最小骨架，含 TODO 注释）
 *   2. 在 js/core/config.js 的 GAMEPLAY_MODES 里插入一条注册项
 *   3. 在 js/main.js 的 require 列表里插入一行（H5 浏览器环境走 <script>，不受影响）
 *   4. 在 index.html 的 <script> 列表里插入一行
 *
 * 注意：
 *   - 本脚本只做"新增插入"，不会覆盖已存在的同名 mode（会报错退出，防止误覆盖）
 *   - 插入位置均以固定锚点字符串定位（hud.js 前），若这些文件的结构被大幅
 *     改动导致锚点消失，脚本会报错提示手动处理，不会静默失败
 */
'use strict';

var fs   = require('fs');
var path = require('path');

var ROOT = path.resolve(__dirname, '..');

function fail(msg) {
  console.error('[scaffold-mode] ERROR: ' + msg);
  process.exit(1);
}

function main() {
  var argv = process.argv.slice(2);
  var modeId   = argv[0];
  var name     = argv[1];
  var setupSec = argv[2] !== undefined ? Number(argv[2]) : 8;

  if (!modeId || !name) {
    console.log('用法: node tools/scaffold-mode.js <modeId> <显示名称> [setupSec]');
    console.log('示例: node tools/scaffold-mode.js puzzle 拼图找茬 8');
    process.exit(1);
  }
  if (!/^[a-z][a-zA-Z0-9]*$/.test(modeId)) {
    fail('modeId 必须是合法 JS 标识符风格（小写开头，字母数字），当前: ' + modeId);
  }

  var className  = modeId.charAt(0).toUpperCase() + modeId.slice(1) + 'Mode';
  var modeFile   = path.join(ROOT, 'js/play/modes', modeId + '.js');
  var configFile = path.join(ROOT, 'js/core/config.js');
  var mainFile   = path.join(ROOT, 'js/main.js');
  var htmlFile   = path.join(ROOT, 'index.html');

  if (fs.existsSync(modeFile)) {
    fail('js/play/modes/' + modeId + '.js 已存在，为避免覆盖已有实现，脚本已中止。');
  }

  // ── 1. 生成 mode 文件 ──────────────────────────────────────────────────────
  var modeTpl = [
    '/**',
    ' * play/modes/' + modeId + '.js — ' + name + ' 模式',
    ' * 职责：',
    ' *   - TODO: 描述本玩法的核心交互（单图/多图、命中判定方式等）',
    ' *   - 未覆盖的方法均复用 BaseMode 默认实现（见 base-mode.js 顶部注释）',
    ' * 依赖：BaseMode, Renderer, CONFIG, M3',
    ' */',
    '(function () {',
    '  \'use strict\';',
    '',
    '  function ' + className + '(level, theme) {',
    '    BaseMode.call(this, level, theme);',
    '    // TODO: 若需要额外字段（如多图 fit / 特殊状态），在此初始化',
    '  }',
    '  BaseMode.extend(' + className + ');',
    '',
    '  ' + className + '.prototype.draw = function (state) {',
    '    var level = this.level;',
    '    if (!level.scene) return;',
    '',
    '    var W        = M3.Layout.w;',
    '    var safeTop  = M3.Layout.safeTop;',
    '    var hudH     = CONFIG.HUD_H + CONFIG.STATUS_H;',
    '    var toolbarH = CONFIG.TOOLBAR_H;',
    '    var stageY   = safeTop + hudH;',
    '    var stageH   = M3.Layout.h - stageY - toolbarH;',
    '',
    '    var fit = this._calcFit(level.scene, 0, stageY, W, stageH);',
    '    this._fit = fit;',
    '    if (fit) {',
    '      Renderer.drawImage(level.scene, fit.x, fit.y, fit.w, fit.h);',
    '    } else {',
    '      Renderer.drawRoundRect(10, stageY + 10, W - 20, stageH - 20, 8, { fill: \'#1a2a3a\' });',
    '      Renderer.drawText(\'图片加载中…\', W/2, stageY + stageH/2, { fontSize: 16, color: \'#888\', align: \'center\' });',
    '    }',
    '',
    '    // TODO: 若命中判定/命中反馈不同于默认（单图 contain + 中心收缩矩形判定），',
    '    // 覆盖 hitTest(cx, cy, hits) / onCorrect(oddIdx, cx, cy)，参考 spot.js / story.js',
    '',
    '    this._drawMarks();',
    '    this._drawHintMask(state, fit);',
    '    this._drawNarrative();',
    '  };',
    '',
    '  // 注册到 ModeRegistry（在 mode-registry.js 加载后执行）',
    '  if (typeof ModeRegistry !== \'undefined\') {',
    '    ModeRegistry.register(\'' + modeId + '\', ' + className + ');',
    '  }',
    '})();',
    ''
  ].join('\n');

  fs.writeFileSync(modeFile, modeTpl, 'utf8');
  console.log('✔ 已生成 ' + relPath(modeFile));

  // ── 2. 注册到 CONFIG.GAMEPLAY_MODES ─────────────────────────────────────────
  insertBeforeAnchor(
    configFile,
    /(\n\s*story:\s*\{[^}]*\}\s*\n)(\s*\},)/,
    function (m, storyLine, closeBrace) {
      var newLine = '      ' + modeId + ': { id: \'' + modeId + '\', name: \'' + name +
        '\', setupSec: ' + setupSec + ', module: \'' + className + '\'  }';
      // story 行末尾没有逗号，需补上再插入新行
      var fixedStoryLine = storyLine.replace(/(\})(\s*\n)$/, '$1,$2');
      return fixedStoryLine + newLine + '\n' + closeBrace;
    },
    'js/core/config.js 里的 CONFIG.GAMEPLAY_MODES（story 项后）'
  );

  // ── 3. main.js require 列表（在 hud.js 前插入）───────────────────────────────
  insertLineBefore(
    mainFile,
    "    require('./play/hud/hud.js');",
    "    require('./play/modes/" + modeId + ".js');",
    'js/main.js 的 require 列表（hud.js 前）'
  );

  // ── 4. index.html <script> 列表（在 hud.js 前插入）───────────────────────────
  insertLineBefore(
    htmlFile,
    '<script src="js/play/hud/hud.js',
    '<script src="js/play/modes/' + modeId + '.js?v=2"></script>',
    'index.html 的 <script> 列表（hud.js 前）'
  );

  console.log('');
  console.log('完成。接下来手动做的事：');
  console.log('  1. 打开 ' + relPath(modeFile) + '，实现具体玩法交互（draw/hitTest/onCorrect 等）');
  console.log('  2. 若玩法需要新的关卡数据字段，更新 js/data/mock-levels-config.js 加样例关卡联调');
  console.log('  3. 若无自定义命中判定，BaseMode 默认实现（单图 contain + 矩形命中）已可直接跑通');
}

function relPath(p) {
  return path.relative(ROOT, p);
}

/** 用正则匹配锚点并替换插入内容；未匹配到锚点则报错退出（不静默失败） */
function insertBeforeAnchor(file, anchorRegex, replacer, desc) {
  var content = fs.readFileSync(file, 'utf8');
  if (!anchorRegex.test(content)) {
    fail('未找到锚点：' + desc + '。请手动编辑 ' + relPath(file));
  }
  var updated = content.replace(anchorRegex, replacer);
  fs.writeFileSync(file, updated, 'utf8');
  console.log('✔ 已更新 ' + relPath(file) + '（' + desc + '）');
}

/** 在包含 anchorSubstr 的那一行之前插入 newLine（保持缩进/换行风格） */
function insertLineBefore(file, anchorSubstr, newLine, desc) {
  var content = fs.readFileSync(file, 'utf8');
  var lines = content.split('\n');
  var idx = lines.findIndex(function (l) { return l.indexOf(anchorSubstr) >= 0; });
  if (idx === -1) {
    fail('未找到锚点行 "' + anchorSubstr + '"：' + desc + '。请手动编辑 ' + relPath(file));
  }
  // 保持与锚点行相同的前导缩进
  var indentMatch = lines[idx].match(/^(\s*)/);
  var indent = indentMatch ? indentMatch[1] : '';
  var lineToInsert = newLine.indexOf(indent) === 0 ? newLine : indent + newLine.replace(/^\s*/, '');
  lines.splice(idx, 0, lineToInsert);
  fs.writeFileSync(file, lines.join('\n'), 'utf8');
  console.log('✔ 已更新 ' + relPath(file) + '（' + desc + '）');
}

main();
