-- Migration: Add Dynamic Types and Categories System
-- Date: 2025-11-09
-- Purpose: Create unified category and dynamic type management system
-- Safety: All changes are additive (no data loss), keeps existing fields as backup

-- =====================================================
-- PART 1: CREATE NEW TABLES
-- =====================================================

-- Create content_types table for dynamic type management
CREATE TABLE IF NOT EXISTS content_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  content_area TEXT NOT NULL CHECK (content_area IN ('resources', 'market', 'lenders', 'events')),
  color TEXT DEFAULT '#6b7280',
  icon TEXT,
  display_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(slug, content_area)
);

-- Add index for performance
CREATE INDEX IF NOT EXISTS idx_content_types_area ON content_types(content_area, is_active);
CREATE INDEX IF NOT EXISTS idx_content_types_slug ON content_types(slug);

-- =====================================================
-- PART 2: ENHANCE EXISTING CATEGORIES TABLE
-- =====================================================

-- Add content_area field to categories table (default to 'resources' for existing data)
ALTER TABLE categories
ADD COLUMN IF NOT EXISTS content_area TEXT DEFAULT 'resources' CHECK (content_area IN ('resources', 'market', 'lenders', 'events'));

-- Add color field to categories if it doesn't exist (for consistency with vendor_categories)
ALTER TABLE categories
ADD COLUMN IF NOT EXISTS color TEXT;

-- Update existing categories to explicitly set content_area
UPDATE categories SET content_area = 'resources' WHERE content_area IS NULL;

-- Drop the old unique constraint on slug (global)
ALTER TABLE categories DROP CONSTRAINT IF EXISTS categories_slug_key;

-- Create new composite unique constraint on (slug, content_area)
ALTER TABLE categories ADD CONSTRAINT categories_slug_content_area_key UNIQUE (slug, content_area);

-- Add index for filtering by content_area
CREATE INDEX IF NOT EXISTS idx_categories_content_area ON categories(content_area, is_active);

-- =====================================================
-- PART 3: MIGRATE VENDOR_CATEGORIES TO CATEGORIES
-- =====================================================

-- Insert vendor_categories into categories table with content_area='market'
INSERT INTO categories (id, name, slug, content_area, color, display_order, created_at, updated_at, is_active)
SELECT
  id,
  name,
  LOWER(REPLACE(REPLACE(name, ' + ', '-'), ' ', '-')) as slug,
  'market' as content_area,
  color,
  display_order,
  created_at,
  updated_at,
  true as is_active
FROM vendor_categories
ON CONFLICT (slug, content_area) DO UPDATE SET
  color = EXCLUDED.color,
  display_order = EXCLUDED.display_order;

-- =====================================================
-- PART 4: ADD FOREIGN KEYS TO EXISTING TABLES (NULLABLE)
-- =====================================================

-- Add type_id to resources (nullable, keeps resource_type enum as backup)
ALTER TABLE resources
ADD COLUMN IF NOT EXISTS type_id UUID REFERENCES content_types(id) ON DELETE SET NULL;

-- Add type_id to events (nullable, keeps event_type enum as backup)
ALTER TABLE events
ADD COLUMN IF NOT EXISTS type_id UUID REFERENCES content_types(id) ON DELETE SET NULL;

-- Add category_id to lenders (nullable, keeps lender_type text as backup)
ALTER TABLE lenders
ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES categories(id) ON DELETE SET NULL;

-- Note: vendors already has vendor_category_id, we'll migrate that to category_id
-- First add the new column
ALTER TABLE vendors
ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES categories(id) ON DELETE SET NULL;

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_resources_type_id ON resources(type_id);
CREATE INDEX IF NOT EXISTS idx_events_type_id ON events(type_id);
CREATE INDEX IF NOT EXISTS idx_vendors_category_id ON vendors(category_id);
CREATE INDEX IF NOT EXISTS idx_lenders_category_id ON lenders(category_id);

