-- Kitap Mağazası — kapak görselleri Storage bucket
-- Supabase → SQL Editor'de çalıştırın.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'commerce-book-covers',
  'commerce-book-covers',
  true,
  10485760,
  ARRAY[
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/webp'
  ]
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Satıcı vitrin logoları (isteğe bağlı ayrı alt yol; aynı bucket)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'commerce-vendor-assets',
  'commerce-vendor-assets',
  true,
  5242880,
  ARRAY[
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/webp',
    'image/svg+xml'
  ]
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Public okuma (mağaza vitrininde kapak URL'leri)
DROP POLICY IF EXISTS commerce_book_covers_public_read ON storage.objects;
CREATE POLICY commerce_book_covers_public_read
  ON storage.objects
  FOR SELECT
  TO public
  USING (bucket_id = 'commerce-book-covers');

DROP POLICY IF EXISTS commerce_vendor_assets_public_read ON storage.objects;
CREATE POLICY commerce_vendor_assets_public_read
  ON storage.objects
  FOR SELECT
  TO public
  USING (bucket_id = 'commerce-vendor-assets');

-- Yükleme / silme: yalnızca service role (API üzerinden); authenticated/anon kapalı
DROP POLICY IF EXISTS commerce_book_covers_deny_write_anon ON storage.objects;
CREATE POLICY commerce_book_covers_deny_write_anon
  ON storage.objects
  FOR INSERT
  TO anon
  WITH CHECK (false);

DROP POLICY IF EXISTS commerce_book_covers_deny_write_auth ON storage.objects;
CREATE POLICY commerce_book_covers_deny_write_auth
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (false);

DROP POLICY IF EXISTS commerce_vendor_assets_deny_write_anon ON storage.objects;
CREATE POLICY commerce_vendor_assets_deny_write_anon
  ON storage.objects
  FOR INSERT
  TO anon
  WITH CHECK (false);

DROP POLICY IF EXISTS commerce_vendor_assets_deny_write_auth ON storage.objects;
CREATE POLICY commerce_vendor_assets_deny_write_auth
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (false);
