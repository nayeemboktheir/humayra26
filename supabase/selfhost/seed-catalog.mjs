#!/usr/bin/env node
/**
 * Seeds the `products` catalog so the read path has coverage without waiting for traffic.
 *
 * Two passes:
 *   listings — runs searches, which populates the listing tier for ~20 products each.
 *              Cheap: one TMAPI call per query/page.
 *   details  — opens catalogued products that have no detail yet, which is what actually
 *              makes a product page instant. Costs one TMAPI item_detail call each, so it
 *              is bounded by --limit and ordered by view_count (most-looked-at first).
 *
 * Usage (from the repo root, with .env present):
 *   node supabase/selfhost/seed-catalog.mjs --listings            # default query set
 *   node supabase/selfhost/seed-catalog.mjs --listings --queries "brass lamp,silk tie"
 *   node supabase/selfhost/seed-catalog.mjs --details --limit 200
 *   node supabase/selfhost/seed-catalog.mjs --listings --details --limit 500
 *
 * Flags: --pages N (search pages per query, default 1), --concurrency N (default 4).
 *
 * Re-running is safe: listings upsert, and the detail pass only picks rows still missing
 * detail, so an interrupted run resumes where it left off.
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

function loadEnv() {
  const text = readFileSync(resolve(repoRoot, '.env'), 'utf8');
  const env = {};
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m) env[m[1]] = m[2].replace(/^"|"$/g, '');
  }
  return env;
}

const env = loadEnv();
const BASE = env.SELFHOST_SUPABASE_URL;
const ANON = env.SELFHOST_ANON_KEY;
const SRK = env.SELFHOST_SERVICE_ROLE_KEY;
if (!BASE || !ANON || !SRK) {
  console.error('Missing SELFHOST_SUPABASE_URL / SELFHOST_ANON_KEY / SELFHOST_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}

const args = process.argv.slice(2);
const has = (f) => args.includes(f);
const val = (f, d) => {
  const i = args.indexOf(f);
  return i >= 0 && args[i + 1] ? args[i + 1] : d;
};

const DO_LISTINGS = has('--listings');
const DO_DETAILS = has('--details');
const LIMIT = parseInt(val('--limit', '200'), 10);
const PAGES = parseInt(val('--pages', '1'), 10);
const CONCURRENCY = parseInt(val('--concurrency', '4'), 10);

if (!DO_LISTINGS && !DO_DETAILS) {
  console.error('Nothing to do — pass --listings and/or --details. See the header for usage.');
  process.exit(1);
}

// Mirrors the storefront's own category set, so seeding covers what customers actually browse.
const DEFAULT_QUERIES = [
  'shoes', 'bag', 'jewelry', 'beauty products', 'men clothing', 'women clothing',
  'baby items', 'eyewear sunglasses', 'office supplies', 'phone accessories',
  'sports fitness', 'watches', 'automobile accessories', 'pet supplies',
  'outdoor travelling', 'electronics gadgets', 'kitchen gadgets',
  'tools home improvement', 'school supplies', 'home decor',
];

const fnHeaders = { 'Content-Type': 'application/json', apikey: ANON, Authorization: `Bearer ${ANON}` };
const restHeaders = { apikey: SRK, Authorization: `Bearer ${SRK}` };

async function callFn(name, body) {
  const resp = await fetch(`${BASE}/functions/v1/${name}`, {
    method: 'POST', headers: fnHeaders, body: JSON.stringify(body),
  });
  return resp.json().catch(() => null);
}

async function catalogCount(filter = '') {
  const resp = await fetch(`${BASE}/rest/v1/products?select=item_id${filter}&limit=1`, {
    headers: { ...restHeaders, Prefer: 'count=exact' },
  });
  return Number((resp.headers.get('content-range') || '/0').split('/')[1] || 0);
}

/** Runs `tasks` with a fixed worker pool, so upstream sees steady load rather than a burst. */
async function pool(tasks, size) {
  const queue = [...tasks];
  let done = 0;
  const workers = Array.from({ length: Math.min(size, queue.length) }, async () => {
    for (;;) {
      const task = queue.shift();
      if (!task) return;
      await task();
      done++;
      if (done % 10 === 0 || done === tasks.length) {
        process.stdout.write(`\r  progress: ${done}/${tasks.length}`);
      }
    }
  });
  await Promise.all(workers);
  process.stdout.write('\n');
}

async function seedListings() {
  const queries = val('--queries', '') ? val('--queries', '').split(',').map((s) => s.trim()).filter(Boolean) : DEFAULT_QUERIES;
  const jobs = [];
  for (const q of queries) {
    for (let page = 1; page <= PAGES; page++) jobs.push({ q, page });
  }
  console.log(`\n== Listing pass: ${queries.length} queries x ${PAGES} page(s) = ${jobs.length} searches`);
  const before = await catalogCount();

  let failed = 0;
  await pool(jobs.map(({ q, page }) => async () => {
    const r = await callFn('alibaba-1688-cached-search', { query: q, page, pageSize: 20 });
    if (!r?.success) failed++;
  }), CONCURRENCY);

  // The catalog write is deferred past the response, so give it a moment to land.
  await new Promise((r) => setTimeout(r, 3000));
  const after = await catalogCount();
  console.log(`  products: ${before} -> ${after}  (+${after - before})${failed ? `, ${failed} search(es) failed` : ''}`);
}

async function seedDetails() {
  console.log(`\n== Detail pass: up to ${LIMIT} products missing detail, most-viewed first`);
  const resp = await fetch(
    `${BASE}/rest/v1/products?select=item_id&detail=is.null&order=view_count.desc&limit=${LIMIT}`,
    { headers: restHeaders },
  );
  const rows = await resp.json();
  if (!Array.isArray(rows) || rows.length === 0) {
    console.log('  nothing to do — every catalogued product already has detail');
    return;
  }
  console.log(`  ${rows.length} to fetch (1 TMAPI item_detail call each)`);
  const before = await catalogCount('&detail=not.is.null');

  let failed = 0;
  const t0 = Date.now();
  await pool(rows.map((row) => async () => {
    const r = await callFn('alibaba-1688-item-get', { numIid: row.item_id });
    if (!r?.success) failed++;
  }), CONCURRENCY);

  await new Promise((r) => setTimeout(r, 3000));
  const after = await catalogCount('&detail=not.is.null');
  const secs = ((Date.now() - t0) / 1000).toFixed(0);
  console.log(`  with detail: ${before} -> ${after}  (+${after - before}) in ${secs}s${failed ? `, ${failed} failed` : ''}`);
}

(async () => {
  console.log(`Target: ${BASE}`);
  console.log(`Catalog before: ${await catalogCount()} products (${await catalogCount('&detail=not.is.null')} with detail)`);
  if (DO_LISTINGS) await seedListings();
  if (DO_DETAILS) await seedDetails();
  console.log(`\nCatalog now: ${await catalogCount()} products (${await catalogCount('&detail=not.is.null')} with detail)`);
})();
