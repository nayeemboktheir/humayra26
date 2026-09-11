// Per-IP fixed-window rate limiting.
//
// /api/* is reachable at https://<staging-host>/api/* by anyone — Caddy proxies it
// straight through (Caddyfile) and the browser calls it with no credential, so there
// is no secret we could require that wouldn't also ship in the JS bundle. Rate
// limiting is therefore the control that actually bites.
//
// Two separate budgets, because the two costs are different:
//
//   * `requests` — a general ceiling so nobody can hammer the box.
//   * `upstream` — a much tighter budget consumed only when a request actually costs
//     a billed TMAPI call (a cache miss). Cache hits are nearly free and stay generous;
//     what we must bound is the meter. This also blunts the cache-eviction attack:
//     Redis runs allkeys-lru at 256mb, so an attacker generating unique junk queries
//     would otherwise evict real cached results while running up the bill.
//
// In-process state is deliberate: this service runs as a single container (no
// `replicas` in docker-compose.yml). Keeping the limiter out of Redis means a Redis
// outage cannot disable the protection, matching cache.js's "a dead cache degrades to
// slow, never to broken" stance.

const WINDOWS = new Map();

function hit(bucket, key, limit, windowMs) {
  const now = Date.now();
  let store = WINDOWS.get(bucket);
  if (!store) {
    store = new Map();
    WINDOWS.set(bucket, store);
  }

  const entry = store.get(key);
  if (!entry || now >= entry.resetAt) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfterSec: 0 };
  }

  entry.count += 1;
  if (entry.count > limit) {
    return { allowed: false, retryAfterSec: Math.max(1, Math.ceil((entry.resetAt - now) / 1000)) };
  }
  return { allowed: true, retryAfterSec: 0 };
}

// Bounded sweep of expired keys. Without this the maps grow with every distinct client
// IP — the same unbounded-Map leak that server.cjs's ogCache has.
function sweep() {
  const now = Date.now();
  for (const store of WINDOWS.values()) {
    for (const [key, entry] of store) {
      if (now >= entry.resetAt) store.delete(key);
    }
  }
}

const sweepTimer = setInterval(sweep, 60_000);
// Don't hold the event loop open on shutdown.
if (typeof sweepTimer.unref === "function") sweepTimer.unref();

/**
 * Express middleware enforcing the general per-IP request ceiling.
 */
export function requestLimiter({ limit, windowMs }) {
  return (req, res, next) => {
    const { allowed, retryAfterSec } = hit("requests", req.ip || "unknown", limit, windowMs);
    if (allowed) return next();
    res.set("Retry-After", String(retryAfterSec));
    return res.status(429).json({ success: false, error: "Too many requests", retryable: true });
  };
}

/**
 * Consume one unit of the caller's upstream (billed TMAPI call) budget.
 * Returns false when the budget is exhausted.
 */
export function consumeUpstreamBudget(req, { limit, windowMs }) {
  return hit("upstream", req.ip || "unknown", limit, windowMs).allowed;
}
