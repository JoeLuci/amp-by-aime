-- Create pending_checkouts table to track admin-initiated checkout sessions
CREATE TABLE IF NOT EXISTS pending_checkouts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Stripe & User Info
  stripe_checkout_session_id TEXT UNIQUE,
  user_email TEXT NOT NULL,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,

  -- Plan Info
  plan_id UUID REFERENCES subscription_plans(id),
  plan_name TEXT,
  plan_price NUMERIC(10, 2),
  billing_period TEXT,

  -- Checkout Details
  checkout_url TEXT,
  expires_at TIMESTAMPTZ,

  -- Status Tracking
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'completed', 'expired', 'canceled')),

  -- Who created it
  created_by UUID REFERENCES profiles(id),
  created_by_email TEXT,

  -- Link delivery
  sent_at TIMESTAMPTZ,
  sent_method TEXT CHECK (sent_method IN ('email', 'copied', 'manual')),

  -- Completion tracking
  completed_at TIMESTAMPTZ,
  subscription_id TEXT,

  -- Metadata
  notes TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_pending_checkouts_user_email ON pending_checkouts(user_email);
CREATE INDEX IF NOT EXISTS idx_pending_checkouts_user_id ON pending_checkouts(user_id);
CREATE INDEX IF NOT EXISTS idx_pending_checkouts_status ON pending_checkouts(status);
CREATE INDEX IF NOT EXISTS idx_pending_checkouts_created_by ON pending_checkouts(created_by);
CREATE INDEX IF NOT EXISTS idx_pending_checkouts_stripe_session ON pending_checkouts(stripe_checkout_session_id);
CREATE INDEX IF NOT EXISTS idx_pending_checkouts_expires_at ON pending_checkouts(expires_at);

-- Add trigger for updated_at
DROP TRIGGER IF EXISTS update_pending_checkouts_updated_at ON pending_checkouts;
CREATE TRIGGER update_pending_checkouts_updated_at
  BEFORE UPDATE ON pending_checkouts
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Enable RLS
ALTER TABLE pending_checkouts ENABLE ROW LEVEL SECURITY;

-- Drop existing policies first
DROP POLICY IF EXISTS "Admins can view all pending checkouts" ON pending_checkouts;
DROP POLICY IF EXISTS "Admins can create pending checkouts" ON pending_checkouts;
DROP POLICY IF EXISTS "Admins can update pending checkouts" ON pending_checkouts;
DROP POLICY IF EXISTS "Admins can delete pending checkouts" ON pending_checkouts;

-- RLS Policies
-- Only admins can view pending checkouts
CREATE POLICY "Admins can view all pending checkouts"
  ON pending_checkouts
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_admin = true
    )
  );

-- Only admins can create pending checkouts
CREATE POLICY "Admins can create pending checkouts"
  ON pending_checkouts
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_admin = true
    )
  );

-- Only admins can update pending checkouts
CREATE POLICY "Admins can update pending checkouts"
  ON pending_checkouts
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_admin = true
    )
  );

-- Only admins can delete pending checkouts
CREATE POLICY "Admins can delete pending checkouts"
  ON pending_checkouts
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_admin = true
    )
  );

-- Function to automatically expire old checkouts
CREATE OR REPLACE FUNCTION expire_old_checkouts()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE pending_checkouts
  SET status = 'expired',
      updated_at = NOW()
  WHERE status IN ('pending', 'sent')
    AND expires_at < NOW();
END;
$$;

-- Add comment
COMMENT ON TABLE pending_checkouts IS 'Tracks admin-initiated checkout sessions sent to users for subscription purchases';
COMMENT ON COLUMN pending_checkouts.sent_method IS 'How the checkout link was delivered: email (sent via email), copied (copied to clipboard), manual (other)';
COMMENT ON COLUMN pending_checkouts.status IS 'pending: created but not sent, sent: link sent to user, completed: user completed checkout, expired: link expired, canceled: manually canceled';
