-- Add type_id to vendors and lenders tables for dynamic types
-- Market Types (Vendors): Core Vendor Partner, Vendor Members & Partners, Affiliates
-- Lender Types: Platinum, Gold, Silver, Bronze, Fuse Flex

-- Add type_id column to vendors
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS type_id uuid REFERENCES content_types(id);

-- Add type_id column to lenders
ALTER TABLE lenders ADD COLUMN IF NOT EXISTS type_id uuid REFERENCES content_types(id);

-- Create market content types (vendor partnership types)
INSERT INTO content_types (name, slug, content_area, is_active, created_at, updated_at)
VALUES
  ('Core Vendor Partner', 'core-vendor-partner', 'market', true, now(), now()),
  ('Vendor Members & Partners', 'vendor-members-partners', 'market', true, now(), now()),
  ('Affiliates', 'affiliates', 'market', true, now(), now())
ON CONFLICT DO NOTHING;

-- Create lender content types (lender tiers)
INSERT INTO content_types (name, slug, content_area, is_active, created_at, updated_at)
VALUES
  ('Platinum', 'platinum', 'lenders', true, now(), now()),
  ('Gold', 'gold', 'lenders', true, now(), now()),
  ('Silver', 'silver', 'lenders', true, now(), now()),
  ('Bronze', 'bronze', 'lenders', true, now(), now()),
  ('Fuse Flex', 'fuse-flex', 'lenders', true, now(), now())
ON CONFLICT DO NOTHING;

-- Migrate existing vendors to use type_id based on their current flags
-- Core partners -> Core Vendor Partner
UPDATE vendors
SET type_id = (SELECT id FROM content_types WHERE slug = 'core-vendor-partner' AND content_area = 'market')
WHERE is_core_partner = true;

-- Affiliates -> Affiliates
UPDATE vendors
SET type_id = (SELECT id FROM content_types WHERE slug = 'affiliates' AND content_area = 'market')
WHERE is_affiliate = true AND is_core_partner = false;

-- Regular partners -> Vendor Members & Partners (default for those without flags)
UPDATE vendors
SET type_id = (SELECT id FROM content_types WHERE slug = 'vendor-members-partners' AND content_area = 'market')
WHERE is_core_partner = false AND is_affiliate = false;

-- Add comments
COMMENT ON COLUMN vendors.type_id IS 'Vendor partnership type from content_types (Core Vendor Partner, Vendor Members & Partners, Affiliates)';
COMMENT ON COLUMN lenders.type_id IS 'Lender tier from content_types (Platinum, Gold, Silver, Bronze, Fuse Flex)';
