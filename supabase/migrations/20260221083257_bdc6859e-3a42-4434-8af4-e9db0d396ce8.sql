
-- Cache for search results (query + page → items JSON)
CREATE TABLE public.search_cache (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  query_key text NOT NULL,
  page integer NOT NULL DEFAULT 1,
  total_results integer NOT NULL DEFAULT 0,
  items jsonb NOT NULL DEFAULT '[]'::jsonb,
  translated boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(query_key, page)
);

-- Index for fast lookups
CREATE INDEX idx_search_cache_query_page ON public.search_cache (query_key, page);

-- Index for cleanup of old entries
CREATE INDEX idx_search_cache_created ON public.search_cache (created_at);

-- Enable RLS
ALTER TABLE public.search_cache ENABLE ROW LEVEL SECURITY;

-- Anyone can read cache (public search results)
CREATE POLICY "Search cache is publicly readable"
  ON public.search_cache FOR SELECT
  USING (true);

-- Only service role (edge functions) can write cache
CREATE POLICY "Service role can manage search cache"
  ON public.search_cache FOR ALL
  USING (auth.role() = 'service_role'::text)
  WITH CHECK (auth.role() = 'service_role'::text);

-- Auto-update timestamp
CREATE TRIGGER update_search_cache_updated_at
  BEFORE UPDATE ON public.search_cache
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
