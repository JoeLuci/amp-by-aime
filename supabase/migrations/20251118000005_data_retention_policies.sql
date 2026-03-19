-- GDPR-compliant data retention and privacy policies

-- Function to anonymize old analytics data
CREATE OR REPLACE FUNCTION anonymize_old_analytics()
RETURNS void AS $$
BEGIN
  -- Anonymize events older than 2 years
  UPDATE analytics_events
  SET
    user_id = NULL,
    ip_address = NULL,
    user_agent = NULL,
    metadata = '{}'::jsonb
  WHERE created_at < NOW() - INTERVAL '2 years'
    AND user_id IS NOT NULL;

  -- Delete events older than 3 years
  DELETE FROM analytics_events
  WHERE created_at < NOW() - INTERVAL '3 years';

  -- Vacuum to reclaim space
  VACUUM ANALYZE analytics_events;

  RAISE NOTICE 'Analytics data anonymized and cleaned up';
END;
$$ LANGUAGE plpgsql;

-- Function to delete user analytics on account deletion
CREATE OR REPLACE FUNCTION delete_user_analytics()
RETURNS TRIGGER AS $$
BEGIN
  -- Delete all analytics events for this user
  DELETE FROM analytics_events WHERE user_id = OLD.id;

  -- Delete conversion attributions
  DELETE FROM conversion_attributions WHERE user_id = OLD.id;

  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

-- Trigger on profile deletion to clean up user data
CREATE TRIGGER delete_user_analytics_trigger
  BEFORE DELETE ON profiles
  FOR EACH ROW EXECUTE FUNCTION delete_user_analytics();

-- Schedule monthly cleanup (requires pg_cron extension)
-- Run this manually in Supabase SQL Editor if pg_cron is enabled:
-- SELECT cron.schedule('anonymize-analytics', '0 0 1 * *', 'SELECT anonymize_old_analytics()');

COMMENT ON FUNCTION anonymize_old_analytics IS 'GDPR-compliant data retention: anonymizes data older than 2 years, deletes data older than 3 years';
COMMENT ON FUNCTION delete_user_analytics IS 'Automatically delete user analytics data when user account is deleted';
