-- Schedules the catalogue price refresh.
--
-- The products table keeps a product's record for as long as it stays useful, but ages its
-- price separately: alibaba-1688-item-get will only serve a catalogued product whose price
-- was verified within PRICE_MAX_AGE_DAYS (7). Without this job, every product simply falls
-- out of the fast path a week after it was last fetched and goes back to paying full
-- upstream cost on a customer's click. This is what keeps the catalogue in the fast path.
--
-- Same conventions as 04_cron.sql — URL and key come from psql variables so nothing secret
-- is committed:
--
--   psql "$DB_URL" -v ON_ERROR_STOP=1 \
--        -v base_url="https://api.tradeon.global" \
--        -v anon_key="$SUPABASE_ANON_KEY" \
--        -f 05_cron_price_refresh.sql
--
-- Hourly at :30, which keeps it clear of the 22:00–22:06 category refreshes. The job is
-- self-limiting rather than fixed-cost: it selects only products whose price is actually
-- stale, so when there is nothing to do it returns immediately having made no TMAPI calls
-- at all. A batch of 12 per run is ~288/day of capacity, far above the rate at which a
-- catalogue of this size ages, and small enough that a run cannot be cut short by the
-- runtime's wall-clock limit.

\set ON_ERROR_STOP on

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net  WITH SCHEMA extensions;

BEGIN;

-- Idempotent: re-running this file must not stack duplicate jobs.
SELECT cron.unschedule(jobname)
FROM cron.job
WHERE jobname IN ('refresh-product-prices');

SELECT cron.schedule('refresh-product-prices', '30 * * * *', format(
  $job$SELECT net.http_post(
    url := %L,
    headers := %L::jsonb,
    body := '{"limit":12}'::jsonb
  )$job$,
  :'base_url' || '/functions/v1/refresh-product-prices',
  json_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || :'anon_key')::text
));

COMMIT;

-- Parity check: expect the 8 jobs from 04_cron.sql plus this one, all active.
SELECT jobname, schedule, active FROM cron.job ORDER BY jobname;
