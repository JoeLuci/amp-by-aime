-- Add created_by field to categories table to track who created each category

ALTER TABLE public.categories
ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.categories.created_by IS 'Admin user who created this category';

-- Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_categories_created_by ON public.categories(created_by);
