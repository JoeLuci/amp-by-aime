-- Fix materialized views to allow API access and move pg_trgm extension
-- Run this migration via Supabase Dashboard SQL Editor

-- ============================================================================
-- PART 1: Grant SELECT access on materialized views to authenticated users
-- ============================================================================
-- Materialized views don't inherit table RLS policies, so we need explicit grants

GRANT SELECT ON content_engagement_summary TO authenticated;
GRANT SELECT ON user_plan_engagement TO authenticated;
GRANT SELECT ON daily_platform_metrics TO authenticated;

-- Also grant to anon for any unauthenticated needs (if applicable)
GRANT SELECT ON content_engagement_summary TO anon;
GRANT SELECT ON user_plan_engagement TO anon;
GRANT SELECT ON daily_platform_metrics TO anon;

-- ============================================================================
-- PART 2: Move pg_trgm extension to extensions schema
-- ============================================================================
-- NOTE: This is a more complex operation. The pg_trgm extension was installed
-- in the public schema, which allows unprivileged users to access its functions.
--
-- Supabase recommends installing extensions in the 'extensions' schema.
-- However, moving an existing extension requires:
-- 1. Dropping and recreating any indexes that use pg_trgm
-- 2. Recreating the extension in the new schema
--
-- This migration DOES NOT automatically move pg_trgm because it could break
-- existing trigram indexes. Instead, here's the manual process:
--
-- STEP 1: Find all indexes using pg_trgm operators
-- SELECT indexname, indexdef FROM pg_indexes
-- WHERE indexdef ILIKE '%gin_trgm_ops%' OR indexdef ILIKE '%gist_trgm_ops%';
--
-- STEP 2: Drop those indexes (note their definitions)
-- DROP INDEX IF EXISTS index_name;
--
-- STEP 3: Drop and recreate extension in extensions schema
-- DROP EXTENSION IF EXISTS pg_trgm;
-- CREATE EXTENSION IF NOT EXISTS pg_trgm SCHEMA extensions;
--
-- STEP 4: Recreate the indexes
-- CREATE INDEX ... USING gin(column extensions.gin_trgm_ops);
--
-- For now, we'll just check what indexes exist:
DO $$
DECLARE
  trgm_indexes TEXT;
BEGIN
  SELECT string_agg(indexname || ': ' || indexdef, E'\n')
  INTO trgm_indexes
  FROM pg_indexes
  WHERE indexdef ILIKE '%gin_trgm_ops%' OR indexdef ILIKE '%gist_trgm_ops%';

  IF trgm_indexes IS NOT NULL THEN
    RAISE NOTICE 'Found pg_trgm indexes that need to be recreated if moving extension:';
    RAISE NOTICE '%', trgm_indexes;
  ELSE
    RAISE NOTICE 'No pg_trgm indexes found - safe to move extension';
  END IF;
END $$;

-- ============================================================================
-- PART 3: Create RLS policies for materialized views (alternative approach)
-- ============================================================================
-- If you need row-level access control on materialized views, you'll need to
-- create wrapper functions or views that apply the necessary filtering.
--
-- For admin-only materialized views, you can restrict access like this:
-- REVOKE SELECT ON content_engagement_summary FROM authenticated, anon;
-- Then create a wrapper function with SECURITY DEFINER that checks is_admin().

-- For this project, the analytics views should only be accessible to admins.
-- Let's create wrapper functions instead of direct access:

-- Revoke direct access (uncomment if you want admin-only access)
-- REVOKE SELECT ON content_engagement_summary FROM authenticated, anon;
-- REVOKE SELECT ON user_plan_engagement FROM authenticated, anon;
-- REVOKE SELECT ON daily_platform_metrics FROM authenticated, anon;

-- Create admin-only wrapper function for content engagement
CREATE OR REPLACE FUNCTION get_content_engagement_summary()
RETURNS TABLE (
  content_type text,
  content_id uuid,
  content_title text,
  total_views bigint,
  unique_viewers bigint,
  total_clicks bigint,
  total_downloads bigint,
  total_contacts bigint,
  last_activity timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Check if user is admin
  IF NOT is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;

  RETURN QUERY SELECT * FROM content_engagement_summary;
END;
$$;

-- Create admin-only wrapper function for user plan engagement
CREATE OR REPLACE FUNCTION get_user_plan_engagement()
RETURNS TABLE (
  plan_tier text,
  total_users bigint,
  active_users bigint,
  total_views bigint,
  total_connections bigint,
  avg_views_per_user numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;

  RETURN QUERY SELECT * FROM user_plan_engagement;
END;
$$;

-- Create admin-only wrapper function for daily platform metrics
CREATE OR REPLACE FUNCTION get_daily_platform_metrics()
RETURNS TABLE (
  date date,
  total_events bigint,
  unique_users bigint,
  unique_sessions bigint,
  resource_views bigint,
  vendor_views bigint,
  lender_views bigint,
  event_views bigint,
  vendor_connections bigint,
  lender_connections bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;

  RETURN QUERY SELECT * FROM daily_platform_metrics;
END;
$$;

-- Grant execute on wrapper functions to authenticated users
GRANT EXECUTE ON FUNCTION get_content_engagement_summary() TO authenticated;
GRANT EXECUTE ON FUNCTION get_user_plan_engagement() TO authenticated;
GRANT EXECUTE ON FUNCTION get_daily_platform_metrics() TO authenticated;
