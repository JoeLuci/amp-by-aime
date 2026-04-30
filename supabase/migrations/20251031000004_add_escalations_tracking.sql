-- Add escalations tracking to profiles table
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS escalations_remaining INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS escalations_purchased INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS escalations_used INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS escalations_last_reset_date TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_profiles_escalations_remaining
ON profiles(escalations_remaining);

-- Add comments
COMMENT ON COLUMN profiles.escalations_remaining IS 'Number of escalations remaining for the user';
COMMENT ON COLUMN profiles.escalations_purchased IS 'Total escalations purchased (outside of plan) since last reset';
COMMENT ON COLUMN profiles.escalations_used IS 'Total escalations used since last reset';
COMMENT ON COLUMN profiles.escalations_last_reset_date IS 'Date when escalations were last reset (annual reset)';

-- Set default escalations based on plan tier
-- Premium: 1, Premium Processor: 1, Elite: 6, Elite Processor: 3, VIP: unlimited (9999), VIP Processor: 6
UPDATE profiles
SET escalations_remaining = CASE
  WHEN plan_tier = 'Premium' THEN 1
  WHEN plan_tier = 'Premium Processor' THEN 1
  WHEN plan_tier = 'Elite' THEN 6
  WHEN plan_tier = 'Elite Processor' THEN 3
  WHEN plan_tier = 'VIP' THEN 9999
  WHEN plan_tier = 'VIP Processor' THEN 6
  ELSE 0
END
WHERE escalations_remaining = 0;
