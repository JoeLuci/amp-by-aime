-- Clear ALL Stripe customer IDs and subscription IDs from profiles
-- Run this when switching from test to live mode (or vice versa)
-- This ensures no test mode IDs are used with live mode keys

UPDATE profiles
SET
  stripe_customer_id = NULL,
  stripe_subscription_id = NULL,
  subscription_status = NULL;

-- Note: This will force all customers to be recreated in Stripe on their next checkout
-- This is safe because the checkout API will create new customers as needed
COMMENT ON COLUMN profiles.stripe_customer_id IS 'Cleared when switching between test/live Stripe modes';
