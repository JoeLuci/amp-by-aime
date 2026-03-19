-- Fix search_path security for all custom plpgsql functions
-- This prevents potential schema injection attacks
-- Run this migration via Supabase Dashboard SQL Editor or CLI

-- anonymize_old_analytics
CREATE OR REPLACE FUNCTION public.anonymize_old_analytics()
 RETURNS void
 LANGUAGE plpgsql
 SET search_path = public
AS $function$
BEGIN
  UPDATE analytics_events
  SET
    user_id = NULL,
    ip_address = NULL,
    user_agent = NULL,
    metadata = '{}'::jsonb
  WHERE created_at < NOW() - INTERVAL '2 years'
    AND user_id IS NOT NULL;

  DELETE FROM analytics_events
  WHERE created_at < NOW() - INTERVAL '3 years';

  -- Note: VACUUM ANALYZE should be run separately via cron job, not in a function
  RAISE NOTICE 'Analytics data anonymized and cleaned up';
END;
$function$;

-- calculate_engagement_score
CREATE OR REPLACE FUNCTION public.calculate_engagement_score(user_uuid uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
DECLARE
  total_score INTEGER := 0;
  config_row RECORD;
  activity_count INTEGER;
  points_earned INTEGER;
  period_start TIMESTAMPTZ;
BEGIN
  FOR config_row IN
    SELECT * FROM engagement_scoring_config WHERE is_active = true
  LOOP
    period_start := NOW() - (config_row.period_days || ' days')::INTERVAL;
    activity_count := 0;

    CASE config_row.metric_key
      WHEN 'login' THEN
        SELECT CASE
          WHEN last_login_at >= period_start THEN
            GREATEST(1, EXTRACT(EPOCH FROM (NOW() - last_login_at)) / 86400 / 7)::INTEGER
          ELSE 0
        END INTO activity_count
        FROM profiles WHERE id = user_uuid;

      WHEN 'vendor_connection' THEN
        SELECT COUNT(*) INTO activity_count
        FROM vendor_connections
        WHERE user_id = user_uuid AND created_at >= period_start;

      WHEN 'lender_connection' THEN
        SELECT COUNT(*) INTO activity_count
        FROM lender_connections
        WHERE user_id = user_uuid AND created_at >= period_start;

      WHEN 'escalation' THEN
        SELECT COUNT(*) INTO activity_count
        FROM loan_escalations
        WHERE user_id = user_uuid AND created_at >= period_start;

      WHEN 'resource_view' THEN
        SELECT COUNT(*) INTO activity_count
        FROM analytics_events
        WHERE user_id = user_uuid
          AND event_type = 'view'
          AND content_type = 'resource'
          AND created_at >= period_start;

      WHEN 'event_registration' THEN
        SELECT COUNT(*) INTO activity_count
        FROM analytics_events
        WHERE user_id = user_uuid
          AND event_type = 'registration'
          AND content_type = 'event'
          AND created_at >= period_start;

      WHEN 'profile_complete' THEN
        SELECT CASE WHEN profile_complete = true THEN 1 ELSE 0 END INTO activity_count
        FROM profiles WHERE id = user_uuid;

      ELSE
        activity_count := 0;
    END CASE;

    points_earned := activity_count * config_row.points_per_action;

    IF config_row.max_points_per_period IS NOT NULL THEN
      points_earned := LEAST(points_earned, config_row.max_points_per_period);
    END IF;

    total_score := total_score + points_earned;
  END LOOP;

  RETURN total_score;
END;
$function$;

-- clean_bbcode
CREATE OR REPLACE FUNCTION public.clean_bbcode(text_input text)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path = public
AS $function$
BEGIN
  IF text_input IS NULL THEN
    RETURN NULL;
  END IF;

  RETURN regexp_replace(
    regexp_replace(
      regexp_replace(
        regexp_replace(
          regexp_replace(
            regexp_replace(
              regexp_replace(
                regexp_replace(
                  regexp_replace(
                    regexp_replace(
                      regexp_replace(
                        regexp_replace(
                          text_input,
                          '\[size=[0-9]+\]', '', 'g'
                        ),
                        '\[/size\]', '', 'g'
                      ),
                      '\[b\]', '<strong>', 'g'
                    ),
                    '\[/b\]', '</strong>', 'g'
                  ),
                  '\[i\]', '<em>', 'g'
                ),
                '\[/i\]', '</em>', 'g'
              ),
              '\[u\]', '<u>', 'g'
            ),
            '\[/u\]', '</u>', 'g'
          ),
          '\[color=[^\]]+\]', '', 'g'
        ),
        '\[/color\]', '', 'g'
      ),
      '\[highlight=[^\]]+\]', '', 'g'
    ),
    '\[/highlight\]', '', 'g'
  );
END;
$function$;

-- create_notification_for_users
CREATE OR REPLACE FUNCTION public.create_notification_for_users(
  p_title text,
  p_message text,
  p_notification_type text,
  p_target_roles user_role[] DEFAULT NULL::user_role[],
  p_target_plan_tiers plan_tier[] DEFAULT NULL::plan_tier[],
  p_content_type text DEFAULT NULL::text,
  p_content_id uuid DEFAULT NULL::uuid,
  p_scheduled_at timestamp with time zone DEFAULT NULL::timestamp with time zone,
  p_expires_at timestamp with time zone DEFAULT NULL::timestamp with time zone,
  p_created_by uuid DEFAULT NULL::uuid
)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
DECLARE
  v_notification_id UUID;
  v_user_record RECORD;
BEGIN
  INSERT INTO notifications (
    title, message, type, target_roles, target_plan_tiers,
    content_type, content_id, scheduled_at, expires_at,
    is_active, created_by, created_at
  ) VALUES (
    p_title, p_message, p_notification_type, p_target_roles, p_target_plan_tiers,
    p_content_type, p_content_id, COALESCE(p_scheduled_at, NOW()), p_expires_at,
    true, p_created_by, NOW()
  )
  RETURNING id INTO v_notification_id;

  IF p_scheduled_at IS NULL OR p_scheduled_at <= NOW() THEN
    FOR v_user_record IN
      SELECT p.id as user_id FROM profiles p
      WHERE p.id IS NOT NULL
        AND (p_target_roles IS NULL OR p.role = ANY(p_target_roles))
        AND (p_target_plan_tiers IS NULL OR p.plan_tier = ANY(p_target_plan_tiers))
    LOOP
      INSERT INTO user_notifications (user_id, notification_id, is_read, created_at)
      VALUES (v_user_record.user_id, v_notification_id, false, NOW())
      ON CONFLICT (user_id, notification_id) DO NOTHING;
    END LOOP;
  END IF;

  RETURN v_notification_id;
END;
$function$;

-- delete_user_analytics
CREATE OR REPLACE FUNCTION public.delete_user_analytics()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path = public
AS $function$
BEGIN
  DELETE FROM analytics_events WHERE user_id = OLD.id;
  DELETE FROM conversion_attributions WHERE user_id = OLD.id;
  RETURN OLD;
END;
$function$;

-- expire_old_checkouts
CREATE OR REPLACE FUNCTION public.expire_old_checkouts()
 RETURNS void
 LANGUAGE plpgsql
 SET search_path = public
AS $function$
BEGIN
  UPDATE pending_checkouts
  SET status = 'expired',
      updated_at = NOW()
  WHERE status IN ('pending', 'sent')
    AND expires_at < NOW();
END;
$function$;

-- get_admin_dashboard_metrics
CREATE OR REPLACE FUNCTION public.get_admin_dashboard_metrics(p_start_date timestamp with time zone, p_end_date timestamp with time zone)
 RETURNS TABLE(total_views bigint, total_clicks bigint, total_contacts bigint, unique_users bigint, unique_sessions bigint, top_resources jsonb, top_vendors jsonb, top_lenders jsonb, top_events jsonb, engagement_by_plan jsonb, daily_trends jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*) FILTER (WHERE ae.event_type = 'view') as total_views,
    COUNT(*) FILTER (WHERE ae.event_type = 'click') as total_clicks,
    COUNT(*) FILTER (WHERE ae.event_type = 'contact') as total_contacts,
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
          COALESCE(ae2.user_plan_tier::TEXT, 'free') as plan_tier,
          COUNT(DISTINCT ae2.user_id) as unique_users,
          COUNT(*) FILTER (WHERE ae2.event_type = 'view' AND ae2.content_type = 'resource') as resource_views,
          COUNT(*) FILTER (WHERE ae2.event_type = 'view' AND ae2.content_type = 'vendor') as vendor_views,
          COUNT(*) FILTER (WHERE ae2.event_type = 'view' AND ae2.content_type = 'lender') as lender_views,
          COUNT(*) FILTER (WHERE ae2.event_type = 'view' AND ae2.content_type = 'event') as event_views,
          COUNT(*) FILTER (WHERE ae2.event_type = 'contact' AND ae2.content_type = 'vendor') as vendor_connections,
          COUNT(*) FILTER (WHERE ae2.event_type = 'contact' AND ae2.content_type = 'lender') as lender_connections
        FROM analytics_events ae2
        WHERE ae2.created_at >= p_start_date
          AND ae2.created_at <= p_end_date
        GROUP BY ae2.user_plan_tier
        ORDER BY unique_users DESC
      ) plan_stats
    ) as engagement_by_plan,

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

