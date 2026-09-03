import express from "express";
import { getOrFetch, pingRedis } from "./cache.js";
import { fetchTmapiSearch, fetchTmapiProduct, isNetworkFailure, safeErrorMessage } from "./tmapiMap.js";

const app = express();
app.use(express.json({ limit: "1mb" }));

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

if (!TMAPI_TOKEN) {
  console.error("FATAL: TMAPI_TOKEN is not set. Refusing to start.");
  process.exit(1);
}

app.get("/api/healthz", async (_req, res) => {
  const redisOk = await pingRedis();
  res.status(redisOk ? 200 : 503).json({ ok: redisOk, redis: redisOk ? "up" : "down" });
});

app.post("/api/search", async (req, res) => {
  const { query, page = 1, pageSize = 20 } = req.body ?? {};
  if (!query || typeof query !== "string") {
    return res.status(400).json({ success: false, error: "Search query is required" });
  }
  const pageNum = Math.max(1, Number(page) || 1);
  const pageSizeNum = Math.max(1, Number(pageSize) || 20);

  const key = `search:${query.trim().toLowerCase()}:${pageNum}:${pageSizeNum}`;

  try {
    const { value, cacheStatus } = await getOrFetch(key, {
      freshMs: SEARCH_FRESH_MS,
      ttlSec: SEARCH_TTL_SEC,
      fetcher: () =>
        fetchTmapiSearch({
          apiToken: TMAPI_TOKEN,
          query: query.trim(),
          page: pageNum,
          pageSize: pageSizeNum,
          timeoutMs: TMAPI_TIMEOUT_MS,
        }),
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

app.post("/api/product", async (req, res) => {
  const { numIid } = req.body ?? {};
  if (!numIid) {
    return res.status(400).json({ success: false, error: "Product ID (numIid) is required" });
  }

  const cleanId = String(numIid).replace(/^abb-/, "");
  const key = `product:${cleanId}`;

  try {
    const { value, cacheStatus } = await getOrFetch(key, {
      freshMs: PRODUCT_FRESH_MS,
      ttlSec: PRODUCT_TTL_SEC,
      fetcher: () =>
        fetchTmapiProduct({
          apiToken: TMAPI_TOKEN,
          numIid: cleanId,
          tmapiTimeoutMs: TMAPI_TIMEOUT_MS,
          detailPageTimeoutMs: DETAIL_PAGE_TIMEOUT_MS,
        }),
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
  console.error("[server] unhandled error:", err);
  res.status(500).json({ success: false, error: "Internal error" });
});

app.listen(PORT, () => {
  console.log(`cache-api listening on :${PORT}`);
});
