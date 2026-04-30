-- Fix RLS policy for categories table to use is_admin instead of role check

-- Drop the old policy
DROP POLICY IF EXISTS "Admins can manage categories" ON public.categories;

-- Create new policy that checks is_admin flag
CREATE POLICY "Admins can manage categories"
ON public.categories
FOR ALL
TO public
USING (
  EXISTS (
    SELECT 1
    FROM profiles
    WHERE profiles.id = auth.uid()
    AND profiles.is_admin = true
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM profiles
    WHERE profiles.id = auth.uid()
    AND profiles.is_admin = true
  )
);
