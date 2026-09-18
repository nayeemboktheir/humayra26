# Move the project onto your own database

You want the kind of connection shown in your screenshot: a direct Postgres connection string with a password you control. That is only possible when the database belongs to your own Supabase account. Right now the backend is Lovable Cloud, where the database password and direct connection string are not handed out.

So the plan is to move everything — data, logins, files, settings and background functions — to a Supabase project you own.

## What you need to do first

1. Create a free Supabase account and a new project (choose a region close to Bangladesh, e.g. Singapore).
2. Note the database password you set when creating it — that is the password in the connection string you want.
3. Tell me when it exists, and connect it to this project from the Lovable settings.

## What I will do once your project is connected

1. Export the full current schema: all tables (profiles, user_roles, role_permissions, app_settings, wallets, transactions, cart_items, orders, shipments, refunds, notifications, admin_messages, wishlist, phone_otps, sms_logs, search_cache, category_products, trending_products), enums, functions, triggers, grants and row-level-security policies.
2. Recreate all of it in your new database.
3. Copy the existing rows across, keeping the same IDs so orders stay linked to customers.
4. Move the user accounts so existing customers keep their logins.
5. Recreate the storage buckets (image-search, temp-images, database_export_17_09_26) and copy their files.
6. Re-deploy all backend functions (search, image search, shipping fee, payment, SMS/OTP, invoice email, etc.) to your project.
7. Re-enter the secret keys (TMAPI, PayStation, Resend, BulkSMS, Firecrawl) in the new project. I cannot read the current values, so you will need to supply any you do not have on hand.
8. Point the app at the new database and re-test: login by phone and email, search, product page, cart, checkout/payment, admin panel, shipment stage updates and SMS.

## Things worth knowing before we start

- Lovable Cloud cannot be removed from this project; the app will simply stop using it once it points at your database. Your current data stays there as a fallback until you are happy with the move.
- Plan a quiet window for the switchover. Anything a customer does on the old database after the data copy will not appear on the new one, so we should copy, switch and verify in one session.
- Payment callbacks and the SMS gateway need to point at the new backend address; I will update those and you may need to confirm the new callback URL with PayStation.
- After the move, you get exactly what your screenshot shows: a direct `postgresql://...` connection string with your own password, usable from any external tool.

## Technical notes

- Schema transfer as a single ordered SQL script: types → tables → grants → RLS enable → policies → functions → triggers.
- Auth users migrated with identities preserved so `auth.uid()` values and all `user_id` foreign references remain valid.
- `src/integrations/supabase/client.ts` and the environment values are regenerated for the new project; edge functions redeployed with `verify_jwt` flags matching the current `supabase/config.toml`.
- pg_cron job for the daily trending-products refresh must be recreated in the new project.
