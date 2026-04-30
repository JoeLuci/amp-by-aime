SELECT cron.schedule(
  'reset-annual-escalations',
  '0 3 * * *',
  $$SELECT public.reset_annual_escalations()$$
);

SELECT cron.schedule(
  'expire-overrides-daily',
  '0 6 * * *',
  $$
    SELECT net.http_post(
      url := 'https://nuuffnxjsjqdoubvrtcl.supabase.co/functions/v1/expire-overrides',
      headers := '{"Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im51dWZmbnhqc2pxZG91YnZydGNsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NzUwMTcyNywiZXhwIjoyMDkzMDc3NzI3fQ.74sPt3CEdxb_nkpQoE1eqaGXu3Vy7y_YGCb6foIwCdM"}'::jsonb
    );
  $$
);

SELECT cron.schedule(
  'sync-stripe-subscriptions',
  '0 */4 * * *',
  $$
    SELECT net.http_post(
      url := 'https://nuuffnxjsjqdoubvrtcl.supabase.co/functions/v1/sync-stripe-subscriptions',
      headers := '{"Content-Type": "application/json"}'::jsonb,
      body := '{}'::jsonb
    ) AS request_id;
  $$
);

SELECT jobname, schedule, active FROM cron.job ORDER BY jobid;
