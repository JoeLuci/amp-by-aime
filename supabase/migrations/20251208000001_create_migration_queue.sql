-- Migration queue table for tracking user migration from Bubble
-- Run this migration before starting the user migration process

CREATE TABLE IF NOT EXISTS migration_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Source data (Bubble)
  bubble_user_id TEXT UNIQUE NOT NULL,
  email TEXT NOT NULL,
  first_name TEXT,
  last_name TEXT,
  phone TEXT,
  user_role TEXT,
  subscription_type TEXT,
  stripe_customer_id TEXT,
  bubble_data JSONB,  -- Full Bubble user object for reference

  -- Migration status
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'skipped')),

  -- Step tracking
  supabase_user_created BOOLEAN DEFAULT FALSE,
  supabase_user_id UUID,
  profile_created BOOLEAN DEFAULT FALSE,
  ghl_contact_found BOOLEAN DEFAULT FALSE,
  ghl_contact_id TEXT,
  reset_link_generated BOOLEAN DEFAULT FALSE,
  reset_link TEXT,
  email_sent BOOLEAN DEFAULT FALSE,
  email_sent_at TIMESTAMPTZ,

  -- Error tracking
  error_step TEXT,  -- Which step failed
  error_message TEXT,
  retry_count INTEGER DEFAULT 0,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  processed_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

-- Indexes for efficient querying
CREATE INDEX idx_migration_queue_status ON migration_queue(status);
CREATE INDEX idx_migration_queue_email ON migration_queue(email);
CREATE INDEX idx_migration_queue_bubble_id ON migration_queue(bubble_user_id);

-- Add bubble_user_id to profiles if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'bubble_user_id'
  ) THEN
    ALTER TABLE profiles ADD COLUMN bubble_user_id TEXT UNIQUE;
    CREATE INDEX idx_profiles_bubble_user_id ON profiles(bubble_user_id);
    COMMENT ON COLUMN profiles.bubble_user_id IS 'Original Bubble user ID for migration traceability';
  END IF;
END $$;

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION update_migration_queue_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS migration_queue_updated_at ON migration_queue;
CREATE TRIGGER migration_queue_updated_at
  BEFORE UPDATE ON migration_queue
  FOR EACH ROW
  EXECUTE FUNCTION update_migration_queue_updated_at();

COMMENT ON TABLE migration_queue IS 'Tracks user migration from Bubble to Supabase with full audit trail';

-- Helpful views
CREATE OR REPLACE VIEW migration_stats AS
SELECT
  status,
  COUNT(*) as count,
  COUNT(*) FILTER (WHERE supabase_user_created) as users_created,
  COUNT(*) FILTER (WHERE profile_created) as profiles_created,
  COUNT(*) FILTER (WHERE ghl_contact_found) as ghl_contacts_found,
  COUNT(*) FILTER (WHERE email_sent) as emails_sent
FROM migration_queue
GROUP BY status;

COMMENT ON VIEW migration_stats IS 'Quick stats on migration progress';
