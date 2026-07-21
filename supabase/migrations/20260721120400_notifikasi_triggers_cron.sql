-- PART 4.4 — Pemicu notifikasi (event) + pengingat terjadwal (cron) via pg_net.
--
-- Semua notifikasi mengalir: DB -> pg_net -> Edge Function "kirim-notifikasi".
-- Edge function memegang VAPID private key & service_role. DB hanya menyimpan
-- URL fungsi + secret bersama di tabel notif_config (tidak dapat dibaca peran
-- authenticated).

CREATE EXTENSION IF NOT EXISTS pg_net;

-- ---- Konfigurasi (URL edge function + secret), hanya untuk service_role ----
CREATE TABLE IF NOT EXISTS public.notif_config (
  id int PRIMARY KEY DEFAULT 1,
  function_url text NOT NULL,
  secret text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT notif_config_single CHECK (id = 1)
);
ALTER TABLE public.notif_config ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.notif_config FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.notif_config TO service_role;
-- Tidak ada policy untuk authenticated → secret tidak bisa dibaca klien.

-- SETELAH deploy edge function, ISI baris ini (via Lovable/SQL):
--   INSERT INTO public.notif_config (id, function_url, secret) VALUES
--     (1, 'https://ehftibpdwpeszobzagua.supabase.co/functions/v1/kirim-notifikasi', '<NOTIF_SECRET>')
--   ON CONFLICT (id) DO UPDATE
--     SET function_url = EXCLUDED.function_url, secret = EXCLUDED.secret, updated_at = now();

-- ---- Pemanggil HTTP (fire-and-forget; tidak menggagalkan transaksi inti) ----
CREATE OR REPLACE FUNCTION public.kirim_notifikasi_http(payload jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cfg record;
BEGIN
  SELECT * INTO cfg FROM public.notif_config WHERE id = 1;
  IF cfg IS NULL THEN RETURN; END IF;
  PERFORM net.http_post(
    url := cfg.function_url,
    body := payload,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-notif-secret', cfg.secret),
    timeout_milliseconds := 5000
  );
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'kirim_notifikasi_http gagal: %', SQLERRM;
END;
$$;
REVOKE ALL ON FUNCTION public.kirim_notifikasi_http(jsonb) FROM PUBLIC, anon, authenticated;

-- ---- Event: hasil persetujuan / penolakan peminjaman ----
CREATE OR REPLACE FUNCTION public.notif_peminjaman()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  judul text;
BEGIN
  IF NEW.status = OLD.status THEN RETURN NEW; END IF;
  SELECT b.judul INTO judul FROM public.buku b WHERE b.id = NEW.buku_id;

  IF NEW.status = 'dipinjam' AND OLD.status IN ('menunggu', 'disetujui') THEN
    PERFORM public.kirim_notifikasi_http(jsonb_build_object(
      'user_id', NEW.user_id,
      'title', 'Peminjaman disetujui',
      'body', COALESCE(judul, 'Buku') || ' telah disetujui dan dipinjamkan.',
      'url', '/app'));
  ELSIF NEW.status = 'ditolak' AND OLD.status = 'menunggu' THEN
    PERFORM public.kirim_notifikasi_http(jsonb_build_object(
      'user_id', NEW.user_id,
      'title', 'Peminjaman ditolak',
      'body', 'Pengajuan untuk ' || COALESCE(judul, 'buku') || ' ditolak.',
      'url', '/app'));
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.notif_peminjaman() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_notif_peminjaman ON public.peminjaman;
CREATE TRIGGER trg_notif_peminjaman
  AFTER UPDATE ON public.peminjaman
  FOR EACH ROW EXECUTE FUNCTION public.notif_peminjaman();

-- ---- Event: reservasi menjadi tersedia ----
CREATE OR REPLACE FUNCTION public.notif_reservasi()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  judul text;
BEGIN
  IF NEW.status = 'tersedia' AND OLD.status IS DISTINCT FROM 'tersedia' THEN
    SELECT b.judul INTO judul FROM public.buku b WHERE b.id = NEW.buku_id;
    PERFORM public.kirim_notifikasi_http(jsonb_build_object(
      'user_id', NEW.user_id,
      'title', 'Buku reservasi tersedia',
      'body', COALESCE(judul, 'Buku') || ' yang Anda pesan kini tersedia. Segera ambil sebelum kedaluwarsa.',
      'url', '/app'));
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.notif_reservasi() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_notif_reservasi ON public.reservasi;
CREATE TRIGGER trg_notif_reservasi
  AFTER UPDATE ON public.reservasi
  FOR EACH ROW EXECUTE FUNCTION public.notif_reservasi();

-- ---- Cron: pengingat jatuh tempo (H-1 & terlambat), harian 09:00 WITA ----
DO $$ BEGIN
  PERFORM cron.unschedule('perpus-pengingat-jatuh-tempo');
EXCEPTION WHEN OTHERS THEN NULL; END $$;

SELECT cron.schedule(
  'perpus-pengingat-jatuh-tempo',
  '0 1 * * *', -- 01:00 UTC = 09:00 WITA
  $$ SELECT public.kirim_notifikasi_http('{"tugas":"pengingat"}'::jsonb); $$
);
