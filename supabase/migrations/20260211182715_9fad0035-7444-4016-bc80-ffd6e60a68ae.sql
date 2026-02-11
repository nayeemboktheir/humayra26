
-- Add stage_notes and external_tracking_url to shipments
ALTER TABLE public.shipments 
  ADD COLUMN IF NOT EXISTS stage_notes text,
  ADD COLUMN IF NOT EXISTS external_tracking_url text;
