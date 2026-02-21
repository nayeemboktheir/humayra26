-- Create storage bucket for image search uploads
INSERT INTO storage.buckets (id, name, public) VALUES ('image-search', 'image-search', true)
ON CONFLICT (id) DO NOTHING;

-- Allow public read access
CREATE POLICY "Public read access for image search"
ON storage.objects FOR SELECT
USING (bucket_id = 'image-search');

-- Allow service role to upload
CREATE POLICY "Service role can upload image search files"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'image-search');

-- Allow service role to delete image search files
CREATE POLICY "Service role can delete image search files"
ON storage.objects FOR DELETE
USING (bucket_id = 'image-search');
