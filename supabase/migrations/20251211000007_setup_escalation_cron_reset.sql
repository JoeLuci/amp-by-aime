-- Setup automated annual escalation reset via pg_cron
-- This runs daily and resets escalations for users whose reset date > 1 year

-- Enable pg_cron extension
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;

-- Grant usage to postgres role
GRANT USAGE ON SCHEMA cron TO postgres;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA cron TO postgres;

-- Create function to reset escalations annually
CREATE OR REPLACE FUNCTION public.reset_annual_escalations()
RETURNS void AS $$
DECLARE
  reset_count INTEGER;
BEGIN
  -- Reset escalations for users whose reset date is more than 1 year ago
  UPDATE profiles
  SET
    escalations_remaining = CASE plan_tier::text
      WHEN 'Premium' THEN 1
      WHEN 'Premium Processor' THEN 1
      WHEN 'Elite' THEN 6
      WHEN 'Elite Processor' THEN 3
      WHEN 'VIP' THEN 9999
      WHEN 'VIP Processor' THEN 6
      ELSE 0
    END + COALESCE(escalations_purchased, 0),
    escalations_last_reset_date = NOW()
  WHERE
    escalations_last_reset_date < NOW() - INTERVAL '1 year'
    AND plan_tier NOT IN ('Free', 'Pending Checkout', 'Premium Guest');

  -- Log how many were reset
  GET DIAGNOSTICS reset_count = ROW_COUNT;
  RAISE NOTICE 'Reset escalations for % users', reset_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Schedule the cron job to run daily at 3 AM UTC
SELECT cron.schedule(
  'reset-annual-escalations',
  '0 3 * * *',
  $$SELECT public.reset_annual_escalations()$$
);

-- Add comment for documentation
COMMENT ON FUNCTION public.reset_annual_escalations() IS
'Resets escalations annually for paid users. Runs daily via pg_cron at 3 AM UTC.';
