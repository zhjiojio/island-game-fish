-- ============================================================
-- 给 accounts 增加 nickname 列，供 admin 后台按昵称检索
-- ------------------------------------------------------------
-- 背景：昵称由客户端通过 KwaiOpen.getUserInfo 获取后，在业务消息里自报
-- （auth 帧不含昵称，快手 code2session 也不返回昵称），因此该列是
-- 「最近一次上报值」的缓存，不是权威身份字段，允许为空/过期。
--
-- 幂等：重复执行不会报错（MySQL 8.0 不支持 ADD COLUMN IF NOT EXISTS，
-- 故先查 INFORMATION_SCHEMA）。
--
-- 执行：由 DBA 在 prod 库执行，或 server 目录下 npm run db:init:mysql
--       （migrateMysql 里也有同样的 ensureIapColumn 补列逻辑）。
--
-- 注意：列未就绪时服务端不会崩——account-store.updateNickname 吞掉
--       ER_BAD_FIELD_ERROR，admin 列表也会退回不带昵称的查询。补列后
--       无需重启，下一次有用户上报昵称即开始填充。
-- ============================================================

SET @col_exists := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'accounts'
    AND COLUMN_NAME = 'nickname'
);

SET @ddl := IF(
  @col_exists = 0,
  'ALTER TABLE accounts ADD COLUMN nickname VARCHAR(64) NOT NULL DEFAULT '''' AFTER ban_reason',
  'SELECT ''accounts.nickname already exists'' AS skip'
);

PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
