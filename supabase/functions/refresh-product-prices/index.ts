import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { mapDetail } from '../_shared/map-detail.ts';

// Re-verifies the price of catalogued products whose price has gone stale, so the serving
// path can keep answering from the catalog instead of falling back to a live fetch.
//
// A product's description, specs, images and variant structure are effectively static; its
// price is not. This refreshes only what moves: the whole record is re-derived from a fresh
// item_detail call, then the two fields that cost a separate upstream request each —
// scraped description images and the shop's product count — are carried over from the
// stored copy rather than re-fetched. That is what makes this cheap enough to run on a
// schedule.
//
// TMAPI has no price-only endpoint (checked against the API docs), so a refresh is still
// one item_detail call per product. The saving is in skipping enrichment and in running
// here rather than on a request a customer is waiting for.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const TMAPI_BASE = 'https://api.tmapi.top/1688';
const TMAPI_TIMEOUT_MS = 12000;
const PRICE_MAX_AGE_DAYS = 7;
// Deliberately small. This runtime kills isolates that run too long after responding, and
// the job is scheduled often enough that a big batch buys nothing — it only raises the
// chance of being cut off mid-way.
const DEFAULT_BATCH = 12;
const MAX_BATCH = 40;
const CONCURRENCY = 3;

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/** Runs tasks with a fixed worker pool so a batch never bursts at the upstream. */
async function pool<T>(items: T[], size: number, fn: (item: T) => Promise<void>) {
  const queue = [...items];
  await Promise.all(Array.from({ length: Math.min(size, queue.length) }, async () => {
    for (;;) {
      const next = queue.shift();
      if (next === undefined) return;
      await fn(next);
    }
  }));
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const apiToken = Deno.env.get('TMAPI_TOKEN');
    if (!apiToken) {
      return new Response(JSON.stringify({ success: false, error: 'TMAPI_TOKEN not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    let body: any = {};
    try { body = await req.json(); } catch { /* cron posts an empty-ish body */ }
    const limit = Math.min(Math.max(parseInt(String(body?.limit ?? DEFAULT_BATCH), 10) || DEFAULT_BATCH, 1), MAX_BATCH);
    // `>= 0`, not `> 0`: maxAgeDays:0 means "treat everything as stale", which is the
    // override you actually want when verifying this by hand. Testing for `> 0` silently
    // swallowed it and fell back to the 7-day window, so a forced run reported
    // "no stale prices" and looked like the job was broken.
    const rawMaxAge = Number(body?.maxAgeDays);
    const maxAgeDays = Number.isFinite(rawMaxAge) && rawMaxAge >= 0 ? rawMaxAge : PRICE_MAX_AGE_DAYS;

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Most-viewed first: if the backlog is ever longer than the schedule can drain, the
    // products customers actually open are the ones kept fresh.
    const cutoff = new Date(Date.now() - maxAgeDays * 24 * 60 * 60 * 1000).toISOString();
    const { data: rows, error: readError } = await supabase
      .from('products')
      .select('item_id, detail')
      .not('detail', 'is', null)
      .or(`price_checked_at.is.null,price_checked_at.lt.${cutoff}`)
      .order('view_count', { ascending: false })
      .limit(limit);

    if (readError) {
      return new Response(JSON.stringify({ success: false, error: readError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    if (!rows || rows.length === 0) {
      return new Response(JSON.stringify({ success: true, checked: 0, updated: 0, failed: 0, message: 'no stale prices' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    let updated = 0, failed = 0, priceChanged = 0;

    await pool(rows, CONCURRENCY, async (row: any) => {
      const itemId = String(row.item_id);
      try {
        const resp = await fetchWithTimeout(
          `${TMAPI_BASE}/item_detail?apiToken=${encodeURIComponent(apiToken)}&item_id=${encodeURIComponent(itemId)}&language=en`,
          { headers: { Accept: 'application/json' } },
          TMAPI_TIMEOUT_MS,
        );
        const data = await resp.json();
        if (!resp.ok || (data?.code && data.code !== 200)) { failed++; return; }

        const previous = row.detail ?? {};
        const fresh = mapDetail(data?.data || {}, parseInt(itemId, 10) || 0, [], 0);

        // Everything price-bearing comes from `fresh`. The two enrichment-only fields are
        // restored from the stored copy so a refresh never silently downgrades a record
        // that a full fetch had already filled in.
        const merged = {
          ...fresh,
          desc: previous.desc || fresh.desc,
          desc_img: Array.isArray(previous.desc_img) && previous.desc_img.length ? previous.desc_img : fresh.desc_img,
          seller_info: {
            ...fresh.seller_info,
            product_count: previous?.seller_info?.product_count || fresh.seller_info.product_count,
          },
        };
        merged.i_info = merged.seller_info;

        if (Number(previous.price) !== Number(merged.price)) priceChanged++;

        const now = new Date().toISOString();
        const { error: writeError } = await supabase
          .from('products')
          .update({ detail: merged, price: Number(merged.price) || null, price_checked_at: now, detail_fetched_at: now })
          .eq('item_id', itemId);
        if (writeError) { console.error(`price refresh write failed for ${itemId}:`, writeError.message); failed++; return; }

        // product_cache is the 12h serving cache; keep it consistent where it still holds
        // this item, so the two never disagree about price.
        await supabase
          .from('product_cache')
          .update({ detail: merged, updated_at: now })
          .eq('item_id', itemId);

        updated++;
      } catch (err) {
        console.error(`price refresh failed for ${itemId}:`, err instanceof Error ? err.message : err);
        failed++;
      }
    });

    console.log(`price refresh: checked=${rows.length} updated=${updated} changed=${priceChanged} failed=${failed}`);
    return new Response(JSON.stringify({ success: true, checked: rows.length, updated, priceChanged, failed }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error) {
    return new Response(JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Refresh failed' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
