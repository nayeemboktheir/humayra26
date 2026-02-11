
-- Add shipping charges and commission columns to orders
ALTER TABLE public.orders ADD COLUMN shipping_charges numeric DEFAULT 0;
ALTER TABLE public.orders ADD COLUMN commission numeric DEFAULT 0;
