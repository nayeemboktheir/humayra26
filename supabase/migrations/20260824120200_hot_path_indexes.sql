-- Index the hot read paths.
--
-- Postgres does not auto-index foreign keys, so none of the 14 user_id columns were
-- indexed. Every dashboard list ("my orders", "my transactions", ...) was a sequential
-- scan plus an unindexed sort, and each RLS check re-probed user_roles per row.
--
-- Composite (user_id, created_at DESC) matches the exact shape of those queries:
--   .eq("user_id", user.id).order("created_at", { ascending: false })
-- so the filter and the sort are both satisfied by one index scan.

CREATE INDEX IF NOT EXISTS idx_orders_user_created
  ON public.orders (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_transactions_user_created
  ON public.transactions (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_shipments_user_created
  ON public.shipments (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_refunds_user_created
  ON public.refunds (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_user_created
  ON public.notifications (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_wishlist_user_created
  ON public.wishlist (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_cart_items_user_created
  ON public.cart_items (user_id, created_at DESC);

-- Messages are read oldest-first (chat order).
CREATE INDEX IF NOT EXISTS idx_admin_messages_user_created
  ON public.admin_messages (user_id, created_at);

-- Single-row lookups by user need no index here: profiles.user_id and wallets.user_id
-- already carry UNIQUE constraints (profiles_user_id_key, wallets_user_id_key), and a
-- UNIQUE constraint is backed by an index. Earlier revisions of this migration added
-- idx_profiles_user_id and idx_wallets_user_id, which duplicated those exactly — the
-- EXPLAIN plan just swapped one index name for the other at identical cost, while the
-- extra indexes still had to be maintained on every write. Dropped; do not re-add.

-- Admin list views sort the whole table by recency.
CREATE INDEX IF NOT EXISTS idx_profiles_created   ON public.profiles (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_created     ON public.orders (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_shipments_created  ON public.shipments (created_at DESC);

-- Homepage first query: ORDER BY updated_at DESC LIMIT 24 (was a seq scan + sort).
CREATE INDEX IF NOT EXISTS idx_trending_products_updated
  ON public.trending_products (updated_at DESC);

-- useRolePermissions filters on (role, can_access).
CREATE INDEX IF NOT EXISTS idx_role_permissions_role
  ON public.role_permissions (role, can_access);
