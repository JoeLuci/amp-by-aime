-- Add status tracking for GHL webhook updates
-- This allows us to show user-friendly status in the Support section

-- Create enum for user-facing status display (safe creation)
DO $$ BEGIN
    CREATE TYPE submission_status AS ENUM (
      'received',      -- Initial state after form submission
      'pending',       -- Submitted to GHL, in queue (New stage)
      'in_progress',   -- Team is actively working on it
      'closed',        -- Resolved/completed
      'failed'         -- Error occurred (email failed, GHL error, etc.)
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Add status tracking to change_ae_requests
ALTER TABLE change_ae_requests
  ADD COLUMN IF NOT EXISTS user_status submission_status DEFAULT 'received',
  ADD COLUMN IF NOT EXISTS ghl_stage_name TEXT,
  ADD COLUMN IF NOT EXISTS last_webhook_at TIMESTAMPTZ;

-- Add status tracking to lender_connections
ALTER TABLE lender_connections
  ADD COLUMN IF NOT EXISTS user_status submission_status DEFAULT 'received',
  ADD COLUMN IF NOT EXISTS ghl_stage_name TEXT,
  ADD COLUMN IF NOT EXISTS last_webhook_at TIMESTAMPTZ;

-- Add status tracking to vendor_connections (includes email tracking)
ALTER TABLE vendor_connections
  ADD COLUMN IF NOT EXISTS user_status submission_status DEFAULT 'received',
  ADD COLUMN IF NOT EXISTS ghl_stage_name TEXT,
  ADD COLUMN IF NOT EXISTS last_webhook_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS email_sent_to_vendor BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS email_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS email_error TEXT;

-- Add status tracking to loan_escalations
ALTER TABLE loan_escalations
  ADD COLUMN IF NOT EXISTS user_status submission_status DEFAULT 'received',
  ADD COLUMN IF NOT EXISTS ghl_stage_name TEXT,
  ADD COLUMN IF NOT EXISTS last_webhook_at TIMESTAMPTZ;

-- Add status tracking to support_tickets (for consistency)
ALTER TABLE support_tickets
  ADD COLUMN IF NOT EXISTS user_status submission_status DEFAULT 'received',
  ADD COLUMN IF NOT EXISTS ghl_stage_name TEXT,
  ADD COLUMN IF NOT EXISTS last_webhook_at TIMESTAMPTZ;

-- Create indexes for webhook lookups (fast search by ghl_opportunity_id)
CREATE INDEX IF NOT EXISTS idx_change_ae_requests_ghl_opp_id
  ON change_ae_requests(ghl_opportunity_id);

CREATE INDEX IF NOT EXISTS idx_lender_connections_ghl_opp_id
  ON lender_connections(ghl_opportunity_id);

CREATE INDEX IF NOT EXISTS idx_vendor_connections_ghl_opp_id
  ON vendor_connections(ghl_opportunity_id);

CREATE INDEX IF NOT EXISTS idx_loan_escalations_ghl_opp_id
  ON loan_escalations(ghl_opportunity_id);

CREATE INDEX IF NOT EXISTS idx_support_tickets_ghl_opp_id
  ON support_tickets(ghl_opportunity_id);

-- Create indexes for user status filtering (for Support page)
CREATE INDEX IF NOT EXISTS idx_change_ae_requests_user_status
  ON change_ae_requests(user_id, user_status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_lender_connections_user_status
  ON lender_connections(user_id, user_status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_vendor_connections_user_status
  ON vendor_connections(user_id, user_status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_loan_escalations_user_status
  ON loan_escalations(user_id, user_status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_support_tickets_user_status
  ON support_tickets(user_id, user_status, created_at DESC);

-- Add comments for documentation
COMMENT ON COLUMN change_ae_requests.user_status IS 'User-friendly status: received, pending, in_progress, closed, failed';
COMMENT ON COLUMN change_ae_requests.ghl_stage_name IS 'Current stage name from GHL pipeline (for debugging/admin view)';
COMMENT ON COLUMN change_ae_requests.last_webhook_at IS 'Timestamp of last webhook update from GHL';
COMMENT ON COLUMN vendor_connections.email_sent_to_vendor IS 'Whether email was successfully sent to vendor contact';
COMMENT ON COLUMN vendor_connections.email_error IS 'Error message if email delivery failed';
