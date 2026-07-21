
DO $$ BEGIN
  ALTER TABLE public.peminjaman
    ADD CONSTRAINT peminjaman_user_profiles_fk FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN others THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.reservasi
    ADD CONSTRAINT reservasi_user_profiles_fk FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN others THEN NULL; END $$;
