-- Migrate existing lenders to use type_id based on their lender_type text field
-- This maps the old lender_type values to the new type_id foreign keys

-- Map Platinum
UPDATE lenders
SET type_id = (SELECT id FROM content_types WHERE slug = 'platinum' AND content_area = 'lenders')
WHERE LOWER(lender_type) = 'platinum' AND type_id IS NULL;

-- Map Gold
UPDATE lenders
SET type_id = (SELECT id FROM content_types WHERE slug = 'gold' AND content_area = 'lenders')
WHERE LOWER(lender_type) = 'gold' AND type_id IS NULL;

-- Map Silver
UPDATE lenders
SET type_id = (SELECT id FROM content_types WHERE slug = 'silver' AND content_area = 'lenders')
WHERE LOWER(lender_type) = 'silver' AND type_id IS NULL;

-- Map Bronze
UPDATE lenders
SET type_id = (SELECT id FROM content_types WHERE slug = 'bronze' AND content_area = 'lenders')
WHERE LOWER(lender_type) = 'bronze' AND type_id IS NULL;

-- Map Fuse Flex
UPDATE lenders
SET type_id = (SELECT id FROM content_types WHERE slug = 'fuse-flex' AND content_area = 'lenders')
WHERE LOWER(lender_type) IN ('fuse flex', 'fuse-flex', 'fuseflex') AND type_id IS NULL;

-- For any lenders without a recognized lender_type, set to Silver as default
UPDATE lenders
SET type_id = (SELECT id FROM content_types WHERE slug = 'silver' AND content_area = 'lenders')
WHERE type_id IS NULL;
