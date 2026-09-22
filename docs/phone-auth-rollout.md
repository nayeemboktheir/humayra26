# Phone-auth rollout

Production is self-hosted in Coolify. Do not use `supabase db push`: the repository's
historic migration ledger is not identical to production. Apply the new migration in
Studio/`psql`, and deploy Edge Function files with the existing self-host deployer.

1. Run `npm run auth:repair:summary`. Resolve every duplicate normalized phone before
   continuing; the migration intentionally aborts while duplicates exist.
2. Apply `supabase/migrations/20260922111528_repair_phone_auth_registration.sql` with
   `ON_ERROR_STOP` enabled.
3. Run `supabase/selfhost/verify-phone-auth.sql`. Missing-profile, missing-phone, and
   duplicate result sets must be empty/zero; confirm the trigger, unique index, and RLS.
4. Deploy `_shared`, `register-with-phone`, `send-sms-otp`, `verify-sms-otp`, and
   `phone-password-login` using `supabase/selfhost/deploy-live.sh` on the Coolify host.
5. Deploy the frontend and smoke-test email/password, phone/password, phone OTP, and a
   fresh phone-verified signup. Verify staff routes to `/admin` and customers to
   `/dashboard`.
   Add `https://YOUR-STOREFRONT-DOMAIN/reset-password` to Coolify's
   `ADDITIONAL_REDIRECT_URLS` before testing password reset.
6. Set the Coolify service variable `DISABLE_SIGNUP=true` (the template maps it to
   `GOTRUE_DISABLE_SIGNUP` in the Auth container) and redeploy that service. Confirm a
   direct public `auth.signUp` request is rejected, while
   `register-with-phone` still succeeds through the Admin API.
7. Review `npm run auth:repair:dry-run`; only then run `npm run auth:repair:apply`.
   The script never changes confirmed users and sends ambiguous records to manual review.
8. Monitor GoTrue and Edge Runtime authentication logs for credential, OTP, rate-limit,
   and profile-link failures.