-- =====================================================
-- PART 5: SEED CONTENT_TYPES TABLE
-- =====================================================

-- Resources Types (matching existing data: video, podcast, article + new ones)
INSERT INTO content_types (name, slug, content_area, color, display_order) VALUES
('Video', 'video', 'resources', '#ef4444', 1),
('Podcast', 'podcast', 'resources', '#8b5cf6', 2),
('Article', 'article', 'resources', '#10b981', 3),
('Webinar', 'webinar', 'resources', '#3b82f6', 4),
('Blog', 'blog', 'resources', '#f59e0b', 5),
('Document', 'document', 'resources', '#ec4899', 6),
('PDF', 'pdf', 'resources', '#f97316', 7),
('Infographic', 'infographic', 'resources', '#06b6d4', 8)
ON CONFLICT (slug, content_area) DO NOTHING;

-- Events Types
INSERT INTO content_types (name, slug, content_area, color, display_order) VALUES
('Webinar', 'webinar', 'events', '#3b82f6', 1),
('Conference', 'conference', 'events', '#8b5cf6', 2),
('Training', 'training', 'events', '#10b981', 3),
('Networking', 'networking', 'events', '#f59e0b', 4),
('FUSE', 'fuse', 'events', '#ef4444', 5),
('Other', 'other', 'events', '#6b7280', 99)
ON CONFLICT (slug, content_area) DO NOTHING;

-- =====================================================
-- PART 6: SEED LENDER TIER CATEGORIES
-- =====================================================

-- Lender Tiers/Categories (matching existing data)
INSERT INTO categories (name, slug, content_area, icon, display_order, is_active, description, color) VALUES
('Title/Platinum', 'title-platinum', 'lenders', NULL, 1, true, 'Platinum tier lenders', '#9333ea'),
('Gold', 'gold', 'lenders', NULL, 2, true, 'Gold tier lenders', '#eab308'),
('Silver', 'silver', 'lenders', NULL, 3, true, 'Silver tier lenders', '#94a3b8'),
('Bronze', 'bronze', 'lenders', NULL, 4, true, 'Bronze tier lenders', '#d97706'),
('Fuse Flex', 'fuse-flex', 'lenders', NULL, 5, true, 'Fuse Flex tier lenders', '#06b6d4')
ON CONFLICT (slug, content_area) DO NOTHING;

-- =====================================================
-- PART 7: BACKFILL FOREIGN KEYS
-- =====================================================

-- Map resources.resource_type to content_types.type_id
UPDATE resources r
SET type_id = ct.id
FROM content_types ct
WHERE ct.content_area = 'resources'
  AND r.resource_type::text = ct.slug
  AND r.type_id IS NULL;

-- Map events.event_type to content_types.type_id
UPDATE events e
SET type_id = ct.id
FROM content_types ct
WHERE ct.content_area = 'events'
  AND e.event_type::text = ct.slug
  AND e.type_id IS NULL;

-- Migrate vendors.vendor_category_id to vendors.category_id
-- This copies the FK reference from the old vendor_categories table to the new unified categories
UPDATE vendors
SET category_id = vendor_category_id
WHERE vendor_category_id IS NOT NULL
  AND category_id IS NULL;

-- Also update any vendors using the text vendor_category field
UPDATE vendors v
SET category_id = c.id
FROM categories c
WHERE c.content_area = 'market'
  AND v.vendor_category IS NOT NULL
  AND LOWER(v.vendor_category) = LOWER(c.name)
  AND v.category_id IS NULL;

-- Map lenders.lender_type to categories.category_id
UPDATE lenders l
SET category_id = c.id
FROM categories c
WHERE c.content_area = 'lenders'
  AND l.lender_type IS NOT NULL
  AND LOWER(l.lender_type) = LOWER(c.name)
  AND l.category_id IS NULL;

