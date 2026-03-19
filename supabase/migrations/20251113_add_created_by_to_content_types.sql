-- Add created_by field to content_types table to track who created each type

ALTER TABLE public.content_types
ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.content_types.created_by IS 'Admin user who created this content type';

-- Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_content_types_created_by ON public.content_types(created_by);
