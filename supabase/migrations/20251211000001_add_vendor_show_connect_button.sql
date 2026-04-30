-- Add show_connect_button column to vendors table
-- Defaults to TRUE so existing vendors keep their connect button

ALTER TABLE vendors
ADD COLUMN IF NOT EXISTS show_connect_button BOOLEAN DEFAULT TRUE;

COMMENT ON COLUMN vendors.show_connect_button IS 'Whether to show the Connect button on the vendor detail page';
