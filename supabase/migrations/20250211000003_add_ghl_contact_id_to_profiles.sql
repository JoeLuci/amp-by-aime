-- Add ghl_contact_id to profiles table for lazy contact creation
-- This ID is populated during onboarding (best effort) or on first form submission

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS ghl_contact_id TEXT;

-- Index for fast lookups when syncing from GHL
CREATE INDEX IF NOT EXISTS idx_profiles_ghl_contact_id ON profiles(ghl_contact_id);

-- Comment for documentation
COMMENT ON COLUMN profiles.ghl_contact_id IS 'GoHighLevel contact ID, populated at signup or first submission. Used to maintain contact association even if user changes email/phone.';
