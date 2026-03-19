-- Script to Upgrade Your Account to Super Admin
-- Run this in the Supabase SQL Editor
-- Replace 'your.email@example.com' with your actual email address

-- Step 1: Check your current role
SELECT
  id,
  email,
  role,
  is_admin,
  first_name,
  last_name,
  created_at
FROM profiles
WHERE email = 'your.email@example.com';  -- REPLACE WITH YOUR EMAIL

-- Step 2: Upgrade to super_admin
-- Uncomment and run this after verifying the above query returns your account
/*
UPDATE profiles
SET
  role = 'super_admin',
  is_admin = true
WHERE email = 'your.email@example.com'  -- REPLACE WITH YOUR EMAIL
RETURNING id, email, role, is_admin;
*/

-- Step 3: Verify the update
/*
SELECT
  id,
  email,
  role,
  is_admin,
  first_name,
  last_name
FROM profiles
WHERE email = 'your.email@example.com';  -- REPLACE WITH YOUR EMAIL
*/

-- After running this script successfully:
-- 1. Log out of the admin portal
-- 2. Log back in
-- 3. You should now be able to create other admins
