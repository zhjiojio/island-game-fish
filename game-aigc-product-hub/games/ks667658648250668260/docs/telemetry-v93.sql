-- Spark SQL 示例。先对接真实数仓表/字段：customize_scene、app_id、device_id、event_time、dt。
-- dimension/metric 假设 MAP<STRING,STRING>，若实际是 JSON 字符串先 from_json。
-- device_id 仅代表设备；若有合规稳定账号字段，可整体替换 subject_id 的映射。
-- 所有指标使用同一 AppID、版本、时间窗。不能把不同版本的字典/口径混用。
CREATE OR REPLACE TEMP VIEW telemetry_v93_base AS
SELECT * FROM (
  SELECT CAST(device_id AS STRING) AS subject_id,
    dimension['boot_id'] AS boot_id,
    CAST(scene_id AS INT) AS scene_id, event_time,
    dimension['event_key'] AS event_key,
    dimension['chapter_id'] AS chapter_id,
    dimension['node_id'] AS node_id,
    dimension['option_id'] AS option_id,
    dimension['source'] AS source,
    dimension['entry_source'] AS entry_source,
    CAST(metric['delta_ms'] AS DOUBLE) AS delta_ms,
    ROW_NUMBER() OVER (
      PARTITION BY device_id, dimension['boot_id'], scene_id ORDER BY event_time
    ) AS rn
  FROM customize_scene
  WHERE app_id = 'ks667658648250668260'
    AND dt BETWEEN '${start_date}' AND '${end_date}'
    AND dimension['v'] = 'v93.0.0'
    AND dimension['game_version'] = 'v92.6'
    AND COALESCE(dimension['admin_bypass'], '0') = '0'
    AND device_id IS NOT NULL AND dimension['boot_id'] IS NOT NULL
) t WHERE rn = 1;

-- 1. 各卡片选择率。按同一用户同一章节聚合，再取曝光和点击交集。
WITH user_card AS (
 SELECT subject_id, chapter_id,
   MAX(CASE WHEN event_key LIKE 'card_view:%' THEN 1 ELSE 0 END) AS viewed,
   MAX(CASE WHEN event_key LIKE 'card_click:%' THEN 1 ELSE 0 END) AS clicked
 FROM telemetry_v93_base WHERE event_key LIKE 'card_view:%' OR event_key LIKE 'card_click:%'
 GROUP BY subject_id, chapter_id
)
SELECT chapter_id, SUM(viewed) AS view_uv,
  SUM(CASE WHEN viewed=1 AND clicked=1 THEN 1 ELSE 0 END) AS click_uv_matched,
  SUM(CASE WHEN viewed=1 AND clicked=1 THEN 1 ELSE 0 END)*1.0 / NULLIF(SUM(viewed),0) AS card_ctr,
  SUM(CASE WHEN viewed=0 AND clicked=1 THEN 1 ELSE 0 END) AS click_without_view_uv
FROM user_card GROUP BY chapter_id;

-- 2. 所有页面类型/节点/章节的同期到达 UV 占启动 UV 比例。
-- 不是有顺序约束的单次会话漏斗；节点按 chapter_id 分层也可换分母为本章 chapter_ready UV。
WITH startup AS (SELECT COUNT(DISTINCT subject_id) AS startup_uv FROM telemetry_v93_base WHERE scene_id=8001)
SELECT event_key, scene_id, chapter_id, node_id, COUNT(DISTINCT subject_id) AS reach_uv,
  COUNT(DISTINCT subject_id)*1.0 / NULLIF(MAX(startup_uv),0) AS reach_per_startup_uv
FROM telemetry_v93_base CROSS JOIN startup
WHERE event_key LIKE 'node_view:%' OR event_key LIKE 'page_view:%' OR event_key LIKE 'chapter_ready:%'
   OR scene_id BETWEEN 8060 AND 8066
GROUP BY event_key, scene_id, chapter_id, node_id;

-- 3. 每个选项的曝光点击率和点击后执行率。无点击的已曝光选项也返回 0。
WITH user_option AS (
 SELECT subject_id, node_id, option_id,
   MAX(CASE WHEN event_key LIKE 'option_view:%' THEN 1 ELSE 0 END) AS viewed,
   MAX(CASE WHEN event_key LIKE 'option_click:%' THEN 1 ELSE 0 END) AS clicked,
   MAX(CASE WHEN event_key LIKE 'option_commit:%' THEN 1 ELSE 0 END) AS committed
 FROM telemetry_v93_base WHERE event_key LIKE 'option_%:%'
 GROUP BY subject_id, node_id, option_id
)
SELECT node_id, option_id, SUM(viewed) AS view_uv, SUM(clicked) AS click_uv,
  SUM(CASE WHEN clicked=1 AND viewed=1 THEN 1 ELSE 0 END)*1.0/NULLIF(SUM(viewed),0) AS option_ctr,
  SUM(CASE WHEN committed=1 AND clicked=1 THEN 1 ELSE 0 END)*1.0/NULLIF(SUM(clicked),0) AS commit_per_click,
  SUM(CASE WHEN clicked=1 AND viewed=0 THEN 1 ELSE 0 END) AS click_without_view_uv
