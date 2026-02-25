
-- Add variant info and 1688 product ID to orders
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS variant_name text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS variant_id text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS product_1688_id text;
