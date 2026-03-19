-- Fix RLS policies for notifications - ensure users can see their notifications

-- Drop duplicate/conflicting policies
DROP POLICY IF EXISTS "Users can view their own notification status" ON user_notifications;
DROP POLICY IF EXISTS "Users can insert their own notification status" ON user_notifications;
DROP POLICY IF EXISTS "Users can update their own notification status" ON user_notifications;

-- Keep only the main policies with correct permissions
-- The "Users can view their own notifications" already exists and is correct
-- The "Users can update their own notifications" already exists and is correct
-- The "Users can delete their own notifications" already exists and is correct

-- Ensure notifications table is readable by authenticated users
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Notifications are viewable by all authenticated users" ON notifications;

CREATE POLICY "Notifications are viewable by all authenticated users"
ON notifications
FOR SELECT
TO authenticated
USING (true);
