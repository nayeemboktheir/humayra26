import express from "express";
import { getOrFetch, pingRedis } from "./cache.js";
import { fetchTmapiSearch, fetchTmapiProduct, isNetworkFailure, safeErrorMessage } from "./tmapiMap.js";
import { requestLimiter, consumeUpstreamBudget } from "./rateLimit.js";

const app = express();

// This service sits behind Coolify's Traefik, which forwards to Caddy, which proxies
// /api/* here (see Caddyfile). Without this, req.ip is the proxy's address and every
// visitor on the internet shares a single rate-limit bucket. A *numeric* trust setting
// makes Express take the nth-from-last X-Forwarded-For entry, so a client cannot widen
// its own budget by pre-seeding the header.
app.set("trust proxy", Number(process.env.TRUST_PROXY_HOPS || 2));

// The only bodies we accept are {query, page, pageSize} and {numIid}. 1mb was far more
// headroom than that needs.
app.use(express.json({ limit: "16kb" }));

const PORT = Number(process.env.PORT || 8787);
const TMAPI_TOKEN = process.env.TMAPI_TOKEN;

const TMAPI_TIMEOUT_MS = Number(process.env.TMAPI_TIMEOUT_MS || 15000);
const DETAIL_PAGE_TIMEOUT_MS = Number(process.env.DETAIL_PAGE_TIMEOUT_MS || 4000);

// Search results churn less than product-level stock/price, so it tolerates a longer
// fresh window. The 12h TTL live today measured a 1.0% cache hit rate; 7 days matches
// the improvement recommended in the site performance report.
const SEARCH_FRESH_MS = Number(process.env.SEARCH_FRESH_MS || 7 * 24 * 60 * 60 * 1000); // 7d
const SEARCH_TTL_SEC = Number(process.env.SEARCH_TTL_SEC || 14 * 24 * 60 * 60); // 14d
const PRODUCT_FRESH_MS = Number(process.env.PRODUCT_FRESH_MS || 12 * 60 * 60 * 1000); // 12h
const PRODUCT_TTL_SEC = Number(process.env.PRODUCT_TTL_SEC || 3 * 24 * 60 * 60); // 3d

// Per-IP ceilings. `REQUEST_*` bounds traffic generally; `UPSTREAM_*` bounds only the
// requests that actually reach TMAPI and cost money — see rateLimit.js.
const REQUEST_LIMIT = Number(process.env.RATE_LIMIT_REQUESTS || 120);
const REQUEST_WINDOW_MS = Number(process.env.RATE_LIMIT_WINDOW_MS || 60 * 1000);
const UPSTREAM_LIMIT = Number(process.env.RATE_LIMIT_UPSTREAM || 20);
const UPSTREAM_WINDOW_MS = Number(process.env.RATE_LIMIT_UPSTREAM_WINDOW_MS || 5 * 60 * 1000);

// A 1688 search term long enough to exceed this is not a real shopper. Capping it stops
// an attacker minting unbounded distinct cache keys to evict genuine entries.
const MAX_QUERY_LENGTH = Number(process.env.MAX_QUERY_LENGTH || 120);

function budgetedFetcher(req, fetcher) {
  return () => {
    if (!consumeUpstreamBudget(req, { limit: UPSTREAM_LIMIT, windowMs: UPSTREAM_WINDOW_MS })) {
      const err = new Error("Upstream request budget exceeded");
      err.httpStatus = 429;
      throw err;
    }
    return fetcher();
  };
}

if (!TMAPI_TOKEN) {
  console.error("FATAL: TMAPI_TOKEN is not set. Refusing to start.");
  process.exit(1);
}

app.get("/api/healthz", async (_req, res) => {
  const redisOk = await pingRedis();
  res.status(redisOk ? 200 : 503).json({ ok: redisOk, redis: redisOk ? "up" : "down" });
});

const limiter = requestLimiter({ limit: REQUEST_LIMIT, windowMs: REQUEST_WINDOW_MS });

app.post("/api/search", limiter, async (req, res) => {
  const { query, page = 1, pageSize = 20 } = req.body ?? {};
  if (!query || typeof query !== "string") {
    return res.status(400).json({ success: false, error: "Search query is required" });
  }
  if (query.trim().length === 0 || query.length > MAX_QUERY_LENGTH) {
    return res.status(400).json({ success: false, error: "Invalid search query" });
  }
  // Bound both: TMAPI caps page_size at 20, and an unbounded page number is another
  // way to mint unlimited distinct cache keys.
  const pageNum = Math.min(100, Math.max(1, Number(page) || 1));
  const pageSizeNum = Math.min(20, Math.max(1, Number(pageSize) || 20));

  const key = `search:${query.trim().toLowerCase()}:${pageNum}:${pageSizeNum}`;

  try {
    const { value, cacheStatus } = await getOrFetch(key, {
      freshMs: SEARCH_FRESH_MS,
      ttlSec: SEARCH_TTL_SEC,
      fetcher: budgetedFetcher(req, () =>
        fetchTmapiSearch({
          apiToken: TMAPI_TOKEN,
          query: query.trim(),
          page: pageNum,
          pageSize: pageSizeNum,
          timeoutMs: TMAPI_TIMEOUT_MS,
        })),
    });
    res.json({ success: true, data: value, cacheStatus });
  } catch (error) {
    const retryable = isNetworkFailure(error);
    res.status(error.httpStatus && !retryable ? error.httpStatus : retryable ? 200 : 500).json({
      success: false,
      error: safeErrorMessage(error),
      retryable,
    });
  }
});

app.post("/api/product", limiter, async (req, res) => {
  const { numIid } = req.body ?? {};
  if (!numIid) {
    return res.status(400).json({ success: false, error: "Product ID (numIid) is required" });
  }

  const cleanId = String(numIid).replace(/^abb-/, "");
  // 1688 offer ids are numeric. Anything else is either junk or an attempt to mint
  // cache keys / smuggle values into the upstream query string.
  if (!/^\d{1,20}$/.test(cleanId)) {
    return res.status(400).json({ success: false, error: "Invalid product ID" });
  }
  const key = `product:${cleanId}`;

  try {
    const { value, cacheStatus } = await getOrFetch(key, {
      freshMs: PRODUCT_FRESH_MS,
      ttlSec: PRODUCT_TTL_SEC,
      fetcher: budgetedFetcher(req, () =>
        fetchTmapiProduct({
          apiToken: TMAPI_TOKEN,
          numIid: cleanId,
          tmapiTimeoutMs: TMAPI_TIMEOUT_MS,
          detailPageTimeoutMs: DETAIL_PAGE_TIMEOUT_MS,
        })),
    });
    res.json({ success: true, data: value, cacheStatus });
  } catch (error) {
    const retryable = isNetworkFailure(error);
    res.status(retryable ? 200 : error.httpStatus || 500).json({
      success: false,
      error: safeErrorMessage(error),
      retryable,
    });
  }
});

app.use((err, _req, res, _next) => {
  // Body-parser rejections (malformed JSON, payload over the 16kb cap) carry their own
  // 4xx status. Reporting those as 500 both misleads the caller and hides the fact that
  // a limit did its job, so pass client errors through and only mask genuine 5xx.
  const status = Number(err?.status || err?.statusCode) || 500;
  if (status >= 400 && status < 500) {
    return res.status(status).json({ success: false, error: err.message || "Bad request" });
  }
  console.error("[server] unhandled error:", err);
  res.status(500).json({ success: false, error: "Internal error" });
});

app.listen(PORT, () => {
  console.log(`cache-api listening on :${PORT}`);
});
