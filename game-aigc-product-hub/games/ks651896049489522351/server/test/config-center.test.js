// 配置中心单元测试：派生值必须与迁移前的硬编码基线完全一致（回归锁定），
// 红线校验覆盖 checklist「保存校验红线」的 7 条。
const test = require('node:test');
const assert = require('node:assert');
const { deriveEffective, validateMaster, DEFAULT_MASTER } = require('../persistence/config-store');

function defaultMaster () {
  return Object.fromEntries(Object.keys(DEFAULT_MASTER).map(k => [k, DEFAULT_MASTER[k].value]));
}

test('派生：场次数值与迁移前硬编码基线一致', () => {
  const { tiers } = deriveEffective(defaultMaster());
  assert.deepStrictEqual(tiers.junior, {
    type: 'junior', name: '初级场', baseBet: 100, entryFeeBeans: 50, freezeBeans: 400,
    freezeEnabled: true, minBeansToMatch: 500, minBeansToStart: 500, minBeansToReady: 500,
    maxMultiplier: 32, taxRate: 0.05, botMaxMultiplier: 32, matchAssetRange: 0.3,
  });
  assert.strictEqual(tiers.mid.freezeBeans, 8000);
  assert.strictEqual(tiers.mid.minBeansToMatch, 50000);
  assert.strictEqual(tiers.master.baseBet, 6400);
  assert.strictEqual(tiers.master.maxMultiplier, 1000);
});

test('派生：ECONOMY 形状与迁移前基线一致', () => {
  const { economy } = deriveEffective(defaultMaster());
  assert.strictEqual(economy.newUserBeans, 20000);
  assert.strictEqual(economy.newcomerGiftBeans, 10000);
  assert.strictEqual(economy.dailyLoginBeans, 1000);
  assert.strictEqual(economy.shareRewardBeans, 2000);
  assert.strictEqual(economy.shortcutRewardBeans, 5000);
  assert.strictEqual(economy.bankruptRewardBeans, 30000);
  assert.strictEqual(economy.bankruptThresholdBeans, 5000);
  assert.strictEqual(economy.exchangeRate, 10000);
  assert.strictEqual(economy.minBeansToEnterRoom, 5000);
  assert.strictEqual(economy.disconnectGraceMs, 30000);
  assert.deepStrictEqual(economy.adRewardTiers, [{ from: 1, to: 999, amount: 1000 }]);
});

test('派生：广告日封顶 = 单次奖励 × 次数上限（红线4 由构造满足）', () => {
  const m = defaultMaster();
  const { derived, economy } = deriveEffective(m);
  assert.strictEqual(derived.adDailyCapBeans, 20000);
  assert.strictEqual(economy.adRewardDailyCapBeans, derived.adDailyCapBeans);
});

test('默认配置通过全部红线校验', () => {
  assert.deepStrictEqual(validateMaster(defaultMaster()), []);
});

test('红线1：验资门槛低于台费+冻结额被拦截', () => {
  const m = defaultMaster();
  m['tier.junior.quota_multiplier'] = 0.5;   // 500 → 200 < 450
  const v = validateMaster(m);
  assert.ok(v.some(x => x.includes('tier.junior')), v.join(';'));
});

test('红线2：破产补助低于初级场台费+冻结额被拦截', () => {
  const m = defaultMaster();
  m['economy.bankrupt_reward_beans'] = 100;
  const v = validateMaster(m);
  assert.ok(v.some(x => x.includes('bankrupt_reward_beans')), v.join(';'));
});

test('红线3：注册礼包低于初级场验资门槛被拦截', () => {
  const m = defaultMaster();
  m['economy.new_user_beans'] = 100;
  const v = validateMaster(m);
  assert.ok(v.some(x => x.includes('new_user_beans')), v.join(';'));
});

test('红线6：充值档位到账钻石不符合汇率被拦截', () => {
  const m = defaultMaster();
  m['charge.recharge_tiers'] = [{ sku: 'diamond:6', price_fen: 600, diamonds: 100 }];
  const v = validateMaster(m);
  assert.ok(v.some(x => x.includes('recharge_tiers')), v.join(';'));
});

test('红线7：机器人初始余额不高于触底线被拦截', () => {
  const m = defaultMaster();
  m['bot.initial_balance'] = 100;
  const v = validateMaster(m);
  assert.ok(v.some(x => x.includes('initial_balance')), v.join(';'));
});
