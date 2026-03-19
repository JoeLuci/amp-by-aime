-- Migration: Rename 'Free' tier to 'None'
-- There is no free tier - 'None' represents users without a subscription

-- Step 1: Add 'None' to the plan_tier enum
ALTER TYPE plan_tier ADD VALUE IF NOT EXISTS 'None';

-- Step 2: Update all profiles with 'Free' tier to 'None'
UPDATE profiles SET plan_tier = 'None' WHERE plan_tier = 'Free';

-- Step 3: Update subscription_plans table
UPDATE subscription_plans SET plan_tier = 'None' WHERE plan_tier = 'Free';

-- Step 4: Update the default for profiles table (if it was 'Free')
ALTER TABLE profiles ALTER COLUMN plan_tier SET DEFAULT 'None';

-- Step 5: Update all database functions that reference 'Free'

-- Update get_active_subscribers_count function
CREATE OR REPLACE FUNCTION get_active_subscribers_count()
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(*)::integer
  FROM profiles
  WHERE subscription_status = 'active'
    AND plan_tier NOT IN ('None', 'Pending Checkout', 'Canceled')
    AND is_admin = false;
$$;

-- Update get_plan_distribution function
CREATE OR REPLACE FUNCTION get_plan_distribution()
RETURNS TABLE(plan_tier text, count bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    COALESCE(plan_tier::text, 'None') as plan_tier,
    COUNT(*) as count
  FROM profiles
  WHERE is_admin = false
    AND plan_tier NOT IN ('None', 'Pending Checkout')
  GROUP BY plan_tier
  ORDER BY count DESC;
$$;

-- Update get_analytics_daily_trends function
CREATE OR REPLACE FUNCTION get_analytics_daily_trends(
  start_date timestamp with time zone,
  end_date timestamp with time zone
)
RETURNS TABLE(
  date date,
  metric_type text,
  metric_value bigint,
  plan_tier text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH date_series AS (
    SELECT generate_series(start_date::date, end_date::date, '1 day'::interval)::date AS day
  ),
  -- Get views with plan tier info
  views_by_day AS (
    SELECT
      ae.created_at::date as day,
      COALESCE(p.plan_tier::text, 'None') as plan_tier,
      COUNT(*) as view_count
    FROM analytics_events ae
    LEFT JOIN profiles p ON ae.user_id = p.id
    WHERE ae.event_type = 'view'
      AND ae.created_at >= start_date
      AND ae.created_at <= end_date
      AND p.plan_tier NOT IN ('None', 'Pending Checkout')
    GROUP BY ae.created_at::date, p.plan_tier
  ),
  -- Get vendor connections
  vendor_connections_by_day AS (
    SELECT
      vc.created_at::date as day,
      COALESCE(vp.plan_tier::text, 'None') as plan_tier,
      COUNT(*) as connection_count
    FROM vendor_connections vc
    LEFT JOIN profiles vp ON vc.user_id = vp.id
    WHERE vc.created_at >= start_date
      AND vc.created_at <= end_date
      AND vp.plan_tier NOT IN ('None', 'Pending Checkout')
    GROUP BY vc.created_at::date, vp.plan_tier
  ),
  -- Get lender connections
  lender_connections_by_day AS (
    SELECT
      lc.created_at::date as day,
      COALESCE(lp.plan_tier::text, 'None') as plan_tier,
      COUNT(*) as connection_count
    FROM lender_connections lc
    LEFT JOIN profiles lp ON lc.user_id = lp.id
    WHERE lc.created_at >= start_date
      AND lc.created_at <= end_date
      AND lp.plan_tier NOT IN ('None', 'Pending Checkout')
    GROUP BY lc.created_at::date, lp.plan_tier
  ),
  -- Get unique active users
  active_users_by_day AS (
    SELECT
      ae.created_at::date as day,
      COALESCE(p.plan_tier::text, 'None') as plan_tier,
      COUNT(DISTINCT ae.user_id) as user_count
    FROM analytics_events ae
    LEFT JOIN profiles p ON ae.user_id = p.id
    WHERE ae.created_at >= start_date
      AND ae.created_at <= end_date
      AND p.plan_tier NOT IN ('None', 'Pending Checkout')
    GROUP BY ae.created_at::date, p.plan_tier
  )
  -- Combine all metrics
  SELECT ds.day as date, 'views'::text as metric_type, COALESCE(v.view_count, 0) as metric_value, COALESCE(v.plan_tier, 'All') as plan_tier
  FROM date_series ds
  LEFT JOIN views_by_day v ON ds.day = v.day
  UNION ALL
  SELECT ds.day as date, 'vendor_connections'::text as metric_type, COALESCE(vc.connection_count, 0) as metric_value, COALESCE(vc.plan_tier, 'All') as plan_tier
  FROM date_series ds
  LEFT JOIN vendor_connections_by_day vc ON ds.day = vc.day
  UNION ALL
  SELECT ds.day as date, 'lender_connections'::text as metric_type, COALESCE(lc.connection_count, 0) as metric_value, COALESCE(lc.plan_tier, 'All') as plan_tier
  FROM date_series ds
  LEFT JOIN lender_connections_by_day lc ON ds.day = lc.day
  UNION ALL
  SELECT ds.day as date, 'active_users'::text as metric_type, COALESCE(au.user_count, 0) as metric_value, COALESCE(au.plan_tier, 'All') as plan_tier
  FROM date_series ds
  LEFT JOIN active_users_by_day au ON ds.day = au.day
  ORDER BY date, metric_type, plan_tier;
END;
$$;

-- Update get_content_analytics function
CREATE OR REPLACE FUNCTION get_content_analytics(
  content_type_filter text,
  start_date timestamp with time zone,
  end_date timestamp with time zone
)
RETURNS TABLE(
  content_id uuid,
  content_title text,
  content_type text,
  views_count bigint,
  unique_viewers bigint,
  connections_count bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    ae.content_id,
    ae.content_title,
    ae.content_type,
    COUNT(*) FILTER (WHERE ae.event_type = 'view') as views_count,
    COUNT(DISTINCT ae.user_id) FILTER (WHERE ae.event_type = 'view') as unique_viewers,
    COUNT(*) FILTER (WHERE ae.event_type = 'connection') as connections_count
  FROM analytics_events ae
  LEFT JOIN profiles p ON ae.user_id = p.id
  WHERE ae.content_type = content_type_filter
    AND ae.created_at >= start_date
    AND ae.created_at <= end_date
    AND p.plan_tier NOT IN ('None', 'Pending Checkout')
  GROUP BY ae.content_id, ae.content_title, ae.content_type
  ORDER BY views_count DESC;
END;
$$;

-- Update get_analytics_overview function
CREATE OR REPLACE FUNCTION get_analytics_overview(
  start_date timestamp with time zone,
  end_date timestamp with time zone
)
RETURNS TABLE(
  total_views bigint,
  unique_viewers bigint,
  total_vendor_connections bigint,
  total_lender_connections bigint,
  total_event_registrations bigint,
  active_users bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    (SELECT COUNT(*) FROM analytics_events ae
     LEFT JOIN profiles p ON ae.user_id = p.id
     WHERE ae.event_type = 'view'
       AND ae.created_at >= start_date
       AND ae.created_at <= end_date
       AND p.plan_tier NOT IN ('None', 'Pending Checkout')) as total_views,
    (SELECT COUNT(DISTINCT user_id) FROM analytics_events ae
     LEFT JOIN profiles p ON ae.user_id = p.id
     WHERE ae.event_type = 'view'
       AND ae.created_at >= start_date
       AND ae.created_at <= end_date
       AND p.plan_tier NOT IN ('None', 'Pending Checkout')) as unique_viewers,
    (SELECT COUNT(*) FROM vendor_connections vc
     LEFT JOIN profiles p ON vc.user_id = p.id
     WHERE vc.created_at >= start_date
       AND vc.created_at <= end_date
       AND p.plan_tier NOT IN ('None', 'Pending Checkout')) as total_vendor_connections,
    (SELECT COUNT(*) FROM lender_connections lc
     LEFT JOIN profiles p ON lc.user_id = p.id
     WHERE lc.created_at >= start_date
       AND lc.created_at <= end_date
       AND p.plan_tier NOT IN ('None', 'Pending Checkout')) as total_lender_connections,
    (SELECT COUNT(*) FROM analytics_events ae
     LEFT JOIN profiles p ON ae.user_id = p.id
     WHERE ae.event_type = 'registration'
       AND ae.created_at >= start_date
       AND ae.created_at <= end_date
       AND p.plan_tier NOT IN ('None', 'Pending Checkout')) as total_event_registrations,
    (SELECT COUNT(DISTINCT user_id) FROM analytics_events ae
     LEFT JOIN profiles p ON ae.user_id = p.id
     WHERE ae.created_at >= start_date
       AND ae.created_at <= end_date
       AND p.plan_tier NOT IN ('None', 'Pending Checkout')) as active_users;
END;
$$;

-- Update the escalation cron reset function
CREATE OR REPLACE FUNCTION reset_annual_escalations()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  base_escalations RECORD;
BEGIN
  -- Define base escalations for each tier
  FOR base_escalations IN
    SELECT unnest(ARRAY['Premium', 'Premium Processor', 'Elite', 'Elite Processor', 'VIP', 'VIP Processor']) as tier,
           unnest(ARRAY[1, 1, 6, 3, 9999, 6]) as escalations
  LOOP
    UPDATE profiles
    SET
      escalations_remaining = base_escalations.escalations,
      escalations_last_reset_date = NOW(),
      updated_at = NOW()
    WHERE plan_tier::text = base_escalations.tier
      AND subscription_status = 'active'
      AND (
        escalations_last_reset_date IS NULL
        OR escalations_last_reset_date < NOW() - INTERVAL '1 year'
      );
  END LOOP;
END;
$$;

-- Note: We do NOT remove 'Free' from the enum as PostgreSQL doesn't support
-- removing enum values. The 'Free' value will remain but should never be used.
-- All new code references 'None' instead.
