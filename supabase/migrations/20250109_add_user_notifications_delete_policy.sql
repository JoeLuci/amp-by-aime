-- Add RLS policy to allow users to delete their own notifications

-- First check if RLS is enabled
ALTER TABLE user_notifications ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can delete their own notifications" ON user_notifications;

-- Create delete policy - users can delete their own notifications
CREATE POLICY "Users can delete their own notifications"
ON user_notifications
FOR DELETE
TO authenticated
USING (auth.uid() = user_id);

-- Also ensure users can update their own notifications (for marking as read)
DROP POLICY IF EXISTS "Users can update their own notifications" ON user_notifications;

CREATE POLICY "Users can update their own notifications"
ON user_notifications
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Ensure users can select their own notifications
DROP POLICY IF EXISTS "Users can view their own notifications" ON user_notifications;

CREATE POLICY "Users can view their own notifications"
ON user_notifications
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);
