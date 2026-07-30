-- Memperkuat RLS user_roles: hanya super_admin yang boleh menulis
-- (INSERT/UPDATE/DELETE). Sebelumnya "user_roles_staff_manage" mengizinkan
-- staf level manapun (admin biasa & admin sementara) mengubah peran akun
-- lain — ini pintu masuk skenario "admin mengganti hak admin lain otomatis".
--
-- Elevasi resmi via edge/server fn (admin-roles.functions.ts) sudah
-- mengharuskan super_admin di lapisan aplikasi; policy ini menutup jalur
-- alternatif via RLS langsung.

DROP POLICY IF EXISTS "user_roles_staff_manage" ON public.user_roles;
DROP POLICY IF EXISTS "user_roles_super_admin_manage" ON public.user_roles;
DROP POLICY IF EXISTS "user_roles_self_read" ON public.user_roles;
DROP POLICY IF EXISTS "user_roles_read_all" ON public.user_roles;

-- Semua pengguna terautentikasi bisa membaca (dipakai has_role() &
-- UI role switching). Row-level filter tetap ada di layer aplikasi.
CREATE POLICY "user_roles_read_all" ON public.user_roles
  FOR SELECT TO authenticated
  USING (true);

-- Hanya super_admin yang boleh menulis peran.
CREATE POLICY "user_roles_super_admin_manage" ON public.user_roles
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::public.app_role));
