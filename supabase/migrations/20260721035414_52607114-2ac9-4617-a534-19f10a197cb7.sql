
-- 1) buku_history + trigger
CREATE TABLE public.buku_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  buku_id uuid NOT NULL REFERENCES public.buku(id) ON DELETE CASCADE,
  data_lama jsonb NOT NULL,
  diubah_oleh uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX buku_history_buku_id_idx ON public.buku_history(buku_id, created_at DESC);

GRANT SELECT ON public.buku_history TO authenticated;
GRANT ALL ON public.buku_history TO service_role;

ALTER TABLE public.buku_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "history_staff_read" ON public.buku_history
  FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));

CREATE OR REPLACE FUNCTION public.log_buku_history()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND row_to_json(OLD)::jsonb IS DISTINCT FROM row_to_json(NEW)::jsonb THEN
    INSERT INTO public.buku_history(buku_id, data_lama, diubah_oleh)
    VALUES (OLD.id, to_jsonb(OLD), auth.uid());
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_buku_history
  BEFORE UPDATE ON public.buku
  FOR EACH ROW EXECUTE FUNCTION public.log_buku_history();

-- 2) purge_log
CREATE TABLE public.purge_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entitas text NOT NULL,
  jumlah integer NOT NULL,
  detail jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.purge_log TO authenticated;
GRANT ALL ON public.purge_log TO service_role;
ALTER TABLE public.purge_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "purge_log_staff_read" ON public.purge_log
  FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));

-- 3) retention days on pengaturan_denda
ALTER TABLE public.pengaturan_denda
  ADD COLUMN IF NOT EXISTS purge_hari integer NOT NULL DEFAULT 60;

-- 4) admin RPC functions
CREATE OR REPLACE FUNCTION public.pulihkan_buku(_buku_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_staff(auth.uid()) THEN RAISE EXCEPTION 'akses ditolak'; END IF;
  UPDATE public.buku SET deleted_at = NULL WHERE id = _buku_id;
END;$$;
REVOKE ALL ON FUNCTION public.pulihkan_buku(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.pulihkan_buku(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.hapus_permanen_buku(_buku_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_staff(auth.uid()) THEN RAISE EXCEPTION 'akses ditolak'; END IF;
  DELETE FROM public.buku WHERE id = _buku_id;
  INSERT INTO public.purge_log(entitas, jumlah, detail)
  VALUES ('buku_manual', 1, jsonb_build_object('buku_id', _buku_id, 'oleh', auth.uid()));
END;$$;
REVOKE ALL ON FUNCTION public.hapus_permanen_buku(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.hapus_permanen_buku(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.kembalikan_versi_buku(_history_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE d jsonb; bid uuid;
BEGIN
  IF NOT public.is_staff(auth.uid()) THEN RAISE EXCEPTION 'akses ditolak'; END IF;
  SELECT data_lama, buku_id INTO d, bid FROM public.buku_history WHERE id = _history_id;
  IF d IS NULL THEN RAISE EXCEPTION 'riwayat tidak ditemukan'; END IF;
  UPDATE public.buku SET
    kode_buku    = COALESCE(d->>'kode_buku', kode_buku),
    judul        = COALESCE(d->>'judul', judul),
    pengarang    = d->>'pengarang',
    penerbit     = d->>'penerbit',
    tahun_terbit = NULLIF(d->>'tahun_terbit','')::int,
    isbn         = d->>'isbn',
    kategori     = d->>'kategori',
    deskripsi    = d->>'deskripsi',
    lokasi_rak   = d->>'lokasi_rak',
    sampul_path  = d->>'sampul_path'
  WHERE id = bid;
END;$$;
REVOKE ALL ON FUNCTION public.kembalikan_versi_buku(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.kembalikan_versi_buku(uuid) TO authenticated;

-- 5) purge function + cron
CREATE OR REPLACE FUNCTION public.purge_buku_terhapus_lama()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE hari integer; n integer;
BEGIN
  SELECT COALESCE(purge_hari, 60) INTO hari FROM public.pengaturan_denda LIMIT 1;
  IF hari IS NULL THEN hari := 60; END IF;
  WITH d AS (
    DELETE FROM public.buku
    WHERE deleted_at IS NOT NULL AND deleted_at < (now() - make_interval(days => hari))
    RETURNING id
  )
  SELECT count(*) INTO n FROM d;
  IF n > 0 THEN
    INSERT INTO public.purge_log(entitas, jumlah, detail)
    VALUES ('buku_auto', n, jsonb_build_object('hari', hari, 'at', now()));
  END IF;
  RETURN n;
END;$$;

DO $$ BEGIN
  PERFORM cron.unschedule('perpus-auto-purge-buku');
EXCEPTION WHEN OTHERS THEN NULL; END $$;

SELECT cron.schedule(
  'perpus-auto-purge-buku',
  '15 18 * * *', -- 02:15 WITA (UTC+8) = 18:15 UTC hari sebelumnya
  $$ SELECT public.purge_buku_terhapus_lama(); $$
);
