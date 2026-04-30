-- ============================================================================
-- COMPLETE AUTO-NOTIFICATION SYSTEM SETUP
-- This migration ensures all triggers and functions are properly set up
-- ============================================================================

-- STEP 1: Update create_notification_for_users to include admins
-- ============================================================================
CREATE OR REPLACE FUNCTION create_notification_for_users(
  p_title TEXT,
  p_message TEXT,
  p_notification_type TEXT,
  p_target_roles user_role[] DEFAULT NULL,
  p_target_plan_tiers plan_tier[] DEFAULT NULL,
  p_content_type TEXT DEFAULT NULL,
  p_content_id UUID DEFAULT NULL,
  p_scheduled_at TIMESTAMPTZ DEFAULT NULL,
  p_expires_at TIMESTAMPTZ DEFAULT NULL,
  p_created_by UUID DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_notification_id UUID;
  v_user_record RECORD;
BEGIN
  -- Create the notification
  INSERT INTO notifications (
    title,
    message,
    type,
    target_roles,
    target_plan_tiers,
    content_type,
    content_id,
    scheduled_at,
    expires_at,
    is_active,
    created_by,
    created_at
  ) VALUES (
    p_title,
    p_message,
    p_notification_type,
    p_target_roles,
    p_target_plan_tiers,
    p_content_type,
    p_content_id,
    COALESCE(p_scheduled_at, NOW()),
    p_expires_at,
    true,
    p_created_by,
    NOW()
  )
  RETURNING id INTO v_notification_id;

  -- Only create user_notifications if scheduled_at is now or in the past
  IF p_scheduled_at IS NULL OR p_scheduled_at <= NOW() THEN
    -- Create user_notifications for all eligible users (INCLUDING admins)
    FOR v_user_record IN
      SELECT p.id as user_id
      FROM profiles p
      WHERE p.id IS NOT NULL
        -- Check role filter (NULL means all roles)
        AND (p_target_roles IS NULL OR p.role = ANY(p_target_roles))
        -- Check plan tier filter (NULL means all tiers)
        AND (p_target_plan_tiers IS NULL OR p.plan_tier = ANY(p_target_plan_tiers))
        -- REMOVED: Admin exclusion logic - admins now receive all notifications
    LOOP
      INSERT INTO user_notifications (
        user_id,
        notification_id,
        is_read,
        created_at
      ) VALUES (
        v_user_record.user_id,
        v_notification_id,
        false,
        NOW()
      )
      ON CONFLICT (user_id, notification_id) DO NOTHING;
    END LOOP;
  END IF;

  RETURN v_notification_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- STEP 2: Create or replace notify_new_content function
-- ============================================================================
CREATE OR REPLACE FUNCTION notify_new_content()
RETURNS TRIGGER AS $$
DECLARE
  v_title TEXT;
  v_message TEXT;
  v_content_type TEXT;
  v_url TEXT;
BEGIN
  -- Determine content type, build notification, and generate URL
  IF TG_TABLE_NAME = 'resources' THEN
    v_content_type := 'resource';
    v_title := 'New Resource Available';
    v_message := format('A new resource "%s" has been added that you may find useful.', NEW.title);
    v_url := format('/dashboard/resources/%s', NEW.slug);
  ELSIF TG_TABLE_NAME = 'lenders' THEN
    v_content_type := 'lender';
    v_title := 'New Lender Available';
    v_message := format('A new lender "%s" has been added to the marketplace.', NEW.name);
    v_url := format('/dashboard/lenders/%s', NEW.slug);
  ELSIF TG_TABLE_NAME = 'vendors' THEN
    v_content_type := 'vendor';
    v_title := 'New Vendor Available';
    v_message := format('A new vendor "%s" has been added to the marketplace.', NEW.name);
    v_url := format('/dashboard/market/%s', NEW.slug);
  ELSIF TG_TABLE_NAME = 'events' THEN
    v_content_type := 'event';
    v_title := 'New Event Available';
    v_message := format('A new event "%s" has been scheduled.', NEW.title);
    v_url := format('/dashboard/events/%s', NEW.id);
  ELSE
    RETURN NEW;
  END IF;

  -- Append URL to message for frontend parsing
  v_message := v_message || ' [URL:' || v_url || ']';

  -- Create notification for users with access (NULL for created_by = auto-generated)
  PERFORM create_notification_for_users(
    v_title,
    v_message,
    'info',
    NEW.user_role_access,
    NEW.required_plan_tier,
    v_content_type,
    NEW.id,
    NULL,  -- scheduled_at (send immediately)
    NULL,  -- expires_at (no expiry)
    NULL   -- created_by (auto-generated)
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- STEP 3: Drop existing triggers
-- ============================================================================
DROP TRIGGER IF EXISTS trigger_notify_new_resource ON resources;
DROP TRIGGER IF EXISTS trigger_notify_new_lender ON lenders;
DROP TRIGGER IF EXISTS trigger_notify_new_vendor ON vendors;
DROP TRIGGER IF EXISTS trigger_notify_new_event ON events;

-- STEP 4: Create triggers for auto-notifications
-- ============================================================================
CREATE TRIGGER trigger_notify_new_resource
  AFTER INSERT ON resources
  FOR EACH ROW
  WHEN (NEW.is_published = true)
  EXECUTE FUNCTION notify_new_content();

CREATE TRIGGER trigger_notify_new_lender
  AFTER INSERT ON lenders
  FOR EACH ROW
  WHEN (NEW.is_active = true)
  EXECUTE FUNCTION notify_new_content();

CREATE TRIGGER trigger_notify_new_vendor
  AFTER INSERT ON vendors
  FOR EACH ROW
  WHEN (NEW.is_active = true)
  EXECUTE FUNCTION notify_new_content();

CREATE TRIGGER trigger_notify_new_event
  AFTER INSERT ON events
  FOR EACH ROW
  WHEN (NEW.is_published = true)
  EXECUTE FUNCTION notify_new_content();

-- STEP 5: Ensure RLS policies are correct
-- ============================================================================

-- Enable RLS on both tables
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_notifications ENABLE ROW LEVEL SECURITY;

-- Drop all existing policies to avoid conflicts
DROP POLICY IF EXISTS "Anyone can view notifications" ON notifications;
DROP POLICY IF EXISTS "Notifications are viewable by all authenticated users" ON notifications;
DROP POLICY IF EXISTS "Users can view notifications" ON notifications;
DROP POLICY IF EXISTS "authenticated_users_can_read" ON notifications;
DROP POLICY IF EXISTS "authenticated_can_view_notifications" ON notifications;

DROP POLICY IF EXISTS "Users can view their own notifications" ON user_notifications;
DROP POLICY IF EXISTS "Users can update their own notifications" ON user_notifications;
DROP POLICY IF EXISTS "Users can delete their own notifications" ON user_notifications;
DROP POLICY IF EXISTS "Users can view their own notification status" ON user_notifications;
DROP POLICY IF EXISTS "Users can insert their own notification status" ON user_notifications;
DROP POLICY IF EXISTS "Users can update their own notification status" ON user_notifications;
DROP POLICY IF EXISTS "user_notifications_select" ON user_notifications;
DROP POLICY IF EXISTS "user_notifications_update" ON user_notifications;
DROP POLICY IF EXISTS "user_notifications_delete" ON user_notifications;

-- Create clean policies
CREATE POLICY "authenticated_can_view_notifications"
ON notifications FOR SELECT TO authenticated
USING (true);

CREATE POLICY "user_notifications_select"
ON user_notifications FOR SELECT TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "user_notifications_update"
ON user_notifications FOR UPDATE TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "user_notifications_delete"
ON user_notifications FOR DELETE TO authenticated
USING (auth.uid() = user_id);

-- STEP 6: Grant permissions
-- ============================================================================
GRANT SELECT ON notifications TO authenticated;
GRANT SELECT, UPDATE, DELETE ON user_notifications TO authenticated;
GRANT EXECUTE ON FUNCTION create_notification_for_users TO authenticated;
GRANT EXECUTE ON FUNCTION notify_new_content TO authenticated;

-- STEP 7: Success message
-- ============================================================================
DO $$
BEGIN
  RAISE NOTICE 'Auto-notification system setup complete!';
  RAISE NOTICE 'Triggers created: resources, lenders, vendors, events';
  RAISE NOTICE 'Functions updated: create_notification_for_users, notify_new_content';
  RAISE NOTICE 'RLS policies configured for both tables';
END $$;
