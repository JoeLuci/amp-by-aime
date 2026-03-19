-- Add Stripe coupon and promotion code IDs to coupons table
ALTER TABLE coupons
ADD COLUMN IF NOT EXISTS stripe_coupon_id TEXT UNIQUE,
ADD COLUMN IF NOT EXISTS stripe_promotion_code_id TEXT UNIQUE;

-- Add comments
COMMENT ON COLUMN coupons.stripe_coupon_id IS 'Stripe Coupon ID for this discount';
COMMENT ON COLUMN coupons.stripe_promotion_code_id IS 'Stripe Promotion Code ID (the actual code users enter)';
