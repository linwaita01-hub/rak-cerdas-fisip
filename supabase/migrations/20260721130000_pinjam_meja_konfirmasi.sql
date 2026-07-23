-- TAHAP 1 — Alur "pinjam di meja" dengan konfirmasi mahasiswa.
--
-- Model baru: admin memindai eksemplar di meja & memilih mahasiswa, lalu
-- membuat peminjaman berstatus 'menunggu' (eksemplar ditahan → 'dipesan').
-- Mahasiswa yang bersangkutan menerima notifikasi realtime dan MENGONFIRMASI
-- ("benar saya yang meminjam"). Transisi ke 'dipinjam' menyentuh eksemplar
-- (hanya staf yang boleh via RLS), jadi dilakukan lewat fungsi SECURITY
-- DEFINER berikut yang memverifikasi kepemilikan sendiri.
--
-- Status enum dipakai apa adanya (tanpa nilai baru): 'menunggu' = menunggu
-- konfirmasi mahasiswa; 'dipinjam' = terkonfirmasi & keluar; 'ditolak' =
-- mahasiswa menolak / kedaluwarsa / dibatalkan admin.

-- Mahasiswa (pemilik) atau staf mengonfirmasi → dipinjam.
CREATE OR REPLACE FUNCTION public.konfirmasi_peminjaman(_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  p record;
BEGIN
  SELECT * INTO p FROM public.peminjaman WHERE id = _id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Peminjaman tidak ditemukan.'; END IF;
  IF p.user_id <> auth.uid() AND NOT public.is_staff(auth.uid()) THEN
    RAISE EXCEPTION 'Bukan peminjaman Anda.';
  END IF;
  IF p.status <> 'menunggu' THEN
    RAISE EXCEPTION 'Permintaan sudah diproses atau kedaluwarsa.';
  END IF;

  UPDATE public.peminjaman SET
    status = 'dipinjam',
    tanggal_pinjam = now(),
    tanggal_jatuh_tempo = now() + (COALESCE(p.durasi_hari, 7) || ' days')::interval
  WHERE id = _id;

  IF p.eksemplar_id IS NOT NULL THEN
    UPDATE public.eksemplar SET status = 'dipinjam' WHERE id = p.eksemplar_id;
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.konfirmasi_peminjaman(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.konfirmasi_peminjaman(uuid) TO authenticated;

-- Mahasiswa menolak / staf batalkan / timeout → ditolak + eksemplar tersedia.
CREATE OR REPLACE FUNCTION public.batalkan_peminjaman_meja(_id uuid, _alasan text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  p record;
BEGIN
  SELECT * INTO p FROM public.peminjaman WHERE id = _id;
  IF NOT FOUND THEN RETURN; END IF;
  IF p.user_id <> auth.uid() AND NOT public.is_staff(auth.uid()) THEN
    RAISE EXCEPTION 'Tidak berwenang membatalkan.';
  END IF;
  IF p.status <> 'menunggu' THEN RETURN; END IF; -- idempotent

  UPDATE public.peminjaman
    SET status = 'ditolak', catatan = COALESCE(_alasan, catatan)
    WHERE id = _id;
  IF p.eksemplar_id IS NOT NULL THEN
    -- lepas tahanan; hanya bila masih 'dipesan' oleh proses ini
    UPDATE public.eksemplar SET status = 'tersedia'
      WHERE id = p.eksemplar_id AND status = 'dipesan';
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.batalkan_peminjaman_meja(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.batalkan_peminjaman_meja(uuid, text) TO authenticated;

-- Jaring pengaman: batalkan permintaan yang tak terkonfirmasi > 10 menit
-- (mis. mahasiswa & admin sama-sama menutup layar). UI menormalnya membatalkan
-- pada 60 detik; ini hanya untuk yatim-piatu.
CREATE OR REPLACE FUNCTION public.batalkan_konfirmasi_kadaluarsa()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
  n integer := 0;
BEGIN
  FOR r IN
    SELECT id, eksemplar_id FROM public.peminjaman
    WHERE status = 'menunggu' AND tanggal_pengajuan < now() - interval '10 minutes'
  LOOP
    UPDATE public.peminjaman SET status = 'ditolak', catatan = 'Kedaluwarsa: tidak dikonfirmasi'
      WHERE id = r.id;
    IF r.eksemplar_id IS NOT NULL THEN
      UPDATE public.eksemplar SET status = 'tersedia'
        WHERE id = r.eksemplar_id AND status = 'dipesan';
    END IF;
    n := n + 1;
  END LOOP;
  RETURN n;
END;
$$;
REVOKE ALL ON FUNCTION public.batalkan_konfirmasi_kadaluarsa() FROM PUBLIC, anon, authenticated;

DO $$ BEGIN
  PERFORM cron.unschedule('perpus-batal-konfirmasi-kadaluarsa');
EXCEPTION WHEN OTHERS THEN NULL; END $$;

SELECT cron.schedule(
  'perpus-batal-konfirmasi-kadaluarsa',
  '*/5 * * * *',
  $$ SELECT public.batalkan_konfirmasi_kadaluarsa(); $$
);
