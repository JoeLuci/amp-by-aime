-- Add display_order column to resources table for manual ordering
ALTER TABLE resources ADD COLUMN IF NOT EXISTS display_order INTEGER DEFAULT 0;

-- Create index for efficient ordering
CREATE INDEX IF NOT EXISTS idx_resources_display_order ON resources(display_order);

-- Set initial display_order based on created_at (most recent = lowest number = top)
WITH ordered AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY created_at DESC) as rn
  FROM resources
)
UPDATE resources
SET display_order = ordered.rn
FROM ordered
WHERE resources.id = ordered.id;

COMMENT ON COLUMN resources.display_order IS 'Manual display order - lower numbers appear first';
