-- 20260919_economy_ledger.sql — 经济流水补全（checklist：钻石流水表 / 机器人日志表 / 牌局结构化结算列）
-- 注意：game_matches.config_version 与 game_match_participants 结算列的 ALTER
-- 由 economy-ledger.js 的 ensureColumn 幂等执行（可重复启动），不放在本文件。

CREATE TABLE IF NOT EXISTS diamond_ledger (
  id              BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
  account_id      VARCHAR(128) NOT NULL,
  direction       VARCHAR(8)   NOT NULL COMMENT 'in=充值到账 out=兑换消耗',
  delta           BIGINT       NOT NULL COMMENT '变动值（带符号）',
  source          VARCHAR(32)  NOT NULL COMMENT 'iap_recharge | exchange_deduct',
  sku_id          VARCHAR(64)  NULL,
  platform        VARCHAR(16)  NULL,
  balance_after   VARCHAR(32)  NULL COMMENT '平台托管余额观察值（字符串保精度，缺失为 NULL）',
  idempotency_key VARCHAR(128) NOT NULL,
  created_at      BIGINT       NOT NULL,
  UNIQUE KEY uniq_diamond_idem (idempotency_key),
  INDEX idx_diamond_account_time (account_id, created_at),
  INDEX idx_diamond_source_time (source, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS bot_economy_log (
  id             BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
  bot_scope      VARCHAR(64)  NOT NULL COMMENT '机器人资金池账户（system::bot_treasury::*）',
  direction      VARCHAR(16)  NOT NULL COMMENT 'mint=池流入 evaporate=池流出',
  amount         BIGINT       NOT NULL COMMENT '变动绝对值',
  balance_before BIGINT       NOT NULL,
  balance_after  BIGINT       NOT NULL,
  room_id        VARCHAR(64)  NULL,
  round_no       INT          NULL,
  match_id       VARCHAR(160) NULL,
  source         VARCHAR(32)  NOT NULL DEFAULT 'settlement',
  created_at     BIGINT       NOT NULL,
  INDEX idx_bot_economy_time (created_at),
  INDEX idx_bot_economy_scope_time (bot_scope, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
