-- Fix infinite recursion in RLS policies
-- The issue: Admin policies check profiles table FROM profiles table, creating infinite loop

-- Drop the problematic policies
DROP POLICY IF EXISTS "Admins can view all profiles" ON profiles;
DROP POLICY IF EXISTS "Admins can update all profiles" ON profiles;
DROP POLICY IF EXISTS "Admins can insert profiles" ON profiles;

-- Add simple INSERT policy for new user signups
CREATE POLICY "Users can insert their own profile"
  ON profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

-- Recreate admin policies with security definer functions to avoid recursion
-- Create a helper function to check if user is admin (runs with elevated privileges)
CREATE OR REPLACE FUNCTION public.is_admin(user_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = user_id
    AND role IN ('Broker Owner')
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Now create admin policies using the security definer function
CREATE POLICY "Admins can view all profiles"
  ON profiles FOR SELECT
  USING (public.is_admin(auth.uid()));

CREATE POLICY "Admins can update all profiles"
  ON profiles FOR UPDATE
  USING (public.is_admin(auth.uid()));
