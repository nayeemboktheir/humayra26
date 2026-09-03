import Redis from "ioredis";

const redis = new Redis(process.env.REDIS_URL || "redis://redis:6379", {
  // enableOfflineQueue stays at its default (true): on container start there is a brief
  // window before the TCP connection to Redis is established, and the very first
  // request landing in that window must not fail outright — it should simply wait the
  // few milliseconds for the connection and then proceed normally.
  //
  // maxRetriesPerRequest bounds each individual command's retries, and retryStrategy
  // caps the number of reconnection attempts — together these ensure that if Redis is
  // genuinely down (not just still starting), commands fail within a few seconds rather
  // than queuing forever. getOrFetch() catches that failure and falls back to calling
  // upstream directly, so a dead cache degrades to "as slow as before", never to a hang.
  maxRetriesPerRequest: 2,
  retryStrategy: (times) => (times > 5 ? null : Math.min(times * 200, 2000)),
  lazyConnect: false,
});

redis.on("error", (err) => {
  console.error("[redis] connection error:", err.message);
});

// In-flight de-dup: when N concurrent requests miss the same cache key at once (a
// popular search term or a just-shared product link going out), only the first pays the
// TMAPI round trip; the rest await its result. This is the "duplicate simultaneous
// AliExpress/1688 calls" protection the original site report flagged as Redis's real
// value-add, beyond raw read latency.
const inFlight = new Map();

/**
 * Cache-aside with stale-while-revalidate.
 *
 * - Hit, fresh (age < freshMs): return immediately, no upstream call.
 * - Hit, stale (age >= freshMs but the Redis key hasn't expired): return the stale value
 *   immediately, and kick off a background refresh so the *next* caller gets a fresh hit.
 * - Miss (key absent or Redis unreachable): call `fetcher`, store the result, return it.
 *
 * `ttlSec` bounds how long a stale entry is still eligible to be served at all — it must
 * be longer than `freshMs`, and caps how far behind "reality" a response can ever be.
 */
export async function getOrFetch(key, { freshMs, ttlSec, fetcher }) {
  let cached = null;
  try {
    const raw = await redis.get(key);
    if (raw) cached = JSON.parse(raw);
  } catch (err) {
    console.error(`[redis] read failed for ${key}:`, err.message);
  }

  const now = Date.now();
  const isFresh = cached && now - cached.cachedAt < freshMs;

  if (isFresh) {
    return { value: cached.value, cacheStatus: "hit" };
  }

  if (cached) {
    // Stale-while-revalidate: hand back what we have, refresh in the background.
    void refreshInBackground(key, ttlSec, fetcher);
    return { value: cached.value, cacheStatus: "stale" };
  }

  // True miss. Coalesce concurrent misses on the same key into one upstream call.
  if (inFlight.has(key)) {
    const value = await inFlight.get(key);
    return { value, cacheStatus: "miss-coalesced" };
  }

  const promise = (async () => {
    try {
      const value = await fetcher();
      await writeCache(key, value, ttlSec);
      return value;
    } finally {
      inFlight.delete(key);
    }
  })();
  inFlight.set(key, promise);

  const value = await promise;
  return { value, cacheStatus: "miss" };
}

async function refreshInBackground(key, ttlSec, fetcher) {
  if (inFlight.has(key)) return; // a refresh (or a genuine miss) is already underway
  const promise = (async () => {
    try {
      const value = await fetcher();
      await writeCache(key, value, ttlSec);
    } catch (err) {
      // Keep serving the stale value; just log and try again on the next request.
      console.error(`[cache] background refresh failed for ${key}:`, err.message);
    } finally {
      inFlight.delete(key);
    }
  })();
  inFlight.set(key, promise);
}

async function writeCache(key, value, ttlSec) {
  try {
    await redis.set(key, JSON.stringify({ value, cachedAt: Date.now() }), "EX", ttlSec);
  } catch (err) {
    console.error(`[redis] write failed for ${key}:`, err.message);
  }
}

export async function pingRedis() {
  try {
    const res = await redis.ping();
    return res === "PONG";
  } catch {
    return false;
  }
}

export { redis };
