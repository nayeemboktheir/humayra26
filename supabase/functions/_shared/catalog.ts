// Writers for the durable `products` catalog.
//
// Both helpers are best-effort and never throw: the catalog is a side effect of serving a
// request, and failing to record a product must never affect the response that produced it.
// They also run after the response has been sent, so they are deliberately single round
// trips — this runtime terminates isolates shortly after a response, and anything longer
// than one write tends not to survive.

type AnyClient = {
  from: (table: string) => any;
};

/**
 * Records the listing tier for a page of search results.
 *
 * `detail`, `view_count` and `first_seen_at` are deliberately absent from the payload:
 * PostgREST builds `ON CONFLICT DO UPDATE SET` from the keys it is given, so omitting them
 * leaves an already-enriched row's detail and its accumulated view count untouched.
 */
export async function upsertCatalogListings(supabase: AnyClient, items: any[]): Promise<void> {
  try {
    if (!Array.isArray(items) || items.length === 0) return;

    const now = new Date().toISOString();
    // A single statement cannot hit the same conflict target twice ("ON CONFLICT DO UPDATE
    // command cannot affect row a second time"), and a result page can repeat an item_id.
    const byId = new Map<string, Record<string, unknown>>();
    for (const item of items) {
      const itemId = String(item?.num_iid ?? '').replace(/^abb-/, '');
      if (!itemId || itemId === '0') continue;
      byId.set(itemId, {
        item_id: itemId,
        title: item?.title ?? null,
        pic_url: item?.pic_url ?? null,
        price: Number(item?.price) || null,
        sales: Number.isFinite(Number(item?.sales)) ? Number(item.sales) : null,
        location: item?.location ?? null,
        vendor_name: item?.vendor_name ?? null,
        listed_at: now,
      });
    }
    if (byId.size === 0) return;

    const { error } = await supabase
      .from('products')
      .upsert([...byId.values()], { onConflict: 'item_id' });
    if (error) console.error('products listing upsert failed:', error.message);
  } catch (err) {
    console.error('products listing upsert threw:', err instanceof Error ? err.message : err);
  }
}

/**
 * Records the detail tier for a product someone opened.
 *
 * `price_checked_at` is set alongside `detail_fetched_at` because this payload came from a
 * live item_detail call — the price in it is current as of now. Tracking the two separately
 * is what later allows a stale price to be refreshed on its own, without re-fetching the
 * description, specs and variant structure that do not meaningfully change.
 */
export async function upsertCatalogDetail(
  supabase: AnyClient,
  itemId: string,
  detail: any,
): Promise<void> {
  try {
    const cleanId = String(itemId ?? '').replace(/^abb-/, '');
    if (!cleanId || !detail) return;

    const now = new Date().toISOString();
    const { error } = await supabase
      .from('products')
      .upsert({
        item_id: cleanId,
        title: detail?.title ?? null,
        pic_url: detail?.pic_url ?? null,
        price: Number(detail?.price) || null,
        sales: Number.isFinite(Number(detail?.total_sold)) ? Number(detail.total_sold) : null,
        location: detail?.location ?? null,
        vendor_name: detail?.seller_info?.shop_name ?? detail?.seller_info?.nick ?? null,
        detail,
        detail_fetched_at: now,
        price_checked_at: now,
        listed_at: now,
      }, { onConflict: 'item_id' });
    if (error) console.error('products detail upsert failed:', error.message);
  } catch (err) {
    console.error('products detail upsert threw:', err instanceof Error ? err.message : err);
  }
}
