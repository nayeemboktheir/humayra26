// Meta / TikTok / GA event tracking helpers.
// Safely call installed pixels; no-op if a pixel isn't loaded.

declare global {
  interface Window {
    fbq?: (...args: any[]) => void;
    ttq?: any;
    gtag?: (...args: any[]) => void;
  }
}

type Params = Record<string, any>;

function safe(fn: () => void) {
  try { fn(); } catch { /* ignore */ }
}

export function trackPageView() {
  safe(() => window.fbq && window.fbq("track", "PageView"));
  safe(() => window.ttq && window.ttq.page && window.ttq.page());
  // gtag PageView is auto via config; no explicit call needed
}

export function trackViewContent(p: { id: string; name?: string; value?: number; currency?: string }) {
  const currency = p.currency || "BDT";
  safe(() => window.fbq && window.fbq("track", "ViewContent", {
    content_ids: [p.id],
    content_name: p.name,
    content_type: "product",
    value: p.value,
    currency,
  }));
  safe(() => window.ttq && window.ttq.track && window.ttq.track("ViewContent", {
    contents: [{ content_id: p.id, content_name: p.name, price: p.value, quantity: 1 }],
    value: p.value,
    currency,
  }));
  safe(() => window.gtag && window.gtag("event", "view_item", {
    currency,
    value: p.value,
    items: [{ item_id: p.id, item_name: p.name, price: p.value }],
  }));
}

export function trackAddToCart(p: { id: string; name?: string; value?: number; quantity?: number; currency?: string }) {
  const currency = p.currency || "BDT";
  const qty = p.quantity || 1;
  safe(() => window.fbq && window.fbq("track", "AddToCart", {
    content_ids: [p.id],
    content_name: p.name,
    content_type: "product",
    value: p.value,
    currency,
  }));
  safe(() => window.ttq && window.ttq.track && window.ttq.track("AddToCart", {
    contents: [{ content_id: p.id, content_name: p.name, price: p.value, quantity: qty }],
    value: p.value,
    currency,
  }));
  safe(() => window.gtag && window.gtag("event", "add_to_cart", {
    currency,
    value: p.value,
    items: [{ item_id: p.id, item_name: p.name, price: p.value, quantity: qty }],
  }));
}

export function trackInitiateCheckout(p: { value: number; quantity?: number; currency?: string; ids?: string[] }) {
  const currency = p.currency || "BDT";
  safe(() => window.fbq && window.fbq("track", "InitiateCheckout", {
    value: p.value,
    currency,
    num_items: p.quantity,
    content_ids: p.ids,
    content_type: "product",
  }));
  safe(() => window.ttq && window.ttq.track && window.ttq.track("InitiateCheckout", {
    value: p.value,
    currency,
    contents: (p.ids || []).map(id => ({ content_id: id, quantity: 1 })),
  }));
  safe(() => window.gtag && window.gtag("event", "begin_checkout", {
    currency,
    value: p.value,
  }));
}

export function trackPurchase(p: { value: number; currency?: string; orderId?: string; ids?: string[] }) {
  const currency = p.currency || "BDT";
  safe(() => window.fbq && window.fbq("track", "Purchase", {
    value: p.value,
    currency,
    content_ids: p.ids,
    content_type: "product",
    order_id: p.orderId,
  }));
  safe(() => window.ttq && window.ttq.track && window.ttq.track("PlaceAnOrder", {
    value: p.value,
    currency,
    contents: (p.ids || []).map(id => ({ content_id: id, quantity: 1 })),
  }));
  safe(() => window.gtag && window.gtag("event", "purchase", {
    transaction_id: p.orderId,
    currency,
    value: p.value,
  }));
}
