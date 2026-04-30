-- Add payment failure tracking field to profiles
-- This tracks when a payment first failed to calculate the 7-day grace period

ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS payment_failed_at TIMESTAMPTZ DEFAULT NULL;

-- Add index for querying users with payment issues
CREATE INDEX IF NOT EXISTS idx_profiles_payment_failed_at
ON profiles(payment_failed_at)
WHERE payment_failed_at IS NOT NULL;

-- Comment for documentation
COMMENT ON COLUMN profiles.payment_failed_at IS 'Timestamp when subscription payment first failed. Used to calculate 7-day grace period before access restriction. Cleared when payment succeeds.';
