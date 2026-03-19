-- Fix RLS policy blocking trigger from inserting profiles
-- The handle_new_user trigger runs as postgres with SECURITY DEFINER
-- but auth.uid() returns NULL in that context, causing INSERT to fail

-- Add policy to allow service role (trigger context) to insert profiles
CREATE POLICY "Service role can insert profiles"
ON public.profiles
FOR INSERT
TO public
WITH CHECK (
  -- Allow service role (trigger context where auth.uid() is NULL)
  auth.role() = 'service_role'
  OR
  -- Also allow authenticated users to insert their own profile
  auth.uid() = id
);

-- Drop the old restrictive policy that was blocking the trigger
DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;
