-- Add vendor and lender contact information fields to profiles table
-- This migration adds contact fields needed for Partner Vendor and Partner Lender roles

ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS company_name TEXT,
ADD COLUMN IF NOT EXISTS first_name TEXT,
ADD COLUMN IF NOT EXISTS last_name TEXT,
ADD COLUMN IF NOT EXISTS connections_contact_name TEXT,
ADD COLUMN IF NOT EXISTS connections_contact_email TEXT,
ADD COLUMN IF NOT EXISTS connections_contact_phone TEXT,
ADD COLUMN IF NOT EXISTS escalations_contact_name TEXT,
ADD COLUMN IF NOT EXISTS escalations_contact_email TEXT,
ADD COLUMN IF NOT EXISTS escalations_contact_phone TEXT;

-- Create indexes for commonly queried fields
CREATE INDEX IF NOT EXISTS idx_profiles_company_name ON profiles(company_name) WHERE company_name IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_profiles_first_name ON profiles(first_name) WHERE first_name IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_profiles_last_name ON profiles(last_name) WHERE last_name IS NOT NULL;

-- Add comments for documentation
COMMENT ON COLUMN profiles.company_name IS 'Company name for Partner Vendors and Partner Lenders';
COMMENT ON COLUMN profiles.first_name IS 'User first name';
COMMENT ON COLUMN profiles.last_name IS 'User last name';
COMMENT ON COLUMN profiles.connections_contact_name IS 'Name of connections contact person (for vendors and lenders)';
COMMENT ON COLUMN profiles.connections_contact_email IS 'Email of connections contact person (for vendors and lenders)';
COMMENT ON COLUMN profiles.connections_contact_phone IS 'Phone of connections contact person (for vendors and lenders)';
COMMENT ON COLUMN profiles.escalations_contact_name IS 'Name of escalations contact person (for lenders only)';
COMMENT ON COLUMN profiles.escalations_contact_email IS 'Email of escalations contact person (for lenders only)';
COMMENT ON COLUMN profiles.escalations_contact_phone IS 'Phone of escalations contact person (for lenders only)';
