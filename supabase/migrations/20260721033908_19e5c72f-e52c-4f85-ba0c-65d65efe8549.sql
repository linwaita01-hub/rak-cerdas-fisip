
-- ========== ENUMS ==========
CREATE TYPE public.app_role AS ENUM ('super_admin', 'admin', 'admin_sementara', 'mahasiswa');
CREATE TYPE public.eksemplar_status AS ENUM ('tersedia', 'dipinjam', 'dipesan', 'hilang', 'rusak');
CREATE TYPE public.peminjaman_status AS ENUM ('menunggu', 'disetujui', 'ditolak', 'dipinjam', 'dikembalikan', 'terlambat');

-- ========== UTIL: updated_at trigger ==========
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

-- ========== PROFILES ==========
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  nama TEXT,
  nim TEXT UNIQUE,
  prodi TEXT,
  email TEXT,
  is_profile_completed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_profiles_updated BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ========== USER ROLES ==========
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- ========== has_role() SECURITY DEFINER ==========
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
      AND (expires_at IS NULL OR expires_at > now())
  )
$$;

CREATE OR REPLACE FUNCTION public.is_staff(_user_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND role IN ('super_admin','admin','admin_sementara')
      AND (expires_at IS NULL OR expires_at > now())
  )
$$;

-- ========== Trigger: auto-create profile + assign mahasiswa role on signup ==========
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, nama, nim, prodi, is_profile_completed)
  VALUES (
    NEW.id,
    NEW.email,
    NULLIF(NEW.raw_user_meta_data->>'nama',''),
    NULLIF(NEW.raw_user_meta_data->>'nim',''),
    NULLIF(NEW.raw_user_meta_data->>'prodi',''),
    false
  )
  ON CONFLICT (id) DO NOTHING;

  -- Default role mahasiswa (kecuali sudah punya role lain)
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'mahasiswa')
  ON CONFLICT (user_id, role) DO NOTHING;

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ========== RLS: profiles ==========
CREATE POLICY "profiles_self_read" ON public.profiles
  FOR SELECT TO authenticated
  USING (auth.uid() = id OR public.is_staff(auth.uid()));
CREATE POLICY "profiles_self_update" ON public.profiles
  FOR UPDATE TO authenticated
  USING (auth.uid() = id OR public.is_staff(auth.uid()))
  WITH CHECK (auth.uid() = id OR public.is_staff(auth.uid()));
CREATE POLICY "profiles_self_insert" ON public.profiles
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = id);

-- ========== RLS: user_roles ==========
CREATE POLICY "user_roles_self_read" ON public.user_roles
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.is_staff(auth.uid()));
CREATE POLICY "user_roles_staff_manage" ON public.user_roles
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin') OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin') OR public.has_role(auth.uid(), 'admin'));

-- ========== BUKU ==========
CREATE TABLE public.buku (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kode_buku TEXT UNIQUE NOT NULL,
  judul TEXT NOT NULL,
  pengarang TEXT,
  penerbit TEXT,
  tahun_terbit INT,
  isbn TEXT,
  kategori TEXT,
  deskripsi TEXT,
  lokasi_rak TEXT,
  sampul_path TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.buku TO authenticated;
GRANT ALL ON public.buku TO service_role;
ALTER TABLE public.buku ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_buku_updated BEFORE UPDATE ON public.buku
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE POLICY "buku_read_all" ON public.buku
  FOR SELECT TO authenticated
  USING (deleted_at IS NULL OR public.is_staff(auth.uid()));
CREATE POLICY "buku_staff_write" ON public.buku
  FOR ALL TO authenticated
  USING (public.is_staff(auth.uid()))
  WITH CHECK (public.is_staff(auth.uid()));

-- ========== EKSEMPLAR ==========
CREATE TABLE public.eksemplar (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  buku_id UUID NOT NULL REFERENCES public.buku(id) ON DELETE CASCADE,
  kode_eksemplar TEXT UNIQUE NOT NULL,
  barcode_value TEXT UNIQUE NOT NULL,
  status public.eksemplar_status NOT NULL DEFAULT 'tersedia',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.eksemplar TO authenticated;
GRANT ALL ON public.eksemplar TO service_role;
ALTER TABLE public.eksemplar ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_eksemplar_updated BEFORE UPDATE ON public.eksemplar
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Auto-generate barcode_value dari kode_eksemplar jika kosong
CREATE OR REPLACE FUNCTION public.eksemplar_autofill()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.barcode_value IS NULL OR NEW.barcode_value = '' THEN
    NEW.barcode_value := NEW.kode_eksemplar;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_eksemplar_autofill BEFORE INSERT ON public.eksemplar
  FOR EACH ROW EXECUTE FUNCTION public.eksemplar_autofill();

CREATE POLICY "eksemplar_read_all" ON public.eksemplar
  FOR SELECT TO authenticated
  USING (deleted_at IS NULL OR public.is_staff(auth.uid()));
CREATE POLICY "eksemplar_staff_write" ON public.eksemplar
  FOR ALL TO authenticated
  USING (public.is_staff(auth.uid()))
  WITH CHECK (public.is_staff(auth.uid()));

-- ========== PEMINJAMAN ==========
CREATE TABLE public.peminjaman (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  eksemplar_id UUID REFERENCES public.eksemplar(id) ON DELETE SET NULL,
  buku_id UUID REFERENCES public.buku(id) ON DELETE SET NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  disetujui_oleh UUID REFERENCES auth.users(id),
  status public.peminjaman_status NOT NULL DEFAULT 'menunggu',
  tanggal_pengajuan TIMESTAMPTZ NOT NULL DEFAULT now(),
  tanggal_pinjam TIMESTAMPTZ,
  durasi_hari INT DEFAULT 7,
  tanggal_jatuh_tempo TIMESTAMPTZ,
  tanggal_kembali TIMESTAMPTZ,
  catatan TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.peminjaman TO authenticated;
GRANT ALL ON public.peminjaman TO service_role;
ALTER TABLE public.peminjaman ENABLE ROW LEVEL SECURITY;

CREATE POLICY "peminjaman_owner_read" ON public.peminjaman
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.is_staff(auth.uid()));
CREATE POLICY "peminjaman_owner_insert" ON public.peminjaman
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id OR public.is_staff(auth.uid()));
CREATE POLICY "peminjaman_owner_cancel" ON public.peminjaman
  FOR UPDATE TO authenticated
  USING (
    (auth.uid() = user_id AND status = 'menunggu')
    OR public.is_staff(auth.uid())
  )
  WITH CHECK (
    (auth.uid() = user_id AND status IN ('menunggu','ditolak'))
    OR public.is_staff(auth.uid())
  );
CREATE POLICY "peminjaman_staff_delete" ON public.peminjaman
  FOR DELETE TO authenticated
  USING (public.is_staff(auth.uid()));

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.peminjaman;
ALTER PUBLICATION supabase_realtime ADD TABLE public.eksemplar;
