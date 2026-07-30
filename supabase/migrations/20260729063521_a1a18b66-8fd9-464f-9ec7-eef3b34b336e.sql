
CREATE POLICY "sampul_read_auth" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'sampul');
CREATE POLICY "sampul_staff_insert" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'sampul' AND public.is_staff(auth.uid()));
CREATE POLICY "sampul_staff_update" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'sampul' AND public.is_staff(auth.uid())) WITH CHECK (bucket_id = 'sampul' AND public.is_staff(auth.uid()));
CREATE POLICY "sampul_staff_delete" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'sampul' AND public.is_staff(auth.uid()));
