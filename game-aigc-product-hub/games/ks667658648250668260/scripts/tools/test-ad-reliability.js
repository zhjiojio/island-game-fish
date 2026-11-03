const fs = require('fs');
const vm = require('vm');
const assert = require('assert/strict');
const source = fs.readFileSync(require('path').resolve(__dirname, '../../package/api/kwai-ad.js'), 'utf8');

function fixture(options = {}) {
  let now = 1000, timerId = 0, shown = 0, created = 0, bypass = false;
  const timers = new Map(), closes = [], errors = [], shows = [], hides = [], deferred = [];
  const outcomes = [];
  const context = {
    console: { log() {}, warn() {} }, Date: { now: () => now },
    setTimeout(fn, delay) { const id = ++timerId; timers.set(id, { fn, at: now + delay }); return id; },
    clearTimeout(id) { timers.delete(id); },
    AdminAdControl: { isBypassed: () => bypass },
    KwaiAdConfig: { rewardedAdUnitId: 'test-ad' },
    ks: {
      onShow: fn => shows.push(fn), onHide: fn => hides.push(fn),
      createRewardedVideoAd() {
        created++;
        if (options.createThrow) throw new Error('create failed');
        return {
          onClose: fn => closes.push(fn), onError: fn => errors.push(fn),
          show() {
            shown++;
            if (options.showThrow) throw new Error('show failed');
            if (options.voidShow) return;
            let resolve, reject;
            const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
            deferred.push({ resolve, reject });
            return promise;
          }
        };
      }
    }
  };
  context.window = context;
  vm.runInNewContext(source, context);
  return {
    ad: context.KwaiAd, outcomes,
    request: (tag = 'first') => context.KwaiAd.showRewarded(() => outcomes.push([tag, 'reward']), error => outcomes.push([tag, error && error.reason])),
    close: isEnded => closes.forEach(fn => fn({ isEnded })),
    error: () => errors.forEach(fn => fn({ errCode: 1001, errMsg: 'late error or no fill' })),
    hide: () => hides.forEach(fn => fn()), show: () => shows.forEach(fn => fn()),
    resolve: async (index = deferred.length - 1) => { deferred[index].resolve(); await Promise.resolve(); },
    reject: async (index = deferred.length - 1) => { deferred[index].reject({ errMsg: 'show rejected' }); await Promise.resolve(); },
    tick(ms) {
      const end = now + ms;
      while (true) {
        const next = [...timers].filter(([, item]) => item.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
        if (!next) break;
        now = next[1].at; timers.delete(next[0]); next[1].fn();
      }
      now = end;
    },
    bypass: value => { bypass = value; },
    get shown() { return shown; }, get created() { return created; },
    get listenerCount() { return { close: closes.length, error: errors.length, show: shows.length, hide: hides.length }; }
  };
}

(async () => {
  let f = fixture();
  f.request(); await f.resolve(); f.error(); f.tick(180000); f.close(true); f.close(true); f.error();
  assert.deepEqual(f.outcomes, [['first', 'reward']], 'shown long ad must wait for close despite late errors');
  assert.equal(f.ad.isRewardedPending(), false);

  f = fixture(); f.request(); f.error(); f.tick(100); await f.resolve(); f.tick(1000); f.close(true);
  assert.deepEqual(f.outcomes, [['first', 'reward']], 'show success supersedes same-turn loading error');

  f = fixture(); f.request(); await f.reject(); f.tick(100); f.close(true); f.tick(1000);
  assert.deepEqual(f.outcomes, [['first', 'reward']], 'real close wins before deferred startup error settles');

  f = fixture(); f.request(); f.error(); await f.reject(); f.tick(250); f.close(true); f.error();
  assert.deepEqual(f.outcomes, [['first', 'show_fail']], 'ordinary failure settles once and cannot reward later');

  for (const value of [false, undefined, null, 1, 'true', 'false']) {
    f = fixture(); f.request(); await f.resolve(); f.close(value); f.close(true);
    assert.deepEqual(f.outcomes, [['first', 'not_finished']], 'only boolean true can earn reward: ' + value);
  }

  f = fixture(); f.request(); f.request('second'); await f.resolve(); f.close(true);
  assert.deepEqual(f.outcomes, [['second', 'busy'], ['first', 'reward']], 'second request cannot steal current callback');
  assert.equal(f.shown, 1);

  f = fixture(); f.request(); f.close(true); f.request('second'); await f.reject(0); f.tick(500); await f.resolve(1); f.close(true);
  assert.deepEqual(f.outcomes, [['first', 'reward'], ['second', 'reward']], 'old show rejection cannot fail next request');
  assert.equal(f.created, 1);
  assert.deepEqual(f.listenerCount, { close: 1, error: 1, show: 1, hide: 1 }, 'singleton SDK and lifecycle listeners');

  f = fixture({ createThrow: true }); f.request();
  assert.deepEqual(f.outcomes, [['first', 'no_ad_instance']]);
  f = fixture({ showThrow: true }); f.request(); f.tick(250);
  assert.deepEqual(f.outcomes, [['first', 'show_throw']]);

  f = fixture(); f.request(); f.tick(30000); f.close(true);
  assert.deepEqual(f.outcomes, [['first', 'timeout']], 'unconfirmed foreground loading must release without reward');

  f = fixture(); f.request(); f.hide(); f.tick(240000); assert.deepEqual(f.outcomes, []);
  f.show(); f.tick(7000); f.close(true); f.tick(2000);
  assert.deepEqual(f.outcomes, [['first', 'reward']], 'time spent in native ad is never a loading timeout');

  f = fixture(); f.request(); await f.resolve(); f.hide(); f.tick(240000); f.show(); f.tick(8000); f.close(true);
  assert.deepEqual(f.outcomes, [['first', 'close_timeout']], 'missing close after return can recover without rewarding');

  f = fixture(); f.request(); await f.resolve(); f.hide(); f.tick(180000); f.show(); f.error(); f.tick(1000); f.close(true);
  assert.deepEqual(f.outcomes, [['first', 'reward']], 'late return error cannot defeat completed native playback');

  f = fixture({ voidShow: true }); f.request(); f.tick(180000); f.close(true);
  assert.deepEqual(f.outcomes, [['first', 'reward']], 'void-returning show still uses explicit close, without arbitrary playback cutoff');
  f = fixture({ voidShow: true }); f.request(); f.error(); f.tick(250);
  assert.deepEqual(f.outcomes, [['first', 'show_fail']], 'void-returning show never rewards on loading failure');

  f = fixture(); f.bypass(true); f.request(); f.request('second');
  assert.deepEqual(f.outcomes, [['second', 'busy']], 'admin bypass remains asynchronous and single-flight');
  f.tick(0); assert.deepEqual(f.outcomes, [['second', 'busy'], ['first', 'reward']]); assert.equal(f.shown, 0);
  f.bypass(false); f.request('third'); await f.resolve(); f.close(true); assert.equal(f.shown, 1);

  f = fixture(); f.bypass(true); f.request(); f.bypass(false); f.tick(0);
  assert.equal(f.shown, 1, 'identity or mode revocation before callback restores SDK');
  f.close(false); assert.deepEqual(f.outcomes, [['first', 'not_finished']]);

  console.log('PASS: 22 SDK timing, strict completion, singleton, concurrency, long playback, failure recovery and admin bypass cases');
})().catch(error => { console.error(error); process.exitCode = 1; });
