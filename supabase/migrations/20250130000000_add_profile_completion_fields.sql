-- Add fields for profile completion tracking
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS profile_complete BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS onboarding_step TEXT DEFAULT 'select_plan'; -- 'select_plan', 'complete_profile', 'completed'

-- Create index for profile_complete for faster queries
CREATE INDEX IF NOT EXISTS idx_profiles_complete ON profiles(profile_complete);

-- Comment on columns for documentation
COMMENT ON COLUMN profiles.profile_complete IS 'Whether the user has completed their profile (required to access dashboard)';
COMMENT ON COLUMN profiles.onboarding_step IS 'Current step in the onboarding flow: select_plan, complete_profile, completed';
