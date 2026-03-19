-- Track which content drove subscriptions/upgrades

CREATE TABLE conversion_attributions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,

  -- Conversion details
  conversion_type TEXT NOT NULL, -- 'signup', 'upgrade', 'renewal', etc.
  from_tier plan_tier,
  to_tier plan_tier NOT NULL,

  -- Attribution (last-touch model - what content did they view before converting?)
  attributed_content_type TEXT,
  attributed_content_id UUID,
  attributed_content_title TEXT,

  -- First-touch attribution (what brought them in originally?)
  first_touch_content_type TEXT,
  first_touch_content_id UUID,

  -- Timestamps
  conversion_date TIMESTAMPTZ DEFAULT NOW(),
  attribution_window_days INTEGER DEFAULT 30, -- How many days back to attribute

  CONSTRAINT valid_conversion_type CHECK (conversion_type IN (
    'signup', 'upgrade', 'downgrade', 'renewal', 'reactivation'
  ))
);

CREATE INDEX idx_conversion_attributions_user ON conversion_attributions(user_id);
CREATE INDEX idx_conversion_attributions_content ON conversion_attributions(attributed_content_type, attributed_content_id);
CREATE INDEX idx_conversion_attributions_date ON conversion_attributions(conversion_date DESC);

-- Function to track conversion (called from Stripe webhook)
CREATE OR REPLACE FUNCTION track_subscription_conversion(
  p_user_id UUID,
  p_from_tier plan_tier,
  p_to_tier plan_tier,
  p_conversion_type TEXT
)
RETURNS void AS $$
DECLARE
  v_last_interaction RECORD;
  v_first_interaction RECORD;
BEGIN
  -- Get last interaction within 30 days (last-touch attribution)
  SELECT content_type, content_id, content_title
  INTO v_last_interaction
  FROM analytics_events
  WHERE user_id = p_user_id
    AND created_at >= NOW() - INTERVAL '30 days'
  ORDER BY created_at DESC
  LIMIT 1;

  -- Get first interaction ever (first-touch attribution)
  SELECT content_type, content_id
  INTO v_first_interaction
  FROM analytics_events
  WHERE user_id = p_user_id
  ORDER BY created_at ASC
  LIMIT 1;

  -- Insert attribution record
  INSERT INTO conversion_attributions (
    user_id,
    conversion_type,
    from_tier,
    to_tier,
    attributed_content_type,
    attributed_content_id,
    attributed_content_title,
    first_touch_content_type,
    first_touch_content_id
  ) VALUES (
    p_user_id,
    p_conversion_type,
    p_from_tier,
    p_to_tier,
    v_last_interaction.content_type,
    v_last_interaction.content_id,
    v_last_interaction.content_title,
    v_first_interaction.content_type,
    v_first_interaction.content_id
  );
END;
$$ LANGUAGE plpgsql;

COMMENT ON TABLE conversion_attributions IS 'Tracks which content drove subscription conversions';
COMMENT ON FUNCTION track_subscription_conversion IS 'Call this from Stripe webhook to attribute conversions to content';
