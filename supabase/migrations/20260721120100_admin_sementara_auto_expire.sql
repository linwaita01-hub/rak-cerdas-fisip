-- PART 4.2 — Auto-expire admin sementara (pg_cron).
--
-- Catatan: has_role() dan is_staff() SUDAH mengabaikan baris user_roles yang
-- (expires_at IS NOT NULL AND expires_at <= now()), sehingga akses admin
-- sementara otomatis hilang tepat saat kedaluwarsa TANPA cron. Cron ini murni
-- untuk KEBERSIHAN: menghapus baris peran yang sudah lewat agar tidak menumpuk,
-- dan mencatat jejaknya ke purge_log.

CREATE OR REPLACE FUNCTION public.cabut_admin_sementara_kadaluarsa()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n integer;
BEGIN
  WITH d AS (
    DELETE FROM public.user_roles
    WHERE role = 'admin_sementara'
      AND expires_at IS NOT NULL
      AND expires_at <= now()
    RETURNING user_id
  )
  SELECT count(*) INTO n FROM d;

  IF n > 0 THEN
    INSERT INTO public.purge_log(entitas, jumlah, detail)
    VALUES ('admin_sementara_expired', n, jsonb_build_object('at', now()));
  END IF;
  RETURN n;
END;
$$;

REVOKE ALL ON FUNCTION public.cabut_admin_sementara_kadaluarsa() FROM PUBLIC, anon, authenticated;

-- Jadwalkan harian pukul 01:20 WITA (17:20 UTC).
DO $$ BEGIN
  PERFORM cron.unschedule('perpus-cabut-admin-sementara');
EXCEPTION WHEN OTHERS THEN NULL; END $$;

SELECT cron.schedule(
  'perpus-cabut-admin-sementara',
  '20 17 * * *',
  $$ SELECT public.cabut_admin_sementara_kadaluarsa(); $$
);
