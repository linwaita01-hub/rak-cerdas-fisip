-- Tambahkan profiles ke publication supabase_realtime agar perubahan data
-- mahasiswa (tambah/edit/hapus) dari satu device langsung terlihat di device
-- lain (admin bisa dipakai di beberapa perangkat bersamaan).
ALTER TABLE public.profiles REPLICA IDENTITY FULL;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
