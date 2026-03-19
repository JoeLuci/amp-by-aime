-- Final fix for notifications RLS to allow frontend queries to work
-- This ensures that both tables have proper SELECT policies

-- ============================================================================
-- PART 1: Fix notifications table RLS
-- ============================================================================

-- Enable RLS on notifications table
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Drop ALL existing SELECT policies on notifications to avoid conflicts
DROP POLICY IF EXISTS "Anyone can view notifications" ON notifications;
DROP POLICY IF EXISTS "Notifications are viewable by all authenticated users" ON notifications;
DROP POLICY IF EXISTS "Users can view notifications" ON notifications;
DROP POLICY IF EXISTS "authenticated_users_can_read" ON notifications;

-- Create single, clear SELECT policy for notifications
-- All authenticated users can read all notifications (filtering happens via user_notifications)
CREATE POLICY "authenticated_can_view_notifications"
ON notifications
FOR SELECT
TO authenticated
USING (true);

-- ============================================================================
-- PART 2: Fix user_notifications table RLS
-- ============================================================================

-- Enable RLS on user_notifications table
ALTER TABLE user_notifications ENABLE ROW LEVEL SECURITY;

-- Drop existing policies to recreate them cleanly
DROP POLICY IF EXISTS "Users can view their own notifications" ON user_notifications;
DROP POLICY IF EXISTS "Users can update their own notifications" ON user_notifications;
DROP POLICY IF EXISTS "Users can delete their own notifications" ON user_notifications;
DROP POLICY IF EXISTS "Users can view their own notification status" ON user_notifications;
DROP POLICY IF EXISTS "Users can insert their own notification status" ON user_notifications;
DROP POLICY IF EXISTS "Users can update their own notification status" ON user_notifications;

-- Create clean policies for user_notifications
CREATE POLICY "user_notifications_select"
ON user_notifications
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "user_notifications_update"
ON user_notifications
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "user_notifications_delete"
ON user_notifications
FOR DELETE
TO authenticated
USING (auth.uid() = user_id);

-- ============================================================================
-- PART 3: Verify grants are in place
-- ============================================================================

-- Grant SELECT on both tables to authenticated users
GRANT SELECT ON notifications TO authenticated;
GRANT SELECT ON user_notifications TO authenticated;
GRANT UPDATE ON user_notifications TO authenticated;
GRANT DELETE ON user_notifications TO authenticated;
