# Production cutover runbook

> **✅ STATUS: EXECUTED — 2026-09-21.** `tradeon.global` is live on the self-hosted stack.
> This document is kept as the record of what the cutover actually involved, not a plan
> for a future run. See "What actually happened" at the bottom for the two bugs found
> during execution that neither this runbook nor the rehearsal anticipated, and the data
> delta that had to be manually reconciled. If this stack is ever restored again
> (disaster recovery, a second environment, etc.), read that section first — both bugs
> will recur otherwise.

Moving `tradeon.global` from the Lovable-managed Supabase project onto the self-hosted
stack at `api.tradeon.global`.

Priority for this run is **user data protection**: no user, order, wallet, transaction or
auth record may be lost, and every customer must still be able to log in with their
existing password afterwards.

Read the whole thing before starting. Steps 1–3 are reversible. **Step 5 is not** — it
drops the public schema.

---

## What makes this run different from the rehearsal

The rehearsal (`SELFHOST-MIGRATION-REPORT.md`, 2026-09-17) restored a static dump and
verified counts. It did not cut over. Three things it did not cover:

1. **The self-hosted database is no longer empty or pristine.** It carries the rehearsal
   data plus 8 test orders made since, and — importantly — the `products` catalogue and
   `product_cache`, neither of which exists in production. A restore destroys them.
2. **Real login was never proven.** The rehearsal replaced a user's hash with a known one
   and logged in with that. It proved GoTrue can verify an externally-written `$2a$` hash;
   it did not prove a real customer's existing password works. That is the one thing that
   locks out 724 people if it is wrong, so it is a **gate** in step 8, not a post-check.
3. **Nothing backs up the self-hosted stack.** Step 2 creates the first one.

---

## 0. Before you start

- [ ] Nobody is mid-checkout. Payment credentials are live now, so an order placed during
      the window is a real order that will be lost by the restore.
- [ ] You have terminal access to the VPS and the Coolify UI open.
- [ ] Budget ~1–2h. Most of it is export and restore time.

Container and service names used below:

```
DB container   supabase-db-emhbzh3hwap5rmq6ysysloil
Coolify service  supabase   (uuid emhbzh3hwap5rmq6ysysloil)
```

---

## 1. Freeze writes on production

Put `tradeon.global` into maintenance, or otherwise stop new orders. Everything created
after this moment on the **old** backend is lost unless you re-export.

The plan deliberately chose a short stop-the-world window over dual-write. There is no
CDC and no delta-sync tooling — "re-export the delta" has never been rehearsed, so the
simplest safe approach is: freeze, export once, restore, cut over.

---

## 2. Back up what is already on the self-hosted stack

There is no existing backup. Make one before anything destructive.

```bash
ssh tanvir@72.61.248.65

# full safety net — everything currently on the self-hosted stack
sudo docker exec supabase-db-emhbzh3hwap5rmq6ysysloil \
  pg_dump -U postgres -d postgres -Fc \
  > ~/selfhost-pre-cutover-$(date +%Y%m%d-%H%M).backup

# the product catalogue specifically, data only — this is the piece that
# cannot be recovered from anywhere else. Production has never had this table.
sudo docker exec supabase-db-emhbzh3hwap5rmq6ysysloil \
  pg_dump -U postgres -d postgres --data-only --column-inserts \
  -t public.products \
  > ~/products-catalog-$(date +%Y%m%d-%H%M).sql

ls -lh ~/selfhost-pre-cutover-*.backup ~/products-catalog-*.sql
wc -l ~/products-catalog-*.sql    # expect roughly 1,100+ INSERT lines
```

Do not continue until both files exist and are non-trivial in size.

---

## 3. Export production

In Lovable: **Cloud → Advanced settings → Export project data**.

