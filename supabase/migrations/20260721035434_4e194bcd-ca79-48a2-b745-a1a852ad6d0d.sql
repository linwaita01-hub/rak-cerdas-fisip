
REVOKE EXECUTE ON FUNCTION public.pulihkan_buku(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.hapus_permanen_buku(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.kembalikan_versi_buku(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.purge_buku_terhapus_lama() FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.log_buku_history() FROM public, anon, authenticated;
