-- Menghapus akun mahasiswa demo & mengganti kredensial akun admin demo.
--
-- - Akun mahasiswa demo (mahasiswa.demo@fisip.ulm.ac.id) dihapus sepenuhnya
--   (profil + peran + user auth). Cascade dari public.profiles/user_roles ke
--   auth.users ditangani oleh ON DELETE CASCADE FK yang sudah ada.
-- - Akun admin demo (admin.demo@fisip.ulm.ac.id) diganti email menjadi
--   adminfisif@fisip.ulm.ac.id dan password menjadi 'fisif123' (min. 6 char).
--
-- Migrasi ini menyentuh skema `auth` — HANYA berjalan bila punya akses
-- SUPERUSER (Lovable/Supabase SQL editor). Bila gagal, jalankan langkahnya
-- manual via Dashboard Supabase → Authentication → Users.

DO $$
DECLARE
  admin_id uuid;
  mhs_id uuid;
BEGIN
  -- Hapus akun mahasiswa demo
  SELECT id INTO mhs_id FROM auth.users WHERE lower(email) = 'mahasiswa.demo@fisip.ulm.ac.id';
  IF mhs_id IS NOT NULL THEN
    DELETE FROM auth.users WHERE id = mhs_id;
  END IF;

  -- Ganti kredensial akun admin demo
  SELECT id INTO admin_id FROM auth.users WHERE lower(email) = 'admin.demo@fisip.ulm.ac.id';
  IF admin_id IS NOT NULL THEN
    UPDATE auth.users
      SET email = 'adminfisif@fisip.ulm.ac.id',
          encrypted_password = crypt('fisif123', gen_salt('bf')),
          email_confirmed_at = COALESCE(email_confirmed_at, now()),
          updated_at = now()
      WHERE id = admin_id;
    UPDATE public.profiles SET email = 'adminfisif@fisip.ulm.ac.id' WHERE id = admin_id;
  END IF;
END $$;
