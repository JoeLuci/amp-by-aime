-- Create opportunity tracking tables for GHL integration
-- These tables store form submissions from user portal modals

-- Lender Connection Requests
CREATE TABLE lender_connections (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

  -- Lender information
  lender_id UUID REFERENCES lenders(id) ON DELETE SET NULL,
  lender_name TEXT, -- Stored for historical record even if lender is deleted

  -- User information (snapshot at time of request)
  user_full_name TEXT NOT NULL,
  user_email TEXT NOT NULL,
  user_phone TEXT,
  user_nmls_number TEXT,
  user_state_licenses TEXT[],

  -- GHL integration
  ghl_opportunity_id TEXT,
  ghl_contact_id TEXT,

  -- Status tracking
  status TEXT DEFAULT 'pending', -- 'pending', 'submitted_to_ghl', 'completed', 'failed'
  error_message TEXT,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  submitted_to_ghl_at TIMESTAMPTZ
);

-- Vendor Connection Requests
CREATE TABLE vendor_connections (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

  -- Vendor information
  vendor_id UUID REFERENCES vendors(id) ON DELETE SET NULL,
  vendor_name TEXT, -- Stored for historical record

  -- User information (snapshot at time of request)
  user_full_name TEXT NOT NULL,
  user_email TEXT NOT NULL,
  user_phone TEXT,
  user_nmls_number TEXT,
  user_state_licenses TEXT[],

  -- GHL integration
  ghl_opportunity_id TEXT,
  ghl_contact_id TEXT,

  -- Status tracking
  status TEXT DEFAULT 'pending',
  error_message TEXT,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  submitted_to_ghl_at TIMESTAMPTZ
);

-- Change AE Requests
CREATE TABLE change_ae_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

  -- Lender information
  lender_id UUID REFERENCES lenders(id) ON DELETE SET NULL,
  lender_name TEXT,

  -- User information (snapshot at time of request)
  user_full_name TEXT NOT NULL,
  user_email TEXT NOT NULL,
  user_phone TEXT,
  user_nmls_number TEXT,
  user_state_licenses TEXT[],

  -- Issue details
  account_executive_name TEXT,
  issue_type TEXT,
  issue_description TEXT,
  spoken_to_ae BOOLEAN DEFAULT false,

  -- GHL integration
  ghl_opportunity_id TEXT,
  ghl_contact_id TEXT,

  -- Status tracking
  status TEXT DEFAULT 'pending',
  error_message TEXT,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  submitted_to_ghl_at TIMESTAMPTZ
);

-- Loan Escalations
CREATE TABLE loan_escalations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

  -- Lender/Vendor information
  lender_id UUID REFERENCES lenders(id) ON DELETE SET NULL,
  vendor_id UUID REFERENCES vendors(id) ON DELETE SET NULL,
  partner_name TEXT, -- Stored for historical record
  partner_type TEXT, -- 'lender' or 'vendor'

  -- Originator details (snapshot at time of request)
  originator_full_name TEXT NOT NULL,
  originator_email TEXT NOT NULL,
  originator_phone TEXT,
  originator_nmls_number TEXT,
  originator_state_licenses TEXT[],

  -- Loan details
  loan_number TEXT,
  loan_type TEXT,
  loan_purpose TEXT,
  borrower_last_name TEXT,
  borrower_location TEXT,
  submission_date DATE,
  closing_date DATE,
  lock_expiration_date DATE,

  -- Issue details
  account_executive_name TEXT,
  issue_type TEXT,
  issue_description TEXT,
  spoken_to_ae BOOLEAN DEFAULT false,

  -- GHL integration
  ghl_opportunity_id TEXT,
  ghl_contact_id TEXT,

  -- Status tracking
  status TEXT DEFAULT 'pending',
  error_message TEXT,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  submitted_to_ghl_at TIMESTAMPTZ
);

-- Create indexes for performance
CREATE INDEX idx_lender_connections_user ON lender_connections(user_id);
CREATE INDEX idx_lender_connections_lender ON lender_connections(lender_id);
CREATE INDEX idx_lender_connections_status ON lender_connections(status);
CREATE INDEX idx_lender_connections_ghl ON lender_connections(ghl_opportunity_id) WHERE ghl_opportunity_id IS NOT NULL;

CREATE INDEX idx_vendor_connections_user ON vendor_connections(user_id);
CREATE INDEX idx_vendor_connections_vendor ON vendor_connections(vendor_id);
CREATE INDEX idx_vendor_connections_status ON vendor_connections(status);
CREATE INDEX idx_vendor_connections_ghl ON vendor_connections(ghl_opportunity_id) WHERE ghl_opportunity_id IS NOT NULL;

CREATE INDEX idx_change_ae_requests_user ON change_ae_requests(user_id);
CREATE INDEX idx_change_ae_requests_lender ON change_ae_requests(lender_id);
CREATE INDEX idx_change_ae_requests_status ON change_ae_requests(status);
CREATE INDEX idx_change_ae_requests_ghl ON change_ae_requests(ghl_opportunity_id) WHERE ghl_opportunity_id IS NOT NULL;

CREATE INDEX idx_loan_escalations_user ON loan_escalations(user_id);
CREATE INDEX idx_loan_escalations_lender ON loan_escalations(lender_id);
CREATE INDEX idx_loan_escalations_vendor ON loan_escalations(vendor_id);
CREATE INDEX idx_loan_escalations_status ON loan_escalations(status);
CREATE INDEX idx_loan_escalations_ghl ON loan_escalations(ghl_opportunity_id) WHERE ghl_opportunity_id IS NOT NULL;

-- Apply updated_at triggers
CREATE TRIGGER update_lender_connections_updated_at BEFORE UPDATE ON lender_connections
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_vendor_connections_updated_at BEFORE UPDATE ON vendor_connections
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_change_ae_requests_updated_at BEFORE UPDATE ON change_ae_requests
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_loan_escalations_updated_at BEFORE UPDATE ON loan_escalations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Add comments for documentation
COMMENT ON TABLE lender_connections IS 'Tracks user requests to connect with lender partners';
COMMENT ON TABLE vendor_connections IS 'Tracks user requests to connect with vendor partners';
COMMENT ON TABLE change_ae_requests IS 'Tracks user requests to change their account executive';
COMMENT ON TABLE loan_escalations IS 'Tracks urgent loan issues escalated to AIME team';
