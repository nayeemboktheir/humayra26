-- TradeOn Global — public schema, introspected from the live Lovable-managed
-- production database (kcihftfgmsrpcljsbjdj) on 2026-09-17.
--
-- This is NOT a replay of supabase/migrations/. Those files have drifted:
-- supabase_migrations.schema_migrations records 33 versions against 43 files,
-- three RPCs were applied by hand and never recorded, and the product_detail_cache
-- and rate_limits migrations were never applied at all. This file is what
-- production actually looks like, which is what the self-hosted target must match
-- before any parity check means anything.
--
-- Run against a fresh self-hosted Supabase stack, as postgres, AFTER the auth
-- schema exists (GoTrue must have run its own migrations first — there are FKs
-- to auth.users and two triggers on it).
--
--   psql "$DB_URL" -v ON_ERROR_STOP=1 -f 01_schema.sql
--
-- Pending migrations (hot_path_indexes, product_detail_cache, rate_limits, …) are
-- deliberately NOT included: the rehearsal loads a faithful copy of production
-- first, then applies them on top so their effect can be measured.

BEGIN;

SET search_path = public;

-- ---------------------------------------------------------------- extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp"        WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto           WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_stat_statements WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_net             WITH SCHEMA extensions;
-- pg_cron only installs into the database named by cron.database_name (postgres).
CREATE EXTENSION IF NOT EXISTS pg_cron            WITH SCHEMA pg_catalog;

-- --------------------------------------------------------------------- types
DO $$ BEGIN
  CREATE TYPE public.app_role AS ENUM ('admin', 'moderator', 'user', 'employee');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- -------------------------------------------------------------------- tables
CREATE TABLE public.admin_messages (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  subject text NOT NULL,
  message text NOT NULL,
  is_read boolean DEFAULT false NOT NULL,
  sent_by uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  order_id uuid,
  thread_id uuid,
  sender_role text DEFAULT 'admin'::text NOT NULL
);

CREATE TABLE public.app_settings (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  key text NOT NULL,
  value text NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_by uuid
);