-- =====================================================
-- PART 8: CREATE RLS POLICIES
-- =====================================================

-- Enable RLS on content_types
ALTER TABLE content_types ENABLE ROW LEVEL SECURITY;

-- Public can view active content types
CREATE POLICY "Public can view active content types"
  ON content_types FOR SELECT
  USING (is_active = true);

-- Admins can manage content types
CREATE POLICY "Admins can manage content types"
  ON content_types FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_admin = true
    )
  );

-- =====================================================
-- PART 9: ADD UPDATE TRIGGER
-- =====================================================

-- Add updated_at trigger for content_types
CREATE OR REPLACE FUNCTION update_content_types_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_content_types_timestamp
  BEFORE UPDATE ON content_types
  FOR EACH ROW
  EXECUTE FUNCTION update_content_types_updated_at();

-- =====================================================
-- VERIFICATION QUERIES
-- =====================================================

-- Run these after migration to verify data integrity:
/*
-- Check resources type mapping
SELECT
  resource_type::text as old_type,
  ct.name as new_type,
  COUNT(*) as count
FROM resources r
LEFT JOIN content_types ct ON r.type_id = ct.id
GROUP BY resource_type, ct.name
ORDER BY count DESC;

-- Check events type mapping
SELECT
  event_type::text as old_type,
  ct.name as new_type,
  COUNT(*) as count
FROM events e
LEFT JOIN content_types ct ON e.type_id = ct.id
GROUP BY event_type, ct.name;

-- Check vendors category mapping
SELECT
  v.vendor_category as old_category,
  c.name as new_category,
  c.content_area,
  COUNT(*) as count
FROM vendors v
LEFT JOIN categories c ON v.category_id = c.id
GROUP BY v.vendor_category, c.name, c.content_area;

-- Check lenders tier mapping
SELECT
  lender_type as old_tier,
  c.name as new_tier,
  COUNT(*) as count
FROM lenders l
LEFT JOIN categories c ON l.category_id = c.id
WHERE c.content_area = 'lenders' OR c.content_area IS NULL
GROUP BY lender_type, c.name;

-- Verify no duplicate slugs within same content_area
SELECT slug, content_area, COUNT(*)
FROM categories
GROUP BY slug, content_area
HAVING COUNT(*) > 1;
*/

-- =====================================================
-- ROLLBACK SCRIPT (IF NEEDED)
-- =====================================================

/*
-- To rollback this migration:

-- Remove foreign keys from tables
ALTER TABLE resources DROP COLUMN IF EXISTS type_id;
ALTER TABLE events DROP COLUMN IF EXISTS type_id;
ALTER TABLE vendors DROP COLUMN IF EXISTS category_id;
ALTER TABLE lenders DROP COLUMN IF EXISTS category_id;

-- Remove additions to categories
ALTER TABLE categories DROP COLUMN IF EXISTS content_area;
ALTER TABLE categories DROP COLUMN IF EXISTS color;

-- Restore original unique constraint on slug
ALTER TABLE categories DROP CONSTRAINT IF EXISTS categories_slug_content_area_key;
ALTER TABLE categories ADD CONSTRAINT categories_slug_key UNIQUE (slug);

-- Remove migrated vendor_categories from categories table
DELETE FROM categories WHERE content_area = 'market';
DELETE FROM categories WHERE content_area = 'lenders';

-- Drop content_types table
DROP TABLE IF EXISTS content_types CASCADE;

-- Drop indexes
DROP INDEX IF EXISTS idx_resources_type_id;
DROP INDEX IF EXISTS idx_events_type_id;
DROP INDEX IF EXISTS idx_vendors_category_id;
DROP INDEX IF EXISTS idx_lenders_category_id;
DROP INDEX IF EXISTS idx_categories_content_area;
DROP INDEX IF EXISTS idx_content_types_area;
DROP INDEX IF EXISTS idx_content_types_slug;
*/
