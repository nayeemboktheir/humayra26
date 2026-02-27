-- Add domestic courier charge column to orders
ALTER TABLE public.orders 
ADD COLUMN domestic_courier_charge numeric DEFAULT 0;

-- Add a comment for clarity
COMMENT ON COLUMN public.orders.domestic_courier_charge IS 'China domestic courier charge (warehouse to warehouse). Can be auto-set or manually adjusted by admin.';