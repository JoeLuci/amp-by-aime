-- Add billing_period column to profiles table to track monthly vs annual subscriptions
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS billing_period TEXT DEFAULT NULL;

-- Add comment for documentation
COMMENT ON COLUMN profiles.billing_period IS 'Subscription billing period: monthly or annual';

-- Create index for filtering by billing period
CREATE INDEX IF NOT EXISTS idx_profiles_billing_period ON profiles(billing_period) WHERE billing_period IS NOT NULL;
