-- Benchmark for 20260824120200_hot_path_indexes.sql.
-- Run BEFORE applying the migration, then again AFTER, and diff the output.
--
--   sudo docker exec -i supabase-db-emhbzh3hwap5rmq6ysysloil \
--     psql -U postgres -d postgres < bench-hot-paths.sql > before.txt
--
-- What to look for is the access method, not only the timing. At current volumes
-- (909 orders, 3,336 notifications, 1,919 cart_items) a sequential scan is already
-- quick, so wall-clock gains look modest — the point is that "Seq Scan + Sort"
-- becomes "Index Scan", which is what stops the page degrading as rows accumulate.
-- A Sort node with an explicit sort method is the tell: the index removes it.
--
-- RESULTS — self-hosted rehearsal stack, 2026-09-18, 909 orders / 3,336
-- notifications / 1,919 cart_items / 1,579 shipments / 816 wishlist:
--
--   query               before     after     plan change                   blocks
--   my cart             7.04 ms -> 0.07 ms   Seq Scan -> Bitmap Index Scan  200 -> 3
--   my notifications    2.38 ms -> 0.06 ms   Seq+Sort -> Index Scan          64 -> 6
--   my wishlist         1.82 ms -> 0.07 ms   Seq+Sort -> Index Scan          64 -> 3
--   my shipments        1.54 ms -> 0.11 ms   Seq+Sort -> Index Scan          22 -> 11
--   my transactions     1.00 ms -> 0.05 ms   Seq+Sort -> Index Scan           7 -> 3
--   my orders           0.83 ms -> 0.08 ms   Seq+Sort -> Index Scan         139 -> 21
--   admin orders list   0.64 ms -> 0.09 ms   Seq+Sort -> Index Scan         136 -> 46
--   admin users list    0.90 ms -> 0.15 ms   Seq+Sort -> Index Scan          12 -> 10
--
-- The cart query was reading 1,919 rows to return 1. Every Sort node disappeared:
-- the composite (user_id, created_at DESC) satisfies filter and ordering in one pass.
--
-- Two results in the raw output are NOT index wins, and should not be quoted as such:
-- trending_products (15 rows) and role_permissions (52 rows) still show Seq Scan after
-- the migration — correctly, the planner ignores an index at that size. Their timings
-- moved only because the pages were already in the buffer cache on the second run
-- (read=1 -> hit=1).

\pset pager off
\timing on

-- Use the busiest real user, so the planner sees a representative selectivity
-- rather than a user with two rows.
SELECT user_id AS uid
FROM public.orders
GROUP BY user_id
ORDER BY count(*) DESC
LIMIT 1 \gset

\echo ''
\echo '################ 1. my orders — .eq(user_id).order(created_at desc) ################'
EXPLAIN (ANALYZE, BUFFERS, COSTS OFF)
SELECT * FROM public.orders
WHERE user_id = :'uid' AND deleted_at IS NULL
ORDER BY created_at DESC
LIMIT 20;

\echo ''
\echo '################ 2. my notifications ################'
EXPLAIN (ANALYZE, BUFFERS, COSTS OFF)
SELECT * FROM public.notifications
WHERE user_id = :'uid'
ORDER BY created_at DESC
LIMIT 20;

\echo ''
\echo '################ 3. my shipments ################'
EXPLAIN (ANALYZE, BUFFERS, COSTS OFF)
SELECT * FROM public.shipments
WHERE user_id = :'uid'
ORDER BY created_at DESC
LIMIT 20;

\echo ''
\echo '################ 4. my cart ################'
EXPLAIN (ANALYZE, BUFFERS, COSTS OFF)
SELECT * FROM public.cart_items
WHERE user_id = :'uid'
ORDER BY created_at DESC;

\echo ''
\echo '################ 5. my wishlist ################'
EXPLAIN (ANALYZE, BUFFERS, COSTS OFF)
SELECT * FROM public.wishlist
WHERE user_id = :'uid'
ORDER BY created_at DESC;

\echo ''
\echo '################ 6. my transactions ################'
EXPLAIN (ANALYZE, BUFFERS, COSTS OFF)
SELECT * FROM public.transactions
WHERE user_id = :'uid'
ORDER BY created_at DESC;

\echo ''
\echo '################ 7. admin orders list — whole table by recency ################'
EXPLAIN (ANALYZE, BUFFERS, COSTS OFF)
SELECT * FROM public.orders
ORDER BY created_at DESC
LIMIT 50;

\echo ''
\echo '################ 8. admin users list ################'
EXPLAIN (ANALYZE, BUFFERS, COSTS OFF)
SELECT * FROM public.profiles
ORDER BY created_at DESC
LIMIT 50;

\echo ''
\echo '################ 9. homepage trending rail ################'
EXPLAIN (ANALYZE, BUFFERS, COSTS OFF)
SELECT * FROM public.trending_products
ORDER BY updated_at DESC
LIMIT 24;

\echo ''
\echo '################ 10. useRolePermissions ################'
EXPLAIN (ANALYZE, BUFFERS, COSTS OFF)
SELECT * FROM public.role_permissions
WHERE role = 'admin' AND can_access = true;

\echo ''
\echo '################ 11. profile + wallet single-row lookups ################'
EXPLAIN (ANALYZE, BUFFERS, COSTS OFF)
SELECT * FROM public.profiles WHERE user_id = :'uid';

EXPLAIN (ANALYZE, BUFFERS, COSTS OFF)
SELECT * FROM public.wallets WHERE user_id = :'uid';

\echo ''
\echo '################ index inventory ################'
SELECT tablename, indexname
FROM pg_indexes
WHERE schemaname = 'public'
ORDER BY tablename, indexname;

\echo ''
\echo '################ sequential vs index scan counters ################'
-- seq_scan climbing on these tables in normal use is the symptom the migration fixes.
SELECT relname,
       seq_scan, seq_tup_read,
       idx_scan, idx_tup_fetch,
       n_live_tup
FROM pg_stat_user_tables
WHERE schemaname = 'public'
  AND relname IN ('orders','notifications','shipments','cart_items','wishlist',
                  'transactions','profiles','wallets','trending_products','role_permissions')
ORDER BY seq_scan DESC;
