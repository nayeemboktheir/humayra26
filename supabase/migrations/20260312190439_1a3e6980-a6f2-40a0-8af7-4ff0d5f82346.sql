
ALTER TABLE public.orders 
ADD COLUMN IF NOT EXISTS payment_status text NOT NULL DEFAULT 'unpaid',
ADD COLUMN IF NOT EXISTS payment_method text,
ADD COLUMN IF NOT EXISTS payment_trx_id text,
ADD COLUMN IF NOT EXISTS payment_amount numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS payment_invoice text;
