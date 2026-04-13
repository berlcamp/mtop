-- Create storage bucket for MTOP document attachments
INSERT INTO storage.buckets (id, name, public)
VALUES ('mtop-documents', 'mtop-documents', true)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload files
CREATE POLICY "Authenticated users can upload documents"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'mtop-documents');

-- Allow authenticated users to update (upsert) their uploads
CREATE POLICY "Authenticated users can update documents"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'mtop-documents');

-- Allow authenticated users to delete files
CREATE POLICY "Authenticated users can delete documents"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'mtop-documents');

-- Allow public read access (bucket is public)
CREATE POLICY "Public read access for documents"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'mtop-documents');
