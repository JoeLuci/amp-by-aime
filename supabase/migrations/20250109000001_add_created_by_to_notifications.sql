-- Add created_by field to track which admin created the notification
ALTER TABLE notifications
ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES profiles(id) ON DELETE SET NULL;

-- Add index for better query performance
CREATE INDEX IF NOT EXISTS idx_notifications_created_by ON notifications(created_by);

-- Update the create_notification_for_users function to accept created_by
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
    -- Create user_notifications for all eligible users
    FOR v_user_record IN
      SELECT p.id as user_id
      FROM profiles p
      WHERE p.id IS NOT NULL
        -- Check role filter (NULL means all roles)
        AND (p_target_roles IS NULL OR p.role = ANY(p_target_roles))
        -- Check plan tier filter (NULL means all tiers)
        AND (p_target_plan_tiers IS NULL OR p.plan_tier = ANY(p_target_plan_tiers))
        -- Exclude admin/super_admin unless explicitly targeted
        AND (p.role NOT IN ('admin', 'super_admin') OR p.role = ANY(COALESCE(p_target_roles, ARRAY[]::user_role[])))
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
