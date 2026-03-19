-- Standardize role enum values to use snake_case consistently
-- This migration updates all role values to follow snake_case convention
-- Display values (Title Case) should be handled in the frontend

-- Step 1: Drop ALL policies that depend on the role column
DROP POLICY IF EXISTS "Users can view resources based on their plan" ON resources;
DROP POLICY IF EXISTS "Users can view events based on their plan" ON events;
DROP POLICY IF EXISTS "Partner Lenders can update their own listing" ON lenders;
DROP POLICY IF EXISTS "Partner Vendors can update their own listing" ON vendors;

-- Storage policies
DROP POLICY IF EXISTS "Admins can delete PDFs" ON storage.objects;
DROP POLICY IF EXISTS "Admins can delete lender logos" ON storage.objects;
DROP POLICY IF EXISTS "Admins can delete podcasts" ON storage.objects;
DROP POLICY IF EXISTS "Admins can delete thumbnails" ON storage.objects;
DROP POLICY IF EXISTS "Admins can delete vendor logos" ON storage.objects;
DROP POLICY IF EXISTS "Admins can delete videos" ON storage.objects;
DROP POLICY IF EXISTS "Admins can upload PDFs" ON storage.objects;
DROP POLICY IF EXISTS "Admins can upload lender logos" ON storage.objects;
DROP POLICY IF EXISTS "Admins can upload podcasts" ON storage.objects;
DROP POLICY IF EXISTS "Admins can upload thumbnails" ON storage.objects;
DROP POLICY IF EXISTS "Admins can upload vendor logos" ON storage.objects;
DROP POLICY IF EXISTS "Admins can upload videos" ON storage.objects;

-- Step 2: Convert role column to text to allow free-form updates
ALTER TABLE profiles
ALTER COLUMN role TYPE text;

-- Step 3: Drop the old enum type
DROP TYPE IF EXISTS user_role CASCADE;

-- Step 3: Update all existing data to use snake_case values
UPDATE profiles
SET role = 'broker_owner'
WHERE role = 'Broker Owner';

UPDATE profiles
SET role = 'partner_lender'
WHERE role = 'Partner Lender';

UPDATE profiles
SET role = 'partner_vendor'
WHERE role = 'Partner Vendor';

UPDATE profiles
SET role = 'loan_officer'
WHERE role = 'Loan Officer';

UPDATE profiles
SET role = 'loan_officer_assistant'
WHERE role = 'Loan Officer Assistant';

UPDATE profiles
SET role = 'processor'
WHERE role = 'Processor';

-- Handle any NULL or empty roles
UPDATE profiles
SET role = 'member'
WHERE role IS NULL OR role = '';

-- Step 4: Create the new enum with standardized snake_case values
CREATE TYPE user_role AS ENUM (
  'admin',
  'super_admin',
  'broker_owner',
  'loan_officer',
  'loan_officer_assistant',
  'processor',
  'partner_lender',
  'partner_vendor',
  'member'
);

-- Step 5: Convert the column back to use the new enum type
ALTER TABLE profiles
ALTER COLUMN role TYPE user_role USING role::user_role;

-- Step 6: Ensure default is still 'member'
ALTER TABLE profiles
ALTER COLUMN role SET DEFAULT 'member'::user_role;

-- Step 7: Add a comment explaining the convention
COMMENT ON TYPE user_role IS 'User roles using snake_case convention. Display values should use Title Case in the frontend (e.g., broker_owner displays as "Broker Owner").';
