-- IAP 与平台币兑换默认启用迁移
-- 对已存在的商品做幂等修正；新库由全量基线和历史建表默认值保证启用。

UPDATE iap_products
SET enabled_android = 1,
    enabled_ios = 1,
    updated_at = UNIX_TIMESTAMP() * 1000
WHERE enabled_android <> 1
   OR enabled_ios <> 1;

UPDATE platform_exchange_products
SET enabled = 1,
    updated_at = UNIX_TIMESTAMP() * 1000
WHERE enabled <> 1;
