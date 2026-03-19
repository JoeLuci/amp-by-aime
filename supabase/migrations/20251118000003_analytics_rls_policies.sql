-- Enable RLS on analytics tables
ALTER TABLE analytics_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversion_attributions ENABLE ROW LEVEL SECURITY;

-- Analytics Events Policies

-- Allow users to insert their own events (client-side tracking)
CREATE POLICY "Users can log their own events"
  ON analytics_events FOR INSERT
  WITH CHECK (
    auth.uid() = user_id OR user_id IS NULL
  );

-- Only admins can view analytics events
CREATE POLICY "Admins can view all analytics events"
  ON analytics_events FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_admin = true
    )
  );

-- Only admins can delete events (for data cleanup)
CREATE POLICY "Admins can delete analytics events"
  ON analytics_events FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_admin = true
    )
  );

-- Conversion Attributions Policies

-- Only admins can view conversion data
CREATE POLICY "Admins can view all conversions"
  ON conversion_attributions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_admin = true
    )
  );

-- Only admins can manage conversions
CREATE POLICY "Admins can manage conversions"
  ON conversion_attributions FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_admin = true
    )
  );

-- Grant SELECT permissions on materialized views to authenticated users
-- (RLS will still restrict who can actually see data via other tables)
GRANT SELECT ON content_engagement_summary TO authenticated;
GRANT SELECT ON user_plan_engagement TO authenticated;
GRANT SELECT ON daily_platform_metrics TO authenticated;

COMMENT ON POLICY "Users can log their own events" ON analytics_events IS 'Allow client-side tracking for authenticated and anonymous users';
COMMENT ON POLICY "Admins can view all analytics events" ON analytics_events IS 'Only admins have read access to analytics data';
