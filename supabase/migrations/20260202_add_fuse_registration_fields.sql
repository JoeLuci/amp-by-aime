-- Add additional fields to fuse_registrations for the full form
ALTER TABLE fuse_registrations
ADD COLUMN IF NOT EXISTS first_name TEXT,
ADD COLUMN IF NOT EXISTS last_name TEXT,
ADD COLUMN IF NOT EXISTS preferred_name TEXT,
ADD COLUMN IF NOT EXISTS gender TEXT,
ADD COLUMN IF NOT EXISTS fuse_attendance TEXT,
ADD COLUMN IF NOT EXISTS marketing_consent BOOLEAN DEFAULT false;

-- Backfill first_name/last_name from full_name for existing records
UPDATE fuse_registrations
SET
  first_name = split_part(full_name, ' ', 1),
  last_name = substring(full_name from position(' ' in full_name) + 1)
WHERE first_name IS NULL AND full_name IS NOT NULL;
