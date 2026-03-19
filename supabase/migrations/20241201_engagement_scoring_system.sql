-- Automated Engagement Scoring System
-- This migration creates the scoring configuration and calculation system

-- Add engagement score to profiles
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS engagement_score INTEGER DEFAULT 0;

-- Create engagement scoring configuration table
-- Admins can configure point values for each activity type
CREATE TABLE IF NOT EXISTS engagement_scoring_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  metric_key TEXT NOT NULL UNIQUE,
  metric_name TEXT NOT NULL,
  metric_description TEXT,
  points_per_action INTEGER NOT NULL DEFAULT 1,
  max_points_per_period INTEGER, -- Optional cap per period
  period_days INTEGER DEFAULT 30, -- Time period for scoring (rolling window)
  is_active BOOLEAN DEFAULT true,
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create engagement thresholds table
-- Defines score ranges for each engagement level
CREATE TABLE IF NOT EXISTS engagement_thresholds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  engagement_level_id UUID REFERENCES engagement_levels(id) ON DELETE CASCADE,
  min_score INTEGER NOT NULL,
  max_score INTEGER, -- NULL means unlimited (for top tier)
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(engagement_level_id)
);

-- Insert default scoring configuration
INSERT INTO engagement_scoring_config (metric_key, metric_name, metric_description, points_per_action, max_points_per_period, display_order) VALUES
  ('login', 'Logins', 'Points for logging into the platform', 5, 50, 1),
  ('vendor_connection', 'Vendor Connections', 'Points for connecting with vendors', 20, NULL, 2),
  ('lender_connection', 'Lender Connections', 'Points for connecting with lenders', 20, NULL, 3),
  ('escalation', 'Loan Escalations', 'Points for submitting escalations', 25, NULL, 4),
  ('resource_view', 'Resource Views', 'Points for viewing resources', 2, 100, 5),
  ('event_registration', 'Event Registrations', 'Points for registering for events', 15, NULL, 6),
  ('profile_complete', 'Profile Completion', 'One-time bonus for completing profile', 50, 50, 7)
ON CONFLICT (metric_key) DO NOTHING;

-- Insert default thresholds (need to get engagement_level IDs)
DO $$
DECLARE
  super_id UUID;
  engaged_id UUID;
  unengaged_id UUID;
BEGIN
  SELECT id INTO super_id FROM engagement_levels WHERE name = 'Super Member';
  SELECT id INTO engaged_id FROM engagement_levels WHERE name = 'Engaged Member';
  SELECT id INTO unengaged_id FROM engagement_levels WHERE name = 'Unengaged Member';

  -- Super Member: 150+ points
  INSERT INTO engagement_thresholds (engagement_level_id, min_score, max_score)
  VALUES (super_id, 150, NULL)
  ON CONFLICT (engagement_level_id) DO NOTHING;

  -- Engaged Member: 50-149 points
  INSERT INTO engagement_thresholds (engagement_level_id, min_score, max_score)
  VALUES (engaged_id, 50, 149)
  ON CONFLICT (engagement_level_id) DO NOTHING;

  -- Unengaged Member: 0-49 points
  INSERT INTO engagement_thresholds (engagement_level_id, min_score, max_score)
  VALUES (unengaged_id, 0, 49)
  ON CONFLICT (engagement_level_id) DO NOTHING;
END $$;

-- Enable RLS on new tables
ALTER TABLE engagement_scoring_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE engagement_thresholds ENABLE ROW LEVEL SECURITY;

-- Anyone can view scoring config (for transparency)
CREATE POLICY "Anyone can view scoring config"
  ON engagement_scoring_config FOR SELECT
  TO authenticated
  USING (true);

-- Only admins can manage scoring config
CREATE POLICY "Admins can manage scoring config"
  ON engagement_scoring_config FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_admin = true
    )
  );

-- Anyone can view thresholds
CREATE POLICY "Anyone can view thresholds"
  ON engagement_thresholds FOR SELECT
  TO authenticated
  USING (true);

-- Only admins can manage thresholds
CREATE POLICY "Admins can manage thresholds"
  ON engagement_thresholds FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_admin = true
    )
  );

-- Create function to calculate engagement score for a user
CREATE OR REPLACE FUNCTION calculate_engagement_score(user_uuid UUID)
RETURNS INTEGER AS $$
DECLARE
  total_score INTEGER := 0;
  config_row RECORD;
  activity_count INTEGER;
  points_earned INTEGER;
  period_start TIMESTAMPTZ;
