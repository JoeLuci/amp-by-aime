-- Function to get detailed content analytics
CREATE OR REPLACE FUNCTION get_content_analytics(
  p_content_type TEXT,
  p_content_id UUID,
  p_start_date TIMESTAMPTZ,
  p_end_date TIMESTAMPTZ,
  p_group_by TEXT DEFAULT 'day'
)
RETURNS TABLE (
  period TIMESTAMPTZ,
  total_views BIGINT,
  unique_users BIGINT,
  total_clicks BIGINT,
  total_downloads BIGINT,
  total_contacts BIGINT,
  plan_breakdown JSONB,
  event_breakdown JSONB
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    DATE_TRUNC(p_group_by, ae.created_at) as period,
    COUNT(*) FILTER (WHERE ae.event_type = 'view') as total_views,
    COUNT(DISTINCT ae.user_id) as unique_users,
    COUNT(*) FILTER (WHERE ae.event_type = 'click') as total_clicks,
    COUNT(*) FILTER (WHERE ae.event_type = 'download') as total_downloads,
    COUNT(*) FILTER (WHERE ae.event_type = 'contact') as total_contacts,
    jsonb_object_agg(
      COALESCE(ae.user_plan_tier::TEXT, 'Free'),
      COUNT(*)
    ) FILTER (WHERE ae.user_plan_tier IS NOT NULL) as plan_breakdown,
    jsonb_object_agg(
      ae.event_type,
      COUNT(*)
    ) as event_breakdown
  FROM analytics_events ae
  WHERE ae.content_type = p_content_type
    AND ae.content_id = p_content_id
    AND ae.created_at >= p_start_date
    AND ae.created_at <= p_end_date
  GROUP BY DATE_TRUNC(p_group_by, ae.created_at)
  ORDER BY period DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get admin dashboard summary
CREATE OR REPLACE FUNCTION get_admin_dashboard_metrics(
  p_start_date TIMESTAMPTZ,
  p_end_date TIMESTAMPTZ
)
RETURNS TABLE (
  total_views BIGINT,
  total_clicks BIGINT,
  total_contacts BIGINT,
  unique_users BIGINT,
  unique_sessions BIGINT,
  top_resources JSONB,
  top_vendors JSONB,
  top_lenders JSONB,
  top_events JSONB,
  engagement_by_plan JSONB,
  daily_trends JSONB
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*) FILTER (WHERE ae.event_type = 'view') as total_views,
    COUNT(*) FILTER (WHERE ae.event_type = 'click') as total_clicks,
    COUNT(*) FILTER (WHERE ae.event_type = 'contact') as total_contacts,
    COUNT(DISTINCT ae.user_id) as unique_users,
    COUNT(DISTINCT ae.session_id) as unique_sessions,

    -- Top resources
    (
      SELECT jsonb_agg(row_to_json(top))
      FROM (
        SELECT
          ae2.content_title,
          COUNT(*) as engagement_count,
          COUNT(DISTINCT ae2.user_id) as unique_users
        FROM analytics_events ae2
        WHERE ae2.content_type = 'resource'
          AND ae2.created_at >= p_start_date
          AND ae2.created_at <= p_end_date
        GROUP BY ae2.content_id, ae2.content_title
        ORDER BY engagement_count DESC
        LIMIT 10
      ) top
    ) as top_resources,

    -- Top vendors
    (
      SELECT jsonb_agg(row_to_json(top))
      FROM (
        SELECT
          ae2.content_title,
          COUNT(*) as engagement_count,
          COUNT(DISTINCT ae2.user_id) as unique_users
        FROM analytics_events ae2
        WHERE ae2.content_type = 'vendor'
          AND ae2.created_at >= p_start_date
          AND ae2.created_at <= p_end_date
        GROUP BY ae2.content_id, ae2.content_title
        ORDER BY engagement_count DESC
        LIMIT 10
      ) top
    ) as top_vendors,

    -- Top lenders
    (
      SELECT jsonb_agg(row_to_json(top))
      FROM (
        SELECT
          ae2.content_title,
          COUNT(*) as engagement_count,
          COUNT(DISTINCT ae2.user_id) as unique_users
        FROM analytics_events ae2
        WHERE ae2.content_type = 'lender'
          AND ae2.created_at >= p_start_date
          AND ae2.created_at <= p_end_date
        GROUP BY ae2.content_id, ae2.content_title
        ORDER BY engagement_count DESC
        LIMIT 10
      ) top
    ) as top_lenders,

    -- Top events
    (
      SELECT jsonb_agg(row_to_json(top))
      FROM (
        SELECT
          ae2.content_title,
          COUNT(*) as engagement_count,
          COUNT(DISTINCT ae2.user_id) as unique_users
        FROM analytics_events ae2
        WHERE ae2.content_type = 'event'
          AND ae2.created_at >= p_start_date
          AND ae2.created_at <= p_end_date
        GROUP BY ae2.content_id, ae2.content_title
        ORDER BY engagement_count DESC
        LIMIT 10
      ) top
    ) as top_events,

    -- Engagement by plan tier
    (
      SELECT jsonb_object_agg(user_plan_tier, event_count)
      FROM (
        SELECT
          COALESCE(ae2.user_plan_tier::TEXT, 'Free') as user_plan_tier,
          COUNT(*) as event_count
        FROM analytics_events ae2
        WHERE ae2.created_at >= p_start_date
          AND ae2.created_at <= p_end_date
        GROUP BY user_plan_tier
      ) plan_stats
    ) as engagement_by_plan,

    -- Daily trends
    (
      SELECT jsonb_agg(row_to_json(daily))
      FROM (
        SELECT
          DATE(ae2.created_at) as date,
          COUNT(*) as events,
          COUNT(DISTINCT ae2.user_id) as unique_users,
          COUNT(DISTINCT ae2.session_id) as unique_sessions
        FROM analytics_events ae2
        WHERE ae2.created_at >= p_start_date
          AND ae2.created_at <= p_end_date
        GROUP BY DATE(ae2.created_at)
        ORDER BY date DESC
      ) daily
    ) as daily_trends

  FROM analytics_events ae
  WHERE ae.created_at >= p_start_date
    AND ae.created_at <= p_end_date;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get conversion funnel data
CREATE OR REPLACE FUNCTION get_conversion_funnel(
  p_start_date TIMESTAMPTZ,
  p_end_date TIMESTAMPTZ
)
RETURNS TABLE (
  content_type TEXT,
  content_title TEXT,
  total_conversions BIGINT,
  conversion_value NUMERIC,
  avg_time_to_convert INTERVAL
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    ca.attributed_content_type as content_type,
    ca.attributed_content_title as content_title,
    COUNT(*) as total_conversions,
    SUM(
      CASE ca.to_tier
        WHEN 'Premium' THEN 99.00
        WHEN 'Elite' THEN 199.00
        WHEN 'VIP' THEN 299.00
        ELSE 0
      END
    ) as conversion_value,
    AVG(
      ca.conversion_date - (
        SELECT MIN(ae.created_at)
        FROM analytics_events ae
        WHERE ae.user_id = ca.user_id
          AND ae.content_type = ca.attributed_content_type
          AND ae.content_id = ca.attributed_content_id
      )
    ) as avg_time_to_convert
  FROM conversion_attributions ca
  WHERE ca.conversion_date >= p_start_date
    AND ca.conversion_date <= p_end_date
    AND ca.attributed_content_type IS NOT NULL
  GROUP BY ca.attributed_content_type, ca.attributed_content_title
  ORDER BY total_conversions DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION get_content_analytics IS 'Get detailed analytics for specific content item';
COMMENT ON FUNCTION get_admin_dashboard_metrics IS 'Get aggregated metrics for admin dashboard';
COMMENT ON FUNCTION get_conversion_funnel IS 'Get conversion attribution data showing which content drives subscriptions';
