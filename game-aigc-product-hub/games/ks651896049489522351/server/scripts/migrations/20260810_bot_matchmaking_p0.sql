-- 斗地主机器人匹配 P0 数据迁移
-- 生产环境必须由 DBA 审核、备份并在维护窗口执行。
-- 应用运行账号不需要 CREATE/ALTER 权限。

ALTER TABLE accounts
  ADD COLUMN account_type VARCHAR(32) NOT NULL DEFAULT 'user' AFTER account_id,
  ADD INDEX idx_accounts_type (account_type);

ALTER TABLE game_matches
  ADD COLUMN has_bots TINYINT NOT NULL DEFAULT 0 AFTER balances_json,
  ADD COLUMN human_count INT NOT NULL DEFAULT 3 AFTER has_bots,
  ADD COLUMN bot_count INT NOT NULL DEFAULT 0 AFTER human_count,
  ADD COLUMN bot_mode VARCHAR(32) NULL AFTER bot_count,
  ADD COLUMN bot_strategy_version VARCHAR(64) NULL AFTER bot_mode,
  ADD INDEX idx_game_matches_bot_started (has_bots, started_at);

CREATE TABLE game_match_participants (
  match_id VARCHAR(160) NOT NULL,
  player_id VARCHAR(128) NOT NULL,
  account_id VARCHAR(128) NOT NULL,
  seat INT NOT NULL,
  role VARCHAR(32),
  is_bot TINYINT NOT NULL DEFAULT 0,
  controller_type VARCHAR(32) NOT NULL,
  persona_id VARCHAR(64),
  joined_at BIGINT NOT NULL,
  created_at BIGINT NOT NULL,
  PRIMARY KEY (match_id, player_id),
  INDEX idx_gmp_account_created (account_id, created_at),
  INDEX idx_gmp_match_bot (match_id, is_bot),
  INDEX idx_gmp_account_match (account_id, match_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE bot_match_stats (
  account_id VARCHAR(128) NOT NULL,
  stat_date VARCHAR(16) NOT NULL,
  match_count INT NOT NULL DEFAULT 0,
  solo_bot_match_count INT NOT NULL DEFAULT 0,
  duo_bot_match_count INT NOT NULL DEFAULT 0,
  win_count INT NOT NULL DEFAULT 0,
  lose_count INT NOT NULL DEFAULT 0,
  net_gain BIGINT NOT NULL DEFAULT 0,
  positive_gain_total BIGINT NOT NULL DEFAULT 0,
  reserved_positive_gain BIGINT NOT NULL DEFAULT 0,
  reserved_match_count INT NOT NULL DEFAULT 0,
  consecutive_bot_matches INT NOT NULL DEFAULT 0,
  last_match_at BIGINT NOT NULL DEFAULT 0,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL,
  PRIMARY KEY (account_id, stat_date),
  INDEX idx_bot_match_stats_date_gain (stat_date, net_gain),
  INDEX idx_bot_match_stats_updated (updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE bot_human_pair_stats (
  pair_key VARCHAR(300) NOT NULL,
  stat_date VARCHAR(16) NOT NULL,
  account_id_low VARCHAR(128) NOT NULL,
  account_id_high VARCHAR(128) NOT NULL,
  match_count INT NOT NULL DEFAULT 0,
  net_transfer BIGINT NOT NULL DEFAULT 0,
  last_match_at BIGINT NOT NULL DEFAULT 0,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL,
  PRIMARY KEY (pair_key, stat_date),
  INDEX idx_bhps_accounts_date (account_id_low, account_id_high, stat_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE bot_quota_reservations (
  reservation_id VARCHAR(160) NOT NULL,
  match_request_id VARCHAR(160) NOT NULL,
  match_id VARCHAR(160),
  account_id VARCHAR(128) NOT NULL,
  stat_date VARCHAR(16) NOT NULL,
  reserved_positive_gain BIGINT NOT NULL DEFAULT 0,
  status VARCHAR(32) NOT NULL,
  created_at BIGINT NOT NULL,
  activated_at BIGINT,
  released_at BIGINT,
  settled_at BIGINT,
  updated_at BIGINT NOT NULL,
  PRIMARY KEY (reservation_id),
  UNIQUE KEY uniq_bqr_request_account (match_request_id, account_id),
  INDEX idx_bqr_account_date_status (account_id, stat_date, status),
  INDEX idx_bqr_status_updated (status, updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE bot_treasury_reservations (
  reservation_id VARCHAR(160) NOT NULL,
  match_request_group_id VARCHAR(160) NOT NULL,
  match_id VARCHAR(160),
  room_id VARCHAR(64) NOT NULL,
  room_type VARCHAR(32) NOT NULL,
  treasury_account_id VARCHAR(128) NOT NULL,
  reserved_exposure BIGINT NOT NULL,
  actual_treasury_delta BIGINT,
  status VARCHAR(32) NOT NULL,
  created_at BIGINT NOT NULL,
  activated_at BIGINT,
  released_at BIGINT,
  settled_at BIGINT,
  updated_at BIGINT NOT NULL,
  PRIMARY KEY (reservation_id),
  UNIQUE KEY uniq_btr_request_group (match_request_group_id),
  INDEX idx_btr_treasury_status (treasury_account_id, status),
  INDEX idx_btr_status_updated (status, updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 资金池账号和初始金额由运营、财务与 DBA 确认后单独初始化，禁止在仓库硬编码。
-- system::bot_treasury::junior
-- system::bot_treasury::mid
