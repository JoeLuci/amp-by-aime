-- Add SELECT policy for admins to view all resources
CREATE POLICY "Admins can view all resources"
ON resources
FOR SELECT
TO public
USING (is_admin(auth.uid()));
