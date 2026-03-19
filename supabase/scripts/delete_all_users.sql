-- ====================================
-- DELETE ALL TEST USERS SCRIPT
-- ====================================
-- WARNING: This will permanently delete ALL users and their associated data
-- Use this script ONLY in development/testing environments
--
-- To run this script:
-- 1. Go to your Supabase Dashboard
-- 2. Navigate to SQL Editor
-- 3. Copy and paste this script
-- 4. Review carefully and click "Run"
-- ====================================

-- Step 1: Delete all profiles (cascades to related data)
DELETE FROM public.profiles;

-- Step 2: Delete all auth users
-- Note: This requires superuser permissions
-- If you get a permission error, use the Supabase Dashboard instead:
-- Go to Authentication > Users > Select all > Delete

-- Get all user IDs and delete them one by one
DO $$
DECLARE
  user_record RECORD;
BEGIN
  FOR user_record IN
    SELECT id FROM auth.users
  LOOP
    -- Delete user from auth.users
    DELETE FROM auth.users WHERE id = user_record.id;
  END LOOP;

  RAISE NOTICE 'All users deleted successfully';
END $$;

-- Step 3: Verify deletion
SELECT COUNT(*) as remaining_profiles FROM public.profiles;
SELECT COUNT(*) as remaining_auth_users FROM auth.users;

-- Step 4: Reset sequences (optional - keeps IDs starting from 1)
-- Uncomment if you want to reset auto-increment IDs
-- ALTER SEQUENCE IF EXISTS profiles_id_seq RESTART WITH 1;
