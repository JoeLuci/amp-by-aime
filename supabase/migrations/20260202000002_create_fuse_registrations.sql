-- Migration: Create Fuse Registration tables
-- This migration creates tables to track member ticket claims and public ticket purchases for annual Fuse events

-- ============================================
-- Table: fuse_events (multi-year support)
-- ============================================
CREATE TABLE IF NOT EXISTS fuse_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  year INTEGER NOT NULL UNIQUE,
  start_date DATE,
  end_date DATE,
  registration_open BOOLEAN DEFAULT false,
  claim_form_url TEXT,
  is_active BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for quick lookup of active event
CREATE INDEX idx_fuse_events_is_active ON fuse_events(is_active) WHERE is_active = true;
CREATE INDEX idx_fuse_events_year ON fuse_events(year);

-- Only one active event at a time
CREATE UNIQUE INDEX idx_fuse_events_single_active ON fuse_events(is_active) WHERE is_active = true;

-- ============================================
-- Table: fuse_registrations
-- ============================================
CREATE TABLE IF NOT EXISTS fuse_registrations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  fuse_event_id UUID NOT NULL REFERENCES fuse_events(id) ON DELETE CASCADE,
  user_id UUID REFERENCES profiles(id) ON DELETE SET NULL, -- NULL for public purchases

  -- Registrant info
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  company TEXT,

  -- Ticket info
  ticket_type TEXT NOT NULL CHECK (ticket_type IN ('general_admission', 'general_admission_plus', 'vip')),
  tier TEXT CHECK (tier IN ('Premium', 'Elite', 'VIP') OR tier IS NULL), -- NULL for public
  purchase_type TEXT NOT NULL CHECK (purchase_type IN ('claimed', 'purchased')),

  -- Add-ons
  has_hall_of_aime BOOLEAN DEFAULT false,
  has_wmn_at_fuse BOOLEAN DEFAULT false,

  -- GHL integration
  ghl_contact_id TEXT,
  ghl_form_submission_id TEXT,

  -- Source tracking
  registration_source TEXT NOT NULL CHECK (registration_source IN ('ghl_form', 'admin_manual')),
  notes TEXT,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL -- Admin who added (for manual entries)
);

-- Indexes for common queries
CREATE INDEX idx_fuse_registrations_event ON fuse_registrations(fuse_event_id);
CREATE INDEX idx_fuse_registrations_user ON fuse_registrations(user_id);
CREATE INDEX idx_fuse_registrations_email ON fuse_registrations(email);
CREATE INDEX idx_fuse_registrations_ticket_type ON fuse_registrations(ticket_type);
CREATE INDEX idx_fuse_registrations_tier ON fuse_registrations(tier);
CREATE INDEX idx_fuse_registrations_purchase_type ON fuse_registrations(purchase_type);

-- ============================================
-- Table: fuse_registration_guests
-- ============================================
CREATE TABLE IF NOT EXISTS fuse_registration_guests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  registration_id UUID NOT NULL REFERENCES fuse_registrations(id) ON DELETE CASCADE,

  -- Guest info
  full_name TEXT NOT NULL,
  email TEXT,
  phone TEXT,

  -- Ticket info
  ticket_type TEXT NOT NULL CHECK (ticket_type IN ('vip_guest', 'general_admission', 'general_admission_plus', 'vip')),
  is_included BOOLEAN DEFAULT false, -- TRUE if included with VIP, FALSE if purchased

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for guest lookups
CREATE INDEX idx_fuse_registration_guests_registration ON fuse_registration_guests(registration_id);

-- ============================================
-- Profile addition: fuse_ticket_claimed_year
-- ============================================
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS fuse_ticket_claimed_year INTEGER;

-- Index for banner display check
CREATE INDEX idx_profiles_fuse_claimed_year ON profiles(fuse_ticket_claimed_year);

-- ============================================
-- Triggers for updated_at
-- ============================================

-- Fuse events trigger
CREATE TRIGGER update_fuse_events_updated_at
  BEFORE UPDATE ON fuse_events
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Fuse registrations trigger
CREATE TRIGGER update_fuse_registrations_updated_at
  BEFORE UPDATE ON fuse_registrations
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- RLS Policies
-- ============================================

-- Enable RLS
ALTER TABLE fuse_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE fuse_registrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE fuse_registration_guests ENABLE ROW LEVEL SECURITY;

-- Fuse events: Read access for all authenticated users, write access for admins
CREATE POLICY "Anyone can view fuse events" ON fuse_events
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can manage fuse events" ON fuse_events
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_admin = true
    )
  );

-- Fuse registrations: Users can view their own, admins can view all
CREATE POLICY "Users can view own registrations" ON fuse_registrations
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_admin = true
    )
  );

CREATE POLICY "Admins can manage registrations" ON fuse_registrations
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_admin = true
    )
  );

-- Service role can manage registrations (for webhooks)
CREATE POLICY "Service role can manage registrations" ON fuse_registrations
  FOR ALL TO service_role USING (true);

-- Fuse registration guests: Users can view guests for their own registrations, admins can view all
CREATE POLICY "Users can view own registration guests" ON fuse_registration_guests
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM fuse_registrations fr
      WHERE fr.id = fuse_registration_guests.registration_id
      AND (
        fr.user_id = auth.uid() OR
        EXISTS (
          SELECT 1 FROM profiles
          WHERE profiles.id = auth.uid()
          AND profiles.is_admin = true
        )
      )
    )
  );

CREATE POLICY "Admins can manage registration guests" ON fuse_registration_guests
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_admin = true
    )
  );

-- Service role can manage guests (for webhooks)
CREATE POLICY "Service role can manage guests" ON fuse_registration_guests
  FOR ALL TO service_role USING (true);

-- ============================================
-- Seed initial Fuse 2026 event
-- ============================================
INSERT INTO fuse_events (name, year, start_date, end_date, registration_open, claim_form_url, is_active)
VALUES (
  'Fuse 2026',
  2026,
  '2026-04-15',
  '2026-04-18',
  true,
  'https://portal.aimegroup.com/widget/form/kaAl00410NaYvC0bEfCH',
  true
);

-- Add comment for documentation
COMMENT ON TABLE fuse_events IS 'Stores Fuse event definitions for multi-year support';
COMMENT ON TABLE fuse_registrations IS 'Stores member ticket claims and public ticket purchases for Fuse events';
COMMENT ON TABLE fuse_registration_guests IS 'Stores guest tickets associated with registrations';
COMMENT ON COLUMN profiles.fuse_ticket_claimed_year IS 'Tracks which year the member claimed their included Fuse ticket';
