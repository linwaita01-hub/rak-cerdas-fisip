
REVOKE ALL ON FUNCTION public.hitung_denda_untuk(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.peminjaman_kembali_denda() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tandai_peminjaman_terlambat() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.promosikan_reservasi_berikutnya(UUID, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.eksemplar_status_hook() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.expire_reservasi_lewat() FROM PUBLIC, anon, authenticated;
-- mahasiswa_layak_pinjam dibaca oleh UI mahasiswa/staf
REVOKE ALL ON FUNCTION public.mahasiswa_layak_pinjam(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mahasiswa_layak_pinjam(UUID) TO authenticated;
