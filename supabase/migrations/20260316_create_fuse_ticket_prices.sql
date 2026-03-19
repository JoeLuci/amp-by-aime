-- Fuse ticket pricing table
-- Supports per-event, per-tier, per-phase pricing with Stripe price IDs
CREATE TABLE fuse_ticket_prices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fuse_event_id UUID NOT NULL REFERENCES fuse_events(id) ON DELETE CASCADE,
  product_key TEXT NOT NULL,            -- 'ga', 'vip', 'vip_guest', 'hoa', 'wmn'
  label TEXT NOT NULL,                  -- Display name
  description TEXT,
  tier TEXT,                            -- NULL = public, 'Premium', 'Elite', 'VIP'
  pricing_phase TEXT DEFAULT 'regular', -- 'early_bird', 'regular'
  price INTEGER NOT NULL DEFAULT 0,     -- Price in whole dollars
  stripe_price_id TEXT,                 -- Stripe price ID for checkout
  is_addon BOOLEAN NOT NULL DEFAULT FALSE,
  is_included BOOLEAN NOT NULL DEFAULT FALSE, -- TRUE = free/included with this tier
  gender_lock TEXT,                     -- 'female' for WMN, NULL otherwise
  phase_start_at TIMESTAMPTZ,           -- When this price becomes active (early bird start)
  phase_end_at TIMESTAMPTZ,             -- When this price expires (early bird end)
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for fast lookups by event + product
CREATE INDEX idx_fuse_ticket_prices_event ON fuse_ticket_prices(fuse_event_id, product_key, tier, is_active);

-- Seed pricing for Fuse 2026 (event id: fdf0c8ea-e8b4-4734-b28e-f9c99e8834ff)
INSERT INTO fuse_ticket_prices (fuse_event_id, product_key, label, description, tier, pricing_phase, price, is_addon, is_included, gender_lock, sort_order)
VALUES
  -- GA — Public Early Bird
  ('fdf0c8ea-e8b4-4734-b28e-f9c99e8834ff', 'ga', 'General Admission', 'Full access to all Fuse 2026 sessions & networking events', NULL, 'early_bird', 699, FALSE, FALSE, NULL, 1),
  -- GA — Public Regular
  ('fdf0c8ea-e8b4-4734-b28e-f9c99e8834ff', 'ga', 'General Admission', 'Full access to all Fuse 2026 sessions & networking events', NULL, 'regular', 899, FALSE, FALSE, NULL, 1),
  -- GA — Premium (included)
  ('fdf0c8ea-e8b4-4734-b28e-f9c99e8834ff', 'ga', 'General Admission', 'Included with your Premium membership', 'Premium', 'regular', 0, FALSE, TRUE, NULL, 1),
  -- GA — Elite (included)
  ('fdf0c8ea-e8b4-4734-b28e-f9c99e8834ff', 'ga', 'General Admission', 'Included with your Elite membership', 'Elite', 'regular', 0, FALSE, TRUE, NULL, 1),

  -- VIP — VIP Members (included)
  ('fdf0c8ea-e8b4-4734-b28e-f9c99e8834ff', 'vip', 'VIP', 'VIP experience at Fuse 2026', 'VIP', 'regular', 0, FALSE, TRUE, NULL, 0),
  -- VIP Guest — VIP Members (included)
  ('fdf0c8ea-e8b4-4734-b28e-f9c99e8834ff', 'vip_guest', 'VIP Guest', 'Included VIP guest ticket', 'VIP', 'regular', 0, FALSE, TRUE, NULL, 2),

  -- HOA — Public
  ('fdf0c8ea-e8b4-4734-b28e-f9c99e8834ff', 'hoa', 'Hall of AIME', 'An exclusive recognition ceremony celebrating the best in the broker channel', NULL, 'regular', 349, TRUE, FALSE, NULL, 3),
  -- HOA — Premium
  ('fdf0c8ea-e8b4-4734-b28e-f9c99e8834ff', 'hoa', 'Hall of AIME', 'An exclusive recognition ceremony celebrating the best in the broker channel', 'Premium', 'regular', 199, TRUE, FALSE, NULL, 3),
  -- HOA — Elite
  ('fdf0c8ea-e8b4-4734-b28e-f9c99e8834ff', 'hoa', 'Hall of AIME', 'An exclusive recognition ceremony celebrating the best in the broker channel', 'Elite', 'regular', 199, TRUE, FALSE, NULL, 3),
  -- HOA — VIP (included)
  ('fdf0c8ea-e8b4-4734-b28e-f9c99e8834ff', 'hoa', 'Hall of AIME', 'Included with your VIP membership', 'VIP', 'regular', 0, TRUE, TRUE, NULL, 3),

  -- WMN — All (free, women only)
  ('fdf0c8ea-e8b4-4734-b28e-f9c99e8834ff', 'wmn', 'WMN at Fuse', 'Women''s Mortgage Network exclusive gathering — open to women attendees only', NULL, 'regular', 0, TRUE, FALSE, 'female', 4);
