-- Before running: replace <STAGING_SERVICE_ROLE_KEY> below with the actual
-- staging Supabase service_role JWT (Project Settings → API → service_role).
-- Do not commit the substituted version. Run via Supabase SQL Editor.

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
      headers := '{"Authorization": "Bearer <STAGING_SERVICE_ROLE_KEY>"}'::jsonb
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
