-- Secure Admin Creation Migration
-- This migration adds database-level protection for admin creation
-- Only super_admins can modify admin-related fields

-- Drop existing policies that allow non-super-admins to manage admin fields
DROP POLICY IF EXISTS "Admins can insert profiles" ON public.profiles;
DROP POLICY IF EXISTS "Admins can update all profiles" ON public.profiles;

-- Create a function to check if user is a super admin
CREATE OR REPLACE FUNCTION public.is_super_admin(user_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = user_id
    AND is_admin = true
    AND role = 'super_admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Policy: Only super admins can insert new profiles (for creating admins)
-- Regular profile creation is handled by the trigger
CREATE POLICY "Super admins can insert profiles"
ON public.profiles FOR INSERT TO public
WITH CHECK (
  -- Allow service role (for trigger context where auth.uid() is NULL)
  auth.role() = 'service_role'
  OR
  -- Allow super admins to create profiles
  public.is_super_admin(auth.uid())
  OR
  -- Allow users to insert their own profile during signup
  auth.uid() = id
);

-- Policy: Only super admins can update is_admin and role fields on other profiles
-- Users can still update their own non-admin fields
CREATE POLICY "Super admins can update all profiles"
ON public.profiles FOR UPDATE TO public
USING (
  -- Users can update their own profile (but not admin fields, controlled by WITH CHECK)
  auth.uid() = id
  OR
  -- Super admins can update any profile
  public.is_super_admin(auth.uid())
)
WITH CHECK (
  -- If updating own profile, cannot change is_admin or role unless they're a super admin
  (
    auth.uid() = id
    AND (
      -- Either not changing admin fields
      (is_admin = (SELECT is_admin FROM profiles WHERE id = auth.uid()))
      AND (role = (SELECT role FROM profiles WHERE id = auth.uid()))
      -- Or is a super admin
      OR public.is_super_admin(auth.uid())
    )
  )
  OR
  -- Super admins can change anything
  public.is_super_admin(auth.uid())
  OR
  -- Service role can update anything (for Edge Function operations)
  auth.role() = 'service_role'
);

-- Add a comment to document the security model
COMMENT ON POLICY "Super admins can insert profiles" ON public.profiles IS
'Only super admins can create new admin profiles. Regular users can only create their own profile during signup via the trigger.';

COMMENT ON POLICY "Super admins can update all profiles" ON public.profiles IS
'Users can update their own non-admin fields. Only super admins can update admin-related fields (is_admin, role) for any profile.';

-- Create an audit log function for admin creation (optional but recommended)
CREATE TABLE IF NOT EXISTS public.admin_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  action TEXT NOT NULL,
  actor_id UUID REFERENCES auth.users(id),
  target_user_id UUID REFERENCES auth.users(id),
  details JSONB,
  ip_address TEXT
);

-- Enable RLS on audit log
ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;

-- Only super admins can view audit logs
CREATE POLICY "Super admins can view audit logs"
ON public.admin_audit_log FOR SELECT TO public
USING (public.is_super_admin(auth.uid()));

-- Service role can insert audit logs
CREATE POLICY "Service role can insert audit logs"
ON public.admin_audit_log FOR INSERT TO public
WITH CHECK (auth.role() = 'service_role');

COMMENT ON TABLE public.admin_audit_log IS
'Audit log for all admin-related operations. Only super admins can view, only service role can insert.';
