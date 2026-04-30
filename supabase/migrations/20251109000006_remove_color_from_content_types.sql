-- Remove color from content_types table since types don't need colors
-- Colors belong only to categories for badges/filtering
ALTER TABLE content_types DROP COLUMN IF EXISTS color;