BEGIN
  -- Loop through each active scoring metric
  FOR config_row IN
    SELECT * FROM engagement_scoring_config WHERE is_active = true
  LOOP
    period_start := NOW() - (config_row.period_days || ' days')::INTERVAL;
    activity_count := 0;

    CASE config_row.metric_key
      WHEN 'login' THEN
        -- Count logins (based on last_login_at updates - simplified to 1 if logged in recently)
        SELECT CASE
          WHEN last_login_at >= period_start THEN
            GREATEST(1, EXTRACT(EPOCH FROM (NOW() - last_login_at)) / 86400 / 7)::INTEGER -- Approximate weekly logins
          ELSE 0
        END INTO activity_count
        FROM profiles WHERE id = user_uuid;

      WHEN 'vendor_connection' THEN
        SELECT COUNT(*) INTO activity_count
        FROM vendor_connections
        WHERE user_id = user_uuid AND created_at >= period_start;

      WHEN 'lender_connection' THEN
        SELECT COUNT(*) INTO activity_count
        FROM lender_connections
        WHERE user_id = user_uuid AND created_at >= period_start;

      WHEN 'escalation' THEN
        SELECT COUNT(*) INTO activity_count
        FROM loan_escalations
        WHERE user_id = user_uuid AND created_at >= period_start;

      WHEN 'resource_view' THEN
        SELECT COUNT(*) INTO activity_count
        FROM analytics_events
        WHERE user_id = user_uuid
          AND event_type = 'view'
          AND content_type = 'resource'
          AND created_at >= period_start;

      WHEN 'event_registration' THEN
        SELECT COUNT(*) INTO activity_count
        FROM analytics_events
        WHERE user_id = user_uuid
          AND event_type = 'registration'
          AND content_type = 'event'
          AND created_at >= period_start;

      WHEN 'profile_complete' THEN
        SELECT CASE WHEN profile_complete = true THEN 1 ELSE 0 END INTO activity_count
        FROM profiles WHERE id = user_uuid;

      ELSE
        activity_count := 0;
    END CASE;

    -- Calculate points for this metric
    points_earned := activity_count * config_row.points_per_action;

    -- Apply cap if configured
    IF config_row.max_points_per_period IS NOT NULL THEN
      points_earned := LEAST(points_earned, config_row.max_points_per_period);
    END IF;

    total_score := total_score + points_earned;
  END LOOP;

  RETURN total_score;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create function to get engagement level based on score
CREATE OR REPLACE FUNCTION get_engagement_level(score INTEGER)
RETURNS TEXT AS $$
DECLARE
  level_name TEXT;
BEGIN
  SELECT el.name INTO level_name
  FROM engagement_thresholds et
  JOIN engagement_levels el ON el.id = et.engagement_level_id
  WHERE score >= et.min_score
    AND (et.max_score IS NULL OR score <= et.max_score)
  ORDER BY et.min_score DESC
  LIMIT 1;

  RETURN COALESCE(level_name, 'Unengaged Member');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create function to update a single user's engagement
CREATE OR REPLACE FUNCTION update_user_engagement(user_uuid UUID)
RETURNS VOID AS $$
DECLARE
  new_score INTEGER;
  new_level TEXT;
BEGIN
  new_score := calculate_engagement_score(user_uuid);
  new_level := get_engagement_level(new_score);

  UPDATE profiles
  SET engagement_score = new_score,
      engagement_level = new_level,
      updated_at = NOW()
  WHERE id = user_uuid;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create function to update all users' engagement scores (for batch processing)
CREATE OR REPLACE FUNCTION update_all_engagement_scores()
RETURNS INTEGER AS $$
DECLARE
  user_record RECORD;
  updated_count INTEGER := 0;
BEGIN
  FOR user_record IN
    SELECT id FROM profiles
    WHERE role NOT IN ('admin', 'super_admin', 'partner_vendor', 'partner_lender')
  LOOP
    PERFORM update_user_engagement(user_record.id);
    updated_count := updated_count + 1;
  END LOOP;

  RETURN updated_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_profiles_engagement_score ON profiles(engagement_score);
CREATE INDEX IF NOT EXISTS idx_engagement_scoring_config_active ON engagement_scoring_config(is_active);
CREATE INDEX IF NOT EXISTS idx_vendor_connections_user_created ON vendor_connections(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_lender_connections_user_created ON lender_connections(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_loan_escalations_user_created ON loan_escalations(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_analytics_events_user_type_created ON analytics_events(user_id, event_type, created_at);

-- Add comments
COMMENT ON TABLE engagement_scoring_config IS 'Admin-configurable point values for each engagement metric';
COMMENT ON TABLE engagement_thresholds IS 'Score ranges that map to engagement levels';
COMMENT ON FUNCTION calculate_engagement_score IS 'Calculates total engagement score for a user based on their activity';
COMMENT ON FUNCTION get_engagement_level IS 'Maps a score to an engagement level name';
COMMENT ON FUNCTION update_user_engagement IS 'Updates engagement score and level for a single user';
COMMENT ON FUNCTION update_all_engagement_scores IS 'Batch updates engagement for all members';
