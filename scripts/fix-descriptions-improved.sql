-- Improved BBCode to HTML Converter for Resource Descriptions
-- This handles Bubble's BBCode format and converts to clean HTML

-- Create a temporary function to process descriptions
CREATE OR REPLACE FUNCTION clean_description(input_text TEXT)
RETURNS TEXT AS $$
DECLARE
  output_text TEXT;
BEGIN
  output_text := input_text;

  -- Step 1: Convert [url=...] tags to HTML links
  -- [url=https://example.com]#HashTag[/url] → <a href="https://example.com" class="text-blue-600 hover:underline">#HashTag</a>
  output_text := regexp_replace(
    output_text,
    '\[url=([^\]]+)\]([^\[]+)\[/url\]',
    '<a href="\1" target="_blank" rel="noopener noreferrer" class="text-blue-600 hover:underline">\2</a>',
    'g'
  );

  -- Step 2: Remove all [color=...] opening tags
  output_text := regexp_replace(output_text, '\[color=[^\]]+\]', '', 'g');

  -- Step 3: Remove all [/color] closing tags
  output_text := regexp_replace(output_text, '\[/color\]', '', 'g');

  -- Step 4: Remove special characters like ﻿ (zero-width no-break space)
  output_text := regexp_replace(output_text, '[\uFEFF]', '', 'g');

  -- Step 5: Clean up extra whitespace but preserve paragraph breaks
  -- Replace multiple spaces with single space
  output_text := regexp_replace(output_text, ' {2,}', ' ', 'g');

  -- Step 6: Trim leading/trailing whitespace
  output_text := trim(output_text);

  -- Step 7: Split into paragraphs and wrap in <p> tags
  -- This assumes paragraphs are separated by the pattern of closing/opening tags
  output_text := regexp_replace(
    output_text,
    '([.!?])\s+([A-Z🔔🎧])',
    E'\\1</p><p class="mb-4">\\2',
    'g'
  );

  -- Step 8: Wrap in opening and closing <p> tag
  IF output_text != '' THEN
    output_text := '<p class="mb-4">' || output_text || '</p>';
  END IF;

  RETURN output_text;
END;
$$ LANGUAGE plpgsql;

-- Apply the function to all resource descriptions
UPDATE resources
SET description = clean_description(description)
WHERE description IS NOT NULL
  AND description != ''
  AND (description LIKE '%[color=%' OR description LIKE '%[url=%' OR description LIKE '%[/color]%');

-- Drop the temporary function
DROP FUNCTION clean_description(TEXT);

-- Show sample of cleaned descriptions
SELECT
  id,
  title,
  substring(description, 1, 200) || '...' as cleaned_preview
FROM resources
WHERE description IS NOT NULL
LIMIT 10;
