const fs = require('fs');
const vm = require('vm');
const assert = require('assert/strict');
const path = require('path');
const root = path.resolve(__dirname, '../..');
const chapters = JSON.parse(fs.readFileSync(path.join(root, 'content/meta.json'))).meta.homeChapters;
const source = fs.readFileSync(path.join(root, 'package/js/chapter-home.js'), 'utf8');
const storage = {}, entries = [], labels = [];
let reward, cancel, adCalls = 0;
const context = {
  window: {}, Image: class { set src(value) {} },
  localStorage: { getItem: key => storage[key], setItem: (key, value) => storage[key] = value },
  KwaiAd: { showRewarded: (ok, fail) => { reward = ok; cancel = fail; adCalls++; } },
  setTimeout, clearTimeout
};
vm.runInNewContext(source, context);
const drawing = new Proxy({ measureText: s => ({ width: s.length * 8 }), createLinearGradient: () => ({ addColorStop() {} }), fillText: (text, x, y) => labels.push({ text, x, y }) }, { get: (o, k) => o[k] || (() => {}) });
function home(saved) {
  const h = context.window.ChapterHome.create({ ctx: drawing, width: 393, height: 852, chapters, render() {}, onPrivacy() {}, onBusy() {}, onEnter: (chapter, saved) => entries.push({ chapter, saved }) });
  if (saved) h.record(saved);
  h.show(); h.draw(); return h;
}
function drawLabels(h) { labels.length = 0; h.draw(); return labels; }
let h = home();
assert.equal(chapters.length, 9);
for (const c of chapters) {
  const nodes = JSON.parse(fs.readFileSync(path.join(root, 'content/episodes', c.id + '.json')));
  assert(nodes[c.start], c.id + ' entry exists');
  assert(fs.existsSync(path.join(root, 'package', c.poster)), c.id + ' image exists');
}
assert(h.isUnlocked('EP01'));
assert(!h.isUnlocked('EP02'));
h.select('EP01'); assert.equal(entries.pop().chapter.start, 'op1'); assert.equal(adCalls, 0);
h.show(); h.select('EP02'); h.select('EP02'); assert.equal(adCalls, 1);
cancel(); assert(!h.isUnlocked('EP02')); assert.equal(entries.length, 0);
reward(); assert(!h.isUnlocked('EP02'), 'late reward after cancel is ignored');
h.select('EP02'); reward(); reward(); cancel();
assert(h.isUnlocked('EP02')); assert.equal(entries.length, 1); assert.equal(entries.pop().chapter.start, 'f_s6');
h = home(); assert(h.isUnlocked('EP02'), 'unlock survives reload');
const saved = { ep: 'EP02', curId: 'f_e2_haggle', stats: { wei: 0, qing: 60, liang: 10 } };
h.record(saved);
h = home(saved); h.select('EP02'); assert.equal(entries.pop().saved.curId, 'f_e2_haggle');
h.show();
assert.equal(drawLabels(h).find(l => l.text === chapters[1].titleLines[0]).y, 175, 'opening home places latest chapter at the top');
h.record({ ep: 'EP01', curId: 's5' }); h.show();
assert.equal(drawLabels(h).filter(l => l.text === '继续剧情').length, 1, 'only the newest chapter offers resume');
assert.equal(labels.filter(l => l.text === '上次看到这里').length, 1, 'only one recent checkpoint marker');
h.select('EP02'); assert.equal(entries.pop().saved, null, 'an older unlocked chapter starts from its beginning');
h.show(); h.select('EP03'); cancel(); h.show();
assert.equal(drawLabels(h).find(l => l.text === chapters[0].titleLines[0]).y, 175, 'cancelling an ad leaves the recent chapter unchanged');
h.select('EP01'); assert.equal(entries.pop().saved.curId, 's5');
h.show(); h.clearProgress();
assert.equal(drawLabels(h).filter(l => l.text === '继续剧情').length, 0, 'clearing global progress removes resume marker');
h.select('EP01'); assert.equal(entries.pop().saved, null);
h.show(); h.draw(); h.touchStart(200, 300); h.touchMove(200, 210); h.touchEnd(200, 210);
assert.equal(entries.length, 0, 'scroll cannot enter a chapter');
h.show(); h.draw(); h.touchStart(200, 180); h.cancelTouch(); h.touchEnd(200, 180); assert.equal(entries.length, 0);
h.select('EP99'); assert.equal(entries.length, 0);
h.select('EP03'); cancel();
console.log('PASS: 9 chapter entries/assets; free entry; reward/cancel/duplicate/reload; one latest checkpoint; automatic focus; older chapter restart; scrolling/cancel; endings excluded');

(async function testAdFailures() {
  let close, error, mode = 'ok', rewards = 0, failures = 0;
  const adContext = {
    window: {}, console: { warn() {} }, setTimeout, clearTimeout,
    KwaiAdConfig: { rewardedAdUnitId: 'test' },
    ks: { createRewardedVideoAd: () => ({
      onClose: cb => close = cb, onError: cb => error = cb,
      show() { if (mode === 'throw') throw new Error('show'); if (mode === 'reject') return Promise.reject(new Error('show')); }
    }) }
  };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'package/api/kwai-ad.js'), 'utf8'), adContext);
  const run = () => adContext.window.KwaiAd.showRewarded(() => rewards++, () => failures++);
  run(); close({ isEnded: false }); assert.equal(rewards, 0); assert.equal(failures, 1);
  run(); close({ isEnded: true }); close({ isEnded: true }); assert.equal(rewards, 1);
  run(); error({ errMsg: 'late error' }); close({ isEnded: true }); assert.equal(rewards, 2); assert.equal(failures, 1);
  run(); error({ errMsg: 'load failed' }); await new Promise(resolve => setTimeout(resolve, 275));
  close({ isEnded: true }); assert.equal(rewards, 2); assert.equal(failures, 2);
  mode = 'throw'; run(); await new Promise(resolve => setTimeout(resolve, 275)); assert.equal(failures, 3);
  mode = 'reject'; run(); await new Promise(resolve => setTimeout(resolve, 275)); assert.equal(failures, 4);
  console.log('PASS: native ad close/cancel/error/throw/rejection callbacks');
})().catch(error => { console.error(error); process.exitCode = 1; });
