CREATE UNIQUE INDEX IF NOT EXISTS shipments_one_row_per_order_idx
ON public.shipments (order_id)
WHERE order_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.set_order_shipment_stage(
  _order_id uuid,
  _stage text
)
RETURNS public.shipments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _shipment public.shipments;
  _user_id uuid;
  _order_status text;
BEGIN
  IF NOT public.is_staff(auth.uid()) THEN
    RAISE EXCEPTION 'Staff access required';
  END IF;

  IF _stage NOT IN (
    'Ordered',
    'Purchased From factory',
    'Shipped',
    'RCV CN Warehouse',
    'Dhaka Airport',
    'Dhaka Warehouse',
    'Delivered'
  ) THEN
    RAISE EXCEPTION 'Invalid shipment stage';
  END IF;

  SELECT user_id INTO _user_id
  FROM public.orders
  WHERE id = _order_id
  FOR UPDATE;

  IF _user_id IS NULL THEN
    RAISE EXCEPTION 'Order not found';
  END IF;

  INSERT INTO public.shipments (order_id, user_id, status)
  VALUES (_order_id, _user_id, _stage)
  ON CONFLICT (order_id) WHERE order_id IS NOT NULL
  DO UPDATE SET status = EXCLUDED.status
  RETURNING * INTO _shipment;

  _order_status := CASE
    WHEN _stage = 'Delivered' THEN 'delivered'
    WHEN _stage = 'Ordered' THEN 'pending'
    ELSE 'processing'
  END;

  UPDATE public.orders
  SET status = _order_status
  WHERE id = _order_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order status was not updated';
  END IF;

  RETURN _shipment;
END;
$$;

REVOKE ALL ON FUNCTION public.set_order_shipment_stage(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_order_shipment_stage(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_order_shipment_stage(uuid, text) TO service_role;