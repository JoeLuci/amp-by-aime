-- Add created_by field to lenders and vendors tables to track who created them

-- Lenders: Add created_by
ALTER TABLE public.lenders
ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES public.profiles(id);

COMMENT ON COLUMN public.lenders.created_by IS 'Admin user who created this lender';

-- Vendors: Add created_by
ALTER TABLE public.vendors
ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES public.profiles(id);

COMMENT ON COLUMN public.vendors.created_by IS 'Admin user who created this vendor';
