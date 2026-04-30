-- Add location field to fuse_events for banner display
ALTER TABLE fuse_events
ADD COLUMN IF NOT EXISTS location TEXT;

-- Update Fuse 2026 with location
UPDATE fuse_events
SET location = 'Austin, TX'
WHERE year = 2026;
