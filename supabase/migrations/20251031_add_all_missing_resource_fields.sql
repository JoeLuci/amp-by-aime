-- Add all missing fields to resources table based on ResourcesManager component

-- Add sub_title field
ALTER TABLE public.resources
ADD COLUMN IF NOT EXISTS sub_title TEXT DEFAULT NULL;

-- Add key_points field (already created but including for completeness)
ALTER TABLE public.resources
ADD COLUMN IF NOT EXISTS key_points TEXT[] DEFAULT NULL;

-- Add comments
COMMENT ON COLUMN public.resources.sub_title IS 'Subtitle or tagline for the resource';
COMMENT ON COLUMN public.resources.key_points IS 'Array of key points/bullet points for the resource content';
