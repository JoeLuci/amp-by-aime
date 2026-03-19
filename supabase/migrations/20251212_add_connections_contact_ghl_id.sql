-- Add GHL contact ID field for tracking the connection contact source
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS connections_contact_ghl_id TEXT;

-- Add index for lookups
CREATE INDEX IF NOT EXISTS idx_profiles_connections_contact_ghl_id
ON profiles(connections_contact_ghl_id)
WHERE connections_contact_ghl_id IS NOT NULL;

-- Add comment
COMMENT ON COLUMN profiles.connections_contact_ghl_id IS 'GHL contact ID of the connections contact (synced via webhook)';
