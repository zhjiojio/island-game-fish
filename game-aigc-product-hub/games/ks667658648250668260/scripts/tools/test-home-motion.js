const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert/strict');
const root = path.resolve(__dirname, '../..');
const chapters = JSON.parse(fs.readFileSync(path.join(root, 'content/meta.json'))).meta.homeChapters;
const source = fs.readFileSync(path.join(root, 'package/js/chapter-home.js'), 'utf8');
const width = 393, height = 852, top = 24 + 118, bottom = height - 12 - 86;
const rowH = Math.max(132, Math.min(162, Math.round(Math.min(width - 32, 520) * 0.42)));
const rowStep = rowH + 18;
const maxScroll = chapters.length * rowStep - 18 - (bottom - top);

function fixture(reducedMotion = false) {
  let now = 1000, entered = 0, renders = 0;
  const requested = [], rows = [];
  const context = {
    window: {}, Date, setTimeout, clearTimeout,
    Image: class { set src(value) { requested.push(value); this.width = 720; this.height = 310; } },
    localStorage: { getItem() { return null; }, setItem() {} }
  };
  vm.runInNewContext(source, context);
  const ctx = new Proxy({
    measureText: s => ({ width: s.length * 8 }), createLinearGradient: () => ({ addColorStop() {} }),
    fillText: (s, x, y) => {
      const index = chapters.findIndex(c => s === (c.titleLines || [c.title])[0]);
      if (index >= 0) rows.push({ index, y });
    }
  }, { get: (o, k) => o[k] || (() => {}) });
  const home = context.window.ChapterHome.create({
    chapters, ctx, width, height, reducedMotion, now: () => now,
    render: () => renders++, onPrivacy() {}, onBusy() {}, onEnter: () => entered++
  });
  function tick(dt = 16) { now += dt; if (home.update(now)) home.draw(); }
  function position() {
    rows.length = 0; home.draw();
    assert(rows.length, 'at least one chapter is visible');
    const row = rows[0];
    return top + row.index * rowStep + 33 - row.y;
  }
  function move(x, y, dt = 16) { now += dt; home.touchMove(x, y); if (home.update(now)) home.draw(); }
  function pause(dt) { now += dt; }
  home.show(); home.draw();
  return { home, tick, position, move, pause, requested, get entered() { return entered; }, get renders() { return renders; } };
}

let f = fixture();
assert(f.requested.includes(chapters[4].poster), 'preload the next offscreen cover');
f.home.touchStart(200, 280); f.move(200, 277); f.move(200, 260);
assert.equal(f.position(), 20, 'drag includes movement before the activation threshold');
f.move(200, 240); assert.equal(f.position(), 40, 'drag follows the full finger displacement');
f.move(200, 245); assert.equal(f.position(), 35, 'in-range reversal is immediately one-to-one');
f.home.touchEnd(200, 245);
const release = f.position(); f.tick(32);
assert(f.position() < release, 'release inertia follows the last drag direction');
assert.equal(f.entered, 0, 'drag never activates a chapter');
assert.equal(f.renders, 0, 'input events do not synchronously render');
f.home.touchStart(200, 230); f.home.touchEnd(200, 230); f.tick();
const stopped = f.position(); f.tick(100);
assert.equal(f.position(), stopped, 'touch brakes inertia');
assert.equal(f.entered, 0, 'braking touch cannot select');
f.home.touchStart(200, 230); f.home.touchEnd(200, 230);
assert.equal(f.entered, 1, 'a subsequent deliberate tap selects normally');

f = fixture();
f.home.touchStart(200, 220); f.move(200, 255);
assert.equal(f.position(), 0, 'top edge never stretches');
f.move(200, 355); assert.equal(f.position(), 0, 'continued outward drag stays at top');
f.move(200, 350); assert.equal(f.position(), 5, 'reversing at top moves immediately');
f.move(200, 380); assert.equal(f.position(), 0, 'returning to top clamps exactly');
f.home.touchEnd(200, 380); f.tick(50); assert.equal(f.position(), 0, 'outward velocity stops at top');
f.home.show(chapters[chapters.length - 1].id);
assert.equal(f.position(), maxScroll, 'last chapter aligns with the bottom of the viewport');
f.home.touchStart(200, 300); f.move(200, 180);
assert.equal(f.position(), maxScroll, 'bottom edge never stretches');
f.move(200, 185); assert.equal(f.position(), maxScroll - 5, 'reversing at bottom moves immediately');
f.move(200, 150); f.home.touchEnd(200, 150); f.tick(50);
assert.equal(f.position(), maxScroll, 'outward velocity stops at bottom');

for (const frames of [[16], [32], [50], [16, 50, 9, 32, 80, 17]]) {
  for (const direction of [-1, 1]) {
    f = fixture(); f.home.show(chapters[direction < 0 ? 1 : 4].id);
    f.home.touchStart(200, 300); f.move(200, 300 - direction * 80); f.home.touchEnd(200, 300 - direction * 80);
    let previous = f.position();
    for (let i = 0; i < 100; i++) {
      f.tick(frames[i % frames.length]);
      const next = f.position();
      assert(next >= 0 && next <= maxScroll, `no overshoot at ${frames}ms`);
      assert(direction * (next - previous) >= 0, `no oscillation or direction reversal at ${frames}ms`);
      previous = next;
    }
    assert.equal(previous, direction < 0 ? 0 : maxScroll, `reach the exact edge at ${frames}ms`);
    assert.equal(f.home.update(100000), direction < 0, 'only the visible current button keeps animating after scroll settles');
  }
}

const releasePositions = [];
for (const frames of [[16], [32], [50], [16, 50, 9, 32, 80, 17]]) {
  f = fixture(); f.home.show(chapters[2].id);
  f.home.touchStart(200, 300); f.move(200, 290, 32); f.home.touchEnd(200, 290);
  let elapsed = 0, i = 0;
  while (elapsed < 400) {
    const dt = Math.min(400 - elapsed, frames[i++ % frames.length]);
    f.tick(dt); elapsed += dt;
  }
  releasePositions.push(f.position());
}
assert(Math.max(...releasePositions) - Math.min(...releasePositions) < 0.001, 'inertia displacement is independent of frame rate');

f = fixture(); f.home.wheel(150); f.tick();
const first = f.position(); f.tick(); assert(f.position() > first, 'wheel movement is eased');
f.home.cancelTouch(); const cancelled = f.position(); f.tick(32); assert.equal(f.position(), cancelled);
f.home.wheel(-10000); for (let i = 0; i < 60; i++) f.tick(50);
assert.equal(f.position(), 0, 'wheel reaches exact top');
f.home.wheel(10000); for (let i = 0; i < 60; i++) f.tick(50);
assert.equal(f.position(), maxScroll, 'wheel reaches exact bottom');

f = fixture(); f.home.touchStart(200, 280); f.move(200, 260); f.pause(120); f.home.touchEnd(200, 260);
const held = f.position(); f.tick(50); assert.equal(f.position(), held, 'holding before release suppresses stale velocity');
f = fixture(true);
f.home.touchStart(200, 280); f.move(200, 260); f.home.touchEnd(200, 260);
const reduced = f.position(); f.tick(32); assert.equal(f.position(), reduced, 'reduced motion disables inertia');
f.home.wheel(-1000); f.tick(); assert.equal(f.position(), 0, 'reduced motion clamps immediately');
console.log('PASS: one-to-one drag, edge reversal, 16/32/50ms and variable-frame inertia, exact boundaries, brake without selection, frame batching, adjacent preload, idle, wheel, cancel, reduced motion');
