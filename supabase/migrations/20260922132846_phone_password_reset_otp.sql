-- OTPs are scoped to their security-sensitive action. A login or signup code
-- must never be accepted to reset a password.
ALTER TABLE public.phone_otps
  ADD COLUMN IF NOT EXISTS purpose text NOT NULL DEFAULT 'login';

ALTER TABLE public.phone_otps
  DROP CONSTRAINT IF EXISTS phone_otps_purpose_check;

ALTER TABLE public.phone_otps
  ADD CONSTRAINT phone_otps_purpose_check
  CHECK (purpose IN ('login', 'signup', 'password_reset'));

CREATE INDEX IF NOT EXISTS phone_otps_active_phone_purpose_idx
  ON public.phone_otps (phone, purpose, expires_at DESC)
  WHERE verified = false;
