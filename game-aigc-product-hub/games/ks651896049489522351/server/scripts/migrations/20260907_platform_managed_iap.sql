-- 快手平台托管 IAP 迁移

-- identity
CREATE TABLE IF NOT EXISTS kwai_identity_bindings (
  account_id  VARCHAR(128) NOT NULL,
  open_id     VARCHAR(128) NOT NULL,
  created_at  BIGINT       NOT NULL,
  updated_at  BIGINT       NOT NULL,
  PRIMARY KEY (account_id),
  UNIQUE KEY uniq_kwai_identity_open_id (open_id),
  CONSTRAINT fk_kwai_identity_account FOREIGN KEY (account_id) REFERENCES accounts(account_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- exchange orders
CREATE TABLE IF NOT EXISTS platform_exchange_orders (
  exchange_order_id    VARCHAR(64)   NOT NULL,
  account_id           VARCHAR(128)  NOT NULL,
  client_request_id    VARCHAR(64)   NOT NULL,
  request_fingerprint  VARCHAR(128)  NOT NULL,
  exchange_sku_id      VARCHAR(64)   NOT NULL,
  cost                 BIGINT        NOT NULL,
  grant_beans          BIGINT        NOT NULL,
  bonus_beans          BIGINT        NOT NULL DEFAULT 0,
  os                    VARCHAR(16)   NOT NULL,
  user_ip               VARCHAR(64)   NOT NULL,
  zone_id               VARCHAR(64)   NOT NULL,
  biz_no                VARCHAR(63)   NOT NULL,
  product_name          VARCHAR(128)  NOT NULL,
  product_info          TEXT          NOT NULL,
  product_desc          VARCHAR(255)  NOT NULL,
  pay_priority          INT           NOT NULL DEFAULT 1,
  status                VARCHAR(32)   NOT NULL DEFAULT 'CREATED',
  debit_attempts        INT           NOT NULL DEFAULT 0,
  platform_code         VARCHAR(64)   NOT NULL DEFAULT '',
  platform_message      VARCHAR(255)  NOT NULL DEFAULT '',
  charge_balance_after  BIGINT        NULL,
  free_balance_after    BIGINT        NULL,
  beans_balance_after   BIGINT        NULL,
  debit_confirmed_at    BIGINT        NULL,
  fulfilled_at          BIGINT        NULL,
  created_at            BIGINT        NOT NULL,
  updated_at            BIGINT        NOT NULL,
  PRIMARY KEY (exchange_order_id),
  UNIQUE KEY uniq_platform_exchange_biz_no (biz_no),
  UNIQUE KEY uniq_platform_exchange_account_request (account_id, client_request_id),
  INDEX idx_platform_exchange_status_updated (status, updated_at),
  CONSTRAINT fk_platform_exchange_account FOREIGN KEY (account_id) REFERENCES accounts(account_id),
  CHECK (cost > 0),
  CHECK (grant_beans > 0),
  CHECK (pay_priority = 1),
  CHECK (charge_balance_after IS NULL OR charge_balance_after >= 0),
  CHECK (free_balance_after IS NULL OR free_balance_after >= 0),
  CHECK (beans_balance_after IS NULL OR beans_balance_after >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- balance cache
CREATE TABLE IF NOT EXISTS platform_coin_balance_cache (
  account_id       VARCHAR(128) NOT NULL,
  os               VARCHAR(16)  NOT NULL,
  zone_id          VARCHAR(64)  NOT NULL,
  charge_balance   BIGINT       NOT NULL,
  free_balance     BIGINT       NOT NULL,
  observed_at      BIGINT       NOT NULL,
  PRIMARY KEY (account_id, os, zone_id),
  CONSTRAINT fk_platform_balance_account FOREIGN KEY (account_id) REFERENCES accounts(account_id),
  CHECK (charge_balance >= 0),
  CHECK (free_balance >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- platform exchange catalog is created and seeded by the baseline migration
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
  product_tag           VARCHAR(16)   NOT NULL DEFAULT 'normal',
  is_first_charge       TINYINT       NOT NULL DEFAULT 0,
  first_charge_bonus_beans BIGINT     NOT NULL DEFAULT 0,
  created_at            BIGINT        NOT NULL,
  updated_at            BIGINT        NOT NULL,
  PRIMARY KEY (exchange_sku_id),
  CHECK (platform_product_id > 0),
  CHECK (platform_product_type IN (0, 1, 2)),
  CHECK (cost_balance > 0),
  CHECK (grant_beans > 0),
  CHECK (grant_beans = cost_balance * 1000)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- remove local diamond ledger
DROP TABLE IF EXISTS diamond_ledger;
DROP TABLE IF EXISTS diamond_wallets;
DROP TABLE IF EXISTS diamond_exchange_orders;
DROP TABLE IF EXISTS diamond_exchange_products;
