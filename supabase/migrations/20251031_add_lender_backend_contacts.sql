-- Add backend contact fields (Escalations and Connections) to lenders table

ALTER TABLE public.lenders
ADD COLUMN IF NOT EXISTS escalations_contact_name TEXT DEFAULT NULL,
ADD COLUMN IF NOT EXISTS escalations_contact_email TEXT DEFAULT NULL,
ADD COLUMN IF NOT EXISTS escalations_contact_phone TEXT DEFAULT NULL,
ADD COLUMN IF NOT EXISTS connections_contact_name TEXT DEFAULT NULL,
ADD COLUMN IF NOT EXISTS connections_contact_email TEXT DEFAULT NULL,
ADD COLUMN IF NOT EXISTS connections_contact_phone TEXT DEFAULT NULL;

COMMENT ON COLUMN public.lenders.escalations_contact_name IS 'Backend escalations contact name (not client facing)';
COMMENT ON COLUMN public.lenders.escalations_contact_email IS 'Backend escalations contact email (not client facing)';
COMMENT ON COLUMN public.lenders.escalations_contact_phone IS 'Backend escalations contact phone (not client facing)';
COMMENT ON COLUMN public.lenders.connections_contact_name IS 'Backend connections contact name (not client facing)';
COMMENT ON COLUMN public.lenders.connections_contact_email IS 'Backend connections contact email (not client facing)';
COMMENT ON COLUMN public.lenders.connections_contact_phone IS 'Backend connections contact phone (not client facing)';
