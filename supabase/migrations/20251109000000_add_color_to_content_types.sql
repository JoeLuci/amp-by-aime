-- Add color column back to content_types for vendor/lender tier badge colors
-- Note: Resources and Events types don't use colors (just format identifiers)
-- But Market and Lender types DO need colors for tier badges

ALTER TABLE content_types ADD COLUMN IF NOT EXISTS color text;

-- Set default colors for market types (vendor partnership tiers)
UPDATE content_types SET color = '#9333ea' WHERE slug = 'core-vendor-partner' AND content_area = 'market'; -- Purple
UPDATE content_types SET color = '#3b82f6' WHERE slug = 'vendor-members-partners' AND content_area = 'market'; -- Blue
UPDATE content_types SET color = '#10b981' WHERE slug = 'affiliates' AND content_area = 'market'; -- Green

-- Set default colors for lender types (lender tiers)
UPDATE content_types SET color = '#8b5cf6' WHERE slug = 'platinum' AND content_area = 'lenders'; -- Purple/Violet
UPDATE content_types SET color = '#eab308' WHERE slug = 'gold' AND content_area = 'lenders'; -- Gold/Yellow
UPDATE content_types SET color = '#94a3b8' WHERE slug = 'silver' AND content_area = 'lenders'; -- Silver/Gray
UPDATE content_types SET color = '#cd7f32' WHERE slug = 'bronze' AND content_area = 'lenders'; -- Bronze/Brown
UPDATE content_types SET color = '#06b6d4' WHERE slug = 'fuse-flex' AND content_area = 'lenders'; -- Cyan

COMMENT ON COLUMN content_types.color IS 'Color for type badges (used by market vendor tiers and lender tiers, not used by resources/events)';
