-- 20260919_config_center.sql — 数值配置中心
-- 主控/派生分离、版本与回滚、变更审计、灰度下发。
-- 派生项不入库：一律由 config-store.deriveEffective() 在读取时计算。

CREATE TABLE IF NOT EXISTS config_items (
  config_key   VARCHAR(96)  NOT NULL PRIMARY KEY,
  scope        VARCHAR(32)  NOT NULL DEFAULT 'global',
  value_json   TEXT         NOT NULL,
  description  VARCHAR(255) NOT NULL DEFAULT '',
  updated_at   BIGINT       NOT NULL,
  updated_by   VARCHAR(64)  NOT NULL DEFAULT 'system',
  version      INT          NOT NULL DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS config_versions (
  version      INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
  payload_json TEXT         NOT NULL,
  operator     VARCHAR(64)  NOT NULL DEFAULT 'system',
  comment      VARCHAR(255) NOT NULL DEFAULT '',
  created_at   BIGINT       NOT NULL,
  INDEX idx_config_versions_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS config_audit (
  id             BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
  version        INT          NOT NULL,
  operator       VARCHAR(64)  NOT NULL DEFAULT 'system',
  config_key     VARCHAR(96)  NOT NULL,
  old_value_json TEXT         NULL,
  new_value_json TEXT         NULL,
  created_at     BIGINT       NOT NULL,
  INDEX idx_config_audit_version (version),
  INDEX idx_config_audit_key (config_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
