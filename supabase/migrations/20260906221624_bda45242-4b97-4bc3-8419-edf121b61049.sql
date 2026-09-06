CREATE POLICY "Anexos de assistencia: enviar na propria pasta"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'assistencias' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Anexos de assistencia: ver proprios ou responsaveis"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'assistencias'
  AND ((storage.foldername(name))[1] = auth.uid()::text
       OR public.is_delivery_manager(auth.uid())
       OR public.is_finance(auth.uid()))
);