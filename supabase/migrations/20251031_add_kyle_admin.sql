-- Make kyle@aimegroup.com an admin (using 'Broker Owner' role)
-- Run this AFTER Kyle has signed up through the application

-- Option 1: If Kyle has already signed up, this will update his profile to admin
UPDATE profiles
SET
  role = 'Broker Owner',
  plan_tier = 'VIP',
  created_at = now(),
  updated_at = now()
WHERE email = 'kyle@aimegroup.com';

-- Option 2: If the profile doesn't exist yet, create it (requires auth user ID)
-- First, get Kyle's user ID from auth:
-- SELECT id FROM auth.users WHERE email = 'kyle@aimegroup.com';

-- Then insert the profile using the auth user:
/*
INSERT INTO profiles (
  id,
  email,
  full_name,
  role,
  plan_tier,
  created_at,
  updated_at
)
SELECT
  id,
  'kyle@aimegroup.com',
  'Kyle',
  'Broker Owner',
  'VIP',
  now(),
  now()
FROM auth.users
WHERE email = 'kyle@aimegroup.com'
ON CONFLICT (id)
DO UPDATE SET
  role = 'Broker Owner',
  plan_tier = 'VIP',
  updated_at = now();
*/

-- Verify the update
SELECT id, email, role, plan_tier
FROM profiles
WHERE email = 'kyle@aimegroup.com';
