-- TradeOn Global — the 8 scheduled jobs, rebuilt for the self-hosted stack.
--
-- These exist in production only as rows in cron.job. They are in no migration
-- file, which is why the previous plan called them "invisible": lose them and
-- the homepage's category rails quietly go stale over days with nothing failing.
-- This file is the version-controlled copy. Captured from production 2026-09-17.
--
-- Two things are rewritten versus production:
--   * the project URL, which was hardcoded to kcihftfgmsrpcljsbjdj.supabase.co
--   * the bearer token, which was that project's anon JWT, pasted inline
--
-- Both now come from psql variables so no key is committed:
--
--   psql "$DB_URL" -v ON_ERROR_STOP=1 \
--        -v base_url="https://api.tradeon.global" \
--        -v anon_key="$SUPABASE_ANON_KEY" \
--        -f 04_cron.sql
--
-- Schedules are UTC and match production exactly (22:00-22:06 daily, one
-- category group per minute so seven TMAPI refreshes never run concurrently).

\set ON_ERROR_STOP on

BEGIN;

-- Idempotent: unschedule first so re-running this file does not stack duplicates.
SELECT cron.unschedule(jobname)
FROM cron.job
WHERE jobname IN (
  'refresh-cat-shoes', 'refresh-cat-beauty', 'refresh-cat-baby',
  'refresh-cat-seasonal', 'refresh-cat-entertainment', 'refresh-cat-pet',
  'refresh-cat-kitchen', 'refresh-trending-daily'
);

SELECT cron.schedule('refresh-cat-shoes', '0 22 * * *', format(
  $job$SELECT net.http_post(
    url := %L,
    headers := %L::jsonb,
    body := '{"categories":["shoes","bag","jewelry"]}'::jsonb
  )$job$,
  :'base_url' || '/functions/v1/refresh-category-products',
  json_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || :'anon_key')::text
));

SELECT cron.schedule('refresh-cat-beauty', '1 22 * * *', format(
  $job$SELECT net.http_post(
    url := %L,
    headers := %L::jsonb,
    body := '{"categories":["beauty products","men clothing","women clothing"]}'::jsonb
  )$job$,
  :'base_url' || '/functions/v1/refresh-category-products',
  json_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || :'anon_key')::text
));

SELECT cron.schedule('refresh-cat-baby', '2 22 * * *', format(
  $job$SELECT net.http_post(
    url := %L,
    headers := %L::jsonb,
    body := '{"categories":["baby items","eyewear sunglasses","office supplies"]}'::jsonb
  )$job$,
  :'base_url' || '/functions/v1/refresh-category-products',
  json_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || :'anon_key')::text
));

SELECT cron.schedule('refresh-cat-seasonal', '3 22 * * *', format(
  $job$SELECT net.http_post(
    url := %L,
    headers := %L::jsonb,
    body := '{"categories":["seasonal products","phone accessories","sports fitness"]}'::jsonb
  )$job$,
  :'base_url' || '/functions/v1/refresh-category-products',
  json_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || :'anon_key')::text
));

SELECT cron.schedule('refresh-cat-entertainment', '4 22 * * *', format(
  $job$SELECT net.http_post(
    url := %L,
    headers := %L::jsonb,
    body := '{"categories":["entertainment","watches","automobile accessories"]}'::jsonb
  )$job$,
  :'base_url' || '/functions/v1/refresh-category-products',
  json_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || :'anon_key')::text
));

SELECT cron.schedule('refresh-cat-pet', '5 22 * * *', format(
  $job$SELECT net.http_post(
    url := %L,
    headers := %L::jsonb,
    body := '{"categories":["pet supplies","outdoor travelling","electronics gadgets"]}'::jsonb
  )$job$,
  :'base_url' || '/functions/v1/refresh-category-products',
  json_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || :'anon_key')::text
));

SELECT cron.schedule('refresh-cat-kitchen', '6 22 * * *', format(
  $job$SELECT net.http_post(
    url := %L,
    headers := %L::jsonb,
    body := '{"categories":["kitchen gadgets","tools home improvement","school supplies"]}'::jsonb
  )$job$,
  :'base_url' || '/functions/v1/refresh-category-products',
  json_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || :'anon_key')::text
));

SELECT cron.schedule('refresh-trending-daily', '0 22 * * *', format(
  $job$SELECT net.http_post(
    url := %L,
    headers := %L::jsonb,
    body := '{"time":"scheduled"}'::jsonb
  )$job$,
  :'base_url' || '/functions/v1/refresh-trending-products',
  json_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || :'anon_key')::text
));

COMMIT;

-- Parity check: expect 8 rows, all active.
SELECT jobname, schedule, active FROM cron.job ORDER BY jobname;
