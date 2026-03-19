-- Create storage buckets for migrated images
-- Run this before running the migration script

-- Resources bucket (for resource thumbnails and banners)
INSERT INTO storage.buckets (id, name, public)
VALUES ('resources', 'resources', true)
ON CONFLICT (id) DO NOTHING;

-- Lenders bucket (for lender logos)
INSERT INTO storage.buckets (id, name, public)
VALUES ('lenders', 'lenders', true)
ON CONFLICT (id) DO NOTHING;

-- Vendors bucket (for vendor logos)
INSERT INTO storage.buckets (id, name, public)
VALUES ('vendors', 'vendors', true)
ON CONFLICT (id) DO NOTHING;

-- Events bucket (for event thumbnails)
INSERT INTO storage.buckets (id, name, public)
VALUES ('events', 'events', true)
ON CONFLICT (id) DO NOTHING;

-- Set up storage policies for public access
CREATE POLICY "Public Access for resources" ON storage.objects FOR SELECT USING (bucket_id = 'resources');
CREATE POLICY "Public Access for lenders" ON storage.objects FOR SELECT USING (bucket_id = 'lenders');
CREATE POLICY "Public Access for vendors" ON storage.objects FOR SELECT USING (bucket_id = 'vendors');
CREATE POLICY "Public Access for events" ON storage.objects FOR SELECT USING (bucket_id = 'events');
