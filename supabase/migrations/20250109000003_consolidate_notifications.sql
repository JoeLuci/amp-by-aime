-- Drop all existing versions of the function to avoid conflicts
DROP FUNCTION IF EXISTS create_notification_for_users(TEXT, TEXT, TEXT, user_role[], plan_tier[], TEXT, UUID, TIMESTAMPTZ, TIMESTAMPTZ);
DROP FUNCTION IF EXISTS create_notification_for_users(TEXT, TEXT, TEXT, user_role[], plan_tier[], TEXT, UUID, TIMESTAMPTZ, TIMESTAMPTZ, UUID);

-- Create the final version with all parameters
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

-- Update the notify_new_content function to generate proper URLs
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

  -- Create notification for users with access (pass NULL for created_by since auto-generated)
  PERFORM create_notification_for_users(
    v_title,
    v_message,
    'info',
    NEW.user_role_access,
    NEW.required_plan_tier,
    v_content_type,
    NEW.id,
    NULL,
    NULL,
    NULL
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Recreate triggers
DROP TRIGGER IF EXISTS trigger_notify_new_resource ON resources;
CREATE TRIGGER trigger_notify_new_resource
  AFTER INSERT ON resources
  FOR EACH ROW
  WHEN (NEW.is_published = true)
  EXECUTE FUNCTION notify_new_content();

DROP TRIGGER IF EXISTS trigger_notify_new_lender ON lenders;
CREATE TRIGGER trigger_notify_new_lender
  AFTER INSERT ON lenders
  FOR EACH ROW
  WHEN (NEW.is_active = true)
  EXECUTE FUNCTION notify_new_content();

DROP TRIGGER IF EXISTS trigger_notify_new_vendor ON vendors;
CREATE TRIGGER trigger_notify_new_vendor
  AFTER INSERT ON vendors
  FOR EACH ROW
  WHEN (NEW.is_active = true)
  EXECUTE FUNCTION notify_new_content();

DROP TRIGGER IF EXISTS trigger_notify_new_event ON events;
CREATE TRIGGER trigger_notify_new_event
  AFTER INSERT ON events
  FOR EACH ROW
  WHEN (NEW.is_published = true)
  EXECUTE FUNCTION notify_new_content();
