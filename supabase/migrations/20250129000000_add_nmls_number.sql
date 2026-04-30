-- Add NMLS number field to profiles table
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS nmls_number TEXT;

-- Add index for NMLS lookups
CREATE INDEX IF NOT EXISTS idx_profiles_nmls_number ON profiles(nmls_number) WHERE nmls_number IS NOT NULL;
