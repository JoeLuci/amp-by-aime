-- Add payment_amount column to profiles table for GHL sync
-- This tracks the subscription payment amount from Stripe

ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS payment_amount numeric;

COMMENT ON COLUMN profiles.payment_amount IS 'Subscription payment amount in dollars, synced from Stripe subscription price';

-- Update the GHL sync trigger to include billing_period and payment_amount
-- These fields were missing from the trigger, causing GHL not to update on subscription changes

CREATE OR REPLACE FUNCTION sync_profile_to_ghl()
RETURNS TRIGGER AS $$
DECLARE
  payload jsonb;
  supabase_url text := 'https://jrinrobepqsofuhjnxcp.supabase.co';
  should_sync boolean := false;
BEGIN
  -- For INSERT, always sync
  IF TG_OP = 'INSERT' THEN
    should_sync := true;
  END IF;

  -- For UPDATE, only sync if GHL-relevant fields changed
  IF TG_OP = 'UPDATE' THEN
    should_sync := (
      -- Contact info
      OLD.email IS DISTINCT FROM NEW.email OR
      OLD.full_name IS DISTINCT FROM NEW.full_name OR
      OLD.first_name IS DISTINCT FROM NEW.first_name OR
      OLD.last_name IS DISTINCT FROM NEW.last_name OR
      OLD.phone IS DISTINCT FROM NEW.phone OR
      OLD.avatar_url IS DISTINCT FROM NEW.avatar_url OR
      -- Personal address
      OLD.address IS DISTINCT FROM NEW.address OR
      OLD.city IS DISTINCT FROM NEW.city OR
      OLD.state IS DISTINCT FROM NEW.state OR
      OLD.zip_code IS DISTINCT FROM NEW.zip_code OR
      -- Company info
      OLD.company IS DISTINCT FROM NEW.company OR
      OLD.company_name IS DISTINCT FROM NEW.company_name OR
      OLD.company_address IS DISTINCT FROM NEW.company_address OR
      OLD.company_city IS DISTINCT FROM NEW.company_city OR
      OLD.company_state IS DISTINCT FROM NEW.company_state OR
      OLD.company_zip_code IS DISTINCT FROM NEW.company_zip_code OR
      OLD.company_nmls IS DISTINCT FROM NEW.company_nmls OR
      OLD.company_phone IS DISTINCT FROM NEW.company_phone OR
      -- Professional info
      OLD.role IS DISTINCT FROM NEW.role OR
      OLD.nmls_number IS DISTINCT FROM NEW.nmls_number OR
      OLD.state_licenses IS DISTINCT FROM NEW.state_licenses OR
      OLD.languages_spoken IS DISTINCT FROM NEW.languages_spoken OR
      -- Demographics
      OLD.birthday IS DISTINCT FROM NEW.birthday OR
      OLD.gender IS DISTINCT FROM NEW.gender OR
      OLD.race IS DISTINCT FROM NEW.race OR
      -- Subscription (including billing_period and payment_amount)
      OLD.plan_tier IS DISTINCT FROM NEW.plan_tier OR
      OLD.subscription_status IS DISTINCT FROM NEW.subscription_status OR
      OLD.stripe_customer_id IS DISTINCT FROM NEW.stripe_customer_id OR
      OLD.stripe_subscription_status IS DISTINCT FROM NEW.stripe_subscription_status OR
      OLD.billing_period IS DISTINCT FROM NEW.billing_period OR
      OLD.payment_amount IS DISTINCT FROM NEW.payment_amount OR
      OLD.scotsman_guide_subscription IS DISTINCT FROM NEW.scotsman_guide_subscription OR
      -- Activity
      OLD.last_login_at IS DISTINCT FROM NEW.last_login_at OR
      -- Contacts
      OLD.connections_contact_name IS DISTINCT FROM NEW.connections_contact_name OR
      OLD.connections_contact_email IS DISTINCT FROM NEW.connections_contact_email OR
      OLD.connections_contact_phone IS DISTINCT FROM NEW.connections_contact_phone OR
      OLD.escalations_contact_name IS DISTINCT FROM NEW.escalations_contact_name OR
      OLD.escalations_contact_email IS DISTINCT FROM NEW.escalations_contact_email OR
      OLD.escalations_contact_phone IS DISTINCT FROM NEW.escalations_contact_phone
    );
  END IF;

  -- Only call GHL if relevant fields changed
  IF should_sync THEN
    -- Build the payload matching what the edge function expects
    payload := jsonb_build_object(
      'type', TG_OP,
      'table', TG_TABLE_NAME,
      'record', to_jsonb(NEW),
      'old_record', CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(OLD) ELSE NULL END
    );

    -- Call the edge function asynchronously using pg_net
    -- The edge function has verify_jwt: false so no auth header needed
    PERFORM net.http_post(
      url := supabase_url || '/functions/v1/sync-profile-ghl',
      headers := '{"Content-Type": "application/json"}'::jsonb,
      body := payload
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update comment
COMMENT ON TRIGGER sync_profile_to_ghl_trigger ON profiles IS 'Automatically syncs profile changes to GoHighLevel CRM - includes billing_period and payment_amount for subscription tracking';
