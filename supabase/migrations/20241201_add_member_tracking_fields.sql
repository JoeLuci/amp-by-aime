-- Add member tracking fields to profiles
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS has_completed_trial BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS engagement_level TEXT;

-- Create engagement_levels table for admin configuration
CREATE TABLE IF NOT EXISTS engagement_levels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  color TEXT DEFAULT '#6b7280', -- Default gray color for UI
  sort_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default engagement levels
INSERT INTO engagement_levels (name, description, color, sort_order) VALUES
  ('Super Member', 'Highly active and engaged with the platform', '#22c55e', 1),
  ('Engaged Member', 'Regular user with moderate activity', '#3b82f6', 2),
  ('Unengaged Member', 'Inactive or minimal platform usage', '#ef4444', 3)
ON CONFLICT (name) DO NOTHING;

-- Enable RLS
ALTER TABLE engagement_levels ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to read engagement levels
CREATE POLICY "Anyone can view engagement levels"
  ON engagement_levels FOR SELECT
  TO authenticated
  USING (true);

-- Only admins can manage engagement levels
CREATE POLICY "Admins can manage engagement levels"
  ON engagement_levels FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_admin = true
    )
  );

-- Add index for engagement level lookups
CREATE INDEX IF NOT EXISTS idx_profiles_engagement_level ON profiles(engagement_level);
CREATE INDEX IF NOT EXISTS idx_profiles_last_login ON profiles(last_login_at);

-- Add comment for documentation
COMMENT ON COLUMN profiles.last_login_at IS 'Timestamp of the user''s last login';
COMMENT ON COLUMN profiles.has_completed_trial IS 'Whether user has previously completed a free trial';
COMMENT ON COLUMN profiles.engagement_level IS 'Current engagement classification for the member';
