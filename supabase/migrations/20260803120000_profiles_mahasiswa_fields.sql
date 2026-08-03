-- Tambahkan field data mahasiswa yang lebih lengkap.
-- Semua kolom nullable — hanya nama, nim, prodi yang wajib di UI.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS tempat_lahir TEXT,
  ADD COLUMN IF NOT EXISTS tanggal_lahir DATE,
  ADD COLUMN IF NOT EXISTS alamat TEXT,
  ADD COLUMN IF NOT EXISTS no_telp TEXT;
