-- Return the top N products per category in ONE round trip.
--
-- The homepage previously issued two paged select("*") calls spanning rows 0-1999 of
-- category_products, then grouped them client-side — even though CategorySection only
-- ever renders the first 12 rows of each category. That is ~2000 rows transferred to
-- display ~252.
CREATE OR REPLACE FUNCTION public.get_category_products(_limit_per_category integer DEFAULT 12)
RETURNS TABLE (
  category_query text,
  product_id text,
  title text,
  image_url text,
  price numeric,
  sales integer,
  detail_url text,
  location text,
  vendor_name text,
  stock integer,
  weight numeric,
  extra_images text[]
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT category_query, product_id, title, image_url, price, sales,
         detail_url, location, vendor_name, stock, weight, extra_images
  FROM (
    SELECT cp.*,
           ROW_NUMBER() OVER (PARTITION BY cp.category_query ORDER BY cp.created_at ASC) AS rn
    FROM public.category_products cp
  ) ranked
  WHERE rn <= GREATEST(_limit_per_category, 1)
  ORDER BY category_query, rn
$$;

GRANT EXECUTE ON FUNCTION public.get_category_products(integer) TO anon, authenticated;

-- Supports the PARTITION BY / ORDER BY above.
CREATE INDEX IF NOT EXISTS idx_category_products_query_created
  ON public.category_products (category_query, created_at);
