// ============================================================
// IAP 支付单元测试
// 覆盖：签名算法、商品校验、回调解析、幂等逻辑
// 不依赖 MySQL，全部使用纯函数或内存 mock。
// ============================================================

'use strict';

process.env.DDZ_AUTH_MODE = process.env.DDZ_AUTH_MODE || 'dev';
process.env.DDZ_AUTH_SECRET = process.env.DDZ_AUTH_SECRET || 'iap_unit_test_secret';

const assert = require('assert');
const { signGamePayment, verifyPaymentNotify, buildSignString } = require('../payment/signature');
const { parseNotifyBody } = require('../payment/notify-handler');

// ============================================================
// 1. 签名算法
// ============================================================
{
  // 快手官方示例（如官方提供了签名向量，在此对齐）
  // 基本测试：空字段排除、ASCII 排序、小写十六进制
  const key = 'test_sign_key_32bytes_0000000000';
  const params = {
    zone_id: 'ddz1_ks_abc',
    os: 'android',
    currency_type: 'CNY',
    buy_quantity: 60,
    third_party_trade_no: 'iap_test_001',
    extension: '',       // 空值应被排除
  };

  const sign = signGamePayment(params, key);
  assert.ok(typeof sign === 'string', 'sign should be a string');
  assert.ok(/^[0-9a-f]{64}$/.test(sign), 'sign should be lowercase hex 64 chars');

  // 同参数两次签名结果相同
  const sign2 = signGamePayment(params, key);
  assert.strictEqual(sign, sign2, 'deterministic');

  // 不同密钥结果不同
  const signOther = signGamePayment(params, 'other_key_0000000000000000000000');
  assert.notStrictEqual(sign, signOther, 'different key different sign');

  console.log('[PASS] 签名基本功能');
}

// ============================================================
// 2. 空字段排除 & ASCII 排序
// ============================================================
{
  const key = 'k';
  const params1 = { b: '2', a: '1', c: '' }; // c 为空，应排除
  const str1 = buildSignString(params1);
  assert.strictEqual(str1, 'a=1&b=2', 'empty field excluded, keys sorted');

  const params2 = { b: '2', a: '1', c: null }; // null 排除
  assert.strictEqual(buildSignString(params2), 'a=1&b=2', 'null excluded');

  const params3 = { b: '2', a: '1', c: undefined }; // undefined 排除
  assert.strictEqual(buildSignString(params3), 'a=1&b=2', 'undefined excluded');

  console.log('[PASS] 空字段排除与 ASCII 排序');
}

// ============================================================
// 3. 验签（verifyPaymentNotify）
// ============================================================
{
  const key = 'notify_key_aabbcc';
  const params = {
    open_id:              'test_open_id',
    app_id:               'ks651896049489522351',
    third_party_trade_no: 'iap_test_001',
    order_id:             '9900000001',
  };
  const sign = signGamePayment(params, key);
  const paramsWithSign = { ...params, sign };

  // 正确密钥验签通过（传完整含 sign 的参数）
  assert.ok(
    verifyPaymentNotify(paramsWithSign, key),
    'should pass with correct key',
  );

  // 错误密钥验签失败
  assert.ok(
    !verifyPaymentNotify(paramsWithSign, 'wrong_key'),
    'should fail with wrong key',
  );

  // 缺少 notifyKey 时直接失败
  assert.ok(!verifyPaymentNotify(paramsWithSign, ''), 'empty key fails');

  // 旧密钥兼容验证（密钥轮换）
  const oldKey = 'old_notify_key';
  const signWithOldKey = signGamePayment(params, oldKey);
  const paramsWithOldSign = { ...params, sign: signWithOldKey };
  assert.ok(
    verifyPaymentNotify(paramsWithOldSign, key, oldKey),
    'prev key fallback should work',
  );
  assert.ok(
    !verifyPaymentNotify(paramsWithOldSign, key, 'wrong_old'),
    'wrong old key should fail',
  );

  console.log('[PASS] verifyPaymentNotify');
}

