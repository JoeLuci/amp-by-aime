-- Migration: Add database webhook to sync profiles to GHL
-- This creates a trigger that calls the sync-profile-ghl edge function on profile changes

-- Enable pg_net extension for HTTP requests from database
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Create function to call the edge function
CREATE OR REPLACE FUNCTION public.sync_profile_to_ghl()
RETURNS TRIGGER AS $$
DECLARE
  edge_function_url TEXT;
  service_role_key TEXT;
  payload JSONB;
BEGIN
  -- Get the edge function URL and service role key from vault or use defaults
  edge_function_url := 'https://jrinrobepqsofuhjnxcp.supabase.co/functions/v1/sync-profile-ghl';

  -- Get service role key from vault (you'll need to store it there)
  SELECT decrypted_secret INTO service_role_key
  FROM vault.decrypted_secrets
  WHERE name = 'supabase_service_role_key'
  LIMIT 1;

  -- If no vault secret, try environment variable approach
  IF service_role_key IS NULL THEN
    service_role_key := current_setting('app.settings.service_role_key', true);
  END IF;

  -- Build the payload matching Supabase webhook format
  payload := jsonb_build_object(
    'type', TG_OP,
    'table', TG_TABLE_NAME,
    'record', to_jsonb(NEW),
    'old_record', CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(OLD) ELSE NULL END
  );

  -- Make async HTTP request to edge function
  PERFORM net.http_post(
    url := edge_function_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || COALESCE(service_role_key, '')
    ),
    body := payload
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS sync_profile_to_ghl_trigger ON public.profiles;

-- Create trigger for INSERT and UPDATE on profiles
CREATE TRIGGER sync_profile_to_ghl_trigger
AFTER INSERT OR UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.sync_profile_to_ghl();

-- Add comment explaining the trigger
COMMENT ON TRIGGER sync_profile_to_ghl_trigger ON public.profiles IS
'Automatically syncs profile changes to GoHighLevel CRM via edge function';