CREATE TABLE public.cart_items (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  product_id text NOT NULL,
  product_name text NOT NULL,
  product_image text,
  product_url text,
  source_url text,
  variant_id text,
  variant_name text,
  unit_price numeric DEFAULT 0 NOT NULL,
  quantity integer DEFAULT 1 NOT NULL,
  domestic_shipping_fee numeric DEFAULT 0,
  seller_name text,
  sku_details jsonb DEFAULT '[]'::jsonb,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.category_products (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  category_query text NOT NULL,
  product_id text NOT NULL,
  title text NOT NULL,
  image_url text NOT NULL,
  price numeric DEFAULT 0 NOT NULL,
  sales integer,
  detail_url text,
  location text,
  vendor_name text,
  stock integer,
  weight numeric,
  extra_images text[],
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.notifications (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  title text NOT NULL,
  message text NOT NULL,
  type text DEFAULT 'info'::text NOT NULL,
  is_read boolean DEFAULT false NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.orders (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  order_number text NOT NULL,
  product_name text NOT NULL,
  product_image text,
  quantity integer DEFAULT 1 NOT NULL,
  unit_price numeric(12,2) DEFAULT 0 NOT NULL,
  total_price numeric(12,2) DEFAULT 0 NOT NULL,
  status text DEFAULT 'pending'::text NOT NULL,
  tracking_number text,
  notes text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  product_url text,
  source_url text,
  shipping_charges numeric DEFAULT 0,
  commission numeric DEFAULT 0,
  variant_name text,
  variant_id text,
  product_1688_id text,
  domestic_courier_charge numeric DEFAULT 0,
  invoice_name text,
  payment_status text DEFAULT 'unpaid'::text NOT NULL,
  payment_method text,
  payment_trx_id text,
  payment_amount numeric DEFAULT 0,
  payment_invoice text,
  deleted_at timestamp with time zone
);

CREATE TABLE public.phone_otps (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  phone text NOT NULL,
  otp_code text NOT NULL,
  expires_at timestamp with time zone NOT NULL,
  verified boolean DEFAULT false NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.profiles (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  full_name text,
  phone text,
  address text,
  avatar_url text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.refunds (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  order_id uuid,
  amount numeric(12,2) NOT NULL,
  reason text,
  status text DEFAULT 'pending'::text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.role_permissions (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  role public.app_role NOT NULL,
  page_key text NOT NULL,
  can_access boolean DEFAULT false NOT NULL
);

CREATE TABLE public.search_cache (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  query_key text NOT NULL,
  page integer DEFAULT 1 NOT NULL,
  total_results integer DEFAULT 0 NOT NULL,
  items jsonb DEFAULT '[]'::jsonb NOT NULL,
  translated boolean DEFAULT false NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.shipments (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  order_id uuid,
  tracking_number text,
  carrier text,
  status text DEFAULT 'processing'::text NOT NULL,
  estimated_delivery timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  stage_notes text,
  external_tracking_url text
);

CREATE TABLE public.sms_logs (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  phone text NOT NULL,
  message text NOT NULL,
  sms_type text DEFAULT 'manual'::text NOT NULL,
  status text DEFAULT 'sent'::text NOT NULL,
  response text,
  user_id uuid,
  sent_by uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.transactions (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  type text NOT NULL,
  amount numeric(12,2) NOT NULL,
  description text,
  reference_id text,
  status text DEFAULT 'completed'::text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.trending_products (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  product_id text NOT NULL,
  title text NOT NULL,
  image_url text NOT NULL,
  price numeric DEFAULT 0 NOT NULL,
  old_price numeric,
  sold bigint DEFAULT 0,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.user_roles (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  role public.app_role NOT NULL
);

CREATE TABLE public.wallets (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  balance numeric(12,2) DEFAULT 0 NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.wishlist (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  product_id text NOT NULL,
  product_name text NOT NULL,
  product_image text,
  product_price numeric(12,2),
  product_url text,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

-- ----------------------------------------------------- primary / unique keys
ALTER TABLE public.admin_messages ADD CONSTRAINT admin_messages_pkey PRIMARY KEY (id);
ALTER TABLE public.app_settings ADD CONSTRAINT app_settings_pkey PRIMARY KEY (id);
ALTER TABLE public.cart_items ADD CONSTRAINT cart_items_pkey PRIMARY KEY (id);
ALTER TABLE public.category_products ADD CONSTRAINT category_products_pkey PRIMARY KEY (id);
ALTER TABLE public.notifications ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);
ALTER TABLE public.orders ADD CONSTRAINT orders_pkey PRIMARY KEY (id);
ALTER TABLE public.phone_otps ADD CONSTRAINT phone_otps_pkey PRIMARY KEY (id);
ALTER TABLE public.profiles ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);
ALTER TABLE public.refunds ADD CONSTRAINT refunds_pkey PRIMARY KEY (id);
ALTER TABLE public.role_permissions ADD CONSTRAINT role_permissions_pkey PRIMARY KEY (id);
ALTER TABLE public.search_cache ADD CONSTRAINT search_cache_pkey PRIMARY KEY (id);
ALTER TABLE public.shipments ADD CONSTRAINT shipments_pkey PRIMARY KEY (id);
ALTER TABLE public.sms_logs ADD CONSTRAINT sms_logs_pkey PRIMARY KEY (id);
ALTER TABLE public.transactions ADD CONSTRAINT transactions_pkey PRIMARY KEY (id);
ALTER TABLE public.trending_products ADD CONSTRAINT trending_products_pkey PRIMARY KEY (id);
ALTER TABLE public.user_roles ADD CONSTRAINT user_roles_pkey PRIMARY KEY (id);
ALTER TABLE public.wallets ADD CONSTRAINT wallets_pkey PRIMARY KEY (id);
ALTER TABLE public.wishlist ADD CONSTRAINT wishlist_pkey PRIMARY KEY (id);

ALTER TABLE public.app_settings ADD CONSTRAINT app_settings_key_key UNIQUE (key);
ALTER TABLE public.profiles ADD CONSTRAINT profiles_user_id_key UNIQUE (user_id);
ALTER TABLE public.role_permissions ADD CONSTRAINT role_permissions_role_page_key_key UNIQUE (role, page_key);
ALTER TABLE public.search_cache ADD CONSTRAINT search_cache_query_key_page_key UNIQUE (query_key, page);
ALTER TABLE public.user_roles ADD CONSTRAINT user_roles_user_id_role_key UNIQUE (user_id, role);
ALTER TABLE public.wallets ADD CONSTRAINT wallets_user_id_key UNIQUE (user_id);

-- ------------------------------------------------------------- foreign keys
-- Nine of these point at auth.users, which is why 02_data.sql loads auth first.
ALTER TABLE public.admin_messages ADD CONSTRAINT admin_messages_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE SET NULL;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.orders ADD CONSTRAINT orders_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.refunds ADD CONSTRAINT refunds_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;
ALTER TABLE public.refunds ADD CONSTRAINT refunds_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.shipments ADD CONSTRAINT shipments_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE SET NULL;
ALTER TABLE public.shipments ADD CONSTRAINT shipments_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.transactions ADD CONSTRAINT transactions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.user_roles ADD CONSTRAINT user_roles_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.wallets ADD CONSTRAINT wallets_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.wishlist ADD CONSTRAINT wishlist_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- ------------------------------------------------------------------ indexes
CREATE INDEX idx_admin_messages_order ON public.admin_messages USING btree (order_id);
CREATE INDEX idx_admin_messages_user_thread ON public.admin_messages USING btree (user_id, thread_id, created_at);
CREATE INDEX idx_category_products_query ON public.category_products USING btree (category_query);
CREATE INDEX idx_category_products_query_created ON public.category_products USING btree (category_query, created_at);
CREATE UNIQUE INDEX idx_category_products_unique ON public.category_products USING btree (category_query, product_id);
CREATE INDEX orders_deleted_at_idx ON public.orders USING btree (deleted_at);
CREATE INDEX idx_phone_otps_expires ON public.phone_otps USING btree (expires_at);
CREATE INDEX idx_phone_otps_phone ON public.phone_otps USING btree (phone);
CREATE INDEX idx_search_cache_created ON public.search_cache USING btree (created_at);
CREATE INDEX idx_search_cache_query_page ON public.search_cache USING btree (query_key, page);
CREATE INDEX idx_shipments_status ON public.shipments USING btree (status);
CREATE INDEX sms_logs_created_at_idx ON public.sms_logs USING btree (created_at DESC);
CREATE INDEX idx_user_roles_user_id ON public.user_roles USING btree (user_id);

COMMIT;
