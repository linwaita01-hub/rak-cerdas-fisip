-- PERBAIKAN BUG PRA-ADA (ditemukan saat membangun Editor Buku / PART 5).
--
-- Trigger public.log_buku_history() dijalankan saat UPDATE tabel buku dan
-- meng-INSERT baris ke public.buku_history. Namun fungsi ini SECURITY INVOKER
-- (default), sementara buku_history hanya punya GRANT SELECT + policy SELECT
-- untuk peran authenticated. Akibatnya SETIAP pengubahan kolom buku oleh staf
-- (baik dari dialog "Ubah buku" yang lama maupun Editor mirip Excel yang baru)
-- gagal dengan:
--   new row violates row-level security policy for table "buku_history"
--
-- Semua trigger lain pada skema ini sudah SECURITY DEFINER; fungsi ini
-- terlewat. Perbaikannya: jadikan SECURITY DEFINER agar INSERT ke buku_history
-- berjalan sebagai pemilik fungsi dan melewati RLS (aman: fungsi hanya mencatat
-- salinan data lama, tidak menerima input dari klien).

CREATE OR REPLACE FUNCTION public.log_buku_history()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND row_to_json(OLD)::jsonb IS DISTINCT FROM row_to_json(NEW)::jsonb THEN
    INSERT INTO public.buku_history(buku_id, data_lama, diubah_oleh)
    VALUES (OLD.id, to_jsonb(OLD), auth.uid());
  END IF;
  RETURN NEW;
END;
$$;

-- Tetap cabut hak eksekusi langsung dari klien (trigger tetap berjalan).
REVOKE ALL ON FUNCTION public.log_buku_history() FROM PUBLIC, anon, authenticated;
