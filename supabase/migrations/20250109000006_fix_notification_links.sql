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

  -- Create notification with URL in message (we'll parse it on frontend)
  -- Store URL in a JSON field or append to message
  v_message := v_message || ' [URL:' || v_url || ']';

  -- Create notification for users with access
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