FROM user_option GROUP BY node_id, option_id;

-- 4. 每启动每节点互斥首选分布。改 node_first_commit 得首次执行分布。
WITH picks AS (
 SELECT node_id, option_id, COUNT(*) AS first_pick_boots
 FROM telemetry_v93_base WHERE event_key LIKE 'node_first_choice:%'
 GROUP BY node_id, option_id
)
SELECT *,first_pick_boots*1.0/SUM(first_pick_boots) OVER(PARTITION BY node_id) AS first_pick_share
FROM picks;
-- 若要每用户本时间窗首次选择，先将 node_first_choice 按 subject_id,node_id
-- 用 ROW_NUMBER() OVER(PARTITION BY subject_id,node_id ORDER BY event_time,boot_id) 取 1 再聚合。

-- 5. 章节人均已采集有效时长：先按用户汇总多个启动，再除以所有内容到达用户。
WITH entrants AS (
 SELECT DISTINCT subject_id,chapter_id FROM telemetry_v93_base WHERE event_key LIKE 'chapter_ready:%'
), duration AS (
 SELECT subject_id,chapter_id,SUM(delta_ms)/1000 AS seconds
 FROM telemetry_v93_base WHERE scene_id BETWEEN 20000 AND 20255
 GROUP BY subject_id,chapter_id
), users AS (
 SELECT e.subject_id,e.chapter_id,COALESCE(d.seconds,0) AS seconds,
   CASE WHEN d.seconds IS NOT NULL THEN 1 ELSE 0 END AS has_duration
 FROM entrants e LEFT JOIN duration d ON e.subject_id=d.subject_id AND e.chapter_id=d.chapter_id
)
SELECT chapter_id,COUNT(*) AS entrant_uv,AVG(seconds) AS observed_avg_sec,
  percentile_approx(seconds,0.5) AS observed_p50_sec,
  AVG(has_duration*1.0) AS duration_user_coverage
FROM users GROUP BY chapter_id;

-- 6. 有内容到达的启动中，时长耗尽和明确投递失败的比例。
WITH boots AS (
 SELECT subject_id,boot_id,
   MAX(CASE WHEN event_key LIKE 'chapter_ready:%' THEN 1 ELSE 0 END) AS played,
   MAX(CASE WHEN event_key='duration_exhausted' THEN 1 ELSE 0 END) AS exhausted,
   MAX(CASE WHEN event_key='transport_issue' THEN 1 ELSE 0 END) AS transport_failed
 FROM telemetry_v93_base GROUP BY subject_id,boot_id
)
SELECT SUM(played) AS played_boots,
  SUM(CASE WHEN played=1 THEN exhausted ELSE 0 END)*1.0/NULLIF(SUM(played),0) AS duration_exhausted_rate,
  SUM(CASE WHEN played=1 THEN transport_failed ELSE 0 END)*1.0/NULLIF(SUM(played),0) AS observed_transport_issue_rate
FROM boots;
-- 失败诊断也可能投递失败，故此比例并非完整网络失败率。

-- 7. 首页/转场解锁阶段。各阶段为启动内曾发生，不保证严格单调（用户可取消后重试）。
SELECT chapter_id,source,event_key,COUNT(DISTINCT subject_id) AS uv,COUNT(*) AS boot_event_count
FROM telemetry_v93_base
WHERE event_key LIKE 'chapter_ad_%:%' OR event_key LIKE 'preview_%:%'
GROUP BY chapter_id,source,event_key;

-- 8. 从首页卡片点击到本章内容可见的同期用户转化；连续转场进入不算首页转化。
WITH users AS (
 SELECT subject_id,chapter_id,
   MAX(CASE WHEN event_key LIKE 'card_click:%' THEN 1 ELSE 0 END) AS clicked,
   MAX(CASE WHEN event_key LIKE 'chapter_ready:%' AND entry_source IN ('chapter_home','resume') THEN 1 ELSE 0 END) AS ready
 FROM telemetry_v93_base
 WHERE event_key LIKE 'card_click:%' OR event_key LIKE 'chapter_ready:%'
 GROUP BY subject_id,chapter_id
)
SELECT chapter_id,SUM(clicked) AS click_uv,
 SUM(CASE WHEN clicked=1 AND ready=1 THEN 1 ELSE 0 END)*1.0/NULLIF(SUM(clicked),0) AS home_content_conversion
