
-- Table to cache category products (refreshed every 24 hours)
CREATE TABLE public.category_products (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  category_query TEXT NOT NULL,
  product_id TEXT NOT NULL,
  title TEXT NOT NULL,
  image_url TEXT NOT NULL,
  price NUMERIC NOT NULL DEFAULT 0,
  sales INTEGER,
  detail_url TEXT,
  location TEXT,
  vendor_name TEXT,
  stock INTEGER,
  weight NUMERIC,
  extra_images TEXT[],
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Index for fast lookups by category
CREATE INDEX idx_category_products_query ON public.category_products (category_query);

-- Unique constraint to avoid duplicate products per category
CREATE UNIQUE INDEX idx_category_products_unique ON public.category_products (category_query, product_id);

-- Enable RLS (public read, no user writes needed)
ALTER TABLE public.category_products ENABLE ROW LEVEL SECURITY;

-- Anyone can read cached products
CREATE POLICY "Category products are publicly readable"
  ON public.category_products
  FOR SELECT
  USING (true);

-- Trigger for updated_at
CREATE TRIGGER update_category_products_updated_at
  BEFORE UPDATE ON public.category_products
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
