-- Consolidate video_url into file_url and remove video_url column
-- This migration combines the redundant video_url and file_url fields into a single file_url field

-- First, copy video_url to file_url where file_url is null
UPDATE resources
SET file_url = video_url
WHERE video_url IS NOT NULL AND file_url IS NULL;

-- Drop the video_url column as it's no longer needed
ALTER TABLE resources DROP COLUMN IF EXISTS video_url;
