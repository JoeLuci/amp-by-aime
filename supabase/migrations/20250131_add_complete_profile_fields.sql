-- Add complete profile fields to profiles table
-- This migration adds all missing fields needed for the complete profile form

ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS nmls_number TEXT,
ADD COLUMN IF NOT EXISTS address TEXT,
ADD COLUMN IF NOT EXISTS city TEXT,
ADD COLUMN IF NOT EXISTS state TEXT,
ADD COLUMN IF NOT EXISTS zip_code TEXT,
ADD COLUMN IF NOT EXISTS birthday DATE,
ADD COLUMN IF NOT EXISTS gender TEXT,
ADD COLUMN IF NOT EXISTS state_licenses TEXT[],
ADD COLUMN IF NOT EXISTS languages_spoken TEXT[],
ADD COLUMN IF NOT EXISTS race TEXT,
ADD COLUMN IF NOT EXISTS company_address TEXT,
ADD COLUMN IF NOT EXISTS company_city TEXT,
ADD COLUMN IF NOT EXISTS company_state TEXT,
ADD COLUMN IF NOT EXISTS company_zip_code TEXT,
ADD COLUMN IF NOT EXISTS company_nmls TEXT,
ADD COLUMN IF NOT EXISTS company_phone TEXT,
ADD COLUMN IF NOT EXISTS scotsman_guide_subscription BOOLEAN DEFAULT false;

-- Create indexes for commonly queried fields
CREATE INDEX IF NOT EXISTS idx_profiles_nmls_number ON profiles(nmls_number) WHERE nmls_number IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_profiles_state ON profiles(state);
CREATE INDEX IF NOT EXISTS idx_profiles_city ON profiles(city);
CREATE INDEX IF NOT EXISTS idx_profiles_company_nmls ON profiles(company_nmls);

-- Add comments for documentation
COMMENT ON COLUMN profiles.nmls_number IS 'Individual NMLS number';
COMMENT ON COLUMN profiles.address IS 'User mailing address';
COMMENT ON COLUMN profiles.city IS 'User city';
COMMENT ON COLUMN profiles.state IS 'User state';
COMMENT ON COLUMN profiles.zip_code IS 'User zip code';
COMMENT ON COLUMN profiles.birthday IS 'User date of birth';
COMMENT ON COLUMN profiles.gender IS 'User gender';
COMMENT ON COLUMN profiles.state_licenses IS 'Array of state abbreviations where user is licensed';
COMMENT ON COLUMN profiles.languages_spoken IS 'Array of languages the user speaks';
COMMENT ON COLUMN profiles.race IS 'User race/ethnicity';
COMMENT ON COLUMN profiles.company_address IS 'Company street address';
COMMENT ON COLUMN profiles.company_city IS 'Company city';
COMMENT ON COLUMN profiles.company_state IS 'Company state';
COMMENT ON COLUMN profiles.company_zip_code IS 'Company zip code';
COMMENT ON COLUMN profiles.company_nmls IS 'Company NMLS number';
COMMENT ON COLUMN profiles.company_phone IS 'Company phone number';
COMMENT ON COLUMN profiles.scotsman_guide_subscription IS 'Whether user opted in for free Scotsman Guide subscription';
