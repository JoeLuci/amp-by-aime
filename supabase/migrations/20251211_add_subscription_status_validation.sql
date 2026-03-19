-- Migration: Add subscription status validation and sync
-- This ensures subscription_status uses valid Stripe status values

-- Sync subscription_status from stripe_subscription_status where it's null or outdated
UPDATE profiles
SET subscription_status = stripe_subscription_status
WHERE stripe_subscription_status IS NOT NULL
  AND (subscription_status IS NULL OR subscription_status != stripe_subscription_status);

-- Add check constraint to subscription_status column (allow null for users without subscriptions)
ALTER TABLE profiles
DROP CONSTRAINT IF EXISTS valid_subscription_status;

ALTER TABLE profiles
ADD CONSTRAINT valid_subscription_status
CHECK (subscription_status IS NULL OR subscription_status IN (
  'active', 'trialing', 'past_due', 'canceled', 'unpaid', 'incomplete', 'incomplete_expired', 'paused'
));

-- Add same check constraint to stripe_subscription_status column
ALTER TABLE profiles
DROP CONSTRAINT IF EXISTS valid_stripe_subscription_status;

ALTER TABLE profiles
ADD CONSTRAINT valid_stripe_subscription_status
CHECK (stripe_subscription_status IS NULL OR stripe_subscription_status IN (
  'active', 'trialing', 'past_due', 'canceled', 'unpaid', 'incomplete', 'incomplete_expired', 'paused'
));

-- Create trigger to keep subscription_status in sync with stripe_subscription_status
CREATE OR REPLACE FUNCTION sync_subscription_status()
RETURNS TRIGGER AS $$
BEGIN
  -- When stripe_subscription_status changes, update subscription_status
  IF NEW.stripe_subscription_status IS DISTINCT FROM OLD.stripe_subscription_status THEN
    NEW.subscription_status := NEW.stripe_subscription_status;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS sync_subscription_status_trigger ON profiles;

CREATE TRIGGER sync_subscription_status_trigger
BEFORE UPDATE ON profiles
FOR EACH ROW
EXECUTE FUNCTION sync_subscription_status();
