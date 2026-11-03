-- 斗地主 MySQL 全量初始化基线（MySQL 8.0.16+）
-- 新建空数据库时执行；生产环境请由 DBA 使用具备 DDL 权限的账号执行。
-- 不含任何账号密码、平台密钥或环境配置。

CREATE DATABASE IF NOT EXISTS `ddz`
  DEFAULT CHARACTER SET utf8mb4
  DEFAULT COLLATE utf8mb4_unicode_ci;

USE `ddz`;

CREATE TABLE IF NOT EXISTS accounts (
  account_id VARCHAR(128) PRIMARY KEY,
  account_type VARCHAR(32) NOT NULL DEFAULT 'user',
  login_type VARCHAR(32) NOT NULL DEFAULT 'guest',
  kwai_open_id_hash VARCHAR(128) NOT NULL DEFAULT '', device_id VARCHAR(128) NOT NULL DEFAULT '',
  first_ip VARCHAR(64) NOT NULL DEFAULT '', last_ip VARCHAR(64) NOT NULL DEFAULT '',
  login_count BIGINT NOT NULL DEFAULT 0, banned TINYINT NOT NULL DEFAULT 0, ban_reason VARCHAR(255) NOT NULL DEFAULT '',
  created_at BIGINT NOT NULL, last_login_at BIGINT NOT NULL DEFAULT 0,
  INDEX idx_accounts_type (account_type), INDEX idx_accounts_device (device_id), INDEX idx_accounts_openid (kwai_open_id_hash)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS wallets (
  account_id VARCHAR(128) PRIMARY KEY, beans BIGINT NOT NULL, frozen_beans BIGINT NOT NULL DEFAULT 0,
  total_earned BIGINT NOT NULL DEFAULT 0, total_spent BIGINT NOT NULL DEFAULT 0, total_won BIGINT NOT NULL DEFAULT 0, total_lost BIGINT NOT NULL DEFAULT 0,
  daily_login_date VARCHAR(16) NOT NULL DEFAULT '', share_reward_date VARCHAR(16) NOT NULL DEFAULT '',
  created_at BIGINT NOT NULL, updated_at BIGINT NOT NULL, version BIGINT NOT NULL DEFAULT 1,
  CHECK (beans >= 0), CHECK (frozen_beans >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS wallet_ledger (
  tx_id VARCHAR(128) PRIMARY KEY, account_id VARCHAR(128) NOT NULL, type VARCHAR(64) NOT NULL, amount BIGINT NOT NULL,
  balance_before BIGINT NOT NULL, balance_after BIGINT NOT NULL, room_id VARCHAR(64), round_no INT, match_id VARCHAR(160),
  idempotency_key VARCHAR(255) NOT NULL UNIQUE, meta_json TEXT NOT NULL, created_at BIGINT NOT NULL,
  INDEX idx_wallet_ledger_account_created (account_id, created_at), INDEX idx_wallet_ledger_match (match_id),
  CONSTRAINT fk_wallet_ledger_account FOREIGN KEY (account_id) REFERENCES wallets(account_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS user_entitlements (
  account_id VARCHAR(128) NOT NULL, sku VARCHAR(64) NOT NULL, kind VARCHAR(64) NOT NULL, source VARCHAR(32) NOT NULL,
  price_beans BIGINT NOT NULL DEFAULT 0, granted_at BIGINT NOT NULL, expires_at BIGINT NOT NULL DEFAULT 0, meta_json TEXT NOT NULL,
  created_at BIGINT NOT NULL, updated_at BIGINT NOT NULL, PRIMARY KEY (account_id, sku),
  INDEX idx_user_entitlements_sku (sku), INDEX idx_user_entitlements_granted (granted_at),
  CONSTRAINT fk_user_entitlements_account FOREIGN KEY (account_id) REFERENCES wallets(account_id), CHECK (price_beans >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS reward_claims (
  account_id VARCHAR(128) NOT NULL, reward_type VARCHAR(64) NOT NULL, claim_date VARCHAR(32) NOT NULL,
  claim_count INT NOT NULL DEFAULT 0, total_amount BIGINT NOT NULL DEFAULT 0, created_at BIGINT NOT NULL, updated_at BIGINT NOT NULL,
  PRIMARY KEY (account_id, reward_type, claim_date), INDEX idx_reward_claims_type_date (reward_type, claim_date),
  CONSTRAINT fk_reward_claims_account FOREIGN KEY (account_id) REFERENCES wallets(account_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS player_stats (
  account_id VARCHAR(128) PRIMARY KEY, spring_count INT NOT NULL DEFAULT 0, bomb_count INT NOT NULL DEFAULT 0,
  max_multiplier INT NOT NULL DEFAULT 0, total_games INT NOT NULL DEFAULT 0, total_wins INT NOT NULL DEFAULT 0,
  cur_streak INT NOT NULL DEFAULT 0, max_streak INT NOT NULL DEFAULT 0, updated_at BIGINT NOT NULL,
  CONSTRAINT fk_player_stats_account FOREIGN KEY (account_id) REFERENCES wallets(account_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS game_matches (
  match_id VARCHAR(160) PRIMARY KEY, room_id VARCHAR(64) NOT NULL, round_no INT NOT NULL, status VARCHAR(32) NOT NULL,
  player_ids_json TEXT NOT NULL, account_ids_json TEXT NOT NULL, dealer_player_id VARCHAR(128), winner_team VARCHAR(32), winner_ids_json TEXT NOT NULL,
  base_bet BIGINT NOT NULL DEFAULT 0, bid_score INT NOT NULL DEFAULT 0, multiplier INT NOT NULL DEFAULT 1, spring TINYINT NOT NULL DEFAULT 0,
  requested_deltas_json TEXT NOT NULL, deltas_json TEXT NOT NULL, balances_json TEXT NOT NULL,
  has_bots TINYINT NOT NULL DEFAULT 0, human_count INT NOT NULL DEFAULT 3, bot_count INT NOT NULL DEFAULT 0, bot_mode VARCHAR(32), bot_strategy_version VARCHAR(64),
  started_at BIGINT NOT NULL, settled_at BIGINT, created_at BIGINT NOT NULL, updated_at BIGINT NOT NULL,
  UNIQUE KEY uniq_room_round (room_id, round_no), INDEX idx_game_matches_room_round (room_id, round_no),
  INDEX idx_game_matches_status (status), INDEX idx_game_matches_bot_started (has_bots, started_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS game_match_events (
  event_id VARCHAR(200) PRIMARY KEY, match_id VARCHAR(160), room_id VARCHAR(64) NOT NULL, round_no INT NOT NULL, seq INT NOT NULL,
  event_type VARCHAR(64) NOT NULL, actor_player_id VARCHAR(128), actor_account_id VARCHAR(128), payload_json TEXT NOT NULL, created_at BIGINT NOT NULL,
  UNIQUE KEY uniq_match_seq (match_id, seq), INDEX idx_game_match_events_match_seq (match_id, seq), INDEX idx_game_match_events_room_round (room_id, round_no)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS game_match_participants (
  match_id VARCHAR(160) NOT NULL, player_id VARCHAR(128) NOT NULL, account_id VARCHAR(128) NOT NULL, seat INT NOT NULL, role VARCHAR(32),
  is_bot TINYINT NOT NULL DEFAULT 0, controller_type VARCHAR(32) NOT NULL, persona_id VARCHAR(64), joined_at BIGINT NOT NULL, created_at BIGINT NOT NULL,
  PRIMARY KEY (match_id, player_id), INDEX idx_gmp_account_created (account_id, created_at), INDEX idx_gmp_match_bot (match_id, is_bot), INDEX idx_gmp_account_match (account_id, match_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS bot_match_stats (
  account_id VARCHAR(128) NOT NULL, stat_date VARCHAR(16) NOT NULL, match_count INT NOT NULL DEFAULT 0,
  solo_bot_match_count INT NOT NULL DEFAULT 0, duo_bot_match_count INT NOT NULL DEFAULT 0, win_count INT NOT NULL DEFAULT 0, lose_count INT NOT NULL DEFAULT 0,
  net_gain BIGINT NOT NULL DEFAULT 0, positive_gain_total BIGINT NOT NULL DEFAULT 0, reserved_positive_gain BIGINT NOT NULL DEFAULT 0,
  reserved_match_count INT NOT NULL DEFAULT 0, consecutive_bot_matches INT NOT NULL DEFAULT 0, last_match_at BIGINT NOT NULL DEFAULT 0,
  created_at BIGINT NOT NULL, updated_at BIGINT NOT NULL, PRIMARY KEY (account_id, stat_date),
  INDEX idx_bot_match_stats_date_gain (stat_date, net_gain), INDEX idx_bot_match_stats_updated (updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS bot_human_pair_stats (
  pair_key VARCHAR(300) NOT NULL, stat_date VARCHAR(16) NOT NULL, account_id_low VARCHAR(128) NOT NULL, account_id_high VARCHAR(128) NOT NULL,
  match_count INT NOT NULL DEFAULT 0, net_transfer BIGINT NOT NULL DEFAULT 0, last_match_at BIGINT NOT NULL DEFAULT 0,
  created_at BIGINT NOT NULL, updated_at BIGINT NOT NULL, PRIMARY KEY (pair_key, stat_date),
  INDEX idx_bhps_accounts_date (account_id_low, account_id_high, stat_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS bot_quota_reservations (
  reservation_id VARCHAR(160) NOT NULL, match_request_id VARCHAR(160) NOT NULL, match_id VARCHAR(160), account_id VARCHAR(128) NOT NULL,
  stat_date VARCHAR(16) NOT NULL, reserved_positive_gain BIGINT NOT NULL DEFAULT 0, status VARCHAR(32) NOT NULL, created_at BIGINT NOT NULL,
  activated_at BIGINT, released_at BIGINT, settled_at BIGINT, updated_at BIGINT NOT NULL, PRIMARY KEY (reservation_id),
  UNIQUE KEY uniq_bqr_request_account (match_request_id, account_id), INDEX idx_bqr_account_date_status (account_id, stat_date, status), INDEX idx_bqr_status_updated (status, updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS bot_treasury_reservations (
  reservation_id VARCHAR(160) NOT NULL, match_request_group_id VARCHAR(160) NOT NULL, match_id VARCHAR(160), room_id VARCHAR(64) NOT NULL,
  room_type VARCHAR(32) NOT NULL, treasury_account_id VARCHAR(128) NOT NULL, reserved_exposure BIGINT NOT NULL, actual_treasury_delta BIGINT,
  status VARCHAR(32) NOT NULL, created_at BIGINT NOT NULL, activated_at BIGINT, released_at BIGINT, settled_at BIGINT, updated_at BIGINT NOT NULL,
  PRIMARY KEY (reservation_id), UNIQUE KEY uniq_btr_request_group (match_request_group_id),
  INDEX idx_btr_treasury_status (treasury_account_id, status), INDEX idx_btr_status_updated (status, updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS iap_products (
  sku_id VARCHAR(64) NOT NULL, display_name VARCHAR(128) NOT NULL, price_fen BIGINT NOT NULL, currency_type VARCHAR(8) NOT NULL DEFAULT 'CNY',
  buy_quantity BIGINT NOT NULL, grant_diamonds BIGINT NOT NULL, goods_category VARCHAR(64) NOT NULL DEFAULT '', product_type INT NOT NULL DEFAULT 1,
  enabled_android TINYINT NOT NULL DEFAULT 1, enabled_ios TINYINT NOT NULL DEFAULT 1, display_order INT NOT NULL DEFAULT 0, version BIGINT NOT NULL DEFAULT 1,
  created_at BIGINT NOT NULL, updated_at BIGINT NOT NULL, PRIMARY KEY (sku_id),
  CHECK (price_fen > 0), CHECK (buy_quantity > 0), CHECK (grant_diamonds > 0), CHECK (price_fen = buy_quantity * 10), CHECK (grant_diamonds = buy_quantity)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS iap_orders (
  order_id VARCHAR(64) NOT NULL, account_id VARCHAR(128) NOT NULL, client_request_id VARCHAR(64) NOT NULL, sku_id VARCHAR(64) NOT NULL,
  platform VARCHAR(16) NOT NULL, zone_id VARCHAR(256) NOT NULL, currency_type VARCHAR(8) NOT NULL DEFAULT 'CNY', buy_quantity BIGINT NOT NULL,
  price_fen BIGINT NOT NULL, grant_diamonds BIGINT NOT NULL, product_type INT NULL DEFAULT NULL, request_fingerprint VARCHAR(128) NOT NULL DEFAULT '',
  goods_category VARCHAR(64) NOT NULL DEFAULT '', goods_name VARCHAR(128) NOT NULL DEFAULT '', extension VARCHAR(128) NOT NULL DEFAULT '',
  status VARCHAR(32) NOT NULL DEFAULT 'PENDING', platform_order_id VARCHAR(128) NULL DEFAULT NULL,
  client_result_code VARCHAR(32) NOT NULL DEFAULT '', client_result_message VARCHAR(255) NOT NULL DEFAULT '', notify_count INT NOT NULL DEFAULT 0,
  last_notify_at BIGINT NULL DEFAULT NULL, payment_confirmed_at BIGINT NULL DEFAULT NULL, created_at BIGINT NOT NULL, updated_at BIGINT NOT NULL,
  PRIMARY KEY (order_id), UNIQUE KEY uniq_iap_account_request (account_id, client_request_id), UNIQUE KEY uniq_iap_platform_order (platform_order_id),
  INDEX idx_iap_account_created (account_id, created_at), INDEX idx_iap_status_updated (status, updated_at),
  CHECK (buy_quantity > 0), CHECK (grant_diamonds > 0), CHECK (price_fen > 0),
  CONSTRAINT chk_iap_orders_price_quantity CHECK (price_fen = buy_quantity * 10),
  CONSTRAINT chk_iap_orders_grant_quantity CHECK (grant_diamonds = buy_quantity)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS iap_notify_logs (
  log_id VARCHAR(128) NOT NULL, received_at BIGINT NOT NULL, order_id_prefix VARCHAR(32) NOT NULL DEFAULT '', platform_order_hash VARCHAR(64) NOT NULL DEFAULT '',
  app_id VARCHAR(64) NOT NULL DEFAULT '', verify_result VARCHAR(32) NOT NULL DEFAULT '', process_result VARCHAR(32) NOT NULL DEFAULT '',
  error_class VARCHAR(64) NOT NULL DEFAULT '', http_status INT NOT NULL DEFAULT 200, duration_ms INT NOT NULL DEFAULT 0, created_at BIGINT NOT NULL,
  PRIMARY KEY (log_id), INDEX idx_iap_notify_logs_received (received_at), INDEX idx_iap_notify_logs_order_prefix (order_id_prefix)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS platform_exchange_products (
  exchange_sku_id VARCHAR(64) NOT NULL, platform_product_id BIGINT NOT NULL, platform_product_type INT NOT NULL DEFAULT 0, display_name VARCHAR(128) NOT NULL,
  cost_balance BIGINT NOT NULL, grant_beans BIGINT NOT NULL, enabled TINYINT NOT NULL DEFAULT 1, display_order INT NOT NULL DEFAULT 0,
  version BIGINT NOT NULL DEFAULT 1, created_at BIGINT NOT NULL, updated_at BIGINT NOT NULL, PRIMARY KEY (exchange_sku_id),
  CHECK (platform_product_id > 0), CHECK (platform_product_type IN (0, 1, 2)), CHECK (cost_balance > 0), CHECK (grant_beans > 0), CHECK (grant_beans = cost_balance * 1000)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS kwai_identity_bindings (
  account_id VARCHAR(128) NOT NULL, open_id VARCHAR(128) NOT NULL, created_at BIGINT NOT NULL, updated_at BIGINT NOT NULL,
  PRIMARY KEY (account_id), UNIQUE KEY uniq_kwai_identity_open_id (open_id),
  CONSTRAINT fk_kwai_identity_account FOREIGN KEY (account_id) REFERENCES accounts(account_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS platform_exchange_orders (
  exchange_order_id VARCHAR(64) NOT NULL, account_id VARCHAR(128) NOT NULL, client_request_id VARCHAR(64) NOT NULL, request_fingerprint VARCHAR(128) NOT NULL,
  exchange_sku_id VARCHAR(64) NOT NULL, cost BIGINT NOT NULL, grant_beans BIGINT NOT NULL, os VARCHAR(16) NOT NULL, user_ip VARCHAR(64) NOT NULL,
  zone_id VARCHAR(64) NOT NULL, biz_no VARCHAR(63) NOT NULL, product_name VARCHAR(128) NOT NULL, product_info TEXT NOT NULL, product_desc VARCHAR(255) NOT NULL,
  pay_priority INT NOT NULL DEFAULT 1, status VARCHAR(32) NOT NULL DEFAULT 'CREATED', debit_attempts INT NOT NULL DEFAULT 0,
  platform_code VARCHAR(64) NOT NULL DEFAULT '', platform_message VARCHAR(255) NOT NULL DEFAULT '', charge_balance_after BIGINT NULL, free_balance_after BIGINT NULL,
  beans_balance_after BIGINT NULL, debit_confirmed_at BIGINT NULL, fulfilled_at BIGINT NULL, created_at BIGINT NOT NULL, updated_at BIGINT NOT NULL,
  PRIMARY KEY (exchange_order_id), UNIQUE KEY uniq_platform_exchange_biz_no (biz_no), UNIQUE KEY uniq_platform_exchange_account_request (account_id, client_request_id),
  INDEX idx_platform_exchange_status_updated (status, updated_at), CONSTRAINT fk_platform_exchange_account FOREIGN KEY (account_id) REFERENCES accounts(account_id),
  CHECK (cost > 0), CHECK (grant_beans > 0), CHECK (pay_priority = 1),
  CHECK (charge_balance_after IS NULL OR charge_balance_after >= 0), CHECK (free_balance_after IS NULL OR free_balance_after >= 0), CHECK (beans_balance_after IS NULL OR beans_balance_after >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS platform_coin_balance_cache (
  account_id VARCHAR(128) NOT NULL, os VARCHAR(16) NOT NULL, zone_id VARCHAR(64) NOT NULL,
  charge_balance BIGINT NOT NULL, free_balance BIGINT NOT NULL, observed_at BIGINT NOT NULL,
  PRIMARY KEY (account_id, os, zone_id), CONSTRAINT fk_platform_balance_account FOREIGN KEY (account_id) REFERENCES accounts(account_id),
  CHECK (charge_balance >= 0), CHECK (free_balance >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 初始充值与兑换商品默认启用。
INSERT IGNORE INTO iap_products
  (sku_id, display_name, price_fen, currency_type, buy_quantity, grant_diamonds, goods_category, product_type, enabled_android, enabled_ios, display_order, version, created_at, updated_at)
VALUES
  ('diamond_30', '30钻石', 300, 'CNY', 30, 30, '', 1, 1, 1, 1, 1, UNIX_TIMESTAMP()*1000, UNIX_TIMESTAMP()*1000),
  ('diamond_60', '60钻石', 600, 'CNY', 60, 60, '', 1, 1, 1, 2, 1, UNIX_TIMESTAMP()*1000, UNIX_TIMESTAMP()*1000),
  ('diamond_120', '120钻石', 1200, 'CNY', 120, 120, '', 1, 1, 1, 3, 1, UNIX_TIMESTAMP()*1000, UNIX_TIMESTAMP()*1000),
  ('diamond_300', '300钻石', 3000, 'CNY', 300, 300, '', 1, 1, 1, 4, 1, UNIX_TIMESTAMP()*1000, UNIX_TIMESTAMP()*1000),
  ('diamond_680', '680钻石', 6800, 'CNY', 680, 680, '', 1, 1, 1, 5, 1, UNIX_TIMESTAMP()*1000, UNIX_TIMESTAMP()*1000),
  ('diamond_980', '980钻石', 9800, 'CNY', 980, 980, '', 1, 1, 1, 6, 1, UNIX_TIMESTAMP()*1000, UNIX_TIMESTAMP()*1000),
  ('diamond_1980', '1980钻石', 19800, 'CNY', 1980, 1980, '', 1, 1, 1, 7, 1, UNIX_TIMESTAMP()*1000, UNIX_TIMESTAMP()*1000),
  ('diamond_3280', '3280钻石', 32800, 'CNY', 3280, 3280, '', 1, 1, 1, 8, 1, UNIX_TIMESTAMP()*1000, UNIX_TIMESTAMP()*1000),
  ('diamond_6480', '6480钻石', 64800, 'CNY', 6480, 6480, '', 1, 1, 1, 9, 1, UNIX_TIMESTAMP()*1000, UNIX_TIMESTAMP()*1000);

INSERT IGNORE INTO platform_exchange_products
  (exchange_sku_id, platform_product_id, platform_product_type, display_name, cost_balance, grant_beans, enabled, display_order, version, created_at, updated_at)
VALUES
  ('diamond_to_beans_10', 10010, 0, '10钻石换铁豆', 10, 10000, 1, 1, 1, UNIX_TIMESTAMP()*1000, UNIX_TIMESTAMP()*1000),
  ('diamond_to_beans_60', 10060, 0, '60钻石换铁豆', 60, 60000, 1, 2, 1, UNIX_TIMESTAMP()*1000, UNIX_TIMESTAMP()*1000),
  ('diamond_to_beans_300', 10300, 0, '300钻石换铁豆', 300, 300000, 1, 3, 1, UNIX_TIMESTAMP()*1000, UNIX_TIMESTAMP()*1000),
  ('diamond_to_beans_980', 10980, 0, '980钻石换铁豆', 980, 980000, 1, 4, 1, UNIX_TIMESTAMP()*1000, UNIX_TIMESTAMP()*1000);
