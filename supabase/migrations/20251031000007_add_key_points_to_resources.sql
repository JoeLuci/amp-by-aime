-- Add key_points field to resources table for bullet point list

ALTER TABLE public.resources
ADD COLUMN IF NOT EXISTS key_points TEXT[] DEFAULT NULL;

COMMENT ON COLUMN public.resources.key_points IS 'Array of key points/bullet points for the resource content';
