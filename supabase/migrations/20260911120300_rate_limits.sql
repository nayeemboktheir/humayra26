-- Audit §3.1 / §3.2 — server-side rate limiting primitive.
--
-- send-sms-otp and verify-sms-otp both run with verify_jwt = false and CORS '*', and
-- neither had any throttle:
--
--   * verify-sms-otp matched (phone, otp_code) with no attempt counter and no lockout,
--     and a failed guess did not invalidate the code. A 6-digit OTP with a 10-minute
--     window is trivially brute-forceable, and a correct guess mints a magic link for
--     that account — account takeover from nothing but a phone number.
--   * send-sms-otp fired a real, billed SMS per call, making it both an SMS-bombing
--     tool aimed at any Bangladeshi number and a direct charge on the BulkSMS account.
--
-- The counter lives in Postgres rather than in the edge function because edge isolates
-- are recycled between requests — in-process state would reset constantly and provide
-- no protection at all.

CREATE TABLE IF NOT EXISTS public.rate_limits (
  key text PRIMARY KEY,
  window_start timestamptz NOT NULL DEFAULT now(),
  count integer NOT NULL DEFAULT 0
);

ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;

-- Only the service role (i.e. edge functions) touches this. No client-facing policy:
-- with RLS enabled and no permissive policy, PostgREST callers get nothing.
DROP POLICY IF EXISTS "Service role can manage rate_limits" ON public.rate_limits;
CREATE POLICY "Service role can manage rate_limits"
  ON public.rate_limits FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Supports the periodic cleanup below.
CREATE INDEX IF NOT EXISTS idx_rate_limits_window_start
  ON public.rate_limits (window_start);

-- Atomically consume one unit of the bucket named `_key`.
--
-- Returns true when the caller is within `_limit` for the current `_window_seconds`
-- window, false once the budget is spent. The counter is incremented inside a single
-- INSERT ... ON CONFLICT DO UPDATE, so concurrent requests cannot race past the limit
-- the way a read-then-write check would.
CREATE OR REPLACE FUNCTION public.consume_rate_limit(
  _key text,
  _limit integer,
  _window_seconds integer
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  INSERT INTO public.rate_limits AS rl (key, window_start, count)
  VALUES (_key, now(), 1)
  ON CONFLICT (key) DO UPDATE
    SET count = CASE
          WHEN rl.window_start < now() - make_interval(secs => _window_seconds) THEN 1
          ELSE rl.count + 1
        END,
        window_start = CASE
          WHEN rl.window_start < now() - make_interval(secs => _window_seconds) THEN now()
          ELSE rl.window_start
        END
  RETURNING rl.count INTO v_count;

  RETURN v_count <= _limit;
END;
$$;

-- Edge functions call this with the service role, which bypasses grants. Nobody else
-- should be able to burn another caller's budget (or probe it) over PostgREST.
REVOKE ALL ON FUNCTION public.consume_rate_limit(text, integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.consume_rate_limit(text, integer, integer) FROM anon;
REVOKE ALL ON FUNCTION public.consume_rate_limit(text, integer, integer) FROM authenticated;

-- Housekeeping: buckets are only meaningful inside their window, so anything untouched
-- for a day is dead weight. Safe to call from a cron job or ad hoc.
CREATE OR REPLACE FUNCTION public.prune_rate_limits()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM public.rate_limits WHERE window_start < now() - interval '1 day';
$$;

REVOKE ALL ON FUNCTION public.prune_rate_limits() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.prune_rate_limits() FROM anon;
REVOKE ALL ON FUNCTION public.prune_rate_limits() FROM authenticated;
