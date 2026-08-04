CREATE OR REPLACE FUNCTION public.mahasiswa_layak_pinjam(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO 'public'
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

REVOKE ALL ON FUNCTION public.mahasiswa_layak_pinjam(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mahasiswa_layak_pinjam(uuid) TO authenticated;