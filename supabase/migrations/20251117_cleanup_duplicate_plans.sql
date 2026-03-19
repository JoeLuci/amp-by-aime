-- Clean up duplicate subscription plans
-- Keep plans with stripe_price_id, delete ones without

-- Delete plans that don't have a stripe_price_id (the old placeholder ones)
DELETE FROM subscription_plans
WHERE stripe_price_id IS NULL;

-- Note: This will keep the synced plans from Stripe that have valid stripe_price_id values
COMMENT ON TABLE subscription_plans IS 'Cleaned up - contains only plans synced from Stripe with valid Price IDs';
