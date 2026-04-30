-- Fix storage bucket RLS policies to allow admin uploads

-- Drop existing policies
DROP POLICY IF EXISTS "Admins can upload to resources bucket" ON storage.objects;
DROP POLICY IF EXISTS "Admins can read from resources bucket" ON storage.objects;
DROP POLICY IF EXISTS "Admins can update resources bucket" ON storage.objects;
DROP POLICY IF EXISTS "Admins can delete from resources bucket" ON storage.objects;
DROP POLICY IF EXISTS "Public can read resources" ON storage.objects;

-- Allow admins to upload files (INSERT)
CREATE POLICY "Admins can upload to resources bucket"
ON storage.objects FOR INSERT TO public
WITH CHECK (
  bucket_id = 'resources'
  AND public.is_admin(auth.uid())
);

-- Allow admins to read files (SELECT)
CREATE POLICY "Admins can read from resources bucket"
ON storage.objects FOR SELECT TO public
USING (
  bucket_id = 'resources'
  AND public.is_admin(auth.uid())
);

-- Allow admins to update files (UPDATE)
CREATE POLICY "Admins can update resources bucket"
ON storage.objects FOR UPDATE TO public
USING (
  bucket_id = 'resources'
  AND public.is_admin(auth.uid())
);

-- Allow admins to delete files (DELETE)
CREATE POLICY "Admins can delete from resources bucket"
ON storage.objects FOR DELETE TO public
USING (
  bucket_id = 'resources'
  AND public.is_admin(auth.uid())
);

-- Allow public read access for published resources
CREATE POLICY "Public can read resources"
ON storage.objects FOR SELECT TO public
USING (bucket_id = 'resources');
