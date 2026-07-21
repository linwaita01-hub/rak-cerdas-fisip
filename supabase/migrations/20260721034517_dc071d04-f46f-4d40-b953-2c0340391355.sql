
-- ============= ENUMS =============
DO $$ BEGIN
  CREATE TYPE public.denda_status AS ENUM ('belum_bayar','lunas','dibebaskan');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.reservasi_status AS ENUM ('menunggu','tersedia','diambil','kadaluarsa','batal');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============= PENGATURAN DENDA (singleton) =============
CREATE TABLE IF NOT EXISTS public.pengaturan_denda (
  id INT PRIMARY KEY DEFAULT 1,
  tarif_per_hari NUMERIC(10,2) NOT NULL DEFAULT 1000,
  grace_days INT NOT NULL DEFAULT 0,
  max_denda NUMERIC(10,2),
  batas_ambil_reservasi_jam INT NOT NULL DEFAULT 48,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID,
  CONSTRAINT single_row CHECK (id = 1)
);

GRANT SELECT ON public.pengaturan_denda TO authenticated;
GRANT ALL ON public.pengaturan_denda TO service_role;

ALTER TABLE public.pengaturan_denda ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_read_pengaturan" ON public.pengaturan_denda
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "staff_update_pengaturan" ON public.pengaturan_denda
  FOR UPDATE TO authenticated
  USING (public.is_staff(auth.uid()))
  WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY "staff_insert_pengaturan" ON public.pengaturan_denda
  FOR INSERT TO authenticated
  WITH CHECK (public.is_staff(auth.uid()));

INSERT INTO public.pengaturan_denda (id) VALUES (1) ON CONFLICT DO NOTHING;

-- ============= DENDA =============
CREATE TABLE IF NOT EXISTS public.denda (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  peminjaman_id UUID NOT NULL REFERENCES public.peminjaman(id) ON DELETE CASCADE,
  jumlah NUMERIC(10,2) NOT NULL DEFAULT 0,
  status public.denda_status NOT NULL DEFAULT 'belum_bayar',
  tanggal_dihitung TIMESTAMPTZ NOT NULL DEFAULT now(),
  dibebaskan_oleh UUID,
  dilunasi_oleh UUID,
  catatan TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (peminjaman_id)
);

