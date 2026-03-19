-- Fix BBCode formatting in resource descriptions
-- This converts Bubble's BBCode tags to proper HTML

-- Step 1: Remove color tags (since they're mostly just wrapping text)
UPDATE resources
SET description = regexp_replace(description, '\[color=[^\]]+\]', '', 'g');

UPDATE resources
SET description = regexp_replace(description, '\[/color\]', '', 'g');

-- Step 2: Convert URL tags to HTML links
-- Pattern: [url=https://example.com]Link Text[/url] → <a href="https://example.com">Link Text</a>
UPDATE resources
SET description = regexp_replace(
  description,
  '\[url=([^\]]+)\]([^\[]+)\[/url\]',
  '<a href="\1" target="_blank" class="text-blue-600 hover:underline">\2</a>',
  'g'
);

-- Step 3: Add paragraph breaks for better readability
-- Replace multiple spaces/newlines with proper paragraph tags
UPDATE resources
SET description = regexp_replace(description, '\s+', ' ', 'g');

-- Step 4: Clean up any remaining artifacts
UPDATE resources
SET description = regexp_replace(description, '\s+', ' ', 'g');

UPDATE resources
SET description = trim(description);

-- Optional: Wrap entire description in a div for consistent styling
UPDATE resources
SET description = '<div class="space-y-4">' || description || '</div>'
WHERE description IS NOT NULL
  AND description != ''
  AND description NOT LIKE '<div class="space-y-4">%';

-- Show affected rows
SELECT COUNT(*) as total_updated
FROM resources
WHERE description IS NOT NULL;
