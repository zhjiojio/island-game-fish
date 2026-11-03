-- 斗地主薄交易核心：用户权益表
-- 生产环境必须由 DBA 审核、备份并先于交易代码开关执行。
-- 应用运行账号不需要 CREATE/ALTER 权限。

CREATE TABLE IF NOT EXISTS user_entitlements (
  account_id VARCHAR(128) NOT NULL,
  sku VARCHAR(64) NOT NULL,
  kind VARCHAR(64) NOT NULL,
  source VARCHAR(32) NOT NULL,
  price_beans BIGINT NOT NULL DEFAULT 0,
  granted_at BIGINT NOT NULL,
  expires_at BIGINT NOT NULL DEFAULT 0,
  meta_json TEXT NOT NULL,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL,
  PRIMARY KEY (account_id, sku),
  INDEX idx_user_entitlements_sku (sku),
  INDEX idx_user_entitlements_granted (granted_at),
  CONSTRAINT fk_user_entitlements_account
    FOREIGN KEY (account_id) REFERENCES wallets(account_id),
  CHECK (price_beans >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
