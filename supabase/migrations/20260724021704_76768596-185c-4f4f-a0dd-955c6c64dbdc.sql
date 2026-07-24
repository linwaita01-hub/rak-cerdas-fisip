
-- 1. Tighten peminjaman INSERT
DROP POLICY IF EXISTS peminjaman_owner_insert ON public.peminjaman;
CREATE POLICY peminjaman_owner_insert ON public.peminjaman
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_staff(auth.uid())
    OR (
      auth.uid() = user_id
      AND status = 'menunggu'::peminjaman_status
      AND eksemplar_id IS NULL
      AND disetujui_oleh IS NULL
      AND tanggal_pinjam IS NULL
      AND tanggal_jatuh_tempo IS NULL
    )
  );

-- 2. Tighten reservasi INSERT
DROP POLICY IF EXISTS user_insert_reservasi ON public.reservasi;
CREATE POLICY user_insert_reservasi ON public.reservasi
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_staff(auth.uid())
    OR (
      user_id = auth.uid()
      AND (status IS NULL OR status = 'menunggu'::reservasi_status)
      AND eksemplar_id IS NULL
      AND tanggal_tersedia IS NULL
      AND tanggal_kadaluarsa IS NULL
    )
  );

-- 3. Revoke EXECUTE on staff-only SECURITY DEFINER functions from authenticated
REVOKE EXECUTE ON FUNCTION public.pulihkan_buku(uuid) FROM authenticated, anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.hapus_permanen_buku(uuid) FROM authenticated, anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.kembalikan_versi_buku(uuid) FROM authenticated, anon, PUBLIC;