CREATE INDEX IF NOT EXISTS denda_status_idx ON public.denda(status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.denda TO authenticated;
GRANT ALL ON public.denda TO service_role;

ALTER TABLE public.denda ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own_or_staff_read_denda" ON public.denda
  FOR SELECT TO authenticated USING (
    public.is_staff(auth.uid())
    OR EXISTS (SELECT 1 FROM public.peminjaman p WHERE p.id = denda.peminjaman_id AND p.user_id = auth.uid())
  );
CREATE POLICY "staff_write_denda" ON public.denda
  FOR ALL TO authenticated
  USING (public.is_staff(auth.uid()))
  WITH CHECK (public.is_staff(auth.uid()));

CREATE TRIGGER trg_denda_updated
  BEFORE UPDATE ON public.denda
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============= RESERVASI =============
CREATE TABLE IF NOT EXISTS public.reservasi (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  buku_id UUID NOT NULL REFERENCES public.buku(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  status public.reservasi_status NOT NULL DEFAULT 'menunggu',
  posisi_antrian INT NOT NULL DEFAULT 1,
  tanggal_reservasi TIMESTAMPTZ NOT NULL DEFAULT now(),
  tanggal_tersedia TIMESTAMPTZ,
  tanggal_kadaluarsa TIMESTAMPTZ,
  eksemplar_id UUID REFERENCES public.eksemplar(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS reservasi_buku_status_idx ON public.reservasi(buku_id, status);
CREATE INDEX IF NOT EXISTS reservasi_user_idx ON public.reservasi(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS reservasi_unik_menunggu ON public.reservasi(buku_id, user_id)
  WHERE status IN ('menunggu','tersedia');

GRANT SELECT, INSERT, UPDATE, DELETE ON public.reservasi TO authenticated;
GRANT ALL ON public.reservasi TO service_role;

ALTER TABLE public.reservasi ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own_or_staff_read_reservasi" ON public.reservasi
  FOR SELECT TO authenticated USING (
    user_id = auth.uid() OR public.is_staff(auth.uid())
  );
CREATE POLICY "user_insert_reservasi" ON public.reservasi
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "own_cancel_reservasi" ON public.reservasi
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid() AND status = 'batal');
CREATE POLICY "staff_manage_reservasi" ON public.reservasi
  FOR ALL TO authenticated
  USING (public.is_staff(auth.uid()))
  WITH CHECK (public.is_staff(auth.uid()));

CREATE TRIGGER trg_reservasi_updated
  BEFORE UPDATE ON public.reservasi
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============= FUNGSI HITUNG DENDA =============
CREATE OR REPLACE FUNCTION public.hitung_denda_untuk(_peminjaman_id UUID)
RETURNS NUMERIC
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  p RECORD;
  cfg RECORD;
  hari_telat INT;
  jumlah NUMERIC(10,2);
  akhir TIMESTAMPTZ;
BEGIN
  SELECT * INTO p FROM public.peminjaman WHERE id = _peminjaman_id;
  IF NOT FOUND OR p.tanggal_jatuh_tempo IS NULL THEN RETURN 0; END IF;

  SELECT * INTO cfg FROM public.pengaturan_denda WHERE id = 1;
  IF NOT FOUND THEN RETURN 0; END IF;

  akhir := COALESCE(p.tanggal_kembali, now());
  hari_telat := GREATEST(0, CEIL(EXTRACT(EPOCH FROM (akhir - p.tanggal_jatuh_tempo)) / 86400.0)::INT - cfg.grace_days);

  IF hari_telat <= 0 THEN RETURN 0; END IF;

  jumlah := hari_telat * cfg.tarif_per_hari;
  IF cfg.max_denda IS NOT NULL AND jumlah > cfg.max_denda THEN
    jumlah := cfg.max_denda;
  END IF;
  RETURN jumlah;
END;
$$;

-- Trigger: saat peminjaman ditandai dikembalikan -> upsert denda
CREATE OR REPLACE FUNCTION public.peminjaman_kembali_denda()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  jml NUMERIC(10,2);
BEGIN
  IF NEW.status = 'dikembalikan' AND (OLD.status IS DISTINCT FROM 'dikembalikan') THEN
    jml := public.hitung_denda_untuk(NEW.id);
    IF jml > 0 THEN
      INSERT INTO public.denda (peminjaman_id, jumlah, status)
      VALUES (NEW.id, jml, 'belum_bayar')
      ON CONFLICT (peminjaman_id) DO UPDATE
        SET jumlah = EXCLUDED.jumlah,
            tanggal_dihitung = now(),
            status = CASE WHEN public.denda.status IN ('lunas','dibebaskan') THEN public.denda.status ELSE 'belum_bayar' END;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_peminjaman_denda ON public.peminjaman;
CREATE TRIGGER trg_peminjaman_denda
  AFTER UPDATE ON public.peminjaman
  FOR EACH ROW EXECUTE FUNCTION public.peminjaman_kembali_denda();

-- ============= FUNGSI HARIAN: TANDAI TERLAMBAT =============
CREATE OR REPLACE FUNCTION public.tandai_peminjaman_terlambat()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r RECORD;
  n INT := 0;
  jml NUMERIC(10,2);
BEGIN
  FOR r IN
    SELECT * FROM public.peminjaman
    WHERE status IN ('dipinjam','terlambat')
      AND tanggal_jatuh_tempo IS NOT NULL
      AND tanggal_jatuh_tempo < now()
  LOOP
    IF r.status <> 'terlambat' THEN
      UPDATE public.peminjaman SET status='terlambat' WHERE id=r.id;
    END IF;
    jml := public.hitung_denda_untuk(r.id);
    IF jml > 0 THEN
      INSERT INTO public.denda (peminjaman_id, jumlah, status, tanggal_dihitung)
      VALUES (r.id, jml, 'belum_bayar', now())
      ON CONFLICT (peminjaman_id) DO UPDATE
        SET jumlah = EXCLUDED.jumlah,
            tanggal_dihitung = now(),
            status = CASE WHEN public.denda.status IN ('lunas','dibebaskan') THEN public.denda.status ELSE 'belum_bayar' END;
    END IF;
    n := n + 1;
  END LOOP;
  RETURN n;
END;
$$;

-- ============= FUNGSI PROMOSI RESERVASI =============
CREATE OR REPLACE FUNCTION public.promosikan_reservasi_berikutnya(_buku_id UUID, _eksemplar_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cfg RECORD;
  res_id UUID;
  jam INT;
BEGIN
  SELECT * INTO cfg FROM public.pengaturan_denda WHERE id = 1;
  jam := COALESCE(cfg.batas_ambil_reservasi_jam, 48);

  UPDATE public.reservasi
  SET status = 'tersedia',
      tanggal_tersedia = now(),
      tanggal_kadaluarsa = now() + (jam || ' hours')::interval,
      eksemplar_id = _eksemplar_id
  WHERE id = (
    SELECT id FROM public.reservasi
    WHERE buku_id = _buku_id AND status = 'menunggu'
    ORDER BY tanggal_reservasi ASC LIMIT 1
  )
  RETURNING id INTO res_id;

  IF res_id IS NOT NULL THEN
    UPDATE public.eksemplar SET status = 'dipesan' WHERE id = _eksemplar_id;
  END IF;

  RETURN res_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.eksemplar_status_hook()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'tersedia' AND (OLD.status IS DISTINCT FROM 'tersedia') THEN
    PERFORM public.promosikan_reservasi_berikutnya(NEW.buku_id, NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_eksemplar_promosi ON public.eksemplar;
CREATE TRIGGER trg_eksemplar_promosi
  AFTER UPDATE ON public.eksemplar
  FOR EACH ROW EXECUTE FUNCTION public.eksemplar_status_hook();

-- ============= FUNGSI KADALUARSA RESERVASI =============
CREATE OR REPLACE FUNCTION public.expire_reservasi_lewat()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r RECORD; n INT := 0;
BEGIN
  FOR r IN SELECT * FROM public.reservasi
           WHERE status = 'tersedia' AND tanggal_kadaluarsa IS NOT NULL AND tanggal_kadaluarsa < now()
  LOOP
    UPDATE public.reservasi SET status='kadaluarsa' WHERE id=r.id;
    IF r.eksemplar_id IS NOT NULL THEN
      UPDATE public.eksemplar SET status='tersedia' WHERE id=r.eksemplar_id AND status='dipesan';
    END IF;
    n := n + 1;
  END LOOP;
  RETURN n;
END;
$$;

-- ============= KELAYAKAN MAHASISWA =============
CREATE OR REPLACE FUNCTION public.mahasiswa_layak_pinjam(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT NOT EXISTS (
    SELECT 1 FROM public.denda d
    JOIN public.peminjaman p ON p.id = d.peminjaman_id
    WHERE p.user_id = _user_id AND d.status = 'belum_bayar'
  ) AND NOT EXISTS (
    SELECT 1 FROM public.peminjaman p
    WHERE p.user_id = _user_id AND p.status = 'terlambat'
  );
$$;

-- ============= REALTIME =============
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.peminjaman;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.reservasi;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.denda;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.eksemplar;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
