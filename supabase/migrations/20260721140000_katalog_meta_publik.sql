-- TAHAP 2 — Katalog lengkap (struktur "sheet 7 tina") + katalog publik.
--
-- Kolom-kolom tambahan dari sheet asli (pengarang tambahan, editor, edisi,
-- kata kunci, bentuk fisik, deskripsi fisik, klasifikasi, no panggil, subjek,
-- bahasa, jenis koleksi, kode inventaris, foto, dst.) disimpan fleksibel di
-- satu kolom JSONB 'meta' agar tidak perlu migrasi tiap kolom baru dan bisa
-- memuat semua kolom apa adanya. Kolom typed yang sudah ada tetap dipakai.

ALTER TABLE public.buku ADD COLUMN IF NOT EXISTS meta jsonb NOT NULL DEFAULT '{}'::jsonb;

-- ---- Katalog publik: boleh dibaca tanpa login (data buku bersifat publik) ----
GRANT SELECT ON public.buku TO anon;
GRANT SELECT ON public.eksemplar TO anon;

DROP POLICY IF EXISTS "buku_read_public" ON public.buku;
CREATE POLICY "buku_read_public" ON public.buku
  FOR SELECT TO anon
  USING (deleted_at IS NULL);

DROP POLICY IF EXISTS "eksemplar_read_public" ON public.eksemplar;
CREATE POLICY "eksemplar_read_public" ON public.eksemplar
  FOR SELECT TO anon
  USING (deleted_at IS NULL);

-- ---- Bucket sampul buku (publik untuk dibaca; hanya staf yang menulis) ----
INSERT INTO storage.buckets (id, name, public)
VALUES ('sampul', 'sampul', true)
ON CONFLICT (id) DO UPDATE SET public = true;

DROP POLICY IF EXISTS "sampul_public_read" ON storage.objects;
CREATE POLICY "sampul_public_read" ON storage.objects
  FOR SELECT TO public
  USING (bucket_id = 'sampul');

DROP POLICY IF EXISTS "sampul_staff_write" ON storage.objects;
CREATE POLICY "sampul_staff_write" ON storage.objects
  FOR ALL TO authenticated
  USING (bucket_id = 'sampul' AND public.is_staff(auth.uid()))
  WITH CHECK (bucket_id = 'sampul' AND public.is_staff(auth.uid()));
