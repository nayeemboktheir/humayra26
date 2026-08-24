-- Cache for 1688 product detail payloads (item_id → mapped detail JSON).
-- alibaba-1688-item-get previously hit TMAPI (plus a second fetch of the 1688 detail
-- page) on every product open, uncached. Trending products are opened by every
-- visitor, so the same payload was re-fetched constantly.
CREATE TABLE public.product_cache (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  item_id text NOT NULL,
  detail jsonb NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(item_id)
);

-- Lookup path: item_id + freshness check on updated_at
CREATE INDEX idx_product_cache_item_updated ON public.product_cache (item_id, updated_at DESC);

-- Index for cleanup of old entries
CREATE INDEX idx_product_cache_created ON public.product_cache (created_at);

ALTER TABLE public.product_cache ENABLE ROW LEVEL SECURITY;

-- Anyone can read cache (public product data)
CREATE POLICY "Product cache is publicly readable"
  ON public.product_cache FOR SELECT
  USING (true);

-- Only service role (edge functions) can write cache
CREATE POLICY "Service role can manage product cache"
  ON public.product_cache FOR ALL
  USING (auth.role() = 'service_role'::text)
  WITH CHECK (auth.role() = 'service_role'::text);

CREATE TRIGGER update_product_cache_updated_at
  BEFORE UPDATE ON public.product_cache
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