// ============================================================
// 4. 回调 Body 解析
// ============================================================
{
  // 正常请求
  const body = 'open_id=test_openid&app_id=ks651896049489522351&third_party_trade_no=iap_001&order_id=9900000001&sign=abcdef';
  const ct = 'application/x-www-form-urlencoded';
  const r = parseNotifyBody(body, ct);
  assert.ok(r.ok, 'valid body should parse ok');
  assert.strictEqual(r.params.open_id, 'test_openid');

  // Content-Type 错误
  const r2 = parseNotifyBody(body, 'application/json');
  assert.ok(!r2.ok && r2.reason === 'bad_content_type', 'json content-type rejected');

  // 带 charset 的 Content-Type 应该通过
  const r3 = parseNotifyBody(body, 'application/x-www-form-urlencoded; charset=UTF-8');
  assert.ok(r3.ok, 'charset variant accepted');

  // 重复键拒绝
  const dupBody = 'open_id=a&open_id=b&app_id=x&third_party_trade_no=y&order_id=z&sign=s';
  const r4 = parseNotifyBody(dupBody, ct);
  assert.ok(!r4.ok && r4.reason.startsWith('duplicate_key'), 'duplicate key rejected');

  // 未知字段拒绝
  const unknownBody = 'open_id=a&app_id=x&third_party_trade_no=y&order_id=z&sign=s&unknown_field=v';
  const r5 = parseNotifyBody(unknownBody, ct);
  assert.ok(!r5.ok && r5.reason.startsWith('unknown_field'), 'unknown field rejected');

  // 缺少必填字段
  const missingBody = 'app_id=x&third_party_trade_no=y&order_id=z&sign=s'; // missing open_id
  const r6 = parseNotifyBody(missingBody, ct);
  assert.ok(!r6.ok && r6.reason.startsWith('missing_field'), 'missing required field rejected');

  // 超长 third_party_trade_no
  const longNo = 'x'.repeat(200);
  const longBody = `open_id=a&app_id=x&third_party_trade_no=${longNo}&order_id=z&sign=s`;
  const r7 = parseNotifyBody(longBody, ct);
  assert.ok(!r7.ok && r7.reason.startsWith('field_too_long'), 'too long field rejected');

  const longOpenId = 'x'.repeat(129);
  const longOpenIdBody = `open_id=${longOpenId}&app_id=x&third_party_trade_no=y&order_id=z&sign=s`;
  const r8 = parseNotifyBody(longOpenIdBody, ct);
  assert.ok(!r8.ok && r8.reason === 'invalid_field:open_id', 'open_id contract matches login normalization');

  console.log('[PASS] parseNotifyBody');
}

// ============================================================
// 5. 商品价格一致性（九档 SKU 校验规则）
// ============================================================
{
  const SKU_TABLE = [
    { skuId: 'diamond_30',   priceFen: 300,   buyQuantity: 30,   grantDiamonds: 30   },
    { skuId: 'diamond_60',   priceFen: 600,   buyQuantity: 60,   grantDiamonds: 60   },
    { skuId: 'diamond_120',  priceFen: 1200,  buyQuantity: 120,  grantDiamonds: 120  },
    { skuId: 'diamond_300',  priceFen: 3000,  buyQuantity: 300,  grantDiamonds: 300  },
    { skuId: 'diamond_680',  priceFen: 6800,  buyQuantity: 680,  grantDiamonds: 680  },
    { skuId: 'diamond_980',  priceFen: 9800,  buyQuantity: 980,  grantDiamonds: 980  },
    { skuId: 'diamond_1980', priceFen: 19800, buyQuantity: 1980, grantDiamonds: 1980 },
    { skuId: 'diamond_3280', priceFen: 32800, buyQuantity: 3280, grantDiamonds: 3280 },
    { skuId: 'diamond_6480', priceFen: 64800, buyQuantity: 6480, grantDiamonds: 6480 },
  ];

  for (const sku of SKU_TABLE) {
    assert.strictEqual(sku.priceFen, sku.buyQuantity * 10, `${sku.skuId}: price_fen = buy_quantity * 10`);
    assert.strictEqual(sku.grantDiamonds, sku.buyQuantity, `${sku.skuId}: grant_diamonds = buy_quantity`);
    assert.ok(sku.priceFen > 0, `${sku.skuId}: price positive`);
  }

  console.log('[PASS] 九档 SKU 价格一致性');
}

// ============================================================
// 6. 兑换商品汇率一致性（四档）
// ============================================================
{
  const EXCHANGE_TABLE = [
    { exchangeSkuId: 'diamond_to_beans_10',  costBalance: 10,  grantBeans: 10000  },
    { exchangeSkuId: 'diamond_to_beans_60',  costBalance: 60,  grantBeans: 60000  },
    { exchangeSkuId: 'diamond_to_beans_300', costBalance: 300, grantBeans: 300000 },
    { exchangeSkuId: 'diamond_to_beans_980', costBalance: 980, grantBeans: 980000 },
  ];

  for (const p of EXCHANGE_TABLE) {
    assert.strictEqual(p.grantBeans, p.costBalance * 1000, `${p.exchangeSkuId}: 1 platform coin = 1000 beans`);
    assert.ok(p.costBalance > 0, `${p.exchangeSkuId}: cost positive`);
  }

  console.log('[PASS] 四档兑换汇率一致性');
}

