-- Add content_images field to resources table for carousel display

ALTER TABLE public.resources
ADD COLUMN IF NOT EXISTS content_images TEXT[] DEFAULT NULL;

COMMENT ON COLUMN public.resources.content_images IS 'Array of image URLs for content carousel display. Used for Document, Blog, and Webinar resource types.';
