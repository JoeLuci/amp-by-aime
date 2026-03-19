-- Create storage buckets
INSERT INTO storage.buckets (id, name, public)
VALUES
  ('avatars', 'avatars', true),
  ('resources', 'resources', false),
  ('videos', 'videos', true),
  ('pdfs', 'pdfs', false),
  ('podcasts', 'podcasts', false),
  ('thumbnails', 'thumbnails', true),
  ('lender-logos', 'lender-logos', true),
  ('vendor-logos', 'vendor-logos', true);

-- Storage policies for avatars bucket
CREATE POLICY "Avatar images are publicly accessible"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'avatars');

CREATE POLICY "Users can upload their own avatar"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'avatars'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users can update their own avatar"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'avatars'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users can delete their own avatar"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'avatars'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- Storage policies for resources bucket (admin only upload)
CREATE POLICY "Authenticated users can view resources"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'resources'
    AND auth.uid() IS NOT NULL
  );

CREATE POLICY "Admins can upload resources"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'resources'
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role IN ('Broker Owner')
    )
  );

CREATE POLICY "Admins can update resources"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'resources'
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role IN ('Broker Owner')
    )
  );

CREATE POLICY "Admins can delete resources"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'resources'
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role IN ('Broker Owner')
    )
  );

-- Storage policies for videos bucket
CREATE POLICY "Videos are publicly accessible"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'videos');

CREATE POLICY "Admins can upload videos"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'videos'
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role IN ('Broker Owner')
    )
  );

CREATE POLICY "Admins can delete videos"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'videos'
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role IN ('Broker Owner')
    )
  );

-- Storage policies for PDFs bucket
CREATE POLICY "Authenticated users can view PDFs"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'pdfs'
    AND auth.uid() IS NOT NULL
  );

CREATE POLICY "Admins can upload PDFs"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'pdfs'
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role IN ('Broker Owner')
    )
  );

CREATE POLICY "Admins can delete PDFs"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'pdfs'
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role IN ('Broker Owner')
    )
  );

-- Storage policies for podcasts bucket
CREATE POLICY "Authenticated users can view podcasts"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'podcasts'
    AND auth.uid() IS NOT NULL
  );

CREATE POLICY "Admins can upload podcasts"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'podcasts'
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role IN ('Broker Owner')
    )
  );

CREATE POLICY "Admins can delete podcasts"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'podcasts'
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role IN ('Broker Owner')
    )
  );

-- Storage policies for thumbnails bucket
CREATE POLICY "Thumbnails are publicly accessible"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'thumbnails');

CREATE POLICY "Admins can upload thumbnails"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'thumbnails'
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role IN ('Broker Owner')
    )
  );

CREATE POLICY "Admins can delete thumbnails"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'thumbnails'
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role IN ('Broker Owner')
    )
  );

-- Storage policies for lender-logos bucket
CREATE POLICY "Lender logos are publicly accessible"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'lender-logos');

CREATE POLICY "Admins can upload lender logos"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'lender-logos'
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role IN ('Broker Owner', 'Partner Lender')
    )
  );

CREATE POLICY "Admins can delete lender logos"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'lender-logos'
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role IN ('Broker Owner')
    )
  );

-- Storage policies for vendor-logos bucket
CREATE POLICY "Vendor logos are publicly accessible"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'vendor-logos');

CREATE POLICY "Admins can upload vendor logos"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'vendor-logos'
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role IN ('Broker Owner', 'Partner Vendor')
    )
  );

CREATE POLICY "Admins can delete vendor logos"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'vendor-logos'
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role IN ('Broker Owner')
    )
  );
