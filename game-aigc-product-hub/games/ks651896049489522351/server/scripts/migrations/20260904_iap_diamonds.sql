-- ============================================================
-- IAP 充值订单与平台币商品体系
-- 该基线迁移后必须继续执行 20260907_platform_managed_iap.sql，
-- 后者会删除本地钻石钱包/流水/旧兑换订单并创建平台托管表。
-- ============================================================

-- -----------------------------------------------------------
-- 1. iap_products：充值商品配置
-- -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS iap_products (
  sku_id            VARCHAR(64)  NOT NULL,
  display_name      VARCHAR(128) NOT NULL,
  price_fen         BIGINT       NOT NULL,
  currency_type     VARCHAR(8)   NOT NULL DEFAULT 'CNY',
  buy_quantity      BIGINT       NOT NULL,
  grant_diamonds    BIGINT       NOT NULL,
  goods_category    VARCHAR(64)  NOT NULL DEFAULT '',
  product_type      INT          NOT NULL DEFAULT 1,
  enabled_android   TINYINT      NOT NULL DEFAULT 1,
  enabled_ios       TINYINT      NOT NULL DEFAULT 1,
  display_order     INT          NOT NULL DEFAULT 0,
  version           BIGINT       NOT NULL DEFAULT 1,
  created_at        BIGINT       NOT NULL,
  updated_at        BIGINT       NOT NULL,
  PRIMARY KEY (sku_id),
  CHECK (price_fen > 0),
  CHECK (buy_quantity > 0),
  CHECK (grant_diamonds > 0),
  CHECK (price_fen = buy_quantity * 10),
  CHECK (grant_diamonds = buy_quantity)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- -----------------------------------------------------------
-- 2. iap_orders：支付订单
-- -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS iap_orders (
  order_id              VARCHAR(64)   NOT NULL,
  account_id            VARCHAR(128)  NOT NULL,
  client_request_id     VARCHAR(64)   NOT NULL,
  sku_id                VARCHAR(64)   NOT NULL,
  platform              VARCHAR(16)   NOT NULL,
  zone_id               VARCHAR(256)  NOT NULL,
  currency_type         VARCHAR(8)    NOT NULL DEFAULT 'CNY',
  buy_quantity          BIGINT        NOT NULL,
  price_fen             BIGINT        NOT NULL,
  grant_diamonds        BIGINT        NOT NULL,
  product_type          INT           NULL DEFAULT NULL,
  request_fingerprint   VARCHAR(128)  NOT NULL DEFAULT '',
  goods_category        VARCHAR(64)   NOT NULL DEFAULT '',
  goods_name            VARCHAR(128)  NOT NULL DEFAULT '',
  extension             VARCHAR(128)  NOT NULL DEFAULT '',
  status                VARCHAR(32)   NOT NULL DEFAULT 'PENDING',
  platform_order_id     VARCHAR(128)  NULL DEFAULT NULL,
  client_result_code    VARCHAR(32)   NOT NULL DEFAULT '',
  client_result_message VARCHAR(255)  NOT NULL DEFAULT '',
  notify_count          INT           NOT NULL DEFAULT 0,
  last_notify_at        BIGINT        NULL DEFAULT NULL,
  payment_confirmed_at  BIGINT        NULL DEFAULT NULL,
  created_at            BIGINT        NOT NULL,
  updated_at            BIGINT        NOT NULL,
  PRIMARY KEY (order_id),
  UNIQUE KEY uniq_iap_account_request (account_id, client_request_id),
  UNIQUE KEY uniq_iap_platform_order  (platform_order_id),
  INDEX idx_iap_account_created       (account_id, created_at),
  INDEX idx_iap_status_updated        (status, updated_at),
  CHECK (buy_quantity > 0),
  CHECK (grant_diamonds > 0),
  CHECK (price_fen > 0),
  CONSTRAINT chk_iap_orders_price_quantity CHECK (price_fen = buy_quantity * 10),
  CONSTRAINT chk_iap_orders_grant_quantity CHECK (grant_diamonds = buy_quantity)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- -----------------------------------------------------------
-- 3. platform_exchange_products：平台币兑换商品配置
-- -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS platform_exchange_products (
  exchange_sku_id       VARCHAR(64)   NOT NULL,
  platform_product_id   BIGINT        NOT NULL,
  platform_product_type INT           NOT NULL DEFAULT 0,
  display_name          VARCHAR(128)  NOT NULL,
  cost_balance          BIGINT        NOT NULL,
  grant_beans           BIGINT        NOT NULL,
  enabled               TINYINT       NOT NULL DEFAULT 1,
  display_order         INT           NOT NULL DEFAULT 0,
  version               BIGINT        NOT NULL DEFAULT 1,
  created_at            BIGINT        NOT NULL,
  updated_at            BIGINT        NOT NULL,
  PRIMARY KEY (exchange_sku_id),
  CHECK (platform_product_id > 0),
  CHECK (platform_product_type IN (0, 1, 2)),
  CHECK (cost_balance > 0),
  CHECK (grant_beans > 0),
  CHECK (grant_beans = cost_balance * 1000)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- -----------------------------------------------------------
-- 4. iap_notify_logs：回调审计
-- -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS iap_notify_logs (
  log_id              VARCHAR(128)  NOT NULL,
  received_at         BIGINT        NOT NULL,
  order_id_prefix     VARCHAR(32)   NOT NULL DEFAULT '',
  platform_order_hash VARCHAR(64)   NOT NULL DEFAULT '',
  app_id              VARCHAR(64)   NOT NULL DEFAULT '',
  verify_result       VARCHAR(32)   NOT NULL DEFAULT '',
  process_result      VARCHAR(32)   NOT NULL DEFAULT '',
  error_class         VARCHAR(64)   NOT NULL DEFAULT '',
  http_status         INT           NOT NULL DEFAULT 200,
  duration_ms         INT           NOT NULL DEFAULT 0,
  created_at          BIGINT        NOT NULL,
  PRIMARY KEY (log_id),
  INDEX idx_iap_notify_logs_received (received_at),
  INDEX idx_iap_notify_logs_order_prefix (order_id_prefix)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- -----------------------------------------------------------
-- 8. 初始充值商品数据（goods_category=game_coin，与 seed iap-products.json 一致）
-- -----------------------------------------------------------
INSERT IGNORE INTO iap_products
  (sku_id, display_name, price_fen, currency_type, buy_quantity, grant_diamonds,
   goods_category, product_type, enabled_android, enabled_ios, display_order, version, created_at, updated_at)
VALUES
  ('diamond_30',   '30钻石',    300,   'CNY',  30,    30,    'game_coin', 1, 1, 1, 1,  1, UNIX_TIMESTAMP()*1000, UNIX_TIMESTAMP()*1000),
  ('diamond_60',   '60钻石',    600,   'CNY',  60,    60,    'game_coin', 1, 1, 1, 2,  1, UNIX_TIMESTAMP()*1000, UNIX_TIMESTAMP()*1000),
  ('diamond_120',  '120钻石',   1200,  'CNY',  120,   120,  'game_coin', 1, 1, 1, 3,  1, UNIX_TIMESTAMP()*1000, UNIX_TIMESTAMP()*1000),
  ('diamond_300',  '300钻石',   3000,  'CNY',  300,   300,  'game_coin', 1, 1, 1, 4,  1, UNIX_TIMESTAMP()*1000, UNIX_TIMESTAMP()*1000),
  ('diamond_680',  '680钻石',   6800,  'CNY',  680,   680,  'game_coin', 1, 1, 1, 5,  1, UNIX_TIMESTAMP()*1000, UNIX_TIMESTAMP()*1000),
  ('diamond_980',  '980钻石',   9800,  'CNY',  980,   980,  'game_coin', 1, 1, 1, 6,  1, UNIX_TIMESTAMP()*1000, UNIX_TIMESTAMP()*1000),
  ('diamond_1980', '1980钻石',  19800, 'CNY',  1980,  1980, 'game_coin', 1, 1, 1, 7,  1, UNIX_TIMESTAMP()*1000, UNIX_TIMESTAMP()*1000),
  ('diamond_3280', '3280钻石',  32800, 'CNY',  3280,  3280, 'game_coin', 1, 1, 1, 8,  1, UNIX_TIMESTAMP()*1000, UNIX_TIMESTAMP()*1000),
  ('diamond_6480', '6480钻石',  64800, 'CNY',  6480,  6480, 'game_coin', 1, 1, 1, 9,  1, UNIX_TIMESTAMP()*1000, UNIX_TIMESTAMP()*1000);

-- -----------------------------------------------------------
-- 9. 初始兑换商品数据
-- -----------------------------------------------------------
INSERT IGNORE INTO platform_exchange_products
  (exchange_sku_id, platform_product_id, platform_product_type, display_name, cost_balance, grant_beans, enabled, display_order, version, created_at, updated_at)
VALUES
  ('diamond_to_beans_10',  10010, 0, '10钻石换铁豆',  10,  10000,  1, 1, 1, UNIX_TIMESTAMP()*1000, UNIX_TIMESTAMP()*1000),
  ('diamond_to_beans_60',  10060, 0, '60钻石换铁豆',  60,  60000,  1, 2, 1, UNIX_TIMESTAMP()*1000, UNIX_TIMESTAMP()*1000),
  ('diamond_to_beans_300', 10300, 0, '300钻石换铁豆', 300, 300000, 1, 3, 1, UNIX_TIMESTAMP()*1000, UNIX_TIMESTAMP()*1000),
  ('diamond_to_beans_980', 10980, 0, '980钻石换铁豆', 980, 980000, 1, 4, 1, UNIX_TIMESTAMP()*1000, UNIX_TIMESTAMP()*1000);
