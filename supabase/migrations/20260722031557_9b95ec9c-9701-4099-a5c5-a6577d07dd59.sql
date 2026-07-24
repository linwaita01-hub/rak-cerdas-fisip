
-- 1) user_roles: hanya super_admin yang dapat menulis
DROP POLICY IF EXISTS "user_roles_staff_manage" ON public.user_roles;
CREATE POLICY "user_roles_superadmin_manage" ON public.user_roles
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

-- 2) pengaturan_denda: batasi read hanya untuk staf
DROP POLICY IF EXISTS "auth_read_pengaturan" ON public.pengaturan_denda;
CREATE POLICY "staff_read_pengaturan" ON public.pengaturan_denda
  FOR SELECT TO authenticated
  USING (public.is_staff(auth.uid()));

-- 3) buku_history: policy INSERT eksplisit untuk staf (fungsi trigger SECURITY DEFINER tetap yang menulis)
CREATE POLICY "history_staff_insert" ON public.buku_history
  FOR INSERT TO authenticated
  WITH CHECK (public.is_staff(auth.uid()));

-- 4) Cabut EXECUTE fungsi SECURITY DEFINER internal dari authenticated/anon/public
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.eksemplar_status_hook() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.peminjaman_kembali_denda() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.promosikan_reservasi_berikutnya(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.hitung_denda_untuk(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tandai_peminjaman_terlambat() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.expire_reservasi_lewat() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.purge_buku_terhapus_lama() FROM PUBLIC, anon, authenticated;
