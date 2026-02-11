
-- Table to store trending products, refreshed every 12 hours
CREATE TABLE public.trending_products (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id TEXT NOT NULL,
  title TEXT NOT NULL,
  image_url TEXT NOT NULL,
  price NUMERIC NOT NULL DEFAULT 0,
  old_price NUMERIC,
  sold BIGINT DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Allow public read access (no auth needed for trending)
ALTER TABLE public.trending_products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Trending products are publicly readable"
  ON public.trending_products
  FOR SELECT
  USING (true);

-- Only service role can insert/update/delete (via edge function)
CREATE POLICY "Service role can manage trending products"
  ON public.trending_products
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Trigger for updated_at
CREATE TRIGGER update_trending_products_updated_at
  BEFORE UPDATE ON public.trending_products
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
