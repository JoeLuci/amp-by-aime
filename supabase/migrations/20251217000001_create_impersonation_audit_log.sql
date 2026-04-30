-- Create audit log table for admin impersonation sessions
CREATE TABLE IF NOT EXISTS admin_impersonation_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  impersonated_user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for looking up impersonation history by admin
CREATE INDEX IF NOT EXISTS idx_impersonation_logs_admin ON admin_impersonation_logs(admin_user_id);

-- Index for looking up who has impersonated a specific user
CREATE INDEX IF NOT EXISTS idx_impersonation_logs_impersonated ON admin_impersonation_logs(impersonated_user_id);

-- Index for finding active impersonation sessions
CREATE INDEX IF NOT EXISTS idx_impersonation_logs_active ON admin_impersonation_logs(ended_at) WHERE ended_at IS NULL;

-- RLS policies
ALTER TABLE admin_impersonation_logs ENABLE ROW LEVEL SECURITY;

-- Only admins can view impersonation logs
CREATE POLICY "Admins can view impersonation logs" ON admin_impersonation_logs
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_admin = true
    )
  );

COMMENT ON TABLE admin_impersonation_logs IS 'Audit log tracking when admins impersonate user accounts for troubleshooting';
