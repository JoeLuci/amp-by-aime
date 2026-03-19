-- Update allowed_stripe_prices with test mode Price IDs for development
-- When you get live keys, you can run the original migration again

-- Clear existing live Price IDs
DELETE FROM allowed_stripe_prices;

-- Insert test mode Price IDs
-- Note: You'll need to create these products in Stripe test mode first
INSERT INTO allowed_stripe_prices (stripe_price_id, plan_name, plan_tier, billing_period, notes) VALUES
  -- Premium (using test Price IDs from .env.local)
  ('price_1SNu95Kq6gZ6OHL8NGZLJ0TA', 'Premium Monthly', 'Premium', 'monthly', 'Test mode - Premium $19.99/mo'),
  ('price_1SNu9MKq6gZ6OHL8QNLtf2Fo', 'Premium Annual', 'Premium', 'annual', 'Test mode - Premium $199/yr'),

  -- Elite
  ('price_1SNuEbKq6gZ6OHL8MHogkRMl', 'Elite Monthly', 'Elite', 'monthly', 'Test mode - Elite $69.99/mo'),
  ('price_1SNuEnKq6gZ6OHL8KPynfn0H', 'Elite Annual', 'Elite', 'annual', 'Test mode - Elite $699/yr'),

  -- VIP
  ('price_1SNuFfKq6gZ6OHL8ptfMlCjz', 'VIP Monthly', 'VIP', 'monthly', 'Test mode - VIP $199.99/mo'),
  ('price_1SNuFsKq6gZ6OHL88UN9LHu5', 'VIP Annual', 'VIP', 'annual', 'Test mode - VIP $1999/yr')
ON CONFLICT (stripe_price_id) DO UPDATE SET
  plan_name = EXCLUDED.plan_name,
  plan_tier = EXCLUDED.plan_tier,
  billing_period = EXCLUDED.billing_period,
  notes = EXCLUDED.notes;

COMMENT ON TABLE allowed_stripe_prices IS 'Currently contains TEST mode Price IDs. Switch to live Price IDs when deploying to production.';
