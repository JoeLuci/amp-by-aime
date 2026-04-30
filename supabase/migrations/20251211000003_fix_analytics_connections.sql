-- Migration: Fix analytics dashboard to count actual connections
-- The dashboard was looking for 'contact' events in analytics_events,
-- but connections are stored in lender_connections and vendor_connections tables

-- Drop existing function first (return type changed)
DROP FUNCTION IF EXISTS get_admin_dashboard_metrics(timestamp with time zone, timestamp with time zone);

CREATE OR REPLACE FUNCTION get_admin_dashboard_metrics(
  p_start_date TIMESTAMPTZ,
  p_end_date TIMESTAMPTZ
)
RETURNS TABLE (
  total_views BIGINT,
  vendor_connections BIGINT,
  lender_connections BIGINT,
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

    -- Count from actual vendor_connections table
    (SELECT COUNT(*) FROM vendor_connections vc
     WHERE vc.created_at >= p_start_date AND vc.created_at <= p_end_date) as vendor_connections,

    -- Count from actual lender_connections table
    (SELECT COUNT(*) FROM lender_connections lc
     WHERE lc.created_at >= p_start_date AND lc.created_at <= p_end_date) as lender_connections,

    COUNT(DISTINCT ae.user_id) as unique_users,
    COUNT(DISTINCT ae.session_id) as unique_sessions,

    (
      SELECT jsonb_agg(row_to_json(top))
      FROM (
        SELECT
          ae2.content_title,
          ae2.content_id,
          COUNT(*) FILTER (WHERE ae2.event_type = 'view') as views_count,
          COUNT(DISTINCT ae2.user_id) as unique_users
        FROM analytics_events ae2
        WHERE ae2.content_type = 'resource'
          AND ae2.created_at >= p_start_date
          AND ae2.created_at <= p_end_date
        GROUP BY ae2.content_id, ae2.content_title
        ORDER BY views_count DESC
        LIMIT 10
      ) top
    ) as top_resources,

    (
      SELECT jsonb_agg(row_to_json(top))
      FROM (
        SELECT
          ae2.content_title,
          ae2.content_id,
          COUNT(*) FILTER (WHERE ae2.event_type = 'view') as views_count,
          -- Count actual vendor connections for this vendor
          (SELECT COUNT(*) FROM vendor_connections vc
           WHERE vc.vendor_id::text = ae2.content_id::text
             AND vc.created_at >= p_start_date
             AND vc.created_at <= p_end_date) as connections_count,
          COUNT(DISTINCT ae2.user_id) as unique_users
        FROM analytics_events ae2
        WHERE ae2.content_type = 'vendor'
          AND ae2.created_at >= p_start_date
          AND ae2.created_at <= p_end_date
        GROUP BY ae2.content_id, ae2.content_title
        ORDER BY views_count DESC
        LIMIT 10
      ) top
    ) as top_vendors,

    (
      SELECT jsonb_agg(row_to_json(top))
      FROM (
        SELECT
          ae2.content_title,
          ae2.content_id,
          COUNT(*) FILTER (WHERE ae2.event_type = 'view') as views_count,
          -- Count actual lender connections for this lender
          (SELECT COUNT(*) FROM lender_connections lc
           WHERE lc.lender_id::text = ae2.content_id::text
             AND lc.created_at >= p_start_date
             AND lc.created_at <= p_end_date) as connections_count,
          COUNT(DISTINCT ae2.user_id) as unique_users
        FROM analytics_events ae2
        WHERE ae2.content_type = 'lender'
          AND ae2.created_at >= p_start_date
          AND ae2.created_at <= p_end_date
        GROUP BY ae2.content_id, ae2.content_title
        ORDER BY views_count DESC
        LIMIT 10
      ) top
    ) as top_lenders,

    (
      SELECT jsonb_agg(row_to_json(top))
      FROM (
        SELECT
          ae2.content_title,
          ae2.content_id,
          COUNT(*) FILTER (WHERE ae2.event_type = 'view') as views_count,
          COUNT(DISTINCT ae2.user_id) as unique_users
        FROM analytics_events ae2
        WHERE ae2.content_type = 'event'
          AND ae2.created_at >= p_start_date
          AND ae2.created_at <= p_end_date
        GROUP BY ae2.content_id, ae2.content_title
        ORDER BY views_count DESC
        LIMIT 10
      ) top
    ) as top_events,

    (
      SELECT jsonb_agg(row_to_json(plan_stats))
      FROM (
        SELECT
          COALESCE(p.plan_tier, 'free') as plan_tier,
          COUNT(DISTINCT ae2.user_id) as unique_users,
          COUNT(*) FILTER (WHERE ae2.event_type = 'view' AND ae2.content_type = 'resource') as resource_views,
          COUNT(*) FILTER (WHERE ae2.event_type = 'view' AND ae2.content_type = 'vendor') as vendor_views,
          COUNT(*) FILTER (WHERE ae2.event_type = 'view' AND ae2.content_type = 'lender') as lender_views,
          COUNT(*) FILTER (WHERE ae2.event_type = 'view' AND ae2.content_type = 'event') as event_views,
          -- Count actual connections by plan tier
          (SELECT COUNT(*) FROM vendor_connections vc
           JOIN profiles vp ON vc.user_id = vp.id
           WHERE vp.plan_tier = COALESCE(p.plan_tier, 'free')
             AND vc.created_at >= p_start_date
             AND vc.created_at <= p_end_date) as vendor_connections,
          (SELECT COUNT(*) FROM lender_connections lc
           JOIN profiles lp ON lc.user_id = lp.id
           WHERE lp.plan_tier = COALESCE(p.plan_tier, 'free')
             AND lc.created_at >= p_start_date
             AND lc.created_at <= p_end_date) as lender_connections
        FROM analytics_events ae2
        LEFT JOIN profiles p ON ae2.user_id = p.id
        WHERE ae2.created_at >= p_start_date
          AND ae2.created_at <= p_end_date
        GROUP BY p.plan_tier
        ORDER BY unique_users DESC
      ) plan_stats
    ) as engagement_by_plan,

    (
      SELECT jsonb_agg(row_to_json(daily))
      FROM (
        SELECT
          DATE(ae2.created_at) as date,
          COUNT(*) FILTER (WHERE ae2.event_type = 'view') as views,
          -- Count actual daily connections
          (SELECT COUNT(*) FROM vendor_connections vc WHERE DATE(vc.created_at) = DATE(ae2.created_at)) +
          (SELECT COUNT(*) FROM lender_connections lc WHERE DATE(lc.created_at) = DATE(ae2.created_at)) as connections,
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
