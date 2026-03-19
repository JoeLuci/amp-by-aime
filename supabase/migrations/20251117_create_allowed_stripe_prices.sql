-- Create table to manage which Stripe Price IDs can be synced
CREATE TABLE IF NOT EXISTS allowed_stripe_prices (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Stripe Info
  stripe_price_id TEXT UNIQUE NOT NULL,
  stripe_product_id TEXT,

  -- Plan Info (for display)
  plan_name TEXT NOT NULL,
  plan_tier plan_tier NOT NULL,
  billing_period TEXT NOT NULL CHECK (billing_period IN ('monthly', 'annual')),

  -- Status
  is_active BOOLEAN DEFAULT true,

  -- Metadata
  notes TEXT,

  -- Tracking
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_allowed_stripe_prices_price_id ON allowed_stripe_prices(stripe_price_id);
CREATE INDEX IF NOT EXISTS idx_allowed_stripe_prices_is_active ON allowed_stripe_prices(is_active);
CREATE INDEX IF NOT EXISTS idx_allowed_stripe_prices_plan_tier ON allowed_stripe_prices(plan_tier);

-- Add trigger for updated_at
DROP TRIGGER IF EXISTS update_allowed_stripe_prices_updated_at ON allowed_stripe_prices;
CREATE TRIGGER update_allowed_stripe_prices_updated_at
  BEFORE UPDATE ON allowed_stripe_prices
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Enable RLS
ALTER TABLE allowed_stripe_prices ENABLE ROW LEVEL SECURITY;

-- Drop existing policies first
DROP POLICY IF EXISTS "Super admins can view allowed prices" ON allowed_stripe_prices;
DROP POLICY IF EXISTS "Super admins can insert allowed prices" ON allowed_stripe_prices;
DROP POLICY IF EXISTS "Super admins can update allowed prices" ON allowed_stripe_prices;
DROP POLICY IF EXISTS "Super admins can delete allowed prices" ON allowed_stripe_prices;

-- RLS Policies - Only super admins can manage
CREATE POLICY "Super admins can view allowed prices"
  ON allowed_stripe_prices
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_admin = true
    )
  );

CREATE POLICY "Super admins can insert allowed prices"
  ON allowed_stripe_prices
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_admin = true
      AND profiles.role = 'super_admin'
    )
  );

CREATE POLICY "Super admins can update allowed prices"
  ON allowed_stripe_prices
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_admin = true
      AND profiles.role = 'super_admin'
    )
  );

CREATE POLICY "Super admins can delete allowed prices"
  ON allowed_stripe_prices
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_admin = true
      AND profiles.role = 'super_admin'
    )
  );

-- Insert the allowed Stripe Price IDs from the CSV
-- Note: Premium Guest and Premium use the same Price IDs (trial applied at subscription level)
-- Note: Premium Processor Guest and Premium Processor use the same Price IDs (trial applied at subscription level)
INSERT INTO allowed_stripe_prices (stripe_price_id, plan_name, plan_tier, billing_period, notes) VALUES
  -- Premium (Premium Guest uses same Price ID with 90-day trial)
  ('price_1PtZmdKq6gZ6OHL8b8D2okBw', 'Premium Monthly', 'Premium', 'monthly', 'Premium $19.99/mo - Premium Guest uses same price with 90-day trial'),
  ('price_1PtZoCKq6gZ6OHL8NhK2QLQA', 'Premium Annual', 'Premium', 'annual', 'Premium $199/yr - Premium Guest uses same price with 90-day trial'),

  -- Elite
  ('price_1PtZuiKq6gZ6OHL8dRdkjr8G', 'Elite Monthly', 'Elite', 'monthly', 'Elite $69.99/mo'),
  ('price_1PtZvAKq6gZ6OHL8AKsPuIYS', 'Elite Annual', 'Elite', 'annual', 'Elite $699.99/yr'),

  -- VIP
  ('price_1PtZw5Kq6gZ6OHL8SlbrZqOA', 'VIP Monthly', 'VIP', 'monthly', 'VIP $199.99/mo'),
  ('price_1PtZwTKq6gZ6OHL8zRSVLHKi', 'VIP Annual', 'VIP', 'annual', 'VIP $1999.99/yr'),

  -- Premium Processor (Premium Processor Guest uses same Price ID with 90-day trial)
  ('price_1RhZUuKq6gZ6OHL8l77hU8fR', 'Premium Processor Monthly', 'Premium Processor', 'monthly', 'Premium Processor $19.99/mo - Guest version uses same price with 90-day trial'),
  ('price_1RhZUuKq6gZ6OHL8ZZtf3w8g', 'Premium Processor Annual', 'Premium Processor', 'annual', 'Premium Processor $199/yr - Guest version uses same price with 90-day trial'),

  -- Elite Processor
  ('price_1RhZVaKq6gZ6OHL8DcBogOUv', 'Elite Processor Monthly', 'Elite Processor', 'monthly', 'Elite Processor $39.99/mo'),
  ('price_1RhZVyKq6gZ6OHL8e5GtRB3r', 'Elite Processor Annual', 'Elite Processor', 'annual', 'Elite Processor $399/yr'),

  -- VIP Processor
  ('price_1RhZWaKq6gZ6OHL8kdecStbM', 'VIP Processor Monthly', 'VIP Processor', 'monthly', 'VIP Processor $119/mo'),
  ('price_1RhZWtKq6gZ6OHL8C0YVDBR1', 'VIP Processor Annual', 'VIP Processor', 'annual', 'VIP Processor $1199/yr')
ON CONFLICT (stripe_price_id) DO NOTHING;

-- Add comment
COMMENT ON TABLE allowed_stripe_prices IS 'Whitelist of Stripe Price IDs that are allowed to be synced into subscription_plans table';
