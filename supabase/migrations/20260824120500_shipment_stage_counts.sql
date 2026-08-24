-- Per-stage shipment counts as a single aggregate.
--
-- AdminShipments rendered "Stage (n)" badges by loading every shipment row and
-- counting client-side. One GROUP BY replaces that whole transfer.
CREATE OR REPLACE FUNCTION public.get_shipment_stage_counts()
RETURNS TABLE (status text, count bigint)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT s.status, count(*)::bigint
  FROM public.shipments s
  GROUP BY s.status
$$;

GRANT EXECUTE ON FUNCTION public.get_shipment_stage_counts() TO authenticated;

-- Backs both the aggregate and the status filter on the admin list.
CREATE INDEX IF NOT EXISTS idx_shipments_status ON public.shipments (status);
