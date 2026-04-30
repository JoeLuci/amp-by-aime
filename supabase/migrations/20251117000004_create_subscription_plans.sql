-- Create subscription_plans table
CREATE TABLE IF NOT EXISTS subscription_plans (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  description TEXT,
  plan_tier plan_tier NOT NULL,
  billing_period TEXT NOT NULL CHECK (billing_period IN ('monthly', 'annual')),

  -- Pricing
  price NUMERIC(10, 2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'usd',

  -- Stripe integration
  stripe_product_id TEXT,
  stripe_price_id TEXT UNIQUE,

  -- Features
  features JSONB DEFAULT '[]'::jsonb,

  -- Status
  is_active BOOLEAN DEFAULT true,
  is_featured BOOLEAN DEFAULT false,

  -- Display order
  sort_order INTEGER DEFAULT 0,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES profiles(id)
);

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_subscription_plans_plan_tier ON subscription_plans(plan_tier);
CREATE INDEX IF NOT EXISTS idx_subscription_plans_stripe_price_id ON subscription_plans(stripe_price_id);
CREATE INDEX IF NOT EXISTS idx_subscription_plans_is_active ON subscription_plans(is_active);

-- Add trigger for updated_at
DROP TRIGGER IF EXISTS update_subscription_plans_updated_at ON subscription_plans;
CREATE TRIGGER update_subscription_plans_updated_at
  BEFORE UPDATE ON subscription_plans
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Insert default subscription plans based on Stripe config
INSERT INTO subscription_plans (name, description, plan_tier, billing_period, price, stripe_product_id, stripe_price_id, features, is_active, is_featured, sort_order) VALUES
  -- Free Trial
  ('Free Trial', '90-day trial period with full access', 'Free', 'monthly', 0.00, NULL, NULL, '["90-day trial period", "Full platform access", "All resources and tools", "Email support"]'::jsonb, true, false, 1),

  -- Premium Plans
  ('Premium Monthly', 'Monthly premium subscription', 'Premium', 'monthly', 19.99, NULL, NULL, '["Access to premium resources", "Monthly webinars", "Email support", "Basic analytics"]'::jsonb, true, false, 2),
  ('Premium Annual', 'Annual premium subscription', 'Premium', 'annual', 199.00, NULL, NULL, '["Access to premium resources", "Monthly webinars", "Email support", "Basic analytics", "Save 17% vs monthly"]'::jsonb, true, true, 3),

  -- Elite Plans
  ('Elite Monthly', 'Monthly elite subscription', 'Elite', 'monthly', 69.99, NULL, NULL, '["All Premium features", "Priority support", "Advanced analytics", "Exclusive networking events", "Marketing templates"]'::jsonb, true, false, 4),
  ('Elite Annual', 'Annual elite subscription', 'Elite', 'annual', 699.00, NULL, NULL, '["All Premium features", "Priority support", "Advanced analytics", "Exclusive networking events", "Marketing templates", "Save 17% vs monthly"]'::jsonb, true, true, 5),

  -- VIP Plans
  ('VIP Monthly', 'Monthly VIP subscription', 'VIP', 'monthly', 199.99, NULL, NULL, '["All Elite features", "1-on-1 coaching sessions", "Custom training programs", "White-glove support", "API access", "Custom integrations"]'::jsonb, true, false, 6),
  ('VIP Annual', 'Annual VIP subscription', 'VIP', 'annual', 1999.00, NULL, NULL, '["All Elite features", "1-on-1 coaching sessions", "Custom training programs", "White-glove support", "API access", "Custom integrations", "Save 17% vs monthly"]'::jsonb, true, true, 7);

-- Enable RLS
ALTER TABLE subscription_plans ENABLE ROW LEVEL SECURITY;

-- RLS Policies for subscription_plans
-- Drop existing policies first
DROP POLICY IF EXISTS "Anyone can view active subscription plans" ON subscription_plans;
DROP POLICY IF EXISTS "Admins can view all subscription plans" ON subscription_plans;
DROP POLICY IF EXISTS "Admins can insert subscription plans" ON subscription_plans;
DROP POLICY IF EXISTS "Admins can update subscription plans" ON subscription_plans;
DROP POLICY IF EXISTS "Admins can delete subscription plans" ON subscription_plans;

-- Anyone can view active plans
CREATE POLICY "Anyone can view active subscription plans"
  ON subscription_plans
  FOR SELECT
  USING (is_active = true);

-- Only admins can view all plans (active and inactive)
CREATE POLICY "Admins can view all subscription plans"
  ON subscription_plans
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_admin = true
    )
  );

-- Only admins can insert plans
CREATE POLICY "Admins can insert subscription plans"
  ON subscription_plans
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_admin = true
    )
  );

-- Only admins can update plans
CREATE POLICY "Admins can update subscription plans"
  ON subscription_plans
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_admin = true
    )
  );

-- Only admins can delete plans
CREATE POLICY "Admins can delete subscription plans"
  ON subscription_plans
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_admin = true
    )
  );

-- Add comment to table
COMMENT ON TABLE subscription_plans IS 'Subscription plans available for users to purchase';
COMMENT ON COLUMN subscription_plans.features IS 'JSON array of feature descriptions for this plan';
COMMENT ON COLUMN subscription_plans.stripe_price_id IS 'Stripe Price ID for this plan';
