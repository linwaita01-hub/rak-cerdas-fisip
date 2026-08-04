DROP POLICY IF EXISTS "sampul_read_auth" ON storage.objects;
DROP POLICY IF EXISTS "sampul_public_read" ON storage.objects;
CREATE POLICY "sampul_public_read" ON storage.objects
  FOR SELECT TO anon, authenticated
  USING (bucket_id = 'sampul');