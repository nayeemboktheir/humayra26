-- Create storage bucket for temporary image uploads (for OTAPI image search)
INSERT INTO storage.buckets (id, name, public) VALUES ('temp-images', 'temp-images', true);

-- Allow anyone to upload to temp-images bucket
CREATE POLICY "Anyone can upload temp images"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'temp-images');

-- Allow public read access
CREATE POLICY "Temp images are publicly accessible"
ON storage.objects FOR SELECT
USING (bucket_id = 'temp-images');

-- Allow deletion of temp images
CREATE POLICY "Anyone can delete temp images"
ON storage.objects FOR DELETE
USING (bucket_id = 'temp-images');
