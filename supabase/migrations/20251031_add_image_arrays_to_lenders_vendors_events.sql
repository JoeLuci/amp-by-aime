-- Add image array fields to lenders, vendors, and events tables for multi-image support

-- Lenders: Add images array
ALTER TABLE public.lenders
ADD COLUMN IF NOT EXISTS images TEXT[] DEFAULT NULL;

COMMENT ON COLUMN public.lenders.images IS 'Array of image URLs for lender carousel. If multiple images exist, display as carousel.';

-- Vendors: Add images array
ALTER TABLE public.vendors
ADD COLUMN IF NOT EXISTS images TEXT[] DEFAULT NULL;

COMMENT ON COLUMN public.vendors.images IS 'Array of image URLs for vendor carousel. If multiple images exist, display as carousel.';

-- Events: Add images array
ALTER TABLE public.events
ADD COLUMN IF NOT EXISTS images TEXT[] DEFAULT NULL;

COMMENT ON COLUMN public.events.images IS 'Array of image URLs for event carousel. If multiple images exist, display as carousel.';
