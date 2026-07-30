-- Tambahkan buku & eksemplar ke publication supabase_realtime agar perubahan
-- katalog (upload buku baru, perubahan ketersediaan) langsung terlihat di
-- halaman katalog publik & katalog mahasiswa tanpa refresh.

ALTER TABLE public.buku REPLICA IDENTITY FULL;
ALTER TABLE public.eksemplar REPLICA IDENTITY FULL;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.buku;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.eksemplar;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
