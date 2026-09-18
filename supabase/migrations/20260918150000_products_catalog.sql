-- A durable product catalog, as opposed to the two short-lived caches that preceded it.
--
-- search_cache stores whole result PAGES keyed by query, so a product seen in a search is
-- not individually retrievable and disappears after 12h. product_cache stores detail keyed
-- by item_id but also expires after 12h, so it only ever holds products opened in the last
-- half day (31 rows at the time of writing). Neither accumulates.
--
-- This table does. Rows arrive in two tiers:
--   * listing tier  — written for every result of every search, from data the response
--                     already contains, so it costs no extra upstream call.
--   * detail tier   — written when someone actually opens the product.
-- Measured footprint: ~482 bytes per listing row, ~9.8 KB per detail row. Keeping detail
-- only for opened products is what keeps this affordable at scale.
--
-- Freshness is tracked per-concern rather than as one TTL. A product's title, images,
-- description and specs are effectively static; its price is not. Recording when the price
-- was last verified separately from when the detail was fetched means a stale price can be
-- refreshed on its own — an item_detail call, but one made in the background rather than
-- on the request the customer is waiting for — while the expensive parts of the record are
-- kept for far longer.

CREATE TABLE public.products (
  item_id text PRIMARY KEY,

  -- Listing tier: present for anything ever returned by a search.
  title text,
  pic_url text,
  price numeric,
  sales integer,
  location text,
  vendor_name text,

  -- Detail tier: the mapped ProductDetail1688 payload, only for opened products.
  detail jsonb,

  first_seen_at timestamp with time zone NOT NULL DEFAULT now(),
  listed_at timestamp with time zone,
  detail_fetched_at timestamp with time zone,
  price_checked_at timestamp with time zone,
  view_count integer NOT NULL DEFAULT 0,

  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Serving path: fetch one product, then decide from the timestamps whether its price needs
-- revalidating. Covered by the primary key.

-- Background price refresh: "products with detail whose price is older than N days,
-- most-viewed first".
CREATE INDEX idx_products_price_staleness
  ON public.products (price_checked_at NULLS FIRST)
  WHERE detail IS NOT NULL;

CREATE INDEX idx_products_view_count ON public.products (view_count DESC);

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

-- Service role only, deliberately — no public SELECT policy yet.
--
-- product_cache is publicly readable and holds the same shape of payload, but it is a 12h
-- window over recently-opened products (31 rows in practice). This table is the whole
-- catalog, permanently, which is a materially more attractive thing to scrape with a
-- publishable anon key. Nothing needs public read today: the functions that populate and
-- will serve it hold the service role. A read policy can be added with the read path, if
-- the frontend ends up querying it directly rather than through an edge function.
CREATE POLICY "Service role can manage products"
  ON public.products FOR ALL
  USING (auth.role() = 'service_role'::text)
  WITH CHECK (auth.role() = 'service_role'::text);

CREATE TRIGGER update_products_updated_at
  BEFORE UPDATE ON public.products
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
