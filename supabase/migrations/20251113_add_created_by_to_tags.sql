-- Add created_by field to tags table to track who created each tag

ALTER TABLE public.tags
ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.tags.created_by IS 'Admin user who created this tag';

-- Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_tags_created_by ON public.tags(created_by);