-- get_content_analytics
CREATE OR REPLACE FUNCTION public.get_content_analytics(p_content_type text, p_content_id uuid, p_start_date timestamp with time zone, p_end_date timestamp with time zone, p_group_by text DEFAULT 'day'::text)
 RETURNS TABLE(period timestamp with time zone, total_views bigint, unique_users bigint, total_clicks bigint, total_downloads bigint, total_contacts bigint, plan_breakdown jsonb, event_breakdown jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
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
$function$;

-- get_conversion_funnel
CREATE OR REPLACE FUNCTION public.get_conversion_funnel(p_start_date timestamp with time zone, p_end_date timestamp with time zone)
 RETURNS TABLE(content_type text, content_title text, total_conversions bigint, conversion_value numeric, avg_time_to_convert interval)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
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
$function$;

-- get_engagement_level
CREATE OR REPLACE FUNCTION public.get_engagement_level(score integer)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
DECLARE
  level_name TEXT;
BEGIN
  SELECT el.name INTO level_name
  FROM engagement_thresholds et
  JOIN engagement_levels el ON el.id = et.engagement_level_id
  WHERE score >= et.min_score
    AND (et.max_score IS NULL OR score <= et.max_score)
  ORDER BY et.min_score DESC
  LIMIT 1;

  RETURN COALESCE(level_name, 'Unengaged Member');
END;
$function$;

-- is_admin
CREATE OR REPLACE FUNCTION public.is_admin(user_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = user_id
    AND is_admin = true
  );
END;
$function$;

-- is_super_admin
CREATE OR REPLACE FUNCTION public.is_super_admin(user_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = user_id
    AND is_admin = true
    AND role = 'super_admin'
  );
END;
$function$;

-- notify_new_content
CREATE OR REPLACE FUNCTION public.notify_new_content()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
DECLARE
  v_title TEXT;
  v_message TEXT;
  v_content_type TEXT;
  v_url TEXT;
BEGIN
  IF TG_TABLE_NAME = 'resources' THEN
    v_content_type := 'resource';
    v_title := 'New Resource Available';
    v_message := format('A new resource "%s" has been added that you may find useful.', NEW.title);
    v_url := format('/dashboard/resources/%s', NEW.slug);
  ELSIF TG_TABLE_NAME = 'lenders' THEN
    v_content_type := 'lender';
    v_title := 'New Lender Available';
    v_message := format('A new lender "%s" has been added to the marketplace.', NEW.name);
    v_url := format('/dashboard/lenders/%s', NEW.slug);
  ELSIF TG_TABLE_NAME = 'vendors' THEN
    v_content_type := 'vendor';
    v_title := 'New Vendor Available';
    v_message := format('A new vendor "%s" has been added to the marketplace.', NEW.name);
    v_url := format('/dashboard/market/%s', NEW.slug);
  ELSIF TG_TABLE_NAME = 'events' THEN
    v_content_type := 'event';
    v_title := 'New Event Available';
    v_message := format('A new event "%s" has been scheduled.', NEW.title);
    v_url := format('/dashboard/events/%s', NEW.id);
  ELSE
    RETURN NEW;
  END IF;

  v_message := v_message || ' [URL:' || v_url || ']';

  PERFORM create_notification_for_users(
    v_title,
    v_message,
    'info',
    NEW.user_role_access,
    NEW.required_plan_tier,
    v_content_type,
    NEW.id,
    NULL,
    NULL,
    NULL
  );

  RETURN NEW;
END;
$function$;

-- refresh_analytics_views
CREATE OR REPLACE FUNCTION public.refresh_analytics_views()
 RETURNS void
 LANGUAGE plpgsql
 SET search_path = public
AS $function$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY content_engagement_summary;
  REFRESH MATERIALIZED VIEW CONCURRENTLY user_plan_engagement;
  REFRESH MATERIALIZED VIEW CONCURRENTLY daily_platform_metrics;
END;
$function$;

-- track_subscription_conversion
CREATE OR REPLACE FUNCTION public.track_subscription_conversion(p_user_id uuid, p_from_tier plan_tier, p_to_tier plan_tier, p_conversion_type text)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path = public
AS $function$
DECLARE
  v_last_interaction RECORD;
  v_first_interaction RECORD;
BEGIN
  SELECT content_type, content_id, content_title
  INTO v_last_interaction
  FROM analytics_events
  WHERE user_id = p_user_id
    AND created_at >= NOW() - INTERVAL '30 days'
  ORDER BY created_at DESC
  LIMIT 1;

  SELECT content_type, content_id
  INTO v_first_interaction
  FROM analytics_events
  WHERE user_id = p_user_id
  ORDER BY created_at ASC
  LIMIT 1;

  INSERT INTO conversion_attributions (
    user_id,
    conversion_type,
    from_tier,
    to_tier,
    attributed_content_type,
    attributed_content_id,
    attributed_content_title,
    first_touch_content_type,
    first_touch_content_id
  ) VALUES (
    p_user_id,
    p_conversion_type,
    p_from_tier,
    p_to_tier,
    v_last_interaction.content_type,
    v_last_interaction.content_id,
    v_last_interaction.content_title,
    v_first_interaction.content_type,
    v_first_interaction.content_id
  );
END;
$function$;

-- update_all_engagement_scores
CREATE OR REPLACE FUNCTION public.update_all_engagement_scores()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
DECLARE
  user_record RECORD;
  updated_count INTEGER := 0;
BEGIN
  FOR user_record IN
    SELECT id FROM profiles
    WHERE role NOT IN ('admin', 'super_admin', 'partner_vendor', 'partner_lender')
  LOOP
    PERFORM update_user_engagement(user_record.id);
    updated_count := updated_count + 1;
  END LOOP;

  RETURN updated_count;
END;
$function$;

-- update_content_types_updated_at
CREATE OR REPLACE FUNCTION public.update_content_types_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path = public
AS $function$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$function$;

-- update_notification_read_at
CREATE OR REPLACE FUNCTION public.update_notification_read_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path = public
AS $function$
BEGIN
  IF new.is_read = true AND old.is_read = false THEN
    new.read_at = now();
  END IF;
  RETURN new;
END;
$function$;

-- update_updated_at_column
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path = public
AS $function$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$function$;

-- update_user_engagement
CREATE OR REPLACE FUNCTION public.update_user_engagement(user_uuid uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
DECLARE
  new_score INTEGER;
  new_level TEXT;
BEGIN
  new_score := calculate_engagement_score(user_uuid);
  new_level := get_engagement_level(new_score);

  UPDATE profiles
  SET engagement_score = new_score,
      engagement_level = new_level,
      updated_at = NOW()
  WHERE id = user_uuid;
END;
$function$;
