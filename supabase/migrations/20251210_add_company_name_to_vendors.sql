-- Add company_name column to vendors table
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS company_name TEXT;

-- Add comment for clarity
COMMENT ON COLUMN vendors.company_name IS 'The company/organization name that owns this vendor product';