This produces a real `pg_dump` custom-format archive (the rehearsal's was 86.9 MB). This
is the validated mechanism — the older idea of exporting via MCP `query_database` was
superseded.

```bash
scp <downloaded>.backup tanvir@72.61.248.65:~/
```

⚠️ **That file contains every user's password hash.** Keep it off the repo, and shred it
when done (step 10).

---

## 4. Confirm the stack is ready to receive

`restore.sh` refuses to run if GoTrue has not migrated the auth schema yet — that check
exists because a half-migrated auth schema fails the restore midway and leaves a mess.

```bash
sudo docker ps --filter name=supabase --format '{{.Names}}\t{{.Status}}'
```

All containers healthy, `supabase-auth` in particular.

---

## 5. Restore  ⚠️ destructive from here

```bash
scp supabase/selfhost/restore.sh tanvir@72.61.248.65:~/     # if not already there
ssh tanvir@72.61.248.65
chmod +x restore.sh

sudo ./restore.sh ~/<production>.backup supabase-db-emhbzh3hwap5rmq6ysysloil --force
```

`--force` drops and recreates the public schema and truncates `auth.users`. That is what
removes the 8 test orders, the catalogue and `product_cache`.

It runs five passes in dependency order (auth.users → remaining auth → session-dependent
auth → public → the two auth.users triggers last, because those are AFTER INSERT row
triggers and COPY fires row triggers — creating them earlier produced 724 duplicate
profiles and wallets in testing).

`search_cache` is skipped deliberately (43k rows / 210 MB that rebuild from TMAPI). This
also discards the `imgtok:` / `ship:` / `seller:` cache entries — all of which rebuild on
demand.

**Read its verification block.** Expected: 18 tables · 12 functions · 13 triggers ·
64 policies · RLS 18 · 12 FKs · 724 users · 724 identities · ~909 orders · ~1579 shipments ·
724 profiles · 724 wallets · **0 orphans · 0 duplicates · 724/724 bcrypt**.

Counts for orders/shipments/users will be *higher* than those figures, since production has
kept trading since the rehearsal. What must be exact is **0 orphans, 0 duplicate profiles,
0 duplicate wallets, and bcrypt N/N**. Anything else — stop, read `restore.md`.

---

## 6. Put back what production never had

The restore leaves the database matching production, which means these are now missing.

```bash
# from your machine
scp supabase/migrations/20260824120000_product_detail_cache.sql \
    supabase/migrations/20260918150000_products_catalog.sql \
    supabase/migrations/20260918153000_products_view_counter.sql \
    tanvir@72.61.248.65:~/
```

```bash
# on the VPS — order matters, products before its view counter
for f in 20260824120000_product_detail_cache.sql \
         20260918150000_products_catalog.sql \
         20260918153000_products_view_counter.sql; do
  echo "== $f"
  sudo docker exec -i supabase-db-emhbzh3hwap5rmq6ysysloil \
    psql -U postgres -d postgres -v ON_ERROR_STOP=1 < ~/$f
done

# reload the catalogue captured in step 2
sudo docker exec -i supabase-db-emhbzh3hwap5rmq6ysysloil \
  psql -U postgres -d postgres -v ON_ERROR_STOP=1 < ~/products-catalog-*.sql
```

**Also check the shipment-stage function.** It was authored through Lovable, so production
probably has it and the dump will have carried it across — but it lives in
`drizzle/migrations/`, outside both documented SQL paths, so verify rather than assume:

```bash
sudo docker exec supabase-db-emhbzh3hwap5rmq6ysysloil psql -U postgres -d postgres -tAc \
  "select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.proname='set_order_shipment_stage';"
```

If that returns `0`, apply it:

```bash
scp drizzle/migrations/0000_canonical_order_shipments_and_atomic_status_updates.sql \
    tanvir@72.61.248.65:~/
sudo docker exec -i supabase-db-emhbzh3hwap5rmq6ysysloil \
  psql -U postgres -d postgres -v ON_ERROR_STOP=1 < ~/0000_canonical_order_shipments_and_atomic_status_updates.sql
```

---

## 7. Recreate the cron jobs

The dump carries `cron.job` rows pointing at the **old Lovable URL and anon JWT**, so
`restore.sh` deliberately does not restore them. Recreate against this stack:

```bash
scp supabase/selfhost/04_cron.sql supabase/selfhost/05_cron_price_refresh.sql \
    tanvir@72.61.248.65:~/

for f in 04_cron.sql 05_cron_price_refresh.sql; do
  sudo docker exec -i supabase-db-emhbzh3hwap5rmq6ysysloil psql -U postgres -d postgres \
    -v ON_ERROR_STOP=1 \
    -v base_url="https://api.tradeon.global" \
    -v anon_key='<SELFHOST_ANON_KEY>' < ~/$f
done
```

Expect 9 jobs listed at the end, all `active = t`.

---

## 8. 🚧 GATE — prove a real login works

**Do not proceed past this point until this passes.** This is the one assumption the
rehearsal could not prove, and the one that locks out every customer if it is wrong.

Log in on `trade.botbhai.net` (which already points at this stack) as a **real account
whose password you actually know** — yours or a staff member's. Not a freshly created
account; the whole question is whether *migrated* hashes verify.

- ✅ Login succeeds → the bcrypt hashes survived. Continue.
- ❌ Login fails → **stop and roll back (step 11).** Do not repoint production.

Also confirm while logged in: your order history is present, wallet balance is right.

---

## 9. Cut over

Only once step 8 has passed.

1. Point the production frontend at the new backend — `VITE_SUPABASE_URL` and
   `VITE_SUPABASE_PUBLISHABLE_KEY` in `.env` and in the GitHub Actions deploy secrets.
2. Redeploy the frontend (`.github/workflows/deploy.yml` → Hostinger).
3. **Update the PayStation callback/webhook URL** if it is configured merchant-side. The
   plan flags this as breaking payments *silently* if missed. Your flow passes
   `callback_url` per request, so this may be a no-op — verify rather than assume.
4. Lift maintenance.

Leave the Lovable project **running and untouched**. It is the rollback path.

---

## 10. Post-cutover

```bash
shred -u ~/<production>.backup        # it holds every password hash
```

- [ ] Place one real order end to end and confirm payment + shipment stage update.
- [ ] Watch `sudo docker logs -f supabase-edge-functions-emhbzh3hwap5rmq6ysysloil`.
- [ ] Rotate the PayStation password (it was exposed in a chat transcript) — and pick one
      without a `$`, which avoids the Coolify interpolation trap that produced
      `Invalid Credential.`
- [ ] Rotate the Supabase Studio dashboard credentials. `SELFHOST-MIGRATION-REPORT.md` §7
      lists this as the highest-priority outstanding item: Studio is internet-facing
      behind Basic auth and guards full SQL access.
- [ ] Set up backups of the self-hosted stack. There are none.
- [ ] Revoke `FIRECRAWL_API_KEY` on the Lovable project — the dead Firecrawl proxies are
      still deployed there, unauthenticated, and bill to your account.

---

## 11. Rollback

Neither existing document has an abort runbook. These are the two real paths:

**Before step 9 (nothing repointed):** production is still on Lovable and never stopped
working. Lift maintenance and walk away — the self-hosted stack simply stays as-is.

**After step 9:** restore the old `VITE_SUPABASE_*` values and redeploy the frontend. The
Lovable project is untouched and still holds all data, so this reverts cleanly — *provided*
no orders were placed against the new stack in between. Any that were exist only on
self-hosted and would need manual re-entry.

**If the restore itself fails midway:** the stack is in an unusable half-state. Reload
step 2's full backup:

```bash
sudo docker exec -i supabase-db-emhbzh3hwap5rmq6ysysloil \
  pg_restore -U postgres -d postgres --clean --if-exists \
  < ~/selfhost-pre-cutover-<timestamp>.backup
```

That returns you to pre-cutover state, at which point production is still live on Lovable
and nothing has been lost.

---

## What actually happened (2026-09-21)

Steps 1–9 ran as written and the restore itself (step 5) matched its expected verification
exactly on the first attempt: 0 orphans, 0 duplicate profiles, 0 duplicate wallets,
725/725 bcrypt hashes. Step 8's login gate passed on the first real account tested. None of
that is why this section exists — two problems surfaced that this runbook did not
anticipate, both silent, both would have gone unnoticed without deliberate checking.

### Bug 1 — the restore leaves the site completely broken, and nothing here would have caught it

After step 5's `--force` restore, **every table returned `403 permission denied` through
PostgREST, for every role, including `service_role`.** Not an RLS problem — no privilege to
attempt the operation at all. Root cause: `drop schema public cascade; create schema
public;` gives the schema a new identity, which orphans the `ALTER DEFAULT PRIVILEGES`
wiring that let `01_schema.sql`/`02_functions_rls.sql`'s tables inherit
`anon`/`authenticated`/`service_role` access automatically — the reason neither file ever
needed an explicit `GRANT`. `pg_restore --no-privileges` (correct, on its own — the dump's
grants target Lovable's roles, which don't exist here) means nothing puts it back.

**This went undetected through steps 6–8 of this exact runbook.** Every check performed —
the migration re-applies, the cron recreation, `set_order_shipment_stage`'s existence, even
step 8's login test — either ran as the `postgres` superuser via `psql` or went through
GoTrue directly, none of which touch the PostgREST grant path. It was only caught by
accident, checking Lovable for new orders during the delta-reconciliation step below, when
a `select` against the self-hosted `orders` table returned `42501` instead of the expected
empty/populated result.

**Fix, run immediately after any `--force` restore:**
[06_regrant_after_restore.sql](06_regrant_after_restore.sql). Its last query must return 0
rows — that is the actual proof the site works, not the restore's own verification block.
**Step 5 above should be read as incomplete without it.**

### Bug 2 — an unrelated merge had silently broken every deploy for days

Separately, `trade.botbhai.net`'s auto-deploy had been failing on **every push since a
branch merge landed several days earlier** — 4 consecutive failed builds, each looking like
an ordinary failed build in Coolify. Root cause: the merge introduced `vite-imagetools`
(pulling in `sharp`'s platform binaries) but its `bun.lock` was hand-merged rather than
regenerated, leaving `@img/sharp-wasm32`'s dependency on `@emnapi/runtime` half-written.
`bun install --frozen-lockfile` — what the Dockerfile runs — failed with
`InvalidPackageInfo: failed to parse lockfile`.

Consequence: the site had been serving a pre-merge build the entire time, meaning several
days of edge-function and frontend work never reached the running site despite every push
succeeding at the git level. This was only caught because step 9 of this runbook required
a real, current deploy to test against — a stale build would have made step 8's login gate
meaningless (testing old code, not what was about to go live) without anyone realizing it.

Fixed by deleting and regenerating `bun.lock` from `package.json`, verified against the
exact command the Dockerfile runs before pushing.

### Data delta at the freeze boundary

Step 1's write-freeze was not instantaneous — one order (`HT-MUA319UA`, unpaid) and its
trigger-created shipment landed on Lovable in the few minutes between the dump export and
the freeze taking effect. Found by diffing every user-data table's row count between
Lovable and the restored self-hosted database (not just `orders` — all nine tables were
checked individually, since a combined query timed out against Lovable's query tool).
Every other table matched exactly. Reconciled with a single manual `INSERT` into `orders`
(the customer's profile already existed from before the dump, so no cascading data was
needed) — the `auto_create_shipment` trigger created the matching shipment automatically.

**Lesson for a future run:** budget time to diff every table individually post-restore,
not just spot-check `orders`. It's what caught both the delta and, indirectly, Bug 1.
