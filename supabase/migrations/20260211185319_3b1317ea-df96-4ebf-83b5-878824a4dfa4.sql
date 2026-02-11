
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS product_url text,
  ADD COLUMN IF NOT EXISTS source_url text;
