-- Increments a catalogued product's view counter.
--
-- Exists as a function because PostgREST cannot express `SET view_count = view_count + 1`
-- through the REST interface — a read-then-write from the edge function would both cost an
-- extra round trip and lose counts when two people open the same product at once.
--
-- Called on the serving path (deferred, after the response), so it is deliberately a single
-- cheap statement and never raises: a product open must not fail because a counter did.
CREATE OR REPLACE FUNCTION public.increment_product_views(_item_id text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.products
  SET view_count = view_count + 1
  WHERE item_id = _item_id;
$$;

REVOKE ALL ON FUNCTION public.increment_product_views(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.increment_product_views(text) TO service_role;
