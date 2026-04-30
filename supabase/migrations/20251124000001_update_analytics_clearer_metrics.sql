-- Update the get_admin_dashboard_metrics function to return clearer metrics
-- Views and Connections separately for Lenders/Vendors
-- Views only for Resources/Events

CREATE OR REPLACE FUNCTION public.get_admin_dashboard_metrics(p_start_date timestamp with time zone, p_end_date timestamp with time zone)
RETURNS TABLE(
  total_views bigint,
  total_clicks bigint,
  total_contacts bigint,
  unique_users bigint,
  unique_sessions bigint,
  top_resources jsonb,
  top_vendors jsonb,
  top_lenders jsonb,
  top_events jsonb,
  engagement_by_plan jsonb,
  daily_trends jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*) FILTER (WHERE ae.event_type = 'view') as total_views,
    COUNT(*) FILTER (WHERE ae.event_type = 'click') as total_clicks,
    COUNT(*) FILTER (WHERE ae.event_type = 'contact') as total_contacts,
    COUNT(DISTINCT ae.user_id) as unique_users,
    COUNT(DISTINCT ae.session_id) as unique_sessions,

    -- Top resources (views only)
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

    -- Top vendors (views and connections)
    (
      SELECT jsonb_agg(row_to_json(top))
      FROM (
        SELECT
          ae2.content_title,
          ae2.content_id,
          COUNT(*) FILTER (WHERE ae2.event_type = 'view') as views_count,
          COUNT(*) FILTER (WHERE ae2.event_type = 'contact') as connections_count,
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

    -- Top lenders (views and connections)
    (
      SELECT jsonb_agg(row_to_json(top))
      FROM (
        SELECT
          ae2.content_title,
          ae2.content_id,
          COUNT(*) FILTER (WHERE ae2.event_type = 'view') as views_count,
          COUNT(*) FILTER (WHERE ae2.event_type = 'contact') as connections_count,
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

    -- Top events (views only)
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
          COUNT(*) FILTER (WHERE ae2.event_type = 'view') as views,
          COUNT(*) FILTER (WHERE ae2.event_type = 'contact') as connections,
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
$function$;