FROM users GROUP BY chapter_id;

-- 8. v92.5 视频内「拖拽解锁」互动漏斗（op1 脱外套）。每个 event_key 每启动一次 = UV 口径。
--    arm 是分母（引导层真的出现过），ok 是分子（撒花并恢复播放）。
--    fail 不是异常率：三重校验故意严格，玩家滑歪重来是正常行为，看 reason 分布定位卡点。
WITH du AS (
 SELECT subject_id, boot_id,
   MAX(CASE WHEN event_key='drag_unlock_arm'  THEN 1 ELSE 0 END) AS armed,
   MAX(CASE WHEN event_key='drag_unlock_try'  THEN 1 ELSE 0 END) AS tried,
   MAX(CASE WHEN event_key='drag_unlock_fail' THEN 1 ELSE 0 END) AS failed,
   MAX(CASE WHEN event_key='drag_unlock_ok'   THEN 1 ELSE 0 END) AS okd
 FROM telemetry_v93_base WHERE event_key LIKE 'drag_unlock_%'
 GROUP BY subject_id, boot_id
)
SELECT COUNT(*) AS arm_boots,
  SUM(tried) AS try_boots,  SUM(tried)*1.0/NULLIF(COUNT(*),0)      AS try_rate,
  SUM(okd)   AS ok_boots,   SUM(okd)*1.0/NULLIF(COUNT(*),0)        AS complete_rate,
  SUM(failed) AS had_fail_boots,
  SUM(CASE WHEN tried=1 AND okd=0 THEN 1 ELSE 0 END) AS stuck_boots   -- 试过但始终没完成 = 硬卡住
FROM du WHERE armed=1;

-- 8b. 失败原因分布 + 平均到达进度（定位是「假拖拽」还是「差最后一点没进圈」）。
SELECT dimension_reason AS reason, COUNT(*) AS uv, AVG(max_progress) AS avg_progress_pct
FROM (
  SELECT subject_id, boot_id, dimension['reason'] AS dimension_reason,
    CAST(metric['max_progress'] AS DOUBLE) AS max_progress
  FROM customize_scene
  WHERE app_id='ks667658648250668260' AND dt BETWEEN '${start_date}' AND '${end_date}'
    AND dimension['v']='v93.0.0' AND dimension['game_version']='v92.6'
    AND dimension['event_key']='drag_unlock_fail'
) t GROUP BY dimension_reason ORDER BY uv DESC;

-- 9. v92.6 免广告通行证是否全链路生效。ad_pass_skip 出现后，同一 boot 内不应再有任何广告请求。
--    若 leaked_boots > 0 说明还有调起点绕过了 showRewardedGated 闸门，属于代码缺陷而非数据问题。
WITH pass AS (
 SELECT subject_id, boot_id,
   MAX(CASE WHEN event_key='ad_pass_skip' THEN 1 ELSE 0 END) AS skipped,
   MIN(CASE WHEN event_key='ad_pass_skip' THEN event_time END) AS first_skip_at
 FROM telemetry_v93_base GROUP BY subject_id, boot_id
),
ads AS (
 SELECT b.subject_id, b.boot_id, MIN(b.event_time) AS ad_after_skip_at
 FROM telemetry_v93_base b JOIN pass p
   ON b.subject_id=p.subject_id AND b.boot_id=p.boot_id
 WHERE p.skipped=1 AND b.event_time > p.first_skip_at
   AND (b.event_key LIKE 'chapter_ad_request:%' OR b.event_key LIKE 'chapter_ad_ok:%')
 GROUP BY b.subject_id, b.boot_id
)
SELECT (SELECT COUNT(*) FROM pass WHERE skipped=1) AS pass_active_boots,
       (SELECT COUNT(*) FROM ads)                 AS leaked_boots;

-- 9b. 被免掉的广告位分布（哪个入口最常吃到免广告特权）。
SELECT dimension['ad_slot'] AS ad_slot, COUNT(DISTINCT dimension['boot_id']) AS boots
FROM customize_scene
WHERE app_id='ks667658648250668260' AND dt BETWEEN '${start_date}' AND '${end_date}'
  AND dimension['v']='v93.0.0' AND dimension['game_version']='v92.6'
  AND dimension['event_key']='ad_pass_skip'
GROUP BY dimension['ad_slot'] ORDER BY boots DESC;
