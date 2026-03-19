-- Materialized views for performance (refreshed hourly)

-- Content engagement summary (90 day rolling window)
CREATE MATERIALIZED VIEW content_engagement_summary AS
SELECT
  content_type,
  content_id,
  content_title,
  COUNT(DISTINCT user_id) as unique_users,
  COUNT(DISTINCT session_id) as unique_sessions,
  COUNT(*) as total_events,
  COUNT(*) FILTER (WHERE event_type = 'view') as views,
  COUNT(*) FILTER (WHERE event_type = 'click') as clicks,
  COUNT(*) FILTER (WHERE event_type = 'download') as downloads,
  COUNT(*) FILTER (WHERE event_type = 'contact') as contacts,
  MAX(created_at) as last_interaction,
  DATE_TRUNC('day', created_at) as date
FROM analytics_events
WHERE created_at >= NOW() - INTERVAL '90 days'
GROUP BY content_type, content_id, content_title, DATE_TRUNC('day', created_at);

CREATE UNIQUE INDEX idx_content_engagement_unique
  ON content_engagement_summary(content_type, content_id, date);

-- User engagement summary by plan tier
CREATE MATERIALIZED VIEW user_plan_engagement AS
SELECT
  user_plan_tier,
  DATE_TRUNC('day', created_at) as date,
  COUNT(DISTINCT user_id) as active_users,
  COUNT(*) as total_events,
  COUNT(DISTINCT content_id) as unique_content_viewed
FROM analytics_events
WHERE user_id IS NOT NULL
  AND created_at >= NOW() - INTERVAL '90 days'
GROUP BY user_plan_tier, DATE_TRUNC('day', created_at);

CREATE UNIQUE INDEX idx_user_plan_engagement_unique
  ON user_plan_engagement(user_plan_tier, date);

-- Daily platform metrics (180 day rolling window)
CREATE MATERIALIZED VIEW daily_platform_metrics AS
SELECT
  DATE_TRUNC('day', created_at) as date,
  COUNT(DISTINCT user_id) as daily_active_users,
  COUNT(DISTINCT session_id) as unique_sessions,
  COUNT(*) FILTER (WHERE content_type = 'resource') as resource_interactions,
  COUNT(*) FILTER (WHERE content_type = 'vendor') as vendor_interactions,
  COUNT(*) FILTER (WHERE content_type = 'lender') as lender_interactions,
  COUNT(*) FILTER (WHERE content_type = 'event') as event_interactions,
  COUNT(*) as total_events
FROM analytics_events
WHERE created_at >= NOW() - INTERVAL '180 days'
GROUP BY DATE_TRUNC('day', created_at);

CREATE UNIQUE INDEX idx_daily_platform_metrics_unique
  ON daily_platform_metrics(date);

-- Function to refresh all materialized views
CREATE OR REPLACE FUNCTION refresh_analytics_views()
RETURNS void AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY content_engagement_summary;
  REFRESH MATERIALIZED VIEW CONCURRENTLY user_plan_engagement;
  REFRESH MATERIALIZED VIEW CONCURRENTLY daily_platform_metrics;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION refresh_analytics_views IS 'Refresh all analytics materialized views (run hourly via cron)';

-- Schedule automatic refresh (requires pg_cron extension)
-- Run this manually in Supabase SQL Editor if pg_cron is enabled:
-- SELECT cron.schedule('refresh-analytics', '0 * * * *', 'SELECT refresh_analytics_views()');
