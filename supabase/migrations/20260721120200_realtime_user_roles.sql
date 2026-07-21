-- PART 4.3 — Realtime untuk perubahan peran.
--
-- Menambahkan tabel user_roles ke publication supabase_realtime agar klien
-- (RoleWatcher) menerima event saat peran akun berubah, lalu memperbarui
-- sesi/UI langsung. REPLICA IDENTITY FULL agar payload event (termasuk DELETE
-- pencabutan peran) memuat data baris yang relevan.

ALTER TABLE public.user_roles REPLICA IDENTITY FULL;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.user_roles;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