// ============================================================
// 7. 身份派生一致性
// ============================================================
{
  const { deriveKwaiAccountId } = require('../identity/kwai-account-id');

  const id1 = deriveKwaiAccountId('test_open_id_001');
  const id2 = deriveKwaiAccountId('test_open_id_001');
  const id3 = deriveKwaiAccountId('test_open_id_002');

  assert.strictEqual(id1, id2, 'same openId → same accountId');
  assert.notStrictEqual(id1, id3, 'different openId → different accountId');
  assert.ok(id1.startsWith('ks_'), 'prefix ks_');
  assert.ok(/^ks_[0-9a-f]{32}$/.test(id1), 'format ks_ + 32 hex');

  console.log('[PASS] 身份派生一致性');
}

// ============================================================
// 8. buildFingerprint 隔离性
// ============================================================
{
  const { buildFingerprint } = require('../payment/order-service');

  const fp1 = buildFingerprint('diamond_60', 'android');
  const fp2 = buildFingerprint('diamond_60', 'android');
  const fp3 = buildFingerprint('diamond_60', 'ios');
  const fp4 = buildFingerprint('diamond_30', 'android');

  assert.strictEqual(fp1, fp2, 'same params → same fingerprint');
  assert.notStrictEqual(fp1, fp3, 'different platform → different fingerprint');
  assert.notStrictEqual(fp1, fp4, 'different sku → different fingerprint');

  console.log('[PASS] 订单请求指纹隔离性');
}

// ============================================================
// 9. IAP WebSocket 协议白名单与字段校验
// ============================================================
{
  const { validateMessage, ALLOWED_MESSAGE_TYPES } = require('../index');
  const uuid = '8f2fd9c5-9ab4-4a8b-8d90-8cb6e96a21fa';
  const types = [
    'getIapCatalog', 'createIapOrder', 'reportIapClientResult', 'getIapOrder',
    'getPendingIapOrders', 'getPlatformCoinBalance', 'getPlatformCoinExchangeCatalog',
    'createPlatformCoinExchange', 'getPlatformCoinExchange',
  ];
  for (const type of types) assert.ok(ALLOWED_MESSAGE_TYPES.has(type), `${type} should be allowed`);
  const correlationId = 'iap.req-20260907_001';
  assert.ok(validateMessage({ type: 'createIapOrder', correlationId, skuId: 'diamond_60', os: 'android', requestId: uuid }).ok);
  assert.ok(!validateMessage({ type: 'createIapOrder', correlationId, skuId: 'diamond_60', os: 'android', requestId: '' }).ok);
  assert.ok(validateMessage({ type: 'createPlatformCoinExchange', correlationId, exchangeSkuId: 'diamond_to_beans_60', clientRequestId: uuid, os: 'android' }).ok);
  assert.ok(!validateMessage({ type: 'createPlatformCoinExchange', correlationId, exchangeSkuId: 'diamond_to_beans_60', clientRequestId: 'bad', os: 'android' }).ok);
  assert.ok(validateMessage({ type: 'getPlatformCoinBalance', correlationId, os: 'ios' }).ok);
  assert.ok(validateMessage({ type: 'getPlatformCoinExchange', correlationId, exchangeOrderId: 'pex_' + 'a'.repeat(32) }).ok);
  assert.ok(validateMessage({ type: 'getPendingIapOrders', correlationId }).ok);
  assert.ok(!validateMessage({ type: 'getIapCatalog' }).ok, 'IAP correlationId is required');
  assert.ok(!validateMessage({ type: 'getIapCatalog', correlationId: 'bad id' }).ok, 'spaces are rejected');
  assert.ok(!validateMessage({ type: 'getIapCatalog', correlationId: 'x'.repeat(65) }).ok, 'overlong correlationId rejected');

  const { IAP_MESSAGE_TYPES, commandRateLimitPolicy } = require('../index');
  for (const type of IAP_MESSAGE_TYPES) {
    assert.deepStrictEqual(commandRateLimitPolicy(type, 'command'), { soft: true, close: false, structuredIap: true });
  }
  assert.deepStrictEqual(commandRateLimitPolicy('getIapOrder', 'connection'), { soft: false, close: true, structuredIap: true });
  assert.deepStrictEqual(commandRateLimitPolicy('playCards', 'command'), { soft: false, close: false, structuredIap: false });

  console.log('[PASS] IAP WebSocket 协议白名单与字段校验');
}

console.log('\n✅ 所有 IAP 单元测试通过');
