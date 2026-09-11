// Shared helper for the Postgres-backed rate limiter (see the rate_limits migration).
//
// Edge isolates are recycled between requests, so an in-process counter provides no
// protection — the budget has to live in the database.

// deno-lint-ignore no-explicit-any
type ServiceClient = any;

/**
 * Best-effort client IP. Supabase sits behind a proxy, so the left-most
 * x-forwarded-for entry is the original caller.
 */
export function clientIp(req: Request): string {
  const fwd = req.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0].trim();
  return req.headers.get('cf-connecting-ip') || 'unknown';
}

/**
 * Consume one unit of `key`. Returns true when the caller is still within budget.
 *
 * Fails OPEN on an unexpected database error: these limiters guard login and SMS, and
 * a transient DB hiccup must not lock every customer out of signing in. The error is
 * logged so the condition is visible.
 */
export async function consumeRateLimit(
  supabase: ServiceClient,
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<boolean> {
  try {
    const { data, error } = await supabase.rpc('consume_rate_limit', {
      _key: key,
      _limit: limit,
      _window_seconds: windowSeconds,
    });
    if (error) {
      console.error('consume_rate_limit failed, allowing request:', error.message);
      return true;
    }
    return data !== false;
  } catch (err) {
    console.error('consume_rate_limit threw, allowing request:', err);
    return true;
  }
}

export function tooManyRequests(corsHeaders: Record<string, string>, message: string): Response {
  return new Response(JSON.stringify({ error: message }), {
    status: 429,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
